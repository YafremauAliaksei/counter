/**
 * 18-passwords.test.js — hasła dostępu do panelu ustawień.
 *
 * Od 1.1.0 hasło nie jest jedno, tylko jest ich lista. Zmieniło to trzy rzeczy
 * naraz i każda ma tu swoje sprawdzenia:
 *
 *   1. LISTA JEST EDYTOWANA RĘCZNIE na górze pliku, więc może przyjść z niej
 *      dosłownie cokolwiek — pustki, powtórzenia, obiekty, pojedynczy łańcuch
 *      zamiast tablicy. Normalizator sprowadza to do jednej postaci.
 *   2. HASŁA MAJĄ RÓŻNE DŁUGOŚCI, więc porównanie idzie po końcówce bufora,
 *      a nie po jego całości.
 *   3. KOD CHODZI NA KAŻDY KLAWISZ przez całą zmianę, więc sprawdzenie zaczyna
 *      się dopiero wtedy, gdy naciśnięty znak jest ostatnim znakiem któregoś
 *      z haseł.
 *
 * Osobno pilnowane jest ograniczenie, które wynika z samego mechanizmu: hasło
 * nie może być POCZĄTKIEM innego hasła, bo krótsze zadziała pierwsze i wyczyści
 * bufor, przez co dłuższego nie dałoby się wpisać nigdy.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const norm = SH.normalizeAccessPasswords;

/** Wpisuje tekst znak po znaku tak, jak zrobiłby to człowiek. */
function wpisz(tekst, opts = {}) {
    for (const znak of tekst) {
        SH.InputManager.onKeyDown({
            key: znak,
            code: 'Key' + znak.toUpperCase(),
            repeat: !!opts.repeat,
            target: { tagName: opts.wPolu ? 'INPUT' : 'BODY' },
            preventDefault() {},
        });
    }
}

const panelOtwarty = () => SH.store.uiFlags.isSettingsPanelVisible === true;

function zamknijPanel() {
    if (panelOtwarty()) SH.SettingsPanel.toggle();
    SH.InputManager.seqBuffer = '';
}

describe('Normalizacja listy haseł');

test('pusty łańcuch wylatuje z listy', () => {
    // Uczciwie: w dzisiejszym InputManagerze puste hasło i tak by nie zadziałało,
    // bo mapa po ostatnim znaku nie ma dla niego klucza. Ale to przypadek układu
    // wyszukiwania, a nie decyzja — po uproszczeniu tamtej mapy do zwykłej pętli
    // po `endsWith` puste hasło pasowałoby do KAŻDEGO bufora i otwierało panel
    // na pierwszym klawiszu. Ten warunek ma przeżyć taką zmianę.
    eq(norm(['', 'BOMBA']), ['BOMBA']);
    eq(norm(['   ', 'BOMBA']), ['BOMBA'], 'same białe znaki to też pustka');
    eq(norm(['']), []);
});

test('wielkość liter i białe znaki z brzegów nie mają znaczenia', () => {
    eq(norm(['bomba']), ['BOMBA']);
    eq(norm(['  BomBa  ']), ['BOMBA']);
});

test('powtórzenia znikają, także te różniące się wielkością liter', () => {
    eq(norm(['BOMBA', 'bomba', 'BOMBA']), ['BOMBA']);
});

test('kolejność: od najdłuższego', () => {
    eq(norm(['AB', 'ABCD', 'ABC']), ['ABCD', 'ABC', 'AB']);
});

test('pojedynczy łańcuch zamiast tablicy jest przyjmowany', () => {
    // Typowa pomyłka przy edycji. Bez tego łańcuch rozpadłby się na litery
    // i hasłem stałaby się każda z nich z osobna.
    eq(norm('BOMBA'), ['BOMBA']);
});

test('wartości, które hasłem nie są, są pomijane', () => {
    eq(norm([null, undefined, {}, [], true, 'BOMBA']), ['BOMBA']);
    eq(norm([]), [], 'pusta lista to dozwolony stan');
    eq(norm(null), []);
    eq(norm(undefined), []);
});

test('liczba jest przyjmowana jako tekst', () => {
    // 1234 bez cudzysłowów to realna literówka, a cyfry da się wpisać
    // z klawiatury — więc lepiej przyjąć niż po cichu wyrzucić.
    eq(norm([1234]), ['1234']);
});

describe('Ograniczenie: hasło nie może być początkiem innego');

test('lista w pliku nie zawiera takiej pary', () => {
    // Gdyby zawierała, dłuższego hasła nie dałoby się wpisać nigdy: krótsze
    // zadziała wcześniej i wyczyści bufor. To test na WŁASNĄ konfigurację,
    // więc pada dokładnie wtedy, gdy ktoś doda kolidujące hasło.
    const hasla = SH.CONFIG.SETTINGS_PANEL_ACCESS_PASSWORDS;
    const kolizje = [];
    for (const a of hasla) {
        for (const b of hasla) {
            if (a !== b && b.startsWith(a)) kolizje.push(a + ' jest początkiem ' + b);
        }
    }
    eq(kolizje, [], 'kolidujące hasła: ' + kolizje.join('; '));
});

describe('Wpisywanie haseł');

test('oba hasła otwierają panel', () => {
    zamknijPanel();
    wpisz('GORDONPAULE');
    ok(panelOtwarty(), 'GORDONPAULE');

    zamknijPanel();
    wpisz('BOMBA');
    ok(panelOtwarty(), 'BOMBA');
    zamknijPanel();
});

test('wielkość liter przy wpisywaniu nie ma znaczenia', () => {
    zamknijPanel();
    wpisz('bomba');
    ok(panelOtwarty());
    zamknijPanel();
});

test('śmieci wpisane wcześniej niczego nie psują', () => {
    // Bufor jest oknem przesuwnym: liczy się KOŃCÓWKA, a nie całość.
    zamknijPanel();
    wpisz('zxcvbnm1234567890BOMBA');
    ok(panelOtwarty());
    zamknijPanel();
});

test('hasło przerwane innym znakiem NIE otwiera panelu', () => {
    zamknijPanel();
    wpisz('BOMXBA');
    notOk(panelOtwarty(), 'przerwana sekwencja nie może zadziałać');
    zamknijPanel();
});

test('drugie wpisanie zamyka panel, a nie otwiera go po raz drugi', () => {
    zamknijPanel();
    wpisz('BOMBA');
    ok(panelOtwarty(), 'pierwsze wpisanie otwiera');
    wpisz('BOMBA');
    notOk(panelOtwarty(), 'drugie zamyka');
    zamknijPanel();
});

test('po trafieniu bufor jest czyszczony', () => {
    zamknijPanel();
    wpisz('BOMBA');
    eq(SH.InputManager.seqBuffer, '', 'bufor po trafieniu');
    zamknijPanel();
});

test('pisanie w polu tekstowym nie otwiera panelu', () => {
    zamknijPanel();
    wpisz('BOMBA', { wPolu: true });
    notOk(panelOtwarty(), 'w polu INPUT hasło nie działa');
    zamknijPanel();
});

test('autopowtarzanie klawisza nie buduje hasła', () => {
    // Przytrzymany klawisz daje dziesiątki zdarzeń na sekundę. Gdyby wchodziły
    // do bufora, przytrzymane „A” samo dopisywałoby się do wpisanego wcześniej
    // „BOMB”.
    zamknijPanel();
    wpisz('BOMB');
    wpisz('A', { repeat: true });
    notOk(panelOtwarty(), 'powtórzenie klawisza nie może dokończyć hasła');
    zamknijPanel();
});

describe('Koszt sprawdzania przy każdym klawiszu');

test('bufor nigdy nie rośnie ponad najdłuższe hasło', () => {
    zamknijPanel();
    wpisz('abcdefghijklmnopqrstuvwxyz0123456789');
    eq(SH.InputManager.seqBuffer.length, SH.InputManager._maxPasswordLen);
    eq(SH.InputManager._maxPasswordLen, 11, 'tyle ma GORDONPAULE');
    zamknijPanel();
});

test('porównanie startuje tylko na ostatnich znakach haseł', () => {
    // Mapa buduje się raz, w init(). Przy 'GORDONPAULE' i 'BOMBA' pracę
    // uruchamiają wyłącznie litery E i A — każdy inny klawisz kosztuje jedno
    // nieudane zajrzenie do mapy i ani jednego porównania łańcuchów.
    const mapa = SH.InputManager._passwordsByLastChar;
    eq([...mapa.keys()].sort(), ['A', 'E']);
    eq(mapa.get('E'), ['GORDONPAULE']);
    eq(mapa.get('A'), ['BOMBA']);
});

describe('Cisza po starcie zostaje nienaruszona');

test('hasła nie kosztowały ani zapytania, ani linii w konsoli', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});
