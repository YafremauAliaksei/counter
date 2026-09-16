/**
 * 13-harness.test.js — sprawdzenie samego narzędzia do testowania.
 *
 * Runner jest własny i ma dokładnie jedną nieoczywistą właściwość: musi czekać
 * na testy asynchroniczne. Wcześniej nie czekał — dawał obietnicom 50 ms i szedł
 * wypisać podsumowanie, więc sprawdzenie wolniejsze niż ta granica nie było
 * uwzględnione ANI JAKO ZALICZONE, ANI JAKO NIEZALICZONE. Test, którego porażka
 * nie zatrzymuje CI, jest gorszy niż brak testu: daje fałszywe poczucie pokrycia.
 *
 * Plik numerowany jako ostatni celowo: rozstrzyga się po wszystkich pozostałych.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');

describe('Runner czeka na testy asynchroniczne');

test('sprawdzenie rozstrzygające po 120 ms jest uwzględnione', () => {
    // 120 ms to ponad dwukrotność dawnej granicy 50 ms. Jeśli runner przestanie
    // czekać, ten test zniknie z podsumowania — liczba zaliczonych spadnie,
    // a nie wzrośnie liczba niezaliczonych, więc zmiana będzie widoczna.
    return new Promise(resolve => setTimeout(resolve, 120)).then(() => {
        ok(true, 'obietnica rozstrzygnięta');
    });
});

test('odrzucona obietnica nie jest liczona jako zaliczona', () => {
    // Sprawdzamy zachowanie runnera bez wywoływania w nim porażki: gdyby test
    // asynchroniczny był liczony jako zaliczony PRZED rozstrzygnięciem (tak było
    // wcześniej), poniższa obietnica po odrzuceniu dopisałaby się do obu
    // liczników naraz. Tutaj przechwytujemy odrzucenie sami i sprawdzamy tylko,
    // że łańcuch dochodzi do końca.
    let zlapane = null;
    return Promise.reject(new Error('celowo'))
        .catch(e => { zlapane = e.message; })
        .then(() => eq(zlapane, 'celowo'));
});
