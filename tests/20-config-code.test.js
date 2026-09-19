/**
 * 20-config-code.test.js — kod ustawień: jeden ciąg szesnastkowy zamiast
 * przeklikiwania panelu od nowa na każdej maszynie.
 *
 * TRZY WŁASNOŚCI, OD KTÓRYCH ZALEŻY, CZY TO SIĘ NADAJE DO UŻYCIA:
 *
 *   1. KOD JEST ŁATKĄ, nie zdjęciem konfiguracji. Wchodzi do niego wyłącznie to,
 *      co różni się od wartości domyślnych. Dzięki temu, gdy w następnym wydaniu
 *      zmieni się domyślna wartość czegoś, czego dany człowiek nigdy nie ruszał,
 *      on tę nową wartość DOSTANIE — zamiast zostać na starej, nie wiedząc o tym.
 *   2. STARY SKRYPT ZROZUMIE NOWY KOD. Każdy rekord niesie własną długość, więc
 *      nieznany numer da się przeskoczyć. Bez tego dopisanie jednego ustawienia
 *      unieważniałoby wszystkie kody w kieszeniach ludzi.
 *   3. KOD PRZYCHODZI Z ZEWNĄTRZ — z czatu, z maila, z cudzej zakładki. Więc
 *      dekodowanie nie tworzy pól, nie wychodzi poza rejestr i przycina liczby
 *      do granic z rejestru.
 *
 * Numery `id` i KOLEJNOŚĆ list wyboru są częścią formatu: raz wydanego numeru
 * nie wolno użyć ponownie, a pozycji w liście nie wolno przestawić. Pilnuje
 * tego zamrożona próbka na końcu pliku.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const CC = SH.ConfigCode;

/** Świeży egzemplarz skryptu — do sprawdzania, co kod naprawdę nałożył. */
function freshEnv() {
    return boot();
}

/** Bajty na ciąg szesnastkowy z sumą kontrolną na końcu. */
function buildCode(bytes) {
    const all = [CC.FORMAT, ...bytes];
    all.push(all.reduce((a, b) => (a + b) & 0xff, 0));
    return '0x' + all.map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('Kod jest łatką, a nie zdjęciem konfiguracji');

test('bez zmian kod jest pusty — sama ramka', () => {
    const clean = freshEnv();
    // 0x01 (wersja formatu) + 0x01 (suma kontrolna z jednego bajtu).
    eq(clean.SH.configCode(), '0x0101');
});

test('zmiana jednej rzeczy daje jeden rekord', () => {
    const e = freshEnv();
    e.SH.store.localTabConfig.linesConfig.line7_compact.alpha = 90;
    const res = e.SH.ConfigCode.decode(e.SH.configCode());
    ok(res.ok, res.error);
    eq(res.stats.applied, 1, 'dokładnie jeden rekord');
    eq(res.patch.local['linesConfig.line7_compact.alpha'], 90);
});

test('powrót do wartości domyślnej usuwa rekord z kodu', () => {
    const e = freshEnv();
    const before = e.SH.configCode();
    e.SH.store.localTabConfig.linesConfig.line7_compact.alpha = 90;
    ok(e.SH.configCode() !== before, 'zmiana musi być widoczna w kodzie');
    e.SH.store.localTabConfig.linesConfig.line7_compact.alpha = 50;
    eq(e.SH.configCode(), before, 'po powrocie do domyślnej kod jest znowu pusty');
});

test('nałożenie kodu nie rusza ustawień, których w nim nie ma', () => {
    const source = freshEnv();
    source.SH.store.localTabConfig.linesConfig.line1_currentTab.visible = true;
    const code = source.SH.configCode();

    const target = freshEnv();
    target.SH.store.localTabConfig.priceCard.width = 999;   // czegoś takiego w kodzie nie ma
    target.SH.config(code);
    eq(target.SH.store.localTabConfig.linesConfig.line1_currentTab.visible, true, 'to z kodu');
    eq(target.SH.store.localTabConfig.priceCard.width, 999, 'to spoza kodu zostaje nietknięte');
});

describe('Pełny obieg: ustawienia -> kod -> inna maszyna');

test('wszystkie typy wartości wracają takie same', () => {
    const source = freshEnv();
    const S = source.SH.store;
    S.localTabConfig.linesConfig.line1_currentTab.visible = true;        // bool
    S.localTabConfig.linesConfig.line1_currentTab.alpha = 75;            // u8
    S.localTabConfig.linesConfig.line1_currentTab.colorHex = '#ff8800';  // color
    S.localTabConfig.priceCard.width = 420;                              // u16
    S.localTabConfig.priceCard.source = 'jina';                          // enum
    S.localTabConfig.statsWindowPosition.left = '15%';                   // text
    S.userConfig.language = 'ru';
    S.userConfig.globalStatsContributionKnown.WHD = false;

    const target = freshEnv();
    const report = target.SH.config(source.SH.configCode());
    eq(report['kod przyjęty'], true);
    eq(report['ustawień nałożonych'], 8);

    const T = target.SH.store;
    eq(T.localTabConfig.linesConfig.line1_currentTab.visible, true);
    eq(T.localTabConfig.linesConfig.line1_currentTab.alpha, 75);
    eq(T.localTabConfig.linesConfig.line1_currentTab.colorHex, '#ff8800');
    eq(T.localTabConfig.priceCard.width, 420);
    eq(T.localTabConfig.priceCard.source, 'jina');
    eq(T.localTabConfig.statsWindowPosition.left, '15%');
    eq(T.userConfig.language, 'ru');
    eq(T.userConfig.globalStatsContributionKnown.WHD, false);
});

test('kod jest niezmienny przy ponownym zakodowaniu', () => {
    // Inaczej ten sam człowiek dostawałby co chwilę inny ciąg i nie wiedziałby,
    // który jest aktualny.
    const source = freshEnv();
    source.SH.store.localTabConfig.priceCard.colorHex = '#AABBCC';
    const first = source.SH.configCode();

    const target = freshEnv();
    target.SH.config(first);
    eq(target.SH.configCode(), first, 'kod -> stan -> kod daje to samo');
});

test('kod trafia do magazynu, więc przeżywa F5', () => {
    const e = freshEnv();
    e.SH.config('0x010160010063');   // linia 7 niewidoczna
    eq(e.SH.store.localTabConfig.linesConfig.line7_compact.visible, false);
    const key = e.SH.StorageManager.getKey(e.SH.CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS);
    ok(String(e.sandbox.localStorage.getItem(key)).includes('"visible":false'),
       'zapis do localStorage po nałożeniu kodu');
});

describe('Stary skrypt rozumie nowszy kod');

test('nieznany numer jest przeskakiwany, znane rekordy wchodzą', () => {
    // Rekord 0xFFFF o długości 4 udaje ustawienie z przyszłego wydania.
    const code = buildCode([
        0x01, 0x60, 0x01, 0x00,           // linia 7: niewidoczna (znane)
        0xff, 0xff, 0x04, 1, 2, 3, 4,     // coś, czego ten skrypt nie zna
        0x03, 0x00, 0x01, 0x01,           // język: en (znane)
    ]);
    const e = freshEnv();
    const report = e.SH.config(code);
    eq(report['kod przyjęty'], true);
    eq(report['ustawień nałożonych'], 2, 'oba znane rekordy nałożone');
    eq(report['rekordów nieznanych (nowszy skrypt je zrozumie)'], 1);
    eq(e.SH.store.localTabConfig.linesConfig.line7_compact.visible, false);
    eq(e.SH.store.userConfig.language, 'en');
});

describe('Odrzucanie kodów zepsutych');

test('puste, nie-szesnastkowe, nieparzyste', () => {
    notOk(CC.decode('').ok, 'pusty');
    notOk(CC.decode('   ').ok, 'same spacje');
    notOk(CC.decode(null).ok, 'null');
    notOk(CC.decode(undefined).ok, 'undefined');
    notOk(CC.decode('0xZZ').ok, 'znak spoza zapisu');
    notOk(CC.decode('0x010').ok, 'nieparzysta liczba znaków');
    notOk(CC.decode('0x01').ok, 'sama wersja bez sumy kontrolnej');
});

test('przekłamany znak wywraca sumę kontrolną', () => {
    const good = buildCode([0x01, 0x60, 0x01, 0x00]);
    ok(CC.decode(good).ok, 'kod wzorcowy musi być poprawny');
    // Podmieniamy jedną cyfrę wartości — tak wygląda literówka przy przepisywaniu.
    const broken = good.slice(0, -4) + 'ff' + good.slice(-2);
    notOk(CC.decode(broken).ok, 'przekłamanie musi zostać złapane');
});

test('nieznana wersja formatu jest odrzucana w całości', () => {
    const bytes = [0x09, 0x01, 0x60, 0x01, 0x00];
    bytes.push(bytes.reduce((a, b) => (a + b) & 0xff, 0));
    const res = CC.decode('0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join(''));
    notOk(res.ok, 'nie zgadujemy znaczenia nieznanej ramki');
});

test('urwany rekord nie psuje tego, co przed nim', () => {
    // Długość mówi 8 bajtów, a jest ich mniej — tak wygląda kod ucięty przy
    // kopiowaniu.
    const code = buildCode([0x01, 0x60, 0x01, 0x00, 0x03, 0x00, 0x08, 0x01]);
    const res = CC.decode(code);
    ok(res.ok, 'reszta kodu zostaje użyta');
    eq(res.stats.applied, 1, 'rekord sprzed urwania');
    eq(res.stats.invalid, 1, 'urwany policzony osobno');
});

describe('Kod z zewnątrz nie może więcej, niż wolno');

test('nie da się utworzyć pola spoza rejestru', () => {
    const e = freshEnv();
    const before = JSON.stringify(e.SH.store.localTabConfig);
    e.SH.config(buildCode([0xab, 0xcd, 0x02, 0x41, 0x42]));
    eq(JSON.stringify(e.SH.store.localTabConfig), before, 'stan bez zmian');
});

test('liczba spoza zakresu jest przycinana, a nie przyjmowana', () => {
    const e = freshEnv();
    // 0x0102 = alfa linii 1, zakres 0..100. Podajemy 250.
    e.SH.config(buildCode([0x01, 0x02, 0x01, 250]));
    eq(e.SH.store.localTabConfig.linesConfig.line1_currentTab.alpha, 100);
});

test('indeks poza listą wyboru jest odrzucany', () => {
    const e = freshEnv();
    const before = e.SH.store.localTabConfig.priceCard.source;
    // 0x0202 = źródło ceny; lista ma trzy pozycje, podajemy dziewiątą.
    const report = e.SH.config(buildCode([0x02, 0x02, 0x01, 9]));
    eq(report['rekordów odrzuconych'], 1);
    eq(e.SH.store.localTabConfig.priceCard.source, before, 'wartość bez zmian');
});

test('tekst ze znakami sterującymi jest odrzucany', () => {
    const e = freshEnv();
    const before = e.SH.store.localTabConfig.statsWindowPosition.left;
    // 0x0004 = położenie okna; wstawiamy bajt 0x00.
    const report = e.SH.config(buildCode([0x00, 0x04, 0x03, 0x31, 0x00, 0x32]));
    eq(report['rekordów odrzuconych'], 1);
    eq(e.SH.store.localTabConfig.statsWindowPosition.left, before);
});

test('zła długość wartości nie przechodzi', () => {
    const e = freshEnv();
    // Kolor to trzy bajty; podajemy dwa.
    const report = e.SH.config(buildCode([0x01, 0x01, 0x02, 0xff, 0x00]));
    eq(report['rekordów odrzuconych'], 1);
});

describe('Rejestr jest spójny — bez tego kody rozjadą się po cichu');

test('numery są niepowtarzalne', () => {
    const seen = new Set();
    const dup = [];
    for (const entry of CC.REGISTRY) {
        if (seen.has(entry.id)) dup.push('0x' + entry.id.toString(16));
        seen.add(entry.id);
    }
    eq(dup, [], 'powtórzone numery');
});

test('każda ścieżka istnieje w wartościach domyślnych', () => {
    // Literówka w ścieżce nie wywala niczego od razu: ustawienie po prostu
    // nigdy nie trafiłoby do kodu i nikt by tego nie zauważył.
    const roots = { local: SH.DEFAULT_LOCAL_CONFIG, user: SH.DEFAULT_USER_CONFIG };
    const missing = CC.REGISTRY.filter(e =>
        e.path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), roots[e.root]) === undefined
    ).map(e => e.root + '.' + e.path);
    eq(missing, [], 'ścieżki bez odpowiednika w domyślnych');
});

test('wartość domyślna każdego pola wyboru jest na swojej liście', () => {
    const roots = { local: SH.DEFAULT_LOCAL_CONFIG, user: SH.DEFAULT_USER_CONFIG };
    const bad = CC.REGISTRY.filter(e => e.type === 'enum').filter(e => {
        const v = e.path.split('.').reduce((o, k) => o[k], roots[e.root]);
        return CC.ENUMS[e.list].indexOf(v) < 0;
    }).map(e => e.path);
    eq(bad, [], 'domyślne spoza listy wyboru');
});

describe('Zamrożona próbka — straż nad zgodnością wsteczną');

test('kod wydany dziś ma znaczyć to samo za rok', () => {
    /**
     * Ten ciąg powstał ręcznie i jest przybity gwoździem. Padnie, jeśli ktoś
     * przestawi pozycje na liście wyboru, użyje ponownie zwolnionego numeru albo
     * zmieni zapis wartości. Każda z tych rzeczy po cichu zmieniłaby znaczenie
     * kodów, które ludzie już mają zapisane.
     *
     * Jeśli ten test pada, a zmiana była zamierzona — trzeba PODNIEŚĆ WERSJĘ
     * FORMATU, a nie poprawiać próbkę.
     */
    const FROZEN = '0x0100040331352501000101010103ff88000102014b02020102020e0201a403000102030601003f';
    const e = freshEnv();
    const report = e.SH.config(FROZEN);
    eq(report['kod przyjęty'], true, report['powód']);

    const S = e.SH.store;
    eq(S.localTabConfig.statsWindowPosition.left, '15%');
    eq(S.localTabConfig.linesConfig.line1_currentTab.visible, true);
    eq(S.localTabConfig.linesConfig.line1_currentTab.colorHex, '#ff8800');
    eq(S.localTabConfig.linesConfig.line1_currentTab.alpha, 75);
    eq(S.localTabConfig.priceCard.source, 'jina');
    eq(S.localTabConfig.priceCard.width, 420);
    eq(S.userConfig.language, 'ru');
    eq(S.userConfig.globalStatsContributionKnown.WHD, false);
});

describe('Gotowa zakładka');

test('odnośnik zawiera adres wydania i kod bieżących ustawień', () => {
    const e = freshEnv();
    e.SH.store.localTabConfig.linesConfig.line7_compact.alpha = 90;
    const link = e.SH.configLink();
    ok(link.startsWith('javascript:'), 'ma być zakładką');
    ok(link.includes(e.SH.CONFIG.RELEASE_URL), 'adres wydania z jednego miejsca');
    ok(link.includes(e.SH.configCode()), 'kod bieżących ustawień');
    ok(link.includes("SH.config('"), 'wywołanie przez SH, a nie przez skrót');
    ok(link.trim().endsWith('void 0;'), 'bez tego zakładka potrafi zastąpić stronę');
});

describe('Cisza po starcie zostaje nienaruszona');

test('kod ustawień nie kosztował ani zapytania, ani linii w konsoli', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
