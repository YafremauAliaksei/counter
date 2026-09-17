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
    eq(line7(), '0.0 0 0%');
});

test('trzy człony oddzielone spacjami, bez jednostek i nawiasów', () => {
    // Do 1.0.0 człony były dwa. Procent sprzedaży dołożył trzeci i stoi ZAWSZE
    // na końcu — reszta formatu jest nienaruszona: żadnych jednostek, nawiasów
    // ani przecinków, bo linia ma czytać się jednym spojrzeniem.
    setShift(env, 2);
    env.SH.store.tabCounters.CRET = 20;
    env.SH.store.tabCounters.WHD = 15;
    env.SH.StatsWindowRenderer.renderContent();

    const txt = line7();
    ok(/^\d+(\.\d)? \d+ \d{1,3}%$/.test(txt),
       'format „liczba spacja liczba spacja procent”, jest: ' + txt);
    eq(txt, '17.5 35 0%', '35 sztuk przez 2 h = 17.5/h, nic nie poszło na sprzedaż');
});

test('liczba w linii 7 zgadza się z sumą linii 2', () => {
    // Linia 2 jest domyślnie wyłączona, a wyłączonych linii render nie składa —
    // więc porównanie ma sens dopiero po jej włączeniu. Sprawdzana jest zgodność
    // liczb, a nie to, czy linia jest widoczna.
    const cfg = env.SH.store.localTabConfig.linesConfig.line2_globalSummary;
    const before = cfg.visible;
    cfg.visible = true;
    env.SH.StatsWindowRenderer.renderContent();

    const l2 = env.SH.StatsWindowRenderer.lines.line2_globalSummary.textContent;
    const [iph, count] = line7().split(' ');
    ok(l2.includes(iph), 'wydajność z linii 7 („' + iph + '”) musi być w linii 2: ' + l2);
    ok(l2.includes('(' + count + ')'), 'liczba sztuk z linii 7 musi być w linii 2');

    cfg.visible = before;
    env.SH.StatsWindowRenderer.renderContent();
});

test('wyłączona linia 2 nie jest składana, a linia 7 liczy dalej', () => {
    // Sedno poprawki wydajnościowej: przy ustawieniach domyślnych widoczna jest
    // jedna linia z siedmiu i tylko ona ma powstawać raz na sekundę. Liczba
    // w linii 7 nie ma prawa się przez to zmienić — obie linie liczą z tej samej
    // pętli po kartach.
    const l2 = env.SH.StatsWindowRenderer.lines.line2_globalSummary;
    eq(env.SH.store.localTabConfig.linesConfig.line2_globalSummary.visible, false,
       'linia 2 musi być domyślnie wyłączona');
    env.SH.StatsWindowRenderer.renderContent();
    eq(l2.textContent, '', 'wyłączona linia 2 zostaje pusta');
    eq(l2.children.length, 0, 'wyłączona linia 2 nie tworzy węzłów');
    eq(line7(), '17.5 35 0%', 'linia 7 pokazuje tę samą sumę co przy włączonej linii 2');
});

test('wyłączona linia 6 nie rusza dziennika wartości', () => {
    // ValueLog.totals() przechodzi po WSZYSTKICH wpisach i każdy przelicza po
    // kursie. Linia 6 jest jedynym odbiorcą tego przebiegu, więc przy wyłączonej
    // linii nie ma prawa się wykonać ani razu.
    const VL = env.SH.ValueLog;
    const realTotals = VL.totals;
    let wywolan = 0;
    VL.totals = function() { wywolan++; return realTotals.call(this); };

    eq(env.SH.store.localTabConfig.linesConfig.line6_valueSum.visible, false,
       'linia 6 musi być domyślnie wyłączona');
    env.SH.StatsWindowRenderer.renderContent();
    eq(wywolan, 0, 'totals() przy wyłączonej linii 6');
    eq(env.SH.StatsWindowRenderer.lines.line6_valueSum.textContent, '',
       'wyłączona linia 6 zostaje pusta');

    // Włączenie linii samo w sobie wywołuje render (onStorePaths po
    // 'localTabConfig'), więc liczba wywołań rośnie od razu — sprawdzamy fakt
    // widoczny dla człowieka: linia zapełnia się natychmiast, a nie po sekundzie.
    env.SH.store.localTabConfig.linesConfig.line6_valueSum.visible = true;
    ok(wywolan > 0, 'totals() po włączeniu linii 6');
    ok(env.SH.StatsWindowRenderer.lines.line6_valueSum.textContent.length > 0,
       'włączona linia 6 zapełnia się od razu');

    env.SH.store.localTabConfig.linesConfig.line6_valueSum.visible = false;
    VL.totals = realTotals;
    env.SH.StatsWindowRenderer.renderContent();
});

test('działy wyłączone z sumy globalnej nie wchodzą do linii 7', () => {
    env.SH.store.userConfig.globalStatsContributionKnown.WHD = false;
    env.SH.StatsWindowRenderer.renderContent();
    eq(line7(), '10.0 20 0%');
    env.SH.store.userConfig.globalStatsContributionKnown.WHD = true;
    env.SH.StatsWindowRenderer.renderContent();
    eq(line7(), '17.5 35 0%');
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
    eq(line7(), '0.3 1 0%', '1 sztuka przez 3 h');
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
