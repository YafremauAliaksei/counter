/**
 * 02-counting.spec.js — cykl przedmiotu w prawdziwej przeglądarce.
 *
 * Kod sortowania w T-REX pojawia się raz przed finalnym wyzwalaczem, raz
 * razem z nim, a raz już po nim — skrypt ma przypisać kierunek w każdym
 * z trzech przypadków i w obu zapisach („Zeskanuj KOD”, „Zeskanuj - KOD”).
 * Do tego przedmiot przerwany w połowie (bez wyzwalacza końca) nie liczy
 * się, a ten sam towar pod rząd liczy się za każdym razem.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste, count, item } = require('./helpers');

const tab = (page) =>
    page.evaluate(() => {
        const s = window.SH.store;
        const id = s.currentTabInstanceId;
        return { count: s.tabCounters[id] || 0, sold: s.tabSold[id] || 0, neutral: s.tabNeutral[id] || 0 };
    });

test('kod sprzedaży przed, razem i po wyzwalaczu, w obu zapisach — zawsze sprzedaż', async ({ page }) => {
    await openStand(page);
    await paste(page);
    for (const when of ['before', 'at', 'after']) {
        for (const dash of ['plain', 'dash']) {
            await item(page, { route: { code: 'CRITS-PRG2', when, dash } });
        }
    }
    // Kod „po” wisi na ekranie bezczynności — zostaje przypisany dopiero,
    // gdy przedmiot się zakończy, więc liczymy po ostatnim przedmiocie.
    expect(await tab(page)).toEqual({ count: 6, sold: 6, neutral: 0 });
});

test('niesprzedaż, audyt i niejednoznaczny kod z uściśleniem', async ({ page }) => {
    await openStand(page);
    await paste(page);
    await item(page, { route: { code: 'Liquidation', when: 'at' } });
    await item(page, { route: { code: 'AUDIT', when: 'before' } });
    await item(page, { route: { code: 'Secondary-Sorting', when: 'before', confirm: 'sell' } });
    await item(page, { route: { code: 'Secondary-Sorting', when: 'after', confirm: 'unsell' } });
    // Audyt wypada z mianownika procentu, niejednoznaczny rozstrzyga uściślenie.
    expect(await tab(page)).toEqual({ count: 4, sold: 1, neutral: 1 });
});

test('przerwany przedmiot się nie liczy, ten sam towar pod rząd — za każdym razem', async ({ page }) => {
    await openStand(page);
    await paste(page);
    await item(page, { asin: 'B00006JCUB' });
    await item(page, { asin: 'B00006JCUB' });
    await item(page, { asin: 'B00006JCUB', abortAt: 3 });
    await item(page, { asin: 'B019ETZ2ZU', abortAt: 1 });
    await item(page, { asin: 'B019ETZ2ZU' });
    expect(await count(page)).toBe(3);
});
