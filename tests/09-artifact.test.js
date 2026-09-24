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
 *   - że wymogi językowe są utrzymane (komentarze i logi po polsku,
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

describe('Komentarze opisują kod, a nie jego historię');

/**
 * Komentarz w kodzie mówi, co robi fragment i dlaczego tak — w czasie
 * teraźniejszym. Historia zmian („w wersji N było…”, „poprawka z audytu”)
 * należy do CHANGELOG i historii gita: w kodzie rozrasta plik i przesłania
 * wyjaśnienie — działa zawsze tylko bieżąca wersja.
 *
 * Sprawdzane są linie komentarzy i komentarze na końcu linii kodu. Wyjątek:
 * `@version` w nagłówku userscriptu — to wersja tego pliku, a nie historia.
 */
test('w komentarzach nie ma numerów wersji ani odsyłaczy do audytu', () => {
    const VERSION = /\b[0-9]\.[0-9]{1,2}\.[0-9]\b/;
    const AUDIT = /\baudyt(u|em)?\s+[A-Z][0-9]/;
    const bad = [];
    LINES.forEach((l, i) => {
        let text = null;
        if (IS_COMMENT[i]) text = l;
        else {
            const tail = /\s\/\/\s(.*)$/.exec(l);
            if (tail) text = tail[1];
        }
        if (!text || /@version\b/.test(text)) return;
        if (VERSION.test(text) || AUDIT.test(text)) bad.push(`wiersz ${i + 1}: ${text.trim().slice(0, 90)}`);
    });
    eq(bad, [], 'historia zmian w komentarzach — przenieść do CHANGELOG');
});

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
 * Skrypt nie wykonuje kodu z łańcucha i nigdy nie ma tego robić. Ale układa
 * TEKST gotowej zakładki przeglądarki, a zakładka pobiera plik i podaje
 * go do `eval` — bo tak uruchamia się ten skrypt tam, gdzie konsola jest
 * zamknięta. To słowo trafia więc do artefaktu jako treść do skopiowania przez
 * człowieka, a nie jako wywołanie.
 *
 * Sprawdzenie „ani jednego wywołania” byłoby ryzykowne: trzeba by odróżniać
 * wywołanie od łańcucha regexpem, a takie rozróżnienie zawsze da się obejść.
 * Dlatego sprawdzenie jest POLICZALNE
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
 * Adres `github.com/…/releases/latest/download/…` nie działa w zakładce:
 * pobranie pliku wydania kończy się przekierowaniem BEZ nagłówka
 * `Access-Control-Allow-Origin`, więc przeglądarka zrywa zapytanie („blocked
 * by CORS policy”). Kliknięcie takiego adresu działa, `fetch` z cudzej strony
 * — nie, i to jest różnica, której nie widać z kodu.
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

/**
 * INWENTARZ WYJŚĆ DO SIECI.
 *
 * Porównanie dwóch liczb z całego pliku (ile `fetch(`, ile `priceModuleOn()`)
 * niczego nie dowodzi: strażnik zdjęty z KeepaOCR.loadImage i zastąpiony
 * komentarzem z wzmiankami przeszedłby bez problemu. Wykrywacz musi też
 * widzieć `.src =` i `setAttribute('src', …)` — tędy idzie wykres.
 *
 * Każde miejsce wyjścia do sieci musi stać w funkcji wpisanej do
 * inwentarza, z jednym z trzech rodzajów ochrony — a każdy z nich jest
 * sprawdzany na kodzie:
 *   self    — `priceModuleOn()` w tej samej funkcji, PRZED wyjściem;
 *   caller  — funkcja jest wołana wyłącznie z podanej funkcji, a tamta ma
 *             `priceModuleOn()` przed wywołaniem;
 *   none    — świadomie bez modułu cen, z powodem wypisanym tutaj.
 * Nowe wyjście do sieci w funkcji spoza inwentarza zapala test, dopóki ktoś
 * nie wpisze go z powodem. Ostateczną bramką pozostają testy zachowania
 * (01-silence i pozostałe „Cisza”) — ten test pilnuje, żeby żadnego wyjścia
 * nie dało się dodać po cichu.
 */
const NETWORK_SITES = {
    loadImage: { guard: 'self' },                       // KeepaOCR: obrazek wykresu do odczytu
    init: { guard: 'self' },                            // FxRates: kursy walut
    render: { guard: 'self' },                          // PriceCard: obrazek wykresu na karcie
    cspReport: { guard: 'self' },                       // SH.cspReport(): próby do Keepa i r.jina.ai
    run: { guard: 'caller', caller: 'resolve' },        // dostawcy ceny, wołani tylko z PriceCard.resolve
    readCsp: { guard: 'none', why: 'własna domena strony, tylko z SH.cspReport() wpisanego ręcznie' },
    link: { guard: 'none', why: 'tekst zakładki do skopiowania — łańcuch znaków, a nie wywołanie' },
};

const KEYWORDS = /^(if|for|while|switch|catch|function|return)$/;
/** Nazwa funkcji, jeśli wiersz ją otwiera: `name(…) {` albo `name: (…) =>`. */
function functionHeader(line) {
    let m = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/.exec(line);
    if (m && !KEYWORDS.test(m[1])) return m[1];
    m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/.exec(line);
    return m ? m[1] : null;
}
const isNetworkLine = (l) => /\bfetch\s*\(/.test(l) || /new\s+Image\s*\(/.test(l)
    || /setAttribute\(\s*'src'/.test(l) || /\.src\s*=(?!=)/.test(l);

/** Wszystkie wyjścia do sieci: wiersz, funkcja, w której stoi, i jej początek. */
function networkSites() {
    const out = [];
    LINES.forEach((l, i) => {
        if (IS_COMMENT[i] || !isNetworkLine(l)) return;
        const indent = l.search(/\S/);
        for (let j = i - 1; j >= 0; j--) {
            const name = functionHeader(LINES[j]);
            if (name && LINES[j].search(/\S/) < indent) { out.push({ line: i, fn: name, start: j }); return; }
        }
        out.push({ line: i, fn: null, start: 0 });
    });
    return out;
}

/** Czy między wierszami [from, to) stoi w kodzie (nie w komentarzu) `priceModuleOn()`. */
const guardedBetween = (from, to) => LINES.slice(from, to)
    .some((l, k) => !IS_COMMENT[from + k] && /priceModuleOn\s*\(\s*\)/.test(l));

test('każde wyjście do sieci stoi w inwentarzu, a jego ochrona jest w kodzie', () => {
    const sites = networkSites();
    ok(sites.length >= 8, 'wyjść do sieci jest kilka — inaczej wykrywacz przestał działać: ' + sites.length);
    const bad = [];
    for (const s of sites) {
        const entry = NETWORK_SITES[s.fn];
        const where = `wiersz ${s.line + 1} (${s.fn || 'poza funkcją'}): ${LINES[s.line].trim().slice(0, 60)}`;
        if (!entry) { bad.push('spoza inwentarza — ' + where); continue; }
        if (entry.guard === 'self' && !guardedBetween(s.start, s.line)) bad.push('brak priceModuleOn() przed wyjściem — ' + where);
        if (entry.guard === 'caller') {
            const caller = LINES.findIndex(l => functionHeader(l) === entry.caller);
            const call = LINES.findIndex((l, k) => k > caller && !IS_COMMENT[k] && new RegExp('\\.' + s.fn + '\\(').test(l));
            if (caller < 0 || call < 0 || !guardedBetween(caller, call)) bad.push(`${entry.caller} nie sprawdza modułu przed ${s.fn}() — ` + where);
            const callers = LINES.filter((l, k) => !IS_COMMENT[k] && new RegExp('\\.' + s.fn + '\\(\\s*asin').test(l)).length;
            if (callers !== 1) bad.push(`${s.fn}() wołane z ${callers} miejsc, inwentarz zna jedno — ` + where);
        }
    }
    eq(bad, [], 'wyjścia do sieci bez udowodnionej ochrony');
    const used = new Set(sites.map(s => s.fn));
    eq(Object.keys(NETWORK_SITES).filter(k => !used.has(k)), [], 'wpisy inwentarza bez wyjścia do sieci — do usunięcia');
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

test('mapa modułów w src/README.md zna każdy moduł i nie kłamie o jego rozmiarze', () => {
    // Mapa, która myli rząd wielkości (~145 przy 490 wierszach), prowadzi
    // w złe miejsce. Tolerancja 25%, żeby zwykła poprawka nie wymagała
    // ruszania mapy.
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.manifest.json'), 'utf8'));
    const map = fs.readFileSync(path.join(ROOT, 'src', 'README.md'), 'utf8');
    const bad = [];
    for (const file of [manifest.banner, ...manifest.modules.map(m => m.file), manifest.footer]) {
        const name = path.basename(file);
        const m = new RegExp('`' + name.replace('.', '\\.') + '`[^\\n]*\\| ~(\\d+) \\|').exec(map);
        if (!m) { bad.push(name + ' — brak w mapie'); continue; }
        const real = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').length;
        if (Math.abs(Number(m[1]) - real) > real * 0.25) bad.push(`${name} — w mapie ~${m[1]}, naprawdę ${real}`);
    }
    eq(bad, []);
});

test('sam build odmawia, gdy w src/ leży moduł spoza manifestu', () => {
    // Audyt I3: test wyżej łapał sierotę tylko w `npm test`, a `npm run build`
    // zgłaszał sukces z artefaktem bez nowego kodu. Kopia repozytorium
    // w katalogu tymczasowym, żeby nie dotykać prawdziwego src/.
    const os = require('os');
    const { spawnSync } = require('child_process');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-build-'));
    try {
        for (const f of ['build.js', 'build.manifest.json', 'package.json', 'counter.js']) {
            fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
        }
        fs.cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
        const run = () => spawnSync(process.execPath, [path.join(tmp, 'build.js'), '--check'], { encoding: 'utf8' });

        eq(run().status, 0, 'kopia bez sieroty przechodzi — inaczej test niczego nie dowodzi');
        fs.writeFileSync(path.join(tmp, 'src', '26-forgotten.js'), '    const forgotten = 1;\n');
        const r = run();
        eq(r.status, 1, 'build z sierotą ma paść');
        ok(/spoza manifestu.*26-forgotten\.js/.test(r.stderr), 'komunikat nazywa plik: ' + r.stderr);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
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
