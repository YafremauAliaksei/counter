/**
 * 45-panel-layout.test.js — panel ustawień ułożony przez autora, cel własny
 * i godziny zadania w przyszłości.
 *
 * CZEGO TU PILNUJEMY.
 *   - Kolejność sekcji jest decyzją autora (makieta z przeciąganiem): na
 *     górze przerwa, cel i zadania, na dole język i reset.
 *   - Zwinięta sekcja okna statystyk działa jak zwinięta kategoria kanałów:
 *     zostają na widoku ustawienia linii włączonych, reszta się chowa.
 *   - Cel własny (np. 65/h) zastępuje cel działu na każdej karcie, bez
 *     wydania. Pola „do tempa liczą się” wyłączają karty z tempa wobec celu.
 *   - Pola zapisują się bez Enter i nie gubią fokusu przy przerysowaniu.
 *   - Zadanie można zacząć do pół godziny naprzód i zakończyć naprzód
 *     („18:30-22:00” o 21:39); zegar staje sam o tej godzinie.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const AUTHOR_ORDER = ['lunch', 'workflow', 'tasks', 'global', 'current_tab', 'visual', 'window',
                      'keys', 'auto', 'price_module', 'price_card', 'value_log', 'code', 'language', 'general', 'diag'];

/** Środowisko z otwartym panelem i natychmiastowym przerysowaniem (jak w 23-task-panel). */
function panelEnv(opts) {
    const env = bootOnStand(opts);
    const SH = env.SH;
    SH.SettingsPanel.rerender = function () {
        if (SH.store.uiFlags.isSettingsPanelVisible) this.render();
    };
    if (!SH.store.uiFlags.isSettingsPanelVisible) SH.SettingsPanel.toggle();
    SH.SettingsPanel.render();
    return env;
}

function nodes(root) {
    const out = [];
    (function walk(n) { out.push(n); (n.children || []).forEach(walk); })(root);
    return out;
}

/** Sekcja panelu po identyfikatorze. */
function section(env, id) {
    return env.SH.SettingsPanel.el.children.find(c => c.dataset && c.dataset.shSection === id) || null;
}

/** Elementy treści sekcji (pod nagłówkiem) i to, czy są widoczne. */
function content(sec) {
    return sec.children[1].children;
}
const shown = (el) => el.style.display !== 'none';

/** Pole w wierszu opisanym etykietą. */
function fieldIn(env, label) {
    const row = nodes(env.SH.SettingsPanel.el).find(n => n.tagName === 'DIV'
        && String(n.textContent).startsWith(label)
        && n.children.some(c => (c.children || []).some(g => g.tagName === 'INPUT')));
    return row ? nodes(row).find(n => n.tagName === 'INPUT') : null;
}

function type(input, value) {
    input.value = String(value);
    input.dispatch('change', { target: input });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('Kolejność sekcji z makiety autora');

test('sekcje stoją w kolejności z makiety: przerwa i cel na górze, język i reset na dole', () => {
    const env = panelEnv();
    const ids = env.SH.SettingsPanel.el.children
        .filter(c => c.dataset && c.dataset.shSection)
        .map(c => c.dataset.shSection);
    // Karta CRET z wyłączonym modułem cen: bez sekcji karty nierozpoznanej
    // i bez dziennika wartości — reszta w kolejności autora.
    eq(ids, AUTHOR_ORDER.filter(id => ids.includes(id)), 'kolejność');
    eq(ids[0], 'lunch');
    eq(ids[ids.length - 1], 'diag', 'diagnostyka na samym końcu');
    eq(ids[ids.length - 2], 'general', 'reset tuż nad nią');
    eq(ids[ids.length - 3], 'language');
    ok(ids.length >= 12, 'wszystkie sekcje karty CRET: ' + ids.join(','));
});

test('karta nierozpoznana ma swoją sekcję między licznikami a efektami', () => {
    const env = panelEnv({ href: 'https://trex-prod-eu.aka.amazon.com/?gradingMode=COS_NIEZNANEGO' });
    const ids = env.SH.SettingsPanel.el.children.filter(c => c.dataset && c.dataset.shSection).map(c => c.dataset.shSection);
    ok(ids.includes('current_tab'), ids.join(','));
    ok(ids.indexOf('global') < ids.indexOf('current_tab') && ids.indexOf('current_tab') < ids.indexOf('visual'));
});

describe('Zwijanie sekcji');

test('okno statystyk zwinięte domyślnie: widać tylko włączoną linię 7, reszta schowana', () => {
    const env = panelEnv();
    const sec = section(env, 'window');
    const items = content(sec);
    const visibleLines = items.filter(shown).map(c => c.dataset.shLine);
    eq(visibleLines, ['line7_compact'], 'tylko linia 7 (domyślnie jedyna włączona)');
    // Nagłówek mówi, ile schowano.
    const hidden = items.filter(c => !shown(c)).length;
    ok(String(sec.children[0].textContent).includes('+' + hidden), sec.children[0].textContent);
    eq(sec.children[0].getAttribute('aria-expanded'), 'false');
});

test('rozwinięcie pokazuje wszystko; włączone 2 i 10, po zwinięciu zostają 2, 7 i 10', () => {
    const env = panelEnv();
    const S = env.SH.store;
    let sec = section(env, 'window');
    sec.children[0].dispatch('click', {});
    ok(content(sec).every(shown), 'rozwinięta sekcja pokazuje wszystkie elementy');
    eq(S.userConfig.panelSections.window, true, 'wybór zapamiętany');
    S.localTabConfig.linesConfig.line2_globalSummary.visible = true;
    S.localTabConfig.linesConfig.line10_target.visible = true;
    sec.children[0].dispatch('click', {});
    eq(content(sec).filter(shown).map(c => c.dataset.shLine).sort(),
       ['line10_target', 'line2_globalSummary', 'line7_compact']);
    // Stan przetrwa przerysowanie panelu.
    env.SH.SettingsPanel.render();
    sec = section(env, 'window');
    eq(content(sec).filter(shown).length, 3);
});

test('zwykła sekcja zwinięta chowa wszystko poza nagłówkiem i pamięta to po przerysowaniu', () => {
    const env = panelEnv();
    let sec = section(env, 'keys');
    ok(content(sec).every(shown), 'domyślnie rozwinięta');
    sec.children[0].dispatch('click', {});
    ok(content(sec).every(c => !shown(c)), 'zwinięta');
    env.SH.SettingsPanel.render();
    sec = section(env, 'keys');
    ok(content(sec).every(c => !shown(c)), 'po przerysowaniu dalej zwinięta');
});

test('spreparowane panelSections (tekst, liczba, null) nie psują panelu', () => {
    for (const junk of ['abc', 42, null, ['window']]) {
        const env = panelEnv();
        env.SH.store.userConfig.panelSections = junk;
        env.SH.SettingsPanel.render();
        const sec = section(env, 'window');
        ok(sec, 'panel narysowany przy ' + JSON.stringify(junk));
        eq(content(sec).filter(shown).length, 1, 'stan domyślny przy ' + JSON.stringify(junk));
        sec.children[0].dispatch('click', {});
        eq(env.SH.store.userConfig.panelSections.window, true, 'klik zapisuje mapę zamiast śmiecia');
    }
});

describe('Cel własny');

test('cel własny wygrywa z celem działu i z profilem FAST; 0 wraca do wbudowanych', () => {
    const env = panelEnv();
    const S = env.SH.store;
    const line10 = () => {
        S.localTabConfig.linesConfig.line10_target.visible = true;
        env.SH.StatsWindowRenderer.renderContent();
        return env.SH.StatsWindowRenderer.lines.line10_target.textContent;
    };
    ok(line10().startsWith('47/h'), 'CRET bez celu własnego: ' + line10());
    S.userConfig.cretProfile = 'FAST';
    ok(line10().startsWith('80/h'), 'FAST: ' + line10());
    S.userConfig.customTarget = 65;
    ok(line10().startsWith('65/h'), 'cel własny wygrywa z FAST: ' + line10());
    S.userConfig.customTarget = 0;
    ok(line10().startsWith('80/h'), 'zero wraca do celu działu');
});

test('granice celu własnego: 1, 999, 1000, ujemny, NaN, tekst, ułamek', () => {
    const env = panelEnv();
    const S = env.SH.store;
    const line10 = () => {
        S.localTabConfig.linesConfig.line10_target.visible = true;
        env.SH.StatsWindowRenderer.renderContent();
        return env.SH.StatsWindowRenderer.lines.line10_target.textContent.split(' ')[0];
    };
    for (const [v, want] of [[1, '1/h'], [999, '999/h'], [1000, '999/h'], [-5, '47/h'], [NaN, '47/h'],
                             ['65abc', '47/h'], ['65', '65/h'], [64.9, '64/h'], [Infinity, '47/h'], [null, '47/h']]) {
        S.userConfig.customTarget = v;
        eq(line10(), want, 'customTarget = ' + String(v));
    }
});

test('pole w panelu: wpisane 65 zapisuje się, puste pole to brak celu, 1000 przycina do 999', () => {
    const env = panelEnv();
    const S = env.SH.store;
    const label = env.SH.I18n.get('workflow_customTarget');
    type(fieldIn(env, label), 65);
    eq(S.userConfig.customTarget, 65);
    type(fieldIn(env, label), '');
    eq(S.userConfig.customTarget, 0, 'puste pole');
    type(fieldIn(env, label), 1000);
    eq(S.userConfig.customTarget, 999);
    type(fieldIn(env, label), 'abc');
    eq(S.userConfig.customTarget, 999, 'śmieć nie zmienia celu');
    type(fieldIn(env, label), 0);
    eq(S.userConfig.customTarget, 0);
});

test('wybór CRET/FAST znika, gdy obowiązuje cel własny — inaczej udawałby, że coś zmienia', () => {
    const env = panelEnv();
    const S = env.SH.store;
    const cretLabel = env.SH.I18n.get('workflow_cretProfile');
    const hasSelect = () => nodes(env.SH.SettingsPanel.el).some(n => n.tagName === 'LABEL' && String(n.textContent).startsWith(cretLabel));
    ok(hasSelect(), 'bez celu własnego wybór jest');
    S.userConfig.customTarget = 65;
    env.SH.SettingsPanel.render();
    notOk(hasSelect(), 'z celem własnym go nie ma');
});

test('cel własny jedzie w kodzie ustawień', () => {
    const env = panelEnv();
    env.SH.store.userConfig.customTarget = 65;
    const code = env.SH.ConfigCode.encode();
    const other = panelEnv();
    other.SH.ConfigCode.apply(code);
    eq(other.SH.store.userConfig.customTarget, 65);
});

describe('Karty liczone do tempa — wybór każdego zadania osobno');

/**
 * Scenariusz autora. Zadanie „stare”: godzina, CRET 20, WHD 10, REFURB 3,
 * wszystko liczone — tempo 33. Potem zadanie „nowe”: liczy CRET i REFURB,
 * a WHD człowiek robi, bo system go tam kieruje. Godzina: CRET 100, WHD 90,
 * REFURB 10 — tempo 110, a 90 z WHD widać jako zrobione.
 */
function twoTasks() {
    const env = panelEnv();
    const S = env.SH.store;
    const TM = env.SH.TaskManager;
    const now = env.clock.now();
    S.tasks = [];
    S.activeTaskId = null;
    S.taskCounters = {};
    env.sandbox.localStorage.removeItem(env.SH.Persistence.getKey(env.SH.CONFIG.STORAGE_KEY_TASKS));
    const old = TM.create('stare', now - 2 * HOUR);
    S.taskCounters = { [old.id]: { CRET: { done: 20, sold: 0, neutral: 0 }, WHD: { done: 10, sold: 0, neutral: 0 },
                                   REFURB: { done: 3, sold: 0, neutral: 0 } } };
    const fresh = TM.create('nowe', now - HOUR);
    S.taskCounters = { ...S.taskCounters, [fresh.id]: { CRET: { done: 100, sold: 0, neutral: 0 },
        WHD: { done: 90, sold: 0, neutral: 0 }, REFURB: { done: 10, sold: 0, neutral: 0 } } };
    env.SH.SettingsPanel.render();
    return { env, S, TM, old, fresh };
}

/** Pole wyboru karty w sekcji celu (dotyczy bieżącego zadania). */
function tabBox(env, key) {
    const label = nodes(section(env, 'workflow')).find(n => n.tagName === 'LABEL' && n.textContent === key);
    return label && label.children[0];
}
function untick(env, key) {
    const chk = tabBox(env, key);
    chk.checked = false;
    chk.dispatch('change', { target: chk });
}

test('stare zadanie: CRET 20 + WHD 10 + REFURB 3 w godzinę — tempo 33', () => {
    const { TM, old } = twoTasks();
    eq(TM.countedRate(old).toFixed(1), '33.0');
    eq(TM.packsText(old), '33');
});

test('nowe zadanie bez WHD: CRET 100 + REFURB 10 = tempo 110, a 90 z WHD widać jako zrobione', () => {
    const { env, TM, fresh } = twoTasks();
    eq(TM.countedRate(fresh).toFixed(1), '200.0', 'przed odznaczeniem liczy się wszystko');
    untick(env, 'WHD');
    eq(fresh.excludedTabs, ['WHD']);
    eq(TM.countedRate(fresh).toFixed(1), '110.0');
    eq(TM.packsText(fresh), '110+90', 'zrobione z WHD po plusie');
    eq(TM.totals(fresh).done, 200, 'paczki zadania nietknięte');
    const W = env.SH.StatsWindowRenderer;
    env.SH.store.localTabConfig.linesConfig.line8_taskInfo.visible = true;
    W.renderContent();
    ok(W.lines.line7_compact.textContent.startsWith('110.0 '), 'linia 7: ' + W.lines.line7_compact.textContent);
    ok(W.lines.line8_taskInfo.textContent.startsWith('nowe 110+90 110.0/h'), 'linia 8: ' + W.lines.line8_taskInfo.textContent);
});

test('odznaczenie w nowym zadaniu nie zmienia tempa zadania zakończonego', () => {
    const { env, TM, old } = twoTasks();
    untick(env, 'WHD');
    eq(old.excludedTabs, [], 'stare zadanie bez zmian');
    eq(TM.countedRate(old).toFixed(1), '33.0', 'stare tempo zostaje');
    // Historia w panelu pokazuje tempo każdego zadania po jego własnym wyborze.
    const text = String(section(env, 'tasks').textContent);
    ok(text.includes('33 · 33.0'), 'stare w historii: ' + text);
    ok(text.includes('110+90 · 110.0'), 'nowe w historii');
});

test('wznowione zadanie wraca ze swoim wyborem; panel pokazuje pola tego zadania', () => {
    const { env, S, TM, old, fresh } = twoTasks();
    untick(env, 'WHD');
    TM.resume(old.id, env.clock.now());
    env.SH.SettingsPanel.render();
    ok(tabBox(env, 'WHD').checked, 'stare zadanie liczy WHD');
    TM.resume(fresh.id, env.clock.now());
    env.SH.SettingsPanel.render();
    notOk(tabBox(env, 'WHD').checked, 'nowe — nie');
    eq(S.activeTaskId, fresh.id);
});

test('nowe zadanie zaczyna z wszystkimi kartami — wybór poprzedniego procesu nie przechodzi', () => {
    const { env, TM } = twoTasks();
    untick(env, 'WHD');
    const third = TM.create('trzecie', env.clock.now());
    eq(third.excludedTabs, []);
    ok(TM.countsFor(third, 'WHD'));
});

test('ponowne zaznaczenie wraca do pełnego tempa; dwa odznaczenia tej samej karty to jedno', () => {
    const { env, TM, fresh } = twoTasks();
    TM.setCounted(fresh.id, 'WHD', false);
    TM.setCounted(fresh.id, 'WHD', false);
    eq(fresh.excludedTabs, ['WHD']);
    TM.setCounted(fresh.id, 'REFURB', false);
    eq(TM.countedRate(fresh).toFixed(1), '100.0', 'sam CRET');
    TM.setCounted(fresh.id, 'WHD', true);
    TM.setCounted(fresh.id, 'REFURB', true);
    eq(TM.countedRate(fresh).toFixed(1), '200.0');
    void env;
});

test('wszystkie karty odznaczone: tempo 0, paczki dalej widać', () => {
    const { TM, fresh } = twoTasks();
    for (const k of ['CRET', 'WHD', 'REFURB']) TM.setCounted(fresh.id, k, false);
    eq(TM.countedRate(fresh), 0);
    eq(TM.packsText(fresh), '0+200');
});

test('zadanie bez pola excludedTabs (np. domyślne) liczy wszystko; nieznane id nie wywraca', () => {
    const { TM, old } = twoTasks();
    delete old.excludedTabs;
    eq(TM.countedRate(old).toFixed(1), '33.0');
    TM.setCounted('nie-ma-takiego', 'WHD', false);
    TM.setCounted(old.id, null, false);
    ok(!old.excludedTabs || !old.excludedTabs.includes(null));
});

test('pole tempa w panelu: tempo z kart liczonych; wpisanie przelicza paczki na karcie bieżącej', () => {
    const { env, TM, fresh } = twoTasks();
    untick(env, 'WHD');
    const field = fieldIn(env, env.SH.I18n.get('tasks_rate'));
    eq(field.value, '110.0', 'pole pokazuje tempo z linii 7');
    type(fieldIn(env, env.SH.I18n.get('tasks_rate')), 120);
    eq(TM.countedRate(fresh).toFixed(1), '120.0', 'dopisano 10 na CRET (karta stanowiska)');
    eq(TM.totals(fresh).done, 210);
    // Na karcie nieliczonej wpisanie tempa nie ma czego ruszyć — nic się nie dzieje.
    eq(TM.setRate(fresh, 300, 'WHD'), null);
    eq(TM.totals(fresh).done, 210);
});

test('wybór zadania przeżywa zapis i odczyt z magazynu; śmieci w magazynie odpadają', () => {
    const { env, TM, fresh } = twoTasks();
    untick(env, 'WHD');
    const P = env.SH.Persistence;
    const cleaned = P.cleanTasks([{ ...fresh }]);
    eq(cleaned[0].excludedTabs, ['WHD']);
    for (const [junk, want] of [['WHD', []], [null, []], [[1, 'WHD', 'WHD', {}, 'a b', 'x'.repeat(65)], ['WHD']],
                                [['__proto__'], ['__proto__']], [undefined, []]]) {
        eq(P.cleanTasks([{ ...fresh, excludedTabs: junk }])[0].excludedTabs, want, JSON.stringify(junk));
    }
    void TM;
});

test('druga karta przeglądarki dostaje wybór zadania przez scalanie zapisu', () => {
    const { env, TM, fresh } = twoTasks();
    const before = TM._signature(fresh);
    TM.setCounted(fresh.id, 'WHD', false);
    ok(TM._signature(fresh) !== before, 'zmiana wyboru zmienia podpis — zapis nie zostanie pominięty');
    void env;
});

describe('Pola bez Enter i bez gubienia fokusu');

test('wpisana liczba zapisuje się sama po chwili bez pisania, bez change i bez Enter', async () => {
    const env = bootOnStand();
    env.SH.CONFIG.PANEL_INPUT_DELAY_MS = 20;
    env.SH.SettingsPanel.rerender = function () { this.render(); };
    if (!env.SH.store.uiFlags.isSettingsPanelVisible) env.SH.SettingsPanel.toggle();
    env.SH.SettingsPanel.render();
    const field = fieldIn(env, env.SH.I18n.get('workflow_customTarget'));
    field.value = '6';
    field.dispatch('input', { target: field });
    field.value = '65';
    field.dispatch('input', { target: field });
    eq(env.SH.store.userConfig.customTarget, 0, 'w trakcie pisania jeszcze nic');
    await wait(60);
    eq(env.SH.store.userConfig.customTarget, 65, 'po przerwie w pisaniu — zapisane, jedną wartością');
});

test('przerysowanie zostawia fokus w tym samym polu, z wpisanym tekstem', () => {
    const env = panelEnv();
    const doc = env.sandbox.document;
    const field = fieldIn(env, env.SH.I18n.get('workflow_customTarget'));
    field.focus();
    field.value = '7';
    env.SH.SettingsPanel.render();
    const again = fieldIn(env, env.SH.I18n.get('workflow_customTarget'));
    ok(again !== field, 'nowy element po przerysowaniu');
    ok(doc.activeElement === again, 'fokus w nowym polu');
    eq(again.value, '7', 'wpisany tekst nie znika');
});

test('strona zabiera fokus z pola, w którym właśnie pisano — fokus wraca, najwyżej 3 razy', async () => {
    const env = panelEnv();
    const doc = env.sandbox.document;
    const field = fieldIn(env, env.SH.I18n.get('workflow_customTarget'));
    const scan = doc.createElement('input');
    doc.body.appendChild(scan);
    // Pisanie w polu: keydown z panelu przechodzi przez onPanelKey.
    env.SH.SettingsPanel.onPanelKey({ type: 'keydown', key: '6', target: field, stopImmediatePropagation() {} });
    const back = [];
    for (let i = 0; i < 5; i++) {
        field.focus();
        scan.focus();
        env.SH.SettingsPanel.onFocusOut({ target: field, relatedTarget: scan });
        await wait(5);
        back.push(doc.activeElement === field);
    }
    // Trzy powroty, potem panel odpuszcza i nie przeciąga się ze stroną.
    eq(back, [true, true, true, false, false]);
});

test('fokus wraca do pola po zabraniu go przez stronę; Tab i stare pisanie — nie', async () => {
    const env = panelEnv();
    const doc = env.sandbox.document;
    const field = fieldIn(env, env.SH.I18n.get('workflow_customTarget'));
    const scan = doc.createElement('input');
    doc.body.appendChild(scan);
    const key = (k) => env.SH.SettingsPanel.onPanelKey({ type: 'keydown', key: k, target: field, stopImmediatePropagation() {} });

    key('6');
    field.focus();
    scan.focus();
    env.SH.SettingsPanel.onFocusOut({ target: field, relatedTarget: scan });
    await wait(5);
    ok(doc.activeElement === field, 'fokus wrócił do pola');

    key('Tab');
    scan.focus();
    env.SH.SettingsPanel.onFocusOut({ target: field, relatedTarget: scan });
    await wait(5);
    ok(doc.activeElement === scan, 'Tab to wybór człowieka');

    key('6');
    env.SH.SettingsPanel._typedAt = env.clock.now() - env.SH.CONFIG.PANEL_FOCUS_GUARD_MS - 1;
    field.focus();
    scan.focus();
    env.SH.SettingsPanel.onFocusOut({ target: field, relatedTarget: scan });
    await wait(5);
    ok(doc.activeElement === scan, 'pisanie dawno temu — fokus nie wraca');
});

describe('Godziny zadania naprzód');

/** Zmiana dzienna od 06:30, teraz 15:00 (STAND_TIME), jedno aktywne zadanie. */
function tasksEnv() {
    const env = panelEnv();
    const S = env.SH.store;
    const d = new Date(env.clock.now());
    S.sessionConfig.shiftType = 'day';
    S.sessionConfig.shiftCalculatedStartTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 30).getTime();
    S.sessionConfig.selectedLunchIndex = null;
    return { env, S, TM: env.SH.TaskManager, now: env.clock.now() };
}
const clockAt = (now, h, m) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };

test('„14:00-16:00” o 15:00: koniec naprzód przyjęty, zegar chodzi do 16:00 i staje sam', () => {
    const { env, TM, now } = tasksEnv();
    const task = TM.active();
    ok(TM.setSegments(task.id, '14:00-16:00'), 'przyjęte');
    ok(TM.isRunning(task), 'przed 16:00 zadanie trwa');
    eq(Math.round(TM.workedMs(task) / MIN), 60, 'liczy się do teraz, nie do 16:00');
    env.clock.set(clockAt(now, 16, 30));
    notOk(TM.isRunning(task), 'po 16:00 stoi jak po pauzie');
    eq(Math.round(TM.workedMs(task) / MIN), 120, 'dwie godziny, nie dwie i pół');
});

test('„15:20-” o 15:00 przyjęte (pół godziny naprzód), „15:31-” już nie', () => {
    const { env, TM, now } = tasksEnv();
    const task = TM.active();
    ok(TM.setSegments(task.id, '15:20-'), '20 minut naprzód');
    eq(TM.workedMs(task), 0, 'zanim zadanie się zacznie, nie ma ani minuty');
    env.clock.set(clockAt(now, 15, 50));
    eq(Math.round(TM.workedMs(task) / MIN), 30);
    env.clock.set(now);
    notOk(TM.setSegments(task.id, '15:31-'), '31 minut naprzód to pomyłka');
});

test('granice końca naprzód: 12 h przyjęte, 12 h i minuta nie', () => {
    const { TM } = tasksEnv();
    const task = TM.active();
    ok(TM.setSegments(task.id, '14:00-03:00'), '12 godzin naprzód');
    notOk(TM.setSegments(task.id, '14:00-03:01'), 'minuta za dużo');
});

test('przyszłość tylko w ostatnim odcinku aktywnego zadania', () => {
    const { env, TM } = tasksEnv();
    const first = TM.active();
    notOk(TM.setSegments(first.id, '14:00-16:00, 16:10-16:20'), 'przyszły odcinek nie jako ostatni');
    ok(TM.setSegments(first.id, '13:00-14:00'));
    const second = TM.create('fast', env.clock.now() - 30 * MIN);
    notOk(TM.setSegments(first.id, '13:00-14:00, 16:00-17:00'), 'nieaktywne zadanie nie dostaje przyszłości');
    ok(TM.isRunning(second));
});

test('początek z panelu: o 15:00 „15:10” zostaje, „18:00” to pomyłka i przycina się do teraz', () => {
    const { env, TM, now } = tasksEnv();
    const task = TM.active();
    TM.setStart(task.id, clockAt(now, 15, 10));
    eq(task.segments[0].from, clockAt(now, 15, 10), '10 minut naprzód zostaje');
    TM.setStart(task.id, clockAt(now, 18, 0));
    ok(Math.abs(task.segments[0].from - env.clock.now()) < 2000, 'trzy godziny naprzód — teraz');
});

test('nieaktywne zadanie nie zaczyna się w przyszłości', () => {
    const { env, TM, now } = tasksEnv();
    const first = TM.active();
    TM.create('fast', now);
    TM.setStart(first.id, clockAt(now, 15, 10));
    ok(first.segments[0].from <= env.clock.now(), 'przycięte do teraz');
});

test('paczka po przyszłym końcu otwiera nowy odcinek od tej paczki', () => {
    const { env, TM, now } = tasksEnv();
    const task = TM.active();
    ok(TM.setSegments(task.id, '14:00-15:30'));
    env.clock.set(clockAt(now, 15, 45));
    env.SH.InputManager.modifyCounter(1);
    eq(task.segments.length, 2, 'nowy odcinek');
    ok(Math.abs(task.segments[1].from - clockAt(now, 15, 45)) < 2000, 'od paczki, nie od 15:30');
});

test('magazyn: przyszłość w granicach zostaje, koniec za sto lat i początek za dzień odpadają', () => {
    const { env, now } = tasksEnv();
    const clean = env.SH.Persistence.cleanSegments.bind(env.SH.Persistence);
    eq(clean([{ from: now - HOUR, to: now + 2 * HOUR }]).length, 1, 'koniec za dwie godziny');
    eq(clean([{ from: now + 20 * MIN, to: null }]).length, 1, 'początek za 20 minut');
    // Odcinek zastępczy to zamknięty odcinek zerowej długości „teraz”.
    const stub = (seg) => seg.from === seg.to && Math.abs(seg.to - env.clock.now()) < 2000;
    ok(stub(clean([{ from: now + 24 * HOUR, to: null }])[0]), 'początek za dobę — odcinek zastępczy');
    ok(stub(clean([{ from: now - HOUR, to: 1e300 }])[0]), 'koniec za sto lat — odcinek zastępczy');
});

describe('Okno przy samym dole, panel pod palec');

test('okno statystyk stoi 0 px od dołu, panel ma 520 px i nie wychodzi poza ekran', () => {
    const env = panelEnv();
    eq(env.el('statsWindow').style.bottom, '0px');
    eq(env.SH.SettingsPanel.el.style.width, '520px');
    eq(env.SH.SettingsPanel.el.style.maxWidth, 'calc(100vw - 20px)');
    ok(String(env.SH.SettingsPanel.styleEl.textContent).includes('min-height: 44px'), 'przyciski pod palec');
});

describe('Diagnostyka na końcu, podpisy przy polach wyboru, wiersze w jednej linii');

test('diagnostyka: osobna sekcja na samym końcu, zwinięta; w sekcji celu jej nie ma', () => {
    const env = panelEnv();
    const label = env.SH.I18n.get('diag_open');
    const sec = section(env, 'diag');
    ok(sec, 'sekcja jest');
    ok(content(sec).every(c => !shown(c)), 'zwinięta domyślnie');
    notOk(nodes(section(env, 'workflow')).some(n => n.tagName === 'BUTTON' && n.textContent === label), 'nie w sekcji celu');
    sec.children[0].dispatch('click', {});
    ok(nodes(sec).some(n => n.tagName === 'BUTTON' && n.textContent === label), 'po rozwinięciu przycisk jest');
});

test('podpis wyłącznika modułu cen stoi w polu wyboru, po prawej, a nie pod całym wierszem', () => {
    const env = panelEnv();
    const sec = section(env, 'price_module');
    const hint = env.SH.I18n.get('priceModule_hint');
    const label = nodes(sec).find(n => n.tagName === 'LABEL' && String(n.textContent).includes(hint));
    ok(label, 'podpis wewnątrz etykiety pola wyboru');
    eq(label.children[0].type, 'checkbox');
    eq(label.style.alignItems, 'flex-start', 'kwadracik przy pierwszej linii tekstu');
});

test('podpis linii 7 stoi przy jej polu wyboru — widać go też w zwiniętej sekcji', () => {
    const env = panelEnv();
    const box = content(section(env, 'window')).find(c => c.dataset.shLine === 'line7_compact');
    const hint = env.SH.I18n.get('lineSettings_compactHint');
    ok(nodes(box).some(n => n.tagName === 'LABEL' && String(n.textContent).includes(hint)));
});

test('wiersz z podpisem nie łamie się pod podpis: kolumna podpisu stała, pole bierze resztę', () => {
    const env = panelEnv();
    const row = env.SH.UIBuilder.row('Cel', env.sandbox.document.createElement('input'));
    eq(row.style.flexWrap, 'nowrap');
    eq(row.children[0].style.flex, '0 0 150px');
    eq(row.children[1].style.minWidth, '0');
});

test('rozwinięcie sekcji nie zabiera wierszom ich display: flex', () => {
    // Inaczej wiersz staje się blokiem i podpis spada nad pole — panel
    // wraca do jednej kolumny z pustym miejscem.
    const env = panelEnv();
    const sec = section(env, 'keys');
    const rows = () => content(sec).filter(c => c.tagName === 'DIV' && c.children.length === 2);
    ok(rows().length >= 3, 'wiersze skrótów');
    ok(rows().every(r => r.style.display === 'flex'), 'flex po narysowaniu');
    sec.children[0].dispatch('click', {});
    sec.children[0].dispatch('click', {});
    ok(rows().every(r => r.style.display === 'flex'), 'flex po zwinięciu i rozwinięciu');
});
