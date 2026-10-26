/**
 * 46-clear-session.test.js — „Usuń sesję” skrótem u+s.
 *
 * CZEGO TU PILNUJEMY. Skrót robi za człowieka cztery kroki T-REX: przycisk
 * sesji, „Kontynuuj”, ten sam LPN z Enterem i tę samą stację z Enterem.
 * Najgroźniejszy błąd to wpisanie czegoś, co nie jest LPN tego przedmiotu
 * (cudzy przedmiot) albo zadziałanie skrótu w trakcie pisania czy skanu —
 * stąd testy na pola tekstowe, odstęp między literami, modyfikatory
 * i spreparowany magazyn. Domyślnie wyłączone, jak każda nowa pomoc.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * T-REX w miniaturze: przycisk sesji → okno z „Kontynuuj” → pole LPN →
 * po Enterze pole stacji. Zapisuje, co i gdzie wpisano.
 */
function trexEnv() {
    const env = bootOnStand();
    const doc = env.sandbox.document;
    env.SH.CONFIG.CLEAR_SESSION_POLL_MS = 5;
    // Atrapa nie zna zdarzeń przeglądarki — skrypt wysyła Enter przez
    // KeyboardEvent, więc piaskownica dostaje najprostsze klasy zdarzeń.
    env.sandbox.Event = class { constructor(type, init) { Object.assign(this, init, { type }); } };
    env.sandbox.KeyboardEvent = class extends env.sandbox.Event {};
    const log = [];
    const make = (tag, testId, onClick) => {
        const n = doc.createElement(tag);
        n.setAttribute('data-testid', testId);
        n.click = () => { log.push('klik ' + testId); if (onClick) onClick(); };
        n.dispatchEvent = (ev) => { if (ev && ev.type === 'keydown' && ev.key === 'Enter') onEnter(n); return true; };
        doc.body.appendChild(n);
        return n;
    };
    const onEnter = (n) => {
        const tid = n.getAttribute('data-testid');
        log.push(`enter ${tid}=${n.value}`);
        n.remove();
        if (tid === 'lpn-input-label') make('input', 'ws-input');
    };
    const icon = make('button', 'clear-session-icon', () => {
        make('button', 'button-clear-session-continue-socrates', () => make('input', 'lpn-input-label'));
    });
    return { env, doc, log, icon };
}

/** Klawisz z dokumentu (skrót słucha na dokumencie w fazie przechwytywania). */
function press(env, k, target, extra = {}) {
    env.sandbox.document.dispatch('keydown', { type: 'keydown', key: k, target: target || env.sandbox.document.body, ...extra });
}

/** Zapamiętanie LPN i stacji tak, jak robi to człowiek: Enter w ich polach. */
function remember(env, testId, value) {
    const doc = env.sandbox.document;
    const n = doc.createElement('input');
    n.setAttribute('data-testid', testId);
    n.value = value;
    doc.body.appendChild(n);
    press(env, 'Enter', n);
    n.remove();
}

describe('Domyślnie wyłączone');

test('bez włączenia litery u, s nic nie klikają i niczego nie zapamiętują', async () => {
    const { env, log } = trexEnv();
    eq(env.SH.store.userConfig.clearSession, false);
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    press(env, 'u');
    press(env, 's');
    await wait(30);
    eq(log, []);
    eq(env.sandbox.sessionStorage.getItem(env.SH.Persistence.getKey('lastLpn')), null, 'nic w magazynie');
});

describe('Pełny przebieg');

test('u, s: przycisk sesji, Kontynuuj, ten sam LPN z Enterem, ta sama stacja z Enterem', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNRRHT5017105');
    remember(env, 'ws-input', 'ws_12');
    press(env, 'u');
    press(env, 's');
    await wait(100);
    eq(log, ['klik clear-session-icon', 'klik button-clear-session-continue-socrates',
             'enter lpn-input-label=LPNRRHT5017105', 'enter ws-input=ws_12']);
    notOk(env.SH.ClearSession.busy, 'po przebiegu gotowy na następny');
});

test('wielkie litery U, S też działają', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    remember(env, 'ws-input', 'ws-A3');
    press(env, 'U');
    press(env, 'S');
    await wait(100);
    eq(log.length, 4, log.join(' | '));
});

describe('Kiedy skrót nie działa');

test('litery w polu tekstowym (pisanie, skaner) nie są skrótem', async () => {
    const { env, doc, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    const field = doc.createElement('input');
    doc.body.appendChild(field);
    press(env, 'u', field);
    press(env, 's', field);
    await wait(30);
    eq(log, []);
});

test('Ctrl, Alt, Meta, inna litera pomiędzy, cyfra — nie', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    press(env, 'u'); press(env, 's', null, { ctrlKey: true });
    press(env, 'u', null, { altKey: true }); press(env, 's');
    press(env, 'u'); press(env, 'x'); press(env, 's');
    press(env, 'u'); press(env, '1'); press(env, 's');
    press(env, 'u'); press(env, 's', null, { metaKey: true });
    await wait(30);
    eq(log, []);
});

test('druga litera po przerwie dłuższej niż 1,5 s to już nie skrót', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    press(env, 'u');
    env.clock.set(env.clock.now() + env.SH.CONFIG.CLEAR_SESSION_KEY_GAP_MS + 1);
    press(env, 's');
    await wait(30);
    eq(log, []);
});

test('bez przycisku sesji na ekranie nie dzieje się nic, nawet powiadomienie', async () => {
    const { env, log, icon } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    icon.remove();
    press(env, 'u'); press(env, 's');
    await wait(30);
    eq(log, []);
    notOk(env.SH.ClearSession.busy);
});

test('przycisk wyłączony — nic', async () => {
    const { env, log, icon } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    icon.disabled = true;
    press(env, 'u'); press(env, 's');
    await wait(30);
    eq(log, []);
});

describe('Braki i spreparowany magazyn');

test('bez zapamiętanego LPN: sesja usunięta, pole LPN puste, powiadomienie — stacji nie dotyka', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'ws-input', 'ws_12');
    const shown = [];
    env.SH.Notifier.show = (t) => shown.push(t);
    press(env, 'u'); press(env, 's');
    await wait(100);
    eq(log, ['klik clear-session-icon', 'klik button-clear-session-continue-socrates']);
    eq(shown, [env.SH.I18n.get('clearSession_noLpn')]);
});

test('bez zapamiętanej stacji: LPN wpisany, przy stacji powiadomienie', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    const shown = [];
    env.SH.Notifier.show = (t) => shown.push(t);
    press(env, 'u'); press(env, 's');
    await wait(100);
    eq(log[log.length - 1], 'enter lpn-input-label=LPNAB123456789');
    eq(shown, [env.SH.I18n.get('clearSession_noStation')]);
});

test('zapamiętuje tylko prawdziwy LPN i stację; śmieci w magazynie się nie wpisują', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'tsT1');                 // pojemnik w polu LPN
    remember(env, 'lpn-input-label', 'LPNAB12345678');         // 13 znaków — urwany skan
    remember(env, 'ws-input', 'ws');                          // sam przedrostek
    const P = env.SH.Persistence;
    eq(env.sandbox.sessionStorage.getItem(P.getKey('lastLpn')), null);
    eq(env.sandbox.localStorage.getItem(P.getKey('workStation')), null);
    // Ktoś wpisał do magazynu coś, co nie jest LPN — skrót tego nie wpisze.
    env.sandbox.sessionStorage.setItem(P.getKey('lastLpn'), '<img src=x>');
    const shown = [];
    env.SH.Notifier.show = (t) => shown.push(t);
    press(env, 'u'); press(env, 's');
    await wait(100);
    ok(!log.some(l => l.startsWith('enter')), log.join(' | '));
    eq(shown, [env.SH.I18n.get('clearSession_noLpn')]);
});

test('LPN pamięta karta, w której go zeskanowano — druga karta ma swój przedmiot', () => {
    const { env } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    remember(env, 'package-input', 'LPNZZ999999999');           // REFURB: inne pole, ten sam zapis
    eq(env.sandbox.sessionStorage.getItem(env.SH.Persistence.getKey('lastLpn')), 'LPNZZ999999999');
});

describe('Czekanie i rozbiórka');

test('„Kontynuuj” nie przyszło w 2 s — dalej czeka na pole LPN, a po 4 s kończy bez wpisywania', async () => {
    const { env, log, icon } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    icon.click = () => log.push('klik clear-session-icon');   // T-REX nie pokazuje okna
    env.SH.CONFIG.CLEAR_SESSION_WAIT_CONTINUE_MS = 20;
    env.SH.CONFIG.CLEAR_SESSION_WAIT_LPN_MS = 20;
    env.SH.CONFIG.CLEAR_SESSION_WAIT_STATION_MS = 20;
    press(env, 'u'); press(env, 's');
    await wait(150);
    eq(log, ['klik clear-session-icon']);
    notOk(env.SH.ClearSession.busy);
});

test('drugie u+s w trakcie przebiegu nie zaczyna drugiego', async () => {
    const { env, log } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    remember(env, 'ws-input', 'ws_12');
    press(env, 'u'); press(env, 's');
    press(env, 'u'); press(env, 's');
    await wait(100);
    eq(log.filter(l => l === 'klik clear-session-icon').length, 1);
});

test('rozbiórka skryptu w trakcie czekania przerywa przebieg i zdejmuje słuchacza', async () => {
    const { env, log, icon } = trexEnv();
    env.SH.store.userConfig.clearSession = true;
    remember(env, 'lpn-input-label', 'LPNAB123456789');
    icon.click = () => log.push('klik clear-session-icon');
    press(env, 'u'); press(env, 's');
    env.SH.Main.teardown();
    await wait(60);
    eq(log, ['klik clear-session-icon'], 'nic po rozbiórce');
    press(env, 'u'); press(env, 's');
    eq(log.length, 1, 'słuchacz zdjęty');
});

describe('Panel i kod ustawień');

test('wyłącznik stoi w sekcji celu, z podpisem obok pola; kod ustawień go przenosi', () => {
    const { env } = trexEnv();
    const SP = env.SH.SettingsPanel;
    SP.rerender = function () { this.render(); };
    if (!env.SH.store.uiFlags.isSettingsPanelVisible) SP.toggle();
    SP.render();
    const sec = SP.el.children.find(c => c.dataset && c.dataset.shSection === 'workflow');
    const text = String(sec.textContent);
    ok(text.includes(env.SH.I18n.get('workflow_clearSession')), 'napis');
    ok(text.includes(env.SH.I18n.get('workflow_clearSessionHint')), 'podpis');
    env.SH.store.userConfig.clearSession = true;
    const code = env.SH.ConfigCode.encode();
    const other = bootOnStand();
    other.SH.ConfigCode.apply(code);
    eq(other.SH.store.userConfig.clearSession, true);
});
