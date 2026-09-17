/**
 * 04-multitab.test.js — dwie karty naraz.
 *
 * Normalny tryb pracy to dwie otwarte karty (CRET i WHD) w jednej
 * przeglądarce, czyli na JEDNYM localStorage. Linia 7 ma pokazywać sumę
 * z obu — inaczej cały jej sens znika, bo człowiek i tak musiałby dodawać
 * w głowie.
 *
 * Atrapa nie rozsyła zdarzeń 'storage' sama, więc wstrzykujemy je ręcznie —
 * dokładnie tak, jak robi to przeglądarka, gdy sąsiednia karta coś zapisze.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, makeEnv, setShift } = require('./dom-stub');

const URL_CRET = 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN';
const URL_WHD = 'https://trex-prod-eu.aka.amazon.com/?gradingMode=WAREHOUSE_DEALS';
const URL_REFURB = 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN_REFURB';

// Jeden magazyn, wiele kart — tak jak w przeglądarce.
const shared = makeEnv().sandbox.localStorage;

const cret = boot({ storage: shared, href: URL_CRET });
const whd = boot({ storage: shared, href: URL_WHD });
const key = (id) => cret.prefix + 'counter_' + id;

describe('Dwie karty na jednym localStorage');

test('karty rozpoznały się jako różne działy', () => {
    eq(cret.SH.store.currentTabInstanceId, 'CRET');
    eq(whd.SH.store.currentTabInstanceId, 'WHD');
});

test('obie karty startują bez sieci i bez logów', () => {
    eq(cret.net.fetches, []);
    eq(whd.net.fetches, []);
    eq(cret.net.consoleLog, []);
    eq(whd.net.consoleLog, []);
});

test('licznik jednej karty trafia do localStorage', () => {
    setShift(cret, 2);
    setShift(whd, 2);
    cret.SH.store.tabCounters.CRET = 12;
    cret.SH.StorageManager.saveCounter('CRET', 12);
    eq(shared.getItem(key('CRET')), '12');
});

test('druga karta widzi licznik pierwszej po zdarzeniu storage', () => {
    whd.window._emit('storage', { key: key('CRET'), newValue: '12' });
    eq(whd.SH.store.tabCounters.CRET, 12);
});

test('linia 7 sumuje OBIE karty, a nie tylko swoją', () => {
    whd.SH.store.tabCounters.WHD = 8;
    whd.SH.StorageManager.saveCounter('WHD', 8);
    whd.SH.StatsWindowRenderer.renderContent();
    // 12 + 8 = 20 sztuk przez 2 h = 10.0/h
    eq(whd.SH.StatsWindowRenderer.lines.line7_compact.textContent, '10.0 20 0%');
});

test('ta sama suma widoczna na pierwszej karcie', () => {
    cret.window._emit('storage', { key: key('WHD'), newValue: '8' });
    cret.SH.StatsWindowRenderer.renderContent();
    eq(cret.SH.StatsWindowRenderer.lines.line7_compact.textContent, '10.0 20 0%');
});

test('nowa karta otwarta w trakcie zmiany od razu widzi cudze liczniki', () => {
    const late = boot({ storage: shared, href: URL_REFURB });
    eq(late.SH.store.tabCounters.CRET, 12, 'licznik CRET wczytany z localStorage');
    eq(late.SH.store.tabCounters.WHD, 8, 'licznik WHD wczytany z localStorage');

    setShift(late, 2, { CRET: Date.now(), WHD: Date.now(), REFURB: Date.now() });
    late.SH.StatsWindowRenderer.renderContent();
    eq(late.SH.StatsWindowRenderer.lines.line7_compact.textContent, '10.0 20 0%');
    eq(late.net.fetches, [], 'nowa karta też nie wchodzi do sieci');
});

test('wyłączenie działu z sumy działa lokalnie, nie zmienia sąsiada', () => {
    whd.SH.store.userConfig.globalStatsContributionKnown.CRET = false;
    whd.SH.StatsWindowRenderer.renderContent();
    eq(whd.SH.StatsWindowRenderer.lines.line7_compact.textContent, '4.0 8 0%');

    cret.SH.StatsWindowRenderer.renderContent();
    eq(cret.SH.StatsWindowRenderer.lines.line7_compact.textContent, '10.0 20 0%',
       'ustawienie jednej karty nie może zmienić drugiej w tej samej chwili');

    whd.SH.store.userConfig.globalStatsContributionKnown.CRET = true;
});

test('reset liczników przez jedną kartę dociera do drugiej', () => {
    cret.window._emit('storage', { key: key('WHD'), newValue: null });
    eq(cret.SH.store.tabCounters.WHD, 0);
    cret.SH.StatsWindowRenderer.renderContent();
    eq(cret.SH.StatsWindowRenderer.lines.line7_compact.textContent, '6.0 12 0%');
});

test('karty nie depczą sobie po kluczach magazynu', () => {
    // Każda karta pisze pod własnym kluczem licznika; wspólne są tylko
    // ustawienia i dziennik wartości.
    const keys = [...shared._map.keys()];
    ok(keys.includes(key('CRET')), 'klucz CRET');
    const counterKeys = keys.filter(k => k.startsWith(cret.prefix + 'counter_'));
    eq(new Set(counterKeys).size, counterKeys.length, 'brak duplikatów kluczy liczników');
});
