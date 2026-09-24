#!/usr/bin/env node
/**
 * run.js — uruchamia wszystkie pliki *.test.js z tego katalogu.
 *
 * Kolejność jest alfabetyczna i to celowe: pliki mają numerowane przedrostki,
 * więc raport czyta się jak listę, a nie jak losowy zrzut. Każdy plik buduje
 * sobie WŁASNE środowisko (patrz dom-stub.boot), więc kolejność nie wpływa na
 * wynik — numeracja jest wyłącznie dla czytelności.
 *
 *   node tests/run.js              wszystko
 *   node tests/run.js line7        tylko pliki, których nazwa zawiera "line7"
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { state, settle, installOrphanGuard } = require('./harness');

installOrphanGuard(process);

const DIR = __dirname;
const filter = process.argv[2] || '';

const files = fs
    .readdirSync(DIR)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => !filter || f.includes(filter))
    .sort();

if (!files.length) {
    console.error(filter ? `Nie znaleziono testów pasujących do "${filter}".` : 'Nie znaleziono żadnych testów.');
    process.exit(1);
}

const started = Date.now();

for (const f of files) {
    state.file = f;
    console.log('\n╔' + '═'.repeat(68));
    console.log('║ ' + f);
    console.log('╚' + '═'.repeat(68));
    try {
        require(path.join(DIR, f));
    } catch (e) {
        state.failed++;
        state.failures.push(`${f}: plik testowy wywalił się w trakcie ładowania — ${e.message}`);
        console.log('  FAIL (cały plik) ' + e.message);
        if (process.env.VERBOSE) console.log(e.stack);
    }
}

// Testy asynchroniczne rozstrzygają się po przejściu przez wszystkie pliki,
// więc podsumowanie czeka na nie jawnie — bez stałej granicy czasu, która
// pominęłaby sprawdzenie wolniejsze od niej.
// Jedno obejście pętli zdarzeń po ostatnim teście: Node zgłasza odrzucenie
// bez właściciela dopiero po opróżnieniu kolejki mikrozadań.
settle().then(() => new Promise(resolve => setImmediate(resolve))).then(summary);

function summary() {
    const ms = Date.now() - started;
    console.log('\n' + '─'.repeat(70));
    console.log(`Plików: ${files.length}   Zaliczone: ${state.passed}   Niezaliczone: ${state.failed}   (${ms} ms)`);

    if (state.failed) {
        console.log('\nNIEZALICZONE:');
        state.failures.forEach(f => console.log('  - ' + f));
        console.log('');
        process.exit(1);
    }

    console.log('Wszystko w porządku.');
    // counter.js trzyma własny setInterval (odświeżanie okna raz na sekundę),
    // więc bez jawnego wyjścia proces node żyłby w nieskończoność.
    process.exit(0);
}
