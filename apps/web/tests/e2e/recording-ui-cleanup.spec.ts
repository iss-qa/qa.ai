/**
 * Aceitação do modo Gravação — UI limpa + passos em tempo real.
 *
 * Cobre os itens 4 e 5 da especificação de refatoração do módulo de gravação:
 *   4. Durante a gravação, a viewport NÃO pode conter:
 *        • a caixa de prompt "Descreva o teste que deseja criar"
 *        • os comboboxes de engine/LLM (Claude Sonnet etc.)
 *        • o módulo "Screenshots de referências" / upload de imagens
 *   5. A lista de passos deve atualizar dinamicamente (header "GRAVANDO — N
 *      PASSOS" aparece e o LAUNCH inicial é injetado).
 *
 * O item 3 (preview não congelado / splash avança) é coberto pelo spec
 * irmão `recording-mirror-freeze.spec.ts` — diff de pixels do canvas.
 * O item 1 (permissões `pm grant` pós-clearState) é validado no daemon
 * (logs `[PERMS]`), fora do alcance deste teste web.
 *
 * Pré-requisitos (iguais ao spec de freeze): daemon :8001, next dev :3000,
 * device Android via adb com o app alvo instalado. Sem device, o teste é
 * skipped (gate pelo canvas do stream).
 */
import { expect, test, type Page } from '@playwright/test';

const APP_ID = process.env.E2E_APP_ID || 'br.com.foxbit.foxbitandroid';
const PROJECT_ID = process.env.E2E_PROJECT_ID || '';

async function canvasIsLive(page: Page): Promise<boolean> {
    const sample = await page.evaluate(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas || canvas.width === 0) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const px = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return px[0] + px[1] + px[2];
    });
    return sample !== null && sample > 0;
}

test.describe('Recording flow — UI cleanup + live steps', () => {
    test('prompt/IA/screenshots somem durante a gravação e voltam ao parar', async ({ page }) => {
        test.setTimeout(120_000);

        const target = PROJECT_ID
            ? `/dashboard/tests/editor?projectId=${PROJECT_ID}`
            : '/dashboard/tests/editor';
        await page.goto(target);

        // Antes de gravar, a caixa de prompt e os seletores devem existir.
        const promptBox = page.getByPlaceholder('Descreva o teste que deseja criar...');
        await expect(promptBox).toBeVisible({ timeout: 15_000 });

        // Gate: precisa de stream vivo (device + daemon) para gravar.
        const streamDeadline = Date.now() + 30_000;
        let live = false;
        while (Date.now() < streamDeadline) {
            if (await canvasIsLive(page)) { live = true; break; }
            await page.waitForTimeout(500);
        }
        test.skip(!live, 'Scrcpy stream nunca conectou — requer device + daemon');

        // ── Inicia a gravação (mesmo fluxo do spec de freeze) ────────────────
        await page.getByRole('button', { name: /gravar/i }).first().click();
        const appIdInput = page
            .locator('input[placeholder*="com.example"], input[placeholder*="com.miui"], input[placeholder*="example.app"]')
            .first();
        await appIdInput.waitFor({ state: 'visible', timeout: 5_000 });
        await appIdInput.fill(APP_ID);
        await page.getByRole('button', { name: /create|criar/i }).click();

        // ── Item 5: lista de passos viva — header GRAVANDO + LAUNCH inicial ─
        await expect(page.getByText(/gravando\s*[—-]/i)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(/launch/i).first()).toBeVisible({ timeout: 20_000 });

        // ── Item 4: viewport limpa durante a gravação ───────────────────────
        await expect(promptBox).toBeHidden();
        // Combobox de LLM (opção "Claude ..." de LLM_MODELS) ausente
        await expect(page.locator('select', { hasText: /claude/i })).toHaveCount(0);
        // Módulo de screenshots de referência / upload ausente
        await expect(page.getByText(/screenshots de refer/i)).toBeHidden();

        // ── Encerrar: PARAR devolve a UI normal ─────────────────────────────
        await page.getByRole('button', { name: /parar/i }).first().click();
        await expect(promptBox).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/screenshots de refer/i)).toBeVisible();
    });
});
