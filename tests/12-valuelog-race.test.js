/**
 * 12-valuelog-race.test.js — wyścig dwóch kart o wspólny dziennik wartości.
 *
 * Dziennik jest jeden na wszystkie karty, a localStorage nie daje żadnej
 * atomowości: między odczytem a zapisem sąsiednia karta może wcisnąć swoją
 * wersję tej samej pozycji. Scalanie po `updated` rozstrzyga to poprawnie
 * W PAMIĘCI, ale o tym, czy wynik trafi z powrotem do wspólnego klucza,
 * decydowała sama DŁUGOŚĆ listy — a przy nadpisanej (nie dołożonej) pozycji
 * długość się nie zmienia.
 *
 * Realnie zagrożony był ostatni przedmiot zmiany: przy każdym następnym save()
 * scala i naprawia sam. Czyli błąd wychodził dokładnie na podsumowaniu.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const VL = env.SH.ValueLog;

/** Wpis dziennika w postaci, w jakiej leży w magazynie. */
function wpis(id, updated, sign) {
    return { id, asin: 'B000000001', price: 19.99, currency: 'EUR', dept: 'CRET',
             ts: 1000, sign, route: null, updated };
}

/** Podmienia zawartość wspólnego klucza tak, jakby zapisała ją sąsiednia karta. */
function wspolny(entries) {
    env.sandbox.localStorage.setItem(VL.key(), JSON.stringify({ shiftStart: 1000, entries }));
    delete env.SH.StorageManager._lastWritten[VL.key()];
}

function posprzataj() {
    clearTimeout(VL._writeBackTimer);
    VL._writeBackTimer = null;
    VL.entries = [];
}

describe('_aheadOfShared — czy mamy coś, czego nie ma we wspólnym dzienniku');

test('nowa pozycja u nas: tak', () => {
    ok(VL._aheadOfShared([wpis('a', 5, 1), wpis('b', 5, 1)], [wpis('a', 5, 1)]));
});

test('ta sama zawartość: nie', () => {
    notOk(VL._aheadOfShared([wpis('a', 5, 1)], [wpis('a', 5, 1)]));
});

test('ta sama długość, ale nasza pozycja świeższa: tak', () => {
    ok(VL._aheadOfShared([wpis('a', 9, 1)], [wpis('a', 5, 0)]),
       'to jest przypadek, który gubiło porównanie po długości');
});

test('ta sama długość, nasza pozycja starsza: nie', () => {
    notOk(VL._aheadOfShared([wpis('a', 2, 1)], [wpis('a', 5, 0)]));
});

test('pusty wspólny dziennik przy niepustym naszym: tak', () => {
    ok(VL._aheadOfShared([wpis('a', 1, 0)], []));
});

test('oba puste: nie', () => {
    notOk(VL._aheadOfShared([], []));
});

test('wpisy bez id są pomijane, a nie liczone jako nowość', () => {
    notOk(VL._aheadOfShared([{ updated: 9 }, null], []));
});

describe('adoptRemote planuje dopisanie, gdy nasza wersja jest świeższa');

test('sąsiad nadpisał naszą pozycję starszą wersją — planujemy dopisanie', () => {
    posprzataj();
    // U nas: kierunek już postawiony (sign 1, updated 9).
    VL.entries = [wpis('a', 9, 1)];
    // W magazynie: wersja sprzed postawienia kierunku, ta sama liczba pozycji.
    wspolny([wpis('a', 5, 0)]);

    VL.adoptRemote();

    eq(VL.entries.length, 1, 'liczba pozycji się nie zmienia');
    eq(VL.entries[0].sign, 1, 'w pamięci wygrywa nasza, świeższa wersja');
    ok(VL._writeBackTimer, 'dopisanie do wspólnego klucza musi zostać zaplanowane');
    posprzataj();
});

test('gdy wspólny dziennik jest świeższy, nic nie dopisujemy', () => {
    posprzataj();
    VL.entries = [wpis('a', 2, 0)];
    wspolny([wpis('a', 7, 1)]);

    VL.adoptRemote();

    eq(VL.entries[0].sign, 1, 'wygrywa wersja z magazynu');
    notOk(VL._writeBackTimer, 'nie ma czego dopisywać');
    posprzataj();
});

test('usunięty wspólny klucz to reset zmiany — kasujemy swoją kopię', () => {
    posprzataj();
    VL.entries = [wpis('a', 9, 1)];
    env.sandbox.localStorage.removeItem(VL.key());

    VL.adoptRemote();

    eq(VL.entries, [], 'po resecie u sąsiada nie wskrzeszamy wpisów');
    notOk(VL._writeBackTimer, 'nie ma czego dopisywać po resecie');
    posprzataj();
});
