/**
 * 33-market-fallback.test.js — przegląd sklepów, gdy na wybranym ceny nie ma (1.4.0).
 *
 * DWIE ZMIANY, KTÓRYCH TEN PLIK PILNUJE.
 *
 * 1. Wszystkie rynki, a nie pięć wylosowanych. Cena bywa tylko na jednym
 *    rynku z całej listy; losowanie pięciu z dziewięciu omijało go przy każdej
 *    próbie z prawdopodobieństwem 4/9 — kilka przedmiotów z rzędu bez ceny,
 *    choć była do znalezienia.
 *
 * 2. Rynek z linku na stronie idzie pierwszy. Jeśli T-REX pokazuje link
 *    amazon.it/dp/…, to produkt był wystawiony właśnie tam — to najlepszy
 *    kandydat i zwykle jedyne potrzebne zapytanie zamiast przeglądu w ciemno.
 *
 * Host z linku decyduje wyłącznie o KOLEJNOŚCI: adres zapytania dalej składa
 * się z tablicy CONFIG.MARKETPLACES, więc spreparowany link nie wyśle zapytania
 * nigdzie poza listę — sprawdzane niżej.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const P = SH.PriceCard;
const doc = env.sandbox.document;
const ASIN = 'B0FJ6K5H5V';

/** Rynki, dla których Keepa ma dane — poza wybranym 'de'. */
const OTHERS = Object.keys(SH.CONFIG.MARKETPLACES)
    .filter(k => k !== 'de' && SH.CONFIG.MARKETPLACES[k].keepa_ok);

/** Strona z jednym linkiem do produktu. */
function pageWithLink(href) {
    for (const old of doc.querySelectorAll('a[href*="/dp/"]')) old.remove();
    const a = doc.createElement('a');
    a.setAttribute('href', href);
    doc.body.appendChild(a);
}

/** Proste źródło losowości z ziarnem — żeby sprawdzić wiele kolejności. */
function seeded(seed) {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

describe('Rynek z linku do produktu');

test('host z listy rynków daje jego klucz — także com.be i co.uk', () => {
    const cases = {
        'https://www.amazon.it/dp/B0FJ6K5H5V': 'it',
        'https://amazon.co.uk/gp/product/B0FJ6K5H5V': 'co.uk',
        'https://www.amazon.com.be/dp/B0FJ6K5H5V?th=1': 'com.be',
        'https://www.amazon.com/dp/B0FJ6K5H5V': 'com',
        '//www.amazon.fr/dp/B0FJ6K5H5V': 'fr',
        'HTTPS://WWW.AMAZON.ES/dp/B0FJ6K5H5V': 'es',
        'https://www.amazon.nl:443/dp/B0FJ6K5H5V': 'nl',
        'https://www.amazon.pl/dp/B0FJ6K5H5V': 'pl',
    };
    for (const [href, key] of Object.entries(cases)) eq(P.marketFromHref(href), key, href);
});

test('link względny, obcy host i podróbki dają null', () => {
    for (const href of [
        '/dp/B0FJ6K5H5V',
        'dp/B0FJ6K5H5V',
        'https://amazon.it.evil.example/dp/B0FJ6K5H5V',
        'https://evil.example/?u=https://www.amazon.it/dp/B0FJ6K5H5V',
        'https://www.amazon.jp/dp/B0FJ6K5H5V',
        'javascript:alert(1)//www.amazon.it/dp/B0FJ6K5H5V',
        '', null, undefined, 42,
    ]) eq(P.marketFromHref(href), null, String(href));
});

test('detectAsin zapamiętuje rynek linku razem z ASIN', () => {
    pageWithLink('https://www.amazon.it/dp/' + ASIN);
    eq(P.detectAsin(), ASIN);
    eq(P.linkMarket, { asin: ASIN, key: 'it' });
});

test('link względny: ASIN jest, rynku nie ma', () => {
    pageWithLink('/dp/' + ASIN);
    eq(P.detectAsin(), ASIN);
    eq(P.linkMarket, null);
});

test('ASIN z samego tekstu nie dziedziczy rynku poprzedniego linku', () => {
    pageWithLink('https://www.amazon.it/dp/' + ASIN);
    P.detectAsin();
    for (const old of doc.querySelectorAll('a[href*="/dp/"]')) old.remove();
    P.detectAsin();
    eq(P.linkMarket, null);
});

describe('Kolejność przeglądu');

test('wszystkie rynki z danymi Keepa, każdy raz — nie pięć wylosowanych', () => {
    const order = P.fallbackOrder('de', null);
    eq(order.length, OTHERS.length, 'tyle, ile jest rynków: ' + order.join(','));
    eq([...order].sort(), [...OTHERS].sort());
    ok(OTHERS.length > 5, 'lista jest dłuższa niż dawny limit — inaczej test niczego nie dowodzi');
});

test('rynek z linku pierwszy i nie powtarza się dalej', () => {
    for (let seed = 1; seed < 50; seed++) {
        const order = P.fallbackOrder('de', 'it', seeded(seed));
        eq(order[0], 'it', 'ziarno ' + seed);
        eq(order.filter(k => k === 'it').length, 1);
        eq(order.length, OTHERS.length);
    }
});

test('rynki spoza Europy zawsze na końcu, bez względu na losowanie', () => {
    const late = SH.CONFIG.PRICE_FALLBACK_LAST;
    for (let seed = 1; seed < 200; seed++) {
        const order = P.fallbackOrder('de', null, seeded(seed));
        const firstLate = order.findIndex(k => late.includes(k));
        ok(order.slice(firstLate).every(k => late.includes(k)), `ziarno ${seed}: ${order.join(',')}`);
    }
});

test('link spoza Europy też idzie pierwszy — tam produkt był wystawiony', () => {
    eq(P.fallbackOrder('de', 'com')[0], 'com');
});

test('granice podpowiedzi: ten sam co wybrany, bez danych Keepa, śmieci', () => {
    eq(P.fallbackOrder('it', 'it').includes('it'), false, 'wybrany już sprawdzony');
    const pl = P.fallbackOrder('de', 'pl');
    eq(pl.includes('pl'), false, 'Keepa nie ma danych dla pl');
    eq(pl.length, OTHERS.length);
    for (const junk of ['__proto__', 'constructor', 'xx', '', 42]) {
        const order = P.fallbackOrder('de', junk);
        eq([...order].sort(), [...OTHERS].sort(), 'śmieć ' + String(junk));
    }
});

test('skrajności losowania (0 i prawie 1) dają poprawną listę', () => {
    for (const r of [() => 0, () => 0.9999999]) {
        const order = P.fallbackOrder('de', 'fr', r);
        eq(order[0], 'fr');
        eq([...order].sort(), [...OTHERS].sort());
    }
});

describe('Przegląd w działaniu');

/**
 * Runner uruchamia testy asynchroniczne od razu, jeden po drugim, bez czekania
 * — a te podmieniają wspólny KeepaOCR.read i wyłącznik modułu. Kolejka
 * sprawia, że każdy zaczyna dopiero po zakończeniu poprzedniego.
 */
let queue = Promise.resolve();
function serial(fn) {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
}

/**
 * Przegląd z podmienionym odczytem Keepa: cena tylko na rynku `hit` albo
 * tam, gdzie `hit(key, asked)` zwróci prawdę.
 */
async function run(hit) {
    const asked = [];
    const realRead = SH.KeepaOCR.read;
    const delay = SH.CONFIG.PRICE_FALLBACK_DELAY_MS;
    SH.CONFIG.PRICE_FALLBACK_DELAY_MS = 0;
    SH.store.localTabConfig.priceCard.moduleEnabled = true;
    SH.KeepaOCR.read = async (asin, key) => {
        asked.push(key);
        const found = typeof hit === 'function' ? hit(key, asked) : key === hit;
        return found ? { top: { value: 9.99, series: 'amazon' }, second: null } : null;
    };
    try {
        P.shownAsin = ASIN;
        const result = await P.tryOtherMarkets(ASIN);
        return { asked, result };
    } finally {
        SH.KeepaOCR.read = realRead;
        SH.CONFIG.PRICE_FALLBACK_DELAY_MS = delay;
        SH.store.localTabConfig.priceCard.moduleEnabled = false;
    }
}

test('link na amazon.it i cena na it — jedno zapytanie zamiast przeglądu', () => serial(async () => {
    pageWithLink('https://www.amazon.it/dp/' + ASIN);
    P.detectAsin();
    const { asked, result } = await run('it');
    eq(asked, ['it']);
    eq(result.market, 'it');
    eq(result.current.currency, 'EUR');
}));

test('cena tylko na ostatnim rynku listy — i tak się znajduje', () => serial(async () => {
    pageWithLink('/dp/' + ASIN);
    P.detectAsin();
    // Cena jest wyłącznie na tym rynku, o który przegląd zapyta jako ostatni —
    // niezależnie od tego, jak wypadło losowanie. Przy dawnym limicie pięciu
    // do niego nie dochodziło nigdy.
    const { asked, result } = await run((key, sofar) => sofar.length === OTHERS.length);
    ok(result && result.market === asked[asked.length - 1], 'cena z ostatniego rynku');
    eq([...asked].sort(), [...OTHERS].sort(), 'wszystkie rynki zapytane po razie');
}));

test('ceny nie ma nigdzie: każdy rynek raz, potem koniec', () => serial(async () => {
    pageWithLink('https://www.amazon.it/dp/' + ASIN);
    P.detectAsin();
    const { asked, result } = await run(null);
    eq(result, null);
    eq(asked.length, OTHERS.length);
    eq(asked[0], 'it');
}));

test('podpowiedź z linku innego przedmiotu nie przechodzi na bieżący', () => serial(async () => {
    // Link na stronie prowadzi do innego produktu niż ten, o który pytamy —
    // jego rynek nic o bieżącym nie mówi, więc przegląd dostaje hint = null.
    pageWithLink('https://www.amazon.it/dp/B000000001');
    P.detectAsin();
    const hints = [];
    const real = P.fallbackOrder;
    P.fallbackOrder = function (from, hint, random) { hints.push(hint); return real.call(this, from, hint, random); };
    try {
        const { asked } = await run(null);
        eq(hints, [null]);
        eq(asked.length, OTHERS.length, 'pełny przegląd');
    } finally {
        P.fallbackOrder = real;
    }
}));

describe('Cisza');

test('nic z tego pliku nie wyszło do prawdziwej sieci ani do konsoli', () => {
    eq(env.net.fetches, []);
    eq(env.net.images, []);
    eq(env.net.consoleLog, []);
    eq(env.net.consoleError, []);
});
