/**
 * 03-line7.test.js — format linii 7.
 *
 * Linia 7 to jedyne, co widać domyślnie, więc jej format jest częścią umowy
 * z użytkownikiem:
 *
 *     34.3 z 47 · 12 z 30 · 14% · 2m 41s
 *
 * wszystko o BIEŻĄCYM zadaniu: tempo z celu działu, paczki z celu zadania
 * (cel × czas zadania do końca zmiany), procent sprzedaży zadania i czas od
 * ostatniego pojemnika. Paczki innych zadań i innych kart spoza zadania tu
 * nie wchodzą. Testy trzymają ten format dosłownie; cel zadania w szczegółach
 * sprawdza 41-task-goal.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, setShift } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const S = SH.store;
const line7 = () => SH.StatsWindowRenderer.lines.line7_compact.textContent;
const render = () => SH.StatsWindowRenderer.renderContent();

/** Zadanie domyślne zaczęte razem ze zmianą i n paczek w CRET. */
function work(hours, items) {
    setShift(env, hours);
    const task = SH.TaskManager.active();
    task.segments = [{ from: S.sessionConfig.shiftCalculatedStartTime, to: null }];
    for (let i = 0; i < items; i++) SH.InputManager.modifyCounter(1);
}

describe('Linia 7 — dokładny format wyjścia');

test('na starcie: zadanie od początku zmiany ma cel całej zmiany (47 × 10)', () => {
    render();
    eq(line7(), '0.0 z 47 · 0 z 470 · 0%');
});

test('tempo zadania z celu, paczki zadania z celu zadania', () => {
    work(2, 20);
    render();
    eq(line7(), '10.0 z 47 · 20 z 470 · 0%', '20 paczek przez 2 h zadania; zadanie trwa całą zmianę');
});

test('paczki karty spoza zadania nie wchodzą do linii 7', () => {
    // WHD ma 15 paczek na liczniku karty, ale żadnej w bieżącym zadaniu —
    // linia 7 mówi wyłącznie o zadaniu. Sumę zmiany pokazuje linia 2.
    S.tabCounters.WHD = 15;
    S.sessionConfig.activeTabInstances = { CRET: Date.now(), WHD: Date.now() };
    render();
    eq(line7(), '10.0 z 47 · 20 z 470 · 0%');
    S.tabCounters.WHD = 0;
});

test('paczki linii 7 to paczki zadania z linii 8', () => {
    const cfg = S.localTabConfig.linesConfig.line8_taskInfo;
    cfg.visible = true;
    render();
    const packs = line7().split(' · ')[1].split(' ')[0];
    eq(SH.StatsWindowRenderer.lines.line8_taskInfo.textContent.split(' ')[1], packs);
    cfg.visible = false;
    render();
});

test('nowe zadanie: własne tempo, własne paczki, cel od jego początku do końca zmiany', () => {
    // Pół godziny nowego procesu i 10 paczek to 20/h; 20 paczek poprzedniego
    // zadania tu nie ma. Cel: 47 × (pół godziny + 8 h do końca zmiany).
    SH.TaskManager.create('fast', Date.now() - 30 * 60000);
    for (let i = 0; i < 10; i++) SH.InputManager.modifyCounter(1);
    render();
    const goal = SH.TaskManager.taskGoal(SH.TaskManager.active(), 47);
    ok(Math.abs(goal - 47 * 8.5) <= 1, 'cel 47 × 8,5 h: ' + goal);
    eq(line7(), `20.0 z 47 · 10 z ${goal} · 0%`);
});

test('bez celu działu (0, NaN, tekst) znika „z …”', () => {
    for (const bad of [0, NaN, 'x']) {
        SH.CONFIG.RATE_TARGETS.CRET = bad;
        render();
        eq(line7(), '20.0 · 10 · 0%', String(bad));
    }
    SH.CONFIG.RATE_TARGETS.CRET = 47;
});

test('czas od pojemnika na końcu; po limicie czerwony', () => {
    S.sessionConfig.lastToteAt = Date.now() - 60000;
    render();
    ok(/ · 1m 0\ds$/.test(line7()), 'minuta od pojemnika: ' + line7());
    const timer = () => { const c = SH.StatsWindowRenderer.lines.line7_compact.children; return c[c.length - 1]; };
    const span = timer();
    eq(span.style.color, '', 'przed limitem bez czerwieni');
    S.sessionConfig.lastToteAt = Date.now() - 10 * 60000;
    render();
    eq(timer().style.color, SH.CONFIG.OFF_TASK_COLOR);
    S.sessionConfig.lastToteAt = null;
});

test('spójnik idzie ze słownika', () => {
    for (const [lang, word] of [['pl', 'z'], ['en', 'of']]) {
        S.userConfig.language = lang;
        render();
        ok(line7().startsWith(`20.0 ${word} 47`), lang + ': ' + line7());
    }
    S.userConfig.language = 'pl';
});

test('wyłączona linia 6 nie rusza dziennika wartości', () => {
    // ValueLog.totals() przechodzi po WSZYSTKICH wpisach; linia 6 jest jedynym
    // odbiorcą tego przebiegu, więc przy wyłączonej linii nie wykonuje się.
    const VL = SH.ValueLog;
    const realTotals = VL.totals;
    let calls = 0;
    VL.totals = function () { calls++; return realTotals.call(this); };
    eq(S.localTabConfig.linesConfig.line6_valueSum.visible, false, 'linia 6 domyślnie wyłączona');
    render();
    eq(calls, 0, 'totals() przy wyłączonej linii 6');
    VL.totals = realTotals;
});
