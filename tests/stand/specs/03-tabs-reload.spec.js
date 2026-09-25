/**
 * 03-tabs-reload.spec.js — kilka kart i F5, z prawdziwym localStorage.
 *
 * Człowiek pracuje w dwóch kartach naraz (CRET i WHD), a liczniki kart
 * przechodzą między nimi zdarzeniem `storage`, które atrapa DOM tylko
 * naśladuje. Każda karta liczy swoje, a każda widzi też cudze. F5 w środku
 * zmiany nie może zgubić ani jednego przedmiotu.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste, count, item, STEP_MS } = require('./helpers');

const counters = (page) => page.evaluate(() => ({ ...window.SH.store.tabCounters }));

test('dwie karty: każda liczy swoje i widzi cudze', async ({ context }) => {
    const cret = await context.newPage();
    const whd = await context.newPage();
    await openStand(cret, { query: 'gradingMode=CRETURN' });
    await openStand(whd, { query: 'gradingMode=WAREHOUSE_DEALS' });
    await paste(cret);
    await paste(whd);

    await item(cret);
    await item(whd);
    await item(cret);

    await expect.poll(() => counters(cret)).toMatchObject({ CRET: 2, WHD: 1 });
    await expect.poll(() => counters(whd)).toMatchObject({ CRET: 2, WHD: 1 });
    expect(await cret.evaluate(() => window.SH.store.currentTabInstanceId)).toBe('CRET');
    expect(await whd.evaluate(() => window.SH.store.currentTabInstanceId)).toBe('WHD');
});

test('F5 w środku zmiany: licznik wraca po ponownym wklejeniu', async ({ page }) => {
    await openStand(page, { query: 'gradingMode=CRETURN' });
    await paste(page);
    await item(page);
    await item(page);
    await page.reload();
    await page.evaluate((ms) => window.Stand.configure({ stepMs: ms }), STEP_MS);
    await paste(page);
    expect(await count(page)).toBe(2);
    await item(page);
    expect(await count(page)).toBe(3);
});
