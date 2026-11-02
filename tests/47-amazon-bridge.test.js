/**
 * 47-amazon-bridge.test.js — most do karty amazon.de, strona T-REX.
 *
 * CZEGO TU PILNUJEMY. Cena przychodzi z sąsiedniej karty amazon.de przez
 * postMessage; karta T-REX nie wysyła niczego na zewnątrz. Most przyjmuje
 * wiadomość tylko ze znanego adresu i znanego okna, liczby sprawdza jeszcze
 * raz (skończone, dodatnie, poniżej limitu), a zapytanie bez połączonej karty
 * kończy się powodem w karcie ceny, a nie milczeniem. Rozbiór strony produktu
 * (DOMParser, selektory) i pełny przebieg dwóch kart sprawdza stanowisko:
 * tests/stand/specs/09-amazon-bridge.spec.js.
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const AMZ = 'https://www.amazon.de';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Karta T-REX z włączonym modułem cen i udawanym oknem amazon.de. */
function bridgeEnv() {
    const env = bootOnStand();
    const B = env.SH.AmazonBridge;
    const sent = [];
    const fake = { closed: false, postMessage: (msg, origin) => sent.push({ msg, origin }) };
    const msg = (data, source = fake, origin = AMZ) => env.sandbox.window._emit('message', { data, source, origin });
    return { env, B, sent, fake, msg };
}

describe('Połączenie');

test('domyślne źródło ceny to karta amazon.de; bez połączenia — nie połączona', () => {
    const { env, B } = bridgeEnv();
    eq(env.SH.store.localTabConfig.priceCard.source, 'amazon');
    notOk(B.connected());
});

test('sygnał gotowości tylko ze znanego adresu; okno przyjęte z sygnału', () => {
    const { B, fake, msg } = bridgeEnv();
    msg({ type: 'sh-amazon-ready' }, fake, 'https://evil.example');
    notOk(B.connected(), 'obcy adres');
    msg({ type: 'sh-amazon-ready' }, fake, 'https://www.amazon.com');
    notOk(B.connected(), 'inny sklep');
    msg({ type: 'sh-amazon-ready' });
    ok(B.connected());
    eq(B.win, fake);
});

test('cisza dłuższa niż AMAZON_STALE_MS to rozłączenie; zamknięte okno też', () => {
    const { env, B, fake, msg } = bridgeEnv();
    msg({ type: 'sh-amazon-ready' });
    env.clock.set(env.clock.now() + env.SH.CONFIG.AMAZON_STALE_MS + 1);
    notOk(B.connected(), 'po ciszy');
    msg({ type: 'sh-amazon-ready' });
    ok(B.connected(), 'następny sygnał przywraca');
    fake.closed = true;
    notOk(B.connected(), 'okno zamknięte');
});

describe('Zapytanie o cenę');

test('ASIN idzie do okna amazon.de na jego adres; odpowiedź rozwiązuje zapytanie', async () => {
    const { B, sent, msg } = bridgeEnv();
    msg({ type: 'sh-amazon-ready' });
    const p = B.request('B0TESTPRC1');
    eq(sent.length, 1);
    eq(sent[0].origin, AMZ, 'tylko na znany adres');
    eq(sent[0].msg.type, 'sh-amazon-asin');
    eq(sent[0].msg.asin, 'B0TESTPRC1');
    msg({ type: 'sh-amazon-price', id: sent[0].msg.id, current: 1299.99, rrp: 1499 });
    eq(await p, { current: 1299.99, rrp: 1499, error: null });
});

test('odpowiedź z obcego okna albo adresu, z innym id — pomijana', async () => {
    const { B, sent, msg } = bridgeEnv();
    msg({ type: 'sh-amazon-ready' });
    let done = null;
    B.request('B0TESTPRC1').then(v => { done = v; });
    const id = sent[0].msg.id;
    msg({ type: 'sh-amazon-price', id, current: 1 }, { closed: false, postMessage() {} });
    msg({ type: 'sh-amazon-price', id, current: 1 }, undefined, 'https://evil.example');
    msg({ type: 'sh-amazon-price', id: id + 1, current: 1 });
    await wait(5);
    eq(done, null, 'nic z tego nie rozwiązało zapytania');
    msg({ type: 'sh-amazon-price', id, current: 5 });
    await wait(5);
    eq(done.current, 5);
});

test('liczby od karty sprawdzane jeszcze raz: tekst, NaN, ujemne, zero, za duże — null; grosze zaokrąglone', async () => {
    const { env, B, sent, msg } = bridgeEnv();
    msg({ type: 'sh-amazon-ready' });
    const max = env.SH.CONFIG.AMAZON_MAX_PRICE_EUR;
    const cases = [['12.5', null], [NaN, null], [-3, null], [0, null], [max, null], [Infinity, null],
                   [0.01, 0.01], [max - 1, max - 1], [12.345, 12.35], [null, null]];
    for (const [v, want] of cases) {
        const p = B.request('B0TESTPRC1');
        msg({ type: 'sh-amazon-price', id: sent[sent.length - 1].msg.id, current: v, rrp: v });
        const r = await p;
        eq(r.current, want, 'current = ' + String(v));
        eq(r.rrp, want, 'rrp = ' + String(v));
    }
});

test('bez połączenia zapytanie odrzucone od razu; limit czasu przerywa czekanie', async () => {
    const { B, sent, msg } = bridgeEnv();
    let err = null;
    await B.request('B0TESTPRC1').catch(e => { err = e; });
    ok(/niepodłączona/.test(err && err.message), String(err));
    eq(sent.length, 0, 'nic nie wysłane');
    msg({ type: 'sh-amazon-ready' });
    const ctl = new AbortController();
    const p = B.request('B0TESTPRC1', ctl.signal).catch(e => e);
    ctl.abort();
    ok(/czas/.test((await p).message));
    eq(B.pending.size, 0, 'zapytanie zdjęte z listy');
});

test('rozbiórka skryptu odrzuca czekające zapytania i zdejmuje słuchacza', async () => {
    const { env, B, msg } = bridgeEnv();
    msg({ type: 'sh-amazon-ready' });
    const p = B.request('B0TESTPRC1').catch(e => e);
    env.SH.Main.teardown();
    ok(/zdjęty/.test((await p).message));
});

describe('Karta ceny z mostem');

test('cena z karty amazon.de trafia na kartę w euro; karta T-REX nie wysyła niczego', async () => {
    const { env, sent, msg } = bridgeEnv();
    env.SH.store.localTabConfig.priceCard.moduleEnabled = true;
    msg({ type: 'sh-amazon-ready' });
    const P = env.SH.PriceCard;
    const p = P.resolve('B0TESTPRC1');
    await wait(5);
    msg({ type: 'sh-amazon-price', id: sent[0].msg.id, current: 49.9, rrp: 59 });
    const r = await p;
    eq(r.status, 'ok');
    eq(r.source, 'amazon.de');
    eq(r.current.value, 49.9);
    eq(r.current.currency, 'EUR');
    eq(r.rrp.value, 59);
    eq(env.net.fetches, [], 'zero zapytań z karty T-REX');
    eq(env.net.images, [], 'zero obrazków');
});

test('bez połączonej karty: powód „otwórz z panelu”, zero sieci', async () => {
    const { env } = bridgeEnv();
    env.SH.store.localTabConfig.priceCard.moduleEnabled = true;
    const r = await env.SH.PriceCard.resolve('B0TESTPRC1');
    eq(r.status, 'fail');
    eq(r.reason, env.SH.I18n.get('amazon_notConnected'));
    eq(env.net.fetches, []);
});

test('karta odpowiada „na stronie nie ma ceny” — karta ceny bez ceny, bez wyjątku', async () => {
    const { env, sent, msg } = bridgeEnv();
    env.SH.store.localTabConfig.priceCard.moduleEnabled = true;
    msg({ type: 'sh-amazon-ready' });
    const p = env.SH.PriceCard.resolve('B0TESTPRC1');
    await wait(5);
    msg({ type: 'sh-amazon-price', id: sent[0].msg.id, current: null, rrp: null, error: 'na stronie nie ma ceny' });
    const r = await p;
    eq(r.status, 'fail');
});

describe('Kwota z tekstu ceny (algorytm działu PS)');

test('separatory tysięcy i groszy w obu zapisach; śmieci — null', () => {
    const { B } = bridgeEnv();
    for (const [txt, want] of [['1.299,00 €', 1299], ['1,299.00', 1299], ['12,99€', 12.99], ['1.299', 1299],
                               ['999,99', 999.99], ['1.000,00', 1000], ['0,99', 0.99], ['EUR 2.991,39', 2991.39],
                               ['0,00', null], ['', null], [null, null], ['abc', null], ['€', null]]) {
        eq(B.amount(txt), want, JSON.stringify(txt));
    }
});

describe('Panel');

test('panel: przycisk otwarcia amazon.de, bez wyboru sklepu i bez dawnych źródeł', () => {
    const { env, msg } = bridgeEnv();
    const SP = env.SH.SettingsPanel;
    env.SH.store.localTabConfig.priceCard.moduleEnabled = true;
    if (!env.SH.store.uiFlags.isSettingsPanelVisible) SP.toggle();
    SP.render();
    const txt = SP.el.textContent;
    ok(txt.includes(env.SH.I18n.get('amazon_open')));
    for (const gone of ['priceCard_src_ocr', 'priceCard_src_jina', 'priceCard_fallback'])
        notOk(txt.includes(env.SH.I18n.get(gone)), gone);
    msg({ type: 'sh-amazon-ready' });
    SP.render();
    ok(SP.el.textContent.includes(env.SH.I18n.get('amazon_connected')), 'po połączeniu napis się zmienia');
});

describe('Karta ceny nad oknem statystyk');

test('przyklejona do dołu karta stoi nad oknem statystyk; okno przeciągnięte — karta przy dole', () => {
    // Okno statystyk stoi przy samym dole ekranu, karta ceny też trzyma się
    // dołu — bez podniesienia przykryłaby linię 7.
    const { env } = bridgeEnv();
    const S = env.SH.store;
    S.localTabConfig.priceCard.moduleEnabled = true;
    env.SH.StatsWindowRenderer.el.offsetHeight = 60;
    env.SH.PriceCard.applyStyle();
    eq(env.SH.PriceCard.el.style.bottom, '64px');
    S.localTabConfig.statsWindowPosition = { top: '100px', left: '20px', bottom: '' };
    eq(env.SH.PriceCard.el.style.bottom, '4px', 'okno przeciągnięte w górę — karta zostaje przy dole');
    S.localTabConfig.statsWindowPosition = { top: '', left: '20px', bottom: '0px' };
    env.SH.StatsWindowRenderer.el.offsetHeight = 120;
    S.localTabConfig.linesConfig.line8_taskInfo.visible = true;
    eq(env.SH.PriceCard.el.style.bottom, '124px', 'zmiana linii przesuwa kartę razem z oknem');
});
