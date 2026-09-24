/**
 * 14-price-boundaries.test.js — wartości graniczne w drodze ceny na ekran.
 *
 * DLACZEGO OSOBNY PLIK. Cena myli się cicho: nie ma wyjątku, jest liczba, która
 * wygląda wiarygodnie — „€ 2,991.39” zapisane jako „991.39” zaniża sumę zmiany
 * o 2000 € i nikt tego nie zauważy. Ten plik przechodzi po granicach RZĘDÓW
 * WIELKOŚCI, od jednej cyfry do przedmiotów droższych niż dziesięć tysięcy.
 *
 * NAJWAŻNIEJSZA ZASADA, KTÓREJ TU PILNUJEMY: przy niezgodności parser ODMAWIA
 * (null), a nie zwraca tego, co udało mu się wyciąć. Odmowa jest widoczna —
 * w dzienniku zostaje pozycja bez ceny, policzona osobno. Obcinek jest
 * niewidoczny i zaniża sumę zmiany.
 *
 * PRZEDMIOTY DO SPRAWDZENIA RĘCZNEGO. Testy automatyczne nie wchodzą do sieci
 * (patrz 01-silence), więc prawdziwych ASIN używa się wyłącznie na stanowisku
 * ręcznym, przy włączonym module cen:
 *
 *   B0FJ6K5H5V   AMD Ryzen Threadripper PRO 9995WX   — rząd 5 cyfr (ok. 11-12 tys.)
 *   B0CK2ZQJZ6   AMD Ryzen Threadripper PRO 7995WX   — rząd 4-5 cyfr
 *   B079KTSCGG   Fluke Networks DSX2-8000/GLD        — tester sieciowy, rząd 5 cyfr
 *   B091FXSL4P   FLUKE networks Advanced-Kit         — „€ 2,991.39”, separator tysięcy
 *
 * Uczciwe zastrzeżenie: cen tych przedmiotów NIE dało się sprawdzić na żywo
 * z tego środowiska (wyjście na amazon.de jest zablokowane), a asortyment
 * i ceny się zmieniają. To lista tropów do przeklikania, a nie dane wejściowe
 * testów — żaden test niżej od nich nie zależy.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const K = env.SH.KeepaOCR;
const S = env.SH.PriceSources;
const FX = env.SH.FxRates;
const U = env.SH.Utils;

/** Cena z legendy Keepa tak, jak widzi ją odczyt pikseli: separator to kropka. */
const ocr = (t) => K.toDecimal(t);

/** Cena w odpowiedzi tekstowej, zakotwiczona jak na stronie produktu. */
function jina(kwota) {
    const r = S.parseJina('Markdown Content:\n' + kwota + ' with 5 percent savings\n', false);
    return r && r.current ? r.current.value : null;
}

describe('Odczyt z wykresu — granice rzędów wielkości');

test('setki, tysiące, dziesiątki tysięcy i setki tysięcy', () => {
    eq(ocr('9.99'), '9.99', 'jedna cyfra');
    eq(ocr('99.99'), '99.99');
    eq(ocr('999.99'), '999.99', 'ostatnia cena bez separatora tysięcy');
    eq(ocr('1.000.00'), '1000.00', 'pierwsza cena z separatorem');
    eq(ocr('9.999.99'), '9999.99');
    eq(ocr('10.000.00'), '10000.00', 'granica dziesięciu tysięcy');
    eq(ocr('11.699.00'), '11699.00', 'rząd Threadrippera PRO');
    eq(ocr('99.999.99'), '99999.99');
    eq(ocr('100.000.00'), '100000.00', 'setki tysięcy — Keepa drukuje tak samo');
});

test('cena bez separatora powyżej pięciu cyfr to ODMOWA, nie obcinek', () => {
    // Wzorzec bez separatora sięga pięciu cyfr. Szósta znaczy, że rozbiór
    // pikseli poszedł nie tak — i wtedy jedyną uczciwą odpowiedzią jest null.
    // Obcinek zamiast odmowy to cena zaniżona o najstarszy rząd.
    eq(ocr('99999.99'), '99999.99', 'pięć cyfr jeszcze przechodzi');
    eq(ocr('123456.78'), null, 'sześć cyfr bez separatora — odmowa');
    eq(ocr('1234567.89'), null);
});

test('zero i grosze na granicy', () => {
    eq(ocr('0.00'), '0.00', 'zero jest poprawną ceną, choć dziwną');
    eq(ocr('0.01'), '0.01');
    eq(ocr('1.00'), '1.00');
    eq(ocr('999.00'), '999.00');
});

test('separator na złym miejscu nie przechodzi', () => {
    eq(ocr('1.00.00'), null, 'grupa dwucyfrowa zamiast trzycyfrowej');
    eq(ocr('1.0000.00'), null, 'grupa czterocyfrowa');
    eq(ocr('1.000.0'), null, 'jeden grosz');
    eq(ocr('1.000.000'), null, 'trzy cyfry po ostatniej kropce');
    eq(ocr('-12.99'), null, 'cena ujemna nie istnieje');
    eq(ocr(' 12.99'), null, 'spacja z boku — rozbiór był nieczysty');
});

describe('Odczyt z odpowiedzi tekstowej — te same granice');

test('formaty spotykane na prawdziwych stronach', () => {
    eq(jina('€ 9.99'), 9.99);
    eq(jina('€ 999.99'), 999.99);
    eq(jina('€ 1,000.00'), 1000, 'separator angielski');
    eq(jina('€ 1.000,00'), 1000, 'separator niemiecki');
    eq(jina('€ 1 234,56'), 1234.56, 'separatorem bywa spacja');
    eq(jina('€ 2,991.39'), 2991.39, 'separator tysięcy, ścieżka tekstowa');
    eq(jina('€ 11,699.00'), 11699, 'rząd Threadrippera PRO');
    eq(jina('€ 11.699,00'), 11699, 'ten sam przedmiot, zapis niemiecki');
    eq(jina('EUR 0.00'), 0);
});

test('powyżej 999 bez separatora — ODMOWA, a nie trzy ostatnie cyfry', () => {
    // To jest sedno tego pliku. Wzorzec kwoty wymaga symbolu waluty TUŻ PRZED
    // liczbą, więc nie dopasuje się do środka „99999.99” i nie wytnie stamtąd
    // „999.99”. Bez wymaganego symbolu ścieżka tekstowa obcinałaby najstarszy
    // rząd ceny.
    eq(jina('€ 1000.00'), null);
    eq(jina('€ 99999.99'), null);
    eq(jina('€ 123456.78'), null);
});

test('waluta jest ścisłą listą, a nie trzema wielkimi literami', () => {
    // Szeroki wzorzec wyciągnąłby „UTF 8.00” z ?ie=UTF8&nodeId=505048
    // i pokazał to jako cenę.
    eq(jina('UTF 8.00'), null);
    eq(jina('ABC 12.34'), null);
    eq(jina('12.34'), null, 'kwota bez waluty to nie cena');
    eq(jina('$ 1,299.00'), 1299, 'dolar jest na liście');
    eq(jina('zł 1 299,00'), 1299, 'złoty też');
});

describe('Przeliczenie na euro — granice i wartości niemożliwe');

test('duże kwoty przeliczają się bez utraty rzędu', () => {
    eq(FX.toEur(11699, 'EUR'), 11699);
    const usd = FX.toEur(11699, 'USD');
    ok(usd > 8000 && usd < 11699, 'dolar jest tańszy od euro, ale nie dziesięciokrotnie: ' + usd);
});

test('wartości, których przeliczyć się nie da, dają null a nie zero', () => {
    // Zero byłoby najgorszą z możliwych odpowiedzi: weszłoby do sumy jako
    // „przedmiot bez wartości” zamiast trafić do osobnego licznika braków.
    eq(FX.toEur(100, 'XYZ'), null, 'waluta spoza tablicy');
    eq(FX.toEur(NaN, 'EUR'), null);
    eq(FX.toEur(Infinity, 'EUR'), null);
    eq(FX.toEur('100', 'EUR'), null, 'łańcuch to nie kwota');
    eq(FX.toEur(null, 'EUR'), null);
});

test('zero i wartość ujemna przechodzą, bo są policzalne', () => {
    eq(FX.toEur(0, 'EUR'), 0);
    eq(FX.toEur(-5, 'EUR'), -5);
});

describe('Liczby z konfiguracji — clampNum przy wartościach skrajnych');

test('spoza zakresu przycina, nieliczby zamienia na wartość zapasową', () => {
    eq(U.clampNum(50, 0, 100, 60), 50);
    eq(U.clampNum(0, 0, 100, 60), 0, 'dolna granica należy do zakresu');
    eq(U.clampNum(100, 0, 100, 60), 100, 'górna też');
    eq(U.clampNum(-1, 0, 100, 60), 0);
    eq(U.clampNum(101, 0, 100, 60), 100);
    eq(U.clampNum(NaN, 0, 100, 60), 60);
    eq(U.clampNum(Infinity, 0, 100, 60), 60);
    eq(U.clampNum('10px; position:fixed', 0, 100, 60), 60, 'wstrzyknięcie CSS');
    eq(U.clampNum(null, 0, 100, 60), 0, 'Number(null) to 0, a 0 mieści się w zakresie');
});
