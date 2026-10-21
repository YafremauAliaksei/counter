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
const { makeClock, STAND_TIME } = require('./dom-stub');

installOrphanGuard(process);

// Pora dnia jest częścią wyniku: początek zmiany, obiad i paczki doliczane
// sprzed pierwszego zadania zależą od godziny. Bez stałego zegara ten sam
// commit przechodzi o 15:00 i pada o 18:58, tuż po starcie nocnej zmiany.
// Zegar startuje od STAND_TIME i płynie dalej (timery działają); pliki,
// które potrzebują innej pory, stawiają własny makeClock. REAL_CLOCK=1
// przywraca prawdziwy czas — do sprawdzania, czy test jest od pory zależny.
if (!process.env.REAL_CLOCK) global.Date = makeClock(STAND_TIME).Date;

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

// Plik za plikiem: następny ładuje się dopiero, gdy rozstrzygną się testy
// asynchroniczne poprzedniego. Ciężki plik synchroniczny (macierz stanów)
// zajmuje proces na kilkanaście sekund — gdyby szedł w trakcie cudzych
// testów asynchronicznych, ich granica czasu minęłaby bez ich winy.
(async () => {
for (const f of files) {
    await settle();
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

// Podsumowanie czeka jawnie na testy asynchroniczne ostatniego pliku — bez
// stałej granicy czasu, która pominęłaby sprawdzenie wolniejsze od niej.
// Jedno obejście pętli zdarzeń po ostatnim teście: Node zgłasza odrzucenie
// bez właściciela dopiero po opróżnieniu kolejki mikrozadań.
await settle();
await new Promise(resolve => setImmediate(resolve));
summary();
})();

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
