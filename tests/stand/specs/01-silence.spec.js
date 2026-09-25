/**
 * 01-silence.spec.js — domyślny start w prawdziwej przeglądarce: zero sieci,
 * zero konsoli.
 *
 * Najważniejsza obietnica produktu. Człowiek wkleja skrypt i pracuje: nie
 * otwiera panelu, nie ma zakładki z kodem ustawień, działa na wartościach
 * domyślnych. Wtedy skrypt nie może wysłać ANI JEDNEGO zapytania — także do
 * własnego hosta — ani napisać czegokolwiek do konsoli. Atrapa DOM sprawdza
 * to w testach jednostkowych (01-silence); tu to samo w Chromium, z pełnym
 * cyklem przedmiotów, klawiaturą i odczekaniem cykli zegara skryptu.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste, count, item } = require('./helpers');

/**
 * Wszystko, co może wyjść w sieć po wklejeniu skryptu: zapytania (fetch, XHR,
 * obrazki, beacon), gniazda i wpisy performance — ta ostatnia lista łapie
 * też zasoby, których Playwright nie przypisałby do strony.
 */
async function networkAfter(page, rec, mark) {
    const resources = await page.evaluate(() =>
        performance.getEntriesByType('resource').map((e) => e.name));
    return {
        requests: rec.requests.slice(mark.requests).map((r) => r.type + ' ' + r.url),
        sockets: rec.sockets.slice(mark.sockets),
        resources: resources.slice(mark.resources),
    };
}

async function silentShift(page, rec) {
    await page.waitForLoadState('networkidle');
    const mark = {
        requests: rec.requests.length,
        sockets: rec.sockets.length,
        resources: await page.evaluate(() => performance.getEntriesByType('resource').length),
    };
    const consoleBefore = rec.console.length;

    await paste(page);
    // Pełna praca bez panelu: przedmioty z kodami sortowania, przerwany
    // przedmiot, ten sam towar dwa razy i pisanie na klawiaturze poza polem
    // tekstowym (skrypt nasłuchuje haseł panelu).
    await item(page, { route: { code: 'CRITS-PRG2', when: 'before' } });
    await item(page, { asin: 'B00006JCUB', route: { code: 'Liquidation', when: 'after' } });
    await item(page, { asin: 'B00006JCUB', abortAt: 2 });
    await item(page, { route: { code: 'Secondary-Sorting', when: 'at', confirm: 'sell' } });
    await page.keyboard.type('zwykly tekst bez hasla');
    // Kilka cykli zegara okna (co sekundę) i odłożonych zapisów.
    await page.waitForTimeout(3500);

    expect(await count(page), 'trzy pełne przedmioty, przerwany się nie liczy').toBe(3);
    expect(await networkAfter(page, rec, mark)).toEqual({ requests: [], sockets: [], resources: [] });
    expect(rec.console.slice(consoleBefore), 'konsola po wklejeniu').toEqual([]);
    expect(rec.errors, 'błędy strony').toEqual([]);
}

test('domyślny start: zero zapytań i zero linii w konsoli przez całą pracę', async ({ page }) => {
    const rec = await openStand(page);
    await silentShift(page, rec);
    // Moduł cen nie został włączony, więc karty ceny na ekranie nie ma.
    expect(await page.evaluate(() => window.SH.priceModuleOn())).toBe(false);
});

test('to samo na stronie z CSP „tylko własny host”, bez ani jednej blokady', async ({ page }) => {
    const rec = await openStand(page, { query: 'csp=strict' });
    await page.evaluate(() => {
        window.__cspBlocks = [];
        document.addEventListener('securitypolicyviolation', (e) => window.__cspBlocks.push(e.blockedURI));
    });
    await silentShift(page, rec);
    // Blokada CSP znaczyłaby, że skrypt PRÓBOWAŁ wyjść — nawet jeśli nie wyszedł.
    expect(await page.evaluate(() => window.__cspBlocks)).toEqual([]);
});

test('stały tekst stanowiska nie zawiera niczego, co skrypt rozpoznaje', async ({ page }) => {
    await openStand(page);
    await paste(page);
    expect(await page.evaluate(() => window.Stand.leaks())).toEqual([]);
    await item(page, { route: { code: 'AUDIT', when: 'after' } });
    await item(page, { route: { code: 'Secondary-Sorting', when: 'before', confirm: 'unsell' } });
    // Po pracy dziennik stanowiska jest pełen wpisów — i nadal czysty.
    expect(await page.evaluate(() => window.Stand.leaks())).toEqual([]);
});
