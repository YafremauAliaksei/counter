/**
 * 11-storage-failure.test.js — co się dzieje, gdy magazyn odmawia zapisu.
 *
 * DLACZEGO TEN PLIK ISTNIEJE. localStorage tej domeny dzielimy z samym TREX,
 * więc kwota potrafi się skończyć nie z naszej winy, a `setItem` zaczyna rzucać
 * wyjątek. Do tej poprawki wyjątek szedł z StorageManager.write() w górę
 * nieprzechwycony, trafiał do catch w Main.init() i skrypt NIE WSTAWAŁ WCALE:
 * zamiast stracić przeniesienie liczników przez F5, człowiek tracił licznik.
 *
 * Testy niżej pilnują trzech rzeczy naraz: skrypt wstaje, liczy dalej w pamięci
 * i NADAL MILCZY (nieudany zapis to nie powód, żeby złamać obietnicę pustej
 * konsoli — Utils.error podlega wyłącznikowi logów).
 */

'use strict';

const { describe, test, eq, ok, notOk } = require('./harness');
const { boot, makeEnv } = require('./dom-stub');

/** Fabryka atrap magazynu — bierzemy ją z gotowego środowiska. */
const { makeStorage } = makeEnv();

/**
 * Magazyn, który odmawia zapisu. `fails` można przestawić w locie, żeby
 * odtworzyć scenariusz „kwota się skończyła, a potem zwolniła”.
 */
function brokenStorage(state) {
    const base = makeStorage();
    return new Proxy(base, {
        get(target, prop) {
            if (prop === 'setItem' && state.fails) {
                return () => {
                    const e = new Error('kwota wyczerpana');
                    e.name = 'QuotaExceededError';
                    throw e;
                };
            }
            return target[prop];
        },
    });
}

describe('Pełny magazyn nie zabija skryptu');

const dead = { fails: true };
const env = boot({ storage: brokenStorage(dead) });

test('skrypt wstaje, choć każdy zapis rzuca wyjątkiem', () => {
    ok(env.SH, 'window.SH musi istnieć');
    ok(env.SH.store.initialized, 'store.initialized');
});

test('okno statystyk jest na stronie', () => {
    ok(env.el('statsWindow') || env.el('line7_compact'), 'interfejs musi się postawić');
});

test('licznik liczy dalej w pamięci', () => {
    const cid = env.SH.store.currentTabInstanceId;
    const before = env.SH.store.tabCounters[cid] || 0;
    env.SH.StorageManager.saveCounter(cid, before + 1);
    env.SH.store.tabCounters[cid] = before + 1;
    eq(env.SH.store.tabCounters[cid], before + 1);
});

test('nieudany zapis nie łamie obietnicy cichej konsoli', () => {
    eq(env.net.consoleLog, [], 'console.log');
    eq(env.net.consoleError, [], 'console.error');
});

test('sieć nadal nietknięta — awaria magazynu nic tu nie zmienia', () => {
    eq(env.net.fetches, [], 'fetch');
    eq(env.net.images, [], 'obrazki');
});

describe('write() zgłasza wynik zapisu i nie kłamie pamięci');

test('udany zapis wraca true, powtórka tej samej wartości — false', () => {
    const ok1 = boot();
    const SM = ok1.SH.StorageManager;
    const key = SM.getKey('probaZapisu');
    eq(SM.write(key, 'x'), true, 'pierwszy zapis');
    eq(SM.write(key, 'x'), false, 'ta sama wartość drugi raz');
    eq(SM.write(key, 'y'), true, 'inna wartość');
    eq(ok1.sandbox.localStorage.getItem(key), 'y');
});

test('nieudany zapis wraca false i NIE zostawia notatki „zapisane”', () => {
    const state = { fails: true };
    const env2 = boot({ storage: brokenStorage(state) });
    const SM = env2.SH.StorageManager;
    const key = SM.getKey('probaZapisu');

    eq(SM.write(key, 'x'), false, 'zapis przy pełnym magazynie');
    notOk(Object.prototype.hasOwnProperty.call(SM._lastWritten, key),
        '_lastWritten nie może twierdzić, że wartość leży w magazynie');

    // Kwota zwolniła — TA SAMA wartość musi dać się zapisać.
    // To jest druga połowa poprawki: gdy notatka stała przed zapisem,
    // deduplikacja odrzucała tę próbę i wartość nie trafiała do magazynu nigdy.
    state.fails = false;
    eq(SM.write(key, 'x'), true, 'powtórka po zwolnieniu kwoty');
    eq(env2.sandbox.localStorage.getItem(key), 'x');
});

test('saveState() przy pełnym magazynie nie rzuca', () => {
    const env3 = boot({ storage: brokenStorage({ fails: true }) });
    let threw = false;
    try { env3.SH.StorageManager.saveState(); } catch (e) { threw = true; }
    notOk(threw, 'saveState() nie ma prawa wypuścić wyjątku');
});
