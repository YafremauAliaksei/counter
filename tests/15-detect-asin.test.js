/**
 * 15-detect-asin.test.js — szukanie ASIN na stronie.
 *
 * Rezerwowa ścieżka (gdy na stronie nie ma żadnego linku do produktu) czyta
 * tekst strony. Widoczna karta ceny jest częścią tego tekstu i pokazuje
 * poprzedni przedmiot — bez odjęcia jej ASIN licznik zaciąłby się na nim albo
 * każdy nowy przedmiot wyglądałby na „kilka ASIN naraz”.
 *
 * Karty nie chowa się na czas odczytu: każde schowanie unieważnia układ strony,
 * a skan idzie przy każdej mutacji — drugi pełny odczyt innerText na skan
 * podwajałby najdroższą operację skryptu. Tekst przychodzi z tego samego
 * skanu, który szuka wyzwalaczy.
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

const ASIN_CARD = 'B0FJ6K5H5V';
const ASIN_PAGE = 'B0CK2ZQJZ6';

/** Karta pokazuje `asin`; `display` karty i samego kodu (showAsin). */
function card(asin, display, asinDisplay = 'inline-block') {
    P.asinEl.textContent = asin;
    P.el.style.display = display;
    P.asinEl.style.display = asinDisplay;
}

describe('detectAsin — karta nie podaje sama sobie ASIN');

test('jedyny ASIN w tekście to ASIN widocznej karty — brak ASIN', () => {
    // Strona przeszła dalej, ASIN zniknął z ekranu, a karta wciąż go pokazuje.
    card(ASIN_CARD, 'block');
    eq(P.detectAsin(`karta: ${ASIN_CARD}`), null);
});

test('nowy ASIN na stronie przy starym na karcie — nowy, nie „kilka naraz”', () => {
    card(ASIN_CARD, 'block');
    eq(P.detectAsin(`${ASIN_PAGE} … karta: ${ASIN_CARD}`), ASIN_PAGE);
});

test('ten sam ASIN na stronie i na karcie — zostaje (ten sam przedmiot)', () => {
    // Odejmuje się jedno wystąpienie, a nie wszystkie: pięć jednakowych
    // przedmiotów pod rząd ma dalej swój ASIN.
    card(ASIN_CARD, 'block');
    eq(P.detectAsin(`${ASIN_CARD} … karta: ${ASIN_CARD}`), ASIN_CARD);
});

test('schowana karta nie jest w tekście — nic się nie odejmuje', () => {
    card(ASIN_CARD, 'none');
    eq(P.detectAsin(`${ASIN_CARD}`), ASIN_CARD);
});

test('karta widoczna, ale kod schowany ustawieniem — nic się nie odejmuje', () => {
    // showAsin = false: karta pokazuje cenę bez kodu, więc kodu nie ma w tekście.
    card(ASIN_CARD, 'block', 'none');
    eq(P.detectAsin(`${ASIN_CARD}`), ASIN_CARD);
});

test('karta bez ASIN (napis zastępczy) — nic się nie odejmuje', () => {
    card('brak ASIN', 'block');
    eq(P.detectAsin(`${ASIN_PAGE}`), ASIN_PAGE);
});

test('odczyt nie rusza display karty, także gdy innerText rzuca', () => {
    // Wyjątek z rozbieranego drzewa idzie dalej, a karta zostaje taka, jaka była.
    card(ASIN_CARD, 'block');
    throws(() => zInnerText(() => { throw new Error('drzewo w rozbiórce'); },
                            () => P.detectAsin()),
           'wyjątek ma iść dalej — to nie nasza awaria do przemilczenia', /drzewo w rozbiórce/);
    eq(P.el.style.display, 'block');
});

describe('detectAsin — tekst strony');

test('kilka różnych ASIN — nie zgadujemy', () => {
    // Kolejność w dokumencie nic nie mówi o świeżości: pierwszy bywa najstarszym
    // wpisem dziennika, ostatni — ASIN z cudzego panelu. Oba warianty kłamały.
    card('', 'none');
    eq(zInnerText(`${ASIN_CARD} oraz ${ASIN_PAGE}`, () => P.detectAsin()), null);
});

test('brak ASIN w tekście daje null', () => {
    card('', 'none');
    eq(zInnerText('nic ciekawego', () => P.detectAsin()), null);
    eq(P.detectAsin(''), null, 'pusty tekst ze skanu');
});

test('ten sam ASIN powtórzony to nadal jeden przedmiot', () => {
    card('', 'none');
    ok(zInnerText(`${ASIN_CARD} ... ${ASIN_CARD}`, () => P.detectAsin()) === ASIN_CARD);
});

describe('Jeden odczyt innerText na skan');

test('przy włączonym module cen skan czyta tekst strony raz', () => {
    // innerText liczy układ całej strony — to najdroższa operacja skryptu,
    // a skan idzie przy każdej mutacji strony.
    const pc = env.SH.store.localTabConfig.priceCard;
    pc.moduleEnabled = true;
    pc.logValues = true;
    card(ASIN_CARD, 'block');
    let reads = 0;
    try {
        zInnerText(() => { reads++; return `${ASIN_PAGE}`; }, () => env.SH.AutoTrigger.scan());
        eq(reads, 1, 'odczytów innerText');
        eq(P.shownAsin, ASIN_PAGE, 'karta dostała ASIN z tego samego odczytu');
    } finally {
        pc.moduleEnabled = false;
        pc.logValues = false;
    }
});
