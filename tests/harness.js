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

function test(name, fn) {
    // Nazwa pliku i grupy zapamiętywana jest W CHWILI URUCHOMIENIA testu:
    // obietnica rozstrzygnie się, gdy runner będzie już przy następnym pliku,
    // a komunikat o porażce ma wskazywać właściwe miejsce.
    const where = { file: state.file, group: state.group };
    let r;
    try {
        r = fn();
    } catch (e) {
        fail(name, e, where);
        return;
    }
    if (r && typeof r.then === 'function') {
        pending.push(r.then(
            () => pass(name),
            (e) => fail(name, e, where),
        ));
        return;
    }
    pass(name);
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

/** Porównanie przez JSON — wystarcza dla danych, jakie tu krążą. */
function eq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'oczekiwano ' + b + ', jest ' + a);
}

function ok(value, msg) {
    if (!value) throw new Error(msg || 'oczekiwano wartości prawdziwej');
}

function notOk(value, msg) {
    if (value) throw new Error(msg || 'oczekiwano wartości fałszywej');
}

function throws(fn, msg) {
    let threw = false;
    try {
        fn();
    } catch (e) {
        threw = true;
    }
    if (!threw) throw new Error(msg || 'oczekiwano wyjątku');
}

module.exports = { describe, test, eq, ok, notOk, throws, state, settle };
