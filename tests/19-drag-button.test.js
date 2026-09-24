/**
 * 19-drag-button.test.js — przycisk przeciągania pokazuje STAN, nie własne
 * kliknięcie.
 *
 * SKĄD SIĘ WZIĄŁ TEN PLIK. Wygląd przycisku („Uaktywnij Przeciąganie” na czarno
 * kontra „Okno Przeciągalne” na pomarańczowo) wyliczany jest przy rysowaniu
 * panelu z flagi `uiFlags.isStatsWindowDragging`. Przerysowanie wołała jednak
 * WYŁĄCZNIE obsługa kliknięcia w ten przycisk — a flagę zdejmuje też ktoś inny:
 *
 *   - dragger po puszczeniu myszy (jedno przeciągnięcie = jedno ustawienie okna);
 *   - przycisk „Zresetuj pozycję okna”.
 *
 * Człowiek widział to tak: przeciągnął okno, puścił — tryb już się wyłączył, ale
 * przycisk dalej świeci pomarańczowym i pisze „kliknij, by przypiąć”. Kliknięcie
 * w niego WŁĄCZAŁO przeciąganie z powrotem, choć wyglądało na wyłączające.
 *
 * Reguła, której te testy pilnują: kontrolka odzwierciedla stan systemu
 * niezależnie od tego, KTO ten stan zmienił.
 *
 * DLACZEGO PRZERYSOWANIE JEST TU SYNCHRONICZNE. SettingsPanel.rerender() odkłada
 * pracę przez setTimeout(0), żeby nie zdejmować elementu w trakcie obsługi jego
 * własnego zdarzenia. Sprawdzamy jednak nie opóźnienie, tylko to, czy subskrypcja
 * w ogóle zadziałała — a odczekiwanie w kilku testach naraz sprawia, że scenariusze
 * przeplatają się i psują sobie stan panelu. Podmiana na wersję natychmiastową
 * zostawia dokładnie to, co jest przedmiotem badania.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const S = SH.store;

SH.SettingsPanel.rerender = function () {
    if (S.uiFlags.isSettingsPanelVisible) this.render();
};

/** Cały tekst panelu — przycisków szukamy po ich napisach. */
const panelText = () => SH.SettingsPanel.el.textContent;
const activeLabel = () => SH.I18n.get('dragStatsWindowActiveButton');
const idleLabel = () => SH.I18n.get('dragStatsWindowButton');

describe('Przycisk przeciągania okna statystyk');

test('panel otwiera się, a przycisk startuje w stanie spoczynku', () => {
    SH.SettingsPanel.toggle();
    ok(S.uiFlags.isSettingsPanelVisible, 'panel musi być otwarty');
    notOk(S.uiFlags.isStatsWindowDragging, 'tryb przeciągania domyślnie wyłączony');
    ok(panelText().includes(idleLabel()), 'napis spoczynkowy');
    notOk(panelText().includes(activeLabel()), 'napisu aktywnego jeszcze nie ma');
});

test('włączenie trybu zmienia napis przycisku', () => {
    S.uiFlags.isStatsWindowDragging = true;
    ok(panelText().includes(activeLabel()), 'napis aktywny');
    notOk(panelText().includes(idleLabel()), 'spoczynkowego już nie ma');
});

test('PUSZCZENIE MYSZY po przeciągnięciu wraca przycisk do spoczynku', () => {
    // Flagę zdejmuje dragger, a nie obsługa kliknięcia — panel i tak ma się
    // o tym dowiedzieć.
    const el = env.el('statsWindow');
    el.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 20 });

    S.uiFlags.isStatsWindowDragging = true;
    const dragger = SH.DragDropManager;
    dragger.onMouseDown({ button: 0, clientX: 20, clientY: 20 });
    dragger.onMouseMove({ clientX: 120, clientY: 90, preventDefault() {} });
    dragger.onMouseUp();

    notOk(S.uiFlags.isStatsWindowDragging, 'dragger zdejmuje flagę po puszczeniu');
    ok(panelText().includes(idleLabel()), 'przycisk wrócił do napisu spoczynkowego');
    notOk(panelText().includes(activeLabel()), 'napisu aktywnego już nie ma');
});

test('przeciągnięcie naprawdę przestawiło okno, a nie tylko flagi', () => {
    const pos = S.localTabConfig.statsWindowPosition;
    ok(pos.top && pos.left, 'pozycja zapisana: ' + JSON.stringify(pos));
    eq(pos.bottom, '', 'przyklejenie do dołu znika po ręcznym ustawieniu');
});

test('zdjęcie flagi w dowolny inny sposób też odświeża przycisk', () => {
    // Druga droga: przycisk „Zresetuj pozycję okna”, który również omija
    // obsługę kliknięcia w sam przycisk przeciągania.
    S.uiFlags.isStatsWindowDragging = true;
    ok(panelText().includes(activeLabel()), 'warunek wstępny: tryb włączony');
    S.uiFlags.isStatsWindowDragging = false;
    ok(panelText().includes(idleLabel()), 'po zdjęciu flagi napis spoczynkowy');
});

describe('Ten sam niezmiennik dla karty ceny');

test('przycisk przeciągania karty też nadąża za stanem', () => {
    const activeCard = SH.I18n.get('priceCard_dragActive');
    const idleCard = SH.I18n.get('priceCard_drag');
    // Sekcja karty pokazuje się w panelu dopiero przy włączonym module.
    S.localTabConfig.priceCard.moduleEnabled = true;
    SH.SettingsPanel.render();
    ok(panelText().includes(idleCard), 'warunek wstępny: napis spoczynkowy karty');

    S.uiFlags.isPriceCardDragging = true;
    ok(panelText().includes(activeCard), 'napis aktywny karty');

    S.uiFlags.isPriceCardDragging = false;
    ok(panelText().includes(idleCard), 'i powrót do spoczynku');

    S.localTabConfig.priceCard.moduleEnabled = false;
});

test('cała ta zabawa nie wysłała ani jednego zapytania', () => {
    // Włączenie modułu cen POLEM w store nie jest tym samym, co SH.priceOn():
    // ten drugi świadomie budzi sieć, a zapis pola ma tylko odsłonić sekcję.
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
});
