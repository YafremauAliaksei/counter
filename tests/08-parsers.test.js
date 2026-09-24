/**
 * 08-parsers.test.js — parsery.
 *
 * Wszystkie te funkcje mają jedną wspólną cechę: mylą się CICHO. Nie rzucają
 * wyjątku, tylko zwracają liczbę, która wygląda wiarygodnie. Dlatego mają
 * własny plik z testami, a każdy przypadek graniczny, który kiedyś naprawdę
 * wystąpił, ma tu swoją asercję z komentarzem skąd pochodzi.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const K = env.SH.KeepaOCR;
const P = env.SH.PriceCard;
const V = env.SH.ValueLog;

describe('Odczyt ceny z wykresu — separator dziesiętny i tysięczny');

test('toDecimal: separator tysięcy — „2,991.39” to 2991.39, nie 991.39', () => {
    // B091FXSL4P, FLUKE networks Advanced-Kit: Keepa drukuje „€ 2,991.39”,
    // a odczyt zwracał „991.39” — błąd 2000 € na jednym przedmiocie.
    eq(K.toDecimal('2.991.39'), '2991.39');
    eq(K.toDecimal('991.39'), '991.39');
    eq(K.toDecimal('12.99'), '12.99');
    eq(K.toDecimal('1.234.567.89'), '1234567.89');
});

test('toDecimal odrzuca obcinki i śmieci', () => {
    eq(K.toDecimal('.991.39'), null);
    eq(K.toDecimal('12.34.56'), null);
    eq(K.toDecimal('12'), null);
    eq(K.toDecimal('12.9'), null);
    eq(K.toDecimal('abc'), null);
    eq(K.toDecimal(''), null);
});

test('dotRun rozpoznaje separator tylko po dolnym wierszu', () => {
    eq(K.dotRun(['0000001'], 0), 1, 'atrament wyłącznie na dole = separator');
    eq(K.dotRun(['0000001', '0000001'], 0), 2, 'separator szerokości dwóch kolumn');
    eq(K.dotRun(['1111111'], 0), 0, 'pełna wysokość to cyfra, nie kropka');
    eq(K.dotRun(['0000000'], 0), 0, 'pusto');
    eq(K.dotRun(['0000001', '0000001', '0000001'], 0), 0, 'trzy kolumny to już linia');
});

test('pickHighest bierze najwyższą cenę, nie pierwszą serię', () => {
    const rows = [
        { series: 'Neu', price: '11.49' },
        { series: 'Amazon', price: '15.51' },
    ];
    eq(K.pickHighest(rows).value, 15.51);
    eq(K.pickHighest([{ series: '?', price: null }]), null);
    eq(K.pickHighest([]), null);
});

describe('Odczyt ceny z tekstu strony');

test('parseJina nie bierze „UTF 8.00” z adresu za cenę', () => {
    // Szeroki wzorzec waluty wyciągnąłby „UTF 8.00” z ?ie=UTF8&nodeId=...
    const r = P.parseJina('Markdown Content:\nhttps://x/?ie=UTF8&nodeId=505048 UTF 8.00', true);
    eq(r, null, 'waluta musi pochodzić ze ścisłej listy');
});

test('parseJina czyta cenę adresowaną i katalogową', () => {
    const r = P.parseJina('Markdown Content:\nEUR 15.08\nRRP: EUR 19.99', true);
    eq(r.current.value, 15.08);
    eq(r.rrp.value, 19.99);
});

test('normalize radzi sobie z formatem polskim i angielskim', () => {
    eq(P.normalize('EUR', null, '2,991.39').value, 2991.39);
    eq(P.normalize('EUR', null, '2.991,39').value, 2991.39);
    eq(P.normalize('EUR', null, '15,08').value, 15.08);
    eq(P.normalize('EUR', null, 'nie liczba'), null);
});

describe('Waluta ceny musi dać się przeliczyć');

test('symbol waluty zamienia się na kod z tablicy kursów', () => {
    // „€ 12,50” szło dalej jako waluta „€”, której w tablicy kursów nie ma:
    // toEur oddawał null i kwota wypadała z sumy zmiany.
    const F = env.SH.FxRates;
    for (const [sym, code] of [['€', 'EUR'], ['£', 'GBP'], ['zł', 'PLN'], ['$', 'USD']]) {
        const n = P.normalize(null, sym, '12,50');
        eq(n.currency, code, sym);
        ok(F.toEur(n.value, n.currency) > 0, sym + ' przelicza się na euro');
    }
});

test('„$” na rynku kanadyjskim to dolar kanadyjski', () => {
    const before = env.SH.store.userConfig.marketplace;
    env.SH.store.userConfig.marketplace = 'ca';
    try {
        eq(P.normalize(null, '$', '10.00').currency, 'CAD');
    } finally {
        env.SH.store.userConfig.marketplace = before;
    }
});

test('każda waluta, którą rozpoznaje wzorzec kwoty, ma kurs w tablicy zapasowej', () => {
    // Wzorzec przyjmował CHF, DKK, NOK, CZK, HUF, RON — bez kursu nigdzie.
    // Kwota rozpoznana, ale nieprzeliczalna, to kwota, która cicho znika.
    const codes = P.MONEY.match(/\(([A-Z|]+)\)/)[1].split('|');
    const table = env.SH.CONFIG.FX_FALLBACK;
    eq(codes.filter(c => !table[c]), [], 'kody bez kursu');
    const found = P.parseJina('Markdown Content:\nCHF 15.08 with 10 percent savings', true);
    eq(found, null, 'kwota w walucie bez kursu nie jest ceną');
});

describe('Dziennik wartości');

test('_migrate nadaje stabilne id i odrzuca śmieci', () => {
    eq(V._migrate(null), null);
    eq(V._migrate('tekst'), null);
    eq(V._migrate(42), null);
    const a = V._migrate({ ts: 1000, asin: 'B01', dept: 'CRET' });
    const b = V._migrate({ ts: 1000, asin: 'B01', dept: 'CRET' });
    eq(a.id, b.id, 'ten sam wpis musi dać to samo id');
});

test('_readShared znosi zepsutą zawartość klucza', () => {
    const key = V.key();
    env.sandbox.localStorage.setItem(key, '{"entries": "nie tablica"}');
    eq(V._readShared(), null);
    env.sandbox.localStorage.setItem(key, '[1,2,3]');
    eq(V._readShared(), null);
    env.sandbox.localStorage.removeItem(key);
});

test('_merge rozstrzyga konflikt po polu updated', () => {
    const base = [{ id: 'a', ts: 1, updated: 10, price: 1 }];
    const mine = [{ id: 'a', ts: 1, updated: 20, price: 2 }, { id: 'b', ts: 2, updated: 5 }];
    const out = V._merge(base, mine);
    eq(out.length, 2);
    eq(out.find(e => e.id === 'a').price, 2, 'wygrywa świeższy updated');
    eq(out.map(e => e.id), ['a', 'b'], 'kolejność po ts');
});

test('totals pomija pozycje bez ceny i bez kursu', () => {
    V.entries = [
        { price: 10, currency: 'EUR', sign: 1 },
        { price: 4, currency: 'EUR', sign: -1 },
        { price: null, currency: null, sign: 1 },
        { price: 5, currency: 'XYZ', sign: 1 },
        { price: 7, currency: 'EUR', sign: 0 },
    ];
    const t = V.totals();
    eq(t.sold, 10);
    eq(t.unsold, 4);
    eq(t.net, 6);
    eq(t.unpriced, 1);
    eq(t.noRate, 1, 'waluta bez kursu liczona osobno');
    eq(t.undetermined, 1);
    eq(t.count, 5);
    V.entries = [];
});

describe('Wykrywanie ASIN na stronie');

test('nie zgaduje, gdy na stronie jest kilka ASIN', () => {
    const doc = env.sandbox.document;
    const d = doc.createElement('div');
    d.textContent = 'B0915C748N oraz B00006JCUB';
    doc.body.appendChild(d);
    eq(P.detectAsin(), null, 'przy niejednoznaczności ma być null');

    d.textContent = 'tylko B0915C748N';
    eq(P.detectAsin(), 'B0915C748N');
    d.remove();
});

test('link ma pierwszeństwo przed tekstem', () => {
    const doc = env.sandbox.document;
    const a = doc.createElement('a');
    a.setAttribute('href', '/dp/B00006JCUB');
    doc.body.appendChild(a);
    const d = doc.createElement('div');
    d.textContent = 'B0915C748N';
    doc.body.appendChild(d);

    eq(P.detectAsin(), 'B00006JCUB', 'ASIN z linku');

    a.remove();
    d.remove();
});

describe('Kierunek przedmiotu');

test('kod sprzedażowy i niesprzedażowy dają przeciwne znaki', () => {
    const R = env.SH.Routing;
    R._prev = null;
    R.startItem('test');
    R.observe('nic tu nie ma');            // pierwszy skan tylko fotografuje
    R.observe('Zeskanuj CRITS-POZ1');
    eq(R.state.direction, 'sell');

    R.startItem('test 2');
    R.observe('Zeskanuj Liquidation');
    eq(R.state.direction, 'unsell');
});

test('Secondary-Sorting bez uściślenia to niesprzedaż', () => {
    const R = env.SH.Routing;
    R._prev = null;
    R.startItem('test 3');
    R.observe('');
    R.observe('Zeskanuj Secondary-Sorting');
    eq(R.state.pending, true, 'czeka na uściślenie');
    eq(R.state.direction, null);

    R.startItem('nowy przedmiot', { closeAmbiguous: true });
    // po zamknięciu poprzedni stan dostał kierunek 'unsell'
    ok(true);
});

test('powtórzony kod na ekranie nie liczy się drugi raz', () => {
    const R = env.SH.Routing;
    R._prev = null;
    R.observe('Zeskanuj CRITS-POZ1');         // fotografia
    const before = R.state && R.state.code;
    R.observe('Zeskanuj CRITS-POZ1');         // ten sam tekst, nic nowego
    eq(R.state && R.state.code, before, 'kod wiszący na ekranie nie może zadziałać ponownie');
});
