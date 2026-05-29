/**
 * Reproduction test for the "scrcpy mirror freezes on splash after Gravar" bug.
 *
 * Symptom: when the user clicks Gravar, fills the New Recording modal, and
 * confirms, the daemon launches the target app via ADB. The H.264 surface in
 * scrcpy doesn't recover cleanly from the launch event, so the browser canvas
 * stays painting the same frame indefinitely. Inputs still get routed
 * (control channel works) but the video channel is dead.
 *
 * How this test proves it:
 *   1. Open editor, wait for scrcpy stream to be live (canvas has non-blank pixels).
 *   2. Snapshot the canvas pixels → frameBefore.
 *   3. Trigger the recording flow with the same modal the user fills manually.
 *   4. Wait POST_LAUNCH_WAIT_MS (~6s) — long enough for monkey/launch + animation.
 *   5. Snapshot the canvas pixels → frameAfter.
 *   6. Compute a perceptual diff: if average channel delta < 2 across all
 *      sampled pixels, the mirror is frozen and we fail loudly with the
 *      saved frames for inspection.
 *
 * Run prerequisites — fully documented in playwright.config.ts:
 *   • daemon at :8001
 *   • next dev at :3000
 *   • adb-connected Android device
 *   • target app installed (default: br.com.foxbit.foxbitandroid)
 *
 * Env knobs:
 *   E2E_APP_ID        package name to use in the modal (default br.com.foxbit.foxbitandroid)
 *   E2E_PROJECT_ID    project uuid to enter the editor under
 *   E2E_DEVICE_UDID   if multiple devices are connected, pick this one
 *   E2E_POST_LAUNCH_MS  override post-launch wait
 */
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_ID = process.env.E2E_APP_ID || 'br.com.foxbit.foxbitandroid';
const POST_LAUNCH_WAIT_MS = parseInt(process.env.E2E_POST_LAUNCH_MS || '6000', 10);
const PROJECT_ID = process.env.E2E_PROJECT_ID || '';
const ARTIFACT_DIR = path.join(__dirname, '../__artifacts__/mirror-freeze');

interface CanvasSnapshot {
    width: number;
    height: number;
    // 64 evenly-spaced pixels (RGBA averaged); enough to detect movement
    // without dragging back megabytes of imageData.
    sample: number[];
    dataUrl: string;  // for visual diffing on failure
}

/**
 * Pull a downsampled fingerprint of the scrcpy canvas. We grab the actual
 * pixel data from canvas.getImageData() inside the page so we get the real
 * decoded H.264 frame, not just a CSS background or a placeholder.
 */
async function captureCanvas(page: Page): Promise<CanvasSnapshot | null> {
    return page.evaluate(() => {
        // The DevicePreview component renders a single <canvas> for the live
        // mirror. There is exactly one inside the recording editor; if more
        // appear later, scope this to the canvas inside the device frame.
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // 8x8 sample grid → 64 pixels, each averaged across RGB.
        const sample: number[] = [];
        const stepX = Math.max(1, Math.floor(canvas.width / 8));
        const stepY = Math.max(1, Math.floor(canvas.height / 8));
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const px = ctx.getImageData(x * stepX, y * stepY, 1, 1).data;
                sample.push(Math.round((px[0] + px[1] + px[2]) / 3));
            }
        }
        return {
            width: canvas.width,
            height: canvas.height,
            sample,
            dataUrl: canvas.toDataURL('image/jpeg', 0.5),
        };
    });
}

function averageDelta(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    let total = 0;
    for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
    return total / a.length;
}

function saveArtifact(name: string, dataUrl: string): string {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const b64 = dataUrl.split(',')[1] || '';
    const file = path.join(ARTIFACT_DIR, name);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    return file;
}

async function isBlank(snapshot: CanvasSnapshot): Promise<boolean> {
    // All-zero (canvas not yet receiving frames) or all-uniform = blank.
    const first = snapshot.sample[0];
    return snapshot.sample.every(v => v === 0 || v === first);
}

test.describe('Recording flow — scrcpy mirror must not freeze', () => {
    test('canvas keeps updating after Gravar confirms (no freeze on splash)', async ({ page }) => {
        test.setTimeout(120_000);

        const target = PROJECT_ID
            ? `/dashboard/tests/editor?projectId=${PROJECT_ID}`
            : '/dashboard/tests/editor';
        console.log(`[E2E] Navigating to ${target} (set E2E_PROJECT_ID for a real project context)`);
        await page.goto(target);

        // ── 1. Wait for scrcpy stream to render ─────────────────────────────
        // Poll the canvas until it has non-blank pixels OR we give up at 30s.
        let before: CanvasSnapshot | null = null;
        const streamDeadline = Date.now() + 30_000;
        while (Date.now() < streamDeadline) {
            const snap = await captureCanvas(page);
            if (snap && !(await isBlank(snap))) {
                before = snap;
                break;
            }
            await page.waitForTimeout(500);
        }
        if (!before) {
            test.skip(true, 'Scrcpy stream never connected — device + daemon required');
            return;
        }
        console.log(`[E2E] Stream alive: canvas ${before.width}×${before.height}, first sample [${before.sample.slice(0, 4).join(',')}…]`);
        saveArtifact('00-before-gravar.jpg', before.dataUrl);

        // ── 2. Trigger the Gravar flow ──────────────────────────────────────
        await page.getByRole('button', { name: /gravar/i }).first().click();

        // Modal opens — fill App ID. We use placeholder/name selectors so the
        // test doesn't break if the heading copy changes.
        const appIdInput = page.locator('input[placeholder*="com.example"], input[placeholder*="com.miui"], input[placeholder*="example.app"]').first();
        await appIdInput.waitFor({ state: 'visible', timeout: 5_000 });
        await appIdInput.fill(APP_ID);

        // clearState checkbox: default-checked in our modal, leave as-is so we
        // hit the worst-case path that the daemon's launch sequence triggers.

        await page.getByRole('button', { name: /create|criar/i }).click();
        console.log(`[E2E] Modal confirmed for app ${APP_ID}`);

        // ── 3. Wait for the launch + first interaction window ───────────────
        // The user-visible bug is "stuck on splash" — we wait POST_LAUNCH_WAIT_MS
        // which is several seconds AFTER the daemon's monkey+settle. If frames
        // ever update during this window, the test passes. If pixels are static
        // throughout, we've reproduced the freeze.
        const samples: CanvasSnapshot[] = [];
        const tickEnd = Date.now() + POST_LAUNCH_WAIT_MS;
        let i = 0;
        while (Date.now() < tickEnd) {
            await page.waitForTimeout(1000);
            const snap = await captureCanvas(page);
            if (snap) {
                samples.push(snap);
                saveArtifact(`01-tick-${String(++i).padStart(2, '0')}.jpg`, snap.dataUrl);
            }
        }

        // ── 4. Verify the canvas actually changed ───────────────────────────
        const after = samples[samples.length - 1];
        expect(after, 'Never captured a post-Gravar canvas — DevicePreview unmounted?').toBeTruthy();

        // Diff EVERY tick against the baseline. If ANY tick had pixels
        // visibly different from `before`, the mirror is alive.
        const maxDeltaOverTime = Math.max(
            ...samples.map(s => averageDelta(before!.sample, s.sample)),
        );
        // Also diff consecutive ticks — even if the device settled to a new
        // static screen, ticks between launch and that screen would differ.
        const maxTickDelta = samples.slice(1).reduce((best, s, idx) => {
            const d = averageDelta(samples[idx].sample, s.sample);
            return d > best ? d : best;
        }, 0);

        console.log(`[E2E] Frame deltas — vs baseline: ${maxDeltaOverTime.toFixed(2)} | between ticks: ${maxTickDelta.toFixed(2)}`);

        // Threshold: at least one pixel changed by more than 2/255 across some
        // tick pair. JPEG compression noise alone won't move averaged samples
        // by more than that. If the freeze happens, both deltas will be 0.
        const FROZEN_THRESHOLD = 2;
        const isFrozen = maxDeltaOverTime < FROZEN_THRESHOLD && maxTickDelta < FROZEN_THRESHOLD;

        if (isFrozen) {
            const beforePath = saveArtifact('99-FROZEN-before.jpg', before.dataUrl);
            const afterPath = saveArtifact('99-FROZEN-after.jpg', after.dataUrl);
            console.error('=== FREEZE REPRODUCED ===');
            console.error(`Baseline frame: ${beforePath}`);
            console.error(`Final frame   : ${afterPath}`);
            console.error('All sampled deltas were < 2/255 — mirror canvas painted the same pixels for the entire post-Gravar window.');
        }

        expect(isFrozen, [
            'scrcpy canvas froze after the Gravar confirm.',
            `Vs baseline delta: ${maxDeltaOverTime.toFixed(2)} (min change expected: ${FROZEN_THRESHOLD})`,
            `Inter-tick delta : ${maxTickDelta.toFixed(2)}`,
            `Saved frames     : ${ARTIFACT_DIR}`,
            '',
            'Daemon-side: tail `[RECORDING]` lines in your daemon terminal to compare with the captured frames.',
        ].join('\n')).toBeFalsy();
    });
});
