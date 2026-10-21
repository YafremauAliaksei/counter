/**
 * 41-adaptive-target.test.js — paczki zmiany, gdy skrypt startuje w połowie
 * zmiany, i język na górze panelu.
 *
 * Przypadek z pracy: po obiedzie człowiek siada do innego stanowiska (czysta
 * przeglądarka, zero danych) o 23:55 i cofa początek zadania na 23:50. Tempo
 * liczy się od 23:50, ale „4 z 300” kłamie — od 18:30 przepracował prawie
 * pięć godzin. Czas sprzed pierwszego zadania (bez obiadu) dolicza się więc
 * według celu działu, a liczba dostaje „≈”.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const at = (d, h, m) => new Date(2026, 8, d, h, m, 0).getTime();

function nightRefurb() {
    const env = bootOnStand({ href: 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN_REFURB' });
    const S = env.SH.store;
    env.clock.set(at(16, 23, 58));
    S.sessionConfig.shiftType = 'night';
    S.sessionConfig.shiftCalculatedStartTime = at(16, 18, 30);
    S.sessionConfig.selectedLunchIndex = 4;                     // 23:20–23:50
    S.sessionConfig.activeTabInstances = { REFURB: Date.now() };
    const task = env.SH.TaskManager.active();
    task.segments = [{ from: at(16, 23, 50), to: null }];
    for (let i = 0; i < 4; i++) env.SH.InputManager.modifyCounter(1);
    const line7 = () => { env.SH.StatsWindowRenderer.renderContent(); return env.SH.StatsWindowRenderer.lines.line7_compact.textContent; };
    return { env, S, task, line7 };
}

describe('Paczki zmiany przy starcie w połowie zmiany');

test('noc, REFURB 30/h, zadanie od 23:50, 4 paczki o 23:58: tempo 30, paczki ≈149 z 300', () => {
    // 18:30–23:50 to 5 h 20 min, minus obiad 23:20–23:50 = 4 h 50 min → 145.
    const { line7 } = nightRefurb();
    eq(line7(), '30.0 z 30 · ≈149 z 300 · 0%');
});

test('zadanie od początku zmiany: nic się nie dolicza, bez „≈”', () => {
    const { S, task, line7 } = nightRefurb();
    task.segments = [{ from: S.sessionConfig.shiftCalculatedStartTime, to: null }];
    ok(/ · 4 z 300 · /.test(line7()), line7());
});

test('przerwa między zadaniami to pauza, nie praca — dolicza się tylko czas przed pierwszym', () => {
    const { env, S, task, line7 } = nightRefurb();
    // Pierwsze zadanie 18:30–19:30, potem nic do 23:50: dolicza się zero.
    const first = env.SH.TaskManager.create('wcześniej', at(16, 18, 30));
    first.segments = [{ from: at(16, 18, 30), to: at(16, 19, 30) }];
    S.activeTaskId = task.id;
    ok(/ · 4 z 300 · /.test(line7()), line7());
});

test('bez celu działu nic się nie dolicza', () => {
    const { env, line7 } = nightRefurb();
    env.SH.CONFIG.RATE_TARGETS.REFURB = 0;
    eq(line7(), '30.0 · 4 · 0%');
});

test('bez rozpoznanej zmiany nic się nie dolicza', () => {
    const { S, env } = nightRefurb();
    S.sessionConfig.shiftCalculatedStartTime = null;
    eq(env.SH.TaskManager.untrackedWorkedMs(), 0);
});

describe('Panel');

test('wybór języka stoi na górze panelu, przed zadaniami', () => {
    const env = bootOnStand();
    env.SH.SettingsPanel.toggle();
    // [0] tytuł, [1] wiersz z językiem, potem sekcja zadań.
    const children = env.SH.SettingsPanel.el.children;
    ok(String(children[1].textContent).includes(env.SH.I18n.get('language')), 'drugi element to język');
});
