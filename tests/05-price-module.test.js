/**
 * 05-price-module.test.js — bezpieczniki sieciowe.
 *
 * Moduł cen ma PIĘĆ niezależnych miejsc, w których sprawdza, czy wolno mu
 * wejść do sieci. Każde jest tu testowane osobno i to jest cel: jedna
 * zapomniana gałąź nie może wystarczyć, żeby zapytanie wyszło.
 *
 * Druga połowa pliku sprawdza rzecz odwrotną — że po ręcznym włączeniu
 * wszystko faktycznie rusza. Bezpiecznik, który nie daje się odblokować,
 * jest równie zły jak jego brak.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

describe('Bezpieczniki przy wyłączonym module');

const off = boot();

test('KeepaOCR.loadImage odrzuca żądanie i nie tworzy obrazka', () => {
    const before = off.net.images.length;
    let rejected = false;
    off.SH.KeepaOCR.loadImage('B0915C748N').catch(() => { rejected = true; });
    eq(off.net.images.length, before, 'obrazek nie może powstać');
    return Promise.resolve().then(() => ok(rejected, 'obietnica musi zostać odrzucona'));
});

test('PriceCard.resolve() zwraca null i nie wchodzi w pętlę dostawców', () => {
    const beforeF = off.net.fetches.length;
    const beforeI = off.net.images.length;
    off.SH.PriceCard.resolve('B0915C748N');
    eq(off.net.fetches.length, beforeF);
    eq(off.net.images.length, beforeI);
    eq(off.SH.PriceCard.requestCount, 0);
    eq(off.SH.PriceCard.imageCount, 0);
});

test('PriceCard.check() nie szuka nawet ASIN przy wyłączonym module', () => {
    const before = off.SH.PriceCard.shownAsin;
    const a = off.sandbox.document.createElement('a');
    a.setAttribute('href', 'https://www.amazon.de/dp/B0915C748N');
    off.sandbox.document.body.appendChild(a);
    off.SH.PriceCard.check();
    eq(off.SH.PriceCard.shownAsin, before, 'ASIN nie może zostać podjęty');
    a.remove();
});

test('ValueLog.add() nie zapisuje nic przy wyłączonym module', () => {
    const before = off.SH.ValueLog.entries.length;
    const id = off.SH.ValueLog.add('B0915C748N', { value: 10, currency: 'EUR' }, 'CRET');
    eq(id, null);
    eq(off.SH.ValueLog.entries.length, before);
});

test('karta ceny jest ukryta, dopóki moduł jest wyłączony', () => {
    const card = off.el('priceCard');
    ok(card, 'karta musi istnieć w DOM');
    eq(card.style.display, 'none');
});

test('SH.forcePrice() odmawia przy wyłączonym module', () => {
    const before = off.net.images.length;
    off.SH.forcePrice('B0915C748N');
    eq(off.net.images.length, before);
});

test('panel ustawień nie pokazuje ustawień karty ceny', () => {
    off.SH.store.uiFlags.isSettingsPanelVisible = true;
    off.SH.SettingsPanel.render();
    const txt = off.el('settingsPanel').textContent;
    ok(txt.includes('Moduł cen'), 'sekcja wyłącznika musi być widoczna');
    ok(txt.includes('Moduł wyłączony'), 'musi być informacja, że reszta nie działa');
    notOk(txt.includes('Sklep Amazon'), 'ustawienia karty ceny mają być schowane');
    off.SH.store.uiFlags.isSettingsPanelVisible = false;
});

describe('Po ręcznym włączeniu sieć się budzi');

const on = boot();

test('przed włączeniem: zero zapytań', () => {
    eq(on.net.fetches.length, 0);
});

test('PriceModule.enable() wysyła zapytanie o kursy walut', () => {
    on.SH.PriceModule.enable();
    ok(on.net.fetches.length >= 1, 'po włączeniu musi polecieć zapytanie o kursy');
    ok(/currency|er-api|floatrates/.test(on.net.fetches.join(' ')),
       'zapytanie ma iść do dostawcy kursów, jest: ' + on.net.fetches.join(' '));
});

test('moduł zapisuje się w konfiguracji karty (przeżyje F5)', () => {
    eq(on.SH.store.localTabConfig.priceCard.moduleEnabled, true);
    ok(on.SH.priceModuleOn());
});

test('KeepaOCR.url buduje adres tylko do graph.keepa.com', () => {
    const url = on.SH.KeepaOCR.url('B0915C748N');
    ok(url.startsWith('https://graph.keepa.com/pricehistory.png?'), 'adres: ' + url);
    ok(url.includes('asin=B0915C748N'));
});

test('ValueLog.add() przy włączonym module zapisuje pozycję', () => {
    const id = on.SH.ValueLog.add('B0915C748N', { value: 12.5, currency: 'EUR' }, 'CRET');
    ok(id, 'add() musi zwrócić id');
    const e = on.SH.ValueLog.entries.find(x => x.id === id);
    eq(e.price, 12.5);
    eq(e.sign, 0, 'kierunek jeszcze nieustalony');
});

test('panel ustawień pokazuje pełną konfigurację karty ceny', () => {
    on.SH.store.uiFlags.isSettingsPanelVisible = true;
    on.SH.SettingsPanel.render();
    const txt = on.el('settingsPanel').textContent;
    ok(txt.includes('Sklep Amazon'), 'wybór sklepu');
    ok(txt.includes('Dziennik wartości'), 'sekcja dziennika');
    on.SH.store.uiFlags.isSettingsPanelVisible = false;
});

test('PriceModule.disable() zatrzymuje wszystko z powrotem', () => {
    on.SH.PriceModule.disable();
    notOk(on.SH.priceModuleOn());
    const before = on.net.fetches.length;
    on.SH.FxRates.init();
    on.SH.PriceCard.resolve('B0915C748N');
    eq(on.net.fetches.length, before, 'po wyłączeniu nie leci nic');
    eq(on.SH.ValueLog.add('B000000000', { value: 1, currency: 'EUR' }, 'CRET'), null);
    eq(on.el('priceCard').style.display, 'none');
});
