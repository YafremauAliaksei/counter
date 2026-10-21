/**
 * 43-state-matrix.test.js — macierz stanów pracy: koszt przedmiotu stały
 * i liczba zaliczeń zgodna z tym, co człowiek zrobił.
 *
 * PO CO. Testy modułów sprawdzają jeden stan naraz. Usterka styku wychodzi
 * dopiero przy zbiegu stanów: dwie karty działu UG, naklejka, pojemnik,
 * otwarty panel, północ. Macierz bierze pokrycie parami wymiarów
 * (karty, zadania, moduł cen, UG, pojemnik, panel i diagnostyka, obiad,
 * północ, reset) w dwunastu przebiegach po 312 przedmiotów.
 *
 * Jak w tests/35-shift-cost.test.js mierzy się operacje, nie czas: odczyty
 * innerText, przerysowania okna, zapisy, zdarzenia storage, rozbiory
 * dziennika, przeładowania wspólnych ustawień (loadAll) i rundy uspokajania
 * kart. Tekst strony liczy atrapa z całego drzewa (bez podmiany innerText),
 * więc własny interfejs skryptu — panel, okno diagnostyki — trafia do skanu
 * tak jak w przeglądarce.
 *
 * Timery debounce i interwały skrypt stawia na prawdziwym zegarze, którego
 * pętla synchroniczna nie przepuszcza; test dokańcza je jawnie (flush, tick,
 * ShiftManager.update) w kolejności, w jakiej zrobiłaby to przeglądarka.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { makeTabNetwork, makeClock, scanTote, STAND_TIME } = require('./dom-stub');

const URL = {
    CRET: 'https://trex.example/?gradingMode=CRETURN',
    UG: 'https://trex.example/?gradingMode=CRETURN_PRIMARY_GRADING',
    REFURB: 'https://trex.example/?gradingMode=CRETURN_REFURB',
    WHD: 'https://trex.example/?gradingMode=WAREHOUSE_DEALS',
};
const DAY_START = new Date(2026, 8, 16, 6, 35, 0).getTime();     // przez obiad
const NIGHT_START = new Date(2026, 8, 16, 22, 0, 0).getTime();   // przez północ
// 312 = 6 * 48 + 24: okna 4..23 i 292..311 mają ten sam skład wszystkich cykli
// (karty 1/2/4, kody co 16, tsREP co 3, przerwane co 4).
const ITEMS = 312;
const STEP_MS = 90 * 1000;
const PHRASE = 'Teraz oceniasz produkt, który można odsprzedać jako używany';
const CODES = ['CRITS-PRG2', 'WHD', 'AUDIT', 'Liquidation'];
const COUNTERS = ['innerText', 'renders', 'writes', 'events', 'parses', 'loads', 'rounds'];

/**
 * Jeden przebieg zmiany. `cfg`:
 *   tabs   ['CRET', 'UG:sticker:now', 'UG:phrase:after', ...]
 *   tasks  1 | 3, price, panel, diag, night, reset (indeks przedmiotu)
 *   tote   'normal' | 'rep' (co trzeci tsREP) | 'none' (60 s) | 'abort' (co czwarty przerwany)
 */
function runShift(cfg) {
    const t0 = cfg.night ? NIGHT_START : DAY_START;
    const clock = makeClock(t0);
    const net = makeTabNetwork();
    const ops = Object.fromEntries(COUNTERS.map(k => [k, 0]));
    const tabs = cfg.tabs.map(spec => {
        const [type, ug, sale] = spec.split(':');
        const env = net.open({ href: URL[type], clock });
        const SH = env.SH;
        const body = env.sandbox.document.body;
        // Licznik odczytów tekstu strony bez podmiany samego tekstu.
        let proto = body; let desc;
        while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'innerText'))) proto = Object.getPrototypeOf(proto);
        Object.defineProperty(body, 'innerText', { configurable: true, get() { ops.innerText++; return desc.get.call(this); } });
        const W = SH.StatsWindowRenderer; const render = W.renderContent.bind(W);
        W.renderContent = () => { ops.renders++; render(); };
        const P = SH.Persistence; const write = P.write.bind(P); const loadAll = P.loadAll.bind(P);
        P.write = (k, v) => { ops.writes++; return write(k, v); };
        P.loadAll = (r) => { ops.loads++; return loadAll(r); };
        const V = SH.ValueLog; const readShared = V._readShared.bind(V);
        V._readShared = (t) => { ops.parses++; return readShared(t); };
        const page = env.sandbox.document.createElement('div');
        page.id = 'trex';
        body.appendChild(page);
        return { env, SH, type, ug, sale, page, doc: env.sandbox.document };
    });
    for (const t of tabs) t.SH.AutoTrigger.scan();

    /** Przeglądarka dokańcza timery i doręcza zdarzenia, aż karty ucichną. */
    function settle() {
        let rounds = 0;
        do {
            net.flush();
            for (const t of tabs) t.SH.Persistence.debouncedLoad.flush();
            clock.set(clock.now() + 2600);   // za oknem ciszy po cudzym stanie
            for (const t of tabs) {
                t.SH.Persistence.scheduleSave.flush();
                t.SH.ValueLog.flushWriteBack();
            }
            ops.events += net.pending();
            rounds++;
        } while (net.pending() && rounds < 50);
        return rounds;
    }
    const show = (t, text) => { t.page.textContent = text; t.SH.AutoTrigger.scan(); };

    if (cfg.price) for (const t of tabs) t.SH.priceOn();
    if (cfg.panel) tabs[0].SH.settings();
    if (cfg.diag) tabs[0].SH.debug();
    settle();

    const expected = {};
    const costs = [];
    let drift = null;
    for (let i = 0; i < ITEMS; i++) {
        clock.set(Math.max(clock.now(), t0 + i * STEP_MS));
        if (cfg.tasks === 3) {
            const TM = tabs[0].SH.TaskManager;
            if (i === 30) TM.create('Second', clock.now());
            if (i === 60) TM.create('Third', clock.now());
            // Po resecie zmiany lista zadań wstaje od nowa — przełącza się
            // na to, co jest.
            const list = TM.list();
            if (i === 90 || i === 210) TM.resume(list[0].id, clock.now());
            if (i === 150) TM.resume(list[Math.min(1, list.length - 1)].id, clock.now());
        }
        for (const t of tabs) t.SH.ShiftManager.update();
        settle();
        for (const k of COUNTERS) ops[k] = 0;

        const t = tabs[i % tabs.length];
        const kind = cfg.tote === 'rep' ? (i % 3 === 2 ? 'rep' : 'normal')
                   : cfg.tote === 'abort' ? (i % 4 === 3 ? 'abort' : 'normal') : cfg.tote;
        const code = t.type === 'UG' ? 'CRITS-PRG2' : CODES[(i >> 2) % 4];
        const asin = 'B0' + String(1000000 + i).padStart(8, '0');
        let sticker = null;
        if (t.ug === 'sticker') {
            sticker = t.doc.createElement('div');
            sticker.id = t.SH.CONFIG.STICKER_ELEMENT_ID;
            t.doc.body.appendChild(sticker);
        }
        show(t, `poniżej — ASIN ${asin}` + (t.ug === 'phrase' ? '\n' + PHRASE : ''));
        if (cfg.reset === i) { t.SH.SessionReset.resetItemData('reset w trakcie przedmiotu'); for (const k in expected) expected[k] = 0; }
        if (kind !== 'abort') {
            const late = t.sale === 'after';
            show(t, late ? 'Przypisz nowy' : `Zeskanuj ${code}\nPrzypisz nowy`);
            if (kind === 'none') {
                clock.set(clock.now() + 61000);
                t.SH.AutoTrigger.tick();
            } else {
                scanTote(t.env, kind === 'rep' ? 'tsREP1' : 'tsT1');
                show(t, late ? 'Przypisz nowy' : `Zeskanuj ${code}\nPrzypisz nowy`);
            }
            if (late) show(t, `Zeskanuj ${code}`);
            if (kind !== 'rep') expected[t.type] = (expected[t.type] || 0) + (t.ug ? 2 : 1);
        }
        if (sticker) sticker.remove();
        show(t, '');
        ops.rounds = settle();
        for (const x of tabs) x.SH.StatsWindowRenderer.renderContent();
        costs.push({ ...ops });
        // Wyjście przy pierwszym rozjeździe: przedmiot dwa razy droższy niż
        // najdroższy z pierwszych 24 to już wzrost, dalsza pętla mogłaby wisieć.
        // Przedmiot z resetem zmiany jest zdarzeniem jednorazowym, a nie wzrostem.
        if (i >= 24 && i !== cfg.reset) {
            const base = costs.slice(0, 24);
            const over = COUNTERS.find(k => ops[k] > 2 * Math.max(...base.map(c => c[k])) + 4);
            if (over) { drift = `przedmiot ${i}: ${over}=${ops[over]}, `
                              + `maks. z początku ${Math.max(...base.map(c => c[over]))}`; break; }
        }
    }
    return { tabs, costs, drift, expected, net };
}

/** Suma licznika w oknie przedmiotów. */
const sum = (costs, from, to, k) => costs.slice(from, to).reduce((s, c) => s + c[k], 0);

const MATRIX = [
    { name: 'CRET, 1 zadanie, dzień', tabs: ['CRET'], tasks: 1, tote: 'normal' },
    { name: 'UG naklejka, sprzedaż teraz, 3 zadania, ceny, północ', tabs: ['UG:sticker:now'], tasks: 3, price: true, tote: 'normal', night: true },
    { name: 'UG fraza, sprzedaż teraz, bez pojemnika, panel', tabs: ['UG:phrase:now'], tasks: 1, tote: 'none', panel: true },
    { name: 'UG fraza, sprzedaż po pojemniku, 3 zadania, diagnostyka, północ', tabs: ['UG:phrase:after'], tasks: 3, tote: 'normal', diag: true, night: true },
    { name: 'CRET + UG naklejka, tsREP, ceny, panel, obiad', tabs: ['CRET', 'UG:sticker:now'], tasks: 1, price: true, panel: true, tote: 'rep' },
    { name: 'cztery karty, 3 zadania, diagnostyka, północ', tabs: ['CRET', 'UG:phrase:after', 'REFURB', 'WHD'], tasks: 3, diag: true, tote: 'normal', night: true },
    { name: 'REFURB przerwane, panel i diagnostyka, reset', tabs: ['REFURB'], tasks: 1, panel: true, diag: true, tote: 'abort', reset: 150 },
    { name: 'WHD bez pojemnika, 3 zadania, ceny, reset przez północ', tabs: ['WHD'], tasks: 3, price: true, tote: 'none', reset: 140, night: true },
    { name: 'UG fraza po pojemniku, bez pojemnika, panel, reset', tabs: ['UG:phrase:after'], tasks: 1, panel: true, tote: 'none', reset: 150 },
    { name: 'CRET + WHD przerwane, 3 zadania, ceny, diagnostyka, północ', tabs: ['CRET', 'WHD'], tasks: 3, price: true, diag: true, tote: 'abort', night: true },
    { name: 'cztery karty, tsREP, ceny, panel, reset', tabs: ['CRET', 'UG:sticker:now', 'REFURB', 'WHD'], tasks: 1, price: true, panel: true, tote: 'rep', reset: 150 },
    { name: 'UG fraza + CRET bez pojemnika, 3 zadania, diagnostyka, reset w nocy', tabs: ['UG:phrase:now', 'CRET'], tasks: 3, diag: true, tote: 'none', reset: 150, night: true },
];

for (const cfg of MATRIX) {
    describe('Macierz: ' + cfg.name);
    const r = runShift(cfg);

    test(`${cfg.name} — koszt ostatnich 20 przedmiotów nie większy niż pierwszych 20`, () => {
        eq(r.drift, null, r.drift || '');
        eq(r.costs.length, ITEMS, 'przeszła cała zmiana');
        const L = ITEMS - 20;
        const grew = COUNTERS.filter(k => sum(r.costs, L, ITEMS, k) > sum(r.costs, 4, 24, k))
            .map(k => `${k}: ${sum(r.costs, 4, 24, k)} -> ${sum(r.costs, L, ITEMS, k)}`);
        // Pierwszy przedmiot okna, który kosztuje inaczej niż jego odpowiednik.
        const j = r.costs.slice(L).findIndex((c, x) => JSON.stringify(c) !== JSON.stringify(r.costs[4 + x]));
        if (grew.length && j >= 0) grew.push(`przedmiot ${L + j}: ${JSON.stringify(r.costs[L + j])} wobec ${4 + j}: ${JSON.stringify(r.costs[4 + j])}`);
        eq(grew, [], 'liczniki, które urosły');
    });

    test(`${cfg.name} — liczba zaliczeń zgodna z przebiegiem`, () => {
        const S = r.tabs[0].SH.store;
        for (const type of Object.keys(r.expected)) {
            eq(S.tabCounters[type] || 0, r.expected[type], `licznik ${type}`);
        }
        // Suma zadań to ten sam licznik zmiany, inaczej linia 8 kłamie.
        const TM = r.tabs[0].SH.TaskManager;
        const done = TM.list().reduce((s, task) => s + TM.totals(task).done, 0);
        eq(done, Object.values(r.expected).reduce((a, b) => a + b, 0), 'suma zadań');
        for (const t of r.tabs.slice(1)) eq(t.SH.store.tabCounters, S.tabCounters, 'sąsiednia karta widzi to samo');
        if (cfg.price) ok(r.tabs.some(t => t.env.net.fetches.length > 0), 'moduł cen pytał zaślepioną sieć');
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Styki, które macierz przechodzi „na zielono”, bo każdy jej przedmiot jest
// domknięty przed następnym zdarzeniem. Tu zdarzenia wchodzą między siebie.
// Naklejkę z poprzedniego przedmiotu, pojemnik czekający przy resecie i koszt
// lastToteAt w sąsiedniej karcie sprawdza tests/42-release-172.test.js.
// ─────────────────────────────────────────────────────────────────────────

/** Karta na wspólnym magazynie z ekranem kroku `#trex`. */
function openTab(net, clock, type) {
    const env = net.open({ href: URL[type], clock });
    const doc = env.sandbox.document;
    const page = doc.createElement('div');
    page.id = 'trex';
    doc.body.appendChild(page);
    env.show = (text) => { page.textContent = text; env.SH.AutoTrigger.scan(); };
    env.SH.AutoTrigger.scan();
    return env;
}

describe('Reset zmiany między zaliczeniem a kodem sortowania');

test('kod sortowania po resecie nie dopisuje sprzedanych do nowej zmiany', () => {
    // UG z frazą: zaliczenie +1 przy pojemniku, kod sprzedaży przychodzi po
    // nim. Reset w tej chwili zamyka starą zmianę; spóźniony kod należy do
    // przedmiotu starej zmiany i nowa ma zostać pusta. Gdy kierunek dopisuje
    // się po resecie, nowa zmiana ma więcej sprzedanych niż paczek.
    const clock = makeClock(STAND_TIME);
    const A = openTab(makeTabNetwork(), clock, 'UG');
    const S = A.SH.store;
    A.show('poniżej\n' + PHRASE);
    A.show('Przypisz nowy');
    scanTote(A);
    A.show('Przypisz nowy');
    eq(S.tabCounters.UG, 1, 'przed resetem: +1 za frazę, premia czeka na kierunek');
    A.SH.SessionReset.resetItemData('test');
    A.show('Zeskanuj CRITS-PRG2');
    eq({ done: S.tabCounters.UG || 0, sold: S.tabSold.UG || 0 }, { done: 0, sold: 0 }, 'nowa zmiana');
});

describe('Czas od pojemnika po resecie zmiany');

test('po resecie linia 9 nie liczy bezczynności od pojemnika starej zmiany', () => {
    // offTask() obiecuje null, gdy w tej zmianie nie przybito pojemnika.
    const clock = makeClock(STAND_TIME);
    const A = openTab(makeTabNetwork(), clock, 'CRET');
    A.show('poniżej');
    A.show('Przypisz nowy');
    scanTote(A);
    A.show('');
    A.SH.SessionReset.resetItemData('test');
    clock.set(clock.now() + 10 * 60000);
    eq(A.SH.ToteWatch.offTask(clock.now()), null, 'offTask po resecie');
});
