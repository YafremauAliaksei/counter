/**
 * 37-workstation.test.js — pomoce stanowiska: dział UG, pojemnik, czas od
 * pojemnika (linia 9), cel działu (linia 10), naklejka UG, panel przejmujący
 * klawiaturę, powtórne uruchomienie, Auto-LPN i most GRAVIS.
 *
 * Wspólny powód: każda z tych rzeczy reaguje na stronę albo na człowieka,
 * więc granice są tu ważniejsze niż typowy przebieg — błędny pojemnik,
 * pole, które nie znika, spreparowany cel w magazynie, wiadomość od obcego
 * okna, opcja wyłączona.
 */

'use strict';

const vm = require('vm');
const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand, ARTIFACT } = require('./dom-stub');

const URL_OF = (mode) => `https://trex-prod-eu.aka.amazon.com/?gradingMode=${mode}`;
const MIN = 60000;

function make(mode = 'CRETURN') {
    const env = bootOnStand({ href: URL_OF(mode) });
    env.SH.SettingsPanel.rerender = function () {
        if (env.SH.store.uiFlags.isSettingsPanelVisible) this.render();
    };
    return env;
}

/** Element strony T-REX z atrybutami. */
function el(env, tag, attrs = {}, parent) {
    const n = env.sandbox.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'value' || k === 'id') n[k] = v;
        else n.setAttribute(k, v);
    }
    (parent || env.sandbox.document.body).appendChild(n);
    return n;
}

/**
 * Naciśnięcie klawisza tak jak w przeglądarce: najpierw `window` w fazie
 * przechwytywania, potem dokument — chyba że ktoś zatrzymał zdarzenie.
 */
function key(env, target, k, type = 'keydown') {
    const ev = {
        type, key: k, code: k, target, repeat: false, stopped: false,
        stopImmediatePropagation() { this.stopped = true; },
        stopPropagation() { this.stopped = true; },
        preventDefault() {},
    };
    env.sandbox.window._emit(type, ev);
    if (!ev.stopped) env.sandbox.document.dispatch(type, ev);
    return ev;
}

function page(env, text) {
    Object.defineProperty(env.sandbox.document.body, 'innerText', { configurable: true, get: () => text });
    env.SH.AutoTrigger.scan();
}

describe('Działy: cztery rozpoznawalne, bez nakładania się');

test('każdy gradingMode trafia do swojego działu, UG nie wpada do CRET', () => {
    // CRETURN jest podłańcuchem CRETURN_PRIMARY_GRADING i CRETURN_REFURB —
    // zapasowe dopasowanie musiałoby wybrać CRET, gdyby szło od krótszego.
    const cases = { CRETURN: 'CRET', CRETURN_PRIMARY_GRADING: 'UG', CRETURN_REFURB: 'REFURB', WAREHOUSE_DEALS: 'WHD' };
    for (const [mode, key] of Object.entries(cases)) {
        eq(make(mode).SH.store.currentTabType, key, mode);
    }
    // Parametr za hashem (routing SPA) i w środku innych parametrów.
    const spa = bootOnStand({ href: 'https://trex-prod-eu.aka.amazon.com/#/x?a=1&gradingMode=CRETURN_PRIMARY_GRADING&b=2' });
    eq(spa.SH.store.currentTabType, 'UG', 'UG za hashem');
});

test('UG wchodzi do sumy globalnej domyślnie i ma nazwę w każdym języku', () => {
    const env = make('CRETURN_PRIMARY_GRADING');
    eq(env.SH.store.userConfig.globalStatsContributionKnown.UG, true);
    for (const lang of ['pl', 'uk', 'ru', 'en']) {
        env.SH.store.userConfig.language = lang;
        eq(env.SH.I18n.get('tabName_UG'), 'UG', lang);
    }
});

describe('Ukraiński interfejs T-REX liczy przedmioty');

test('zbudowane wyzwalacze ukraińskie dają +1, a każdy osobno nie', () => {
    const env = make();
    const S = env.SH.store;
    page(env, '');
    page(env, 'Porównaj: зображенню нижче');
    page(env, 'канування LPN: LPN123');
    eq(S.tabCounters.CRET, 1, 'pełny przedmiot po ukraińsku');
    page(env, '');
    page(env, 'канування LPN: LPN124');
    eq(S.tabCounters.CRET, 1, 'wyzwalacz końcowy bez początku nie liczy');
});

describe('Pojemnik: Enter, potem zniknięcie pola');

function tote(env, value, label = 'Wprowadź pojemnik') {
    const input = el(env, 'input', { 'aria-label': label, value });
    key(env, input, 'Enter');
    return input;
}

test('pole zostaje na stronie — nic się nie zalicza, choćby po kwadransie', () => {
    const env = make();
    const input = tote(env, 'tsX12ab');
    env.clock.set(env.clock.now() + 15 * MIN);
    page(env, '');
    eq(env.SH.ToteWatch.confirmed, 0);
    eq(env.SH.store.sessionConfig.lastToteAt, null);
    input.remove();
    page(env, '');
    eq(env.SH.ToteWatch.confirmed, 1, 'zniknięcie pola to przybicie');
    ok(Math.abs(env.SH.store.sessionConfig.lastToteAt - env.clock.now()) < 1000, 'chwila przybicia');
    page(env, '');
    eq(env.SH.ToteWatch.confirmed, 1, 'jedno przybicie liczy się raz');
});

test('wartości graniczne nazwy pojemnika', () => {
    const env = make();
    const W = env.SH.ToteWatch;
    const cases = {
        'tsX12ab': true, 'TSx1': true, 'cSN09_a': true, 'ws1': true,
        'ts': false,                       // za krótka
        'ts1234567890123': true,           // 15 znaków — granica
        'ts12345678901234': false,         // 16 znaków
        'xs123': false, 'LPN0000123': false, 'ts 12': false, '': false,
    };
    for (const [value, expected] of Object.entries(cases)) {
        W.pending = null;
        tote(env, value);
        eq(!!W.pending, expected, JSON.stringify(value));
    }
});

test('pole rozpoznaje się po każdym z trzech podpisów i po data-testid', () => {
    const env = make();
    const W = env.SH.ToteWatch;
    for (const label of ['WPROWADŹ POJEMNIK', 'вкажіть транспортну тару', 'введите тару']) {
        ok(W.isToteInput(el(env, 'input', { 'aria-label': label })), label);
    }
    ok(W.isToteInput(el(env, 'input', { 'data-testid': 'tote-input-label' })), 'data-testid');
    notOk(W.isToteInput(el(env, 'input', { 'aria-label': 'Wprowadź LPN' })), 'inne pole');
});

describe('Linia 9: czas od pojemnika i bezczynność z celu');

test('czerwień po podwójnym czasie przedmiotu, z dokładnością do 5% tego czasu', () => {
    // Liczy się, żeby kolor przyszedł mniej więcej na czas: przy celu 30
    // granica to 4 min, a 5% to 12 s; przy celu 100 — 72 s i 3,6 s. Dokładność
    // co do sekundy nie jest potrzebna, a zegar testu płynie razem z prawdziwym.
    for (const [mode, key, target] of [['CRETURN_REFURB', 'REFURB', 30], ['CRETURN', 'CRET', 100]]) {
        const env = make(mode);
        env.SH.CONFIG.RATE_TARGETS[key] = target;
        const SW = env.SH.StatsWindowRenderer;
        const limit = 2 * 3600000 / target;
        const t0 = env.clock.now();
        env.SH.store.sessionConfig.lastToteAt = t0;
        const colorAt = (ms) => { env.clock.set(t0 + ms); SW.renderContent(); return SW.lines.line9_offTask.style.color; };
        eq(colorAt(limit * 0.95), '', `${key}: przed granicą`);
        eq(colorAt(limit * 1.05), env.SH.CONFIG.OFF_TASK_COLOR, `${key}: po granicy`);
        ok(SW.lines.line9_offTask.textContent.includes('+'), `${key}: dopisana bezczynność`);
    }
});

test('obiad nie jest bezczynnością — także obiad nocny przez północ', () => {
    // Przerwa jest niepłatna i zaplanowana: pół godziny bez pojemnika w jej
    // trakcie nie może zaczerwienić linii po powrocie.
    const env = make('CRETURN_REFURB');
    const S = env.SH.store;
    const W = env.SH.ToteWatch;
    const at = (d, h, m) => new Date(2026, 8, d, h, m, 0).getTime();
    S.sessionConfig.shiftType = 'day';
    S.sessionConfig.shiftCalculatedStartTime = at(16, 6, 30);
    S.sessionConfig.selectedLunchIndex = 0;                 // 11:20–11:50
    S.sessionConfig.lastToteAt = at(16, 11, 15);
    eq(W.offTask(at(16, 11, 55)).elapsedMs, 10 * MIN, '40 min minus 30 min obiadu');
    eq(W.offTask(at(16, 11, 55)).overMs, 6 * MIN);
    S.sessionConfig.lastToteAt = at(16, 11, 30);
    eq(W.offTask(at(16, 11, 40)).elapsedMs, 0, 'w środku obiadu czas stoi');
    S.sessionConfig.shiftType = 'night';
    S.sessionConfig.shiftCalculatedStartTime = at(16, 18, 30);
    S.sessionConfig.selectedLunchIndex = 5;                 // 23:50–00:20
    S.sessionConfig.lastToteAt = at(16, 23, 45);
    eq(W.offTask(at(17, 0, 25)).elapsedMs, 10 * MIN, 'obiad przez północ');
    S.sessionConfig.selectedLunchIndex = null;
    eq(W.offTask(at(17, 0, 25)).elapsedMs, 40 * MIN, 'bez wybranego obiadu nic nie odpada');
});

test('spreparowany zapis i cel — linia pusta albo bez czerwieni, bez wyjątku', () => {
    const env = make();
    const S = env.SH.store;
    const W = env.SH.ToteWatch;
    for (const bad of ['abc', -5, NaN, null, env.clock.now() + MIN]) {
        S.sessionConfig.lastToteAt = bad;
        eq(W.offTask(env.clock.now()), null, String(bad));
    }
    S.sessionConfig.lastToteAt = env.clock.now() - 60 * MIN;
    for (const target of [0, -3, NaN, 'xx', null]) {
        env.SH.CONFIG.RATE_TARGETS.CRET = target;
        eq(W.offTask(env.clock.now()).overMs, 0, 'cel ' + String(target));
    }
    env.SH.CONFIG.RATE_TARGETS.CRET = 47;
});

test('CRET z profilem FAST bierze cel 80 i linia 10 liczy procent od tempa', () => {
    const env = make();
    const S = env.SH.store;
    eq(env.SH.ToteWatch.targetFor('CRET'), 47);
    S.userConfig.cretProfile = 'FAST';
    eq(env.SH.ToteWatch.targetFor('CRET'), 80);
    eq(env.SH.ToteWatch.targetFor('UG'), 47, 'profil dotyczy tylko karty CRET');
    // 2 h pracy, 81 sztuk -> 40,5/h, czyli 50% z 80 (procent w dół); cel
    // zmiany 80 × 10 = 800, bez niepłatnego obiadu. Zegar testu płynie, stąd
    // 81 zamiast 80 — przy równych 40/h milisekunda dałaby 49%.
    S.sessionConfig.shiftType = 'day';
    S.sessionConfig.shiftCalculatedStartTime = env.clock.now() - 2 * 60 * MIN;
    S.sessionConfig.activeTabInstances = { CRET: env.clock.now() };
    S.tabCounters.CRET = 81;
    env.SH.StatsWindowRenderer.renderContent();
    eq(env.SH.StatsWindowRenderer.lines.line10_target.textContent, '80/h 50% 81/800');
});

describe('Naklejka: UG liczy podwójnie i sprzedaż, WHD nie');

function item(env, withSticker) {
    page(env, 'poniżej');
    let st = null;
    if (withSticker) { st = el(env, 'div', { id: 'sticker-back-hide' }); page(env, 'poniżej'); }
    page(env, 'Przypisz nowy');
    if (st) st.remove();
    page(env, '');
}

test('UG z naklejką: +2 i dwie sprzedane jeszcze przed kodem sortowania', () => {
    const env = make('CRETURN_PRIMARY_GRADING');
    const S = env.SH.store;
    page(env, '');
    item(env, true);
    eq(S.tabCounters.UG, 2, 'licznik');
    eq(S.tabSold.UG, 2, 'sprzedane');
    item(env, false);
    eq(S.tabCounters.UG, 3, 'bez naklejki +1');
    eq(S.tabSold.UG || 0, 2, 'bez naklejki i kodu — nie sprzedaż');
});

test('UG: naklejka przysłana z wyprzedzeniem, ukryta (zerowe wymiary) — nie liczy się', () => {
    const env = make('CRETURN_PRIMARY_GRADING');
    const S = env.SH.store;
    page(env, '');
    page(env, 'poniżej');
    const st = el(env, 'div', { id: 'sticker-back-hide' });
    st.offsetWidth = 0; st.offsetHeight = 0;
    page(env, 'poniżej');
    page(env, 'Przypisz nowy');
    page(env, '');
    eq([S.tabCounters.UG, S.tabSold.UG || 0], [1, 0]);
});

test('pole pojemnika schowane zamiast zdjęte też znaczy przybicie', () => {
    const env = make();
    const input = tote(env, 'csB2');
    input.offsetWidth = 0; input.offsetHeight = 0;
    page(env, '');
    eq(env.SH.ToteWatch.confirmed, 1);
});

test('WHD z tym samym elementem: +1 i bez sprzedaży', () => {
    const env = make('WAREHOUSE_DEALS');
    const S = env.SH.store;
    page(env, '');
    item(env, true);
    eq(S.tabCounters.WHD, 1);
    eq(S.tabSold.WHD || 0, 0);
});

describe('Liczenie po pojemniku (doświadczalne)');

test('wyłączone: liczy tekst; włączone: liczy pojemnik, a tekst tylko porównuje', () => {
    const env = make();
    const S = env.SH.store;
    page(env, '');
    page(env, 'poniżej'); page(env, 'Przypisz nowy'); page(env, '');
    eq(S.tabCounters.CRET, 1, 'domyślnie z tekstu');
    S.userConfig.toteCounting = true;
    page(env, 'poniżej'); page(env, 'Przypisz nowy');
    eq(S.tabCounters.CRET, 1, 'tekst już nie liczy');
    const input = tote(env, 'tsA1');
    input.remove();
    page(env, '');
    eq(S.tabCounters.CRET, 2, 'pojemnik liczy');
    const info = env.SH.tote();
    eq([info['pojemniki przybite'], info['przedmioty z wyzwalacza tekstu']], [1, 2]);
});

describe('Panel: powtórne uruchomienie, klawiatura, klik poza panelem');

test('powtórne uruchomienie pliku otwiera, a następne zamyka panel', () => {
    const env = make();
    const S = env.SH.store;
    eq(S.uiFlags.isSettingsPanelVisible, false);
    // Zakładka wykonuje plik przez eval wewnątrz funkcji — każde kliknięcie
    // ma własny zakres, więc stałe z nagłówka nie zderzają się ze sobą.
    const click = () => vm.runInContext(`(function () {\n${ARTIFACT}\n})();`, env.sandbox, { filename: 'counter.js' });
    click();
    eq(S.uiFlags.isSettingsPanelVisible, true, 'drugie uruchomienie');
    click();
    eq(S.uiFlags.isSettingsPanelVisible, false, 'trzecie uruchomienie');
    eq(env.net.fetches, [], 'bez sieci');
});

test('otwarty panel zatrzymuje klawisze ze swoich pól, zamknięty — nie', () => {
    const env = make();
    let pageGot = 0;
    env.sandbox.document.addEventListener('keydown', () => pageGot++);
    env.SH.SettingsPanel.toggle();
    const field = env.SH.SettingsPanel.el.querySelector('input') || el(env, 'input', {}, env.SH.SettingsPanel.el);
    ok(key(env, field, '1').stopped, 'cyfra w polu panelu nie idzie do strony');
    const outside = el(env, 'input');
    notOk(key(env, outside, '1').stopped, 'pole strony dostaje klawisz');
    env.SH.SettingsPanel.toggle();
    notOk(key(env, field, '1').stopped, 'po zamknięciu nic nie jest przechwytywane');
    ok(pageGot >= 2, 'strona dostała klawisze spoza panelu');
});

test('klik poza panelem zamyka go, chyba że trwa przeciąganie okna', () => {
    const env = make();
    const S = env.SH.store;
    const outside = el(env, 'div');
    const down = (target) => env.sandbox.document.dispatch('mousedown', { target });
    env.SH.SettingsPanel.toggle();
    down(env.SH.SettingsPanel.el);
    eq(S.uiFlags.isSettingsPanelVisible, true, 'klik w panelu');
    S.uiFlags.isStatsWindowDragging = true;
    down(outside);
    eq(S.uiFlags.isSettingsPanelVisible, true, 'tryb przeciągania');
    S.uiFlags.isStatsWindowDragging = false;
    down(outside);
    eq(S.uiFlags.isSettingsPanelVisible, false, 'klik poza panelem');
    down(outside);
    eq(S.uiFlags.isSettingsPanelVisible, false, 'zamknięty panel nie otwiera się od kliku');
});

test('skrót ukrycia okna: domyślnie brak, ustawiony — chowa i pokazuje', () => {
    const env = make();
    const S = env.SH.store;
    const body = env.sandbox.document.body;
    key(env, body, 'F10');
    eq(env.SH.StatsWindowRenderer.el.style.display, '', 'bez ustawienia nic');
    S.userConfig.keyboardShortcuts.TOGGLE_WINDOW = 'F10';
    key(env, body, 'F10');
    eq(env.SH.StatsWindowRenderer.el.style.display, 'none');
    key(env, body, 'F10');
    eq(env.SH.StatsWindowRenderer.el.style.display, '');
});

describe('Auto-LPN');

function autoLpnPage(env) {
    const btn = el(env, 'button', { 'data-testid': 'button-reassign-lpn-id' });
    let clicks = 0;
    btn.click = () => clicks++;
    const input = el(env, 'input', { 'aria-label': 'Wprowadź pojemnik' });
    const type = (v) => { input.value = v; env.sandbox.document.dispatch('input', { target: input }); };
    return { type, clicks: () => clicks, btn };
}

test('wyłączone nie klika; etykieta klika raz, pojemnik nie', () => {
    const env = make();
    const p = autoLpnPage(env);
    p.type('L');
    eq(p.clicks(), 0, 'domyślnie wyłączone');
    env.SH.store.userConfig.autoLpn = true;
    p.type('L'); p.type('LP'); p.type('LPN');
    eq(p.clicks(), 1, 'jedno kliknięcie na skan');
    env.clock.set(env.clock.now() + env.SH.CONFIG.AUTO_LPN_COOLDOWN_MS + 1);
    p.type('t');
    eq(p.clicks(), 1, 'pojemnik nie klika');
    env.clock.set(env.clock.now() + env.SH.CONFIG.AUTO_LPN_COOLDOWN_MS + 1);
    p.btn.disabled = true;
    p.type('L');
    eq(p.clicks(), 1, 'wyłączony przycisk');
});

describe('Most GRAVIS');

function gravisEnv(mode = 'CRETURN') {
    const env = make(mode);
    const sent = [];
    const opened = [];
    const fake = { closed: false, postMessage: (msg, origin) => sent.push({ msg, origin }) };
    env.sandbox.window.open = (url, name) => { opened.push([url, name]); return fake; };
    return { env, sent, opened, fake };
}
const GRAVIS_ORIGIN = 'https://eu-cretfc-tools-dub.dub.proxy.amazon.com';

test('wyłączony: nie otwiera okna, nie wysyła LPN', () => {
    const { env, sent, opened } = gravisEnv();
    env.SH.GravisBridge.open();
    const input = el(env, 'input', { 'data-testid': 'lpn-input-label', value: 'LPN123ABC' });
    key(env, input, 'Enter');
    eq([opened.length, sent.length], [0, 0]);
});

test('REFURB i WHD nie mają mostu nawet z włączoną opcją', () => {
    for (const mode of ['CRETURN_REFURB', 'WAREHOUSE_DEALS']) {
        const { env, opened } = gravisEnv(mode);
        env.SH.store.userConfig.gravisAsin = true;
        env.SH.GravisBridge.open();
        eq(opened.length, 0, mode);
    }
});

test('pełny przebieg: gotowość, LPN, ASIN pod polem; obce okno i zły ASIN odrzucone', () => {
    const { env, sent, fake } = gravisEnv('CRETURN_PRIMARY_GRADING');
    const G = env.SH.GravisBridge;
    const msg = (data, source = fake, origin = GRAVIS_ORIGIN) => env.sandbox.window._emit('message', { data, source, origin });
    env.SH.store.userConfig.gravisAsin = true;
    G.open();
    const lpnInput = el(env, 'input', { 'data-testid': 'lpn-input-label', value: 'LPN123ABC' });
    key(env, lpnInput, 'Enter');
    eq(sent.length, 0, 'przed gotowością LPN czeka');
    msg({ type: 'sh-gravis-ready' }, {}, GRAVIS_ORIGIN);
    eq(G.ready, false, 'gotowość od obcego okna');
    msg({ type: 'sh-gravis-ready' });
    eq(sent.map(s => [s.msg.lpn, s.origin]), [['LPN123ABC', GRAVIS_ORIGIN]], 'LPN na znany adres');

    const scan = el(env, 'input', { 'data-testid': 'item-scan-input' });
    msg({ type: 'sh-gravis-asin', lpn: 'LPN123ABC', asin: 'B0TEST1234' }, fake, 'https://evil.example');
    eq(G.asin, null, 'obcy adres');
    msg({ type: 'sh-gravis-asin', lpn: 'LPN999', asin: 'B0TEST1234' });
    eq(G.asin, null, 'odpowiedź dla innego LPN');
    msg({ type: 'sh-gravis-asin', lpn: 'LPN123ABC', asin: '<img src=x>' });
    eq(G.asin, null, 'ASIN spoza wzorca');
    msg({ type: 'sh-gravis-asin', lpn: 'LPN123ABC', asin: 'B0TEST1234' });
    eq(G.asin, 'B0TEST1234');
    ok(G.chip, 'link pod polem');
    notOk(/B0TEST1234/.test(G.chip.textContent), 'tekst rozerwany U+200B — skan strony go nie widzi');
    G.chip.dispatch('click', {});
    eq(scan.value, 'B0TEST1234', 'kliknięcie wstawia ASIN, Enter zostaje człowiekowi');
    scan.remove();
    page(env, '');
    eq(G.chip, null, 'pole zniknęło — link też');
});

describe('Kod ustawień przenosi pomoce stanowiska');

test('linie 9 i 10, UG, skrót, profil FAST i wyłączniki przechodzą na drugą maszynę', () => {
    // Kod ustawień ma obejmować wszystko, co da się ustawić — inaczej
    // zakładka z kodem odtwarza wygląd bez nowych opcji i nikt tego nie widzi.
    const a = make();
    const S = a.SH.store;
    S.localTabConfig.linesConfig.line9_offTask.visible = false;
    S.localTabConfig.linesConfig.line10_target.visible = true;
    S.localTabConfig.linesConfig.line10_target.colorHex = '#112233';
    S.localTabConfig.linesConfig.line2_globalSummary.customColors.UG = '#445566';
    Object.assign(S.userConfig, { cretProfile: 'FAST', toteCounting: true, autoLpn: true, gravisAsin: true, language: 'uk' });
    S.userConfig.keyboardShortcuts.TOGGLE_WINDOW = 'F10';
    S.userConfig.globalStatsContributionKnown.UG = false;
    const code = a.SH.configCode();

    const b = make();
    eq(b.SH.config(code)['kod przyjęty'], true);
    const T = b.SH.store;
    eq([T.localTabConfig.linesConfig.line9_offTask.visible, T.localTabConfig.linesConfig.line10_target.visible,
        T.localTabConfig.linesConfig.line10_target.colorHex, T.localTabConfig.linesConfig.line2_globalSummary.customColors.UG],
       [false, true, '#112233', '#445566']);
    eq([T.userConfig.cretProfile, T.userConfig.toteCounting, T.userConfig.autoLpn, T.userConfig.gravisAsin,
        T.userConfig.language, T.userConfig.keyboardShortcuts.TOGGLE_WINDOW, T.userConfig.globalStatsContributionKnown.UG],
       ['FAST', true, true, true, 'uk', 'F10', false]);
});
