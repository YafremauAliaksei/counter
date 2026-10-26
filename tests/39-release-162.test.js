/**
 * 39-release-162.test.js — zachowania, które przyszły z pracy na prawdziwym
 * T-REX: nowe wyzwalacze początku, panel otwarty od startu, jeden pojemnik na
 * przedmiot, most GRAVIS po przeładowaniu jego karty, odcinki zadań i kilka
 * kart naraz.
 *
 * Każdy blok ma ten sam powód: rzecz działa pojedynczo, a psuje się na styku
 * z czymś innym — tekst panelu z wyzwalaczem, drugi skan w to samo pole,
 * karta GRAVIS uśpiona przez przeglądarkę, odcinek przez północ, cztery
 * działy na jednym magazynie.
 */

'use strict';

const vm = require('vm');
const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand, boot, makeEnv, makeTabNetwork, makeClock, STAND_TIME, ARTIFACT, scanTote } = require('./dom-stub');

const URL_OF = (mode) => `https://trex-prod-eu.aka.amazon.com/?gradingMode=${mode}`;
const MIN = 60000;

function page(env, text) {
    Object.defineProperty(env.sandbox.document.body, 'innerText', { configurable: true, get: () => text });
    env.SH.AutoTrigger.scan();
}

describe('Wyzwalacze początku z prawdziwego T-REX');

test('„Czy produkt jest zgodny” i „W przypadku tego produktu można pominąć ocenę” zaczynają przedmiot', () => {
    for (const pre of ['Czy produkt jest zgodny z opisem?', 'W przypadku tego produktu można pominąć ocenę.']) {
        const env = bootOnStand();
        page(env, '');
        page(env, pre);
        page(env, 'Przypisz nowy');
        scanTote(env);
        page(env, '');
        eq(env.SH.store.tabCounters.CRET, 1, pre);
    }
});

test('żaden tekst interfejsu w żadnym języku nie pasuje do wyzwalacza ani kodu', () => {
    // Otwarty panel jest częścią document.body.innerText. Napis z wyzwalaczem
    // w panelu trzymałby flagę przedmiotu podniesioną i licznik stawałby.
    const env = bootOnStand();
    const C = env.SH.CONFIG;
    const bad = [];
    for (const [lang, dict] of Object.entries(env.SH.LANG_STRINGS)) {
        for (const [key, text] of Object.entries(dict)) {
            if (C.PRE_TRIGGER_REGEX.test(text) || C.AUTO_TRIGGER_REGEX.test(text)) bad.push(`${lang}.${key}`);
        }
    }
    eq(bad, []);
});

test('panel otwarty na stronie nie psuje liczenia', () => {
    const env = bootOnStand();
    env.SH.SettingsPanel.toggle();
    const panelText = () => String(env.SH.SettingsPanel.el.textContent);
    for (let i = 0; i < 3; i++) {
        page(env, panelText());
        page(env, panelText() + ' poniżej');
        page(env, panelText() + ' Przypisz nowy');
        scanTote(env);
    }
    page(env, panelText());
    eq(env.SH.store.tabCounters.CRET, 3);
});

describe('Panel przy starcie');

test('po uruchomieniu panel jest otwarty; zamyka go klik obok', () => {
    const env = boot({ keepPanel: true });
    eq(env.SH.store.uiFlags.isSettingsPanelVisible, true);
    env.sandbox.document.dispatch('pointerdown', { target: env.sandbox.document.body });
    eq(env.SH.store.uiFlags.isSettingsPanelVisible, false);
    eq(env.net.fetches, [], 'bez sieci');
});

describe('Jeden pojemnik na przedmiot');

function tote(env, value) {
    const input = env.sandbox.document.createElement('input');
    input.setAttribute('aria-label', 'Wprowadź pojemnik');
    input.value = value;
    env.sandbox.document.body.appendChild(input);
    env.sandbox.document.dispatch('keydown', { key: 'Enter', target: input });
    input.remove();
    page(env, '');
}

test('dziesięć pojemników bez nowego wyzwalacza początku to jeden przedmiot', () => {
    const env = bootOnStand();
    page(env, '');
    page(env, 'poniżej');
    page(env, 'Przypisz nowy');
    for (let i = 0; i < 10; i++) tote(env, 'tsA' + i);
    eq(env.SH.store.tabCounters.CRET, 1, 'jeden przedmiot');
    eq(env.SH.ToteWatch.confirmed, 10, 'czas od pojemnika liczy się od każdego');
    page(env, 'poniżej');
    page(env, 'Przypisz nowy');
    tote(env, 'tsB1');
    eq(env.SH.store.tabCounters.CRET, 2, 'nowy początek — nowy przedmiot');
});

describe('GRAVIS: przeładowana karta, środek pola, cisza');

function gravis(mode = 'CRETURN') {
    const env = bootOnStand({ href: URL_OF(mode) });
    const fake = { closed: false, sent: [], postMessage(m) { this.sent.push(m); } };
    env.sandbox.window.open = () => fake;
    const msg = (data, source = fake) => env.sandbox.window._emit('message',
        { data, source, origin: 'https://eu-cretfc-tools-dub.dub.proxy.amazon.com' });
    const scan = env.sandbox.document.createElement('input');
    scan.setAttribute('data-testid', 'item-scan-input');
    scan.getBoundingClientRect = () => ({ left: 900, top: 400, width: 120, height: 30 });
    return { env, fake, msg, scan, G: env.SH.GravisBridge };
}

test('zanim GRAVIS się odezwie, T-REX nie zmienia wyglądu', () => {
    const { env, scan, G } = gravis();
    env.sandbox.document.body.appendChild(scan);
    page(env, '');
    eq(G.chip, null);
    env.clock.set(env.clock.now() + 10 * MIN);
    page(env, '');
    eq(G.chip, null, 'brak sygnału, którego nigdy nie było, to nie „przeładowanie”');
});

test('ASIN wyśrodkowany pod wąskim polem, kursor jak przy linku', () => {
    const { env, msg, scan, G } = gravis('CRETURN_PRIMARY_GRADING');
    msg({ type: 'sh-gravis-ready' });
    G.send('LPNAA000000001');
    env.sandbox.document.body.appendChild(scan);
    msg({ type: 'sh-gravis-asin', lpn: 'LPNAA000000001', asin: 'B0TEST1234' });
    eq([G.chip.style.left, G.chip.style.top, G.chip.style.transform, G.chip.style.cursor],
       ['960px', '434px', 'translateX(-50%)', 'pointer']);
});

test('brak ASIN w GRAVIS nie pokazuje niczego — ani N/A, ani błędu', () => {
    const { env, msg, scan, G } = gravis();
    msg({ type: 'sh-gravis-ready' });
    G.send('LPNAA000000002');
    env.sandbox.document.body.appendChild(scan);
    msg({ type: 'sh-gravis-asin', lpn: 'LPNAA000000002', asin: null });
    page(env, '');
    eq(G.chip, null);
});

test('GRAVIS zamilkł po przeładowaniu: cicha podpowiedź, po ponownym kliknięciu znika', () => {
    const { env, msg, scan, G } = gravis();
    env.sandbox.document.body.appendChild(scan);
    msg({ type: 'sh-gravis-ready' });
    env.clock.set(env.clock.now() + env.SH.CONFIG.GRAVIS_STALE_MS - 1000);
    page(env, '');
    eq(G.chip, null, 'przed granicą milczenia');
    env.clock.set(env.clock.now() + 2000);
    page(env, '');
    ok(G.chip && G.chip.textContent === env.SH.I18n.get('gravis_restartHint'), 'podpowiedź pod polem');
    eq(G.chip.style.pointerEvents, 'none', 'podpowiedź nie łapie kliknięć');
    msg({ type: 'sh-gravis-ready' });
    eq(G.chip, null, 'skrypt w GRAVIS znów żyje');
});

test('T-REX po przeładowaniu odnajduje okno GRAVIS z jego sygnału', () => {
    const { fake, msg, G } = gravis();
    eq(G.win, null, 'po starcie uchwytu nie ma');
    msg({ type: 'sh-gravis-ready' });
    eq(G.win, fake);
    G.send('LPNAA000000003');
    eq(fake.sent.map(m => m.lpn), ['LPNAA000000003']);
});

test('karta GRAVIS: znaczek przezroczysty dla kliknięć, bez okna statystyk i panelu', () => {
    // Na karcie GRAVIS skrypt nie liczy i nie ma ustawień — tylko odpowiada.
    const opener = { posted: [], postMessage(m, o) { this.posted.push([m.type, o]); } };
    const env = makeEnv({ href: 'https://eu-cretfc-tools-dub.dub.proxy.amazon.com/gravis' });
    Object.assign(env.window.location, { origin: 'https://eu-cretfc-tools-dub.dub.proxy.amazon.com', pathname: '/gravis' });
    env.window.opener = opener;
    vm.runInContext(ARTIFACT, env.sandbox, { filename: 'counter.js' });
    const all = [];
    (function walk(n) { all.push(n); n.children.forEach(walk); })(env.sandbox.document.body);
    const ids = all.map(n => n.id).filter(Boolean);
    const badge = all.find(n => n.id && n.id.endsWith('gravisBadge'));
    ok(badge, 'znaczek');
    eq(badge.style.pointerEvents, 'none');
    notOk(ids.some(id => id.endsWith('statsWindow') || id.endsWith('settingsPanel')), 'ani okna, ani panelu');
    eq(env.window.SH, undefined, 'bez konsolowego API licznika');
    eq(opener.posted[0], ['sh-gravis-ready', 'https://trex-prod-eu.aka.amazon.com']);
    eq(env.net.fetches, [], 'bez sieci');
});

describe('Odcinki zadania wpisane ręcznie');

function tasksEnv(shift) {
    const env = bootOnStand();
    const S = env.SH.store;
    const d = new Date(STAND_TIME);
    if (shift === 'night') {
        // Noc 16→17.09, teraz 03:00.
        env.clock.set(new Date(2026, 8, 17, 3, 0, 0).getTime());
        S.sessionConfig.shiftType = 'night';
        S.sessionConfig.shiftCalculatedStartTime = new Date(2026, 8, 16, 18, 30).getTime();
    } else {
        S.sessionConfig.shiftType = 'day';
        S.sessionConfig.shiftCalculatedStartTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 30).getTime();
    }
    S.sessionConfig.selectedLunchIndex = null;
    return env;
}

test('cztery odcinki w zmianie dziennej, czas pracy to ich suma', () => {
    const env = tasksEnv('day');
    const TM = env.SH.TaskManager;
    const task = TM.active();
    ok(TM.setSegments(task.id, '06:30-08:00, 9:00-10:00, 10:30-11:00, 12:00-13:00'));
    eq(task.segments.length, 4);
    eq(TM.workedMs(task), 4 * 60 * MIN);
    eq(TM.formatSegments(task), '06:30-08:00, 09:00-10:00, 10:30-11:00, 12:00-13:00');
});

test('odcinek przez północ w zmianie nocnej; obiad się nie liczy', () => {
    const env = tasksEnv('night');
    const S = env.SH.store;
    const TM = env.SH.TaskManager;
    const task = TM.active();
    ok(TM.setSegments(task.id, '23:30-02:00'));
    eq(TM.workedMs(task), 150 * MIN, '2,5 h bez obiadu');
    S.sessionConfig.selectedLunchIndex = 5;                  // 23:50–00:20
    eq(TM.workedMs(task), 120 * MIN, 'obiad odpada');
    ok(TM.setSegments(task.id, '19:00-20:00, 01:00-'), 'otwarty koniec aktywnego zadania');
    ok(TM.isRunning(task));
});

test('odrzucane: zły zapis, przyszłość, nakładanie, otwarty koniec w środku', () => {
    const env = tasksEnv('day');
    const TM = env.SH.TaskManager;
    const task = TM.active();
    const before = TM.formatSegments(task);
    for (const bad of ['', 'xx', '25:00-26:00', '07:00-08:00, 07:30-09:00', '07:00-, 08:00-09:00',
                       '16:00-17:00', '06:30-08:61']) {
        notOk(TM.setSegments(task.id, bad), JSON.stringify(bad));
    }
    eq(TM.formatSegments(task), before, 'odrzucony zapis niczego nie zmienia');
    const other = TM.create('fast', Date.now() - 30 * MIN);
    notOk(TM.setSegments(other.id, '14:00-14:45'), 'nachodzi na odcinek pierwszego zadania');
});

describe('Kilka kart naraz');

const COMBOS = [
    ['CRETURN', 'CRETURN_PRIMARY_GRADING', 'WAREHOUSE_DEALS', 'CRETURN_REFURB'],
    ['CRETURN_PRIMARY_GRADING', 'WAREHOUSE_DEALS', 'CRETURN_REFURB'],
    ['CRETURN', 'WAREHOUSE_DEALS', 'CRETURN_REFURB'],
    ['CRETURN', 'CRETURN_PRIMARY_GRADING'],
    ['WAREHOUSE_DEALS', 'CRETURN_REFURB'],
    ['CRETURN_PRIMARY_GRADING', 'CRETURN_REFURB'],
];
const KEY = { CRETURN: 'CRET', CRETURN_PRIMARY_GRADING: 'UG', WAREHOUSE_DEALS: 'WHD', CRETURN_REFURB: 'REFURB' };

for (const combo of COMBOS) {
    test(`karty ${combo.map(m => KEY[m]).join('+')}: każda liczy swoje, suma i czas od pojemnika wspólne`, () => {
        const clock = makeClock(STAND_TIME);
        const net = makeTabNetwork();
        const tabs = combo.map(mode => net.open({ href: URL_OF(mode), clock }));
        tabs.forEach(t => page(t, ''));
        // Przedmiot w każdej karcie; w UG z naklejką (+2).
        tabs.forEach((t, i) => {
            for (let k = 0; k <= i; k++) {
                page(t, 'poniżej');
                let st = null;
                if (t.SH.store.currentTabType === 'UG') {
                    st = t.sandbox.document.createElement('div');
                    st.id = 'sticker-back-hide';
                    t.sandbox.document.body.appendChild(st);
                    page(t, 'poniżej');
                }
                page(t, 'Przypisz nowy');
                if (st) st.remove();
                scanTote(t);
                page(t, '');
                net.flush();
            }
        });
        tote(tabs[0], 'tsZ9');
        // Autozapis ustawień idzie z opóźnieniem; tu dopychamy go od razu.
        tabs[0].SH.Persistence.scheduleSave.flush();
        net.flush();
        tabs.forEach(t => t.SH.Persistence.debouncedLoad.flush());
        const expected = {};
        tabs.forEach((t, i) => { expected[t.SH.store.currentTabType] = (i + 1) * (t.SH.store.currentTabType === 'UG' ? 2 : 1); });
        const total = Object.values(expected).reduce((a, b) => a + b, 0);
        for (const t of tabs) {
            for (const [key, n] of Object.entries(expected)) eq(t.SH.store.tabCounters[key] || 0, n, `${t.SH.store.currentTabType} widzi ${key}`);
            t.SH.StatsWindowRenderer.renderContent();
            const l7 = t.SH.StatsWindowRenderer.lines.line7_compact.textContent;
            eq(Number(l7.split(' · ')[1].split(' ')[0]), total, `${t.SH.store.currentTabType}: suma paczek w linii 7`);
            ok(t.SH.store.sessionConfig.lastToteAt > 0, `${t.SH.store.currentTabType}: czas od pojemnika dotarł`);
        }
    });
}
