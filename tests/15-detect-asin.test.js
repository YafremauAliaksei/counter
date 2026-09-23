/**
 * 15-detect-asin.test.js — szukanie ASIN na stronie.
 *
 * Rezerwowa ścieżka (gdy na stronie nie ma żadnego linku do produktu) czyta
 * `document.body.innerText`, a przedtem CHOWA własną kartę: karta pokazuje
 * poprzedni przedmiot, więc bez tego podałaby nam swój własny ASIN i licznik
 * zaciąłby się na nim.
 *
 * Chowanie i przywracanie muszą być nierozłączne. Odczyt potrafi rzucić
 * (rozbierane drzewo, cudzy skrypt), a wtedy karta zostawała schowana NA STAŁE
 * — z zewnątrz wygląda to jak zepsuty skrypt, choć powodem jest jeden wyjątek.
 */

'use strict';

const { describe, test, eq, ok, throws } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const P = env.SH.PriceCard;
const body = env.sandbox.document.body;

/** Podmienia innerText na czas jednego wywołania. */
function zInnerText(wartosc, fn) {
    const opis = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(body), 'innerText');
    Object.defineProperty(body, 'innerText', {
        configurable: true,
        get: typeof wartosc === 'function' ? wartosc : () => wartosc,
    });
    try { return fn(); } finally {
        delete body.innerText;
        if (opis && !Object.getOwnPropertyDescriptor(body, 'innerText')) { /* wraca z prototypu */ }
    }
}

describe('detectAsin — karta wraca na ekran zawsze');

test('po udanym odczycie karta ma z powrotem swoje display', () => {
    P.el.style.display = 'block';
    const asin = zInnerText('gdzieś tu jest B0FJ6K5H5V i nic więcej', () => P.detectAsin());
    eq(asin, 'B0FJ6K5H5V', 'jedyny ASIN w tekście zostaje przyjęty');
    eq(P.el.style.display, 'block', 'karta wróciła na ekran');
});

test('gdy odczyt rzuci wyjątkiem, karta NIE zostaje schowana', () => {
    P.el.style.display = 'block';
    throws(() => zInnerText(() => { throw new Error('drzewo w rozbiórce'); },
                            () => P.detectAsin()),
           'wyjątek ma iść dalej — to nie nasza awaria do przemilczenia', /drzewo w rozbiórce/);
    eq(P.el.style.display, 'block', 'karta musi wrócić mimo wyjątku');
});

test('kilka ASIN w tekście — nie zgadujemy, a karta i tak wraca', () => {
    // Kolejność w dokumencie nic nie mówi o świeżości: pierwszy bywa najstarszym
    // wpisem dziennika, ostatni — ASIN z cudzego panelu. Oba warianty kłamały.
    P.el.style.display = 'block';
    const asin = zInnerText('B0FJ6K5H5V oraz B0CK2ZQJZ6', () => P.detectAsin());
    eq(asin, null, 'przy niejednoznaczności nie zgadujemy');
    eq(P.el.style.display, 'block');
});

test('brak ASIN w tekście daje null', () => {
    eq(zInnerText('nic ciekawego', () => P.detectAsin()), null);
});

test('ten sam ASIN powtórzony to nadal jeden przedmiot', () => {
    ok(zInnerText('B0FJ6K5H5V ... B0FJ6K5H5V', () => P.detectAsin()) === 'B0FJ6K5H5V');
});
