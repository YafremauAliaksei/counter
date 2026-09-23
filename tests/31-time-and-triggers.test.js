/**
 * 31-time-and-triggers.test.js — granice drobnych funkcji, od których zależy
 * wszystko inne (audyt G4: kluczowe klastry mutantów, które przeżyły).
 *
 * WYZWALACZE decydują, czy przedmiot w ogóle zostanie zaliczony. Mutant bez
 * flagi `i` i mutant bez wyłączenia `PROBLEM-SOLVE` przeżywały cały zestaw —
 * czyli zmiana, która po cichu przestaje liczyć połowę przedmiotów albo zaczyna
 * liczyć odesłane do rozwiązywania problemów, nie zapalała niczego.
 *
 * CZAS NA EKRANIE (formatDuration, formatTime, timeStringToDate) nie był
 * wymieniony w żadnym teście, choć stoi w każdej linii okna statystyk.
 *
 * clone() — zwrócenie referencji zamiast kopii to klasa błędu z 8.3.0,
 * której poświęcony jest 17-wierszowy komentarz, a żaden test.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const U = SH.Utils;
const C = SH.CONFIG;

describe('Wyzwalacz początku przedmiotu');

test('trafia bez względu na wielkość liter, w trzech językach strony', () => {
    for (const t of ['poniżej', 'PONIŻEJ', 'Poniżej — czy przedmiot…', 'Transparency', 'TRANSPARENCY', 'видите ниже']) {
        ok(C.PRE_TRIGGER_REGEX.test(t), 'powinien trafić: ' + t);
    }
});

test('nie trafia w tekst bez polskiego znaku ani w pusty', () => {
    for (const t of ['ponizej', '', 'poniż ej']) notOk(C.PRE_TRIGGER_REGEX.test(t), 'nie powinien trafić: ' + JSON.stringify(t));
});

describe('Wyzwalacz końca przedmiotu');

test('trafia w każdą z form końca przedmiotu, bez względu na wielkość liter', () => {
    for (const t of ['Przypisz nowy', 'przypisz NOWY', 'Przypisz ponownie',
                     'Przedmiot wysłano do WHD', 'przedmiot WYSŁANO do Liquidation']) {
        ok(C.AUTO_TRIGGER_REGEX.test(t), 'powinien trafić: ' + t);
    }
    // Tekst samego T-REX w rosyjskiej wersji interfejsu — bez pierwszej litery,
    // bo ta bywa łacińską albo cyrylicką „C” zależnie od ekranu.
    ok(C.AUTO_TRIGGER_REGEX.test('Cканирование номера LP:'), 'tekst T-REX po rosyjsku');
});

test('przedmiot odesłany do PROBLEM-SOLVE nie jest zaliczony', () => {
    // To nie jest koniec pracy nad przedmiotem, tylko przekazanie go dalej.
    notOk(C.AUTO_TRIGGER_REGEX.test('Przedmiot wysłano do PROBLEM-SOLVE'), 'PROBLEM-SOLVE');
    notOk(C.AUTO_TRIGGER_REGEX.test('Przedmiot wysłano do problem-solve'), 'wielkość liter nie ratuje');
    // Granica słowa: inna nazwa zaczynająca się tak samo JEST końcem przedmiotu.
    ok(C.AUTO_TRIGGER_REGEX.test('Przedmiot wysłano do PROBLEM-SOLVER'), 'PROBLEM-SOLVER to inne miejsce');
    notOk(C.AUTO_TRIGGER_REGEX.test('Przypisz'), 'samo „Przypisz” to nie koniec');
    notOk(C.AUTO_TRIGGER_REGEX.test('Przedmiot wysłano do '), 'bez miejsca docelowego to nie koniec');
});

describe('Czas na ekranie');

test('formatDuration na granicach jednostek i na śmieciach', () => {
    const h = SH.I18n.get('hoursShort'), m = SH.I18n.get('minutesShort'), s = SH.I18n.get('secondsShort');
    const na = SH.I18n.get('notApplicable');
    for (const bad of [0, -1, NaN, Infinity, -Infinity, null, undefined, 'abc']) {
        eq(U.formatDuration(bad), na, 'wartość bez sensu: ' + String(bad));
    }
    eq(U.formatDuration(999), `0${s}`, 'poniżej sekundy');
    eq(U.formatDuration(1000), `1${s}`);
    eq(U.formatDuration(59999), `59${s}`);
    eq(U.formatDuration(60000), `1${m} 00${s}`, 'pełna minuta');
    eq(U.formatDuration(3599999), `59${m} 59${s}`);
    eq(U.formatDuration(3600000), `1${h} 00${m}`, 'pełna godzina');
    eq(U.formatDuration(10.5 * 3600000), `10${h} 30${m}`, 'cała zmiana');
});

test('formatTime: północ, ostatnia sekunda doby, zła data', () => {
    eq(U.formatTime(new Date(2026, 8, 16, 0, 0, 0)), '000000');
    eq(U.formatTime(new Date(2026, 8, 16, 23, 59, 59), true, ':'), '23:59:59');
    eq(U.formatTime(new Date(2026, 8, 16, 6, 5, 0), false, ':'), '06:05');
    eq(U.formatTime(new Date(NaN), true, ':'), '00:00:00', 'zła data nie wypisuje NaN');
    eq(U.formatTime('nie data', false, ':'), '00:00');
});

test('timeStringToDate: przejście przez północ także na końcu miesiąca i roku', () => {
    const base = new Date(2026, 8, 30, 20, 0);            // 30 września
    const lunch = U.timeStringToDate('0050', base, true);
    eq([lunch.getMonth(), lunch.getDate(), lunch.getHours(), lunch.getMinutes()], [9, 1, 0, 50], '1 października 00:50');
    const nye = U.timeStringToDate('0020', new Date(2026, 11, 31, 23, 0), true);
    eq([nye.getFullYear(), nye.getMonth(), nye.getDate()], [2027, 0, 1], 'Nowy Rok');
    const same = U.timeStringToDate('2359', base, false);
    eq([same.getDate(), same.getHours(), same.getMinutes()], [30, 23, 59], 'bez przejścia ten sam dzień');
});

describe('clone() oddaje kopię, a nie referencję');

test('zmiana w kopii nie dotyka oryginału, także w głębi', () => {
    const original = { a: { b: { c: 1 } }, list: [1, 2] };
    const copy = U.clone(original);
    copy.a.b.c = 99;
    eq(original.a.b.c, 1, 'zagnieżdżony obiekt skopiowany');
    ok(copy !== original && copy.a !== original.a, 'nowe obiekty na każdym poziomie');
    eq(U.clone(5), 5, 'wartość prosta wraca bez zmian');
    eq(U.clone(null), null);
});
