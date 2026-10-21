#!/usr/bin/env node
/**
 * datamatrix.js — kod Data Matrix zakładki jako obrazek SVG.
 *
 *   node tools/datamatrix.js                > zakladka.svg   zakładka z README
 *   node tools/datamatrix.js "dowolny tekst" > kod.svg
 *
 * Koder to ten sam moduł, który siedzi w artefakcie (src/30-datamatrix.js),
 * więc kod z panelu i kod stąd są identyczne. Bez zależności i bez sieci.
 * Tekst musi być czysto ASCII — znak spoza (np. „ł”) kończy się błędem,
 * zamiast kodu, którego skaner nie odczyta.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DataMatrix = vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'src', '30-datamatrix.js'), 'utf8') + '\nDataMatrix'
);

/** Pierwsza zakładka z README — jedno źródło prawdy o jej treści. */
function readmeBookmarklet() {
    const m = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').match(/^javascript:.*$/m);
    if (!m) throw new Error('w README.md nie ma linii zaczynającej się od javascript:');
    return m[0];
}

/** SVG: jeden prostokąt na ciemny moduł, strefa ciszy dwóch modułów. */
function toSvg(m, cell = 8, quiet = 2) {
    const side = (m.length + 2 * quiet) * cell;
    const rects = [];
    m.forEach((row, r) =>
        row.forEach((dark, c) => {
            if (dark)
                rects.push(
                    `<rect x="${(c + quiet) * cell}" y="${(r + quiet) * cell}" width="${cell}" height="${cell}"/>`
                );
        })
    );
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">` +
        `<rect width="${side}" height="${side}" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>\n`
    );
}

if (require.main === module) {
    const text = process.argv[2] || readmeBookmarklet();
    const bad = [...text].find((ch) => ch.charCodeAt(0) > 127);
    if (bad) {
        console.error(
            `Znak spoza ASCII: „${bad}” — zamień go (np. „ł” na „l”) albo zapisz jako \\u${bad.charCodeAt(0).toString(16).padStart(4, '0')} w tekście skryptu.`
        );
        process.exit(1);
    }
    const m = DataMatrix.encode(text);
    if (!m) {
        console.error('Tekst za długi na symbol Data Matrix (najwyżej ok. 1300 znaków).');
        process.exit(1);
    }
    process.stdout.write(toSvg(m));
    console.error(`Data Matrix ${m.length}×${m.length}, ${text.length} znaków.`);
}

module.exports = { toSvg, readmeBookmarklet, DataMatrix };
