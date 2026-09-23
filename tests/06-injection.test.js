/**
 * 06-injection.test.js — odporność na wstrzyknięcia.
 *
 * Skrypt działa na cudzej stronie i czyta dane z trzech niezaufanych źródeł:
 *   1. localStorage tej domeny (dzielony z samą aplikacją T-REX),
 *   2. tekst i DOM strony (ASIN, kody sortowania),
 *   3. odpowiedzi obcych serwisów (Keepa, r.jina.ai, dostawcy kursów).
 *
 * Każde z nich trafia gdzieś dalej: do łańcucha CSS, do atrybutu href,
 * do adresu zapytania albo do wyrażenia regularnego. Te testy sprawdzają,
 * że po drodze stoi filtr.
 */

'use strict';

const { describe, test, eq, ok, notOk, throws } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const U = env.SH.Utils;

describe('Wstrzyknięcie CSS');

test('hexToRgb odrzuca próbę zamknięcia reguły', () => {
    eq(U.hexToRgb('#fff) ; } body { display:none } a{color:rgb(0'), '128, 128, 128');
    eq(U.hexToRgb('red'), '128, 128, 128');
    eq(U.hexToRgb('#12345'), '128, 128, 128');
    eq(U.hexToRgb('#1234567'), '128, 128, 128');
    eq(U.hexToRgb('#0078D7'), '0, 120, 215');
});

test('clampNum nie przepuszcza NaN, nieskończoności ani tekstu z CSS', () => {
    eq(U.clampNum('14px; position:fixed', 8, 36, 14), 14);
    eq(U.clampNum(NaN, 0, 100, 60), 60);
    eq(U.clampNum(Infinity, 0, 100, 60), 60, 'nieskończoność traktowana jak brak liczby');
    eq(U.clampNum(-Infinity, 0, 100, 60), 60);
    eq(U.clampNum(-50, 0, 100, 60), 0);
    eq(U.clampNum('20', 8, 36, 14), 20);
});

test('arkusz stylów nie daje się rozsadzić wartościami z konfiguracji', () => {
    const cfg = env.SH.store.localTabConfig;
    const oldColor = cfg.linesConfig.line7_compact.colorHex;
    const oldSize = cfg.linesConfig.line7_compact.fontSize;

    cfg.linesConfig.line7_compact.colorHex = '#000) }  body{display:none} :root{--x:rgb(0';
    cfg.linesConfig.line7_compact.fontSize = '13px; } body { display:none } i{';
    env.SH.CSSManager.updateAll();
    const css = env.el('reactiveStyles').textContent;

    // W poprawnym arkuszu „display: none” występuje wyłącznie jako wartość
    // zmiennej --sh-<linia>-display. Obcy selektor poznaje się po tym, że
    // w arkuszu pojawia się cokolwiek poza jednym blokiem :root.
    notOk(css.includes('body'), 'obcy selektor w arkuszu');
    notOk(css.includes('#000)'), 'surowa wartość z konfiguracji w arkuszu');
    eq((css.match(/\{/g) || []).length, 1, 'arkusz musi mieć dokładnie jeden blok');
    eq((css.match(/\}/g) || []).length, 1, 'i dokładnie jedną klamrę zamykającą');
    ok(css.includes('--sh-line7_compact-color: rgba(128, 128, 128,'), 'kolor spada do szarości');
    ok(css.includes('--sh-line7_compact-size: 14px'), 'rozmiar spada do wartości domyślnej');

    cfg.linesConfig.line7_compact.colorHex = oldColor;
    cfg.linesConfig.line7_compact.fontSize = oldSize;
    env.SH.CSSManager.updateAll();
});

test('nazwa linii z dziwnymi znakami nie tworzy zmiennej CSS', () => {
    const cfg = env.SH.store.localTabConfig;
    cfg.linesConfig['zła nazwa{}'] = { visible: true, colorHex: '#ffffff', alpha: 50, fontSize: 12 };
    env.SH.CSSManager.updateAll();
    const css = env.el('reactiveStyles').textContent;
    notOk(css.includes('zła nazwa'), 'klucz spoza [A-Za-z0-9_] musi być pominięty');
    delete cfg.linesConfig['zła nazwa{}'];
    env.SH.CSSManager.updateAll();
});

describe('Wstrzyknięcie HTML i podstawień');

test('h() nie parsuje HTML — znaczniki zostają tekstem', () => {
    const el = env.SH.StatsWindowRenderer.lines.line1_currentTab;
    // Nazwa karty jest wpisywana przez człowieka i trafia do linii 1.
    env.SH.store.userConfig.customTabSettings['unknownTabInstance_x'] =
        { displayName: '<img src=x onerror=alert(1)>', includeInGlobal: false };
    const old = env.SH.store.currentTabInstanceId;
    env.SH.store.currentTabInstanceId = 'unknownTabInstance_x';
    env.SH.StatsWindowRenderer.renderContent();

    eq(el.children.length, 0, 'linia 1 nie może dostać elementów potomnych');
    ok(el.textContent.includes('<img src=x onerror=alert(1)>'), 'znaczniki muszą zostać tekstem');

    env.SH.store.currentTabInstanceId = old;
    delete env.SH.store.userConfig.customTabSettings['unknownTabInstance_x'];
    env.SH.StatsWindowRenderer.renderContent();
});

test('I18n.get nie interpretuje $& $` $\' w podstawianej wartości', () => {
    const s = env.SH.I18n.get('statsLine4_lunch', {
        lunchNumber: '$&', lunchStartTime: "$'", lunchEndTime: '$1',
    });
    ok(s.includes('$&') && s.includes("$'") && s.includes('$1'),
       'sekwencje specjalne muszą przejść dosłownie, jest: ' + s);
});

describe('Wstrzyknięcie adresu');

test('productUrl nigdy nie zbuduje adresu javascript: ani data:', () => {
    const u1 = env.SH.productUrl('javascript:alert(1)');
    ok(u1.startsWith('https://www.amazon.de/dp/'), 'adres: ' + u1);
    notOk(u1.includes('javascript:alert(1)'), 'ładunek musi zostać zakodowany');
    eq(env.SH.productUrl('B0915C748N'), 'https://www.amazon.de/dp/B0915C748N');
});

test('nieznany sklep spada do domyślnego, nie do undefined', () => {
    env.SH.store.userConfig.marketplace = 'evil.example.com';
    eq(env.SH.productUrl('B0915C748N'), 'https://www.amazon.de/dp/B0915C748N');
    env.SH.store.userConfig.marketplace = 'de';
});

test('KeepaOCR.url odrzuca ASIN spoza formatu', () => {
    throws(() => env.SH.KeepaOCR.url('B0915C748N&evil=1'), 'ASIN z parametrem', /niedozwolony ASIN/);
    throws(() => env.SH.KeepaOCR.url('../../etc/passwd'), 'ścieżka', /niedozwolony ASIN/);
    throws(() => env.SH.KeepaOCR.url(''), 'pusty', /niedozwolony ASIN/);
    throws(() => env.SH.KeepaOCR.url(null), 'null', /niedozwolony ASIN/);
    ok(env.SH.KeepaOCR.url('B0915C748N').includes('asin=B0915C748N'));
});

describe('Wstrzyknięcie do wyrażenia regularnego');

test('kody sortowania z metaznakami są uciekane', () => {
    const C = env.SH.CONFIG;
    const oldSell = C.ROUTE_SELL_CODES.slice();
    C.ROUTE_SELL_CODES.push('CRITS-(.*)');
    env.SH.Routing._re = null;      // wymuszamy przebudowę wzorca

    const counts = env.SH.Routing.countAll('Zeskanuj CRITS-DOWOLNY tekst');
    eq(counts.size, 0, 'wzorzec nie może stać się maską pasującą do wszystkiego');

    const counts2 = env.SH.Routing.countAll('Zeskanuj CRITS-(.*)');
    eq(counts2.get('CRITS-(.*)'), 1, 'dosłowny kod musi się nadal liczyć');

    C.ROUTE_SELL_CODES.length = 0;
    oldSell.forEach(c => C.ROUTE_SELL_CODES.push(c));
    env.SH.Routing._re = null;
});

describe('Granice magazynu');

test('StorageManager.ownKeys nie dotyka cudzych kluczy', () => {
    const LS = env.sandbox.localStorage;
    LS.setItem('trex_app_state', 'ważne dane aplikacji');
    LS.setItem(env.prefix + 'userConfig', '{}');
    LS.setItem('statsHelper_shared_valueArchive', '{}');

    const keys = env.SH.StorageManager.ownKeys();
    ok(keys.includes(env.prefix + 'userConfig'));
    ok(keys.includes('statsHelper_shared_valueArchive'));
    notOk(keys.includes('trex_app_state'), 'klucz TREX musi zostać nietknięty');

    LS.removeItem('trex_app_state');
});
