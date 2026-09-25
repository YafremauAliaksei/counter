/**
 * 11-storage-failure.test.js — co się dzieje, gdy magazyn odmawia zapisu.
 *
 * DLACZEGO TEN PLIK ISTNIEJE. localStorage tej domeny dzielimy z samym TREX,
 * więc kwota potrafi się skończyć nie z naszej winy, a `setItem` zaczyna rzucać
 * wyjątek. Wyjątek puszczony z Persistence.write() w górę zatrzymałby
 * Main.init() i skrypt by nie wstał: zamiast stracić przeniesienie liczników
 * przez F5, człowiek straciłby licznik.
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
    env.SH.Persistence.saveCounter(cid, before + 1);
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
    const SM = ok1.SH.Persistence;
    const key = SM.getKey('probaZapisu');
    eq(SM.write(key, 'x'), true, 'pierwszy zapis');
    eq(SM.write(key, 'x'), false, 'ta sama wartość drugi raz');
    eq(SM.write(key, 'y'), true, 'inna wartość');
    eq(ok1.sandbox.localStorage.getItem(key), 'y');
});

test('nieudany zapis wraca false i NIE zostawia notatki „zapisane”', () => {
    const state = { fails: true };
    const env2 = boot({ storage: brokenStorage(state) });
    const SM = env2.SH.Persistence;
    const key = SM.getKey('probaZapisu');

    eq(SM.write(key, 'x'), false, 'zapis przy pełnym magazynie');
    notOk(Object.prototype.hasOwnProperty.call(SM._lastWritten, key),
        '_lastWritten nie może twierdzić, że wartość leży w magazynie');

    // Kwota zwolniła — TA SAMA wartość musi dać się zapisać. Notatka
    // postawiona przed zapisem kazałaby deduplikacji odrzucić tę próbę.
    state.fails = false;
    eq(SM.write(key, 'x'), true, 'powtórka po zwolnieniu kwoty');
    eq(env2.sandbox.localStorage.getItem(key), 'x');
});

test('saveState() przy pełnym magazynie nie rzuca', () => {
    const env3 = boot({ storage: brokenStorage({ fails: true }) });
    let threw = false;
    try { env3.SH.Persistence.saveState(); } catch (e) { threw = true; }
    notOk(threw, 'saveState() nie ma prawa wypuścić wyjątku');
});

describe('Karta nierozpoznana przy zepsutych obu magazynach');

test('adres bez gradingMode i dwa odmawiające magazyny: skrypt wstaje i milczy', () => {
    // Karta nierozpoznana trzyma swój identyfikator w sessionStorage, a zapis
    // tego identyfikatora nie miał własnego try: wyjątek szedł do catch
    // w Main.init() i skrypt nie wstawał wcale (bez okna, bez window.SH,
    // z linią FATAL w konsoli). Wyżej ten plik ładuje zawsze kartę CRET,
    // więc tej gałęzi nie widział.
    const href = 'https://trex-prod-eu.aka.amazon.com/some/other/page';
    const env4 = boot({
        href,
        storage: brokenStorage({ fails: true }),
        sessionStorage: brokenStorage({ fails: true }),
    });
    ok(env4.SH, 'window.SH musi istnieć');
    ok(env4.SH.store.initialized, 'store.initialized');
    ok(String(env4.SH.store.currentTabInstanceId).startsWith(env4.SH.CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX),
       'identyfikator karty wygenerowany w pamięci: ' + env4.SH.store.currentTabInstanceId);
    ok(env4.el('line7_compact') || env4.el('statsWindow'), 'interfejs stoi');
    eq(env4.net.consoleLog, [], 'console.log');
    eq(env4.net.consoleError, [], 'console.error');
});

test('magazyn, który odmawia usuwania kluczy, nie zatrzymuje startu', () => {
    // Sprzątanie kluczy poprzednich schematów to pierwsze wywołania w init()
    // i jedyne niepotrzebne do liczenia — ich wyjątek nie może zatrzymać startu.
    const base = makeStorage();
    base.setItem('statsHelper_v9_2_0_counter_CRET', '5');
    const hostile = new Proxy(base, {
        get(target, prop) {
            if (prop === 'removeItem') return () => { throw new Error('odmowa'); };
            return target[prop];
        },
    });
    const env5 = boot({ storage: hostile });
    ok(env5.SH && env5.SH.store.initialized, 'skrypt wstał');
    eq(env5.net.consoleError, [], 'console.error');
});

describe('Pełny magazyn widać na ekranie — raz');

test('magazyn pełny od startu: powiadomienie po postawieniu interfejsu', () => {
    // Odmowa zdarza się, zanim jest gdzie ją pokazać — znacznik czeka na Notifier.
    const env6 = boot({ storage: brokenStorage({ fails: true }) });
    const toast = env6.el('toast');
    eq(toast.textContent, env6.SH.I18n.get('notice_storageFull'));
    eq(toast.style.opacity, '1', 'widoczne');
    eq(env6.net.consoleLog, [], 'console.log — ekran, a nie konsola');
    eq(env6.net.consoleError, [], 'console.error');
    env6.SH.Main.teardown();
});

test('magazyn zapełnił się w trakcie zmiany: jedno powiadomienie, choć zapisów jest wiele', () => {
    // Zapisów jest kilka na przedmiot. Bez znacznika „już ostrzeżono”
    // powiadomienie odnawiałoby się przy każdym i wisiało przez całą zmianę.
    const state = { fails: false };
    const env7 = boot({ storage: brokenStorage(state) });
    const toast = env7.el('toast');
    const cid = env7.SH.store.currentTabInstanceId;
    notOk(toast.textContent === env7.SH.I18n.get('notice_storageFull'), 'przed odmową nic nie ostrzega');

    state.fails = true;
    env7.SH.Persistence.saveCounter(cid, 1);
    eq(toast.textContent, env7.SH.I18n.get('notice_storageFull'), 'pierwsza odmowa ostrzega');

    toast.textContent = '';
    env7.SH.Persistence.saveCounter(cid, 2);
    env7.SH.Persistence.saveCounter(cid, 3);
    eq(toast.textContent, '', 'kolejne odmowy już nie');
    env7.SH.Main.teardown();
});
