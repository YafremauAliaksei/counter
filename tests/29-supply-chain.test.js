/**
 * 29-supply-chain.test.js — łańcuch dostaw: co wykonuje się w CI i w wydaniu.
 *
 * DLACZEGO TO MA ZNACZENIE AKURAT TU. Gałąź `release` to plik, który zakładka
 * pobiera i wykonuje na stronie T-REX z uprawnieniami zalogowanej osoby.
 * Przebieg wydania ma prawo zapisu do repozytorium. Kto przejmie którąkolwiek
 * akcję użytą w tym przebiegu, dostaje drogę do kodu, który wykonuje się
 * u wszystkich — z pominięciem przeglądu, testów i sumy kontrolnej.
 *
 * Dwie zasady, obie sprawdzane mechanicznie:
 *   1. każda akcja przypięta do commita (40 znaków SHA), z komentarzem wersji.
 *      Ruchomy tag (`@v3`) przestawia właściciel akcji albo ktoś, kto go
 *      przejmie — tak zadziałało tj-actions/changed-files w marcu 2025;
 *   2. token nie zostaje w .git/config po checkout (persist-credentials: false),
 *      więc kolejne kroki — w tym akcja obcego autora — nie mają go pod ręką.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, test, eq, ok } = require('./harness');

const DIR = path.join(__dirname, '..', '.github', 'workflows');
const FILES = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f));

describe('Akcje w przebiegach CI i wydania');

test('są przebiegi do sprawdzenia', () => {
    // Bez tego pusta lista plików zaliczyłaby wszystko niżej.
    ok(FILES.includes('ci.yml') && FILES.includes('release.yml'), 'pliki: ' + FILES.join(', '));
});

test('każda akcja przypięta do SHA commita, z wersją w komentarzu', () => {
    const bad = [];
    for (const f of FILES) {
        fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').forEach((line, i) => {
            const m = /^\s*-?\s*uses:\s*(\S+)(.*)$/.exec(line);
            if (!m || m[1].startsWith('./')) return;
            if (!/@[0-9a-f]{40}$/.test(m[1]) || !/#\s*v\d+(\.\d+)*\s*$/.test(m[2])) bad.push(`${f}:${i + 1} ${line.trim()}`);
        });
    }
    eq(bad, [], 'akcje nieprzypięte albo bez wersji w komentarzu');
});

test('każdy checkout bez zapamiętanego tokenu', () => {
    const bad = [];
    for (const f of FILES) {
        const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (!/uses:\s*actions\/checkout@/.test(line)) return;
            // Parametry kroku to kolejne wiersze głębiej wcięte niż samo `uses`.
            const indent = line.search(/\S/);
            const block = [];
            for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > indent); j++) {
                block.push(lines[j]);
            }
            if (!block.some(l => /persist-credentials:\s*false/.test(l))) bad.push(`${f}:${i + 1}`);
        });
    }
    eq(bad, [], 'checkout zostawiający token w .git/config');
});
