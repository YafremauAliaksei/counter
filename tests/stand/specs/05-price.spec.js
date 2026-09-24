/**
 * 05-price.spec.js — moduł cen w przeglądarce, na odpowiedziach z testu.
 *
 * Włączony ręcznie moduł pyta o kursy i o obrazek wykresu, odczytuje cenę
 * z pikseli, pokazuje ją na karcie i wpisuje do dziennika wartości razem
 * z kierunkiem przedmiotu. Wszystkie zapytania dostają odpowiedź z testu
 * (helpers.openStand) — do prawdziwej sieci nie wychodzi nic, a lista prób
 * pokazuje, dokąd skrypt pytał. Na stronie z CSP „tylko własny host” obrazek
 * jest cięty przed wyjściem w sieć, a karta mówi, dlaczego ceny nie ma.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste, item, external, keepaPng } = require('./helpers');

const ASIN = 'B00006JCUB';
const FX = { eur: { usd: 1.16, gbp: 0.86, pln: 4.3, sek: 11.3, cad: 1.6 } };

/** Odpowiedzi z testu: kursy i obrazek wykresu (ustawiany po wklejeniu). */
function fixtures() {
    const f = { png: null };
    f.respond = (url) => {
        const cors = { 'access-control-allow-origin': '*' };
        if (url.startsWith('https://cdn.jsdelivr.net/')) {
            return { status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(FX) };
        }
        if (url.startsWith('https://graph.keepa.com/') && f.png) {
            return { status: 200, headers: cors, contentType: 'image/png', body: f.png };
        }
        return null;
    };
    return f;
}

/** Moduł włączony tak jak z panelu; przerwa między zapytaniami skrócona. */
async function priceOn(page) {
    await page.evaluate(() => {
        window.SH.CONFIG.PRICE_MIN_REQUEST_GAP_MS = 0;
        window.SH.priceOn();
    });
}

test('cena z obrazka trafia na kartę i do dziennika z kierunkiem sprzedaży', async ({ page }) => {
    const f = fixtures();
    const rec = await openStand(page, { respond: f.respond });
    await paste(page);
    f.png = await keepaPng(page, '12.34');
    await priceOn(page);

    await item(page, { asin: ASIN, route: { code: 'CRITS-PRG2', when: 'before' } });

    const card = await page.evaluate(() => window.SH.PriceCard.priceEl.textContent);
    expect(card).toContain('12.34');
    const entries = await page.evaluate(() =>
        window.SH.ValueLog.entries.map((e) => ({ asin: e.asin, price: e.price, currency: e.currency, sign: e.sign })));
    expect(entries).toEqual([{ asin: ASIN, price: 12.34, currency: 'EUR', sign: 1 }]);
    expect(await page.evaluate(() => window.SH.FxRates.source)).toBe('jsdelivr');

    // Zapytania tylko do znanych źródeł i tylko o bieżący towar na rynku .de.
    // Te same adresy doszły do warstwy sieci (routed) — na tym opiera się
    // sprawdzenie „nic nie wyszło” w teście CSP niżej.
    const asked = external(rec).map((r) => r.url);
    expect(rec.routed.some((u) => u.startsWith('https://graph.keepa.com/'))).toBe(true);
    expect(asked).toContain('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');
    expect(asked.filter((u) => u.startsWith('https://graph.keepa.com/')).every((u) =>
        u.includes('asin=' + ASIN) && u.includes('domain=de'))).toBe(true);
});

test('po wyłączeniu modułu nie wychodzi już nic, choć praca trwa', async ({ page }) => {
    const f = fixtures();
    const rec = await openStand(page, { respond: f.respond });
    await paste(page);
    f.png = await keepaPng(page, '9.99');
    await priceOn(page);
    await item(page, { asin: ASIN });
    await page.evaluate(() => window.SH.priceOff());
    const mark = external(rec).length;
    await item(page, { asin: 'B019ETZ2ZU' });
    await item(page, { asin: 'B00569J8CQ' });
    await page.waitForTimeout(1500);
    expect(external(rec).slice(mark)).toEqual([]);
});

test('CSP strony tnie obrazek: karta mówi dlaczego, a do sieci nic nie wyszło', async ({ page }) => {
    const f = fixtures();
    const rec = await openStand(page, { query: 'csp=strict', respond: f.respond });
    await paste(page);
    await priceOn(page);
    await item(page, { asin: ASIN });

    await expect.poll(() => page.evaluate(() => window.SH.PriceCard.csp.img)).toBe(true);
    const why = await page.evaluate(() => window.SH.PriceCard.rrpEl.textContent);
    expect(why).toBe(await page.evaluate(() => window.SH.I18n.get('priceCard_cspOcr')));
    // Blokada CSP działa przed siecią: przeglądarka widzi próbę obrazka, ale
    // ta kończy się na polityce strony i do warstwy sieci nie dochodzi nic.
    expect(rec.routed).toEqual([]);
});
