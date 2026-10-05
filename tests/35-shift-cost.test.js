/**
 * 35-shift-cost.test.js — koszt przedmiotu nie zależy od tego, który to
 * przedmiot zmiany.
 *
 * PO CO TO POWSTAŁO. Testy funkcjonalne biorą kilka przedmiotów i sprawdzają
 * liczby. Usterka, w której każdy zapis dokładał warstwę Proxy, przechodziła
 * przez wszystkie z nich: wynik był poprawny, rósł tylko koszt — dopóki po paru
 * godzinach zmiany komputer nie zaczynał się dławić. Pomiar czasu tego nie
 * złapie wiarygodnie (CI ma swój rytm), więc mierzy się liczbę operacji,
 * które kosztują w przeglądarce:
 *
 *   - odczyty `document.body.innerText` — układ całej strony;
 *   - przerysowania okna statystyk;
 *   - zapisy przez Persistence.write i zdarzenia `storage` do sąsiedniej karty;
 *   - rozbiory wspólnego dziennika wartości (JSON.parse całej listy).
 *
 * Zasada: przedmiot o tym samym przebiegu kosztuje przy końcu zmiany dokładnie
 * tyle, ile na początku. Każda operacja, która rośnie z liczbą przedmiotów,
 * zadań albo wpisów, wychodzi tu jako rozjazd liczników.
 *
 * Scenariusz jest najcięższy z codziennych: dwie karty na wspólnym magazynie,
 * kilka zadań z przełączaniem, włączony dziennik wartości, widoczne linie 2, 6
 * i 8, wszystkie rodzaje kodów sortowania (także niejednoznaczny z uściśleniem).
 */

'use strict';

const { describe, test, eq, ok, same } = require('./harness');
const { makeTabNetwork, makeClock, STAND_TIME, bootOnStand } = require('./dom-stub');

const URL_CRET = 'https://trex.example/?gradingMode=CRETURN';
const URL_WHD = 'https://trex.example/?gradingMode=WAREHOUSE_DEALS';

/** Koszty jednego przedmiotu, wspólne dla obu kart. */
const ops = { innerText: 0, renders: 0, writes: 0, events: 0, parses: 0 };
const zero = () => { for (const k of Object.keys(ops)) ops[k] = 0; };

function instrument(env) {
    const SH = env.SH;
    const body = env.sandbox.document.body;
    const W = SH.StatsWindowRenderer;
    const render = W.renderContent.bind(W);
    W.renderContent = () => { ops.renders++; render(); };
    const P = SH.Persistence;
    const write = P.write.bind(P);
    P.write = (k, v) => { ops.writes++; return write(k, v); };
    const V = SH.ValueLog;
    const readShared = V._readShared.bind(V);
    V._readShared = (t) => { ops.parses++; return readShared(t); };
    const pc = SH.store.localTabConfig.priceCard;
    pc.moduleEnabled = true;
    pc.logValues = true;
    const lines = SH.store.localTabConfig.linesConfig;
    for (const k of ['line2_globalSummary', 'line6_valueSum', 'line8_taskInfo']) lines[k].visible = true;
    env.show = (text) => {
        Object.defineProperty(body, 'innerText', {
            configurable: true, get: () => { ops.innerText++; return text; },
        });
        SH.AutoTrigger.scan();
    };
}

/** Przebieg przedmiotu `i`: kod sortowania i karta zależą tylko od i mod 12. */
const CODES = ['CRITS-PRG2', 'WHD', 'AUDIT', 'Secondary-Sorting'];
function frames(i) {
    const code = CODES[i % 4];
    const confirm = code === 'Secondary-Sorting' ? '\nPrzedmiot wysłano do Transfer - Sellable' : '';
    return ['poniżej — czy przedmiot zgadza się z tym, co widzisz?',
            `Zeskanuj ${code}\nPrzypisz nowy${confirm}`, ''];
}

describe('Dwie karty, kilka zadań, dziennik wartości');

const clock = makeClock(STAND_TIME);
const net = makeTabNetwork();
const A = net.open({ href: URL_CRET, clock });
const B = net.open({ href: URL_WHD, clock });
instrument(A);
instrument(B);
A.SH.AutoTrigger.scan();
B.SH.AutoTrigger.scan();
net.flush();

/** Jeden przedmiot z doręczeniem zdarzeń i taktem zegara okna. */
function runItem(i) {
    zero();
    const env = i % 3 === 2 ? B : A;
    for (const f of frames(i)) env.show(f);
    ops.events = net.pending();
    net.flush();
    A.SH.StatsWindowRenderer.renderContent();
    B.SH.StatsWindowRenderer.renderContent();
    return { ...ops };
}

const ITEMS = 360;
const PERIOD = 12;
const costs = [];
/** Pierwszy przedmiot, który kosztował inaczej niż ten sprzed cyklu. */
let drift = null;
for (let i = 0; i < ITEMS; i++) {
    // Zadania w trakcie zmiany: nowe, jeszcze jedno, powrót do pierwszego —
    // każde przełączenie zostawia stare zadania z licznikami w stanie.
    if (i === 24) A.SH.TaskManager.create('Second', clock.now());
    if (i === 48) A.SH.TaskManager.create('Third', clock.now());
    if (i === 72) A.SH.TaskManager.resume(A.SH.store.tasks[0].id, clock.now());
    net.flush();
    costs.push(runItem(i));
    // Wyjście przy pierwszym rozjeździe: koszt rosnący wykładniczo nie
    // pozwoliłby pętli skończyć się przed limitem czasu.
    if (i >= PERIOD && !same(costs[i], costs[i - PERIOD])) { drift = i; break; }
}

test('każdy przedmiot kosztuje tyle co ten sprzed cyklu, także przez przełączenia zadań', () => {
    // Przedmiot i oraz i − 12 ma ten sam kod i tę samą kartę, więc ma kosztować
    // dokładnie tyle samo — od pierwszego cyklu do końca zmiany.
    eq(drift, null, drift === null ? '' : `przedmiot ${drift}: ${JSON.stringify(costs[drift])}, `
                  + `cykl wcześniej ${JSON.stringify(costs[drift - PERIOD])}`);
    eq(costs.length, ITEMS, 'przeszła cała zmiana');
});

test('skan czyta tekst strony raz, także z kartą ceny', () => {
    // Trzy klatki na przedmiot — trzy odczyty i ani jednego więcej.
    ok(costs.every(c => c.innerText === 3), 'odczyty innerText na przedmiot');
});

test('liczby się zgadzają po obu stronach', () => {
    // Koszt stały przy złym wyniku nic by nie znaczył.
    const S = A.SH.store;
    eq(S.tabCounters.CRET + S.tabCounters.WHD, ITEMS, 'paczki');
    eq(B.SH.store.tabCounters, S.tabCounters, 'druga karta widzi to samo');
    eq(A.SH.ValueLog.entries.length, ITEMS, 'wpisy dziennika');
    eq(B.SH.ValueLog.entries.length, ITEMS, 'dziennik drugiej karty');
});

describe('Dziennik wartości — rozbiór tylko wtedy, gdy klucz zmienił ktoś inny');

const solo = bootOnStand();
const V = solo.SH.ValueLog;
const ls = solo.sandbox.localStorage;
let parses = 0;
const readShared = V._readShared.bind(V);
V._readShared = (t) => { parses++; return readShared(t); };
const entry = (id, ts) => ({ id, asin: null, price: 1, currency: 'EUR', dept: 'CRET',
                             ts, sign: 0, route: null, updated: ts });

test('klucz z naszym ostatnim zapisem — save() nie rozbiera dziennika', () => {
    V.reset('test');
    V.entries = [entry('a', 1)];
    V.save();
    parses = 0;
    V.entries.push(entry('b', 2));
    V.save();
    eq(parses, 0, 'rozbiorów');
    eq(JSON.parse(ls.getItem(V.key())).entries.map(e => e.id), ['a', 'b']);
});

test('sąsiad dopisał wpis, a zdarzenie jeszcze nie doszło — wpis zostaje', () => {
    // Okno wyścigu: tekst klucza nie jest już naszym zapisem, więc scalanie
    // musi pójść, inaczej nasz zapis wymazałby cudzy przedmiot.
    V.reset('test');
    V.entries = [entry('a', 1)];
    V.save();
    const shared = JSON.parse(ls.getItem(V.key()));
    shared.entries.push(entry('n', 3));
    ls.setItem(V.key(), JSON.stringify(shared));
    V.entries.push(entry('b', 2));
    parses = 0;
    V.save();
    eq(parses, 1, 'rozbiorów');
    eq(V.entries.map(e => e.id), ['a', 'b', 'n']);
});

test('sąsiad wyczyścił klucz — zapis niesie tylko naszą kopię', () => {
    // Wartość graniczna: null w magazynie przy niepustej notatce tekstu.
    V.reset('test');
    V.entries = [entry('a', 1)];
    V.save();
    ls.removeItem(V.key());
    V.save();
    eq(JSON.parse(ls.getItem(V.key())).entries.map(e => e.id), ['a']);
});

test('zdarzenie z naszą własną treścią nie przelicza dziennika', () => {
    V.reset('test');
    V.entries = [entry('a', 1)];
    V.save();
    parses = 0;
    V.adoptRemote();
    eq(parses, 0, 'rozbiorów');
    eq(V.entries.length, 1);
});

test('reset zeruje notatkę — pierwszy zapis po nim nie ufa staremu tekstowi', () => {
    V.reset('test');
    V.entries = [entry('a', 1)];
    V.save();
    const before = ls.getItem(V.key());
    V.reset('test');
    ls.setItem(V.key(), before);     // sąsiad odtworzył stary dziennik
    V.entries = [entry('b', 2)];
    V.save();
    eq(V.entries.map(e => e.id), ['a', 'b']);
});

describe('Pisownia kodów sortowania');

test('kod z innej wielkości liter wraca w pisowni z listy, obcy bez zmian', () => {
    const R = solo.SH.Routing;
    const code = solo.SH.CONFIG.ROUTE_SELL_CODES[0];
    eq(R.canon(code.toLowerCase()), code);
    eq(R.canon(code.toUpperCase()), code);
    eq(R.canon('NIEZNANY-KOD'), 'NIEZNANY-KOD');
    eq(R.canon(''), '', 'pusty kod');
});

test('przebudowa wzorca przebudowuje też słownik pisowni', () => {
    // Kody można zmienić w locie (CONFIG), a wtedy wzorzec się zeruje —
    // słownik z poprzedniej listy nie może przeżyć.
    const R = solo.SH.Routing;
    const list = solo.SH.CONFIG.ROUTE_NEUTRAL_CODES;
    list.push('Test-Kod');
    try {
        R._re = null;
        eq(R.canon('test-kod'), 'Test-Kod');
    } finally {
        list.pop();
        R._re = null;
    }
    eq(R.canon('test-kod'), 'test-kod', 'po zdjęciu kodu słownik go nie zna');
});
