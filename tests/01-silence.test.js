/**
 * 01-silence.test.js — najważniejszy plik w całym zestawie.
 *
 * README obiecuje dwie rzeczy o domyślnym zachowaniu: skrypt nie wchodzi do
 * sieci i nie pisze do konsoli. To tutaj ta obietnica jest sprawdzana.
 * Jeśli którykolwiek z tych testów się wywali, zmieniło się zachowanie
 * widoczne dla użytkownika — to zawsze jest zmiana MINOR lub MAJOR, nigdy
 * „drobna poprawka”.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot, ARTIFACT } = require('./dom-stub');

const env = boot();

describe('Cisza sieciowa po uruchomieniu');

test('po starcie nie poszło ani jedno fetch', () => {
    eq(env.net.fetches, [], 'lista zapytań fetch');
});

test('po starcie nie powstał ani jeden obrazek (Keepa)', () => {
    eq(env.net.images, [], 'lista adresów obrazków');
});

test('po starcie nie użyto XMLHttpRequest', () => {
    eq(env.net.xhr, 0);
});

test('moduł cen jest domyślnie wyłączony', () => {
    notOk(env.SH.priceModuleOn(), 'priceModuleOn() musi być false');
    eq(env.SH.store.localTabConfig.priceCard.moduleEnabled, false);
});

test('kursy walut wzięte bez sieci, a przeliczanie działa', () => {
    ok(env.SH.FxRates.offline, 'FxRates.offline musi być true');
    eq(env.SH.FxRates.toEur(10, 'EUR'), 10);
    // 1.156 USD za 1 EUR -> 11.56 USD to 10 EUR
    eq(Math.round(env.SH.FxRates.toEur(11.56, 'USD') * 100) / 100, 10);
});

test('FxRates.init() przy wyłączonym module nie dotyka sieci', () => {
    const before = env.net.fetches.length;
    env.SH.FxRates.init();
    eq(env.net.fetches.length, before, 'liczba zapytań nie może wzrosnąć');
});

describe('Cisza w konsoli po uruchomieniu');

test('po starcie nie poszła ani jedna linia do console.log', () => {
    eq(env.net.consoleLog, [], 'console.log');
});

test('po starcie nie poszła ani jedna linia do console.error', () => {
    eq(env.net.consoleError, [], 'console.error');
});

test('logi są domyślnie wyłączone i widać to przez SH.logs()', () => {
    eq(env.SH.logs(), false);
    eq(env.SH.CONFIG.DEBUG_MODE, false);
    ok(/const\s+SCRIPT_LOGS_ENABLED\s*=\s*false/.test(ARTIFACT),
       'stała na górze pliku musi być false');
});

test('praca licznika przy wyłączonych logach nic nie wypisuje', () => {
    const S = env.SH.store;
    S.tabCounters.CRET = (S.tabCounters.CRET || 0) + 1;
    env.SH.StatsWindowRenderer.renderContent();
    env.SH.ValueLog.add('B0915C748N', null, 'CRET');
    env.SH.Routing.startItem('test');
    eq(env.net.consoleLog, [], 'console.log nadal pusty');
    eq(env.net.consoleError, [], 'console.error nadal pusty');
    S.tabCounters.CRET = 0;
});

test('SH.logsOn() włącza wypisywanie, SH.logsOff() wycisza z powrotem', () => {
    env.SH.logsOn();
    eq(env.SH.logs(), true);
    env.SH.Routing.startItem('sprawdzenie logów');
    ok(env.net.consoleLog.length > 0, 'po włączeniu musi coś polecieć do konsoli');
    const afterOn = env.net.consoleLog.length;
    env.SH.logsOff();
    eq(env.SH.logs(), false);
    env.SH.Routing.startItem('znowu cisza');
    // logsOff() sam wypisuje jedną linię potwierdzenia — i to wszystko.
    eq(env.net.consoleLog.length, afterOn + 1, 'po wyłączeniu nic więcej nie leci');
    env.net.consoleLog.length = 0;
    env.net.consoleError.length = 0;
});

test('Utils.fatal wypisuje ZAWSZE, niezależnie od wyłącznika', () => {
    eq(env.SH.logs(), false);
    env.SH.Utils.fatal('awaria testowa');
    eq(env.net.consoleError.length, 1, 'fatal musi przejść mimo wyciszenia');
    ok(env.net.consoleError[0].includes('FATAL'));
    env.net.consoleError.length = 0;
});
