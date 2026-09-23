/**
 * harness.js — minimalny runner testów.
 *
 * Dlaczego własny, a nie jest/vitest/node:test:
 *   - zero zależności, więc `npm test` działa na świeżej maszynie bez
 *     `npm install`, offline i w każdym CI;
 *   - testy tego projektu są w większości integracyjne (uruchom cały skrypt
 *     w atrapie DOM i sprawdź, co zrobił), a do tego wystarczy `describe`,
 *     `test` i kilka asercji.
 *
 * Gdy zestaw urośnie na tyle, że zabraknie równoległości albo raportów,
 * podmiana na `node:test` to przepisanie tego jednego pliku — same testy
 * używają tylko czterech funkcji poniżej.
 */

'use strict';

const state = {
    passed: 0,
    failed: 0,
    failures: [],
    group: '(bez grupy)',
    file: '',
};

function describe(name) {
    state.group = name;
    console.log('\n=== ' + name + ' ===');
}

/**
 * Testy asynchroniczne, na które runner CZEKA.
 *
 * Wcześniej test zwracający obietnicę był od razu liczony jako zaliczony,
 * a jego ewentualna porażka dopisywała się później — czyli test padający
 * trafiał do OBU liczników naraz. Runner nie czekał przy tym na nic: dawał
 * obietnicom 50 ms i wypisywał podsumowanie, więc sprawdzenie wolniejsze niż
 * ta granica nie było uwzględnione wcale, a jego porażka nie zatrzymywała CI.
 *
 * Teraz obietnica trafia tutaj, a run.js czeka na wszystkie przed
 * podsumowaniem. Wynik ogłasza się dopiero po rozstrzygnięciu.
 */
const pending = [];

/**
 * Górna granica czasu testu asynchronicznego (1.3.3, audyt G2.2).
 *
 * Obietnica, która nie rozstrzyga się nigdy, wieszała cały przebieg: runner
 * czekał bez końca, bez podsumowania i bez jednej linii — w CI do ogólnego
 * limitu zadania. Teraz taki test po prostu pada z nazwą.
 */
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS) || 10000;

/** Obietnica z granicą czasu — wystawiona, żeby dało się ją sprawdzić metatestem. */
function withTimeout(promise, ms) {
    let timer;
    const limit = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`test nie skończył się w ${ms} ms`)), ms);
    });
    return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function test(name, fn) {
    // Nazwa pliku i grupy zapamiętywana jest W CHWILI URUCHOMIENIA testu:
    // obietnica rozstrzygnie się, gdy runner będzie już przy następnym pliku,
    // a komunikat o porażce ma wskazywać właściwe miejsce.
    const where = { file: state.file, group: state.group };
    state.current = where;
    let r;
    try {
        r = fn();
    } catch (e) {
        fail(name, e, where);
        return;
    }
    if (r && typeof r.then === 'function') {
        pending.push(withTimeout(r, TIMEOUT_MS).then(
            () => pass(name),
            (e) => fail(name, e, where),
        ));
        return;
    }
    pass(name);
}

/**
 * Odrzucenie bez właściciela to porażka, a nie cisza (1.3.3, audyt G2.3).
 *
 * Test z asynchronicznym środkiem bez `return` — `() => { (async () => {
 * ok(false); })(); }` — zwracał undefined, więc liczył się jako zaliczony od
 * razu, a jego asercja ginęła w odrzuconej obietnicy, której nikt nie słuchał.
 * process.exit(0) na końcu przebiegu nie zostawiał nawet ostrzeżenia Node.
 * Runner instaluje ten strażnik przed pierwszym plikiem.
 */
function installOrphanGuard(proc) {
    proc.on('unhandledRejection', (e) => {
        const where = state.current || { file: state.file, group: state.group };
        fail('(odrzucenie bez właściciela — test asynchroniczny bez return?)',
             e instanceof Error ? e : new Error(String(e)), where);
    });
}

function pass(name) {
    state.passed++;
    console.log('  ok   ' + name);
}

function fail(name, e, where) {
    const w = where || { file: state.file, group: state.group };
    state.failed++;
    state.failures.push(`${w.file} / ${w.group} / ${name}: ${e.message}`);
    console.log('  FAIL ' + name + '\n       ' + e.message);
}

/** Runner woła to przed podsumowaniem: czeka na wszystkie testy asynchroniczne. */
function settle() {
    return Promise.all(pending.splice(0)).then(() => undefined);
}

/**
 * Równość STRUKTURALNA (1.3.3, audyt G2.1).
 *
 * Do tej pory eq porównywało wyniki JSON.stringify — a JSON nie odróżnia
 * NaN, Infinity i null (wszystkie to "null"), gubi klucze z wartością
 * undefined i zamienia datę w tekst. Granice, których projekt wymaga wprost
 * (NaN, Infinity, null, undefined — „wszystko to przychodzi z localStorage”),
 * były więc niewyrażalne jego własnym narzędziem: eq(NaN, null) przechodziło.
 *
 * Teraz: wartości proste przez ===, z NaN równym tylko NaN; typy muszą się
 * zgadzać; obiekty i tablice rekurencyjnie, z tym samym zestawem kluczy
 * (klucz z undefined to nie brak klucza); daty po czasie. Obiekty
 * z piaskownicy `vm` mają konstruktory innego realmu — dlatego rodzaj
 * sprawdza się przez Object.prototype.toString, a nie instanceof.
 */
const kind = (v) => Object.prototype.toString.call(v);

function same(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (kind(a) !== kind(b)) return false;
    if (kind(a) === '[object Date]') return a.getTime() === b.getTime();
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
}

/** Zapis wartości do komunikatu — NaN, Infinity i undefined widać, a nie „null”. */
function show(v) {
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return 'function ' + (v.name || '(anonimowa)');
    if (kind(v) === '[object Date]') return 'Date(' + (Number.isNaN(v.getTime()) ? 'Invalid' : v.toISOString()) + ')';
    if (v !== null && typeof v === 'object') {
        const inner = Array.isArray(v)
            ? v.map(show).join(',')
            : Object.keys(v).map(k => JSON.stringify(k) + ':' + show(v[k])).join(',');
        return Array.isArray(v) ? '[' + inner + ']' : '{' + inner + '}';
    }
    return JSON.stringify(v);
}

function eq(actual, expected, msg) {
    if (!same(actual, expected)) {
        throw new Error((msg ? msg + ': ' : '') + 'oczekiwano ' + show(expected) + ', jest ' + show(actual));
    }
}

function ok(value, msg) {
    if (!value) throw new Error(msg || 'oczekiwano wartości prawdziwej');
}

function notOk(value, msg) {
    if (value) throw new Error(msg || 'oczekiwano wartości fałszywej');
}

/**
 * Oczekiwany wyjątek. `expected` (opcjonalne, 1.3.3, audyt G2.4) to wyrażenie
 * regularne na treść komunikatu: bez niego throws(() => nieMaTakiejZmiennej.x)
 * przechodziło, bo ReferenceError z literówki to też wyjątek.
 */
function throws(fn, msg, expected) {
    let error = null;
    try {
        fn();
    } catch (e) {
        error = e;
    }
    if (!error) throw new Error(msg || 'oczekiwano wyjątku');
    if (expected && !expected.test(String(error && error.message))) {
        throw new Error((msg ? msg + ': ' : '') + 'inny wyjątek niż oczekiwany — ' + String(error && error.message));
    }
}

module.exports = { describe, test, eq, ok, notOk, throws, state, settle, withTimeout, installOrphanGuard, same };
