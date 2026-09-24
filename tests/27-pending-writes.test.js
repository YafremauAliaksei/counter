/**
 * 27-pending-writes.test.js — zapisy odłożone w czasie: zamknięcie karty i rozbiórka.
 *
 * Ustawienia zapisują się z opóźnieniem (debounce 1 s), skan strony też czeka
 * chwilę po zmianie DOM. Dwa momenty w życiu karty trafiają w to okno:
 *
 *   ZAMKNIĘCIE / F5 (pagehide). Zmiana ustawienia sprzed pół sekundy jeszcze
 *   nie leży w magazynie — pagehide musi ją dopisać, razem z archiwum
 *   dziennika, inaczej ostatnia poprawka ustawień ginie.
 *
 *   ROZBIÓRKA (SH.Main.teardown). Zalecany sposób wymiany wersji: zdjąć
 *   egzemplarz i wkleić nowy. Odłożone wywołania zdjętego egzemplarza żyją
 *   w domknięciach debounce — nie zgaszone nadpisałyby magazyn jego starym
 *   stanem, a skan dopisałby paczkę do klucza, który prowadzi już nowy
 *   egzemplarz.
 */

'use strict';

const { describe, test, eq } = require('./harness');
const { boot, makeEnv } = require('./dom-stub');

const { makeStorage } = makeEnv();

/** Czekanie dłuższe niż autozapis (1000 ms) — test asynchroniczny, runner czeka. */
const afterAutosave = () => new Promise(resolve => setTimeout(resolve, 1300));

describe('Zamknięcie karty dopisuje to, co czekało');

test('zmiana ustawienia sprzed chwili trafia do magazynu przy pagehide', () => {
    const storage = makeStorage();
    const env = boot({ storage });
    const key = env.SH.Persistence.getKey(env.SH.CONFIG.STORAGE_KEY_USER_CONFIG);
    env.SH.store.userConfig.language = 'en';          // autozapis za sekundę
    eq(JSON.parse(storage.getItem(key)).language === 'en', false, 'jeszcze nie zapisane');

    env.sandbox.window._emit('pagehide', {});
    eq(JSON.parse(storage.getItem(key)).language, 'en', 'zapisane od razu przy wyjściu ze strony');
    env.SH.Main.teardown();
});

describe('Zdjęty egzemplarz nie pisze po rozbiórce');

test('odłożony autozapis zdjętego egzemplarza nie nadpisuje magazynu', () => {
    const storage = makeStorage();
    const env = boot({ storage });
    const key = env.SH.Persistence.getKey(env.SH.CONFIG.STORAGE_KEY_USER_CONFIG);
    env.SH.store.userConfig.language = 'en';          // autozapis za sekundę
    env.SH.Main.teardown();

    // Nowy egzemplarz zdążył zapisać swoje — stary nie ma prawa go przykryć.
    storage.setItem(key, JSON.stringify({ language: 'ru', marker: 'nowy egzemplarz' }));
    return afterAutosave().then(() => {
        eq(JSON.parse(storage.getItem(key)).marker, 'nowy egzemplarz', 'magazyn nietknięty przez zdjęty egzemplarz');
    });
});

test('odłożony skan zdjętego egzemplarza nie dopisuje paczki', () => {
    const storage = makeStorage();
    const env = boot({ storage });
    const SH = env.SH;
    const cid = SH.store.currentTabInstanceId;
    const counterKey = SH.Persistence.getKey(SH.CONFIG.STORAGE_PREFIX_TAB_COUNTER + cid);
    const body = env.sandbox.document.body;
    const show = (t) => Object.defineProperty(body, 'innerText', { configurable: true, get: () => t });

    // Przedmiot w toku, a potem linia końcowa i zmiana DOM — skan czeka na debounce.
    show('poniżej — czy przedmiot zgadza się z tym, co widzisz?');
    SH.AutoTrigger.scan();
    show('Przypisz nowy');
    SH.AutoTrigger.debouncedScan();
    SH.Main.teardown();

    storage.setItem(counterKey, '100');                // stan prowadzony przez nowy egzemplarz
    return afterAutosave().then(() => {
        eq(storage.getItem(counterKey), '100', 'licznik nietknięty przez zdjęty egzemplarz');
    });
});

describe('Utils.debounce: cancel i flush');

test('flush wykonuje czekające wywołanie od razu, z ostatnimi argumentami i this', () => {
    const env = boot();
    const calls = [];
    const target = { name: 'cel' };
    const d = env.SH.Utils.debounce(function (x) { calls.push([this && this.name, x]); }, 10000);
    d.call(target, 1);
    d.call(target, 2);
    eq(calls, [], 'przed flush nic');
    d.flush();
    eq(calls, [['cel', 2]], 'raz, z ostatnimi argumentami');
    d.flush();
    eq(calls.length, 1, 'drugi flush bez czekającego wywołania nic nie robi');
    env.SH.Main.teardown();
});

test('cancel gasi czekające wywołanie, a flush po cancel nic nie robi', () => {
    const env = boot();
    let count = 0;
    const d = env.SH.Utils.debounce(() => { count++; }, 30);
    d();
    d.cancel();
    d.flush();
    eq(count, 0, 'po cancel i flush zero wywołań');
    d.cancel();                                         // cancel bez czekającego — bez wyjątku
    d();
    return new Promise(resolve => setTimeout(resolve, 80)).then(() => {
        eq(count, 1, 'po cancel debounce działa dalej normalnie');
        env.SH.Main.teardown();
    });
});

test('dopisanie do wspólnego dziennika czekające 400 ms idzie do magazynu przy pagehide', () => {
    // Własne wpisy karty, których sąsiad nie widział, dopisują się po 400 ms.
    // Zamknięcie karty w tym oknie nie może zgubić przedmiotu.
    const storage = makeStorage();
    const env = boot({ storage });
    const VL = env.SH.ValueLog;
    VL.entries = [{ id: 'CRET_a_b', asin: 'B000000001', price: 10, currency: 'EUR', dept: 'CRET', ts: 1, sign: 1, updated: 1 }];
    VL._scheduleWriteBack();
    eq(storage.getItem(VL.key()), null, 'jeszcze nie zapisane');
    env.sandbox.window._emit('pagehide', {});
    eq(JSON.parse(storage.getItem(VL.key())).entries.length, 1, 'wpis w magazynie od razu');
    env.SH.Main.teardown();
});
