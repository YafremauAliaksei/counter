/**
 * helpers.js — wspólne narzędzia testów stanowiska.
 *
 * Trzy zasady, na których stoją wszystkie testy:
 *   1. skrypt wchodzi na stronę tak jak u człowieka — wklejony do konsoli
 *      (page.evaluate wykonuje go jak konsola, z pominięciem CSP strony);
 *   2. do prawdziwej sieci nie wychodzi nic: każde zapytanie poza stanowisko
 *      jest przechwytywane i odrzucane albo dostaje odpowiedź z testu,
 *      a wszystkie próby są zapisywane, żeby test mógł je policzyć;
 *   3. stanowisko pokazuje wyzwalacze wyłącznie na ekranie kroku, a po każdym
 *      teście stały tekst strony jest sprawdzany (Stand.leaks()).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'counter.js'), 'utf8');

// Krok stanowiska dłuższy niż odłożenie skanu w skrypcie (50 ms) z zapasem —
// inaczej dwa kroki wpadłyby w jeden skan i wyzwalacz by przepadł.
const STEP_MS = 150;

const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

/**
 * Otwiera stanowisko i zaczyna zapisywać sieć, konsolę i błędy strony.
 * Zapytania poza stanowisko dostają odpowiedź z `respond` albo są odrzucane.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ query?: string, respond?: (url: string) => (object|null) }} [opts]
 */
async function openStand(page, { query = '', respond = null } = {}) {
    // requests — każda próba, którą zobaczyła przeglądarka (także zablokowana
    // przez CSP); routed — tylko te, które doszły do warstwy sieci;
    // failed — powód porażki, do diagnozy przy padającym teście.
    const rec = { requests: [], routed: [], failed: [], console: [], errors: [], sockets: [] };
    page.on('request', (r) => rec.requests.push({ url: r.url(), type: r.resourceType() }));
    page.on('requestfailed', (r) => rec.failed.push(r.failure().errorText + ' ' + r.url()));
    page.on('websocket', (ws) => rec.sockets.push(ws.url()));
    page.on('console', (m) => rec.console.push(m.type() + ': ' + m.text()));
    page.on('pageerror', (e) => rec.errors.push(String(e)));
    await page.route((url) => !isLocal(url.href), (route) => {
        rec.routed.push(route.request().url());
        const answer = respond && respond(route.request().url());
        return answer ? route.fulfill(answer) : route.abort('blockedbyclient');
    });
    await page.goto('/' + (query ? '?' + query : ''));
    await page.evaluate((ms) => window.Stand.configure({ stepMs: ms }), STEP_MS);
    return rec;
}

/** Wklejenie skryptu — tak jak robi to człowiek w konsoli. */
async function paste(page) {
    await page.evaluate(ARTIFACT);
    await page.waitForFunction(() => window.SH && window.SH.store);
}

/** Zapytania, które wyszły poza stanowisko (także odrzucone). */
const external = (rec) => rec.requests.filter((r) => !isLocal(r.url));

/** Licznik bieżącej karty. */
const count = (page) =>
    page.evaluate(() => window.SH.store.tabCounters[window.SH.store.currentTabInstanceId] || 0);

/** Przedmiot na stanowisku (opcje: patrz Stand.item w stand.js). */
const item = (page, opts) => page.evaluate((o) => window.Stand.item(o), opts || {});

/**
 * Obrazek wykresu w układzie Keepa (500x200) z ceną w legendzie, rysowany
 * wzorcami cyfr samego skryptu (SH.KeepaOCR.GLYPHS) w pasie pierwszej serii.
 * Sprawdza całą drogę obrazka: zapytanie, CORS, canvas, rozbiór, kartę
 * i dziennik — bez cudzych obrazków w repozytorium. Poprawność samych
 * wzorców sprawdzają testy jednostkowe (08, 14).
 *
 * @returns {Promise<Buffer>} PNG
 */
async function keepaPng(page, price) {
    const dataUrl = await page.evaluate((text) => {
        const SH = window.SH;
        const C = SH.CONFIG;
        const c = document.createElement('canvas');
        c.width = C.PRICE_KEEPA_PNG_W;
        c.height = C.PRICE_KEEPA_PNG_H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        const [y0] = C.PRICE_OCR_BANDS[0];
        // Znacznik serii „Amazon” na lewo od tekstu, w kolorze z KeepaOCR.SERIES.
        const [r, g, b] = SH.KeepaOCR.SERIES[0].rgb;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(C.PRICE_OCR_SERIES_FROM_X + 4, y0, 8, 8);
        ctx.fillStyle = '#000';
        let x = C.PRICE_OCR_SCAN_FROM_X + 20;
        for (const ch of text) {
            const rows = SH.KeepaOCR.GLYPHS[ch];
            rows.forEach((row, dy) => {
                [...row].forEach((px, dx) => { if (px === '#') ctx.fillRect(x + dx, y0 + dy, 1, 1); });
            });
            x += rows[0].length + 1;
        }
        return c.toDataURL('image/png');
    }, price);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

module.exports = { ARTIFACT, STEP_MS, openStand, paste, external, count, item, keepaPng, isLocal };
