/**
 * 36-perf.test.js — `SH.perf()`: czy to skrypt, czy komputer.
 *
 * PO CO TO POWSTAŁO. Usterka kosztu (każda paczka droższa od poprzedniej)
 * wyglądała na stanowisku jak wolny komputer: liczby były poprawne, tylko po
 * kilku godzinach wszystko się zacinało. Człowiek nie miał czym tego sprawdzić.
 * `SH.perf()` porównuje koszt przedmiotu z początku zmiany z kosztem ostatnich
 * przedmiotów i mówi wprost, co rośnie.
 *
 * Trzy własności:
 *   1. Cisza: liczniki zbierają się zawsze, ale nic nie wypisują ani nie
 *      wysyłają — odczyt wyłącznie na żądanie.
 *   2. Ocena rozróżnia usterkę skryptu (rośnie liczba operacji na przedmiot)
 *      od strony T-REX, która urosła (operacje stałe, dłuższy skan).
 *   3. Pamięć jest stała: migawek jest zawsze najwyżej 2 × (okno + 1),
 *      niezależnie od długości zmiany.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const CODES = ['CRITS-PRG2', 'WHD', 'AUDIT'];

function shift() {
    const env = bootOnStand();
    const body = env.sandbox.document.body;
    env.item = (i) => {
        const set = (t) => {
            Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });
            env.SH.AutoTrigger.scan();
        };
        set('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
        set(`Zeskanuj ${CODES[i % 3]}\nPrzypisz nowy`);
        set('');
    };
    env.items = (from, n) => { for (let i = from; i < from + n; i++) env.item(i); };
    env.SH.AutoTrigger.scan();            // pierwszy skan tylko fotografuje stronę
    return env;
}

/** Zegar skanu: każdy skan trwa `cost()` ms (start i koniec to dwa wywołania). */
function scanClock(env, cost) {
    let t = 0;
    let open = false;
    env.sandbox.performance.now = () => {
        if (!open) { open = true; return t; }
        open = false;
        t += cost();
        return t;
    };
}

describe('Cisza');

test('SH.perf() niczego nie wypisuje i nie wychodzi do sieci', () => {
    const env = shift();
    env.items(0, 5);
    const r = env.SH.perf();
    ok(r && typeof r === 'object', 'zwraca obiekt');
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
    eq(env.net.fetches, [], 'fetch');
});

describe('Liczniki');

test('zero przedmiotów: ocena mówi, ile brakuje, bez porównania okien', () => {
    const env = shift();
    const r = env.SH.perf();
    eq(r.przedmioty, 0);
    eq(r.ocena, 'za mało przedmiotów do porównania (jest 0, potrzeba 41)');
    eq('koszt przedmiotu: ostatnio' in r, false);
});

test('jeden skan: licznik +1, czas z performance.now()', () => {
    const env = shift();
    scanClock(env, () => 7);
    const before = env.SH.perf()['skany strony'];
    env.SH.AutoTrigger.scan();
    const r = env.SH.perf();
    eq(r['skany strony'], before + 1);
    eq(r['najdłuższy skan [ms]'], 7);
});

test('40 przedmiotów to za mało, 41 — porównanie jest', () => {
    // Granica okien: pierwsze 20 i ostatnie 20 przedmiotów muszą być rozłączne.
    const env = shift();
    env.items(0, 40);
    ok(/jest 40, potrzeba 41/.test(env.SH.perf().ocena), '40');
    env.item(40);
    const r = env.SH.perf();
    eq(r.przedmioty, 41);
    ok('koszt przedmiotu: początek zmiany' in r, 'okno początku');
    ok('koszt przedmiotu: ostatnio' in r, 'okno ostatnie');
});

describe('Ocena');

test('dwa zadania, 120 przedmiotów: koszt stały, koniec nie droższy od początku', () => {
    // Ten sam przebieg, który przy zagnieżdżaniu Proxy dawał wzrost wykładniczy.
    // Równości co do setnych nie ma: okno początku obejmuje założenie zadania,
    // a 20 przedmiotów to nie wielokrotność cyklu trzech kodów.
    const env = shift();
    scanClock(env, () => 1);
    env.items(0, 6);
    env.SH.TaskManager.create('Second', env.clock.now());
    env.items(6, 114);
    const r = env.SH.perf();
    eq(r.ocena, 'koszt stały');
    const early = r['koszt przedmiotu: początek zmiany'];
    const late = r['koszt przedmiotu: ostatnio'];
    for (const k of Object.keys(early)) ok(late[k] <= early[k], `${k}: ${late[k]} wobec ${early[k]}`);
});

test('rosnąca liczba operacji na przedmiot: usterka skryptu', () => {
    const env = shift();
    env.items(0, 21);
    // Każdy kolejny przedmiot dokłada przerysowanie — tak wygląda wzrost.
    let extra = 0;
    const W = env.SH.StatsWindowRenderer;
    const render = W.renderContent.bind(W);
    const orig = env.SH.AutoTrigger.scan.bind(env.SH.AutoTrigger);
    let scans = 0;
    env.SH.AutoTrigger.scan = () => {
        orig();
        if (++scans % 3 === 0) { extra++; for (let k = 0; k < extra; k++) render(); }
    };
    env.items(21, 30);
    ok(/^KOSZT ROŚNIE/.test(env.SH.perf().ocena), env.SH.perf().ocena);
});

test('operacje stałe, skan coraz dłuższy: urosła strona, nie skrypt', () => {
    const env = shift();
    let cost = 1;
    scanClock(env, () => cost);
    env.items(0, 21);
    cost = 20;
    env.items(21, 30);
    const r = env.SH.perf();
    ok(/urosła strona T-REX/.test(r.ocena), r.ocena);
});

test('wahanie w granicach progu nie jest wzrostem', () => {
    // Skan dwa razy dłuższy to jeszcze szum (inny kod, druga karta): próg to
    // 2 × początek + 2 ms.
    const env = shift();
    let cost = 1;
    scanClock(env, () => cost);
    env.items(0, 21);
    cost = 2;
    env.items(21, 30);
    eq(env.SH.perf().ocena, 'koszt stały');
});

describe('Pamięć');

test('300 przedmiotów: migawek tyle samo co przy 41', () => {
    const env = shift();
    env.items(0, 41);
    const P = env.SH.Perf;
    eq([P.first.length, P.last.length], [21, 21], 'przy 41');
    env.items(41, 259);
    eq([P.first.length, P.last.length], [21, 21], 'przy 300');
    eq(env.SH.perf().przedmioty, 300);
});
