/**
 * 06-panel.spec.js — zamknięcie panelu ustawień widoczne bez przewijania.
 *
 * Panel rośnie z każdą sekcją i jest wyższy od okna, więc przewija się sam.
 * Przycisk zamknięcia stoi na końcu treści, ale jest przyklejony do dołu
 * panelu (`position: sticky`): ma być w całości widoczny przy dolnej krawędzi
 * panelu na początku listy, w środku i na końcu. Tego nie sprawdzi atrapa
 * DOM — tylko prawdziwy układ strony.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste } = require('./helpers');

test('przycisk zamknięcia przy dolnej krawędzi panelu na każdej wysokości przewinięcia', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStand(page);
    await paste(page);
    await page.evaluate(() => window.SH.SettingsPanel.toggle());
    const panel = page.locator('[id$="settingsPanel"]');
    const close = page.locator('[id$="settingsPanelFooter"] button');
    await expect(close).toBeVisible();

    const scrollMax = await panel.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(scrollMax, 'panel musi być wyższy od okna — inaczej test niczego nie dowodzi').toBeGreaterThan(200);

    for (const at of [0, 0.5, 1]) {
        await panel.evaluate((el, f) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * f; }, at);
        const p = await panel.boundingBox();
        const b = await close.boundingBox();
        expect(b.y, 'przycisk w panelu, przewinięcie ' + at).toBeGreaterThanOrEqual(p.y);
        expect(b.y + b.height, 'przycisk w całości widoczny, przewinięcie ' + at).toBeLessThanOrEqual(p.y + p.height);
        expect(p.y + p.height - (b.y + b.height), 'przy dolnej krawędzi, przewinięcie ' + at).toBeLessThan(40);
    }

    await close.click();
    await expect.poll(() => page.evaluate(() => window.SH.store.uiFlags.isSettingsPanelVisible)).toBe(false);
});
