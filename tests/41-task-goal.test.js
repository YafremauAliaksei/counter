/**
 * 41-task-goal.test.js — cel bieżącego zadania w liniach 7 i 10.
 *
 * Przypadek z pracy: człowiek przychodzi do procesu o 16:00, zmiana kończy się
 * o 17:00, cel to 30 na godzinę. Linia 7 ma powiedzieć „0 z 30”, a nie
 * „0 z 300” całej zmiany. Pauza i praca w innym zadaniu nie zatrzymują zegara
 * zmiany, więc cel maleje w tempie celu: półtorej godziny poza zadaniem przy
 * celu 30 to 45 paczek mniej. Paczki innych zadań w linii 7 się nie pojawiają.
 *
 * Granice: koniec zmiany z obiadem i bez, zmiana nocna przez północ, początek
 * i koniec odcinka wpisane naprzód, czas po końcu zmiany, zmiana
 * nierozpoznana, cel 0.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { bootOnStand, makeClock } = require('./dom-stub');

const at = (d, h, m) => new Date(2026, 8, d, h, m, 0).getTime();

/** REFURB (cel 30), zmiana dzienna 06:30 z obiadem 12:50–13:20, zegar na `now`. */
function refurb(now, shift = 'day') {
    // Zegar od startu na `now`: cofnięcie zegara po starcie zostawiłoby
    // w magazynie znaczniki „z przyszłości”, które wygrywają scalanie zadań.
    const env = bootOnStand({ href: 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN_REFURB', clock: makeClock(now) });
    const S = env.SH.store;
    S.sessionConfig.shiftType = shift;
    S.sessionConfig.shiftCalculatedStartTime = shift === 'day' ? at(16, 6, 30) : at(16, 18, 30);
    S.sessionConfig.selectedLunchIndex = shift === 'day' ? 3 : 4;   // 12:50–13:20 / 23:20–23:50
    S.sessionConfig.activeTabInstances = { REFURB: now };
    const TM = env.SH.TaskManager;
    const line7 = () => { env.SH.StatsWindowRenderer.renderContent(); return env.SH.StatsWindowRenderer.lines.line7_compact.textContent; };
    return { env, S, TM, line7, task: TM.active() };
}

describe('Koniec zmiany');

test('dzienna 06:30 z obiadem kończy się o 17:00, bez obiadu o 16:30, nocna o 05:00', () => {
    const { env, S } = refurb(at(16, 12, 0));
    eq(env.SH.ShiftManager.shiftEndMs(), at(16, 17, 0));
    S.sessionConfig.selectedLunchIndex = null;
    eq(env.SH.ShiftManager.shiftEndMs(), at(16, 16, 30), 'bez obiadu');
    const night = refurb(at(16, 22, 0), 'night');
    eq(night.env.SH.ShiftManager.shiftEndMs(), at(17, 5, 0), 'przez północ');
    night.S.sessionConfig.selectedLunchIndex = 6;                     // 00:20–00:50, już po północy
    eq(night.env.SH.ShiftManager.shiftEndMs(), at(17, 5, 0), 'obiad po północy');
});

test('zmiana nierozpoznana: końca nie ma, linia 7 bez „z …”', () => {
    const { S, TM, task, line7 } = refurb(at(16, 16, 0));
    S.sessionConfig.shiftCalculatedStartTime = null;
    task.segments = [{ from: at(16, 16, 0), to: null }];
    eq(TM.taskGoal(task, 30), null);
    eq(line7(), '0.0 z 30 · 0 · 0%');
});

describe('Cel zadania');

test('przyjście o 16:00 przy końcu o 17:00 i celu 30: „0 z 30”, po pół godzinie „15 z 30”', () => {
    const { env, task, line7 } = refurb(at(16, 16, 0));
    task.segments = [{ from: at(16, 16, 0), to: null }];
    eq(line7(), '0.0 z 30 · 0 z 30 · 0%');
    env.clock.set(at(16, 16, 30));
    for (let i = 0; i < 15; i++) env.SH.InputManager.modifyCounter(1);
    eq(line7(), '30.0 z 30 · 15 z 30 · 0%', 'w tempie celu — cel się nie zmienia');
});

test('półtorej godziny pauzy przy celu 30 to 45 paczek mniej', () => {
    const { env, TM, task } = refurb(at(16, 10, 0));
    // 08:00–10:00 w zadaniu, potem pauza.
    task.segments = [{ from: at(16, 8, 0), to: at(16, 10, 0) }];
    // 2 h + (10:00 → 17:00 = 7 h − obiad 0,5 h) = 8,5 h × 30.
    eq(TM.taskGoal(task, 30), 255);
    env.clock.set(at(16, 11, 30));
    eq(TM.taskGoal(task, 30), 210, '255 − 45 po 1,5 h pauzy');
    TM.resume(task.id, at(16, 11, 30));
    env.clock.set(at(16, 12, 0));
    eq(TM.taskGoal(task, 30), 210, 'po powrocie cel stoi w miejscu');
});

test('czas w innym zadaniu działa jak pauza; paczek innego zadania nie widać', () => {
    const { env, TM, line7 } = refurb(at(16, 9, 0));
    const first = TM.create('pierwsze', at(16, 8, 0));
    for (let i = 0; i < 50; i++) env.SH.InputManager.modifyCounter(1);
    env.clock.set(at(16, 10, 0));
    const second = TM.create('drugie', at(16, 10, 0));
    // 10:00 → 17:00 bez obiadu = 6,5 h × 30.
    eq(TM.taskGoal(second, 30), 195);
    eq(line7(), '0.0 z 30 · 0 z 195 · 0%', '50 paczek pierwszego zadania tu nie wchodzi');
    eq(TM.totals(first).done, 50, 'zostały w pierwszym zadaniu');
});

test('obiad nie zabiera celu: zadanie od 06:30 ma 300 także w czasie obiadu', () => {
    const { env, TM, task } = refurb(at(16, 8, 0));
    task.segments = [{ from: at(16, 6, 30), to: null }];
    eq(TM.taskGoal(task, 30), 300);
    env.clock.set(at(16, 13, 0));
    eq(TM.taskGoal(task, 30), 300, 'w czasie obiadu');
    env.clock.set(at(16, 16, 59));
    eq(TM.taskGoal(task, 30), 300, 'minuta przed końcem');
});

test('koniec odcinka wpisany naprzód (18:30-22:00 o 21:39) kończy cel o 22:00', () => {
    const { TM, task } = refurb(at(16, 21, 39), 'night');
    task.segments = [{ from: at(16, 18, 30), to: at(16, 22, 0) }];
    eq(TM.taskGoal(task, 30), 105, '3,5 h × 30');
});

test('początek wpisany naprzód (18:30 o 18:25): cel całej nocy, 0 przepracowanych minut', () => {
    const { TM, task, line7 } = refurb(at(16, 18, 25), 'night');
    task.segments = [{ from: at(16, 18, 30), to: null }];
    eq(TM.taskGoal(task, 30), 300);
    eq(line7(), '0.0 z 30 · 0 z 300 · 0%');
});

test('po końcu zmiany cel to już tylko czas przepracowany — nic ujemnego', () => {
    const { TM, task } = refurb(at(16, 17, 30));
    task.segments = [{ from: at(16, 16, 0), to: null }];
    eq(TM.taskGoal(task, 30), 45, '1,5 h × 30, zadanie trwało po 17:00');
});

test('granice: cel 0, NaN, brak zadania — bez celu; minuta do końca — cel z minuty', () => {
    const { env, TM, task } = refurb(at(16, 16, 59));
    task.segments = [{ from: at(16, 16, 59), to: null }];
    for (const bad of [0, NaN, null]) eq(TM.taskGoal(task, bad), null, String(bad));
    eq(TM.taskGoal(null, 30), null);
    eq(TM.taskGoal(task, 30), 1, '1 minuta × 30/h = 0,5 → 1');
    env.clock.set(at(16, 17, 0));
    eq(TM.taskGoal(task, 30), 1, 'na końcu zmiany zostaje przepracowana minuta');
});

describe('Linia 10');

test('linia 10 mówi o zadaniu: cel, procent tempa zadania, paczki zadania z celu zadania', () => {
    const { env, task } = refurb(at(16, 16, 0));
    task.segments = [{ from: at(16, 16, 0), to: null }];
    env.clock.set(at(16, 16, 30));
    // 16, a nie 15: zegar testu płynie, a przy równych 30/h milisekunda
    // dałaby 99%.
    for (let i = 0; i < 16; i++) env.SH.InputManager.modifyCounter(1);
    env.SH.store.localTabConfig.linesConfig.line10_target.visible = true;
    env.SH.StatsWindowRenderer.renderContent();
    eq(env.SH.StatsWindowRenderer.lines.line10_target.textContent, '30/h 106% 16/30');
});

test('linia 10 bez rozpoznanej zmiany: cel i procent są, celu zadania nie ma', () => {
    const { env, S, task } = refurb(at(16, 16, 0));
    S.sessionConfig.shiftCalculatedStartTime = null;
    task.segments = [{ from: at(16, 16, 0), to: null }];
    env.SH.StatsWindowRenderer.renderContent();
    ok(/^30\/h 0% 0\/—$/.test(env.SH.StatsWindowRenderer.lines.line10_target.textContent),
       env.SH.StatsWindowRenderer.lines.line10_target.textContent);
});
