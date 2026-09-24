/**
 * 21-route-codes.test.js — rodziny kodów sortowania i trzeci kierunek.
 *
 * TRZY RZECZY, KTÓRYCH TU PILNUJEMY:
 *
 *   1. PRZEDROSTEK `NS-` OPISUJE GABARYT, A NIE KIERUNEK. `NS-Stow-Unsellable`
 *      jedzie tam samo, co `Stow-Unsellable`. Gdyby któryś wariant wypadł
 *      z listy, przedmiot przestałby być rozpoznawany po cichu — licznik
 *      chodziłby dalej, tylko procent stałby w miejscu.
 *   2. OGON KODU JEST DOWOLNY. Na ekranie bywa `External-Repair` albo
 *      `Audit-cokolwiek`, a na liście stoi sam `External` i `AUDIT`. To nie
 *      jest niedbałość, tylko ta sama zasada, na której działa
 *      `FBATransfer-...`: wzorzec zaczepia się o początek kodu.
 *   3. AUDYT WYPADA Z MIANOWNIKA PROCENTU. Decyzja audytora zapada godziny
 *      później i nie na tym ekranie, więc taki przedmiot nie jest ani
 *      sprzedażą, ani niesprzedażą. Skutek: zrobionych paczek bywa WIĘCEJ niż
 *      paczek, z których liczy się procent — i to jest poprawne.
 *
 * Różnica między audytem a „kodu nie było wcale” jest celowa i też jest tu
 * sprawdzana: brak kodu ZOSTAJE w mianowniku, bo to zwykle przedmiot, który
 * gdzieś pojechał, tylko skrypt tego nie zobaczył. Wyrzucanie go podnosiłoby
 * procent za każde przeoczenie programu.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const C = SH.CONFIG;
const R = SH.Routing;

/** Jeden pełny przedmiot: początek, kod sortowania, wyzwalacz końcowy. */
function item(code) {
    const body = env.sandbox.document.body;
    const set = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        SH.AutoTrigger.scan();
    };
    set('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
    set(code ? `Zeskanuj ${code}\nPrzypisz nowy` : 'Przypisz nowy');
    set('');
}

/** Zeruje liczniki bieżącej karty przed pomiarem. */
function resetCounters() {
    const cid = SH.store.currentTabInstanceId;
    SH.store.tabCounters[cid] = 0;
    SH.store.tabSold[cid] = 0;
    SH.store.tabNeutral[cid] = 0;
    // Zera także w magazynie: licznik rośnie od wartości zapisanej, a nie od
    // tej w pamięci (Persistence.freshCount).
    SH.Persistence.saveCounter(cid, 0);
    SH.Persistence.saveSold(cid, 0);
    SH.Persistence.saveNeutral(cid, 0);
    return cid;
}

describe('Rejestr kodów jest spójny');

test('żaden kod nie stoi w dwóch rodzinach naraz', () => {
    // Kod w dwóch listach dałby kierunek zależny od kolejności sprawdzeń
    // w kindOf() — czyli od szczegółu implementacji, a nie od tego, co na ekranie.
    const all = R.codes();
    const seen = new Set();
    const twice = all.filter(c => (seen.has(c) ? true : (seen.add(c), false)));
    eq(twice, [], 'kody powtórzone');
});

test('każdy wariant z NS- ma ten sam kierunek, co wersja bez przedrostka', () => {
    // To jest cała treść przedrostka: nie-sort jedzie tam samo, co sort.
    const missing = [];
    const wrong = [];
    for (const code of R.codes()) {
        if (!code.startsWith('NS-')) continue;
        const base = code.slice(3);
        // Wyjątek udokumentowany w konfiguracji: dla kodów magazynowych
        // (CRITS-*) odpowiednikiem nie-sortu jest jeden wspólny NS-PL-Sellable,
        // a `PL-Sellable` bez przedrostka i tak stoi na liście sprzedażowej.
        if (!R.codes().includes(base)) { missing.push(code); continue; }
        if (R.kindOf(base) !== R.kindOf(code)) wrong.push(code);
    }
    eq(missing, [], 'wariant NS- bez swojej wersji podstawowej');
    eq(wrong, [], 'wariant NS- o innym kierunku niż wersja podstawowa');
});

test('kody magazynowe celowo NIE mają wariantów NS-', () => {
    // Zastępuje je jeden NS-PL-Sellable. Gdyby ktoś dopisał NS-CRITS-*, to
    // sprawdzenie ma zapalić się i kazać zaktualizować komentarz w konfiguracji,
    // a nie przejść po cichu.
    const crits = C.ROUTE_SELL_CODES.filter(c => c.startsWith('CRITS-'));
    eq(crits.length, 4, 'cztery magazyny');
    notOk(R.codes().some(c => c.startsWith('NS-CRITS-')), 'NS-CRITS- na liście');
    ok(C.ROUTE_SELL_CODES.includes('NS-PL-Sellable'), 'wspólny kod nie-sortu');
    ok(C.ROUTE_SELL_CODES.includes('PL-Sellable'), 'rzadki wariant bez przedrostka');
});

test('kindOf rozstawia kody po czterech rodzinach', () => {
    eq(R.kindOf('CRITS-POZ1'), 'sell');
    eq(R.kindOf('NS-PL-Sellable'), 'sell');
    eq(R.kindOf('WHD'), 'unsell');
    eq(R.kindOf('NS-External'), 'unsell');
    eq(R.kindOf('AUDIT'), 'neutral');
    eq(R.kindOf('NS-AUDIT'), 'neutral');
    eq(R.kindOf('Secondary-Sorting'), 'ambiguous');
    eq(R.kindOf('NS-Secondary-Sorting'), 'ambiguous');
    eq(R.kindOf('CzegoTakiegoNieMa'), null, 'kod spoza rejestru');
});

describe('Rozpoznawanie kodu w tekście strony');

/** Kod rozpoznany w linii ekranu — albo undefined, gdy nic nie trafiło. */
function detect(text) {
    return [...R.countAll(text).keys()][0];
}

test('ogon kodu jest dowolny', () => {
    // Powód: na ekranie są całe rodziny kodów, a na liście stoi sam początek.
    eq(detect('Zeskanuj External-Repair'), 'External');
    eq(detect('Zeskanuj External'), 'External');
    eq(detect('Zeskanuj Audit-Quality-Check'), 'AUDIT');
    eq(detect('Zeskanuj AUDIT'), 'AUDIT');
    eq(detect('Zeskanuj Stow-Unsellable-XYZ'), 'Stow-Unsellable');
});

test('wielkość liter nie ma znaczenia', () => {
    // Na ekranie ten sam kod bywa zapisany różnie (AUDIT, Audit-, audit).
    eq(detect('zeskanuj audit'), 'AUDIT');
    eq(detect('ZESKANUJ NS-WHD'), 'NS-WHD');
    eq(detect('Zeskanuj nS-pL-sELLABLE'), 'NS-PL-Sellable', 'sprowadzenie do zapisu z listy');
});

test('wariant z NS- nie gubi przedrostka', () => {
    // Najgroźniejsza pomyłka w tej grupie: `NS-PL-Sellable` rozpoznany jako
    // `PL-Sellable`. Kierunek wyszedłby ten sam, ale w dzienniku i w logu
    // stanąłby nie ten kod, co na ekranie — czyli ślad prowadziłby w złe miejsce.
    eq(detect('Zeskanuj NS-PL-Sellable'), 'NS-PL-Sellable');
    eq(detect('Zeskanuj NS-Stow-Unsellable'), 'NS-Stow-Unsellable');
    eq(detect('Zeskanuj NS-Secondary-Sorting'), 'NS-Secondary-Sorting');
    eq(detect('Zeskanuj NS-AUDIT'), 'NS-AUDIT');
});

test('myślnik po „Zeskanuj” bywa i go nie bywa', () => {
    eq(detect('Zeskanuj - NS-External'), 'NS-External');
    eq(detect('Zeskanuj—NS-Liquidation'), 'NS-Liquidation');
});

test('kod bez słowa „Zeskanuj” nie liczy się wcale', () => {
    // Inaczej samo słowo WHD w opisie przedmiotu ustawiałoby kierunek.
    eq(R.countAll('Przedmiot z działu WHD, audit w przyszłym tygodniu').size, 0);
});

describe('Audyt wypada z mianownika procentu');

test('sprzedaż, niesprzedaż i audyt: trzy paczki, mianownik dwa', () => {
    const cid = resetCounters();
    SH.AutoTrigger.scan();          // pierwszy skan tylko fotografuje stronę

    item('CRITS-PRG2');             // sprzedaż
    item('WHD');                    // niesprzedaż
    item('Audit-Damage');           // nierozstrzygalny

    eq(SH.store.tabCounters[cid], 3, 'zrobione paczki');
    eq(SH.store.tabSold[cid], 1, 'sprzedane');
    eq(SH.store.tabNeutral[cid], 1, 'poza mianownikiem');
    // 1 z 2, a nie 1 z 3 — o to w całej zmianie chodzi.
    eq(SH.Utils.percentFloor(SH.store.tabSold[cid],
                             SH.store.tabCounters[cid] - SH.store.tabNeutral[cid]), 50);
});

test('przedmiot bez kodu ZOSTAJE w mianowniku', () => {
    // Różnica wobec audytu jest celowa: brak kodu znaczy „nie zobaczyliśmy”,
    // a nie „nie da się wiedzieć”. Wyrzucanie takich przedmiotów podnosiłoby
    // procent za każde przeoczenie programu.
    const cid = resetCounters();
    item('CRITS-PRG2');
    item(null);
    eq(SH.store.tabCounters[cid], 2);
    eq(SH.store.tabNeutral[cid], 0, 'brak kodu to nie audyt');
    eq(SH.Utils.percentFloor(SH.store.tabSold[cid],
                             SH.store.tabCounters[cid] - SH.store.tabNeutral[cid]), 50);
});

test('same audyty: mianownik zero, procent zero, bez wyjątku', () => {
    // Wartość graniczna: dzielenie przez zero w linii, która rysuje się co sekundę.
    const cid = resetCounters();
    item('AUDIT');
    item('NS-AUDIT');
    eq(SH.store.tabCounters[cid], 2);
    eq(SH.store.tabNeutral[cid], 2);
    eq(SH.Utils.percentFloor(SH.store.tabSold[cid],
                             SH.store.tabCounters[cid] - SH.store.tabNeutral[cid]), 0);
});

test('audyt nie podnosi licznika sprzedanych', () => {
    const cid = resetCounters();
    item('AUDIT');
    eq(SH.store.tabSold[cid], 0);
});

test('ten sam audyt nie policzy się dwa razy', () => {
    // applyTo() woła się po każdym z dwóch niezależnych zdarzeń — zaliczeniu
    // przez licznik i ustaleniu kierunku. Bez znacznika `counted` przedmiot
    // trafiłby do licznika dwukrotnie i zjadł dwa miejsca w mianowniku.
    const cid = resetCounters();
    item('AUDIT');
    const before = SH.store.tabNeutral[cid];
    R.apply();
    R.apply();
    eq(SH.store.tabNeutral[cid], before);
});

test('licznik audytów trafia do magazynu, więc przeżywa F5', () => {
    const cid = SH.store.currentTabInstanceId;
    const key = SH.Persistence.getKey(C.STORAGE_PREFIX_TAB_NEUTRAL + cid);
    eq(env.sandbox.localStorage.getItem(key), String(SH.store.tabNeutral[cid]));
});

test('linia 7 pokazuje procent z pomniejszonego mianownika', () => {
    // Sprawdzenie na gotowym tekście, a nie na samej funkcji: mianownik składa
    // się w pętli po kartach i to właśnie tam najłatwiej pomylić liczby.
    const cid = resetCounters();
    SH.store.userConfig.globalStatsContributionKnown[cid] = true;
    item('CRITS-PRG2');
    item('AUDIT');
    SH.StatsWindowRenderer.renderContent();
    const text = SH.StatsWindowRenderer.lines.line7_compact.textContent;
    ok(/\b2\b/.test(text), 'liczba sztuk to nadal 2, razem z audytem: ' + text);
    ok(text.trim().endsWith('100%'), 'procent liczy się z jednej paczki: ' + text);
});

test('reset zmiany kasuje licznik audytów razem z pozostałymi', () => {
    // Procent opisuje JEDNĄ zmianę. Zostawienie licznika przez granicę zmiany
    // dałoby mianownik z cudzego dnia.
    const cid = SH.store.currentTabInstanceId;
    item('AUDIT');
    ok(SH.store.tabNeutral[cid] > 0, 'warunek wstępny');
    SH.SessionReset.resetItemData('test', 'manual');
    eq(SH.store.tabNeutral[cid], 0, 'w pamięci');
    const key = SH.Persistence.getKey(C.STORAGE_PREFIX_TAB_NEUTRAL + cid);
    eq(env.sandbox.localStorage.getItem(key), null, 'w magazynie');
});

describe('Secondary-Sorting z przedrostkiem NS-');

test('NS-Secondary-Sorting czeka na uściślenie i przyjmuje je bez przedrostka', () => {
    // Linia uściślająca zostaje BEZ `NS-`, bo `Transfer - Sellable` to status
    // przedmiotu, a status jest ten sam dla sortu i dla nie-sortu.
    const cid = resetCounters();
    const body = env.sandbox.document.body;
    const set = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        SH.AutoTrigger.scan();
    };
    set('poniżej — nowy przedmiot');
    set('Zeskanuj NS-Secondary-Sorting\nPrzypisz nowy');
    eq(R.info()['czeka na uściślenie'], true, 'sam kod niczego nie rozstrzyga');
    set('Zeskanuj NS-Secondary-Sorting\nPrzedmiot wysłano do Transfer - Sellable');
    set('');
    eq(SH.store.tabSold[cid], 1, 'uściślenie sprzedażowe weszło');
    eq(SH.store.tabNeutral[cid], 0, 'to nie jest audyt');
});

test('NS-Secondary-Sorting bez uściślenia to niesprzedaż', () => {
    // Zasada jest niesymetryczna celowo: potwierdzenie sprzedaży przychodzi
    // zawsze, niesprzedaży — nie zawsze.
    const cid = resetCounters();
    const body = env.sandbox.document.body;
    const set = (t) => {
        Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
        SH.AutoTrigger.scan();
    };
    set('poniżej — nowy przedmiot');
    set('Zeskanuj NS-Secondary-Sorting\nPrzypisz nowy');
    set('');
    set('poniżej — następny przedmiot');   // prawdziwa granica przedmiotu
    eq(SH.store.tabSold[cid], 0, 'sprzedaży nie było');
    eq(SH.store.tabNeutral[cid], 0, 'i nie jest to audyt — to niesprzedaż');
});

describe('Cisza po starcie zostaje nienaruszona');

test('rozpoznawanie kierunku nie kosztowało ani zapytania, ani linii w konsoli', () => {
    // Kierunek czyta się z tekstu strony, więc trzeci kierunek nie ma prawa
    // niczego dołożyć po stronie sieci.
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
