/**
 * 32-display-currency.test.js — waluta wyświetlania.
 *
 * PO CO. Dla części ludzi kwota w funtach albo koronach nie znaczy nic, a
 * decyzję trzeba podjąć od razu. Karta ceny i linia 6 mogą więc pokazywać
 * kwoty w jednej wybranej walucie — euro albo złotych.
 *
 * ZASADA, KTÓREJ TEN PLIK PILNUJE: liczy się ZAWSZE w euro. Dziennik trzyma
 * cenę w walucie sklepu, suma idzie w euro, a waluta wyświetlania to jedno
 * mnożenie przy rysowaniu. Stąd obietnice sprawdzane niżej:
 *   - zmiana waluty w trakcie zmiany nie zmienia ani jednej liczby w euro;
 *   - domyślnie wszystko w euro (decyzja autora, wyjątek od zasady „nowe
 *     domyślnie wyłączone” — CLAUDE.md §3), a „jak w sklepie” pokazuje cenę
 *     dokładnie tak, jak przyszła ze sklepu;
 *   - śmieci w magazynie dają wartość domyślną, a brak kursu — cenę sklepu
 *     i euro; nigdy „NaN zł” albo zero.
 *
 * Kursy są w testach podane wprost, okrągłe, żeby wynik dało się sprawdzić
 * w pamięci: 1 EUR = 4 PLN = 0,8 GBP = 1,25 USD = 10 SEK = 1,5 CAD.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot, makeTabNetwork, makeClock, STAND_TIME } = require('./dom-stub');

const RATES = { EUR: 1, PLN: 4, GBP: 0.8, USD: 1.25, SEK: 10, CAD: 1.5 };
const ASIN = 'B0FJ6K5H5V';

function freshEnv() {
    const env = boot();
    env.SH.FxRates.rates = { ...RATES };
    return env;
}

const env = freshEnv();
const SH = env.SH;
const P = SH.PriceCard;
const F = SH.FxRates;
const L6 = () => SH.StatsWindowRenderer.lines.line6_valueSum;

/** Cena w podanej walucie, tak jak zwraca ją parser (PriceParse.normalize). */
const price = (value, currency) => ({ value, currency, text: `${currency} ${value.toFixed(2)}` });

/** Karta w stanie „cena znaleziona”, przerysowana. */
function showCard(current, extra) {
    SH.store.localTabConfig.priceCard.moduleEnabled = true;
    P.shownAsin = ASIN;
    P.cache.set(ASIN, { status: 'ok', current, rrp: null, source: 'keepa-ocr', ms: 96, ...(extra || {}) });
    P.applyStyle();
    P.render();
    return P.priceEl.textContent;
}

function setCurrency(v) { SH.store.userConfig.displayCurrency = v; }

/** Dziennik z trzech sklepów: +80 GBP (100 €), +50 EUR, −125 USD (100 €). */
function mixedLog() {
    SH.ValueLog.entries = [
        { id: 'a', ts: 1, asin: 'A', price: 80, currency: 'GBP', sign: 1, dept: 'CRET' },
        { id: 'b', ts: 2, asin: 'B', price: 50, currency: 'EUR', sign: 1, dept: 'CRET' },
        { id: 'c', ts: 3, asin: 'C', price: 125, currency: 'USD', sign: -1, dept: 'WHD' },
    ];
}

function line6() {
    SH.StatsWindowRenderer.renderValueSum();
    return L6().textContent;
}

describe('Domyślnie: wszystko w euro');

test('wartość domyślna to euro — decyzja autora', () => {
    eq(SH.DEFAULT_USER_CONFIG.displayCurrency, 'EUR');
    eq(SH.store.userConfig.displayCurrency, 'EUR');
    eq(F.displayCurrency(), 'EUR');
});

test('świeża instalacja: cena z co.uk od razu w euro, cena w euro bez ≈', () => {
    const e = boot();
    e.SH.FxRates.rates = { ...RATES };
    eq(e.SH.FxRates.display(12.5, 'GBP'), '≈ 15.63 €');
    eq(e.SH.FxRates.display(11699, 'EUR'), '11699.00 €');
});

test('stary zapis bez tego pola dostaje euro, a nie walutę sklepu', () => {
    // Zapis sprzed pojawienia się tego pola nie ma displayCurrency —
    // wczytanie uzupełnia brak wartością domyślną.
    const first = boot();
    const saved = JSON.parse(first.sandbox.localStorage.getItem(first.prefix + 'userConfig') || 'null');
    ok(saved, 'userConfig leży w magazynie');
    delete saved.displayCurrency;
    first.sandbox.localStorage.setItem(first.prefix + 'userConfig', JSON.stringify(saved));
    const again = boot({ storage: first.sandbox.localStorage });
    eq(again.SH.FxRates.displayCurrency(), 'EUR');
});

test('linia 6 w euro, ze znakiem €, jak zawsze', () => {
    mixedLog();
    eq(line6(), '+150.00 -100.00 = 50.00 €  3 szt');
});

describe('„Jak w sklepie”: cena tak, jak przyszła ze sklepu');

test('karta pokazuje cenę dokładnie tak, jak przyszła ze sklepu', () => {
    setCurrency('native');
    eq(F.displayCurrency(), null, 'native nie jest walutą, tylko brakiem przeliczania');
    eq(showCard(price(12.5, 'GBP')), 'GBP 12.50');
    eq(showCard(price(11699, 'EUR')), 'EUR 11699.00');
});

test('linia 6 zostaje w euro — bilans z kilku sklepów nie ma „waluty sklepu”', () => {
    setCurrency('native');
    mixedLog();
    eq(line6(), '+150.00 -100.00 = 50.00 €  3 szt');
});

describe('Waluta wybrana: karta');

test('euro: cena w funtach przeliczona i oznaczona ≈', () => {
    setCurrency('EUR');
    eq(showCard(price(12.5, 'GBP')), '≈ 15.63 €', '12,50 / 0,8 = 15,625');
});

test('euro: cena w euro bez ≈ — niczego nie przeliczano', () => {
    setCurrency('EUR');
    eq(showCard(price(11699, 'EUR')), '11699.00 €');
});

test('złote: przejście przez tysiąc nie gubi rzędu', () => {
    setCurrency('PLN');
    eq(showCard(price(999.99, 'EUR')), '≈ 3999.96 zł');
    eq(showCard(price(1000, 'EUR')), '≈ 4000.00 zł');
    eq(showCard(price(2991.39, 'EUR')), '≈ 11965.56 zł');
});

test('zero i jeden grosz', () => {
    setCurrency('PLN');
    eq(showCard(price(0, 'GBP')), '≈ 0.00 zł');
    eq(showCard(price(0.01, 'EUR')), '≈ 0.04 zł');
});

test('każda waluta z listy ma swój znak i działa na kursach wbudowanych', () => {
    const e = boot();          // bez podstawionych kursów: sama tablica z pliku
    for (const cur of Object.keys(e.SH.CONFIG.DISPLAY_CURRENCIES)) {
        e.SH.store.userConfig.displayCurrency = cur;
        const t = e.SH.FxRates.display(10, 'EUR');
        ok(t && t.endsWith(' ' + e.SH.CONFIG.DISPLAY_CURRENCIES[cur]), `${cur}: ${t}`);
        ok(e.SH.CONFIG.FX_FALLBACK[cur] > 0, `${cur} ma kurs wbudowany`);
    }
});

test('cena katalogowa idzie w tej samej walucie co cena', () => {
    setCurrency('PLN');
    SH.store.localTabConfig.priceCard.showRrp = true;
    try {
        showCard(price(10, 'EUR'), { rrp: price(8, 'GBP') });
        ok(P.rrpEl.textContent.endsWith('≈ 40.00 zł'), P.rrpEl.textContent);
    } finally {
        SH.store.localTabConfig.priceCard.showRrp = false;
    }
});

test('wiersz źródła pokazuje cenę ze sklepu, gdy ją przeliczono — i tylko wtedy', () => {
    SH.store.localTabConfig.priceCard.showSource = true;
    try {
        setCurrency('EUR');
        showCard(price(12.5, 'GBP'));
        ok(P.srcEl.textContent.includes('GBP 12.50'), 'oryginał do porównania ze stroną: ' + P.srcEl.textContent);
        showCard(price(12.5, 'EUR'));
        notOk(P.srcEl.textContent.includes('EUR 12.50'), 'bez przeliczenia nie ma czego dublować');
    } finally {
        SH.store.localTabConfig.priceCard.showSource = false;
    }
});

describe('Waluta wybrana: linia 6');

test('złote: suma z trzech sklepów liczona w euro, pokazana w złotych', () => {
    setCurrency('PLN');
    mixedLog();
    eq(line6(), '+600.00 -400.00 = 200.00 zł  3 szt');
    eq(SH.ValueLog.totals().net, 50, 'suma w pamięci dalej w euro');
});

test('bilans ujemny zachowuje znak', () => {
    setCurrency('PLN');
    SH.ValueLog.entries = [{ id: 'x', ts: 1, asin: 'X', price: 10, currency: 'EUR', sign: -1, dept: 'WHD' }];
    eq(line6(), '+0.00 -40.00 = -40.00 zł  1 szt');
});

test('zmiana waluty w środku zmiany nie zmienia ani jednej liczby w euro', () => {
    mixedLog();
    const snapshot = JSON.stringify(SH.ValueLog.entries);
    const totals = [];
    for (const cur of ['PLN', 'EUR', 'GBP', 'native', 'PLN']) {
        setCurrency(cur);
        line6();
        showCard(price(12.5, 'GBP'));
        totals.push(SH.ValueLog.totals().net);
    }
    eq(totals, [50, 50, 50, 50, 50]);
    eq(JSON.stringify(SH.ValueLog.entries), snapshot, 'dziennik trzyma ceny sklepu, nie przeliczone');
});

test('nowa pozycja w innej walucie po przełączeniu dolicza się w euro', () => {
    setCurrency('PLN');
    mixedLog();
    SH.ValueLog.entries.push({ id: 'd', ts: 4, asin: 'D', price: 100, currency: 'SEK', sign: 1, dept: 'CRET' });
    eq(SH.ValueLog.totals().net, 60, '100 SEK = 10 €');
    eq(line6(), '+640.00 -400.00 = 240.00 zł  4 szt');
});

describe('Granice: śmieci w magazynie, brak kursu');

test('spreparowana waluta z localStorage to wartość domyślna — euro', () => {
    mixedLog();
    for (const junk of ['__proto__', 'constructor', 'XYZ', 'eur', 'Native', '', 42, null, undefined, NaN, {}, ['PLN']]) {
        setCurrency(junk);
        eq(F.displayCurrency(), 'EUR', `wartość ${String(junk)}`);
        eq(line6(), '+150.00 -100.00 = 50.00 €  3 szt', `linia 6 przy ${String(junk)}`);
        eq(showCard(price(12.5, 'GBP')), '≈ 15.63 €', `karta przy ${String(junk)}`);
    }
});

test('kursy bez wybranej waluty: karta w walucie sklepu, linia 6 w euro — nigdy NaN', () => {
    // Kursy z sieci przechodzą normalize() z samym USD — brak PLN jest możliwy.
    const saved = F.rates;
    F.rates = { EUR: 1, USD: 1.25, GBP: 0.8 };
    try {
        setCurrency('PLN');
        mixedLog();
        eq(showCard(price(12.5, 'GBP')), 'GBP 12.50');
        eq(line6(), '+150.00 -100.00 = 50.00 €  3 szt');
    } finally {
        F.rates = saved;
    }
});

test('fromEur: NaN, Infinity, null i tekst nie przechodzą', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, '10']) {
        eq(F.fromEur(bad, 'PLN'), null, String(bad));
    }
    eq(F.fromEur(10, 'XYZ'), null, 'nieznana waluta');
    eq(F.fromEur(10, '__proto__'), null, 'klucz prototypu nie jest kursem');
    eq(F.fromEur(10, 'eur'), 10, 'wielkość liter bez znaczenia, jak w toEur');
});

test('display: cena bez wartości liczbowej zostaje taka, jak przyszła', () => {
    setCurrency('PLN');
    eq(F.display(NaN, 'EUR'), null);
    eq(showCard({ value: NaN, currency: 'EUR', text: 'EUR ?' }), 'EUR ?');
});

describe('Kod ustawień i kilka kart');

test('waluta wyświetlania przechodzi przez kod ustawień', () => {
    const source = freshEnv();
    eq(source.SH.configCode(), '0x0101', 'domyślna wartość nie trafia do kodu');
    source.SH.store.userConfig.displayCurrency = 'native';
    ok(source.SH.configCode().includes('030a'), '„jak w sklepie” to odstępstwo od domyślnej, więc jedzie w kodzie');
    source.SH.store.userConfig.displayCurrency = 'PLN';
    const code = source.SH.configCode();
    ok(code.includes('030a'), 'numer 0x030a w kodzie: ' + code);

    const target = freshEnv();
    const report = target.SH.config(code);
    eq(report['kod przyjęty'], true);
    eq(target.SH.store.userConfig.displayCurrency, 'PLN');
});

test('wybór w jednej karcie przeglądarki obowiązuje we wszystkich', () => {
    // Ustawienie jest wspólne, jak sklep: dwie karty w dwóch walutach to
    // dokładnie to zamieszanie, któremu ta opcja ma zapobiec.
    const net = makeTabNetwork();
    const clock = makeClock(STAND_TIME);
    const a = net.open({ href: 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN', clock });
    const b = net.open({ href: 'https://trex-prod-eu.aka.amazon.com/?gradingMode=WAREHOUSE_DEALS', clock });
    a.SH.store.userConfig.displayCurrency = 'PLN';
    for (let i = 0; i < 3; i++) {
        a.SH.StorageManager.scheduleSave.flush();
        net.flush();
        clock.set(clock.now() + 3000);
        b.SH.StorageManager.debouncedLoad.flush();
    }
    eq(b.SH.FxRates.displayCurrency(), 'PLN');
});

describe('Cisza');

test('przełączanie waluty przy wyłączonym module nie dotyka sieci ani konsoli', () => {
    const e = boot();
    for (const cur of ['PLN', 'EUR', 'native']) {
        e.SH.store.userConfig.displayCurrency = cur;
        e.SH.StatsWindowRenderer.renderValueSum();
    }
    eq(e.net.fetches, [], 'fetch');
    eq(e.net.images, [], 'obrazki');
    eq(e.net.consoleLog, [], 'console.log');
    eq(e.net.consoleError, [], 'console.error');
});
