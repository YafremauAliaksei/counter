#!/usr/bin/env node
/**
 * build.js — sklejanie modułów src/ w jeden plik counter.js.
 *
 * ============================================================================
 * DLACZEGO WŁASNY SKRYPT, A NIE ROLLUP / ESBUILD
 * ============================================================================
 * Duże biblioteki używają bundlerów, bo potrzebują rzeczy, których my nie
 * potrzebujemy: kilku formatów wyjścia (ESM/CJS/UMD), tree-shakingu, map
 * źródeł, minifikacji, rozwiązywania zależności z node_modules.
 *
 * Nasz artefakt to userscript wklejany do konsoli DevTools. Wymagania są inne
 * i dużo prostsze:
 *   - dokładnie JEDEN plik, bez importów i bez zależności;
 *   - czytelny, bo ludzie do niego zaglądają;
 *   - powtarzalny co do bajtu, bo CI porównuje go z tym, co w repozytorium.
 *
 * To się mieści w stu linijkach bez ani jednego pakietu z npm — a więc build
 * działa też tam, gdzie npm install nie przejdzie (offline, zablokowany
 * rejestr, świeża maszyna).
 *
 * KONTRAKT jest ten sam, co u rollupa: `npm run build` -> counter.js.
 * Gdy kiedyś zajdzie potrzeba minifikacji albo kilku formatów, wymienia się
 * ten jeden plik, a reszta repozytorium tego nie zauważy.
 *
 * ============================================================================
 * CO ROBI
 * ============================================================================
 *   1. czyta build.manifest.json (kolejność modułów = karta projektu);
 *   2. skleja: banner + otwarcie IIFE + moduły + zamknięcie IIFE + stopka;
 *   3. przed każdym modułem wstawia znacznik `// ─── src/xx-nazwa.js ───`,
 *      żeby w gotowym pliku było widać, skąd pochodzi dany fragment
 *      (rollup w trybie nieminifikowanym robi dokładnie to samo);
 *   4. podstawia wersję z package.json w miejsce __VERSION__;
 *   5. sprawdza wynik: składnia, brak pozostałych znaczników, obecność
 *      rzeczy, bez których plik jest bezużyteczny.
 *
 * UŻYCIE
 *   node build.js            zbuduj i zapisz counter.js
 *   node build.js --check    zbuduj w pamięci i porównaj z counter.js
 *                            (kod wyjścia 1, jeśli się różnią) — to jest
 *                            bramka CI, która nie pozwala, żeby artefakt
 *                            rozjechał się ze źródłami
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MANIFEST = path.join(ROOT, 'build.manifest.json');
const PKG = path.join(ROOT, 'package.json');

const CHECK_ONLY = process.argv.includes('--check');

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** Każdy moduł kończy się dokładnie jednym znakiem nowej linii. */
function normalize(text) {
    return text.replace(/\r\n/g, '\n').replace(/\s*$/, '') + '\n';
}

function build() {
    const manifest = JSON.parse(read('build.manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const version = pkg.version;

    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`wersja w package.json ("${version}") nie jest w formacie SemVer`);
    }

    const parts = [];
    parts.push(normalize(read(manifest.banner)));
    parts.push('\n');
    parts.push(manifest.wrapper.open);

    for (const mod of manifest.modules) {
        if (!fs.existsSync(path.join(ROOT, mod.file))) {
            throw new Error(`moduł z manifestu nie istnieje: ${mod.file}`);
        }
        parts.push('\n');
        // Znacznik pochodzenia. Wcięcie cztery spacje, bo jesteśmy w IIFE.
        parts.push(`    // ─── ${mod.file} ───\n`);
        parts.push(normalize(read(mod.file)));
    }

    parts.push('\n');
    parts.push(manifest.wrapper.close);
    parts.push('\n');
    parts.push(normalize(read(manifest.footer)));

    let out = parts.join('');

    // --- podstawienie wersji ---
    const placeholders = (out.match(/__VERSION__/g) || []).length;
    if (placeholders === 0) {
        throw new Error('w źródłach nie ma ani jednego __VERSION__ — wersja nie zostałaby podstawiona');
    }
    out = out.split('__VERSION__').join(version);

    return { text: out, version, moduleCount: manifest.modules.length };
}

/**
 * Sprawdzenia po sklejeniu. Tanie, ale łapią całą klasę pomyłek: usunięty
 * moduł, literówka w manifeście, przypadkowe zjedzenie fragmentu przy edycji.
 */
function validate(text) {
    const problems = [];

    // 1. Składnia. new Function nie wykonuje kodu, tylko go parsuje.
    try {
        new Function(text);
    } catch (e) {
        problems.push('błąd składni w zbudowanym pliku: ' + e.message);
    }

    // 2. Nie został żaden znacznik do podstawienia.
    const left = text.match(/__[A-Z_]+__/g);
    if (left) problems.push('nie podstawione znaczniki: ' + [...new Set(left)].join(', '));

    // 3. Rzeczy, bez których plik jest bezużyteczny.
    const required = [
        ['const SETTINGS_ACCESS_PASSWORD', 'hasło dostępu do panelu'],
        ['const SCRIPT_LOGS_ENABLED', 'wyłącznik logów'],
        ['SCRIPT_ID_PREFIX', 'prefiks magazynu'],
        ['line7_compact', 'linia 7'],
        ['moduleEnabled', 'wyłącznik modułu cen'],
        ['window.SH =', 'konsolowe API'],
        ['Main.init()', 'uruchomienie'],
    ];
    for (const [needle, what] of required) {
        if (!text.includes(needle)) problems.push(`brak w artefakcie: ${what} ("${needle}")`);
    }

    // 4. Balans klamr IIFE — najprostsza ochrona przed ucięciem pliku.
    if (!text.includes("(function() {\n    'use strict';")) problems.push('brak otwarcia IIFE');
    if (!/\n\}\)\(\);\n/.test(text)) problems.push('brak zamknięcia IIFE');

    // 5. Moduł cen musi startować wyłączony — to obietnica złożona w README.
    if (!/moduleEnabled:\s*false/.test(text)) {
        problems.push('moduleEnabled nie jest domyślnie false — to zmiana zachowania sieciowego');
    }
    if (!/const SCRIPT_LOGS_ENABLED = false;/.test(text)) {
        problems.push('SCRIPT_LOGS_ENABLED nie jest domyślnie false');
    }

    return problems;
}

function main() {
    let built;
    try {
        built = build();
    } catch (e) {
        console.error('BŁĄD SKLEJANIA: ' + e.message);
        process.exit(1);
    }

    const problems = validate(built.text);
    if (problems.length) {
        console.error('BŁĄD WERYFIKACJI ARTEFAKTU:');
        problems.forEach(p => console.error('  - ' + p));
        process.exit(1);
    }

    const targetPath = path.join(ROOT, 'counter.js');
    const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;

    if (CHECK_ONLY) {
        if (current === null) {
            console.error('counter.js nie istnieje — uruchom "npm run build".');
            process.exit(1);
        }
        if (current !== built.text) {
            console.error('ARTEFAKT NIE ZGADZA SIĘ ZE ŹRÓDŁAMI.');
            console.error('counter.js różni się od tego, co daje sklejenie src/.');
            console.error('Uruchom "npm run build" i dołącz wynik do commita.');
            const a = current.split('\n'), b = built.text.split('\n');
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                if (a[i] !== b[i]) {
                    console.error(`  pierwsza różnica w linii ${i + 1}:`);
                    console.error(`    w repozytorium: ${JSON.stringify(a[i])}`);
                    console.error(`    ze sklejenia:   ${JSON.stringify(b[i])}`);
                    break;
                }
            }
            process.exit(1);
        }
        console.log(`counter.js zgadza się ze źródłami (v${built.version}, ${built.moduleCount} modułów).`);
        return;
    }

    fs.writeFileSync(targetPath, built.text, 'utf8');
    const kb = (Buffer.byteLength(built.text, 'utf8') / 1024).toFixed(1);
    const changed = current !== built.text;
    console.log(`counter.js zbudowany: v${built.version}, ${built.moduleCount} modułów, ${kb} KB` +
                (changed ? '' : ' (bez zmian)'));
}

main();
