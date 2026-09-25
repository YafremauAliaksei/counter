#!/usr/bin/env node
/**
 * serve.js — statyczny serwer stanowiska.
 *
 * Stanowisko wczytuje /counter.js i własne pliki po HTTP: przy otwarciu przez
 * file:// przeglądarka blokuje część rzeczy, a testy przeglądarkowe potrzebują
 * zwykłego adresu. Zero zależności — goły moduł http z Node.
 *
 * Uruchomienie:
 *     node tests/stand/serve.js            (PORT=… zmienia port)
 * Potem:
 *     http://localhost:8731/               stanowisko
 *     http://localhost:8731/?autoload=1    stanowisko z od razu załadowanym skryptem
 *     …?gradingMode=CRETURN                karta działu CRET (WAREHOUSE_DEALS — WHD)
 *     …?csp=strict                         strona z polityką CSP „tylko własny host”,
 *                                          jak serwer, który tnie obrazki i zapytania
 *                                          do obcych hostów
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 8731;
const PAGE = '/tests/stand/index.html';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
};

/**
 * Polityka „tylko własny host”: obrazki i zapytania do obcych hostów są
 * cięte przed wyjściem w sieć. Style inline zostają dozwolone, bo tak
 * wygląda strona, na której skrypt pracuje (i tak wstawia własny <style>).
 */
const STRICT_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'";

/** Ta sama ścieżka w postaci porównywalnej niezależnie od systemu. */
function norm(p) {
    return p.split(path.sep).join('/').toLowerCase();
}

http.createServer((req, res) => {
    const [pathname, query = ''] = req.url.split('?');
    // Adres główny prowadzi na stanowisko przekierowaniem, a nie podmianą
    // treści — względne adresy strony (stand.js) liczą się od jej katalogu.
    if (pathname === '/') {
        res.writeHead(302, { Location: PAGE + (query ? '?' + query : '') });
        return res.end();
    }
    const rel = decodeURIComponent(pathname);
    const file = path.join(ROOT, rel);

    // Ochrona przed wyjściem poza katalog repozytorium (../../etc/passwd).
    if (!norm(file).startsWith(norm(ROOT))) {
        res.writeHead(403);
        return res.end('403');
    }

    fs.readFile(file, (err, body) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Nie znaleziono: ' + rel);
        }
        const headers = {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        };
        if (/(^|&)csp=strict(&|$)/.test(query)) headers['Content-Security-Policy'] = STRICT_CSP;
        res.writeHead(200, headers);
        res.end(body);
    });
}).listen(PORT, () => {
    console.log(`Stanowisko: http://localhost:${PORT}/`);
    console.log('Ctrl+C kończy.');
});
