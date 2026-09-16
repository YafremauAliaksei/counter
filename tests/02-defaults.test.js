/**
 * 02-defaults.test.js — wartości domyślne, czyli to, co zobaczy człowiek,
 * który wkleił plik pierwszy raz i niczego nie ustawiał.
 *
 * Każda z tych liczb jest obiecana w README. Zmiana którejkolwiek bez zmiany
 * README to rozjazd dokumentacji z kodem — dlatego siedzą tu jako asercje.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();

describe('Domyślne ustawienia linii');

test('linia 2 (podsumowanie globalne) domyślnie wyłączona', () => {
    eq(env.SH.DEFAULT_LINE_CONFIG.line2_globalSummary.visible, false);
    eq(env.SH.store.localTabConfig.linesConfig.line2_globalSummary.visible, false);
});

test('linia 6 (suma wartości) domyślnie wyłączona', () => {
    eq(env.SH.DEFAULT_LINE_CONFIG.line6_valueSum.visible, false);
    eq(env.SH.store.localTabConfig.linesConfig.line6_valueSum.visible, false);
});

test('linie 1, 3, 4, 5 domyślnie wyłączone', () => {
    const lc = env.SH.store.localTabConfig.linesConfig;
    eq(lc.line1_currentTab.visible, false);
    eq(lc.line3_shiftInfo.visible, false);
    eq(lc.line4_lunchInfo.visible, false);
    eq(lc.line5_realTimeClock.visible, false);
});

test('linia 7 jest jedyną włączoną i ma zadane parametry', () => {
    const l7 = env.SH.store.localTabConfig.linesConfig.line7_compact;
    eq(l7.visible, true, 'visible');
    eq(l7.colorHex, '#808080', 'kolor szary');
    eq(l7.alpha, 50, 'alfa 50%');
    eq(l7.fontSize, 13, 'czcionka 13px');

    const on = Object.keys(env.SH.DEFAULT_LINE_CONFIG)
        .filter(k => env.SH.DEFAULT_LINE_CONFIG[k].visible);
    eq(on, ['line7_compact'], 'włączone linie');
});

test('linia 7 jest ostatnia w kolejności okna', () => {
    eq(env.SH.LINE_KEYS[env.SH.LINE_KEYS.length - 1], 'line7_compact');
    eq(env.SH.LINE_KEYS.length, 7);
});

test('każda linia z LINE_KEYS ma swoją konfigurację i element w DOM', () => {
    for (const k of env.SH.LINE_KEYS) {
        ok(env.SH.store.localTabConfig.linesConfig[k], 'brak konfiguracji dla ' + k);
        ok(env.SH.StatsWindowRenderer.lines[k], 'brak elementu dla ' + k);
    }
});

describe('Położenie i styl okna');

test('okno stoi w lewym dolnym rogu: 20 px od lewej, 8 px od dołu', () => {
    const pos = env.SH.DEFAULT_LOCAL_CONFIG.statsWindowPosition;
    eq(pos.left, '20px');
    eq(pos.bottom, '8px');
    eq(pos.top, '');

    const el = env.el('statsWindow');
    ok(el, 'okno statystyk musi być w DOM');
    eq(el.style.left, '20px');
    eq(el.style.bottom, '8px');
    eq(el.style.top, 'auto');
});

test('applyPosition przełącza się na górną krawędź, gdy podano top', () => {
    env.SH.store.localTabConfig.statsWindowPosition = { top: '15px', left: '30px', bottom: '' };
    env.SH.StatsWindowRenderer.applyPosition();
    const el = env.el('statsWindow');
    eq(el.style.top, '15px');
    eq(el.style.bottom, 'auto');
    eq(el.style.left, '30px');
    // i z powrotem
    env.SH.store.localTabConfig.statsWindowPosition =
        env.SH.Utils.clone(env.SH.DEFAULT_LOCAL_CONFIG.statsWindowPosition);
    env.SH.StatsWindowRenderer.applyPosition();
    eq(el.style.bottom, '8px');
});

describe('Wersja, magazyn i hasło');

test('wersja została podstawiona przy budowaniu', () => {
    ok(/^\d+\.\d+\.\d+$/.test(env.SH.CONFIG.SCRIPT_VERSION),
       'wersja musi być w formacie SemVer, jest: ' + env.SH.CONFIG.SCRIPT_VERSION);
    const pkg = require('../package.json');
    eq(env.SH.CONFIG.SCRIPT_VERSION, pkg.version, 'wersja w artefakcie musi zgadzać się z package.json');
});

test('prefiks magazynu jest spójny i poprzednie wersje trafiły na listę starych', () => {
    ok(/^statsHelper_v\d+_\d+_\d+_$/.test(env.prefix), 'kształt prefiksu: ' + env.prefix);
    const legacy = env.SH.CONFIG.LEGACY_ID_PREFIXES;
    ok(legacy.includes('statsHelper_v9_2_0_'), 'prefiks poprzedniego wydania musi być sprzątany');
    ok(!legacy.includes(env.prefix), 'bieżący prefiks nie może być na liście do usunięcia');
});

test('hasło dostępu to 11 znaków GORDONPAULE', () => {
    const seq = env.SH.CONFIG.SETTINGS_PANEL_ACCESS_SEQUENCE;
    eq(seq.length, 11);
    eq(seq.join(''), 'GORDONPAULE');
});

test('język domyślny to polski, sklep domyślny to amazon.de', () => {
    eq(env.SH.CONFIG.DEFAULT_LANGUAGE, 'pl');
    eq(env.SH.store.userConfig.language, 'pl');
    eq(env.SH.CONFIG.DEFAULT_MARKETPLACE, 'de');
});
