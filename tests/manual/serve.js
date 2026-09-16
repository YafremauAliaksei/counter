#!/usr/bin/env node
/**
 * serve.js — statyczny serwer dla stanowiska w przeglądarce.
 *
 * Po co: stanowisko musi wczytać ../../counter.js zwykłym <script src>,
 * a przy otwarciu pliku przez file:// przeglądarka blokuje część rzeczy
 * (i tak samo blokuje je część narzędzi podglądu). Najprostsze wyjście to
 * podać katalog repozytorium po HTTP.
 *
 * Uruchomienie:
 *     node tests/manual/serve.js
 *
 * Potem w przeglądarce:
 *     http://localhost:8731/tests/manual/test_page.html
 *
 * A w konsoli strony (F12) wkleić zawartość counter.js — albo szybciej:
 *     var s=document.createElement('script'); s.src='/counter.js';
 *     document.head.appendChild(s);
 *
 * Dwie karty naraz (normalny tryb pracy) to ten sam adres z parametrami:
 *     .../test_page.html?gradingMode=CRETURN
 *     .../test_page.html?gradingMode=WAREHOUSE_DEALS
 *
 * Zero zależności — goły moduł http z Node.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 8731;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
};

/** Ta sama ścieżka w postaci porównywalnej niezależnie od systemu. */
function norm(p) {
    return p.split(path.sep).join('/').toLowerCase();
}

http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
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
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(body);
    });
}).listen(PORT, () => {
    console.log(`Stanowisko: http://localhost:${PORT}/tests/manual/test_page.html`);
    console.log(`Katalog:    ${ROOT}`);
    console.log('Ctrl+C kończy.');
});
