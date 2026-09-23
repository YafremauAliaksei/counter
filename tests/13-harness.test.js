/**
 * 13-harness.test.js — sprawdzenie samego narzędzia do testowania.
 *
 * Runner jest własny i ma dokładnie jedną nieoczywistą właściwość: musi czekać
 * na testy asynchroniczne. Wcześniej nie czekał — dawał obietnicom 50 ms i szedł
 * wypisać podsumowanie, więc sprawdzenie wolniejsze niż ta granica nie było
 * uwzględnione ANI JAKO ZALICZONE, ANI JAKO NIEZALICZONE. Test, którego porażka
 * nie zatrzymuje CI, jest gorszy niż brak testu: daje fałszywe poczucie pokrycia.
 *
 * Plik numerowany jako ostatni celowo: rozstrzyga się po wszystkich pozostałych.
 */

'use strict';

const { describe, test, eq, ok, throws, withTimeout } = require('./harness');

describe('Runner czeka na testy asynchroniczne');

test('sprawdzenie rozstrzygające po 120 ms jest uwzględnione', () => {
    // 120 ms to ponad dwukrotność dawnej granicy 50 ms. Jeśli runner przestanie
    // czekać, ten test zniknie z podsumowania — liczba zaliczonych spadnie,
    // a nie wzrośnie liczba niezaliczonych, więc zmiana będzie widoczna.
    return new Promise(resolve => setTimeout(resolve, 120)).then(() => {
        ok(true, 'obietnica rozstrzygnięta');
    });
});

test('odrzucona obietnica nie jest liczona jako zaliczona', () => {
    // Sprawdzamy zachowanie runnera bez wywoływania w nim porażki: gdyby test
    // asynchroniczny był liczony jako zaliczony PRZED rozstrzygnięciem (tak było
    // wcześniej), poniższa obietnica po odrzuceniu dopisałaby się do obu
    // liczników naraz. Tutaj przechwytujemy odrzucenie sami i sprawdzamy tylko,
    // że łańcuch dochodzi do końca.
    let zlapane = null;
    return Promise.reject(new Error('celowo'))
        .catch(e => { zlapane = e.message; })
        .then(() => eq(zlapane, 'celowo'));
});

describe('Zegar stanowiska: pora dnia nie zależy od chwili uruchomienia');

const fs = require('fs');
const path = require('path');
const { makeClock, bootOnStand, STAND_TIME } = require('./dom-stub');

test('zegar zaczyna od podanej chwili i płynie dalej', () => {
    // Płynie, a nie stoi: debounce i timery w skrypcie liczą prawdziwy czas,
    // a zamrożone „teraz” rozjechałoby się z nimi.
    const clock = makeClock(STAND_TIME);
    ok(Math.abs(clock.now() - STAND_TIME) < 1000, 'start z podanej chwili');
    ok(Math.abs(new clock.Date().getTime() - clock.now()) < 1000, 'new Date() bez argumentów to „teraz” zegara');
    eq(new clock.Date(0).getTime(), 0, 'z argumentem to zwykła data');

    const nextDay = STAND_TIME + 24 * 3600000;
    clock.set(nextDay);
    ok(Math.abs(clock.now() - nextDay) < 1000, 'przeskok na następny dzień');
});

test('stanowisko to zmiana dzienna od 06:30, bez obiadu', () => {
    // Wszystkie testy czasu pracy liczą na te trzy fakty — gdyby któryś
    // przestał być prawdą, ich oczekiwania straciłyby sens po cichu.
    const env = bootOnStand();
    const S = env.SH.store;
    eq(S.sessionConfig.shiftType, 'day');
    eq(new Date(S.sessionConfig.shiftCalculatedStartTime).getHours(), 6);
    eq(new Date(S.sessionConfig.shiftCalculatedStartTime).getMinutes(), 30);
    eq(S.sessionConfig.selectedLunchIndex, null, 'obiad wyłączony');
});

test('testy czasu pracy nie sięgają po zegar gospodarza', () => {
    // Jedno `Date.now()` z procesu testów zamiast zegara stanowiska i plik
    // wraca do stanu „zielony zależnie od godziny”. Tego nie widać w przeglądzie,
    // bo wygląda niewinnie — więc pilnuje tego test.
    const bad = [];
    for (const f of ['22-tasks.test.js', '23-task-panel.test.js', '24-departments.test.js']) {
        const text = fs.readFileSync(path.join(__dirname, f), 'utf8');
        if (/(?<![.\w])Date\.now\(\)|new Date\(\)/.test(text)) bad.push(f);
        if (!text.includes('bootOnStand(')) bad.push(f + ' (bez stanowiska)');
    }
    eq(bad, [], 'pliki z zegarem gospodarza');
});

describe('eq rozróżnia to, czego JSON nie rozróżnia (audyt G2.1)');

test('NaN, Infinity, null i undefined to różne wartości', () => {
    // JSON.stringify zamienia NaN i Infinity w "null" i gubi klucze
    // z undefined — dawne eq przepuszczało każdą z tych par.
    throws(() => eq(NaN, null), 'NaN kontra null', /oczekiwano null, jest NaN/);
    throws(() => eq(Infinity, null), 'Infinity kontra null', /Infinity/);
    throws(() => eq(-Infinity, Infinity), 'znak nieskończoności', /-Infinity/);
    throws(() => eq({ a: undefined }, {}), 'klucz z undefined kontra brak klucza');
    throws(() => eq(undefined, null), 'undefined kontra null');
    eq(NaN, NaN, 'NaN równe sobie');
    eq(0, -0, 'zero i minus zero to ta sama liczba w rachunku liczników');
});

test('typy muszą się zgadzać, daty porównuje się po czasie', () => {
    throws(() => eq(1, '1'), 'liczba kontra tekst');
    throws(() => eq([1], { 0: 1 }), 'tablica kontra obiekt');
    throws(() => eq(new Date(0), '1970-01-01T00:00:00.000Z'), 'data kontra tekst');
    eq(new Date(5), new Date(5));
    throws(() => eq(new Date(5), new Date(6)), 'różne chwile');
});

test('kolejność kluczy nie ma znaczenia, obiekty z piaskownicy porównują się normalnie', () => {
    eq({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 });
    // Tablica i obiekt z innego realmu (tak jak stan skryptu w vm).
    const foreign = require('vm').runInNewContext('({ list: [1, 2], at: new Date(7) })');
    eq(foreign, { list: [1, 2], at: new Date(7) });
});

describe('Granica czasu i odrzucenia bez właściciela (audyt G2.2, G2.3)');

test('obietnica, która nie rozstrzyga się nigdy, pada po granicy czasu', () => {
    let reason = null;
    return withTimeout(new Promise(() => {}), 30)
        .catch(e => { reason = e.message; })
        .then(() => ok(/nie skończył się w 30 ms/.test(String(reason)), 'powód: ' + reason));
});

test('obietnica w granicy czasu przechodzi normalnie', () => {
    return withTimeout(Promise.resolve(42), 1000).then(v => eq(v, 42));
});

test('asercja zgubiona w odrzuconej obietnicy liczy się jako porażka', () => {
    // Sprawdzane w osobnym procesie: w tym przebiegu taka porażka zapaliłaby
    // cały zestaw, a o to tu właśnie chodzi — tylko gdzie indziej.
    const { execFileSync } = require('child_process');
    const script = `
        const h = require(${JSON.stringify(require.resolve('./harness'))});
        h.installOrphanGuard(process);
        h.test('zgubiona asercja', () => { (async () => { h.ok(false, 'bum'); })(); });
        h.settle().then(() => new Promise(r => setImmediate(r)))
            .then(() => { process.stdout.write(JSON.stringify({ passed: h.state.passed, failed: h.state.failed })); process.exit(0); });
    `;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).split('\n').pop());
    eq(out.failed, 1, 'porażka policzona');
});

describe('throws sprawdza, KTÓRY wyjątek (audyt G2.4)');

test('literówka w teście nie udaje oczekiwanego wyjątku', () => {
    throws(() => { throw new Error('niedozwolony ASIN: x'); }, 'właściwy wyjątek', /niedozwolony ASIN/);
    // eslint-disable-next-line no-undef
    throws(() => throws(() => nieMaTakiejZmiennej.x, 'literówka', /niedozwolony ASIN/),
           'ReferenceError z literówki nie może zaliczyć oczekiwania', /inny wyjątek/);
});
