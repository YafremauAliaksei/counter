/**
 * 28-manual-corrections.test.js — ręczne poprawki, procent i śmieci w magazynie.
 *
 * NIENARUSZALNA RÓWNOŚĆ: suma paczek zadań karty = licznik tej karty. Na niej
 * stoi całe rozliczenie, a ręczna poprawka (skrót −1, pole działu, pole
 * zadania, pole tempa) nie może jej złamać.
 *
 * PROCENT a zmniejszenie licznika. Paczka zdjęta ręcznie ma nieznany
 * kierunek, więc zdjęcie nie może przesunąć procentu (−1 przy 10/5 ma dać
 * dalej 50%, nie 55%; „50” przy 100/60 — 60%, nie 100%). Zdejmują się
 * najpierw paczki spoza mianownika (wpisane ręcznie, audyty), a potem
 * procentowe — proporcjonalnie. Procent zostaje z dokładnością do jednej paczki.
 *
 * Wszystkie liczby tu są na zegarze stanowiska (dom-stub.js, bootOnStand).
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot, bootOnStand, makeEnv } = require('./dom-stub');

const { makeStorage } = makeEnv();

const env = bootOnStand();
const clock = env.clock;
const SH = env.SH;
const S = SH.store;
const TM = SH.TaskManager;
const HOUR = 3600000;
const SELL = SH.CONFIG.ROUTE_SELL_CODES[0];
const UNSELL = SH.CONFIG.ROUTE_UNSELL_CODES[0];

/** Jeden pełny przedmiot z kodem kierunku. */
function item(code) {
    const body = env.sandbox.document.body;
    const set = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        SH.AutoTrigger.scan();
    };
    set('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
    set(`Zeskanuj ${code}\nPrzypisz nowy`);
    set('');
}

/** Czysta zmiana: jedno zadanie, zera w licznikach, potem `sold` sprzedaży i `unsold` niesprzedaży. */
function fresh(sold, unsold) {
    const cid = S.currentTabInstanceId;
    S.tasks = []; S.activeTaskId = null; S.taskCounters = {};
    S.tabCounters[cid] = 0; S.tabSold[cid] = 0; S.tabNeutral[cid] = 0;
    // Lista zadań w magazynie znika tak jak przy prawdziwym resecie zmiany:
    // zapis zadań scala się z magazynem, a ten opisywałby
    // poprzedni test — często z innym początkiem zmiany.
    env.sandbox.localStorage.removeItem(SH.Persistence.getKey(SH.CONFIG.STORAGE_KEY_TASKS));
    // Zera także w magazynie — licznik rośnie od wartości zapisanej.
    TM.syncShift(cid);
    TM.create('Default', clock.now() - 2 * HOUR);
    for (let i = 0; i < sold; i++) item(SELL);
    for (let i = 0; i < unsold; i++) item(UNSELL);
    return cid;
}

/** Procent zmiany tak, jak liczy go linia 1 (licznik karty, a nie zadania). */
const shiftPercent = (cid) => SH.Utils.percentFloor(S.tabSold[cid] || 0, (S.tabCounters[cid] || 0) - (S.tabNeutral[cid] || 0));

/** Wszystkie niezmienniki liczników naraz — po KAŻDEJ operacji. */
function invariants(cid, label) {
    for (const f of ['done', 'sold', 'neutral']) {
        const tab = { done: S.tabCounters, sold: S.tabSold, neutral: S.tabNeutral }[f][cid] || 0;
        eq(TM.shiftTotal(cid, f), tab, `${label}: suma zadań = licznik karty (${f})`);
    }
    for (const t of S.tasks) {
        const c = TM.counters(t.id, cid);
        ok(c.done >= 0 && c.sold >= 0 && c.neutral >= 0, `${label}: nic ujemnego`);
        ok(c.sold + c.neutral <= c.done, `${label}: sprzedane + poza mianownikiem ≤ paczki (${JSON.stringify(c)})`);
    }
}

describe('Równość sum przy ręcznym odjęciu');

test('−1, gdy paczki leżą w poprzednim zadaniu, a aktywne jest puste', () => {
    // Odjęcie szło tylko do aktywnego zadania i przycinało się tam do zera:
    // licznik karty 4, suma zadań 5 — rozjazd na zawsze.
    const cid = fresh(0, 5);
    TM.create('B');
    SH.InputManager.modifyCounter(-1, { manual: true });
    eq(S.tabCounters[cid], 4);
    invariants(cid, 'po −1');
});

describe('Zmniejszenie licznika nie przesuwa procentu');

test('skrót −1, potem +1, potem −5: procent zmiany zostaje 50%', () => {
    const cid = fresh(100, 100);
    eq(shiftPercent(cid), 50, 'na starcie');
    SH.InputManager.modifyCounter(-1, { manual: true });
    eq(shiftPercent(cid), 50, 'po −1');
    invariants(cid, 'po −1');
    SH.InputManager.modifyCounter(1, { manual: true });
    eq(shiftPercent(cid), 50, 'po +1');
    for (let i = 0; i < 5; i++) SH.InputManager.modifyCounter(-1, { manual: true });
    eq(shiftPercent(cid), 50, 'po −5');
    eq(TM.percent(TM.active()), 50, 'procent zadania też');
    invariants(cid, 'po −5');
});

test('−1 zdejmuje najpierw paczkę wpisaną ręcznie', () => {
    // +1 i −1 to para odwracalna dokładnie, bez zaokrągleń.
    const cid = fresh(5, 5);
    SH.InputManager.modifyCounter(1, { manual: true });
    SH.InputManager.modifyCounter(-1, { manual: true });
    eq([S.tabCounters[cid], S.tabSold[cid], S.tabNeutral[cid]], [10, 5, 0], 'dokładnie jak przed');
});

test('„50” wpisane w pole działu przy 100 paczkach i 60 sprzedażach daje 60%, a nie 100%', () => {
    const cid = fresh(60, 40);
    TM.applyManualTotal(cid, 50);
    SH.SettingsPanel.syncTabCounters(cid);
    eq(S.tabCounters[cid], 50);
    eq(shiftPercent(cid), 60);
    invariants(cid, 'po wpisaniu 50');
});

test('zero wpisane w pole działu: zero paczek i zero procent', () => {
    const cid = fresh(3, 7);
    TM.applyManualTotal(cid, 0);
    SH.SettingsPanel.syncTabCounters(cid);
    eq([S.tabCounters[cid], S.tabSold[cid], S.tabNeutral[cid]], [0, 0, 0]);
    eq(shiftPercent(cid), 0);
});

test('pole paczek zadania i pole tempa w dół też trzymają procent', () => {
    const cid = fresh(60, 40);
    TM.applyTaskTotal(TM.active(), cid, 50);
    SH.SettingsPanel.syncTabCounters(cid);
    eq(shiftPercent(cid), 60, 'pole paczek');
    invariants(cid, 'pole paczek');
    TM.setRate(TM.active(), 10, cid);                // 2 h pracy → 20 paczek
    SH.SettingsPanel.syncTabCounters(cid);
    eq(S.tabCounters[cid], 20);
    eq(shiftPercent(cid), 60, 'pole tempa');
    invariants(cid, 'pole tempa');
});

describe('Początek zadania');

test('„początek zmiany” na drugim zadaniu nie nakłada go na pierwsze', () => {
    // Zadanie A 07:00–12:00, potem B. „Początek zmiany” na B dawał B od 06:30:
    // dwa zadania liczyły te same godziny, a obiad odejmował się dwa razy.
    const cid = fresh(0, 0);
    const shiftStart = S.sessionConfig.shiftCalculatedStartTime;
    TM.setStart(TM.active().id, shiftStart + 30 * 60000);           // A od 07:00
    TM.create('B', shiftStart + 5.5 * HOUR);                         // B od 12:00
    const a = S.tasks[0];
    TM.setStart(TM.active().id, shiftStart);
    ok(TM.span(TM.active()).from >= TM.span(a).to, 'B nie zaczyna się przed końcem A');
    const sum = S.tasks.reduce((s, t) => s + TM.workedMs(t), 0);
    ok(sum <= SH.ShiftManager.getWorkTime().workedMs + 1000, 'suma zadań ≤ czas zmiany');
    invariants(cid, 'po przestawieniu');
});

test('początek z tekstu, który liczbą nie jest, niczego nie rusza', () => {
    fresh(0, 0);
    const before = JSON.stringify(TM.active().segments);
    for (const bad of [NaN, 'abc', undefined, null, 0, -5, Infinity]) {
        TM.setStart(TM.active().id, bad);
        eq(JSON.stringify(TM.active().segments), before, 'setStart(' + String(bad) + ')');
    }
});

test('przestawienie początku zatrzymanego zadania nie puszcza zegara', () => {
    fresh(0, 0);
    TM.pause(clock.now() - HOUR);
    notOk(TM.isRunning(TM.active()), 'zatrzymane');
    TM.setStart(TM.active().id, clock.now() - 30 * 60000);        // w przód, za koniec odcinka
    notOk(TM.isRunning(TM.active()), 'nadal zatrzymane');
});

describe('Śmieci w magazynie');

test('liczniki z magazynu: zawsze liczba całkowita od zera w górę, z górną granicą', () => {
    const storage = makeStorage();
    const probe = boot({ storage });
    const P = probe.prefix;
    const junk = ['-5', '2.9', '1e3', '  7', '7 <script>', '9'.repeat(21), '', 'NaN'];
    junk.forEach((v, i) => storage.setItem(P + 'counter_T' + i, v));
    probe.SH.Main.teardown();
    const loaded = boot({ storage });
    junk.forEach((v, i) => {
        const n = loaded.SH.store.tabCounters['T' + i];
        ok(Number.isInteger(n) && n >= 0 && n <= loaded.SH.CONFIG.COUNTER_MAX, JSON.stringify(v) + ' → ' + n);
    });
    loaded.SH.Main.teardown();
});

test('odcinki zadań z magazynu: bez 1970, bez przyszłości, bez nieskończoności', () => {
    const storage = makeStorage();
    const probe = boot({ storage });
    const key = probe.SH.Persistence.getKey(probe.SH.CONFIG.STORAGE_KEY_TASKS);
    const now = Date.now();
    const raw = '{"activeId":"t1","list":[' +
        '{"id":"t1","name":"A","segments":[{"from":0,"to":null},{"from":-86400000,"to":5},{"from":1e999,"to":null}]},' +
        '{"id":"t2","name":"B","segments":[{"from":' + (now - HOUR) + ',"to":' + (now - 2 * HOUR) + '},{"from":1e15,"to":null}]}' +
        ']}';
    probe.SH.Main.teardown();
    storage.setItem(key, raw);
    const loaded = boot({ storage });
    const T = loaded.SH.TaskManager;
    eq(loaded.SH.store.tasks.map(t => t.id), ['t1', 't2'], 'zadania zostają — ich paczki nie mogą zniknąć');
    for (const t of loaded.SH.store.tasks) {
        for (const seg of t.segments) {
            ok(Number.isFinite(seg.from) && seg.from > 0 && seg.from <= Date.now(), 'początek: ' + seg.from);
            ok(seg.to === null || (Number.isFinite(seg.to) && seg.to >= seg.from), 'koniec: ' + seg.to);
        }
        const shown = loaded.SH.Utils.formatDuration(T.workedMs(t));
        notOk(/NaN|Infinity/.test(shown), 'czas na ekranie: ' + shown);
    }
    loaded.SH.Main.teardown();
});

describe('Ekran');

test('karta z licznikiem „poza mianownikiem” większym od paczek nie zaniża procentu całości', () => {
    // Taki stan bierze się tylko ze śmieci albo wyścigu kart; ujemny wkład
    // karty do wspólnego mianownika zawyżałby procent linii 7.
    const cid = fresh(5, 5);
    S.tabCounters.WHD = 3; S.tabSold.WHD = 0; S.tabNeutral.WHD = 5;
    S.sessionConfig.activeTabInstances.WHD = clock.now();
    SH.StatsWindowRenderer.renderContent();
    const text = SH.StatsWindowRenderer.lines.line7_compact.textContent;
    ok(/ 50%$/.test(text), 'linia 7: ' + text);
    S.tabCounters.WHD = 0; S.tabNeutral.WHD = 0;
    invariants(cid, 'po teście');
});

test('wyczyszczone pole licznika działu niczego nie zeruje', () => {
    // Pusty tekst czytał się jako 0: jedno Backspace i Enter kasowało zmianę
    // karty bez pytania.
    const cid = fresh(3, 3);
    let calls = 0;
    const input = SH.UIBuilder.numberInput(6, () => { calls++; });
    input.value = '';
    input.dispatch('change', { target: input });
    eq(calls, 0, 'pusty tekst nie jest liczbą');
    input.value = '0';
    input.dispatch('change', { target: input });
    eq(calls, 1, 'zero wpisane świadomie działa');
    eq(S.tabCounters[cid], 6);
});

describe('Cisza');

test('ręczne poprawki nie kosztowały ani zapytania, ani linii w konsoli', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
