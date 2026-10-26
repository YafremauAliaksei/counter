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

test('PUSZCZENIE po przeciągnięciu wraca przycisk do spoczynku', () => {
    // Flagę zdejmuje dragger, a nie obsługa kliknięcia — panel i tak ma się
    // o tym dowiedzieć.
    const el = env.el('statsWindow');
    el.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 20 });

    S.uiFlags.isStatsWindowDragging = true;
    const dragger = SH.DragDropManager;
    dragger.onPointerDown({ button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 20 });
    dragger.onPointerMove({ pointerId: 1, clientX: 120, clientY: 90, preventDefault() {} });
    dragger.onPointerUp({ pointerId: 1 });

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

describe('Ekran dotykowy');

/** Okno w trybie przeciągania i licznik przesunięć z dokumentu. */
function touchSetup() {
    const e = boot();
    const el = e.el('statsWindow');
    el.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 20 });
    e.SH.store.uiFlags.isStatsWindowDragging = true;
    const doc = e.sandbox.document;
    const fire = (type, init) => doc.dispatch(type, { preventDefault() {}, ...init });
    return { e, el, S: e.SH.store, drag: e.SH.DragDropManager, fire };
}

test('palec przeciąga okno: pointer, nie mysz, i bez przewijania strony', () => {
    // Firefox z ekranem dotykowym zamienia na mysz tylko stuknięcie, a ruch
    // palcem przewija stronę — stąd zdarzenia wskaźnika i touch-action.
    const { el, S, drag, fire } = touchSetup();
    eq(el.style.touchAction, 'none', 'przeglądarka nie zabiera ruchu palca');
    drag.onPointerDown({ button: 0, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 20, clientY: 20 });
    fire('pointermove', { pointerId: 7, clientX: 220, clientY: 120 });
    eq([el.style.left, el.style.top], ['210px', '110px']);
    fire('pointerup', { pointerId: 7 });
    eq(S.uiFlags.isStatsWindowDragging, false, 'po puszczeniu tryb gaśnie');
    eq(S.localTabConfig.statsWindowPosition.left, '210px', 'pozycja zapisana');
    fire('pointermove', { pointerId: 7, clientX: 400, clientY: 300 });
    eq(el.style.left, '210px', 'po puszczeniu ruch niczego nie przesuwa');
});

test('drugi palec i obcy wskaźnik nie przejmują okna', () => {
    const { el, drag, fire } = touchSetup();
    drag.onPointerDown({ button: 0, pointerId: 2, isPrimary: false, clientX: 20, clientY: 20 });
    eq(drag.isDragging, false, 'drugi palec nie zaczyna');
    drag.onPointerDown({ button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 20 });
    fire('pointermove', { pointerId: 2, clientX: 500, clientY: 500 });
    eq(el.style.left === '490px', false, 'ruch innego palca pomijany');
    fire('pointerup', { pointerId: 2 });
    eq(drag.isDragging, true, 'puszczenie innego palca nie kończy');
    fire('pointerup', { pointerId: 1 });
});

test('przerwany dotyk (pointercancel) kończy jak puszczenie i zapisuje pozycję', () => {
    const { S, drag, fire } = touchSetup();
    drag.onPointerDown({ button: 0, pointerId: 3, isPrimary: true, clientX: 20, clientY: 20 });
    fire('pointermove', { pointerId: 3, clientX: 60, clientY: 40 });
    fire('pointercancel', { pointerId: 3 });
    eq(drag.isDragging, false);
    eq(S.uiFlags.isStatsWindowDragging, false);
    eq(S.localTabConfig.statsWindowPosition.left, '50px');
});

test('poza trybem przeciągania dotyk nic nie rusza; prawy przycisk myszy też nie', () => {
    const { S, drag } = touchSetup();
    drag.onPointerDown({ button: 2, pointerId: 1, isPrimary: true, clientX: 20, clientY: 20 });
    eq(drag.isDragging, false, 'prawy przycisk');
    S.uiFlags.isStatsWindowDragging = false;
    drag.onPointerDown({ button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 20 });
    eq(drag.isDragging, false, 'bez trybu przeciągania');
});

test('rozbiórka w trakcie ciągnięcia zdejmuje słuchaczy z dokumentu', () => {
    const { e, el, drag, fire } = touchSetup();
    drag.onPointerDown({ button: 0, pointerId: 4, isPrimary: true, clientX: 20, clientY: 20 });
    e.SH.Main.teardown();
    eq(drag.isDragging, false);
    const before = el.style.left;
    fire('pointermove', { pointerId: 4, clientX: 300, clientY: 300 });
    eq(el.style.left, before, 'po rozbiórce ruch niczego nie przesuwa');
});
