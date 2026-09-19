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

test('domyślnie karta pokazuje CENĘ I NIC WIĘCEJ', () => {
    // Sedno wyglądu 1.1.0: po włączeniu modułu cen na ekranie ma pojawić się
    // jedna linijka z kwotą. Wszystko, co jest identyfikatorem albo diagnostyką,
    // startuje wyłączone.
    const d = SH.DEFAULT_LOCAL_CONFIG.priceCard;
    eq(d.showPrice, true, 'cena — jedyna rzecz widoczna od razu');
    eq(d.showAsin, false, 'kod produktu to identyfikator, nie cena');
    eq(d.asinClickable, false, 'i nie jest linkiem');
    eq(d.showRrp, false, 'drugi wiersz ceny');
    eq(d.showSource, false, 'wiersz źródła');
    eq(d.showLatency, false, 'czas zdobycia ceny');
});

test('karta wygląda jak linia 7: szara, półprzezroczysta, bez tła', () => {
    const d = SH.DEFAULT_LOCAL_CONFIG.priceCard;
    const l7 = SH.DEFAULT_LINE_CONFIG.line7_compact;
    eq(d.bgAlpha, 0, 'tło przezroczyste');
    eq(d.colorHex, l7.colorHex, 'ten sam szary, co linia 7');
    eq(d.alpha, l7.alpha, 'ta sama przezroczystość, co linia 7');
    eq(d.fontSize, l7.fontSize, 'ten sam rozmiar, co linia 7');
    eq(d.fontFamily, 'default');
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

describe('Kolor tekstu — jeden na całą kartę');

/** Kolor wyliczony z wiersza stylu danego elementu. */
function colorOf(el) {
    return (/color:\s*(rgba?\([^)]*\))/.exec(el.style.cssText || '') || [])[1] || '';
}

test('domyślnie wszystkie wiersze mają ten sam szary, co linia 7', () => {
    pc().colorHex = '#808080';
    pc().alpha = 50;
    zCena();
    const oczekiwany = 'rgba(128, 128, 128, 0.500)';
    eq(colorOf(P.priceEl), oczekiwany, 'cena');
    eq(colorOf(P.asinEl), oczekiwany, 'kod produktu');
    eq(colorOf(P.rrpEl), oczekiwany, 'drugi wiersz');
    eq(colorOf(P.srcEl), oczekiwany, 'wiersz źródła');
});

test('zmiana koloru przechodzi na WSZYSTKIE wiersze naraz', () => {
    pc().colorHex = '#FF0000';
    pc().alpha = 100;
    zCena();
    const oczekiwany = 'rgba(255, 0, 0, 1.000)';
    eq(colorOf(P.priceEl), oczekiwany);
    eq(colorOf(P.asinEl), oczekiwany);
    eq(colorOf(P.rrpEl), oczekiwany);
    eq(colorOf(P.srcEl), oczekiwany);
    pc().colorHex = '#808080';
    pc().alpha = 50;
});

test('granice: alfa spoza zakresu i kolor nie do przyjęcia', () => {
    pc().alpha = 300;
    zCena();
    ok(colorOf(P.priceEl).endsWith('1.000)'), 'alfa przycięta do 100%: ' + colorOf(P.priceEl));
    pc().alpha = -10;
    zCena();
    ok(colorOf(P.priceEl).endsWith('0.000)'), 'alfa przycięta do zera');
    pc().alpha = 'rgba(0,0,0,1); position:fixed';
    zCena();
    ok(colorOf(P.priceEl).endsWith('0.500)'), 'wstrzyknięcie CSS wraca do wartości zapasowej');

    pc().alpha = 50;
    pc().colorHex = 'nie-kolor';
    zCena();
    eq(colorOf(P.priceEl), 'rgba(128, 128, 128, 0.500)', 'zły kolor to neutralna szarość');
    pc().colorHex = '#808080';
    zCena();
});

test('stan NIE jest już niesiony kolorem — cena i awaria wyglądają tak samo', () => {
    // Do 1.1.0 zielona cena znaczyła „jest”, pomarańczowa kreska „tnie CSP”.
    // Teraz kolor jest ustawieniem wyglądu, a stan mówi tekst — który przy
    // awarii pokazuje się zawsze. Sprawdzamy, że kolor faktycznie przestał
    // zależeć od stanu.
    zCena();
    const przyCenie = colorOf(P.priceEl);
    P.cache.set(ASIN, { status: 'fail', reason: 'nie ma ceny' });
    P.render();
    eq(colorOf(P.priceEl), przyCenie, 'ten sam kolor przy cenie i przy jej braku');
    zCena();
});

describe('Powód awarii pokazuje się mimo wyłączników');

test('brak ceny tłumaczy się słowami, choć drugi wiersz jest wyłączony', () => {
    eq(pc().showRrp, false, 'warunek wstępny: drugi wiersz wyłączony');
    P.shownAsin = ASIN;
    P.cache.set(ASIN, { status: 'fail', reason: 'źródła odpracowały, ceny nie ma' });
    P.render();
    eq(P.priceEl.textContent, '—');
    ok(P.rrpEl.textContent.length > 0,
       'powód musi być widoczny: karta z samą kreską jest nie do odróżnienia od zepsutego skryptu');
    zCena();
});

test('blokada CSP też jest wytłumaczona', () => {
    P.csp.img = true;
    P.shownAsin = ASIN;
    P.cache.delete(ASIN);
    P.render();
    ok(P.rrpEl.textContent.length > 0, 'wyjaśnienie blokady: ' + P.rrpEl.textContent);
    P.csp.img = false;
    zCena();
});

test('cena z OBCEGO sklepu jest widoczna mimo wyłączonego źródła', () => {
    // Bez tej adnotacji suma zmiany niepostrzeżenie zmieszałaby waluty i witryny,
    // a przy dwóch rynkach w euro nie widać tego nawet po samej kwocie.
    eq(pc().showSource, false, 'warunek wstępny: źródło wyłączone');
    P.shownAsin = ASIN;
    P.cache.set(ASIN, {
        status: 'ok', current: { value: 9.99, currency: 'EUR', text: 'EUR 9.99' },
        rrp: null, source: 'keepa-ocr', ms: 50, fallback: true, market: 'fr',
    });
    P.render();
    ok(P.srcEl.textContent.length > 0, 'adnotacja o obcym sklepie: ' + P.srcEl.textContent);
    notOk(P.srcEl.textContent.includes('keepa-ocr'), 'ale nazwy dostawcy nadal nie widać');
    zCena();
});

describe('Przezroczystość dla myszy — niezmiennik po CAŁYM poddrzewie karty');

/**
 * Które węzły karty łapią mysz.
 *
 * Poprzednie testy sprawdzają POJEDYNCZE elementy i tym samym pilnują tylko
 * tego, co już istnieje. Ten obchodzi całe poddrzewo, więc łapie element,
 * którego jeszcze nie ma: ktoś dołoży karcie nowy wiersz z własnym stylem
 * i `pointer-events:auto` wjedzie niezauważony, a pod kartą leży interfejs
 * T-REX, w który człowiek musi trafiać.
 *
 * Wartość czyta się z dwóch miejsc, bo w obu postaciach jest ustawiana:
 * `style.pointerEvents` (karta, przez generator h()) i `style.cssText`
 * (elementy wnętrza, składane łańcuchem w applyStyle).
 */
function lapiaceMysz(root) {
    const out = [];
    (function walk(n) {
        const wprost = n.style && n.style.pointerEvents;
        const zTekstu = (/pointer-events:\s*([a-z]+)/.exec((n.style && n.style.cssText) || '') || [])[1];
        if ((wprost || zTekstu) === 'auto') out.push(n);
        (n.children || []).forEach(walk);
    })(root);
    return out;
}

test('domyślnie ani jeden węzeł karty nie łapie myszy', () => {
    pc().asinClickable = false;
    SH.store.uiFlags.isPriceCardDragging = false;
    zCena();
    eq(lapiaceMysz(P.el).length, 0,
       'każde kliknięcie ma dochodzić do interfejsu T-REX pod kartą');
});

test('po włączeniu klikalności łapie DOKŁADNIE jeden węzeł — link', () => {
    pc().asinClickable = true;
    zCena();
    const lapia = lapiaceMysz(P.el);
    eq(lapia.length, 1, 'wyjątek ma być jeden, jest ich: ' + lapia.length);
    ok(lapia[0] === P.asinEl, 'i ma to być kod produktu, a nie cokolwiek innego');
    pc().asinClickable = false;
});

test('w trakcie przeciągania łapie tylko sama karta, nie jej wnętrze', () => {
    // Przeciąganie to jedyny stan, w którym karta ma prawo przejąć mysz:
    // wtedy ciągnie się ją całą. Link jest wtedy zdjęty niezależnie od
    // ustawienia — kliknięcie w środku gestu wyprowadziłoby ze strony.
    pc().asinClickable = true;
    SH.store.uiFlags.isPriceCardDragging = true;
    zCena();
    const lapia = lapiaceMysz(P.el);
    eq(lapia.length, 1, 'w trakcie gestu łapie dokładnie jeden węzeł');
    ok(lapia[0] === P.el, 'i jest to sama karta, a nie jej wnętrze');

    SH.store.uiFlags.isPriceCardDragging = false;
    pc().asinClickable = false;
    zCena();
    eq(lapiaceMysz(P.el).length, 0, 'po gescie karta wraca do przezroczystości');
});

describe('Wyłączniki zawartości');

test('wyłączony kod produktu znika z karty', () => {
    pc().showAsin = false;
    zCena();
    ok(P.asinEl.style.cssText.includes('display:none'), P.asinEl.style.cssText);
    pc().showAsin = true;
});

test('domyślnie wiersz źródła jest pusty i schowany', () => {
    zCena(96);
    P.render();
    eq(P.srcEl.textContent, '', 'ani nazwy dostawcy, ani milisekund');
    eq(P.srcEl.style.display, 'none', 'pusty wiersz nie ma zostawać jako przerwa');
});

test('wyłącznik źródła pokazuje nazwę dostawcy', () => {
    pc().showSource = true;
    zCena(96);
    P.render();
    ok(P.srcEl.textContent.includes('keepa-ocr'), P.srcEl.textContent);
    pc().showSource = false;
});

test('czas ma własny wyłącznik i działa bez wyłącznika źródła', () => {
    // Przełącznik, który nic nie robi, dopóki nie włączy się innego, jest gorszy
    // niż brak przełącznika.
    pc().showLatency = true;
    zCena(96);
    P.render();
    eq(P.srcEl.textContent, '96ms', 'sam czas, bez nazwy źródła');
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
