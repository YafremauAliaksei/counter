/**
 * 42-release-172.test.js — styki modułów: zdarzenia jednego przedmiotu
 * wchodzą między zdarzenia następnego, zmiany albo sąsiedniej karty.
 *
 * Każdy blok zaczyna się od ścieżki, którą błąd przechodzi przez moduły, bo
 * pojedynczo każdy moduł działa: naklejka sprzed chwili, pojemnik czekający
 * przy resecie, kod sortowania po przełączeniu zadania, ręczne +1 zanim
 * doszło zdarzenie storage, zablokowane okno GRAVIS. Liczy się operacje
 * (przerysowania, paczki, zapisy), nie czas. Pętle mają stałą, małą liczbę
 * obrotów — żaden test nie czeka na prawdziwe timery debounce, tylko woła
 * ich treść wprost.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { makeTabNetwork, makeClock, STAND_TIME, bootOnStand, scanTote } = require('./dom-stub');

const URL_OF = (mode) => `https://trex-prod-eu.aka.amazon.com/?gradingMode=${mode}`;
const GRAVIS_ORIGIN = 'https://eu-cretfc-tools-dub.dub.proxy.amazon.com';

/** Klatka strony: podmiana tekstu i jeden skan, jak po paczce mutacji. */
function show(env, text) {
    Object.defineProperty(env.sandbox.document.body, 'innerText', { configurable: true, get: () => text });
    env.SH.AutoTrigger.scan();
}

describe('Pojemnik w jednej karcie a przerysowania w sąsiedniej (lastToteAt we wspólnym sessionConfig)');

test('pojemnik przybity w karcie A kosztuje kartę B najwyżej jedno przerysowanie', () => {
    // Ścieżka: ToteWatch.check pisze lastToteAt -> autozapis A pisze wspólny
    // sessionConfig -> zdarzenie storage w B -> debouncedLoad -> loadAll(true)
    // -> przerysowania B. Pętli echa nie ma (B nic nie odsyła), ale samo
    // wczytanie podmienia całe gałęzie stanu i każda daje osobny render.
    // Debounce zastępuje się wywołaniem wprost — liczy się liczba operacji.
    const clock = makeClock(STAND_TIME);
    const net = makeTabNetwork();
    const A = net.open({ href: URL_OF('CRETURN'), clock });
    const B = net.open({ href: URL_OF('WAREHOUSE_DEALS'), clock });
    for (const e of [A, B]) if (e.SH.store.uiFlags.isSettingsPanelVisible) e.SH.SettingsPanel.toggle();
    A.SH.Persistence.saveState();
    B.SH.Persistence.saveState();
    net.flush();
    const P = B.SH.Persistence;
    const loadAll = P.loadAll.bind(P);
    let loads = 0;
    P.debouncedLoad = () => { loads++; loadAll(true); };
    const W = B.SH.StatsWindowRenderer;
    const render = W.renderContent.bind(W);
    let renders = 0;
    W.renderContent = () => { renders++; render(); };

    show(A, '');
    scanTote(A, 'tsX1');
    clock.set(clock.now() + 1000);
    show(A, '');
    A.SH.Persistence.saveState();
    const events = net.pending();
    net.flush();
    eq(events, 1, 'jeden zapis wspólnego klucza');
    eq(loads, 1, 'jedno wczytanie w B');
    eq(B.SH.store.sessionConfig.lastToteAt, A.SH.store.sessionConfig.lastToteAt, 'B widzi znacznik A');
    ok(renders <= 1, `przerysowania B po jednym pojemniku w A: ${renders}`);
});

describe('Naklejka UG widoczna jeszcze na początku następnego przedmiotu');

test('następny przedmiot nie dziedziczy naklejki, która wisi z poprzedniego', () => {
    // Ścieżka: scan() -> start() zalicza poprzedni i tworzy nowy item ->
    // w tym samym skanie sprawdzenie naklejki widzi stary element
    // (sticker-back-hide jeszcze w DOM) -> nowy item dostaje sticker = true
    // -> przy zaliczeniu +2 i dwie sprzedaże zamiast +1.
    const env = bootOnStand({ href: URL_OF('CRETURN_PRIMARY_GRADING') });
    const S = env.SH.store;
    const cid = S.currentTabInstanceId;
    const doc = env.sandbox.document;
    show(env, '');
    show(env, 'poniżej');
    show(env, '');
    const sticker = doc.createElement('div');
    sticker.id = 'sticker-back-hide';
    doc.body.appendChild(sticker);
    show(env, '');
    show(env, 'Przypisz nowy');
    show(env, '');
    scanTote(env, 'tsA1');
    show(env, '');
    eq(S.tabCounters[cid], 2, 'pierwszy przedmiot z naklejką: +2');
    // Następny krok przychodzi, zanim strona zdejmie naklejkę.
    show(env, 'poniżej');
    sticker.remove();
    show(env, '');
    show(env, 'Przypisz nowy');
    show(env, '');
    scanTote(env, 'tsA2');
    show(env, '');
    eq([S.tabCounters[cid], S.tabSold[cid] || 0], [3, 2], 'drugi przedmiot bez własnej naklejki: +1, bez sprzedaży');
});

describe('Reset zmiany, gdy pojemnik czeka na zniknięcie pola');

test('przedmiot sprzed resetu nie wchodzi do liczników po resecie', () => {
    // Ścieżka: Enter w polu pojemnika (ToteWatch.pending) -> reset ręczny
    // (resetItemData nie czyści ani ToteWatch.pending, ani AutoTrigger.item)
    // -> pole znika -> check() -> onTote -> count() -> +1 w świeżej zmianie
    // i lastToteAt postawiony już po resecie.
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const S = env.SH.store;
    const doc = env.sandbox.document;
    show(env, '');
    show(env, 'poniżej');
    show(env, '');
    show(env, 'Przypisz nowy');
    show(env, '');
    const input = doc.createElement('input');
    input.setAttribute('aria-label', 'Wprowadź pojemnik');
    input.value = 'tsT9';
    doc.body.appendChild(input);
    doc.dispatch('keydown', { key: 'Enter', target: input });
    show(env, '');
    eq(env.SH.ToteWatch.pending && env.SH.ToteWatch.pending.value, 'tsT9', 'pojemnik czeka');
    env.SH.SessionReset.resetItemData('test', 'manual');
    eq(S.tabCounters.CRET || 0, 0, 'zaraz po resecie zero');
    input.remove();
    show(env, '');
    eq([S.tabCounters.CRET || 0, S.sessionConfig.lastToteAt], [0, null], 'po zniknięciu pola nadal zero');
});

describe('GRAVIS: window.open zwraca null (zablokowane wyskakujące okno)');

test('zablokowane ponowne otwarcie nie gubi LPN zeskanowanego przed sygnałem gotowości', () => {
    // Ścieżka: most połączony -> klik „otwórz” przy blokadzie okien ->
    // open() nadpisuje działający uchwyt wartością null -> send() przy
    // braku okna nie odkłada LPN do pendingLpn -> sygnał gotowości z tej
    // samej karty GRAVIS przywraca uchwyt, ale LPN już przepadł.
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    env.SH.store.userConfig.gravisAsin = true;
    const G = env.SH.GravisBridge;
    const fake = { closed: false, sent: [], postMessage(m) { this.sent.push(m); } };
    const msg = (data) => env.sandbox.window._emit('message', { data, source: fake, origin: GRAVIS_ORIGIN });
    env.sandbox.window.open = () => fake;
    G.open();
    msg({ type: 'sh-gravis-ready' });
    ok(G.connected(), 'most połączony');
    env.sandbox.window.open = () => null;
    G.open();
    G.send('LPNAA000000001');
    msg({ type: 'sh-gravis-ready' });
    eq(fake.sent.map(m => m.lpn), ['LPNAA000000001'], 'LPN doszedł do GRAVIS po sygnale gotowości');
});

describe('Pojemnik poprzedniego przedmiotu w klatce z początkiem następnego');

/** Przedmiot zakończony, pojemnik wpisany, pole jeszcze na stronie. */
function finishedWithToteField(env, value) {
    const doc = env.sandbox.document;
    show(env, '');
    show(env, 'poniżej');
    show(env, 'Przypisz nowy');
    const input = doc.createElement('input');
    input.setAttribute('aria-label', 'Wprowadź pojemnik');
    input.value = value;
    doc.body.appendChild(input);
    doc.dispatch('keydown', { key: 'Enter', target: input });
    return input;
}

test('zwykły pojemnik zalicza poprzedni przedmiot, a następny zaczyna bez pojemnika', () => {
    // Ścieżka: pole znika w tej samej paczce mutacji, w której pojawia się
    // „poniżej”. Pojemnik należy do przedmiotu, który go dostał; następny
    // musi czekać na własny, inaczej zaliczy się przy samym końcu kroku.
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const S = env.SH.store;
    const input = finishedWithToteField(env, 'tsA1');
    input.remove();
    show(env, 'poniżej');
    eq(S.tabCounters.CRET, 1, 'poprzedni zaliczony');
    eq(env.SH.AutoTrigger.item.toteOk, false, 'następny bez cudzego pojemnika');
});

test('tsREP poprzedniego przedmiotu przerywa jego, a nie następny', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const S = env.SH.store;
    const input = finishedWithToteField(env, 'tsREP7');
    input.remove();
    show(env, 'poniżej');
    eq(S.tabCounters.CRET || 0, 0, 'eskalowany przedmiot nie wchodzi do licznika');
    ok(env.SH.AutoTrigger.item, 'następny przedmiot trwa');
    show(env, 'Przypisz nowy');
    scanTote(env, 'tsA2');
    show(env, '');
    eq(S.tabCounters.CRET, 1, 'następny liczy się normalnie');
});

test('pole pojemnika, które zniknie dopiero po początku następnego, nie przechodzi na niego', () => {
    // Granica odwrotna: najpierw „poniżej”, pole znika skan później.
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const S = env.SH.store;
    const input = finishedWithToteField(env, 'tsREP8');
    show(env, 'poniżej');
    eq(S.tabCounters.CRET, 1, 'poprzedni zaliczony przy nowym początku');
    input.remove();
    show(env, 'poniżej');
    ok(env.SH.AutoTrigger.item, 'spóźnione zniknięcie pola nie przerywa następnego');
    eq(env.SH.AutoTrigger.item.toteOk, false);
});

describe('Kierunek po zaliczeniu');

test('kod sortowania po przełączeniu zadania trafia do zadania, w którym zaliczono przedmiot', () => {
    // Ścieżka: count() w zadaniu A -> człowiek zakłada zadanie B -> kod
    // sprzedaży przychodzi skan później -> addSold. Gdyby brał zadanie
    // aktywne, B miałoby sprzedane bez paczek (procent ponad 100).
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const TM = env.SH.TaskManager;
    show(env, '');
    show(env, 'poniżej');
    show(env, 'Przypisz nowy');
    scanTote(env, 'tsA1');
    show(env, 'Przypisz nowy');
    const first = TM.active();
    TM.create('B', env.clock.now());
    show(env, 'Zeskanuj CRITS-PRG2');
    eq(TM.totals(first), { done: 1, sold: 1, neutral: 0 }, 'zadanie z chwili zaliczenia');
    eq(TM.totals(TM.active()), { done: 0, sold: 0, neutral: 0 }, 'nowe zadanie puste');
});

test('premia za frazę o odsprzedaży też idzie do zadania z chwili zaliczenia', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN_PRIMARY_GRADING') });
    const TM = env.SH.TaskManager;
    show(env, '');
    show(env, 'poniżej\nTeraz oceniasz produkt, który można odsprzedać jako używany');
    show(env, 'Przypisz nowy');
    scanTote(env, 'tsA1');
    show(env, 'Przypisz nowy');
    const first = TM.active();
    TM.create('B', env.clock.now());
    show(env, 'Zeskanuj CRITS-PRG2');
    eq(TM.totals(first), { done: 2, sold: 2, neutral: 0 });
    eq(TM.totals(TM.active()).done, 0);
});

test('drugi kod dla rozliczonego przedmiotu niczego nie przestawia', () => {
    // Ponowne skanowanie tego samego przedmiotu: liczniki już policzyły
    // sprzedaż, więc kierunek zostaje — inaczej dziennik mówiłby co innego.
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const S = env.SH.store;
    show(env, '');
    show(env, 'poniżej');
    show(env, 'Zeskanuj CRITS-PRG2\nPrzypisz nowy');
    scanTote(env, 'tsA1');
    show(env, 'Zeskanuj CRITS-PRG2\nPrzypisz nowy');
    eq([S.tabCounters.CRET, S.tabSold.CRET], [1, 1]);
    show(env, 'Zeskanuj CRITS-PRG2\nPrzypisz nowy\nZeskanuj Liquidation');
    eq(env.SH.Routing.state.direction, 'sell', 'kierunek bez zmian');
    eq([S.tabCounters.CRET, S.tabSold.CRET, S.tabNeutral.CRET || 0], [1, 1, 0]);
});

describe('Ręczne +1 na dwóch kartach jednego działu');

test('ręczna paczka liczy się od magazynu, a nie od pamięci karty', () => {
    // Ścieżka: karta A zalicza trzy przedmioty, zdarzenia storage do B
    // jeszcze nie doszły, B dostaje +1 ze skrótu. syncShift nadpisuje
    // wspólny klucz sumą zadań — liczoną z pamięci dałby 1 zamiast 4.
    const clock = makeClock(STAND_TIME);
    const net = makeTabNetwork();
    const A = net.open({ href: URL_OF('WAREHOUSE_DEALS'), clock });
    const B = net.open({ href: URL_OF('WAREHOUSE_DEALS'), clock });
    net.flush();
    for (let k = 0; k < 3; k++) {
        show(A, 'poniżej');
        show(A, 'Przypisz nowy');
        scanTote(A, 'tsA' + k);
        show(A, '');
    }
    B.SH.InputManager.modifyCounter(1, { manual: true });
    net.flush();
    eq(A.SH.store.tabCounters.WHD, 4, 'karta A');
    eq(B.SH.store.tabCounters.WHD, 4, 'karta B');
    B.SH.InputManager.modifyCounter(-1, { manual: true });
    net.flush();
    eq([A.SH.store.tabCounters.WHD, B.SH.store.tabCounters.WHD], [3, 3], 'odjęcie też od magazynu');
});

describe('Magazyn po chwilowej odmowie zapisu');

test('jedna odmowa nie odcina klucza od magazynu do końca zmiany', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const P = env.SH.Persistence;
    const ls = env.sandbox.window.localStorage;
    const key = P.getKey('probe');
    const setItem = ls.setItem;
    ls.setItem = () => { throw new Error('QuotaExceededError'); };
    eq(P.write(key, '5'), false, 'zapis odrzucony');
    ls.setItem = setItem;
    eq(P.freshCount(key, 7), 7, 'po odmowie prawdą jest pamięć');
    eq(P.write(key, '6'), true, 'magazyn znów działa');
    ls.setItem(key, '9');
    eq(P.freshCount(key, 7), 9, 'po udanym zapisie liczy się znowu od magazynu');
    ok(P.writeFailed, 'powiadomienie o odmowie zostaje');
});

test('zamknięcie karty w oknie ciszy zapisuje odłożoną zmianę', () => {
    // Ścieżka: stan sąsiada wczytany -> 2,5 s ciszy -> zmiana ustawień ->
    // autozapis przesuwa się za ciszę -> pagehide. Zapis przesunięty za ciszę
    // ma się wykonać przy wyjściu, a po rozbiórce — nie wykonać wcale.
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const P = env.SH.Persistence;
    const ls = env.sandbox.window.localStorage;
    const S = env.SH.store;
    P.suppressSaveUntil = env.clock.now() + 2500;
    S.userConfig.settingsPanelWidth = 432;
    P.scheduleSave.flush();
    ok(P._quietTimer, 'zapis czeka za oknem ciszy');
    env.sandbox.window._emit('pagehide', {});
    ok(ls.getItem(P.getKey(env.SH.CONFIG.STORAGE_KEY_USER_CONFIG)).includes('"settingsPanelWidth":432'), 'zapisane przy wyjściu');
    eq(P._quietTimer, null);
    P.suppressSaveUntil = env.clock.now() + 2500;
    S.userConfig.settingsPanelWidth = 433;
    P.scheduleSave.flush();
    env.SH.Main.teardown();
    eq(P._quietTimer, null, 'rozbiórka gasi zapis odłożony za ciszę');
});

describe('Sumy dziennika przy włączonej linii 6');

test('sumy przeliczają się po zmianie dziennika albo kursów, nie przy każdym takcie', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const V = env.SH.ValueLog;
    const Fx = env.SH.FxRates;
    const toEur = Fx.toEur.bind(Fx);
    let calls = 0;
    Fx.toEur = (...a) => { calls++; return toEur(...a); };
    V.entries = [1000, 999, 0].map((price, i) => ({ id: 'e' + i, ts: i, asin: 'X', price, currency: 'EUR', sign: 1, dept: 'CRET' }));
    eq(V.totals().sold, 1999);
    V.totals();
    V.totals();
    eq(calls, 3, 'trzy wpisy, jedno przeliczenie');
    V.entries.push({ id: 'e3', ts: 3, asin: 'Y', price: 1, currency: 'EUR', sign: -1, dept: 'CRET' });
    V.save();
    eq(V.totals().unsold, 1, 'po zapisie dziennika');
    eq(calls, 7);
    Fx.rates = { ...Fx.rates };
    V.totals();
    eq(calls, 11, 'po zmianie kursów');
});

describe('Most GRAVIS i źródła z zewnątrz');

test('znaczek w karcie GRAVIS jest jeden, nawet po ponownym wklejeniu', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const G = env.SH.GravisBridge;
    G.badge('a', '#000000');
    G.badge('b', '#000000');
    const id = env.SH.CONFIG.SCRIPT_ID_PREFIX + 'gravisBadge';
    const badges = env.sandbox.document.body.children.filter(el => el.id === id);
    eq(badges.map(el => el.textContent), ['b']);
});

test('keepa-api podpisuje cenę walutą domeny, a nieznanej domeny nie zgaduje', async () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const SH = env.SH;
    const src = SH.PriceSources.list().find(s => s.name === 'keepa-api');
    SH.CONFIG.PRICE_KEEPA_API_KEY = 'k';
    SH.PriceNet.request = async () => ({ ok: true, json: async () => ({ products: [{ stats: { current: [299139] } }] }) });
    SH.CONFIG.PRICE_KEEPA_API_DOMAIN = 2;
    const uk = await src.run('B000000000');
    eq([uk.current.value, uk.current.currency], [2991.39, 'GBP'], 'cena powyżej tysiąca w funtach');
    SH.CONFIG.PRICE_KEEPA_API_DOMAIN = 3;
    eq((await src.run('B000000000')).current.currency, 'EUR');
    SH.CONFIG.PRICE_KEEPA_API_DOMAIN = 7;
    let err = null;
    try { await src.run('B000000000'); } catch (e) { err = e; }
    ok(err && /domena/.test(err.message), 'domena spoza listy: ' + (err && err.message));
});

test('kod ustawień nie ustawi odstępu skanu spoza zakresu suwaka', () => {
    for (const [v, want] of [[0, 50], [49, 50], [50, 50], [200, 200], [201, 200], [5000, 200]]) {
        const env = bootOnStand({ href: URL_OF('CRETURN') });
        env.SH.store.userConfig.triggerMutationDebounceMs = v;
        const res = env.SH.ConfigCode.decode(env.SH.configCode());
        // Wartość domyślna (50) nie daje rekordu — kod jest łatką.
        const rec = res.patch.user['triggerMutationDebounceMs'];
        const got = rec === undefined ? 50 : rec;
        eq(got, want, `${v} ms`);
    }
});

test('kursy z odwróconą walutą albo ze znacznikiem z przyszłości są odrzucane', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const Fx = env.SH.FxRates;
    ok(Fx.normalize({ USD: 1.1, PLN: 4.3 }), 'zdrowe kursy przechodzą');
    eq(Fx.normalize({ USD: 1.1, PLN: 0.0045 }), null, 'PLN o trzy rzędy za mały');
    eq(Fx.normalize({ USD: 1.1, GBP: 3 }), null, 'GBP ponad trzy razy drożej');
    ok(Fx.normalize({ USD: 1.1, JPY: 160 }), 'waluta spoza listy zapasowej bez granicy');
    const ls = env.sandbox.window.localStorage;
    ls.setItem(Fx.key(), JSON.stringify({ rates: { USD: 1.1 }, ts: env.clock.now() + 86400000, source: 'x' }));
    eq(Fx.loadCached(), false, 'znacznik z przyszłości');
    ls.setItem(Fx.key(), JSON.stringify({ rates: { USD: 1.1 }, ts: env.clock.now() - 1000, source: 'x' }));
    eq(Fx.loadCached(), true, 'świeże kursy');
});

describe('Panel ustawień przy szybkim przełączaniu');

test('zamknięcie i otwarcie w ciągu 200 ms zostawia panel widoczny', () => {
    const env = bootOnStand({ href: URL_OF('CRETURN') });
    const P = env.SH.SettingsPanel;
    if (!env.SH.store.uiFlags.isSettingsPanelVisible) P.toggle();
    P.toggle();
    P.toggle();
    return new Promise(resolve => setTimeout(resolve, 260)).then(() => {
        ok(env.SH.store.uiFlags.isSettingsPanelVisible, 'flaga: otwarty');
        eq(P.el.style.display, 'block', 'panel widoczny');
        env.SH.Main.teardown();
    });
});
