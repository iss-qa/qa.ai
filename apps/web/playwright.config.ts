import { defineConfig, devices } from '@playwright/test';

/**
 * QAMind E2E tests.
 *
 * These tests target the LIVE dev server + LIVE daemon + a REAL Android device.
 * That's intentional: the bugs we're hunting (scrcpy freeze, recording flow,
 * Maestro replay) only manifest with the full stack running.
 *
 * Before running:
 *   1. `cd apps/daemon && python3 main.py`        # daemon at :8001
 *   2. `cd apps/web && pnpm dev`                  # next at :3000
 *   3. Connect an Android device via USB, confirm `adb devices` shows it online
 *   4. Have the app installed (e.g. br.com.foxbit.foxbitandroid)
 *   5. `cd apps/web && pnpm test:e2e`
 */
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 120_000,           // recording flow can take a while
    expect: { timeout: 10_000 },
    fullyParallel: false,        // one device, serial run
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env.QAMIND_BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15_000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // The recording flow opens a long-lived WebSocket to scrcpy
                // and an SSE to /recordings/events. Both stay alive across
                // the entire test. Default headless is fine.
                viewport: { width: 1440, height: 900 },
            },
        },
    ],
});
