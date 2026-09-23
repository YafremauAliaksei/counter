/**
 * 25-flow-docs.test.js — diagramy przepływu nie mają prawa zgnić.
 *
 * PO CO TO ISTNIEJE. `docs/przeplyw.md` opisuje, co i w jakiej kolejności dzieje
 * się w skrypcie: cztery diagramy, po których inżynier szuka błędu albo planuje
 * zmianę. Dokumentacja tego rodzaju psuje się w jeden sposób — ktoś zmienia
 * nazwę metody albo stałej, a obrazek zostaje z poprzednią. Diagram, który
 * kłamie, jest wtedy gorszy niż jego brak, bo prowadzi w złe miejsce z pełnym
 * przekonaniem.
 *
 * Ten plik zamienia ten rodzaj zgnilizny w czerwony test: KAŻDA nazwa wymieniona
 * w diagramach i w tekście musi naprawdę istnieć w artefakcie, a każdy wskazany
 * plik testów — na dysku.
 *
 * Czego ten test NIE robi: nie sprawdza, czy diagram opisuje prawdziwą
 * KOLEJNOŚĆ. Tego nie da się wyprowadzić z tekstu — i dlatego w pliku diagramów
 * pod każdym obrazkiem stoi lista testów, które daną kolejność wymuszają.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, test, eq, ok, notOk } = require('./harness');
const { ARTIFACT, ROOT } = require('./dom-stub');

const DOC_PATH = path.join(ROOT, 'docs', 'przeplyw.md');
const DOC = fs.readFileSync(DOC_PATH, 'utf8');

/** Bloki ```mermaid ... ``` — same diagramy, bez otaczającego tekstu. */
function mermaidBlocks() {
    const out = [];
    let current = null;
    for (const line of DOC.split('\n')) {
        if (line.trim() === '```mermaid') { current = []; continue; }
        if (current && line.trim() === '```') { out.push(current); current = null; continue; }
        if (current) current.push(line);
    }
    ok(current === null, 'niedomknięty blok mermaid');
    return out;
}

/**
 * Nazwy w zapisie `Obiekt.metoda` — z diagramów i z tekstu.
 *
 * To jest cała wartość tego pliku: po zmianie nazwy metody test zapala się
 * w tym samym PR, w którym nazwa się zmieniła.
 */
function referencedNames() {
    // Ścieżki plików wypadają PRZED szukaniem: `25-flow-docs.test.js` wygląda
    // dla wyrażenia jak wywołanie `docs.test`, a plikami zajmuje się osobne
    // sprawdzenie niżej.
    const text = DOC.replace(/[\w./-]+\.(?:js|md|json|yml)\b/g, ' ');
    const found = new Set();
    const re = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1] + '.' + m[2]);
    return [...found];
}

/**
 * Nazwy, których w artefakcie NIE MA i być nie może — z powodem.
 * Lista jest krótka celowo: każdy wpis to wyjątek, który trzeba uzasadnić.
 */
const KNOWN_ABSENT = {
    // Nazwa globalnej zmiennej powstaje w czasie działania ze sklejenia
    // SCRIPT_ID_PREFIX + 'CONFIG_CODE', więc w pliku nie stoi dosłownie.
    'window.statsHelper_v1_3_0_CONFIG_CODE': true,
    // Odwołania do plików repozytorium, a nie do kodu.
    'przeplyw.md': true,
    // Zapis potoczny w tekście: „r.jina.ai”, „graph.keepa.com” itd. to adresy.
    'r.jina': true,
    'jina.ai': true,
    'graph.keepa': true,
    'keepa.com': true,
    'api.keepa': true,
    'example.com': true,
    'Main.init': false,      // istnieje — wpis zostawiony, żeby było widać różnicę
};

describe('Plik diagramów istnieje i jest kompletny');

test('cztery diagramy, wszystkie bloki domknięte', () => {
    // Cztery, bo tyle obiecuje spis na górze pliku. Dopisanie piątego bez
    // dopisania go do spisu to dokładnie ten rodzaj rozjazdu, o który chodzi.
    const blocks = mermaidBlocks();
    eq(blocks.length, 4, 'liczba diagramów');
    for (const [i, lines] of blocks.entries()) {
        ok(lines.length > 5, `diagram ${i + 1} jest pusty albo obcięty`);
        ok(/^\s*(flowchart|graph)\s+(TD|LR|TB|RL)\s*$/.test(lines[0]),
           `diagram ${i + 1} nie zaczyna się od deklaracji typu: ${lines[0]}`);
    }
});

test('każda etykieta w diagramach jest w cudzysłowie', () => {
    // Mermaid rysuje etykiety niecytowane dopóty, dopóki nie trafi na nawias,
    // przecinek albo dwukropek — a wtedy przestaje rysować CAŁY diagram.
    // Cudzysłów wszędzie jest tańszy niż szukanie, który znak zepsuł obrazek.
    const bad = [];
    for (const [i, lines] of mermaidBlocks().entries()) {
        for (const line of lines) {
            for (const open of ['[', '{', '|']) {
                const idx = line.indexOf(open);
                if (idx >= 0 && line[idx + 1] !== '"') bad.push(`diagram ${i + 1}: ${line.trim()}`);
            }
            const quotes = (line.match(/"/g) || []).length;
            if (quotes % 2) bad.push(`diagram ${i + 1}, nieparzysta liczba cudzysłowów: ${line.trim()}`);
        }
    }
    eq(bad, [], 'etykiety bez cudzysłowu');
});

describe('Diagramy opisują kod, który naprawdę istnieje');

/**
 * Czy `obj.member` naprawdę istnieje RAZEM — a nie oba człony osobno gdzieś
 * w pliku (1.3.3, audyt J6: 7 z 7 wymyślonych par typu `ValueLog.scan`
 * przechodziło, bo `ValueLog` i `scan` istnieją, tylko nie razem).
 *
 * Wystarcza jedno z dwojga: para stoi w kodzie dosłownie (`Obj.member`),
 * albo `member` jest zdefiniowane wewnątrz bloku `const Obj = { … };`.
 */
const ART_LINES = ARTIFACT.split('\n');
function pairExists(obj, member) {
    if (new RegExp(`\\b${obj}\\.${member}\\b`).test(ARTIFACT)) return true;
    const start = ART_LINES.findIndex(l => new RegExp(`^\\s*const ${obj}\\s*=\\s*\\{`).test(l));
    if (start < 0) return false;
    const indent = ART_LINES[start].search(/\S/);
    const close = new RegExp(`^\\s{${indent}}\\};?\\s*$`);
    const end = ART_LINES.findIndex((l, i) => i > start && close.test(l));
    const block = ART_LINES.slice(start, end < 0 ? undefined : end);
    return block.some(l => new RegExp(`^\\s*(?:async\\s+)?${member}\\s*[(:]`).test(l));
}

test('każda nazwa „Obiekt.metoda” jest w artefakcie — jako para', () => {
    const missing = referencedNames().filter(name => {
        if (KNOWN_ABSENT[name]) return false;
        const [obj, member] = name.split('.');
        return !pairExists(obj, member);
    });
    eq(missing, [], 'pary z diagramów, których nie ma w artefakcie');
});

test('strażnik par odrzuca pary wymyślone z istniejących członów', () => {
    // Metatest: te człony istnieją osobno, ale nie razem. Gdyby sprawdzanie
    // wróciło do „każdy człon gdziekolwiek”, ten test zapali się pierwszy.
    for (const fake of ['ValueLog.scan', 'TaskManager.parseJina', 'Routing.flushArchive', 'ShiftManager.addItem']) {
        const [obj, member] = fake.split('.');
        ok(!pairExists(obj, member), 'para wymyślona przeszła: ' + fake);
    }
    ok(pairExists('ValueLog', 'flushArchive'), 'para prawdziwa musi przejść');
    ok(pairExists('TaskManager', 'workedMs'), 'para prawdziwa musi przejść');
});

test('każda stała z podkreśleniem jest w artefakcie', () => {
    // Stałe konfiguracji (`PRICE_MAX_IMAGE_REQUESTS`, `PRE_TRIGGER_REGEX`)
    // zmieniają nazwę rzadko, ale gdy już — diagram zostaje z poprzednią.
    const missing = [];
    const re = /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g;
    let m;
    while ((m = re.exec(DOC)) !== null) {
        if (!new RegExp(`\\b${m[1]}\\b`).test(ARTIFACT)) missing.push(m[1]);
    }
    eq(missing, [], 'stałe wymienione w diagramach, których nie ma w artefakcie');
});

test('każdy wskazany plik testów istnieje', () => {
    // Pod każdym diagramem stoi lista „co tego pilnuje”. Wskazanie pliku,
    // którego nie ma, jest gorsze od braku listy: obiecuje sprawdzenie,
    // którego nikt nie wykonał.
    const missing = [];
    const re = /tests\/[\w.-]+\.test\.js/g;
    let m;
    while ((m = re.exec(DOC)) !== null) {
        if (!fs.existsSync(path.join(ROOT, m[0]))) missing.push(m[0]);
    }
    eq(missing, [], 'pliki testów wymienione w diagramach, których nie ma na dysku');
});

test('sam ten plik jest wymieniony jako strażnik', () => {
    // Zamknięcie pętli: kto czyta diagramy, ma się dowiedzieć, co je sprawdza.
    ok(DOC.includes('tests/25-flow-docs.test.js'), 'brak odwołania do strażnika');
});

describe('Diagramy nie są sierotą w repozytorium');

test('README prowadzi do pliku diagramów', () => {
    // Dokument, do którego nic nie prowadzi, przestaje być czytany, a potem
    // przestaje być prawdziwy.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    ok(readme.includes('docs/przeplyw.md'), 'README nie wskazuje diagramów');
});

test('w diagramach nie ma cyrylicy', () => {
    // Ta sama bramka językowa, co w reszcie repozytorium: dokumentacja po
    // polsku. Pełny skan robi tests/10-language.test.js, tu chodzi o to, żeby
    // nowy diagram nie wjechał obok niej.
    notOk(/[\u0400-\u04FF]/.test(DOC), 'cyrylica w pliku diagramów');
});
