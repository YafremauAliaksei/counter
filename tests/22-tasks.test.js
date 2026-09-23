/**
 * 22-tasks.test.js — menedżer zadań: własny zegar i liczniki procesu pracy.
 *
 * PO CO TO POWSTAŁO. Tempo liczyło się od początku zmiany, więc kto wszedł do
 * procesu trzy godziny później i zrobił trzy paczki w sześć minut, widział
 * „1 paczka na godzinę”. Liczba policzona poprawnie, znaczenie fałszywe — a to
 * gorsze niż brak liczby, bo liczbie się wierzy.
 *
 * TRZY WŁASNOŚCI, OD KTÓRYCH ZALEŻY, CZY TO SIĘ NADAJE DO UŻYCIA:
 *
 *   1. SUMA ZADAŃ ZAWSZE RÓWNA SIĘ LICZNIKOWI KARTY. Liczniki zmiany zostają
 *      jedynym źródłem prawdy dla linii 1, 2 i 7, a zadania są ich rozbiciem
 *      w czasie. Rozjazd tych dwóch stron byłby cichy: obie liczby wyglądałyby
 *      sensownie, tylko nie opisywałyby tego samego.
 *   2. RĘCZNIE WPISANE PACZKI NIE WCHODZĄ DO MIANOWNIKA PROCENTU. Po awarii
 *      maszyny człowiek pamięta tempo albo liczbę paczek, ale nie pamięta, ile
 *      z nich poszło na sprzedaż. Gdyby wchodziły, procent po każdej awarii
 *      spadałby do kilku procent i przestałby cokolwiek znaczyć.
 *   3. WZNOWIENIE TO TO SAMO ZADANIE, a nie drugie o tej samej nazwie. Inaczej
 *      zmiana rozpada się na wpisy 30 / 100 / 30, z których nie widać, że tempo
 *      trzymało się stabilnie.
 *
 * Czas podaje się wszędzie wprost (znaczniki w milisekundach), bo test, który
 * czeka na zegar, prędzej czy później zapala się sam z siebie.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot, bootOnStand, makeEnv } = require('./dom-stub');

const { makeStorage } = makeEnv();

const env = bootOnStand();
const clock = env.clock;
const SH = env.SH;
const TM = SH.TaskManager;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

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

/** Czysty stan: jedno zadanie domyślne i zera we wszystkich licznikach. */
function reset(startMs) {
    const cid = SH.store.currentTabInstanceId;
    SH.store.tasks = [];
    SH.store.activeTaskId = null;
    SH.store.taskCounters = {};
    SH.store.tabCounters[cid] = 0;
    SH.store.tabSold[cid] = 0;
    SH.store.tabNeutral[cid] = 0;
    TM.create('Default', startMs == null ? clock.now() - HOUR : startMs);
    return cid;
}

/** Różnica sumy zadań i licznika karty — zero znaczy, że równość trzyma. */
function drift(cid) {
    const S = SH.store;
    return {
        done: TM.shiftTotal(cid, 'done') - (S.tabCounters[cid] || 0),
        sold: TM.shiftTotal(cid, 'sold') - (S.tabSold[cid] || 0),
        neutral: TM.shiftTotal(cid, 'neutral') - (S.tabNeutral[cid] || 0),
    };
}

describe('Zadanie domyślne');

test('po starcie jest dokładnie jedno zadanie i zaczyna się razem ze zmianą', () => {
    // Dopóki człowiek nie powie inaczej, cała zmiana jest jednym procesem —
    // czyli zachowanie sprzed 1.3.0 zostaje nietknięte.
    eq(SH.store.tasks.length, 1, 'jedno zadanie');
    const task = TM.active();
    eq(task.name, SH.CONFIG.DEFAULT_TASK_NAME);
    eq(task.segments.length, 1, 'jeden odcinek');
    eq(task.segments[0].from, SH.store.sessionConfig.shiftCalculatedStartTime,
       'początek zadania to początek zmiany');
    eq(task.segments[0].to, null, 'odcinek otwarty, zegar chodzi');
    ok(TM.isRunning(task));
});

describe('Suma zadań zawsze równa się licznikowi karty');

test('przedmioty zaliczone automatycznie', () => {
    const cid = reset();
    SH.AutoTrigger.scan();               // pierwszy skan tylko fotografuje stronę
    item('CRITS-PRG2');                  // sprzedaż
    item('WHD');                         // niesprzedaż
    item('AUDIT');                       // poza mianownikiem
    item(null);                          // kod się nie pojawił

    eq(SH.store.tabCounters[cid], 4, 'licznik karty');
    eq(TM.counters(TM.active().id, cid), { done: 4, sold: 1, neutral: 1 }, 'liczniki zadania');
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 }, 'rozjazd');
});

test('ręczna poprawka skrótem klawiszowym', () => {
    const cid = reset();
    SH.InputManager.modifyCounter(1, { manual: true });
    SH.InputManager.modifyCounter(1, { manual: true });
    eq(TM.counters(TM.active().id, cid), { done: 2, sold: 0, neutral: 2 },
       'ręczna paczka idzie też do „poza mianownikiem”');
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
});

test('ręczne odjęcie schodzi do zera i nie niżej', () => {
    // Wartość graniczna: minus przy pustym liczniku. Bez przycięcia suma zadań
    // zeszłaby poniżej zera i rozjechała się z licznikiem karty na stałe.
    const cid = reset();
    SH.InputManager.modifyCounter(-1, { manual: true });
    eq(SH.store.tabCounters[cid], 0);
    eq(TM.counters(TM.active().id, cid), { done: 0, sold: 0, neutral: 0 });
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
});

describe('Powrót do pracy po awarii maszyny');

test('wpisanie „zrobiłem dziś 180” podnosi tempo i nie rusza procentu', () => {
    // Komputer stoi na sesji tymczasowej: po awaryjnym restarcie pamięć
    // przeglądarki jest pusta, a człowiek pamięta tylko swoją liczbę paczek.
    const cid = reset(clock.now() - 3 * HOUR);
    TM.applyManualTotal(cid, 180);
    SH.store.tabCounters[cid] = 180;
    SH.store.tabNeutral[cid] = TM.shiftTotal(cid, 'neutral');

    const task = TM.active();
    eq(TM.totals(task).done, 180, 'paczki zadania');
    eq(TM.totals(task).neutral, 180, 'wszystkie poza mianownikiem — kierunku nikt nie zna');
    eq(TM.percent(task), 0, 'procent nie udaje, że coś wie');
    ok(Math.abs(TM.rate(task) - 60) < 1, 'tempo: 180 paczek przez 3 godziny, jest ' + TM.rate(task));
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
});

test('procent liczy się od przedmiotu, przy którym człowiek wrócił do pracy', () => {
    // To jest sedno poprzedniego sprawdzenia widziane od strony człowieka:
    // po wpisaniu 180 paczek kolejne przedmioty budują procent od nowa.
    const cid = reset(clock.now() - 3 * HOUR);
    TM.applyManualTotal(cid, 180);
    SH.store.tabCounters[cid] = 180;
    SH.store.tabNeutral[cid] = TM.shiftTotal(cid, 'neutral');

    SH.AutoTrigger.scan();
    item('CRITS-PRG2');
    item('WHD');
    const task = TM.active();
    eq(TM.totals(task).done, 182);
    eq(TM.percent(task), 50, 'jedna sprzedaż z dwóch policzonych, a nie z 182');
});

test('wpisanie liczby MNIEJSZEJ niż suma zadań zdejmuje od najnowszego wstecz', () => {
    const cid = reset(clock.now() - 2 * HOUR);
    TM.applyManualTotal(cid, 50);                 // zadanie pierwsze: 50
    const first = TM.active().id;
    TM.create('drugie', clock.now() - HOUR);
    TM.applyManualTotal(cid, 80);                 // zadanie drugie: +30
    eq(TM.counters(first, cid).done, 50);
    eq(TM.counters(TM.active().id, cid).done, 30);

    TM.applyManualTotal(cid, 40);                 // zdejmujemy 40
    eq(TM.counters(TM.active().id, cid).done, 0, 'najnowsze zadanie oddaje wszystko');
    eq(TM.counters(first, cid).done, 40, 'reszta schodzi z poprzedniego');
    eq(TM.shiftTotal(cid, 'done'), 40);
});

test('wpisanie zera i wartości ujemnej', () => {
    const cid = reset();
    TM.applyManualTotal(cid, 25);
    TM.applyManualTotal(cid, 0);
    eq(TM.shiftTotal(cid, 'done'), 0);
    TM.applyManualTotal(cid, -5);
    eq(TM.shiftTotal(cid, 'done'), 0, 'ujemna liczba to zero, a nie długi');
});

describe('Przełączanie i wznawianie');

test('przejście do nowego zadania zamyka poprzednie na tej samej chwili', () => {
    // Bez tego czas liczyłby się dwa razy: koniec jednego odcinka i początek
    // drugiego muszą być tym samym punktem.
    reset(clock.now() - 2 * HOUR);
    const first = TM.active();
    const switchAt = clock.now() - 30 * MIN;
    TM.create('fast_process', switchAt);

    eq(first.segments[0].to, switchAt, 'poprzednie zamknięte');
    eq(TM.active().segments[0].from, switchAt, 'nowe otwarte w tej samej chwili');
    notOk(TM.active().id === first.id, 'to inne zadanie');
});

test('wznowienie to TEN SAM identyfikator i nowy odcinek', () => {
    // Inaczej zmiana rozpada się na trzy wpisy 30 / 100 / 30 i nie widać,
    // że tempo trzymało się stabilnie.
    const cid = reset(clock.now() - 5 * HOUR);
    const normal = TM.active();
    TM.applyManualTotal(cid, 90);

    TM.create('fast', clock.now() - 2 * HOUR);
    const resumed = TM.resume(normal.id, clock.now() - MIN);

    eq(resumed.id, normal.id, 'ten sam identyfikator');
    eq(SH.store.tasks.length, 2, 'dwa zadania, nie trzy');
    eq(resumed.segments.length, 2, 'drugi odcinek');
    eq(TM.counters(normal.id, cid).done, 90, 'liczniki zadania przeżyły wycieczkę');
});

test('czas zadania to suma odcinków, a nie odstęp od pierwszego do ostatniego', () => {
    const now = clock.now();
    reset(now - 5 * HOUR);
    const normal = TM.active();
    TM.create('fast', now - 4 * HOUR);            // pierwszy odcinek: godzina
    TM.resume(normal.id, now - HOUR);             // drugi odcinek: godzina
    const worked = TM.workedMs(normal, now);
    ok(Math.abs(worked - 2 * HOUR) < MIN, 'oczekiwano dwóch godzin, jest ' + Math.round(worked / MIN) + ' min');
});

test('początek nie ucieka w przyszłość ani przed poprzedni odcinek', () => {
    // Bez drugiego ograniczenia przestawienie startu „wstecz” tuż po
    // przełączeniu dałoby poprzedniemu zadaniu odcinek ujemnej długości.
    const now = clock.now();
    reset(now - HOUR);
    const first = TM.active();
    TM.create('przyszłość', now + 10 * HOUR);
    ok(TM.active().segments[0].from <= clock.now(), 'przyszłość przycięta do teraz');

    TM.resume(first.id, now - 10 * HOUR);
    const seg = first.segments[first.segments.length - 1];
    ok(seg.from >= now - HOUR, 'nie wcześniej niż poprzedni odcinek: ' + new Date(seg.from).toISOString());
});

test('pauza zatrzymuje zegar, a paczka po pauzie otwiera nowy odcinek', () => {
    // Czas, którego nie było, nie wraca: nowy odcinek zaczyna się od paczki,
    // a nie wstecz od chwili pauzy.
    const cid = reset(clock.now() - HOUR);
    TM.pause();
    const task = TM.active();
    notOk(TM.isRunning(task), 'zegar stoi');
    const stopped = TM.workedMs(task);

    SH.InputManager.modifyCounter(1, { manual: true });
    ok(TM.isRunning(task), 'paczka przerwała pauzę');
    eq(task.segments.length, 2);
    ok(TM.workedMs(task) - stopped < MIN, 'nowy odcinek nie dokleił czasu wstecz');
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
});

describe('Początek zadania — poprawka z 1.3.2');

/**
 * BŁĄD, KTÓRY WYSZEDŁ DOPIERO NA HALI.
 *
 * Kontrolka „Początek” przestawiała początek OSTATNIEGO odcinka, a czas zadania
 * jest sumą WSZYSTKICH. Wystarczyło raz zatrzymać zegar i kliknąć „początek
 * zmiany”, żeby ostatni odcinek rozciągnął się na całą zmianę OBOK odcinków
 * wcześniejszych — każde powtórzenie dokładało kolejne godziny. Po niespełna
 * pięciu godzinach pracy dało się naklikać czternaście.
 *
 * Sprawdzenie niżej odtwarza dokładnie tamtą sekwencję klikania. Zaraz po nim
 * stoi NIEZMIENNIK, który by ten błąd złapał od razu: przepracowany czas nie ma
 * prawa przekroczyć odstępu od początku zadania do teraz.
 */
test('klikanie „początek zmiany” przy zatrzymanym zegarze nie dokłada godzin', () => {
    const now = clock.now();
    const shiftStart = now - 3 * HOUR;
    SH.store.sessionConfig.shiftCalculatedStartTime = shiftStart;
    reset(shiftStart);
    const task = TM.active();

    for (let i = 0; i < 3; i++) {
        TM.pause();
        TM.setStart(task.id, shiftStart);
        TM.resume(task.id, clock.now());
        TM.setStart(task.id, shiftStart);
    }

    const worked = TM.workedMs(task);
    ok(worked <= clock.now() - TM.span(task).from + 1000,
       'czas zadania: ' + (worked / HOUR).toFixed(2) + 'h, a od początku minęły '
       + ((clock.now() - TM.span(task).from) / HOUR).toFixed(2) + 'h');
    ok(Math.abs(worked - 3 * HOUR) < MIN, 'trzy godziny, nie dziewięć');
});

test('przepracowany czas nigdy nie przekracza odstępu od początku zadania', () => {
    // Niezmiennik ogólny, nie jeden scenariusz: cokolwiek zrobimy z zadaniem,
    // suma odcinków mieści się między jego początkiem a teraz.
    const now = clock.now();
    reset(now - 2 * HOUR);
    const task = TM.active();
    TM.pause();
    TM.resume(task.id, clock.now());
    TM.setStart(task.id, now - 90 * MIN);
    TM.pause();
    TM.resume(task.id, clock.now());
    TM.setStart(task.id, now - 30 * MIN);

    ok(TM.workedMs(task) <= clock.now() - TM.span(task).from + 1000,
       'suma odcinków większa niż cały odstęp');
});

test('przesunięcie WSTECZ rozciąga pierwszy odcinek', () => {
    const now = clock.now();
    reset(now - HOUR);
    const task = TM.active();
    TM.setStart(task.id, now - 3 * HOUR);
    eq(task.segments.length, 1, 'nie przybyło odcinków');
    ok(Math.abs(TM.workedMs(task) - 3 * HOUR) < MIN, 'trzy godziny');
});

test('przesunięcie W PRZÓD obcina to, co przed nim, i zostawia przerwy', () => {
    const now = clock.now();
    reset(now - 4 * HOUR);
    const task = TM.active();
    // Przerwa w środku: [-4h .. -3h] praca, [-3h .. -2h] przerwa, [-2h .. teraz] praca.
    task.segments = [{ from: now - 4 * HOUR, to: now - 3 * HOUR }, { from: now - 2 * HOUR, to: null }];

    TM.setStart(task.id, now - 150 * MIN);          // początek w środku przerwy
    eq(task.segments.length, 1, 'odcinek sprzed nowego początku znika');
    ok(Math.abs(TM.workedMs(task) - 2 * HOUR) < MIN, 'zostają dwie godziny pracy');

    TM.setStart(task.id, now - 30 * MIN);           // początek w środku pracy
    ok(Math.abs(TM.workedMs(task) - 30 * MIN) < MIN, 'zostaje pół godziny');
});

test('początek w przyszłości przycina się do teraz', () => {
    const now = clock.now();
    reset(now - HOUR);
    TM.setStart(TM.active().id, now + 5 * HOUR);
    ok(TM.span(TM.active()).from <= clock.now(), 'nie w przyszłości');
    ok(TM.workedMs(TM.active()) < MIN, 'zadanie właśnie się zaczęło');
});

test('wznowienie nie może zacząć się przed własną pauzą', () => {
    // Inaczej dwa odcinki nachodzą na siebie i ten sam czas liczy się dwa razy.
    const now = clock.now();
    reset(now - 2 * HOUR);
    const task = TM.active();
    TM.pause();
    const pausedAt = task.segments[0].to;
    TM.resume(task.id, now - 3 * HOUR);
    eq(task.segments[1].from >= pausedAt, true, 'wznowienie nie cofa się przed pauzę');
    ok(TM.workedMs(task) <= clock.now() - TM.span(task).from + 1000);
});

describe('Nazwa zadania');

test('białe brzegi, pusta nazwa i nazwa za długa', () => {
    reset();
    const id = TM.active().id;
    TM.rename(id, '   fast_process   ');
    eq(TM.byId(id).name, 'fast_process', 'brzegi obcięte');

    TM.rename(id, '   ');
    eq(TM.byId(id).name, 'fast_process', 'pusta nazwa zostawia poprzednią');

    TM.rename(id, 'x'.repeat(200));
    eq(TM.byId(id).name.length, SH.CONFIG.TASK_MAX_NAME_LEN, 'przycięta do granicy');
});

describe('Tempo i przeliczanie tempa na paczki');

test('tempo poniżej granicy z konfiguracji nie istnieje', () => {
    // Wartość graniczna: dzielenie przez czas bliski zeru dałoby tysiące paczek
    // na godzinę w pierwszej sekundzie zadania. Granica jest wspólna z linią 1,
    // żeby obie nie mówiły czego innego o tej samej pierwszej minucie.
    const now = clock.now();
    reset(now);
    eq(TM.rate(TM.active(), now), 0);
    eq(TM.doneForRate(TM.active(), 30, now), null, 'nie ma z czego liczyć');

    // Tuż nad granicą liczba już istnieje.
    reset(now - SH.CONFIG.RATE_MIN_WORKED_MS - 1000);
    eq(TM.doneForRate(TM.active(), 3600, now), 11, '3600/h przez 11 sekund to 11 paczek');
});

test('wpisane tempo zamienia się na całkowitą liczbę paczek', () => {
    // Przykład z hali: 1 godzina 17 minut pracy, człowiek pamięta „było jakieś
    // 118”. 118 × 77/60 = 151,43 -> 151 paczek, czyli naprawdę 117,7 na godzinę.
    // Panel pokaże właśnie 117,7, bo tyle da się osiągnąć przy całych paczkach.
    const now = clock.now();
    reset(now - 77 * MIN);
    const task = TM.active();
    const done = TM.doneForRate(task, 118, now);
    eq(done, 151);

    SH.store.taskCounters = { ...SH.store.taskCounters,
        [task.id]: { [SH.store.currentTabInstanceId]: { done, sold: 0, neutral: 0 } } };
    const back = TM.rate(task, now);
    ok(Math.abs(back - 117.7) < 0.1, 'tempo z powrotem: ' + back.toFixed(1));
});

test('tempo zerowe i ujemne', () => {
    const now = clock.now();
    reset(now - HOUR);
    eq(TM.doneForRate(TM.active(), 0, now), 0);
    eq(TM.doneForRate(TM.active(), -5, now), null, 'ujemne tempo nie istnieje');
    eq(TM.doneForRate(TM.active(), NaN, now), null);
});

describe('Obiad znika z czasu zadania');

test('przerwa pokrywająca się z odcinkiem jest odjęta', () => {
    // Kto nie pamiętał o pauzie na obiad, miałby w zadaniu pół godziny pracy,
    // której nie było. Rachunek jest ten sam, co w linii 1 — jedno miejsce.
    //
    // Obiad włącza się tylko na czas tego testu i wyłącza w `finally`: przed
    // tą poprawką sprzątanie stało linijkę za asercją, więc porażka zostawiała
    // obiad włączony i czerwień rozlewała się na kolejne testy pliku.
    const S = SH.store;
    const shiftStart = new clock.Date();
    shiftStart.setHours(6, 30, 0, 0);
    S.sessionConfig.shiftCalculatedStartTime = shiftStart.getTime();
    S.sessionConfig.selectedLunchIndex = 0;      // 11:20-11:50, pół godziny
    try {
        const from = new Date(shiftStart); from.setHours(11, 0, 0, 0);
        const to = new Date(shiftStart); to.setHours(12, 0, 0, 0);
        eq(SH.ShiftManager.lunchOverlapMs(from.getTime(), to.getTime()), 30 * MIN);

        reset(from.getTime());
        TM.pause(to.getTime());
        eq(TM.workedMs(TM.active()), 30 * MIN, 'godzina odcinka minus pół godziny obiadu');
    } finally {
        S.sessionConfig.selectedLunchIndex = null;
    }
});

test('przerwa poza odcinkiem nic nie zabiera', () => {
    const S = SH.store;
    const shiftStart = new clock.Date();
    shiftStart.setHours(6, 30, 0, 0);
    S.sessionConfig.shiftCalculatedStartTime = shiftStart.getTime();
    S.sessionConfig.selectedLunchIndex = 0;
    try {
        const from = new Date(shiftStart); from.setHours(8, 0, 0, 0);
        const to = new Date(shiftStart); to.setHours(9, 0, 0, 0);
        eq(SH.ShiftManager.lunchOverlapMs(from.getTime(), to.getTime()), 0);
    } finally {
        S.sessionConfig.selectedLunchIndex = null;
    }
});

describe('Usuwanie zadania');

test('ostatniego zadania usunąć się nie da', () => {
    reset();
    notOk(TM.remove(TM.active().id), 'bez zadania paczki nie miałyby gdzie się zapisać');
    eq(SH.store.tasks.length, 1);
});

test('usunięte zadanie zabiera swoje paczki z licznika karty', () => {
    const cid = reset(clock.now() - 2 * HOUR);
    TM.applyManualTotal(cid, 40);
    SH.store.tabCounters[cid] = 40;
    SH.store.tabNeutral[cid] = TM.shiftTotal(cid, 'neutral');
    const doomed = TM.create('do usunięcia', clock.now() - HOUR);
    TM.applyManualTotal(cid, 60);
    SH.store.tabCounters[cid] = 60;
    SH.store.tabNeutral[cid] = TM.shiftTotal(cid, 'neutral');

    ok(TM.remove(doomed.id));
    eq(SH.store.tabCounters[cid], 40, 'licznik karty schodzi o paczki usuniętego');
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
    notOk(TM.byId(doomed.id), 'zadania już nie ma');
});

describe('Zapis i odczyt');

test('zadania i ich liczniki przeżywają F5', () => {
    const shared = makeStorage();
    const first = boot({ storage: shared, clock });
    const cid = first.SH.store.currentTabInstanceId;
    first.SH.TaskManager.rename(first.SH.TaskManager.active().id, 'nocny');
    first.SH.TaskManager.create('drugi', clock.now() - 10 * MIN);
    first.SH.TaskManager.applyManualTotal(cid, 7);

    const second = boot({ storage: shared, clock });
    eq(second.SH.store.tasks.length, 2, 'lista wczytana');
    eq(second.SH.store.tasks[0].name, 'nocny', 'nazwa przeżyła');
    eq(second.SH.TaskManager.active().name, 'drugi', 'aktywne to nadal to samo zadanie');
    eq(second.SH.TaskManager.counters(second.SH.TaskManager.active().id, cid).done, 7,
       'liczniki zadania wczytane');
});

test('karta nierozpoznana: liczniki zadań przeżywają F5', () => {
    // Identyfikator karty nierozpoznanej sam ma podkreślenia
    // („unknownTabInstance_abc_def”), a klucz licznika zadania dzielił się po
    // OSTATNIM podkreśleniu. Po F5 paczki trafiały do nieistniejącego zadania,
    // suma zadań spadała do zera, a pierwsza poprawka w panelu zerowała licznik
    // karty — cicha utrata zmiany po zwykłym przeładowaniu.
    const shared = makeStorage();
    const href = 'https://trex-prod-eu.aka.amazon.com/some/other/page';
    const sessionStore = makeStorage();
    const first = boot({ storage: shared, sessionStorage: sessionStore, href, clock });
    const cid = first.SH.store.currentTabInstanceId;
    ok(cid.startsWith(first.SH.CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX), 'karta nierozpoznana: ' + cid);
    first.SH.TaskManager.applyManualTotal(cid, 7);
    const taskId = first.SH.TaskManager.active().id;
    first.SH.Main.teardown();

    const second = boot({ storage: shared, sessionStorage: sessionStore, href, clock });
    eq(second.SH.store.currentTabInstanceId, cid, 'ta sama karta po F5');
    eq(second.SH.TaskManager.counters(taskId, cid).done, 7, 'paczki zadania wczytane pod właściwą kartą');
    eq(second.SH.TaskManager.shiftTotal(cid, 'done'), 7, 'suma zadań karty');
    second.SH.Main.teardown();
});

test('rozbiór klucza licznika zadania dla każdego rodzaju karty', () => {
    // Granice: karty znane (bez podkreśleń), nierozpoznana (z dwoma),
    // identyfikator zadania z podkreśleniami i klucze, które kluczem nie są.
    const SM = SH.StorageManager;
    const P = SH.CONFIG.STORAGE_PREFIX_TASK_COUNTER;
    const U = SH.CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX;
    for (const tabKey of ['CRET', 'REFURB', 'WHD', 'OTHER', U + 'mudhjou6_yj0o7uz']) {
        const taskId = 'task_mudhjou7_zn92vvx';
        eq(SM.parseTaskCounterKey(P + taskId + '_' + tabKey), { taskId, tabKey }, tabKey);
    }
    eq(SM.parseTaskCounterKey(P + 'CRET'), null, 'bez identyfikatora zadania');
    eq(SM.parseTaskCounterKey(P + '_CRET'), null, 'pusty identyfikator zadania');
    eq(SM.parseTaskCounterKey(P + 'task_a_b_'), null, 'pusta karta');
});

test('zepsuty zapis nie zatrzymuje startu', () => {
    // Magazyn jest wspólny z samym T-REX i bywa czyszczony ręcznie. Śmieć pod
    // kluczem zadań nie może kosztować uruchomienia skryptu.
    const shared = makeStorage();
    shared.setItem(SH.StorageManager.getKey(SH.CONFIG.STORAGE_KEY_TASKS), '{to nie jest JSON');
    const broken = boot({ storage: shared, clock });
    ok(broken.SH, 'skrypt wstał');
    eq(broken.SH.store.tasks.length, 1, 'zadanie domyślne postawione od nowa');
});

test('reset zmiany kasuje zadania i stawia domyślne', () => {
    const cid = reset(clock.now() - HOUR);
    TM.create('do skasowania', clock.now() - 10 * MIN);
    TM.applyManualTotal(cid, 5);
    SH.SessionReset.resetItemData('test', 'manual');

    eq(SH.store.tasks.length, 1, 'jedno zadanie');
    eq(TM.active().name, SH.CONFIG.DEFAULT_TASK_NAME);
    eq(TM.shiftTotal(cid, 'done'), 0, 'liczniki zadania wyzerowane');
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
});

describe('Linia 8 i cisza');

test('linia 8 pokazuje nazwę zadania i jego własne liczby', () => {
    const cid = reset(clock.now() - HOUR);
    TM.rename(TM.active().id, 'fast_process');
    SH.AutoTrigger.scan();
    item('CRITS-PRG2');
    item('WHD');
    SH.StatsWindowRenderer.renderContent();

    const text = SH.StatsWindowRenderer.lines.line8_taskInfo.textContent;
    ok(text.startsWith('fast_process '), 'nazwa na początku: ' + text);
    ok(text.includes(' 2 '), 'dwie paczki: ' + text);
    ok(text.includes('50%'), 'procent zadania: ' + text);
    eq(drift(cid), { done: 0, sold: 0, neutral: 0 });
});

test('pauza jest widoczna w linii 8', () => {
    reset(clock.now() - HOUR);
    TM.pause();
    SH.StatsWindowRenderer.renderContent();
    const text = SH.StatsWindowRenderer.lines.line8_taskInfo.textContent;
    ok(text.includes(SH.I18n.get('taskPausedMark')), 'stojące tempo bez znaku wygląda jak awaria: ' + text);
});

test('linia 8 jest domyślnie wyłączona', () => {
    // Zasada 3 projektu: nowa linia nie ma prawa pojawić się sama.
    eq(SH.DEFAULT_LINE_CONFIG.line8_taskInfo.visible, false);
});

test('zadania nie kosztowały ani zapytania, ani linii w konsoli', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
