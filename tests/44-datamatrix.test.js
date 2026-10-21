/**
 * 44-datamatrix.test.js — kod Data Matrix zakładki.
 *
 * PO CO. Zakładkę skanuje się telefonem albo skanerem zamiast przepisywać
 * trzystu znaków. Błąd w koderze nie wywraca niczego w skrypcie — daje
 * obrazek, którego nikt nie odczyta, i wychodzi dopiero przy stanowisku.
 * Stąd: wektor z normy dla korekcji, granice rozmiarów, wzór ramek i odcisk
 * macierzy zakładki z README, sprawdzonej dekoderem zxing.
 *
 * Generatory pracują na jednej stronie kodowej, więc zakładka ma być czysto
 * ASCII — „ł” w komunikacie błędu kończyło się „Invalid code page”.
 */

'use strict';

const crypto = require('crypto');
const { describe, test, eq, ok } = require('./harness');
const { boot } = require('./dom-stub');
const { DataMatrix, readmeBookmarklet, toSvg } = require('../tools/datamatrix');

const NON_ASCII = /[^ -~]/; // wszystko poza drukowalnym ASCII
const bits = (m) => m.map(r => r.map(b => (b ? 1 : 0)).join('')).join('\n');

describe('Koder');

test('korekcja Reeda-Solomona zgodna z przykładem z normy („123456”)', () => {
    eq(DataMatrix.encodeAscii('123456'), [142, 164, 186]);
    eq(DataMatrix.reedSolomon([142, 164, 186], 5), [114, 25, 5, 88, 102]);
});

test('ASCII: litera to kod + 1, para cyfr to jeden symbol, nieparzysta cyfra osobno', () => {
    eq(DataMatrix.encodeAscii('A'), [66]);
    eq(DataMatrix.encodeAscii('99'), [229]);
    eq(DataMatrix.encodeAscii('123'), [142, 52]);
    eq(DataMatrix.encodeAscii(''), []);
});

test('znak spoza ASCII nie daje kodu, zamiast kodu nie do odczytania', () => {
    for (const t of ['ł', 'StatsHelper nie wystartował', '„x”', 'a b', '€']) {
        eq(DataMatrix.encode(t), null, t);
    }
    ok(DataMatrix.encode('\x7F'), 'znak 127 to jeszcze ASCII');
});

test('granice rozmiaru: 3 symbole w 10×10, 4 już w 12×12, 1304 w 132×132, 1305 — nic', () => {
    eq(DataMatrix.encode('abc').length, 10);
    eq(DataMatrix.encode('abcd').length, 12);
    eq(DataMatrix.encode('').length, 10, 'pusty tekst to samo dopełnienie');
    eq(DataMatrix.encode('x'.repeat(1304)).length, 132);
    eq(DataMatrix.encode('x'.repeat(1305)), null);
    eq(DataMatrix.encode('1'.repeat(2608)).length, 132, 'pary cyfr liczą się podwójnie');
});

test('ramki obszarów: lewa i dolna krawędź pełne, górna i prawa naprzemienne', () => {
    for (const [len, side, per] of [[3, 10, 10], [100, 40, 20], [300, 72, 18]]) {
        const m = DataMatrix.encode('x'.repeat(len));
        eq(m.length, side);
        for (let r = 0; r < side; r++) {
            for (let c = 0; c < side; c++) {
                const lr = r % per, lc = c % per;
                if (lc === 0 || lr === per - 1) ok(m[r][c], `pełna krawędź ${r},${c}`);
                else if (lr === 0) eq(m[r][c], lc % 2 === 0, `górna ${r},${c}`);
                else if (lc === per - 1) eq(m[r][c], lr % 2 === 1, `prawa ${r},${c}`);
            }
        }
    }
});

test('zakładka z README: czysto ASCII i ta sama macierz, którą odczytał zxing', () => {
    const text = readmeBookmarklet();
    ok(!NON_ASCII.test(text), 'zakładka bez znaków spoza ASCII');
    const m = DataMatrix.encode(text);
    eq(m.length, 72);
    eq(crypto.createHash('sha256').update(bits(m)).digest('hex'),
       'e4bbf3d4caed29b7de2f51ad6557ba50ea8014cf78075f1b347272c96fced5ad',
       'odcisk sprawdzony dekoderem — zmiana kodera albo zakładki wymaga ponownego sprawdzenia');
});

test('SVG: tło, strefa ciszy i jeden prostokąt na ciemny moduł', () => {
    const m = DataMatrix.encode('A');
    const svg = toSvg(m, 8, 2);
    const dark = m.flat().filter(Boolean).length;
    eq((svg.match(/<rect x=/g) || []).length, dark);
    ok(svg.includes('width="112"'), '(10 + 2·2) · 8 = 112');
});

describe('Zakładka w panelu');

test('gotowa zakładka jest czysto ASCII; przy domyślnych ustawieniach bez kodu ustawień', () => {
    const e = boot();
    e.SH.CONFIG.RELEASE_URL = 'https://intranet.example/statshelper/counter.js';
    const plain = e.SH.ConfigCode.link();
    ok(!NON_ASCII.test(plain), plain);
    ok(plain.includes('if(window.SH&&SH.settings){SH.settings();return}'), 'drugie kliknięcie otwiera panel');
    ok(!plain.includes(e.SH.ConfigCode.BOOT_GLOBAL), 'pusty kod nie jedzie w zakładce');
    e.SH.store.localTabConfig.linesConfig.line7_compact.alpha = 90;
    const withCode = e.SH.ConfigCode.link();
    ok(!NON_ASCII.test(withCode));
    ok(withCode.includes(e.SH.ConfigCode.BOOT_GLOBAL), 'kod ustawień jedzie w zakładce');
    ok(!withCode.includes('SH.settings();return'), 'z kodem skrypt wczytuje się od nowa, żeby go nałożyć');
    ok(DataMatrix.encode(withCode), 'mieści się w kodzie Data Matrix');
});

test('przycisk „Pokaż kod Data Matrix” rysuje kod na żądanie, a bez adresu wydania go nie ma', () => {
    const e = boot();
    const S = e.SH.store;
    S.uiFlags.isSettingsPanelVisible = true;
    e.SH.SettingsPanel.render();
    ok(!e.SH.SettingsPanel.el.textContent.includes('Pokaż kod Data Matrix'), 'bez adresu wydania');
    e.SH.CONFIG.RELEASE_URL = 'https://intranet.example/statshelper/counter.js';
    e.SH.SettingsPanel.render();
    const txt = e.SH.SettingsPanel.el.textContent;
    ok(txt.includes('Pokaż kod Data Matrix'), 'z adresem wydania');
    const link = e.SH.ConfigCode.link();
    const canvas = e.SH.SettingsPanel.matrixCanvas(link);
    eq(canvas.width, (DataMatrix.encode(link).length + 4) * 4, 'płótno: moduły po 4 px ze strefą ciszy');
    eq(e.SH.SettingsPanel.matrixCanvas('ł'), null);
    S.uiFlags.isSettingsPanelVisible = false;
    eq(e.net.fetches, [], 'bez sieci');
});
