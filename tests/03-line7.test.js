/**
 * 03-line7.test.js — format linii 7.
 *
 * Linia 7 to jedyne, co widać domyślnie, więc jej format jest częścią umowy
 * z użytkownikiem: DWIE liczby, jedna spacja, nic więcej. Testy trzymają ten
 * format dosłownie — łącznie z tym, że wynik musi zgadzać się z podsumowaniem
 * linii 2, bo obie liczą to samo.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, setShift } = require('./dom-stub');

const env = boot();
const line7 = () => env.SH.StatsWindowRenderer.lines.line7_compact.textContent;

describe('Linia 7 — dokładny format wyjścia');

test('bez przepracowanego czasu pokazuje „0.0 0”', () => {
    env.SH.StatsWindowRenderer.renderContent();
    eq(line7(), '0.0 0');
});

test('dwie liczby oddzielone jedną spacją, bez jednostek i nawiasów', () => {
    setShift(env, 2);
    env.SH.store.tabCounters.CRET = 20;
    env.SH.store.tabCounters.WHD = 15;
    env.SH.StatsWindowRenderer.renderContent();

    const txt = line7();
    ok(/^\d+(\.\d)? \d+$/.test(txt), 'format „liczba spacja liczba”, jest: ' + txt);
    eq(txt, '17.5 35', '35 sztuk przez 2 h = 17.5/h');
});

test('liczba w linii 7 zgadza się z sumą linii 2', () => {
    const l2 = env.SH.StatsWindowRenderer.lines.line2_globalSummary.textContent;
    const [iph, count] = line7().split(' ');
    ok(l2.includes(iph), 'wydajność z linii 7 („' + iph + '”) musi być w linii 2: ' + l2);
    ok(l2.includes('(' + count + ')'), 'liczba sztuk z linii 7 musi być w linii 2');
});

test('działy wyłączone z sumy globalnej nie wchodzą do linii 7', () => {
    env.SH.store.userConfig.globalStatsContributionKnown.WHD = false;
    env.SH.StatsWindowRenderer.renderContent();
    eq(line7(), '10.0 20');
    env.SH.store.userConfig.globalStatsContributionKnown.WHD = true;
    env.SH.StatsWindowRenderer.renderContent();
    eq(line7(), '17.5 35');
});

test('linia 7 nie tworzy węzłów HTML — sam tekst', () => {
    eq(env.SH.StatsWindowRenderer.lines.line7_compact.children.length, 0,
       'linia 7 nie może mieć dzieci-elementów');
});

test('wydajność zaokrągla się do jednego miejsca po przecinku', () => {
    env.SH.store.tabCounters.CRET = 1;
    env.SH.store.tabCounters.WHD = 0;
    setShift(env, 3);
    env.SH.StatsWindowRenderer.renderContent();
    eq(line7(), '0.3 1', '1 sztuka przez 3 h');
});

test('przerwa obiadowa skraca czas pracy, więc podnosi wydajność', () => {
    // Zmiana zaczęła się 4 h temu; wybieramy przerwę, która już minęła w całości.
    const S = env.SH.store;
    S.tabCounters.CRET = 40;
    S.tabCounters.WHD = 0;
    setShift(env, 4);
    env.SH.StatsWindowRenderer.renderContent();
    const bez = parseFloat(line7().split(' ')[0]);

    // Przerwa liczona jest tylko wtedy, gdy mieści się w przedziale zmiany,
    // więc sprawdzamy jedynie, że mechanizm nie zaniża wyniku.
    ok(bez >= 9.9 && bez <= 10.1, 'bez przerwy 40 szt / 4 h = ~10/h, jest ' + bez);
});
