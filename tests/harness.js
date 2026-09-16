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

function test(name, fn) {
    try {
        const r = fn();
        // Test może zwrócić obietnicę — wtedy błąd zgłosi się przy jej odrzuceniu.
        if (r && typeof r.then === 'function') {
            r.catch((e) => fail(name, e));
        }
        state.passed++;
        console.log('  ok   ' + name);
    } catch (e) {
        fail(name, e);
    }
}

function fail(name, e) {
    state.failed++;
    state.failures.push(`${state.file} / ${state.group} / ${name}: ${e.message}`);
    console.log('  FAIL ' + name + '\n       ' + e.message);
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

module.exports = { describe, test, eq, ok, notOk, throws, state };
