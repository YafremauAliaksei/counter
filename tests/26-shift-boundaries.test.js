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

const path = require('path');
const { execFileSync } = require('child_process');
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
        // Początku w przyszłości zapisać się nie da, więc zadanie domyślne
        // powstaje o X:20 — a liczyć ma od X:30, jak linia 1. Inaczej przy
        // tych samych paczkach linie 1 i 8 dawałyby dwa różne tempa.
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

describe('Karta otwarta przez noc sama zauważa nową zmianę');

/**
 * Stanowisko bez resetu sesji, karta T-REX zostawiona otwarta na noc.
 * Ponowne kliknięcie zakładki na działającej stronie jest ignorowane (ochrona
 * przed podwójnym uruchomieniem), więc zmianę musi zauważyć sam skrypt —
 * inaczej w piątek o 06:25 okno pokazywałoby czwartkowe 120 paczek, a piątkowe
 * dopisywałyby się do nich.
 */
function openOvernight(h) {
    const { makeStorage } = makeEnv();
    const shared = makeStorage();
    const clock = makeClock(at(17, h, 20));
    const env = boot({ storage: shared, clock });
    const cid = env.SH.store.currentTabInstanceId;
    clock.set(at(17, h + 3, 0));
    for (let i = 0; i < 12; i++) item(env);
    return { env, clock, cid };
}

test('sprawdzanie zmiany nie gaśnie po jej rozpoznaniu', () => {
    // Bez tego nic w działającej karcie nie zapyta o zmianę drugi raz.
    const { env } = openOvernight(6);
    ok(env.SH.store.sessionConfig.shiftType, 'zmiana rozpoznana');
    ok(env.SH.Main.shiftWatchTimer !== null, 'timer sprawdzania nadal chodzi');
    env.SH.Main.teardown();
    eq(env.SH.Main.shiftWatchTimer, null, 'rozbiórka go gasi');
});

for (const [label, h] of [['dzienna', 6], ['nocna', 18]]) {
    test(`zmiana ${label}: następnego dnia o ${hh(h)}:19 liczniki od zera, bez przeładowania`, () => {
        const { env, clock, cid } = openOvernight(h);
        const S = env.SH.store;
        eq(S.tabCounters[cid], 12, 'czwartek: 12 paczek');

        clock.set(at(18, h, 19) + 10000);
        env.SH.ShiftManager.update();            // to robi timer co 30 s
        eq(S.tabCounters[cid] || 0, 0, 'piątek: licznik od zera');
        eq(S.tasks.length, 1, 'jedno zadanie domyślne');
        eq(new Date(S.sessionConfig.shiftCalculatedStartTime).getDate(), 18, 'zmiana z piątku');
        eq(hhmm(env.SH.TaskManager.span(env.SH.TaskManager.active()).from), `${hh(h)}:30`);
        env.SH.Main.teardown();
    });
}

test('w trakcie tej samej zmiany sprawdzanie niczego nie zeruje', () => {
    // Timer chodzi teraz przez całą zmianę, więc musi być nieszkodliwy
    // o każdej jej porze: po północy na nocnej, w martwej strefie po końcu.
    const { env, clock, cid } = openOvernight(18);
    const S = env.SH.store;
    for (const [day, hour, minute] of [[17, 23, 59], [18, 0, 1], [18, 3, 0], [18, 5, 54], [18, 5, 56], [18, 6, 18]]) {
        clock.set(at(day, hour, minute));
        env.SH.ShiftManager.update();
        eq(S.tabCounters[cid], 12, `o ${hh(hour)}:${hh(minute)} licznik nietknięty`);
    }
    env.SH.Main.teardown();
});

describe('Zmiana czasu — w strefie Europe/Warsaw');

/**
 * Ten sam skrypt w osobnym procesie z TZ=Europe/Warsaw (patrz tz-probe.js):
 * noce zmiany czasu istnieją tylko w strefie, która je ma.
 */
function probe(name) {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'tz-probe.js'), name], {
        env: { ...process.env, TZ: 'Europe/Warsaw' },
        encoding: 'utf8',
    });
    return JSON.parse(out);
}

test('październikowa noc: F5 o 05:35 nie kasuje zmiany, o 06:20 zaczyna się nowa', () => {
    // 18:30 CEST → 05:35 CET to 12 h 05 min zegara. Próg przeterminowania
    // (12 h) brał to za dane z innego dnia i zerował zmianę 20 minut przed końcem.
    const r = probe('octoberNight');
    eq(r.reloadAt0535.counter, 150, 'o 05:35 to wciąż ta sama nocna zmiana');
    ok(r.reloadAt0535.shiftStart.startsWith('Sat Oct 24 2026 18:30'), r.reloadAt0535.shiftStart);
    eq(r.reloadAt0620.counter, 0, 'o 06:20 nowa zmiana dzienna od zera');
    ok(r.reloadAt0620.shiftStart.startsWith('Sun Oct 25 2026 06:30'), r.reloadAt0620.shiftStart);
});

test('„23:30” w noc zmiany czasu to wczoraj 23:30, a nie godzinę obok', () => {
    // Odjęcie 24 h to nie „wczoraj” w dobie, która ma 23 albo 25 godzin.
    const r = probe('parseClockDst');
    ok(r.march.startsWith('Sat Mar 28 2026 23:30'), 'marzec: ' + r.march);
    ok(r.october.startsWith('Sat Oct 24 2026 23:30'), 'październik: ' + r.october);
});

describe('Godzina wpisana ręcznie');

test('godzina wpisana ręcznie to najbliższa taka godzina: dziś albo wczoraj', () => {
    // Nocna zmiana: o 00:40 wpisane „23:30” znaczy pięćdziesiąt minut temu.
    // Ale „06:36” wpisane o 06:35:30 to TERAZ, a nie prawie doba wstecz.
    const clock = makeClock(at(17, 0, 40));
    const env = boot({ clock });
    const TM = env.SH.TaskManager;

    eq(TM.parseClock('23:30'), at(16, 23, 30), '00:40 → wczoraj 23:30');
    eq(TM.parseClock('00:10'), at(17, 0, 10), '00:40 → dziś 00:10');

    clock.set(at(17, 6, 35) + 30000);
    eq(TM.parseClock('06:36'), at(17, 6, 36), 'pół minuty do przodu to dziś');
    eq(TM.parseClock('06:35'), at(17, 6, 35), 'bieżąca minuta to dziś');

    clock.set(at(17, 14, 0));
    eq(TM.parseClock('03:00'), at(17, 3, 0), 'rano tego samego dnia');
    eq(TM.parseClock('00:00'), at(17, 0, 0), 'północ to dziś 00:00');
    // Dzisiejsza 23:59 jest bliżej niż wczorajsza — a przyszłość setStart przytnie do teraz.
    eq(TM.parseClock('23:59'), at(17, 23, 59), '23:59 o 14:00 to dziś, bo bliżej');
    for (const bad of ['24:00', '23:60', '99:99', '-1:00', '', 'abc', null, '12:30 x']) {
        eq(TM.parseClock(bad), null, 'nie godzina: ' + JSON.stringify(bad));
    }
    env.SH.Main.teardown();
});

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
