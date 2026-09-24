/**
 * 17-sales-rate.test.js — procent sprzedaży w liniach 1, 2 i 7.
 *
 * CO TO ZA LICZBA. Ile ze zrobionych przedmiotów pojechało na sprzedaż. Zawsze
 * od 0 do 100, zawsze na samym końcu linii. Mianownikiem jest LICZNIK
 * PRZEDMIOTÓW, a nie suma sprzedanych i niesprzedanych — dzięki temu przedmiot
 * o nieustalonym kierunku obniża procent, zamiast po cichu znikać z rachunku,
 * a trzy niesprzedaże na początku zmiany dają uczciwe 0%.
 *
 * NAJWAŻNIEJSZE, CZEGO TU PILNUJEMY: procent liczy się przy WYŁĄCZONYM module
 * cen. Kierunek ustala się z samego tekstu strony, więc sieci nie potrzebuje.
 * Gdyby `Routing.onCompleted()` zależało od wpisu dziennika (który powstaje
 * tylko z modułem cen), procent stałby na zero przez całą zmianę i nikt by
 * tego nie zauważył, bo zero jest poprawną wartością.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, setShift } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const U = SH.Utils;

describe('percentFloor — część ułamkowa jest ODRZUCANA, nie zaokrąglana');

test('przykład ze stanowiska: 1 z 17 to 5%, a nie 6%', () => {
    // 1/17 = 5,8823...% — zaokrąglenie dałoby 6% i obiecywało więcej,
    // niż zrobiono.
    eq(U.percentFloor(1, 17), 5);
    eq(U.percentFloor(2, 3), 66, '66,66% -> 66, nie 67');
    eq(U.percentFloor(1, 3), 33);
});

test('mnożenie przed dzieleniem — inaczej wychodzi liczba o jeden za mała', () => {
    // (29/100)*100 daje w arytmetyce zmiennoprzecinkowej 28.999999999999996,
    // więc odrzucenie części ułamkowej dałoby 28%. To nie jest teoria: ta sama
    // pułapka siedzi w 57/100 (56.99999999999999).
    eq(U.percentFloor(29, 100), 29);
    eq(U.percentFloor(57, 100), 57);
    eq(U.percentFloor(83, 100), 83, 'kontrola: wartość, która i tak wychodziła dobrze');
});

test('granice zakresu', () => {
    eq(U.percentFloor(0, 0), 0, 'początek zmiany: nic nie zrobiono');
    eq(U.percentFloor(0, 17), 0, 'same niesprzedaże to uczciwe 0%');
    eq(U.percentFloor(1, 1), 100);
    eq(U.percentFloor(17, 17), 100);
    eq(U.percentFloor(1, 2), 50);
    eq(U.percentFloor(1, 200), 0, 'mniej niż jeden procent to zero, nie „prawie 1”');
});

test('dane niespójne nie dają liczby spoza zakresu', () => {
    // Licznik da się poprawić ręcznie w dół, licznik sprzedanych nie — więc
    // sprzedanych może być WIĘCEJ niż zrobionych. Bez ograniczenia zobaczylibyśmy
    // 150%.
    eq(U.percentFloor(18, 17), 100);
    eq(U.percentFloor(-1, 17), 0);
    eq(U.percentFloor(5, 0), 0, 'dzielenie przez zero');
    eq(U.percentFloor(5, -3), 0);
    eq(U.percentFloor(NaN, 17), 0);
    eq(U.percentFloor(5, NaN), 0);
    // Nieskończoność w liczniku to nie „sto procent”, tylko zepsuta wartość,
    // a przy zepsutej wartości uczciwszą odpowiedzią jest zero: procent
    // sprzedaży nie ma prawa obiecywać wyniku, którego nikt nie zrobił.
    eq(U.percentFloor(Infinity, 17), 0);
    eq(U.percentFloor(5, Infinity), 0);
    eq(U.percentFloor(null, null), 0);
    eq(U.percentFloor('1', '17'), 5, 'liczba w łańcuchu — z localStorage przychodzi tak');
});

describe('Zliczanie kierunku działa przy WYŁĄCZONYM module cen');

/** Jeden pełny przedmiot: początek, kod sortowania, wyzwalacz końcowy. */
function przedmiot(kod) {
    const body = env.sandbox.document.body;
    const ustaw = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        SH.AutoTrigger.scan();
    };
    ustaw('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
    ustaw(kod ? `Zeskanuj ${kod}\nPrzypisz nowy` : 'Przypisz nowy');
    ustaw('');   // ekran się czyści, wyzwalacz znika
}

test('moduł cen jest wyłączony, a dziennik wartości pusty', () => {
    // Warunek wstępny całej grupy: gdyby moduł był włączony, test nie
    // sprawdzałby tego, po co powstał.
    ok(!SH.priceModuleOn(), 'moduł cen musi być wyłączony');
    // Pierwszy skan tylko fotografuje stronę — robimy go przed pomiarami.
    SH.AutoTrigger.scan();
});

test('przedmiot na sprzedaż podnosi licznik sprzedanych', () => {
    const cid = SH.store.currentTabInstanceId;
    SH.store.tabCounters[cid] = 0;
    SH.store.tabSold[cid] = 0;

    przedmiot('CRITS-PRG2');

    eq(SH.store.tabCounters[cid], 1, 'licznik przedmiotów');
    eq(SH.store.tabSold[cid], 1, 'licznik sprzedanych');
    eq(SH.ValueLog.entries.length, 0, 'dziennik wartości pozostaje pusty');
});

test('przedmiot na niesprzedaż liczy się tylko do mianownika', () => {
    const cid = SH.store.currentTabInstanceId;
    przedmiot('WHD');
    eq(SH.store.tabCounters[cid], 2);
    eq(SH.store.tabSold[cid], 1, 'sprzedanych nie przybyło');
});

test('przedmiot bez kodu sortowania też tylko do mianownika', () => {
    const cid = SH.store.currentTabInstanceId;
    przedmiot(null);
    eq(SH.store.tabCounters[cid], 3);
    eq(SH.store.tabSold[cid], 1, 'nieustalony kierunek nie jest sprzedażą');
});

test('ten sam przedmiot nie policzy się dwa razy', () => {
    // applyTo() wywołuje się po KAŻDYM z dwóch niezależnych zdarzeń —
    // zaliczeniu przez licznik i ustaleniu kierunku. Bez znacznika `counted`
    // przedmiot trafiłby do licznika sprzedanych dwukrotnie.
    const cid = SH.store.currentTabInstanceId;
    const przed = SH.store.tabSold[cid];
    SH.Routing.apply();
    SH.Routing.apply();
    eq(SH.store.tabSold[cid], przed);
});

test('licznik sprzedanych trafił do magazynu, więc przeżyje F5', () => {
    const cid = SH.store.currentTabInstanceId;
    const klucz = SH.StorageManager.getKey(SH.CONFIG.STORAGE_PREFIX_TAB_SOLD + cid);
    eq(env.sandbox.localStorage.getItem(klucz), String(SH.store.tabSold[cid]));
});

test('sieć nadal nietknięta — kierunek czyta się z tekstu strony', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
});

describe('Procent na ekranie');

test('linia 7 kończy się procentem liczonym po wszystkich kartach', () => {
    const S = SH.store;
    setShift(env, 2);
    S.tabCounters.CRET = 20; S.tabSold.CRET = 3;
    S.tabCounters.WHD = 15;  S.tabSold.WHD = 2;
    SH.StatsWindowRenderer.renderContent();
    // 5 z 35 = 14,28% -> 14%
    eq(SH.StatsWindowRenderer.lines.line7_compact.textContent, '17.5 35 14%');
});

test('linia 1 pokazuje procent BIEŻĄCEJ karty, a nie sumy', () => {
    const S = SH.store;
    S.localTabConfig.linesConfig.line1_currentTab.visible = true;
    SH.StatsWindowRenderer.renderContent();
    const txt = SH.StatsWindowRenderer.lines.line1_currentTab.textContent;
    // Bieżąca karta to CRET: 3 z 20 = 15%.
    ok(/ 15%$/.test(txt), 'linia 1 ma kończyć się na 15%, jest: ' + txt);
    S.localTabConfig.linesConfig.line1_currentTab.visible = false;
});

test('linia 2 kończy się tym samym procentem, co linia 7', () => {
    const S = SH.store;
    S.localTabConfig.linesConfig.line2_globalSummary.visible = true;
    SH.StatsWindowRenderer.renderContent();
    const l2 = SH.StatsWindowRenderer.lines.line2_globalSummary.textContent;
    const l7 = SH.StatsWindowRenderer.lines.line7_compact.textContent;
    ok(/ 14%$/.test(l2), 'linia 2 ma kończyć się na 14%, jest: ' + l2);
    ok(l7.endsWith(' 14%'), 'i ma to być ta sama liczba co w linii 7: ' + l7);
    S.localTabConfig.linesConfig.line2_globalSummary.visible = false;
});

test('dział wyłączony z sumy globalnej nie wchodzi też do procentu', () => {
    const S = SH.store;
    S.userConfig.globalStatsContributionKnown.WHD = false;
    SH.StatsWindowRenderer.renderContent();
    // Zostaje sam CRET: 3 z 20 = 15%.
    eq(SH.StatsWindowRenderer.lines.line7_compact.textContent, '10.0 20 15%');
    S.userConfig.globalStatsContributionKnown.WHD = true;
});

test('zmiana licznika sprzedanych przerysowuje okno od razu', () => {
    // Kod sortowania potrafi przyjść w INNYM skanie niż zaliczenie przedmiotu,
    // więc tabSold zmienia się niezależnie od tabCounters. Bez własnej ścieżki
    // w onStorePaths procent czekałby na takt timera, czyli do sekundy — widać
    // by to było jako liczbę, która nie nadąża za ekranem.
    const S = SH.store;
    S.tabCounters.CRET = 10; S.tabSold.CRET = 1;
    S.tabCounters.WHD = 0;   S.tabSold.WHD = 0;
    SH.StatsWindowRenderer.renderContent();
    eq(SH.StatsWindowRenderer.lines.line7_compact.textContent.split(' ')[2], '10%');

    // Sam zapis do stanu, BEZ jawnego renderContent().
    S.tabSold.CRET = 3;
    eq(SH.StatsWindowRenderer.lines.line7_compact.textContent.split(' ')[2], '30%',
       'okno ma się przerysować samo');
});

test('reset zmiany zeruje procent razem z licznikami', () => {
    const S = SH.store;
    SH.SessionReset.resetItemData('test', 'manual');
    eq(S.tabSold.CRET, 0, 'licznik sprzedanych w pamięci');
    eq(S.tabCounters.CRET, 0, 'licznik przedmiotów w pamięci');
    const klucz = SH.StorageManager.getKey(SH.CONFIG.STORAGE_PREFIX_TAB_SOLD + 'CRET');
    eq(env.sandbox.localStorage.getItem(klucz), null, 'klucz w magazynie usunięty');
    SH.StatsWindowRenderer.renderContent();
    eq(SH.StatsWindowRenderer.lines.line7_compact.textContent, '0.0 0 0%');
});
