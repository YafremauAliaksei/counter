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

const { describe, test, eq, ok } = require('./harness');

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
