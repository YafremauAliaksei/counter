/**
 * 08-flex-ug.spec.js — dział UG na stanowisku składanym z kawałków.
 *
 * Prawdziwy T-REX przysyła na każde działanie fragment strony, a następny
 * krok potrafi przyjść z wyprzedzeniem, ukryty. Ten plik sprawdza w
 * prawdziwej przeglądarce (prawdziwy układ strony, `hidden`, MutationObserver):
 *   - ukryta naklejka nie podwaja przedmiotu, widoczna — tak, razem ze
 *     sprzedażą;
 *   - ukryte pole pojemnika nic nie zalicza, błędny pojemnik też nie;
 *     przybity zeruje linię 9;
 *   - po wszystkim zero zapytań do sieci i czysty stały tekst strony.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste } = require('./helpers');

const tab = (page) => page.evaluate(() => {
    const s = window.SH.store;
    const id = s.currentTabInstanceId;
    return { type: s.currentTabType, count: s.tabCounters[id] || 0, sold: s.tabSold[id] || 0 };
});

/** Przedmiot z polem pojemnika: czeka na pole i przybija je jak człowiek ze skanerem. */
async function toteItem(page, opts, toteValues) {
    const done = page.evaluate((o) => window.Stand.item(o), opts);
    const field = page.locator('input[aria-label="Wprowadź pojemnik"]:visible');
    for (const v of toteValues) {
        await field.fill(v);
        await field.press('Enter');
    }
    await done;
}

test('UG: ukryta naklejka nie liczy, widoczna daje +2 i sprzedaż; pojemnik zeruje linię 9', async ({ page }) => {
    const rec = await openStand(page, { query: 'gradingMode=CRETURN_PRIMARY_GRADING' });
    await paste(page);
    await page.evaluate(() => window.Stand.configure({ stepMs: 150 }));
    expect((await tab(page)).type).toBe('UG');

    await page.evaluate(() => window.Stand.item({ sticker: false }));
    expect(await tab(page)).toMatchObject({ count: 1, sold: 0 });

    await page.evaluate(() => window.Stand.item({ sticker: true }));
    expect(await tab(page)).toMatchObject({ count: 3, sold: 2 });

    const line9 = () => page.evaluate(() => window.SH.StatsWindowRenderer.lines.line9_offTask.textContent);
    const confirmed = () => page.evaluate(() => window.SH.ToteWatch.confirmed);
    const before = await confirmed();
    // Błędny pojemnik zostawia pole — dopiero drugi, poprawny, je zdejmuje.
    await toteItem(page, { tote: true, sticker: false }, ['LPN0001', 'tsUG01x']);
    expect(await confirmed()).toBe(before + 1);
    await page.evaluate(() => window.SH.StatsWindowRenderer.renderContent());
    expect(await line9()).not.toBe('');
    expect(await tab(page)).toMatchObject({ count: 4, sold: 2 });

    expect(await page.evaluate(() => window.Stand.leaks())).toEqual([]);
    expect(rec.routed).toEqual([]);
});

test('WHD: ta sama naklejka nie podwaja przedmiotu', async ({ page }) => {
    await openStand(page, { query: 'gradingMode=WAREHOUSE_DEALS' });
    await paste(page);
    await page.evaluate(() => window.Stand.configure({ stepMs: 150 }));
    await page.evaluate(() => window.Stand.item({ sticker: true }));
    expect(await tab(page)).toMatchObject({ type: 'WHD', count: 1, sold: 0 });
});
