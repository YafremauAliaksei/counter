/**
 * 04-shift.spec.js — granica zmiany na podstawionym zegarze przeglądarki.
 *
 * Na części stanowisk przeglądarka nie jest zamykana między zmianami. Kiedy
 * o 18:19 zaczyna się zmiana nocna, liczniki dziennej muszą zniknąć same —
 * inaczej nocna zaczyna od cudzego wyniku, a tempo liczy się od 06:30.
 * Zegar strony (Date, setTimeout, setInterval) podstawia Playwright; strefa
 * czasowa to Europe/Warsaw z playwright.config.js.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste, count, item } = require('./helpers');

const shift = (page) => page.evaluate(() => window.SH.store.sessionConfig.shiftType);

test('17:40 dzienna, po 18:19 nocna: liczniki dziennej znikają same', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-24T17:40:00+02:00') });
    await openStand(page);
    await paste(page);
    expect(await shift(page)).toBe('day');
    await item(page);
    await item(page);
    expect(await count(page)).toBe(2);

    // 45 minut później — bez przeładowania i bez ruchu człowieka.
    await page.clock.fastForward('45:00');
    await expect.poll(() => shift(page)).toBe('night');
    expect(await count(page), 'nocna zaczyna od zera').toBe(0);

    await item(page);
    expect(await count(page)).toBe(1);
});

test('martwa strefa 17:55–18:19: zmiana dzienna trwa, nic się nie zeruje', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-24T17:50:00+02:00') });
    await openStand(page);
    await paste(page);
    await item(page);
    await page.clock.fastForward('10:00');     // 18:00 — między zmianami
    await item(page);
    expect(await shift(page)).toBe('day');
    expect(await count(page)).toBe(2);
});
