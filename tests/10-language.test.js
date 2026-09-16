/**
 * 10-language.test.js — jeden język w całym repozytorium.
 *
 * Zasada projektu: komentarze, logi i CAŁA dokumentacja są po polsku.
 * Plik 09 pilnuje tego wewnątrz artefaktu; ten pilnuje reszty repozytorium,
 * bo README albo szablon PR po rosyjsku jest dokładnie tak samo nieczytelny
 * dla polskojęzycznego zespołu jak rosyjski komentarz w kodzie.
 *
 * Wyjątki są WYMIENIONE Z NAZWY niżej i każdy ma powód:
 *
 *   - `src/02-i18n-strings.js` i jego ślad w `counter.js` — słownik `ru`,
 *     czyli tłumaczenie interfejsu dla rosyjskojęzycznych pracowników;
 *   - `видите ниже`, `канирование номера LP:` — fragmenty tekstu, które
 *     drukuje sam T-REX. To dane wejściowe wyzwalaczy, a nie nasz tekst:
 *     przetłumaczone przestaną pasować i licznik przestanie liczyć;
 *   - `Русский` — nazwa języka na liście wyboru, pokazywana użytkownikowi.
 *
 * Gdyby kiedyś doszedł angielski jako drugi język kodu, zmienia się ten plik —
 * świadomie i osobnym commitem, a nie przy okazji.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, test, eq, ok } = require('./harness');
const { ROOT } = require('./dom-stub');

const CYR = /[Ѐ-ӿ]/;

/** Pliki, w których cyrylica jest treścią produktu, a nie niedoróbką. */
const EXEMPT_FILES = new Set([
    'src/02-i18n-strings.js',   // słownik ru
    'counter.js',               // artefakt — pilnuje go 09-artifact.test.js
    'tests/09-artifact.test.js',// asercje cytują wyzwalacze
    'tests/10-language.test.js',// ten plik
]);

/** Dozwolone fragmenty: tekst T-REX i nazwa języka na liście wyboru. */
const ALLOWED = [
    'видите ниже',
    'канирование номера LP',
    'Русский',
];

/** Katalogi, do których nie zaglądamy. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.idea', '.vscode']);

/** Rozszerzenia plików tekstowych, które nas obchodzą. */
const TEXT_EXT = new Set(['.js', '.json', '.md', '.yml', '.yaml', '.html', '.css', '.txt']);

/** Wszystkie pliki tekstowe repozytorium, ścieżki względne, ukośnik w przód. */
function repoFiles(dir = ROOT, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { repoFiles(abs, out); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (!TEXT_EXT.has(ext) && e.name !== 'CODEOWNERS') continue;
        out.push(path.relative(ROOT, abs).split(path.sep).join('/'));
    }
    return out;
}

const FILES = repoFiles();

/** Linie z cyrylicą, po wycięciu dozwolonych fragmentów. */
function cyrillicLines(rel) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const bad = [];
    text.split(/\r?\n/).forEach((line, i) => {
        let stripped = line;
        for (const frag of ALLOWED) stripped = stripped.split(frag).join('');
        if (CYR.test(stripped)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 70)}`);
    });
    return bad;
}

/** Sprawdzenie wskazanej części repozytorium. */
function scan(filter) {
    const bad = [];
    for (const rel of FILES) {
        if (EXEMPT_FILES.has(rel)) continue;
        if (!filter(rel)) continue;
        bad.push(...cyrillicLines(rel));
    }
    return bad;
}

describe('Język dokumentacji i repozytorium');

test('repozytorium w ogóle się przeskanowało', () => {
    ok(FILES.length > 30, `znaleziono tylko ${FILES.length} plików — skan czegoś nie widzi`);
    ok(FILES.includes('README.md'), 'README.md musi być w wykazie');
});

test('pliki .md są po polsku', () => {
    eq(scan(f => f.endsWith('.md')), [], 'dokumentacja z cyrylicą');
});

test('pliki .github (workflow, szablony, CODEOWNERS) są po polsku', () => {
    eq(scan(f => f.startsWith('.github/')), [], 'oprzyrządowanie GitHuba z cyrylicą');
});

test('źródła w src/ są po polsku', () => {
    eq(scan(f => f.startsWith('src/')), [], 'źródła z cyrylicą poza słownikiem ru');
});

test('testy i stanowisko ręczne są po polsku', () => {
    eq(scan(f => f.startsWith('tests/')), [], 'testy z cyrylicą');
});

test('pliki w korzeniu repozytorium są po polsku', () => {
    eq(scan(f => !f.includes('/')), [], 'pliki korzenia z cyrylicą');
});

test('wyjątki nadal istnieją i nadal zawierają to, dla czego je zrobiono', () => {
    const i18n = fs.readFileSync(path.join(ROOT, 'src/02-i18n-strings.js'), 'utf8');
    ok(/\bru:\s*\{/.test(i18n), 'słownik ru musi zostać w src/02-i18n-strings.js');

    const config = fs.readFileSync(path.join(ROOT, 'src/01-config.js'), 'utf8');
    ok(config.includes('видите ниже'), 'wyzwalacz wstępny T-REX musi zostać');
    ok(config.includes('канирование номера LP'), 'wyzwalacz T-REX musi zostać');
    ok(config.includes("name: 'Русский'"), 'rosyjski musi zostać na liście języków');
});
