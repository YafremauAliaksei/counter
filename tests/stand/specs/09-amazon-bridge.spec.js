/**
 * 09-amazon-bridge.spec.js — most cen T-REX ↔ amazon.de w prawdziwej przeglądarce.
 *
 * Dwie karty pod prawdziwymi adresami (odpowiedzi podstawia test, do sieci nic
 * nie wychodzi): karta T-REX otwiera amazon.de przyciskiem mostu, ten sam
 * skrypt wklejony tam staje się drugą stroną. Sprawdza się:
 *   - cenę rozebraną z próbek strony produktu w kilku układach bloku ceny
 *     (.a-offscreen, symbol + całość + grosze, tekst podwojony, priceblock);
 *   - że karta T-REX nie wysyła do amazon.de ani jednego zapytania — pyta
 *     wyłącznie karta amazon.de, pod własnym adresem;
 *   - kartę amazon.de otwartą ręcznie (bez T-REX): skrypt nie odpowiada.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { ARTIFACT } = require('./helpers');

const TREX = 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN';
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

/** Próbki strony produktu: ASIN → treść kontenera produktu. */
const PRODUCTS = {
    B0OFFSCRN1: `<div id="corePriceDisplay_desktop_feature_div">
        <div class="basisPrice"><span class="a-price" data-a-strike="true"><span class="a-offscreen">1.499,00 €</span></span></div>
        <span class="apex-pricetopay-value"><span class="a-offscreen">1.299,99 €</span></span></div>`,
    B0WHOLEFR1: `<div id="corePrice_feature_div"><span class="a-price"><span class="a-price-symbol">€</span>
        <span class="a-price-whole">2.991,</span><span class="a-price-fraction">39</span></span></div>`,
    B0DOUBLED1: `<span class="priceToPay">12,99€12,99€</span>`,
    B0PRICEBL1: `<span id="priceblock_ourprice">EUR 49,90</span>`,
    B0NOPRICE1: `<h1>Derzeit nicht verfügbar.</h1>`,
};

async function setup(context) {
    const amazonHits = [];
    await context.route('**/*', (r) => r.abort());
    await context.route('https://trex-prod-eu.aka.amazon.com/**', (r) =>
        r.fulfill({ contentType: 'text/html', body: page('<div id="trex">krok</div>') }));
    await context.route('https://www.amazon.de/**', (r) => {
        const u = new URL(r.request().url());
        // Kadr znany tylko dla zapytań ze strony (nie dla nawigacji okna).
        const req = r.request();
        amazonHits.push({ path: u.pathname, frame: req.isNavigationRequest() ? '(nawigacja)' : req.frame().url() });
        const m = /^\/dp\/([A-Z0-9]{10})$/.exec(u.pathname);
        const body = m ? `<div id="dp-container">${PRODUCTS[m[1]] || ''}</div>` : '<div>amazon.de</div>';
        return r.fulfill({ contentType: 'text/html', body: page(body) });
    });
    return amazonHits;
}

test('T-REX dostaje cenę z karty amazon.de w każdym układzie bloku; sam nie pyta amazon.de', async ({ context }) => {
    const amazonHits = await setup(context);
    const src = ARTIFACT;
    const trex = await context.newPage();
    await trex.goto(TREX);
    await trex.evaluate(src);
    await trex.evaluate(() => window.SH.priceOn());

    const popup = context.waitForEvent('page');
    await trex.evaluate(() => window.SH.AmazonBridge.open());
    const amz = await popup;
    await amz.waitForLoadState();
    await amz.evaluate(src);
    await trex.waitForFunction(() => window.SH.AmazonBridge.connected());

    const ask = (asin) => trex.evaluate((a) => window.SH.AmazonBridge.request(a), asin);
    expect(await ask('B0OFFSCRN1')).toEqual({ current: 1299.99, rrp: 1499, error: null });
    expect(await ask('B0WHOLEFR1')).toEqual({ current: 2991.39, rrp: null, error: null });
    expect(await ask('B0DOUBLED1')).toEqual({ current: 12.99, rrp: null, error: null });
    expect(await ask('B0PRICEBL1')).toEqual({ current: 49.9, rrp: null, error: null });
    expect(await ask('B0NOPRICE1')).toEqual({ current: null, rrp: null, error: 'na stronie nie ma ceny' });

    // Karta ceny z mostem: cena w euro na karcie T-REX.
    const r = await trex.evaluate(() => window.SH.PriceCard.resolve('B0OFFSCRN1'));
    expect(r.status).toBe('ok');
    expect(r.current).toMatchObject({ value: 1299.99, currency: 'EUR' });

    // Strony produktu pobierała wyłącznie karta amazon.de, pod własnym adresem.
    const dp = amazonHits.filter(h => h.path.startsWith('/dp/'));
    expect(dp.length).toBeGreaterThanOrEqual(6);
    expect(dp.every(h => h.frame.startsWith('https://www.amazon.de'))).toBe(true);
});

test('karta amazon.de otwarta ręcznie (bez T-REX) nie odpowiada i mówi, skąd ją otworzyć', async ({ context }) => {
    await setup(context);
    const src = ARTIFACT;
    const amz = await context.newPage();
    await amz.goto('https://www.amazon.de/');
    await amz.evaluate(src);
    const badge = await amz.evaluate(() => document.querySelector('[id$="amazonBadge"]').textContent);
    expect(badge).toContain('T-REX');
    expect(await amz.evaluate(() => Object.keys(window).some(k => /AMAZON$/.test(k) && window[k] === true))).toBe(false);
});
