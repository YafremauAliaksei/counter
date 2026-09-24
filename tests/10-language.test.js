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

describe('Komentarze w kodzie bez historii wersji');

/**
 * Działa zawsze tylko bieżąca wersja, więc komentarz w kodzie mówi, co robi
 * kod i dlaczego — w czasie teraźniejszym, bez odniesień do wersji. Historia
 * zmian należy do CHANGELOG, dokumentacji i gita. 09-artifact pilnuje tego
 * w artefakcie; tutaj — w każdym pliku kodu repozytorium: źródła, testy,
 * narzędzia i workflow.
 *
 * Wyjątki: `@version` w nagłówku userscriptu (wersja tego pliku) i komentarz
 * przy akcji przypiętej do SHA (`uses: …@<sha> # v7.0.1` — wersja akcji,
 * którą podnosi Dependabot).
 */
const VERSION_IN_COMMENT = /\b[0-9]\.[0-9]{1,2}\.[0-9]\b/;
const AUDIT_IN_COMMENT = /\baudyt(u|em)?\s+[A-Z][0-9]/;

/** Komentarze pliku: [numer linii, tekst]. JS/HTML — `//`, `/* */`, `<!-- -->`; YAML — `#`. */
function commentsOf(rel) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/);
    const yaml = /\.ya?ml$/.test(rel);
    const out = [];
    let inBlock = false;
    lines.forEach((l, i) => {
        const t = l.trim();
        if (yaml) {
            if (/uses:\s*\S+@[0-9a-f]{40}\s+#/.test(l)) return;
            const m = /(^|\s)#(.*)$/.exec(l);
            if (m) out.push([i + 1, m[2]]);
            return;
        }
        if (inBlock) {
            out.push([i + 1, t]);
            if (t.includes('*/') || t.includes('-->')) inBlock = false;
        } else if (t.startsWith('/*') || t.startsWith('<!--')) {
            out.push([i + 1, t]);
            if (!t.includes('*/') && !t.includes('-->')) inBlock = true;
        } else if (t.startsWith('//')) {
            out.push([i + 1, t]);
        } else {
            const m = /\s\/\/\s(.*)$/.exec(l);
            if (m) out.push([i + 1, m[1]]);
        }
    });
    return out;
}

const CODE_FILES = FILES.filter(f => f !== 'counter.js'
    && (/\.(js|html)$/.test(f) || /^\.github\/.*\.ya?ml$/.test(f)));

test('pliki kodu w ogóle się przeskanowały', () => {
    for (const must of ['src/01-config.js', 'tests/harness.js', 'build.js', '.github/workflows/ci.yml']) {
        ok(CODE_FILES.includes(must), 'brak na liście: ' + must);
    }
});

test('w komentarzach kodu nie ma numerów wersji ani odsyłaczy do audytu', () => {
    const bad = [];
    for (const rel of CODE_FILES) {
        for (const [n, text] of commentsOf(rel)) {
            if (/@version\b/.test(text)) continue;
            if (VERSION_IN_COMMENT.test(text) || AUDIT_IN_COMMENT.test(text)) {
                bad.push(`${rel}:${n}: ${text.trim().slice(0, 80)}`);
            }
        }
    }
    eq(bad, [], 'historia zmian w komentarzach — przenieść do CHANGELOG');
});

test('strażnik łapie wersję w każdej z trzech postaci komentarza', () => {
    // Sprawdzenie samego wykrywacza: bez niego pusty wynik mógłby znaczyć
    // tylko tyle, że komentarzy w ogóle nie widać.
    const tmp = path.join(ROOT, 'tests', '.guard-probe.js');
    // Treść próbki składana z kawałków, żeby ten plik sam nie zawierał
    // komentarza z wersją w oczach strażnika.
    const v = ['1', '3', '3'].join('.');
    const probe = ['// w ' + v + ' było inaczej', 'const x = 1; ' + '//' + ' aud' + 'yt D7',
                   '/*', ' * od ' + v, ' */', ''].join('\n');
    fs.writeFileSync(tmp, probe);
    try {
        const found = commentsOf('tests/.guard-probe.js')
            .filter(([, t]) => VERSION_IN_COMMENT.test(t) || AUDIT_IN_COMMENT.test(t))
            .map(([n]) => n);
        eq(found, [1, 2, 4]);
    } finally {
        fs.unlinkSync(tmp);
    }
});
