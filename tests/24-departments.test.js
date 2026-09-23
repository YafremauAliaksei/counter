/**
 * 24-departments.test.js — działy: skąd się biorą i jak dopisać kolejny.
 *
 * JAK TO DZIAŁA. Dział to karta T-REX: skrypt rozpoznaje ją po adresie
 * (`urlKeyword`) i pod jej kluczem trzyma wszystkie liczniki. Zadanie NIE jest
 * przypisane do działu — trzyma liczniki OSOBNO DLA KAŻDEGO z nich, bo jeden
 * proces pracy potrafi iść w dwóch kartach naraz.
 *
 * DZIAŁ RĘCZNY (1.3.2). `OTHER` nie ma `urlKeyword`, więc nie zostanie nigdy
 * rozpoznany jako karta i licznik nie zwiększy go sam. Liczby wpisuje się
 * w panelu. Po co: paczki bywają robione poza trzema znanymi procesami, a do
 * tej pory nie było ich gdzie zapisać — wpisywano je do cudzego działu albo
 * przepadały, przez co tempo zmiany kłamało w dół.
 *
 * DOPISANIE KOLEJNEGO DZIAŁU to jedna linia w `KNOWN_TAB_TYPES` plus nazwa
 * w trzech słownikach. Ten plik pilnuje, że tak zostanie: panel i linia 2
 * chodzą po mapie działów, a nie po wpisanej gdzieś liście trzech kluczy.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const env = bootOnStand();
const clock = env.clock;
const SH = env.SH;
const S = SH.store;
const C = SH.CONFIG;
const TM = SH.TaskManager;
const HOUR = 3600000;

SH.SettingsPanel.rerender = function () {
    if (S.uiFlags.isSettingsPanelVisible) this.render();
};

describe('Mapa działów jest jedynym źródłem prawdy');

test('dział ręczny nie ma urlKeyword, a rozpoznawalne działy mają', () => {
    const manual = Object.values(C.KNOWN_TAB_TYPES).filter(t => !t.urlKeyword);
    eq(manual.map(t => t.key), ['OTHER'], 'działy bez własnej karty');
    for (const t of Object.values(C.KNOWN_TAB_TYPES)) {
        ok(t.key && t.displayNameKey && t.baseColorHex, 'niepełny wpis działu: ' + t.key);
    }
});

test('każdy dział ma nazwę we wszystkich trzech językach', () => {
    // Brakująca nazwa nie wywala skryptu — pokazuje surowy klucz, czyli coś
    // w rodzaju „tabName_OTHER” w oknie statystyk. Tanie sprawdzenie, a łapie
    // najczęstsze przeoczenie przy dopisywaniu działu.
    const missing = [];
    for (const lang of Object.keys(SH.CONFIG.AVAILABLE_LANGUAGES.reduce((a, l) => ({ ...a, [l.code]: 1 }), {}))) {
        S.userConfig.language = lang;
        for (const t of Object.values(C.KNOWN_TAB_TYPES)) {
            const name = SH.I18n.get(t.displayNameKey);
            if (!name || name === t.displayNameKey) missing.push(`${lang}:${t.key}`);
        }
    }
    S.userConfig.language = 'pl';
    eq(missing, [], 'działy bez nazwy');
});

test('dział ręczny nie zostanie rozpoznany jako bieżąca karta', () => {
    // Gdyby brał udział w rozpoznawaniu, pierwsza karta bez gradingMode
    // wylądowałaby w „Inne”, a jej paczki dopisywałyby się do ręcznego worka.
    notOk(S.currentTabInstanceId === 'OTHER', 'bieżąca karta to nie dział ręczny');
    ok(['CRET', 'REFURB', 'WHD', C.UNKNOWN_TAB_TYPE_KEY].includes(S.currentTabType)
       || String(S.currentTabInstanceId).startsWith(C.UNKNOWN_TAB_INSTANCE_ID_PREFIX),
       'rozpoznano kartę spoza listy działów ręcznych, jest: ' + S.currentTabType);
});

describe('Ręczne wpisywanie paczek do działu');

test('wpisanie licznika działu ręcznego trafia do aktywnego zadania', () => {
    // Dział ręczny działa dokładnie tak, jak każdy inny — różni się tylko tym,
    // że nic nie zwiększy go samo.
    S.tasks = []; S.activeTaskId = null; S.taskCounters = {};
    S.tabCounters.OTHER = 0; S.tabSold.OTHER = 0; S.tabNeutral.OTHER = 0;
    TM.create('Default', clock.now() - 2 * HOUR);

    TM.applyManualTotal('OTHER', 50);
    eq(TM.counters(TM.active().id, 'OTHER').done, 50, 'paczki zadania w dziale ręcznym');
    eq(TM.counters(TM.active().id, 'OTHER').neutral, 50, 'wpisane ręcznie, więc poza mianownikiem');
    eq(TM.shiftTotal('OTHER', 'done'), 50);
});

test('zmniejszenie liczby paczek obniża tempo', () => {
    // Tak wygląda wykluczenie przedmiotów z dziennych wskaźników: pięć paczek
    // mniej przy dziesięciogodzinnej zmianie to pół paczki na godzinę mniej.
    S.tasks = []; S.activeTaskId = null; S.taskCounters = {};
    S.tabCounters.OTHER = 0; S.tabSold.OTHER = 0; S.tabNeutral.OTHER = 0;
    const now = clock.now();
    TM.create('Default', now - 10 * HOUR);
    const task = TM.active();

    TM.applyManualTotal('OTHER', 300);
    const before = TM.rate(task, now);
    ok(Math.abs(before - 30) < 0.2, 'tempo przed poprawką: ' + before.toFixed(2));

    TM.applyManualTotal('OTHER', 295);
    const after = TM.rate(task, now);
    ok(Math.abs(before - after - 0.5) < 0.05,
       'pięć paczek przez dziesięć godzin to pół paczki na godzinę: ' + (before - after).toFixed(2));
});

test('dział ręczny jest w panelu, na samym dole listy działów', () => {
    // Kolejność w mapie działów jest kolejnością na ekranie, a ręczny stoi
    // za tymi, które napełniają się same.
    if (!S.uiFlags.isSettingsPanelVisible) SH.SettingsPanel.toggle();
    SH.SettingsPanel.render();
    const text = SH.SettingsPanel.el.textContent;
    const at = (key) => text.indexOf(SH.I18n.get(C.KNOWN_TAB_TYPES[key].displayNameKey));
    ok(at('CRET') >= 0 && at('REFURB') >= 0 && at('WHD') >= 0 && at('OTHER') >= 0,
       'wszystkie działy w panelu');
    ok(at('OTHER') > at('WHD'), 'dział ręczny pod pozostałymi');
});

describe('Nowy dział a reszta programu');

test('dział ręczny wchodzi do sumy globalnej i ma swój kolor', () => {
    eq(S.userConfig.globalStatsContributionKnown.OTHER, true, 'domyślnie wliczany');
    ok(SH.DEFAULT_LINE_CONFIG.line2_globalSummary.customColors.OTHER, 'kolor w linii 2');
});

test('linia 2 pokazuje dział ręczny dopiero, gdy ma paczki', () => {
    // Pusty dział ręczny w linii podsumowania byłby stałym „OTHER 0” na ekranie
    // kogoś, kto nigdy go nie użyje.
    S.tasks = []; S.activeTaskId = null; S.taskCounters = {};
    S.tabCounters.OTHER = 0;
    S.localTabConfig.linesConfig.line2_globalSummary.visible = true;
    TM.create('Default', clock.now() - HOUR);
    SH.StatsWindowRenderer.renderContent();
    const empty = SH.StatsWindowRenderer.lines.line2_globalSummary.textContent;
    notOk(empty.includes(SH.I18n.get('tabName_OTHER')), 'pusty dział nie zajmuje miejsca: ' + empty);

    TM.applyManualTotal('OTHER', 7);
    S.tabCounters.OTHER = 7;
    SH.StatsWindowRenderer.renderContent();
    const filled = SH.StatsWindowRenderer.lines.line2_globalSummary.textContent;
    ok(filled.includes(SH.I18n.get('tabName_OTHER')), 'z paczkami już widać: ' + filled);
    S.localTabConfig.linesConfig.line2_globalSummary.visible = false;
});

test('kod ustawień zna nowy dział pod własnymi numerami', () => {
    // Numery muszą być NOWE: gdyby dział dostał numer po kimś, stare kody
    // w kieszeniach ludzi zaczęłyby ustawiać co innego.
    const reg = SH.ConfigCode.REGISTRY;
    const color = reg.find(e => e.path === 'linesConfig.line2_globalSummary.customColors.OTHER');
    const flag = reg.find(e => e.path === 'globalStatsContributionKnown.OTHER');
    ok(color && flag, 'oba pola w rejestrze');
    eq(color.id, 0x0118);
    eq(flag.id, 0x0309);
    eq(reg.filter(e => e.id === color.id).length, 1, 'numer koloru niepowtarzalny');
    eq(reg.filter(e => e.id === flag.id).length, 1, 'numer wyłącznika niepowtarzalny');
});

describe('Cisza');

test('czwarty dział nie kosztował ani zapytania, ani linii w konsoli', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
