/**
 * 26-shift-boundaries.test.js — granice zmiany tak, jak wyglądają na hali.
 *
 * JAK PRACUJE ZDECYDOWANA WIĘKSZOŚĆ STANOWISK. Komputer to sesja wirtualna,
 * żyjąca najwyżej 11 godzin: mniej więcej 06:20–17:30 albo 18:20–05:30.
 * Zmiana zaczyna się ZAWSZE o 06:30 albo o 18:30. Dziesięć minut od
 * zalogowania do startu nie jest pracą i nie może się liczyć nigdzie — ani
 * w tempie zmiany, ani w tempie zadania. Skrypt uruchamia się właśnie w tych
 * dziesięciu minutach, więc to nie jest przypadek brzegowy, tylko KAŻDA zmiana.
 *
 * WYJĄTEK (ok. 1% stanowisk). Windows z sesją, której nic nie resetuje:
 * localStorage przechodzi z dnia na dzień. Kto włączył licznik w czwartek
 * o 06:20 i włącza go w piątek o 06:20, ma zobaczyć zmianę zaczętą od zera,
 * tak jakby uruchamiał skrypt pierwszy raz — z jednym wyjątkiem: własne
 * ustawienia (położenie okna, kolory, widoczne linie) zostają.
 *
 * Każdy test chodzi na własnym zegarze ustawionym na konkretną godzinę
 * ścienną (patrz makeClock w dom-stub.js), bo o to właśnie w nich chodzi.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, makeClock, makeEnv } = require('./dom-stub');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Chwila ściennego czasu lokalnego we wrześniu 2026 — daleko od zmiany czasu. */
const at = (day, h, m) => new Date(2026, 8, day, h, m, 0, 0).getTime();

/** Jeden pełny przedmiot: początek, kod sortowania, wyzwalacz końcowy. */
function item(env, code) {
    const body = env.sandbox.document.body;
    const set = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        env.SH.AutoTrigger.scan();
    };
    set('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
    set(code ? `Zeskanuj ${code}\nPrzypisz nowy` : 'Przypisz nowy');
    set('');
}

/** Godzina HH:MM znacznika — w komunikatach porażek czyta się to lepiej niż epoka. */
const hhmm = (ms) => new Date(ms).toTimeString().substring(0, 5);

/** „06” zamiast „6” — tak, jak godzinę pokazuje hhmm(). */
const hh = (h) => String(h).padStart(2, '0');

describe('Dziesięć minut przed startem zmiany nie jest pracą');

for (const [label, h, startH, type] of [['dzienna', 6, 6, 'day'], ['nocna', 18, 18, 'night']]) {
    test(`zmiana ${label}: skrypt włączony o ${hh(h)}:20, zadanie liczy od ${hh(startH)}:30`, () => {
        // Przed poprawką zadanie domyślne zaczynało się o X:20: zegar nie
        // pozwala zapisać początku w przyszłości, więc 06:30 przycinało się do
        // chwili uruchomienia. Linia 1 liczyła od 06:30, linia 8 od 06:20 —
        // przy tych samych paczkach dwa różne tempa, każdego dnia.
        const clock = makeClock(at(16, h, 20));
        const env = boot({ clock });
        const S = env.SH.store;
        const TM = env.SH.TaskManager;
        S.sessionConfig.selectedLunchIndex = null;

        eq(S.sessionConfig.shiftType, type);
        eq(hhmm(S.sessionConfig.shiftCalculatedStartTime), `${hh(startH)}:30`, 'początek zmiany');
        eq(hhmm(TM.span(TM.active()).from), `${hh(startH)}:30`, 'początek zadania widoczny w panelu');

        // Przedmiot zrobiony przed startem zmiany jest paczką jak każda inna —
        // wchodzi do licznika. Nie wchodzi do CZASU.
        item(env);
        eq(TM.workedMs(TM.active()), 0, 'o X:20 zadanie nie ma jeszcze ani minuty pracy');

        clock.set(at(16, h + 2, 30));
        const shiftMs = env.SH.ShiftManager.getWorkTime().workedMs;
        const taskMs = TM.workedMs(TM.active());
        ok(Math.abs(shiftMs - 2 * HOUR) < 1000, 'zmiana: dwie godziny, jest ' + (shiftMs / HOUR).toFixed(3));
        ok(Math.abs(taskMs - shiftMs) < 1000,
           'zadanie liczy tyle samo co zmiana: ' + (taskMs / HOUR).toFixed(3) + ' h wobec ' + (shiftMs / HOUR).toFixed(3) + ' h');
        env.SH.Main.teardown();
    });
}

test('nowe zadanie założone o 06:25 też liczy od 06:30', () => {
    // Ta sama zasada dla każdej drogi, którą powstaje odcinek — a nie tylko
    // dla zadania domyślnego.
    const clock = makeClock(at(16, 6, 20));
    const env = boot({ clock });
    const TM = env.SH.TaskManager;
    env.SH.store.sessionConfig.selectedLunchIndex = null;

    clock.set(at(16, 6, 25));
    TM.create('sorter');
    eq(hhmm(TM.span(TM.active()).from), '06:30');

    clock.set(at(16, 7, 30));
    ok(Math.abs(TM.workedMs(TM.active()) - HOUR) < 1000, 'godzina od startu zmiany');
    const all = env.SH.store.tasks.reduce((sum, t) => sum + TM.workedMs(t), 0);
    ok(Math.abs(all - HOUR) < 1000, 'suma zadań nie większa niż czas zmiany: ' + (all / HOUR).toFixed(3) + ' h');
    env.SH.Main.teardown();
});

test('skrypt wklejony przed rozpoznaniem zmiany (18:10) liczy od 18:30', () => {
    // Martwa strefa 17:55–18:19: zmiany jeszcze nie ma, więc nie ma od czego
    // przyciąć. Zadanie powstaje o 18:10, a zmianę rozpoznaje później timer
    // oczekiwania. Od tej chwili czas zadania też ma liczyć się od 18:30.
    const clock = makeClock(at(16, 18, 10));
    const env = boot({ clock });
    const S = env.SH.store;
    const TM = env.SH.TaskManager;
    eq(S.sessionConfig.shiftType, null, 'o 18:10 zmiany jeszcze nie ma');

    clock.set(at(16, 18, 20));
    env.SH.ShiftManager.update();            // to samo robi timer oczekiwania
    S.sessionConfig.selectedLunchIndex = null;
    eq(hhmm(S.sessionConfig.shiftCalculatedStartTime), '18:30');

    clock.set(at(16, 19, 30));
    ok(Math.abs(TM.workedMs(TM.active()) - HOUR) < 1000,
       'godzina od 18:30, jest ' + (TM.workedMs(TM.active()) / HOUR).toFixed(3) + ' h');
    eq(hhmm(TM.span(TM.active()).from), '18:30');
    env.SH.Main.teardown();
});

describe('Stanowisko bez resetu sesji: następny dzień to nowa zmiana od zera');

for (const [label, h] of [['dzienna', 6], ['nocna', 18]]) {
    test(`zmiana ${label}: czwartek ${hh(h)}:20, potem piątek ${hh(h)}:20 — liczniki od zera, ustawienia zostają`, () => {
        const { makeStorage } = makeEnv();
        const shared = makeStorage();
        const clock = makeClock(at(17, h, 20));

        const thursday = boot({ storage: shared, clock });
        const cid = thursday.SH.store.currentTabInstanceId;
        const L = thursday.SH.store.localTabConfig;
        // Ustawienia człowieka: przesunięte okno, własny kolor, włączona linia 2.
        L.statsWindowPosition = { top: '300px', left: '500px', bottom: '' };
        L.linesConfig.line7_compact.colorHex = '#ff0000';
        L.linesConfig.line2_globalSummary.visible = true;
        clock.set(at(17, h + 3, 0));
        for (let i = 0; i < 12; i++) item(thursday);
        thursday.SH.TaskManager.create('sorter');
        thursday.SH.StorageManager.saveState();
        eq(thursday.SH.store.tabCounters[cid], 12, 'czwartek: 12 paczek');
        // Czwartkowa strona już nie istnieje — tak jak po wylogowaniu.
        thursday.SH.Main.teardown();

        clock.set(at(18, h, 20));
        const friday = boot({ storage: shared, clock });
        const S = friday.SH.store;
        const TM = friday.SH.TaskManager;

        eq(S.tabCounters[cid] || 0, 0, 'piątek: licznik od zera');
        eq(S.tasks.length, 1, 'jedno zadanie, jak przy pierwszym uruchomieniu');
        eq(S.tasks[0].name, friday.SH.CONFIG.DEFAULT_TASK_NAME);
        eq(new Date(S.sessionConfig.shiftCalculatedStartTime).getDate(), 18, 'zmiana z piątku');
        eq(hhmm(S.sessionConfig.shiftCalculatedStartTime), `${hh(h)}:30`);
        eq(hhmm(TM.span(TM.active()).from), `${hh(h)}:30`, 'zadanie też od piątkowego startu');
        eq(TM.shiftTotal(cid, 'done'), 0, 'zadania bez czwartkowych paczek');

        eq(S.localTabConfig.statsWindowPosition, { top: '300px', left: '500px', bottom: '' }, 'położenie okna');
        eq(S.localTabConfig.linesConfig.line7_compact.colorHex, '#ff0000', 'kolor');
        eq(S.localTabConfig.linesConfig.line2_globalSummary.visible, true, 'włączona linia');
        friday.SH.Main.teardown();
    });
}

describe('Cisza');

test('granice zmiany nie kosztowały ani zapytania, ani linii w konsoli', () => {
    const clock = makeClock(at(16, 6, 20));
    const env = boot({ clock });
    clock.set(at(16, 8, 0));
    item(env);
    env.SH.ShiftManager.update();
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
    env.SH.Main.teardown();
});
