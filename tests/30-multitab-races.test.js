/**
 * 30-multitab-races.test.js — dwie karty w oknie wyścigu.
 *
 * Każdy scenariusz idzie tak samo: karty zapisują coś, ZANIM przeglądarka
 * doręczy im nawzajem zdarzenia `storage` (makeTabNetwork w dom-stub.js), a po
 * `flush()` sprawdzamy, czy wszystkie karty i magazyn zbiegły się do tego
 * samego, prawdziwego stanu.
 *
 * Kryterium jest zawsze to samo co w całym rozliczeniu: suma paczek zadań
 * danej karty równa się licznikowi tej karty — w każdej karcie, w magazynie
 * i w karcie otwartej od nowa po wszystkim.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { makeTabNetwork, makeClock, STAND_TIME } = require('./dom-stub');

const URL_CRET = 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN';
const URL_WHD = 'https://trex-prod-eu.aka.amazon.com/?gradingMode=WAREHOUSE_DEALS';

/**
 * „Przeglądarka nadgoniła”: doręczone zdarzenia, wykonane odłożone wczytania
 * i autozapisy. Zegar stanowiska przesuwa się za koniec ciszy po wczytaniu
 * stanu sąsiedniej karty (REMOTE_APPLY_SUPPRESS_MS) — w prawdziwym czasie
 * autozapis czeka wtedy te 2,5 s i dopiero potem pisze.
 */
function settleAll(net, clock, envs) {
    for (let i = 0; i < 3; i++) {
        net.flush();
        clock.set(clock.now() + 3000);
        for (const e of envs) {
            e.SH.Persistence.debouncedLoad.flush();
            e.SH.Persistence.scheduleSave();
            e.SH.Persistence.scheduleSave.flush();
        }
    }
}

/** Dwie karty na wspólnym magazynie, po starcie zsynchronizowane. */
function twoTabs(hrefA, hrefB) {
    const net = makeTabNetwork();
    const clock = makeClock(STAND_TIME);
    const a = net.open({ href: hrefA, clock });
    const b = net.open({ href: hrefB, clock });
    settleAll(net, clock, [a, b]);
    return { net, clock, a, b };
}

/** Rozjazd sumy zadań i licznika karty w danej karcie przeglądarki. */
function drift(env, tabKey) {
    const S = env.SH.store;
    return (S.tabCounters[tabKey] || 0) - env.SH.TaskManager.shiftTotal(tabKey, 'done');
}

describe('Zadania: dwie karty zmieniają listę naraz');

test('nowe zadanie w jednej karcie i pauza w drugiej — oba zmiany przeżywają', () => {
    // Zapis całego klucza zadań z pamięci karty: pauza w B, zanim B dowie
    // się o „Sorter” z A, wymazałaby „Sorter” z magazynu, choć jego paczki
    // leżą w liczniku karty.
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_WHD);
    a.SH.TaskManager.create('Sorter');
    b.SH.TaskManager.pause();
    for (let i = 0; i < 5; i++) a.SH.InputManager.modifyCounter(1);
    settleAll(net, clock, [a, b]);

    for (const [name, env] of [['A', a], ['B', b]]) {
        ok(env.SH.store.tasks.some(t => t.name === 'Sorter'), `${name}: Sorter jest na liście`);
        eq(drift(env, 'CRET'), 0, `${name}: suma zadań CRET = licznik CRET`);
    }
    const fresh = net.open({ href: URL_CRET, clock: makeClock(STAND_TIME) });
    eq(drift(fresh, 'CRET'), 0, 'karta otwarta od nowa: równość trzyma');
    eq(fresh.SH.TaskManager.shiftTotal('CRET', 'done'), 5);
});

describe('Usunięcie zadania z paczkami sąsiedniej karty');

test('usunięcie w A zdejmuje paczki, które B zapisała przed doręczeniem', () => {
    // A odejmowała od licznika cudzej karty to, co widziała w SWOJEJ pamięci:
    // przy pustej kopii nie odejmowała nic i zostawiała osierocony klucz.
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_WHD);
    for (let i = 0; i < 10; i++) b.SH.InputManager.modifyCounter(1);   // Default / WHD: 10
    a.SH.TaskManager.create('Sorter');
    settleAll(net, clock, [a, b]);
    const sorter = a.SH.TaskManager.active().id;
    eq(b.SH.TaskManager.active().id, sorter, 'B też pracuje w Sorter');

    for (let i = 0; i < 5; i++) b.SH.InputManager.modifyCounter(1);    // Sorter / WHD: 5, bez doręczenia
    a.SH.TaskManager.remove(sorter);
    settleAll(net, clock, [a, b]);

    for (const [name, env] of [['A', a], ['B', b]]) {
        eq(env.SH.store.tabCounters.WHD, 10, `${name}: licznik WHD bez paczek usuniętego zadania`);
        eq(drift(env, 'WHD'), 0, `${name}: równość WHD`);
    }
    const prefix = a.prefix + a.SH.CONFIG.STORAGE_PREFIX_TASK_COUNTER + sorter;
    ok(!Object.keys(a.sandbox.localStorage).some(k => k.startsWith(prefix)), 'żadnego osieroconego klucza');
});

describe('Ustawienia wspólne dla kart');

test('zmiany dwóch różnych ustawień w dwóch kartach naraz — obie zostają', () => {
    // userConfig pisał się w całości z pamięci: kto zapisał drugi, wymazywał
    // zmianę pierwszego.
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_WHD);
    a.SH.store.userConfig.keyboardShortcuts.INCREMENT = 'F10';
    b.SH.store.userConfig.marketplace = 'co.uk';
    a.SH.Persistence.scheduleSave.flush();
    b.SH.Persistence.scheduleSave.flush();
    settleAll(net, clock, [a, b]);

    for (const [name, env] of [['A', a], ['B', b]]) {
        eq(env.SH.store.userConfig.keyboardShortcuts.INCREMENT, 'F10', `${name}: skrót z A`);
        eq(env.SH.store.userConfig.marketplace, 'co.uk', `${name}: rynek z B`);
    }
});

test('świeża zmiana nie cofa się sama po zapisie sąsiedniej karty', () => {
    // B zmienia ustawienie (zapis za sekundę), A w tym czasie zapisuje swoje.
    // Wczytanie po zdarzeniu z A nadpisywało świeżą zmianę B starą wartością
    // z magazynu, a wyciszony autozapis B nie próbował już drugi raz.
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_WHD);
    b.SH.store.userConfig.language = 'en';                 // czeka na autozapis
    a.SH.store.userConfig.marketplace = 'it';
    a.SH.Persistence.scheduleSave.flush();
    net.flush();
    b.SH.Persistence.debouncedLoad.flush();             // wczytanie po zdarzeniu z A
    eq(b.SH.store.userConfig.language, 'en', 'świeża zmiana B nie cofnięta');
    eq(b.SH.store.userConfig.marketplace, 'it', 'zmiana A dotarła do B');
    settleAll(net, clock, [a, b]);
    eq(a.SH.store.userConfig.language, 'en', 'zmiana B dotarła do A');
});

test('ustawienie usunięte w jednej karcie nie wraca z pamięci drugiej', () => {
    // Scalanie przez deepMerge nie umie usuwać: wpis wyrzucony w A (np. karta
    // nierozpoznana, której już nie ma) zostałby w pamięci B, a najbliższy
    // zapis B wskrzeszałby go w magazynie — sprzątanie nie kończyłoby się nigdy.
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_WHD);
    a.SH.store.userConfig.customTabSettings.unknownTabInstance_x_y = { displayName: 'stara', includeInGlobal: true };
    settleAll(net, clock, [a, b]);
    ok(b.SH.store.userConfig.customTabSettings.unknownTabInstance_x_y, 'wpis dotarł do B');

    delete a.SH.store.userConfig.customTabSettings.unknownTabInstance_x_y;
    a.SH.Persistence.scheduleSave();
    settleAll(net, clock, [a, b]);
    b.SH.store.userConfig.language = 'en';                  // B zapisuje coś innego
    settleAll(net, clock, [a, b]);
    for (const [name, env] of [['A', a], ['B', b]]) {
        eq(env.SH.store.userConfig.customTabSettings.unknownTabInstance_x_y, undefined, `${name}: wpis usunięty`);
    }
    eq(b.SH.store.userConfig.language, 'en');
});

describe('Dwie karty tego samego działu');

test('paczki zaliczone w dwóch kartach CRET naraz sumują się, a nie nadpisują', () => {
    // Obie karty piszą ten sam klucz licznika z własnej pamięci: druga
    // nadpisywała pierwszą i jedna paczka ginęła.
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_CRET);
    a.SH.InputManager.modifyCounter(1);
    b.SH.InputManager.modifyCounter(1);
    settleAll(net, clock, [a, b]);
    for (const [name, env] of [['A', a], ['B', b]]) {
        eq(env.SH.store.tabCounters.CRET, 2, `${name}: dwie paczki`);
        eq(drift(env, 'CRET'), 0, `${name}: równość CRET`);
    }
    eq(net.read(a.prefix + 'counter_CRET'), '2', 'w magazynie też dwie');
});

describe('Cisza');

test('wyścigi kart nie kosztowały ani zapytania, ani linii w konsoli', () => {
    const { net, clock, a, b } = twoTabs(URL_CRET, URL_WHD);
    a.SH.TaskManager.create('x');
    b.SH.InputManager.modifyCounter(1);
    settleAll(net, clock, [a, b]);
    for (const env of [a, b]) {
        eq(env.net.fetches, [], 'fetch');
        eq(env.net.consoleLog, [], 'console.log');
        eq(env.net.consoleError, [], 'console.error');
    }
});
