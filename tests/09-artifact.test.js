/**
 * 09-artifact.test.js — skan statyczny artefaktu i spójność ze źródłami.
 *
 * Wszystkie poprzednie pliki uruchamiają kod i patrzą, co robi. Ten czyta
 * counter.js jako TEKST i sprawdza rzeczy, których nie da się zobaczyć
 * w czasie działania:
 *
 *   - że w kodzie nie ma konstrukcji, których w tym projekcie być nie może
 *     (eval, innerHTML z treścią, document.write);
 *   - że wszystkie adresy w pliku należą do znanej listy hostów;
 *   - że wymogi językowe 1.0.0 są utrzymane (komentarze i logi po polsku,
 *     lokalizacja rosyjska nietknięta);
 *   - że artefakt zgadza się z manifestem i ze źródłami.
 *
 * To jest tani sposób na wyłapanie całej klasy błędów, które inaczej
 * zauważyłby dopiero człowiek czytający plik.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, test, eq, ok, notOk } = require('./harness');
const { ARTIFACT, ROOT } = require('./dom-stub');

const LINES = ARTIFACT.split('\n');

/** Czy linia o podanym numerze (0-based) jest komentarzem. */
function commentMap() {
    const map = new Array(LINES.length).fill(false);
    let inBlock = false;
    LINES.forEach((l, i) => {
        const t = l.trim();
        if (inBlock) { map[i] = true; if (t.includes('*/')) inBlock = false; return; }
        if (t.startsWith('/*')) { map[i] = true; if (!t.includes('*/')) inBlock = true; return; }
        if (t.startsWith('//') || t.startsWith('*')) map[i] = true;
    });
    return map;
}
const IS_COMMENT = commentMap();

describe('Zakazane konstrukcje');

test('nie ma new Function, document.write ani insertAdjacentHTML', () => {
    notOk(/new\s+Function\s*\(/.test(ARTIFACT), 'new Function');
    notOk(/document\.write/.test(ARTIFACT), 'document.write');
    notOk(/insertAdjacentHTML/.test(ARTIFACT), 'insertAdjacentHTML');
    notOk(/\.outerHTML\s*=/.test(ARTIFACT), 'outerHTML =');
});

/**
 * `eval` — JEDNO DOZWOLONE WYSTĄPIENIE I ANI JEDNEGO WIĘCEJ.
 *
 * Skrypt nie wykonuje kodu z łańcucha i nigdy nie ma tego robić. Ale od 1.2.0
 * układa TEKST gotowej zakładki przeglądarki, a zakładka pobiera plik i podaje
 * go do `eval` — bo tak uruchamia się ten skrypt tam, gdzie konsola jest
 * zamknięta. To słowo trafia więc do artefaktu jako treść do skopiowania przez
 * człowieka, a nie jako wywołanie.
 *
 * Dawne sprawdzenie „nie ma w pliku słowa eval” było wygodne właśnie dlatego, że
 * nie wymagało myślenia. Rozluźnienie go do „ani jednego wywołania” byłoby
 * ryzykowne: trzeba by odróżniać wywołanie od łańcucha regexpem, a takie
 * rozróżnienie zawsze da się obejść. Dlatego zostaje sprawdzenie POLICZALNE
 * i ustawione na jedno konkretne miejsce — drugie wystąpienie, skądkolwiek by
 * przyszło, zapala bramkę i wymaga wyjaśnienia tutaj.
 */
test('eval występuje dokładnie raz i tylko w tekście zakładki', () => {
    const hits = LINES
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => /\beval\s*\(/.test(l));

    eq(hits.length, 1, 'wystąpień eval: ' + hits.map(([n]) => n).join(', '));
    ok(/javascript:|await r\.text\(\)/.test(hits[0][1]),
       'jedyne eval ma być częścią składanego tekstu zakładki, jest: ' + hits[0][1].trim());
    ok(/'|"|`/.test(hits[0][1].split('eval')[0].slice(-40)),
       'i ma stać wewnątrz łańcucha, a nie w kodzie');
});

test('innerHTML używany wyłącznie do czyszczenia', () => {
    const bad = [];
    LINES.forEach((l, i) => {
        if (IS_COMMENT[i]) return;
        if (!/\.innerHTML\s*=/.test(l)) return;
        if (!/\.innerHTML\s*=\s*''\s*;?\s*$/.test(l.trim())) bad.push(i + 1 + ': ' + l.trim());
    });
    eq(bad, [], 'innerHTML z treścią');
});

test('nie ma setTimeout ze stringiem zamiast funkcji', () => {
    notOk(/setTimeout\s*\(\s*['"`]/.test(ARTIFACT), 'setTimeout ze stringiem');
    notOk(/setInterval\s*\(\s*['"`]/.test(ARTIFACT), 'setInterval ze stringiem');
});

describe('Granice sieciowe');

test('wszystkie adresy zewnętrzne należą do znanej listy', () => {
    const allowed = [
        'graph.keepa.com', 'api.keepa.com', 'r.jina.ai',
        'cdn.jsdelivr.net', 'open.er-api.com', 'www.floatrates.com',
        'example.com',                  // wyłącznie w diagnostyce CSP
        // Adres wydania (CONFIG.RELEASE_URL) i nazwa w raporcie CSP. Skrypt
        // stąd NIE pobiera — wkleja adres do tekstu gotowej zakładki, a pobiera
        // dopiero przeglądarka po kliknięciu. Pilnuje tego sprawdzenie niżej:
        // „każde wejście do sieci jest osłonięte sprawdzeniem modułu” liczy
        // wywołania fetch i new Image, a tu nie ma ani jednego.
        'raw.githubusercontent.com',
        'github.com',                   // wyłącznie w komentarzu przy RELEASE_URL
    ];
    const amazon = /^www\.amazon\.(de|co\.uk|com|it|fr|es|nl|ca|se|com\.be|pl)$/;
    const hosts = new Set();
    const re = /https?:\/\/([A-Za-z0-9.-]+)/g;
    let m;
    while ((m = re.exec(ARTIFACT)) !== null) hosts.add(m[1]);

    const unknown = [...hosts].filter(h =>
        !allowed.includes(h) && !amazon.test(h) && h !== 'trex-prod-eu.aka.amazon.com');
    eq(unknown, [], 'nieznane hosty w pliku');
});

/**
 * ADRES WYDANIA MUSI STAĆ NA HOŚCIE, KTÓRY PRZEPUSZCZA ZAPYTANIA MIĘDZYDOMENOWE.
 *
 * Wydanie 1.2.0 wyszło z adresem `github.com/…/releases/latest/download/…`
 * i zakładka nie działała u nikogo: pobranie pliku wydania kończy się
 * przekierowaniem BEZ nagłówka `Access-Control-Allow-Origin`, więc przeglądarka
 * zrywa zapytanie („blocked by CORS policy”). Kliknięcie takiego adresu działa,
 * `fetch` z cudzej strony — nie, i to jest różnica, której nie widać z kodu.
 *
 * Sprawdzenie jest listą hostów, o których WIADOMO, że nagłówek wystawiają.
 * Nowy host dopisuje się tutaj dopiero po sprawdzeniu nagłówków odpowiedzi,
 * a nie z przekonania.
 */
test('adres wydania stoi na hoście z nagłówkiem CORS', () => {
    const CORS_OK = ['raw.githubusercontent.com', 'cdn.jsdelivr.net'];
    const found = /RELEASE_URL:\s*'([^']+)'/.exec(ARTIFACT);
    ok(found, 'RELEASE_URL musi być w artefakcie');
    const url = found[1];
    const host = /^https:\/\/([A-Za-z0-9.-]+)\//.exec(url);
    ok(host, 'adres wydania musi być pełnym adresem https, jest: ' + url);
    ok(CORS_OK.includes(host[1]),
       'host bez CORS w adresie zakładki: ' + host[1] + ' (znane: ' + CORS_OK.join(', ') + ')');
    ok(url.endsWith('/counter.js'), 'adres ma wskazywać na sam plik');
});

test('każde wejście do sieci jest osłonięte sprawdzeniem modułu', () => {
    const netLines = [];
    LINES.forEach((l, i) => {
        if (IS_COMMENT[i]) return;
        if (/\bfetch\s*\(/.test(l) || /new\s+Image\s*\(/.test(l)) netLines.push(i + 1);
    });
    ok(netLines.length > 0, 'w pliku muszą być wejścia do sieci — inaczej test jest bez sensu');

    const guards = (ARTIFACT.match(/priceModuleOn\s*\(\s*\)/g) || []).length;
    ok(guards >= netLines.length,
       `sprawdzeń priceModuleOn (${guards}) musi być co najmniej tyle, ile wejść do sieci (${netLines.length})`);
});

describe('Przezroczystość dla myszy');

/**
 * ILE MIEJSC W PLIKU PRZEJMUJE MYSZ.
 *
 * Skrypt leży NA interfejsie T-REX i człowiek musi w ten interfejs trafiać.
 * Każde `pointer-events:auto` to jedno miejsce, w którym nasz element zabiera
 * kliknięcie cudzemu przyciskowi — więc nie może ich przybywać przez przypadek.
 *
 * Na dziś są dokładnie cztery i każde ma powód:
 *
 *   1. `colorRow` w panelu ustawień — panel jest po to, żeby go klikać;
 *   2. karta ceny W TRAKCIE PRZECIĄGANIA — wtedy ciągnie się ją całą;
 *   3. okno statystyk w trakcie przeciągania — z tego samego powodu;
 *   4. kod produktu na karcie, i tylko przy ręcznie włączonej klikalności
 *      (domyślnie wyłączonej — patrz CONFIG.priceCard.asinClickable).
 *
 * Piąte miejsce nie jest zakazane, ale ma być ŚWIADOME: test pada, autor
 * dopisuje powód tutaj i podnosi liczbę. O to dokładnie chodzi.
 *
 * Komentarze są pomijane, bo o `pointer-events:auto` sporo w nich napisano,
 * a proza niczego nie przejmuje.
 */
test('pointer-events:auto tylko w czterech znanych miejscach', () => {
    const miejsca = [];
    LINES.forEach((l, i) => {
        if (IS_COMMENT[i]) return;
        if (/pointer-?[eE]vents[^;\n]{0,60}['"]auto['"]/.test(l)) miejsca.push(i + 1);
    });
    eq(miejsca.length, 4,
       'miejsc przejmujących mysz ma być cztery, jest ' + miejsca.length
       + ' (linie: ' + miejsca.join(', ') + '). Jeśli piąte jest potrzebne — '
       + 'dopisz powód w komentarzu nad tym testem i podnieś liczbę.');
});

test('karta ceny jest domyślnie przezroczysta dla myszy', () => {
    // Sam fakt, że w pliku stoi `pointerEvents: 'none'` na karcie. Zachowania
    // pilnuje obchód całego poddrzewa w 16-price-card-look, ale tamten test
    // sprawdza atrapę, a ten — plik, który dostaje człowiek.
    ok(/id:\s*'priceCard'[\s\S]{0,400}pointerEvents:\s*'none'/.test(ARTIFACT),
       'karta ceny musi startować z pointer-events:none');
    ok(/asinClickable:\s*false/.test(ARTIFACT),
       'klikalność kodu produktu musi być domyślnie wyłączona');
});

describe('Wymogi językowe');

test('w komentarzach nie ma cyrylicy', () => {
    const cyr = /[Ѐ-ӿ]/;
    const bad = [];
    LINES.forEach((l, i) => {
        if (IS_COMMENT[i] && cyr.test(l)) bad.push(i + 1 + ': ' + l.trim().slice(0, 60));
    });
    eq(bad, [], 'komentarze z cyrylicą');
});

test('w wywołaniach logów nie ma cyrylicy', () => {
    const cyr = /[Ѐ-ӿ]/;
    const bad = [];
    const re = /Utils\.(log|error|fatal)\(([\s\S]{0,400}?)\);/g;
    let m;
    while ((m = re.exec(ARTIFACT)) !== null) {
        if (cyr.test(m[2])) bad.push(m[0].slice(0, 90).replace(/\s+/g, ' '));
    }
    eq(bad, [], 'wywołania logów z cyrylicą');
});

test('komunikaty wyjątków też są po polsku', () => {
    const cyr = /[Ѐ-ӿ]/;
    const bad = [];
    const re = /new Error\(([^)]{0,200})\)/g;
    let m;
    while ((m = re.exec(ARTIFACT)) !== null) {
        if (cyr.test(m[1])) bad.push(m[0].slice(0, 90));
    }
    eq(bad, [], 'new Error z cyrylicą');
});

test('lokalizacja rosyjska została na miejscu', () => {
    ok(/ru:\s*\{/.test(ARTIFACT), 'słownik ru musi istnieć');
    ok(ARTIFACT.includes("{ code: 'ru', name: 'Русский' }"), 'rosyjski na liście języków');
    ok(ARTIFACT.includes('канирование номера LP'), 'wyzwalacz z cyrylicą musi zostać');
    ok(ARTIFACT.includes('видите ниже'), 'wyzwalacz wstępny z cyrylicą musi zostać');
});

describe('Układ pliku');

test('hasła leżą w pierwszych 40 liniach', () => {
    // Człowiek edytuje je wprost w pliku, więc muszą być widoczne od razu po
    // otwarciu, bez przewijania. Blok urósł razem z opisem ograniczenia
    // („hasło nie może być początkiem innego”), stąd 40 zamiast 30.
    const head = LINES.slice(0, 40).join('\n');
    ok(/const\s+SETTINGS_ACCESS_PASSWORDS\s*=\s*\[/.test(head),
       'lista haseł musi być na górze pliku');
    ok(/'GORDONPAULE'/.test(head) && /'BOMBA'/.test(head),
       'oba hasła muszą być widoczne w tym bloku');
});

test('wyłącznik logów leży zaraz pod hasłem', () => {
    const head = LINES.slice(0, 60).join('\n');
    ok(/const\s+SCRIPT_LOGS_ENABLED\s*=\s*false/.test(head));
});

test('na końcu pliku jest blok ze ściągą konfiguracyjną', () => {
    const tail = ARTIFACT.slice(-20000);
    ok(tail.includes('PEŁNA ŚCIĄGA KONFIGURACYJNA'), 'nagłówek ściągi');
    ok(tail.includes('moduleEnabled'), 'opis głównego wyłącznika');
    ok(tail.includes('SCRIPT_LOGS_ENABLED'), 'opis wyłącznika logów');
    ok(tail.includes('line7_compact'), 'opis linii 7');
    ok(tail.includes('statsWindowPosition'), 'opis pozycji okna');
});

describe('Spójność ze źródłami');

test('każdy moduł z manifestu zostawił ślad w artefakcie', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.manifest.json'), 'utf8'));
    const missing = manifest.modules
        .map(m => m.file)
        .filter(f => !ARTIFACT.includes(`─── ${f} ───`));
    eq(missing, [], 'moduły bez znacznika w artefakcie');
});

test('każdy moduł z manifestu istnieje na dysku i nie jest pusty', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.manifest.json'), 'utf8'));
    const bad = [];
    for (const m of manifest.modules) {
        const p = path.join(ROOT, m.file);
        if (!fs.existsSync(p)) { bad.push(m.file + ' — nie istnieje'); continue; }
        if (fs.readFileSync(p, 'utf8').trim().length < 10) bad.push(m.file + ' — pusty');
        if (!m.desc || m.desc.length < 10) bad.push(m.file + ' — brak opisu w manifeście');
    }
    eq(bad, []);
});

test('w src/ nie ma plików spoza manifestu', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.manifest.json'), 'utf8'));
    const known = new Set([
        ...manifest.modules.map(m => path.basename(m.file)),
        path.basename(manifest.banner),
        path.basename(manifest.footer),
        'README.md',
    ]);
    const onDisk = fs.readdirSync(path.join(ROOT, 'src'));
    const orphans = onDisk.filter(f => !known.has(f));
    eq(orphans, [], 'pliki w src/ nieujęte w manifeście (nie trafią do artefaktu!)');
});

test('artefakt jest zbudowany z bieżących źródeł', () => {
    // To samo, co robi CI: przebuduj w pamięci i porównaj.
    const { execFileSync } = require('child_process');
    let outcome = 'ok';
    try {
        execFileSync(process.execPath, [path.join(ROOT, 'build.js'), '--check'], {
            cwd: ROOT, stdio: 'pipe',
        });
    } catch (e) {
        outcome = (e.stderr ? e.stderr.toString() : e.message).trim().split('\n')[0];
    }
    eq(outcome, 'ok', 'counter.js rozjechał się ze źródłami — uruchom "npm run build"');
});
