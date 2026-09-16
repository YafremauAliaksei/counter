/**
 * 16-price-card-look.test.js — wygląd karty ceny i jej przezroczystość dla myszy.
 *
 * DWIE RZECZY, KTÓRYCH TEN PLIK PILNUJE.
 *
 * 1. Karta jest POMOCĄ, a nie oknem cudzej aplikacji. Domyślnie: przezroczyste
 *    tło, cienkie pismo w rozmiarze zbliżonym do linii okna statystyk, bez ramki
 *    i cienia. Wszystko, co zaśmieca, włącza się ręcznie.
 *
 * 2. Karta NIE ŁAPIE MYSZY. To warunek pracy, a nie kosmetyka: pod kartą leży
 *    interfejs T-REX i człowiek musi w niego trafiać. Link z kodem produktu był
 *    jedynym wyjątkiem — od 1.0.0 włącza się ręcznie.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot } = require('./dom-stub');

const env = boot();
const SH = env.SH;
const P = SH.PriceCard;
const pc = () => SH.store.localTabConfig.priceCard;

const ASIN = 'B0FJ6K5H5V';

/** Stawia kartę w stanie „cena znaleziona” i przerysowuje. */
function zCena(ms) {
    P.shownAsin = ASIN;
    P.cache.set(ASIN, {
        status: 'ok',
        current: { value: 11699, currency: 'EUR', text: 'EUR 11699.00' },
        rrp: null, source: 'keepa-ocr', ms: ms === undefined ? 96 : ms,
    });
    P.applyStyle();
}

describe('Wartości domyślne karty');

test('nowe wyłączniki mają zadane wartości', () => {
    eq(SH.DEFAULT_LOCAL_CONFIG.priceCard.showAsin, true, 'kod produktu widać');
    eq(SH.DEFAULT_LOCAL_CONFIG.priceCard.asinClickable, false, 'ale nie jest linkiem');
    eq(SH.DEFAULT_LOCAL_CONFIG.priceCard.showLatency, false, 'czas zdobycia ceny to hałas');
    eq(SH.DEFAULT_LOCAL_CONFIG.priceCard.fontFamily, 'default');
});

test('karta jest domyślnie przezroczysta i cienka', () => {
    eq(SH.DEFAULT_LOCAL_CONFIG.priceCard.bgAlpha, 0, 'tło przezroczyste');
    eq(SH.DEFAULT_LOCAL_CONFIG.priceCard.fontSize, 16, 'blisko 14 px linii okna statystyk');
});

describe('Przezroczystość dla myszy');

test('sama karta nie łapie myszy nigdy', () => {
    pc().moduleEnabled = true;
    zCena();
    eq(P.el.style.pointerEvents, 'none', 'kliknięcia mają dochodzić do T-REX');
});

test('kod produktu domyślnie NIE jest linkiem', () => {
    zCena();
    ok(P.asinEl.style.cssText.includes('pointer-events:none'),
       'element nie może łapać myszy: ' + P.asinEl.style.cssText);
    eq(P.asinEl.getAttribute('href'), null, 'bez href nie ma czego otworzyć');
    eq(P.asinEl.title, '', 'i nie ma czego podpowiadać');
    ok(P.asinEl.style.cssText.includes('text-decoration:none'), 'bez podkreślenia');
});

test('po włączeniu klikalności wraca link i tylko on łapie mysz', () => {
    pc().asinClickable = true;
    zCena();
    ok(P.asinEl.style.cssText.includes('pointer-events:auto'), 'link łapie mysz');
    ok(String(P.asinEl.getAttribute('href')).indexOf('/dp/' + ASIN) > 0,
       'href prowadzi do produktu: ' + P.asinEl.getAttribute('href'));
    eq(P.el.style.pointerEvents, 'none', 'ale sama karta nadal nie');
    pc().asinClickable = false;
});

test('przeciąganie zdejmuje link nawet przy włączonej klikalności', () => {
    // W trakcie gestu kliknięcie wyprowadziłoby ze strony.
    pc().asinClickable = true;
    SH.store.uiFlags.isPriceCardDragging = true;
    zCena();
    ok(P.asinEl.style.cssText.includes('pointer-events:none'), 'link zdjęty na czas gestu');
    SH.store.uiFlags.isPriceCardDragging = false;
    pc().asinClickable = false;
});

describe('Wyłączniki zawartości');

test('wyłączony kod produktu znika z karty', () => {
    pc().showAsin = false;
    zCena();
    ok(P.asinEl.style.cssText.includes('display:none'), P.asinEl.style.cssText);
    pc().showAsin = true;
});

test('czas zdobycia ceny domyślnie nie jest pokazywany', () => {
    zCena(96);
    P.render();
    notOk(/\d+ms/.test(P.srcEl.textContent),
          'w linii źródła nie ma milisekund: ' + P.srcEl.textContent);
    ok(P.srcEl.textContent.includes('keepa-ocr'), 'ale źródło widać');
});

test('po włączeniu czas się pojawia', () => {
    pc().showLatency = true;
    zCena(96);
    P.render();
    ok(P.srcEl.textContent.includes('96ms'), P.srcEl.textContent);
    pc().showLatency = false;
});

describe('Tło, ramka i cień idą razem');

test('przy przezroczystym tle nie zostaje pusta obwódka', () => {
    pc().bgAlpha = 0;
    P.applyStyle();
    eq(P.el.style.background, 'transparent');
    eq(P.el.style.border, 'none');
    eq(P.el.style.boxShadow, 'none');
    eq(P.el.style.padding, '0', 'bez tła margines wewnętrzny jest zbędny');
});

test('po podniesieniu tła wraca oprawa', () => {
    pc().bgAlpha = 88;
    P.applyStyle();
    ok(P.el.style.background.startsWith('rgba('), P.el.style.background);
    ok(P.el.style.border.includes('1px solid'), P.el.style.border);
    ok(P.el.style.boxShadow !== 'none');
    pc().bgAlpha = 0;
    P.applyStyle();
});

test('granice: alfa spoza zakresu i wartość nieliczbowa', () => {
    pc().bgAlpha = 200;
    P.applyStyle();
    ok(P.el.style.background.includes('1)'), 'alfa przycięta do 100%: ' + P.el.style.background);
    pc().bgAlpha = -5;
    P.applyStyle();
    eq(P.el.style.background, 'transparent', 'ujemna alfa to brak tła');
    pc().bgAlpha = 'rgba(0,0,0,1); position:fixed';
    P.applyStyle();
    eq(P.el.style.background, 'transparent', 'wstrzyknięcie CSS wraca do wartości zapasowej');
    pc().bgAlpha = 0;
    P.applyStyle();
});

describe('Krój pisma z listy okna statystyk');

test('domyślnie ten sam krój, co linie', () => {
    pc().fontFamily = 'default';
    P.applyStyle();
    eq(P.el.style.fontFamily, SH.CONFIG.FONT_FAMILY_OPTIONS.default);
});

test('nieznana nazwa kroju wraca do domyślnej, a nie psuje stylu', () => {
    pc().fontFamily = 'nie-ma-takiego';
    P.applyStyle();
    eq(P.el.style.fontFamily, SH.CONFIG.FONT_FAMILY_OPTIONS.default);
    pc().fontFamily = 'monospace';
    P.applyStyle();
    eq(P.el.style.fontFamily, SH.CONFIG.FONT_FAMILY_OPTIONS.monospace);
    pc().fontFamily = 'default';
});

describe('Cały ten wygląd nie kosztował ani jednego zapytania');

test('sieć pozostała nietknięta', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
});
