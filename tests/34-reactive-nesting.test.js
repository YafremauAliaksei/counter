/**
 * 34-reactive-nesting.test.js — zapis do stanu kosztuje tyle samo przy
 * pierwszej i przy tysięcznej paczce.
 *
 * PO CO TO POWSTAŁO. Liczniki zadań zapisuje się wzorcem
 * `store.taskCounters = { ...store.taskCounters, [id]: byTab }`. Rozwinięcie
 * kopiuje do nowego obiektu dzieci, które już są obiektami reaktywnymi (Proxy).
 * Gdy createReactive owijało je w kolejne Proxy, każda paczka dokładała warstwę
 * wszystkim pozostałym zadaniom: odczyt przechodził przez wszystkie warstwy,
 * a owijanie dzieci szło przez pułapki `set` starych warstw i rozsyłało
 * `store:changed` dla każdej z nich. Przy jednym zadaniu nic nie było widać;
 * po założeniu drugiego zadania koszt paczki rósł z każdą paczką, aż po paru
 * godzinach zmiany komputer dławił się przy każdym wyzwalaczu.
 *
 * Miarą jest liczba przerysowań okna statystyk na jeden zapis, a nie czas:
 * test na czas zapalałby się sam na wolnej maszynie CI. Przerysowanie wisi na
 * `store:changed` dla gałęzi `taskCounters`, więc rośnie razem z liczbą
 * rozsyłanych zdarzeń.
 */

'use strict';

const { describe, test, eq } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const env = bootOnStand();
const SH = env.SH;
const TM = SH.TaskManager;
const S = SH.store;
const body = env.sandbox.document.body;

let renders = 0;
const W = SH.StatsWindowRenderer;
const originalRender = W.renderContent.bind(W);
W.renderContent = () => { renders++; originalRender(); };

/** Jeden pełny przedmiot: początek, kod sortowania, wyzwalacz końcowy. */
function item(code) {
    const set = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        SH.AutoTrigger.scan();
    };
    set('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
    set(`Zeskanuj ${code}\nPrzypisz nowy`);
    set('');
}

/** Ile przerysowań kosztował jeden przedmiot. */
function rendersFor(fn) {
    renders = 0;
    fn();
    return renders;
}

/**
 * Przerysowania na paczkę dla `n` kolejnych paczek. Przerywa przy pierwszym
 * odchyleniu od kosztu pierwszej paczki: przy wzroście wykładniczym pełna
 * pętla nie skończyłaby się przed limitem czasu, a test ma paść, nie wisieć.
 */
function costs(n, code) {
    const first = rendersFor(() => item(code));
    for (let i = 1; i < n; i++) {
        const k = rendersFor(() => item(code));
        if (k !== first) return { first, at: i + 1, k };
    }
    return { first, at: null, k: first };
}

function reset() {
    const cid = S.currentTabInstanceId;
    S.tasks = [];
    S.activeTaskId = null;
    S.taskCounters = {};
    S.tabCounters[cid] = 0;
    S.tabSold[cid] = 0;
    S.tabNeutral[cid] = 0;
    env.sandbox.localStorage.removeItem(SH.Persistence.getKey(SH.CONFIG.STORAGE_KEY_TASKS));
    TM.syncShift(cid);
    TM.create('First', env.clock.now() - 3600 * 1000);
    SH.AutoTrigger.scan();               // pierwszy skan tylko fotografuje stronę
    return cid;
}

describe('Koszt paczki nie rośnie z liczbą paczek');

test('jedno zadanie: przerysowań na paczkę tyle samo przy 1. i 300. paczce', () => {
    // Wartość graniczna „zero pozostałych zadań” — tu warstwy nie miały się
    // gdzie dokładać, więc test pilnuje, że naprawa niczego tu nie zmienia.
    reset();
    const r = costs(300, 'CRITS-PRG2');
    eq(r.at, null, `paczka ${r.at} kosztowała ${r.k} zamiast ${r.first}`);
});

test('dwa zadania: przerysowań na paczkę tyle samo przy 1. i 300. paczce', () => {
    // Dokładnie scenariusz ze zmiany: kilka paczek w pierwszym zadaniu,
    // założenie drugiego i dalsza praca. Z warstwami Proxy 300. paczka
    // kosztowała ponad 300 przerysowań zamiast kilku.
    const cid = reset();
    for (let i = 0; i < 5; i++) item('CRITS-PRG2');
    TM.create('Second', env.clock.now());
    const r = costs(300, 'CRITS-PRG2');
    eq(r.at, null, `paczka ${r.at} kosztowała ${r.k} zamiast ${r.first}`);
    eq(TM.shiftTotal(cid, 'done'), 305, 'żadna paczka nie zginęła');
    eq(S.tabCounters[cid], 305, 'licznik karty');
});

test('trzy zadania i druga karta: liczniki starych zadań czytają się bez zmian', () => {
    // Stare zadania są właśnie tymi, które dostawały warstwy — ich liczby
    // muszą zostać nietknięte także po setkach zapisów w nowym zadaniu.
    const cid = reset();
    for (let i = 0; i < 3; i++) item('CRITS-PRG2');
    const firstId = TM.active().id;
    TM.create('Second', env.clock.now());
    TM._write(TM.active().id, 'OTHER_TAB', { done: 7, sold: 1, neutral: 0 });
    for (let i = 0; i < 2; i++) item('WHD');
    const secondId = TM.active().id;
    TM.create('Third', env.clock.now());
    const r = costs(200, 'CRITS-PRG2');
    eq(r.at, null, `paczka ${r.at} kosztowała ${r.k} zamiast ${r.first}`);
    eq(TM.counters(firstId, cid), { done: 3, sold: 3, neutral: 0 });
    eq(TM.counters(secondId, cid), { done: 2, sold: 0, neutral: 0 });
    eq(TM.counters(secondId, 'OTHER_TAB'), { done: 7, sold: 1, neutral: 0 });
    eq(TM.counters(TM.active().id, cid), { done: 200, sold: 200, neutral: 0 });
});

describe('Ponowne przypisanie obiektu reaktywnego');

test('tysiąc rozwinięć tego samego obiektu: jedno przerysowanie na zapis', () => {
    // Wzorzec `x = { ...x }` wprost, bez TaskManagera — tak samo zapisuje
    // zadania druga karta (Persistence, zdarzenie storage).
    reset();
    S.taskCounters = { a: { t1: { done: 1 } }, b: { t2: { done: 2 } } };
    let worst = 0;
    // Wyjście przy pierwszym gorszym zapisie — patrz costs().
    for (let i = 0; i < 1000 && worst <= 1; i++) {
        worst = Math.max(worst, rendersFor(() => { S.taskCounters = { ...S.taskCounters }; }));
    }
    eq(worst, 1, 'najgorszy zapis');
    eq(S.taskCounters.a.t1.done, 1);
    eq(S.taskCounters.b.t2.done, 2);
});

test('zapis wartości zagnieżdżonej po wielu rozwinięciach: jedno zdarzenie', () => {
    // Zapis w głąb przechodzi przez pułapkę `set` każdej warstwy — przy
    // warstwach jedna zmiana liczby dawała tyle przerysowań, ile było warstw.
    reset();
    S.taskCounters = { a: { t1: { done: 1 } } };
    for (let i = 0; i < 20; i++) S.taskCounters = { ...S.taskCounters };
    eq(rendersFor(() => { S.taskCounters.a.t1.done = 2; }), 1);
    eq(S.taskCounters.a.t1.done, 2);
});

test('null i puste obiekty w środku nie psują owijania', () => {
    // Wartości graniczne: null nie jest obiektem do owinięcia, pusty obiekt
    // jest, choć nie ma dzieci.
    reset();
    S.taskCounters = { a: null, b: {}, c: { t: null } };
    S.taskCounters = { ...S.taskCounters };
    eq(S.taskCounters.a, null);
    eq(Object.keys(S.taskCounters.b), []);
    eq(S.taskCounters.c.t, null);
});

test('znacznik surowego obiektu nie przecieka do JSON ani do kluczy', () => {
    // Stan idzie do localStorage przez JSON.stringify — obcy klucz trafiłby
    // do magazynu i do kodu ustawień.
    reset();
    S.taskCounters = { a: { t1: { done: 1 } } };
    S.taskCounters = { ...S.taskCounters };
    eq(JSON.stringify(S.taskCounters), '{"a":{"t1":{"done":1}}}');
    eq(Object.keys(S.taskCounters.a), ['t1']);
    eq(Object.getOwnPropertySymbols(S.taskCounters.a).length, 0);
});
