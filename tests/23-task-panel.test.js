/**
 * 23-task-panel.test.js — sekcja zadań w panelu ustawień.
 *
 * CZEGO TU PILNUJEMY. Panel ustawień otwiera się raz na zmianę i zwykle po to,
 * żeby zrobić JEDNĄ z trzech rzeczy: przełączyć proces, poprawić jego początek
 * albo wpisać liczby po awarii maszyny. Wszystkie trzy muszą być na górze
 * i mieścić się w dwóch–trzech kliknięciach — reszta panelu (kolory, rozmiary,
 * skróty) to ustawienia, do których przez całą zmianę się nie wraca.
 *
 * NAJWAŻNIEJSZE SPRAWDZENIE W TYM PLIKU: pole tempa i pole paczek opisują TO
 * SAMO, więc po wpisaniu tempa liczba paczek ma się przeliczyć — i odwrotnie.
 * Człowiek pamięta albo jedno, albo drugie („zrobiłem 259 paczek” kontra „miałem
 * jakieś 29,5”), a program ma rozumieć oba sposoby.
 *
 * Przerysowanie panelu jest tu podmienione na natychmiastowe. SettingsPanel
 * odkłada je przez setTimeout(0), żeby nie zdejmować elementu w trakcie obsługi
 * jego własnego zdarzenia; przedmiotem badania jest jednak treść panelu po
 * zmianie, a nie samo opóźnienie — a czekanie w kilku testach naraz sprawia, że
 * scenariusze przeplatają się i psują sobie stan.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const env = bootOnStand();
const clock = env.clock;
const SH = env.SH;
const S = SH.store;
const TM = SH.TaskManager;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

SH.SettingsPanel.rerender = function () {
    if (S.uiFlags.isSettingsPanelVisible) this.render();
};
SH.SettingsPanel.toggle();

/** Wszystkie węzły panelu, od korzenia w głąb. */
function nodes() {
    const out = [];
    (function walk(n) { out.push(n); (n.children || []).forEach(walk); })(SH.SettingsPanel.el);
    return out;
}

/** Przycisk po napisie — tak samo, jak szuka go człowiek. */
function button(text) {
    return nodes().find(n => n.tagName === 'BUTTON' && String(n.textContent).includes(text));
}

/** Pole w wierszu opisanym podaną etykietą. */
function fieldIn(label, type) {
    const row = nodes().find(n => n.tagName === 'DIV'
        && String(n.textContent).startsWith(label)
        && n.children.some(c => (c.children || []).some(g => g.tagName === 'INPUT')));
    if (!row) return null;
    const inputs = [];
    (function walk(n) { if (n.tagName === 'INPUT') inputs.push(n); (n.children || []).forEach(walk); })(row);
    return inputs.find(i => !type || i.type === type) || inputs[0];
}

/** Wpisanie wartości i zatwierdzenie — tak działa pole w przeglądarce. */
function type(input, value) {
    input.value = String(value);
    input.dispatch('change', { target: input });
}

const label = (key, params) => SH.I18n.get(key, params);

/** Czysty stan: jedno zadanie o znanym początku. */
function reset(minutesAgo) {
    const cid = S.currentTabInstanceId;
    S.tasks = [];
    S.activeTaskId = null;
    S.taskCounters = {};
    S.tabCounters[cid] = 0;
    S.tabSold[cid] = 0;
    S.tabNeutral[cid] = 0;
    // Lista zadań w magazynie znika tak jak przy prawdziwym resecie zmiany:
    // zapis zadań scala się z magazynem (audyt D1), a ten opisywałby
    // poprzedni test — często z innym początkiem zmiany.
    env.sandbox.localStorage.removeItem(SH.StorageManager.getKey(SH.CONFIG.STORAGE_KEY_TASKS));
    // Zera także w magazynie — licznik rośnie od wartości zapisanej (D7).
    SH.TaskManager.syncShift(cid);
    TM.create('Default', clock.now() - minutesAgo * MIN);
    SH.SettingsPanel.render();
    return cid;
}

describe('Kolejność sekcji');

test('zadania i liczniki stoją PRZED ustawieniami wyglądu', () => {
    // Panel otwiera się w trakcie pracy, a nie przed nią: to, co robi się co
    // zmianę, nie ma prawa być pod trzema ekranami kolorów.
    reset(60);
    const text = SH.SettingsPanel.el.textContent;
    const tasksAt = text.indexOf(label('section_tasks'));
    const countersAt = text.indexOf(label('section_globalStats'));
    const windowAt = text.indexOf(label('section_statsWindow'));
    ok(tasksAt >= 0 && countersAt >= 0 && windowAt >= 0, 'wszystkie trzy sekcje są w panelu');
    ok(tasksAt < countersAt, 'zadania przed licznikami działów');
    ok(countersAt < windowAt, 'liczniki przed stylizacją okna');
});

describe('Nowe zadanie i wznowienie');

test('przycisk zakłada zadanie o wpisanej nazwie', () => {
    reset(60);
    const nameField = nodes().find(n => n.tagName === 'INPUT'
        && n.placeholder === label('tasks_newPlaceholder'));
    ok(nameField, 'pole nazwy nowego zadania');
    nameField.value = 'fast_process';
    button(label('tasks_new')).dispatch('click', {});

    eq(S.tasks.length, 2, 'dwa zadania');
    eq(TM.active().name, 'fast_process', 'nowe jest aktywne');
    ok(SH.SettingsPanel.el.textContent.includes('fast_process'), 'widać je w panelu');
});

test('wznowienie wraca do zadania sprzed przerwy, z tym samym identyfikatorem', () => {
    // Bez tego zmiana rozpada się na wpisy 30 / 100 / 30 i nie widać, że tempo
    // trzymało się stabilnie.
    const cid = reset(180);
    const first = TM.active();
    TM.applyManualTotal(cid, 90);
    SH.SettingsPanel.render();

    const nameField = nodes().find(n => n.tagName === 'INPUT'
        && n.placeholder === label('tasks_newPlaceholder'));
    nameField.value = 'fast';
    button(label('tasks_new')).dispatch('click', {});
    eq(S.tasks.length, 2);

    // W historii przy nieaktywnym zadaniu stoi przycisk wznowienia.
    button(label('tasks_resume')).dispatch('click', {});
    eq(TM.active().id, first.id, 'ten sam identyfikator');
    eq(S.tasks.length, 2, 'nie powstało trzecie zadanie');
    eq(first.segments.length, 2, 'drugi odcinek');
    eq(TM.counters(first.id, cid).done, 90, 'liczniki przeżyły wycieczkę');
});

describe('Początek zadania w dwóch kliknięciach');

test('skrót „-5 min” cofa początek bieżącego odcinka', () => {
    // Tak to wygląda na hali: o nowym procesie człowiek wie z wyprzedzeniem,
    // zbiera narzędzia i siada do skryptu kilka minut po faktycznym starcie.
    reset(60);
    const before = clock.now();
    button(label('tasks_minutesBack', { value: 5 })).dispatch('click', {});
    const seg = TM.active().segments[0];
    const diff = Math.abs((before - 5 * MIN) - seg.from);
    ok(diff < 2000, 'początek pięć minut wstecz, różnica ' + diff + ' ms');
});

test('skrót „teraz” i „początek zmiany”', () => {
    reset(60);
    button(label('tasks_now')).dispatch('click', {});
    ok(Math.abs(clock.now() - TM.active().segments[0].from) < 2000, 'teraz');

    button(label('tasks_shiftStart')).dispatch('click', {});
    eq(TM.active().segments[0].from, S.sessionConfig.shiftCalculatedStartTime, 'początek zmiany');
});

test('godzina wpisana ręcznie i tekst, który godziną nie jest', () => {
    reset(180);
    const field = nodes().find(n => n.tagName === 'INPUT' && n.placeholder === 'HH:MM');
    ok(field, 'pole godziny');

    const target = new clock.Date();
    target.setHours(target.getHours() - 2, 30, 0, 0);
    type(field, SH.Utils.formatClock(target.getTime()));
    eq(SH.Utils.formatClock(TM.active().segments[0].from), SH.Utils.formatClock(target.getTime()));

    const before = TM.active().segments[0].from;
    type(nodes().find(n => n.tagName === 'INPUT' && n.placeholder === 'HH:MM'), 'wczoraj wieczorem');
    eq(TM.active().segments[0].from, before, 'śmieć nie rusza początku');
});

test('godzina późniejsza niż teraz na zmianie dziennej przycina się do teraz', () => {
    // Do 1.3.2 każda godzina późniejsza niż teraz szła na wczoraj, więc „18:00”
    // wpisane o 15:00 cofało zadanie o 21 godzin. Teraz liczy się najbliższa
    // taka godzina: dzisiejsza 18:00 jest bliżej niż wczorajsza, a przyszłość
    // setStart przycina do teraz. Przypadek nocny („23:30” o 00:40 to wczoraj)
    // sprawdza tests/26-shift-boundaries.test.js na zegarze ustawionym na noc.
    reset(120);
    const now = clock.now();
    const field = nodes().find(n => n.tagName === 'INPUT' && n.placeholder === 'HH:MM');
    type(field, SH.Utils.formatClock(now + 3 * HOUR));
    const from = TM.active().segments[0].from;
    ok(Math.abs(from - now) < 2000, 'początek to teraz, a nie wczoraj: ' + new Date(from).toString());
});

describe('Paczki i tempo to dwa pola opisujące to samo');

test('wpisanie paczek podnosi licznik karty', () => {
    const cid = reset(120);
    type(fieldIn(label('tasks_packages'), 'number'), 60);
    eq(TM.totals(TM.active()).done, 60, 'paczki zadania');
    eq(S.tabCounters[cid], 60, 'licznik karty nadąża za zadaniami');
    eq(TM.totals(TM.active()).neutral, 60, 'wpisane paczki są poza mianownikiem');
});

test('wpisanie tempa przelicza się na paczki', () => {
    // Człowiek pamięta „było jakieś 30”, a nie dokładną liczbę paczek.
    const cid = reset(120);                      // dwie godziny pracy
    type(fieldIn(label('tasks_rate'), 'number'), 30);
    eq(TM.totals(TM.active()).done, 60, '30 na godzinę przez dwie godziny');
    eq(S.tabCounters[cid], 60);
});

test('pole tempa pokazuje wartość OSIĄGALNĄ, a nie wpisaną', () => {
    // 1:17 pracy, wpisane 118 -> 151 paczek -> naprawdę 117,7 na godzinę.
    // Panel ma pokazać 117,7, bo tyle da się osiągnąć przy całych paczkach;
    // obiecywanie 118 byłoby kłamstwem o jedną paczkę.
    reset(77);
    type(fieldIn(label('tasks_rate'), 'number'), 118);
    eq(TM.totals(TM.active()).done, 151, 'paczki');
    const shown = parseFloat(fieldIn(label('tasks_rate'), 'number').value);
    ok(Math.abs(shown - 117.7) < 0.15, 'tempo w polu: ' + shown);
});

test('tempo wpisane przy zbyt krótkiej pracy nie rusza liczników', () => {
    // Wartość graniczna: przeliczenie tempa na paczki przy trzech sekundach
    // pracy dałoby liczbę wziętą z niczego, a wpisuje się ona na stałe.
    const cid = reset(0);
    type(fieldIn(label('tasks_rate'), 'number'), 30);
    eq(TM.totals(TM.active()).done, 0);
    eq(S.tabCounters[cid], 0);
});

describe('Pauza i usuwanie');

test('przycisk zatrzymuje i uruchamia zegar', () => {
    reset(60);
    button(label('tasks_pause')).dispatch('click', {});
    notOk(TM.isRunning(TM.active()), 'zegar stoi');
    ok(button(label('tasks_unpause')), 'przycisk zmienił napis na przeciwny');

    button(label('tasks_unpause')).dispatch('click', {});
    ok(TM.isRunning(TM.active()), 'zegar znowu chodzi');
});

test('usunięcie zadania zdejmuje jego paczki z licznika karty', () => {
    const cid = reset(120);
    type(fieldIn(label('tasks_packages'), 'number'), 40);

    const nameField = nodes().find(n => n.tagName === 'INPUT'
        && n.placeholder === label('tasks_newPlaceholder'));
    nameField.value = 'do usunięcia';
    button(label('tasks_new')).dispatch('click', {});
    type(fieldIn(label('tasks_packages'), 'number'), 15);
    eq(S.tabCounters[cid], 55, 'razem 55');

    // Przycisk usuwania stoi przy KAŻDYM zadaniu, gdy jest ich więcej niż jedno.
    button(label('tasks_delete')).dispatch('click', {});
    eq(S.tasks.length, 1, 'zostało jedno zadanie');
    eq(S.tabCounters[cid], TM.shiftTotal(cid, 'done'), 'licznik karty zgadza się z sumą zadań');
});

test('przy jednym zadaniu przycisku usuwania nie ma', () => {
    // Bez zadania paczki nie miałyby gdzie się zapisać, więc kontrolka, która
    // nic nie robi, nie ma prawa stać w panelu.
    reset(60);
    notOk(button(label('tasks_delete')), 'brak przycisku usuwania');
});

describe('Historia zmiany');

test('każde zadanie ma dwie linie: kiedy i ile', () => {
    const cid = reset(120);
    TM.rename(TM.active().id, 'nocny');
    type(fieldIn(label('tasks_packages'), 'number'), 80);
    SH.SettingsPanel.render();

    const text = SH.SettingsPanel.el.textContent;
    ok(text.includes(label('tasks_history')), 'nagłówek historii');
    ok(text.includes('nocny · '), 'nazwa i okres: ' + text.substring(text.indexOf('nocny'), text.indexOf('nocny') + 60));
    ok(text.includes(label('tasks_ongoing')), 'trwające zadanie zamiast godziny końca');
    ok(text.includes('80 · '), 'paczki, tempo i procent w drugiej linii');
    eq(TM.shiftTotal(cid, 'done'), 80);
});

describe('Teksty panelu');

test('panel w każdym języku bez surowych kluczy tłumaczeń', () => {
    // Brakujący klucz nie wywala skryptu — pokazuje na ekranie „[klucz]”.
    // Tak stało w panelu przy linii 8 („[lineSettings_taskInfo]”) od 1.3.1
    // do 1.3.3 (audyt H3), bo żaden test nie czytał gotowego panelu.
    const before = S.userConfig.language;
    try {
        for (const { code } of SH.CONFIG.AVAILABLE_LANGUAGES) {
            S.userConfig.language = code;
            SH.SettingsPanel.render();
            const raw = String(SH.SettingsPanel.el.textContent).match(/\[[A-Za-z]+_[A-Za-z_]+\]/g);
            eq(raw, null, `język ${code}: surowe klucze w panelu`);
        }
    } finally {
        S.userConfig.language = before;
        SH.SettingsPanel.render();
    }
});

test('podpowiedź linii 7 mówi o trzech liczbach, a linia 8 ma swoją', () => {
    // Linia 7 pokazuje trzy liczby od 1.1.0, a podpowiedź mówiła „dwie liczby,
    // nic więcej” (audyt H4). Podpowiedź linii 8 była w słownikach, ale nigdzie
    // się nie wyświetlała.
    const text = String(SH.SettingsPanel.el.textContent);
    ok(text.includes(label('lineSettings_compactHint')), 'podpowiedź linii 7 w panelu');
    ok(/trzy|three/i.test(label('lineSettings_compactHint')), 'o trzech liczbach');
    ok(text.includes(label('lineSettings_taskInfoHint')), 'podpowiedź linii 8 w panelu');
});

describe('Cisza');

test('panel zadań nie wyszedł do sieci ani do konsoli', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
