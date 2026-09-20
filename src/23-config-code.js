    // ==========================================
    // 10. KOD KONFIGURACJI (1.2.0)
    // ==========================================
    /**
     * PRZENOSZENIE USTAWIEŃ JEDNYM CIĄGIEM SZESNASTKOWYM.
     *
     * Człowiek ustawia sobie wygląd i wyłączniki na jednej maszynie, kopiuje
     * z panelu jeden ciąg — `0x01...` — i na dowolnej innej maszynie dostaje
     * dokładnie to samo. Ciąg wkleja się albo do konsoli (`SH.config("0x…")`),
     * albo od razu w zakładce przeglądarki, doklejony za wywołaniem skryptu.
     *
     * =====================================================================
     * DLACZEGO TO NIE JEST STAŁY UKŁAD BITÓW
     * =====================================================================
     * Pomysł „każde ustawienie dostaje swoje bity pod stałym adresem” jest
     * kuszący i działa dokładnie do pierwszego wydania, w którym coś się zmieni.
     * Załamuje się na trzech rzeczach naraz:
     *
     *   1. STARY SKRYPT, NOWY KOD. Doszło ustawienie, więc ciąg jest dłuższy.
     *      Stary skrypt nie wie, gdzie kończy się to, co zna — bo przy stałym
     *      układzie długość pola jest wiedzą, a nie częścią danych. Musi odrzucić
     *      cały kod.
     *   2. NOWY SKRYPT, STARY KOD. Trzeba pamiętać KAŻDY historyczny układ bitów
     *      i wybierać go po numerze wersji. To rośnie w nieskończoność.
     *   3. CZŁOWIEK. Przydzielanie offsetów bitowych ręcznie to praca, w której
     *      pomyłka jest cicha: kod się wczyta, tylko ustawienia wylądują nie tam.
     *
     * Dlatego ciąg jest zbiorem SAMOOPISUJĄCYCH SIĘ REKORDÓW, a nie mapą bitów:
     *
     *      [id: 2 bajty][długość: 1 bajt][wartość: tyle bajtów, ile podano]
     *
     * Długość w każdym rekordzie załatwia punkt 1: nieznany rekord da się
     * PRZESKOCZYĆ, nie rozumiejąc go. Stały, nigdy nierecyklingowany numer `id`
     * załatwia punkt 2: nowy skrypt rozpoznaje stare rekordy po numerze, a nie
     * po pozycji. Rejestr poniżej załatwia punkt 3: numer, ścieżka i typ stoją
     * w jednej linii, obok siebie.
     *
     * To jest ten sam pomysł, na którym stoi protobuf, sprowadzony do rozmiaru
     * tego projektu. Wejście i wyjście pozostaje takie, jak miało być: ciąg
     * szesnastkowy, wielkość liter bez znaczenia.
     *
     * =====================================================================
     * KOD ZAWIERA TYLKO TO, CO RÓŻNI SIĘ OD WARTOŚCI DOMYŚLNYCH
     * =====================================================================
     * I to jest druga decyzja, ważniejsza od formatu.
     *
     * Kod jest ŁATKĄ, a nie zdjęciem całej konfiguracji. Kto zmienił trzy rzeczy,
     * ma w kodzie trzy rekordy. Skutek, dla którego to robimy, jest jednak inny
     * niż długość ciągu: gdy w następnym wydaniu zmieni się wartość domyślna
     * czegoś, czego ten człowiek nigdy nie ruszał, on tę nową wartość DOSTANIE.
     * Przy zdjęciu całej konfiguracji zostałby na zawsze przy starych domyślnych,
     * nie wiedząc o tym — dokładnie tak, jak dzieje się to z zapisaną
     * konfiguracją w localStorage.
     *
     * =====================================================================
     * BEZPIECZEŃSTWO
     * =====================================================================
     * Kod przychodzi z zewnątrz: z czatu, z maila, z cudzej zakładki. Dlatego
     * dekodowanie NIE tworzy pól — zapisuje wyłącznie pod ścieżki wymienione
     * w rejestrze, i wyłącznie wartościami typu, który rejestr przewiduje.
     * Liczby przechodzą przez własne granice, kolory przez sprawdzenie formy.
     * Nieznany numer, zła długość, śmieciowa wartość — pomijane pojedynczo,
     * z adnotacją w sprawozdaniu, a nie wywracające całego kodu.
     */
    const ConfigCode = {
        /** Wersja FORMATU (nie skryptu). Zmienia się tylko przy zmianie ramki. */
        FORMAT: 0x01,

        /**
         * KOD PODSTAWIONY PRZED URUCHOMIENIEM.
         *
         * Zakładka z ustawieniami (patrz `link`) najpierw wpisuje kod do okna
         * pod tę nazwę, a dopiero potem ściąga i wykonuje plik. Dzięki temu
         * ustawienia wchodzą WEWNĄTRZ `Main.init()`, zaraz po wczytaniu stanu
         * z magazynu — czyli przed pierwszym rysowaniem okna.
         *
         * Wcześniejszy pomysł — wykonać plik, a zaraz za nim, w tej samej linii,
         * `SH.config('0x…')` — miał dwie dziury. Po pierwsze `SH` powstaje
         * dopiero w `Main.init()`, a ten czeka na `DOMContentLoaded`, gdy strona
         * jeszcze się wczytuje: wywołanie tuż po wykonaniu pliku trafiało wtedy
         * w niebyt. Po drugie nawet przy
         * gotowej stronie okno zdążyło się narysować ustawieniami domyślnymi
         * i dopiero potem przeskakiwało na swoje — widoczne mrugnięcie.
         *
         * Nazwa jest długa i z przedrostkiem skryptu, bo to cudza strona.
         */
        BOOT_GLOBAL: CONFIG.SCRIPT_ID_PREFIX + 'CONFIG_CODE',

        /**
         * Listy wartości dopuszczalnych dla pól wyboru.
         *
         * KOLEJNOŚĆ JEST CZĘŚCIĄ FORMATU: w kodzie leci indeks, nie tekst.
         * Nowe pozycje wolno DOPISYWAĆ NA KOŃCU; przestawienie albo usunięcie
         * pozycji zmienia znaczenie już rozdanych kodów. Listy stoją tutaj,
         * a nie są czytane z CONFIG, właśnie po to: tam kolejność jest dowolna.
         */
        ENUMS: {
            font: ['default', 'monospace', 'sans_serif_thin'],
            source: ['ocr', 'graph', 'jina'],
            graphMode: ['legend', 'right', 'full'],
            language: ['pl', 'en', 'ru'],
            marketplace: ['de', 'co.uk', 'com', 'it', 'fr', 'es', 'nl', 'ca', 'se', 'com.be', 'pl'],
        },

        /**
         * REJESTR USTAWIEŃ — jedyne miejsce, które trzeba ruszyć, dodając
         * ustawienie do kodu.
         *
         * Numery przydzielone są blokami, żeby dopisywanie było oczywiste:
         *
         *      0x0001–0x00FF   okno statystyk i strona
         *      0x0100–0x01FF   linie 1–7, po 0x10 na linię
         *      0x0200–0x02FF   karta ceny
         *      0x0300–0x03FF   ustawienia wspólne dla wszystkich kart
         *
         * ZASADA, KTÓREJ NIE WOLNO ZŁAMAĆ: numer raz wydany nie wraca do obiegu.
         * Ustawienie, które znika ze skryptu, znika też z tego rejestru — ale
         * jego numer zostaje spalony na zawsze, bo u kogoś w kieszeni leży kod,
         * w którym ten numer coś znaczy.
         *
         * `root` mówi, do której gałęzi stanu trafia wartość: 'local' to
         * ustawienia tej karty, 'user' — wspólne dla wszystkich.
         */
        REGISTRY: [
            // --- okno statystyk i strona ---
            { id: 0x0001, root: 'local', path: 'statsWindowFontFamily', type: 'enum', list: 'font' },
            { id: 0x0002, root: 'local', path: 'statsWindowBgColorHex', type: 'color' },
            { id: 0x0003, root: 'local', path: 'statsWindowBgAlpha', type: 'u8', min: 0, max: 100 },
            { id: 0x0004, root: 'local', path: 'statsWindowPosition.left', type: 'text' },
            { id: 0x0005, root: 'local', path: 'statsWindowPosition.top', type: 'text' },
            { id: 0x0006, root: 'local', path: 'statsWindowPosition.bottom', type: 'text' },
            { id: 0x0007, root: 'local', path: 'pageOverlayOpacity', type: 'u8', min: 0, max: 100 },
            { id: 0x0008, root: 'local', path: 'pageIndicatorTextVisible', type: 'bool' },

            // --- linie 1–7 ---
            ...['line1_currentTab', 'line2_globalSummary', 'line3_shiftInfo', 'line4_lunchInfo',
                'line5_realTimeClock', 'line6_valueSum', 'line7_compact',
                // 1.3.0 — linia 8 dostaje blok 0x0170, kolejny wolny po linii 7.
                'line8_taskInfo'].flatMap((key, i) => {
                const base = 0x0100 + i * 0x10;
                return [
                    { id: base, root: 'local', path: `linesConfig.${key}.visible`, type: 'bool' },
                    { id: base + 1, root: 'local', path: `linesConfig.${key}.colorHex`, type: 'color' },
                    { id: base + 2, root: 'local', path: `linesConfig.${key}.alpha`, type: 'u8', min: 0, max: 100 },
                    { id: base + 3, root: 'local', path: `linesConfig.${key}.fontSize`, type: 'u8', min: 6, max: 96 },
                ];
            }),
            // Wielokolor i barwy działów ma tylko linia 2 — stąd osobno,
            // w jej własnym bloku (0x0110).
            { id: 0x0114, root: 'local', path: 'linesConfig.line2_globalSummary.multicolor', type: 'bool' },
            { id: 0x0115, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.CRET', type: 'color' },
            { id: 0x0116, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.REFURB', type: 'color' },
            { id: 0x0117, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.WHD', type: 'color' },

            // --- karta ceny ---
            { id: 0x0200, root: 'local', path: 'priceCard.moduleEnabled', type: 'bool' },
            { id: 0x0201, root: 'local', path: 'priceCard.visible', type: 'bool' },
            { id: 0x0202, root: 'local', path: 'priceCard.source', type: 'enum', list: 'source' },
            { id: 0x0203, root: 'local', path: 'priceCard.logValues', type: 'bool' },
            { id: 0x0204, root: 'local', path: 'priceCard.marketFallback', type: 'bool' },
            { id: 0x0205, root: 'local', path: 'priceCard.showPrice', type: 'bool' },
            { id: 0x0206, root: 'local', path: 'priceCard.showRrp', type: 'bool' },
            { id: 0x0207, root: 'local', path: 'priceCard.showGraph', type: 'bool' },
            { id: 0x0208, root: 'local', path: 'priceCard.showSource', type: 'bool' },
            { id: 0x0209, root: 'local', path: 'priceCard.showAsin', type: 'bool' },
            { id: 0x020a, root: 'local', path: 'priceCard.asinClickable', type: 'bool' },
            { id: 0x020b, root: 'local', path: 'priceCard.showLatency', type: 'bool' },
            { id: 0x020c, root: 'local', path: 'priceCard.fontFamily', type: 'enum', list: 'font' },
            { id: 0x020d, root: 'local', path: 'priceCard.graphMode', type: 'enum', list: 'graphMode' },
            { id: 0x020e, root: 'local', path: 'priceCard.width', type: 'u16', min: 120, max: 1600 },
            { id: 0x020f, root: 'local', path: 'priceCard.fontSize', type: 'u8', min: 6, max: 96 },
            { id: 0x0210, root: 'local', path: 'priceCard.colorHex', type: 'color' },
            { id: 0x0211, root: 'local', path: 'priceCard.alpha', type: 'u8', min: 0, max: 100 },
            { id: 0x0212, root: 'local', path: 'priceCard.bgColorHex', type: 'color' },
            { id: 0x0213, root: 'local', path: 'priceCard.bgAlpha', type: 'u8', min: 0, max: 100 },
            { id: 0x0214, root: 'local', path: 'priceCard.position.left', type: 'text' },
            { id: 0x0215, root: 'local', path: 'priceCard.position.top', type: 'text' },

            // --- wspólne dla wszystkich kart ---
            { id: 0x0300, root: 'user', path: 'language', type: 'enum', list: 'language' },
            { id: 0x0301, root: 'user', path: 'marketplace', type: 'enum', list: 'marketplace' },
            { id: 0x0302, root: 'user', path: 'triggerMutationDebounceMs', type: 'u16', min: 0, max: 5000 },
            { id: 0x0303, root: 'user', path: 'settingsPanelWidth', type: 'u16', min: 200, max: 2000 },
            { id: 0x0304, root: 'user', path: 'globalStatsContributionKnown.CRET', type: 'bool' },
            { id: 0x0305, root: 'user', path: 'globalStatsContributionKnown.REFURB', type: 'bool' },
            { id: 0x0306, root: 'user', path: 'globalStatsContributionKnown.WHD', type: 'bool' },
            { id: 0x0307, root: 'user', path: 'keyboardShortcuts.INCREMENT', type: 'text' },
            { id: 0x0308, root: 'user', path: 'keyboardShortcuts.DECREMENT', type: 'text' },
        ],

        // ---------------- pomocnicze ----------------
        _root(name) {
            return name === 'user' ? store.userConfig : store.localTabConfig;
        },
        _defaults(name) {
            return name === 'user' ? DEFAULT_USER_CONFIG : DEFAULT_LOCAL_CONFIG;
        },
        /** Wartość spod ścieżki albo undefined, gdy którykolwiek człon nie istnieje. */
        _get(obj, path) {
            return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
        },
        /** Zapis pod ścieżkę BEZ tworzenia brakujących gałęzi — patrz bezpieczeństwo wyżej. */
        _set(obj, path, value) {
            const parts = path.split('.');
            const last = parts.pop();
            const target = parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
            if (!target || typeof target !== 'object') return false;
            target[last] = value;
            return true;
        },

        // ---------------- wartość <-> bajty ----------------
        /** @returns {number[]|null} bajty wartości albo null, gdy nie da się zakodować. */
        _toBytes(entry, value) {
            switch (entry.type) {
                case 'bool':
                    return typeof value === 'boolean' ? [value ? 1 : 0] : null;
                case 'u8': {
                    const n = Math.round(Number(value));
                    return isFinite(n) && n >= 0 && n <= 255 ? [n] : null;
                }
                case 'u16': {
                    const n = Math.round(Number(value));
                    return isFinite(n) && n >= 0 && n <= 65535 ? [(n >> 8) & 0xff, n & 0xff] : null;
                }
                case 'color': {
                    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(value));
                    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
                }
                case 'enum': {
                    const i = this.ENUMS[entry.list].indexOf(String(value));
                    return i >= 0 ? [i] : null;
                }
                case 'text': {
                    // Tylko drukowalne ASCII. Wszystkie wartości tego typu to
                    // miary CSS ('20px', '15%') i nazwy klawiszy ('ShiftRight'),
                    // więc pełny UTF-8 byłby kodem, którego nikt nigdy nie wykona.
                    const s = String(value);
                    const out = [];
                    for (let i = 0; i < s.length; i++) {
                        const c = s.charCodeAt(i);
                        if (c < 0x20 || c > 0x7e) return null;
                        out.push(c);
                    }
                    return out.length <= 255 ? out : null;
                }
                default:
                    return null;
            }
        },
        /** @returns {{ok: boolean, value?: *}} */
        _fromBytes(entry, bytes) {
            const bad = { ok: false };
            switch (entry.type) {
                case 'bool':
                    return bytes.length === 1 ? { ok: true, value: bytes[0] !== 0 } : bad;
                case 'u8':
                case 'u16': {
                    const width = entry.type === 'u8' ? 1 : 2;
                    if (bytes.length !== width) return bad;
                    const n = width === 1 ? bytes[0] : (bytes[0] << 8) | bytes[1];
                    // Granice z rejestru, a nie z kodu: kod przyszedł z zewnątrz.
                    const min = entry.min === undefined ? 0 : entry.min;
                    const max = entry.max === undefined ? 65535 : entry.max;
                    return { ok: true, value: Math.max(min, Math.min(max, n)) };
                }
                case 'color': {
                    if (bytes.length !== 3) return bad;
                    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
                    return { ok: true, value: '#' + hex };
                }
                case 'enum': {
                    if (bytes.length !== 1) return bad;
                    const list = this.ENUMS[entry.list];
                    return bytes[0] < list.length ? { ok: true, value: list[bytes[0]] } : bad;
                }
                case 'text': {
                    let s = '';
                    for (const b of bytes) {
                        if (b < 0x20 || b > 0x7e) return bad;
                        s += String.fromCharCode(b);
                    }
                    return { ok: true, value: s };
                }
                default:
                    return bad;
            }
        },

        // ---------------- kodowanie ----------------
        /**
         * Kod bieżących ustawień. Wchodzi tylko to, co różni się od domyślnych.
         * @returns {string} np. `0x0101000101...`
         */
        encode() {
            const bytes = [this.FORMAT];
            for (const entry of this.REGISTRY) {
                const current = this._get(this._root(entry.root), entry.path);
                if (current === undefined) continue;
                const fallback = this._get(this._defaults(entry.root), entry.path);
                if (current === fallback) continue;
                const value = this._toBytes(entry, current);
                if (!value) continue;
                bytes.push((entry.id >> 8) & 0xff, entry.id & 0xff, value.length, ...value);
            }
            bytes.push(bytes.reduce((a, b) => (a + b) & 0xff, 0));
            return '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
        },

        // ---------------- dekodowanie ----------------
        /**
         * Rozbiera kod na łatkę. NIE dotyka stanu — to robi apply().
         *
         * @returns {{ok: boolean, error?: string, patch?: object, stats?: object}}
         *   `stats.unknown` to rekordy o nieznanym numerze: kod z nowszego
         *   wydania wczyta się w starszym skrypcie, tracąc tylko to, czego ten
         *   skrypt i tak nie umie ustawić.
         */
        decode(text) {
            const clean = String(text == null ? '' : text).trim().replace(/^0x/i, '').replace(/[\s_-]/g, '');
            if (!clean) return { ok: false, error: 'kod jest pusty' };
            if (!/^[0-9a-f]+$/i.test(clean)) return { ok: false, error: 'kod zawiera znak spoza zapisu szesnastkowego' };
            if (clean.length % 2) return { ok: false, error: 'kod ma nieparzystą liczbę znaków' };

            const bytes = [];
            for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
            if (bytes.length < 2) return { ok: false, error: 'kod jest za krótki' };

            const given = bytes[bytes.length - 1];
            const counted = bytes.slice(0, -1).reduce((a, b) => (a + b) & 0xff, 0);
            if (given !== counted) return { ok: false, error: 'suma kontrolna się nie zgadza — kod jest niepełny albo przekłamany' };
            if (bytes[0] !== this.FORMAT) {
                return { ok: false, error: `nieznana wersja formatu (${bytes[0]}), ten skrypt rozumie ${this.FORMAT}` };
            }

            const byId = new Map(this.REGISTRY.map(e => [e.id, e]));
            const patch = { local: {}, user: {} };
            const stats = { applied: 0, unknown: 0, invalid: 0 };
            let i = 1;
            while (i < bytes.length - 1) {
                if (i + 3 > bytes.length - 1) { stats.invalid++; break; }
                const id = (bytes[i] << 8) | bytes[i + 1];
                const len = bytes[i + 2];
                const from = i + 3;
                if (from + len > bytes.length - 1) { stats.invalid++; break; }
                const value = bytes.slice(from, from + len);
                i = from + len;

                const entry = byId.get(id);
                if (!entry) { stats.unknown++; continue; }
                const parsed = this._fromBytes(entry, value);
                if (!parsed.ok) { stats.invalid++; continue; }
                patch[entry.root][entry.path] = parsed.value;
                stats.applied++;
            }
            return { ok: true, patch, stats };
        },

        /**
         * Rozbiera kod i nakłada go na bieżący stan.
         *
         * Zapis idzie POD ŚCIEŻKI Z REJESTRU, po jednej wartości — a nie
         * podmianą całych gałęzi. Dzięki temu każda zmiana przechodzi przez
         * magistralę stanu i interfejs odświeża się sam, bez osobnego wołania
         * renderów.
         *
         * @returns {object} sprawozdanie do konsoli albo do panelu.
         */
        apply(text) {
            const res = this.decode(text);
            if (!res.ok) {
                Utils.error(`[KOD] ${res.error}`);
                return { 'kod przyjęty': false, powód: res.error };
            }
            let written = 0;
            for (const root of ['local', 'user']) {
                for (const [path, value] of Object.entries(res.patch[root])) {
                    if (this._set(this._root(root), path, value)) written++;
                }
            }
            StorageManager.saveState();
            Utils.log(`[KOD] wczytano ustawień: ${written}`);
            return {
                'kod przyjęty': true,
                'ustawień nałożonych': written,
                'rekordów nieznanych (nowszy skrypt je zrozumie)': res.stats.unknown,
                'rekordów odrzuconych': res.stats.invalid,
            };
        },

        /**
         * Kod podstawiony przed uruchomieniem — wołane z `Main.init()`.
         *
         * Zmienna znika z okna niezależnie od tego, czy kod był poprawny:
         * zostawiona po sobie śmieciowa własność na cudzej stronie jest
         * dokładnie tym, czego skrypt ma nie robić.
         *
         * @returns {object|null} sprawozdanie albo null, gdy nic nie podstawiono.
         */
        applyBoot() {
            const code = this.takeBoot();
            return code ? this.apply(code) : null;
        },

        /**
         * Odczytuje i USUWA kod podstawiony przed uruchomieniem.
         *
         * Osobno od `applyBoot`, bo jest druga droga: gdy skrypt już stoi na
         * stronie, kod ma trafić do TAMTEGO egzemplarza (przez jego `SH.config`),
         * a nie do tego, który właśnie się nie uruchomi — patrz `Main.init`.
         *
         * @returns {string|null} kod albo null, gdy nic sensownego nie podstawiono.
         */
        takeBoot() {
            const name = this.BOOT_GLOBAL;
            const code = window[name];
            try { delete window[name]; } catch (e) { window[name] = undefined; }
            return typeof code === 'string' && code ? code : null;
        },

        /**
         * Gotowa zakładka: wywołanie skryptu z doklejonym kodem bieżących ustawień.
         *
         * To jest TEKST DO SKOPIOWANIA, a nie kod do wykonania: człowiek wkleja
         * go jako adres zakładki i uruchamia sam, klikając ją. Skrypt niczego
         * tutaj nie wywołuje — stąd wyłączona reguła lintera, która widzi samo
         * słowo `javascript:` w ciągu znaków. Test artefaktu pilnuje, że jest to
         * jedyne miejsce w całym pliku ze słowem `eval`.
         */
        link() {
            // Kolejność w tym ciągu jest całym mechanizmem: najpierw kod trafia
            // do okna, potem rusza pobieranie pliku. Skrypt zastaje go gotowego
            // i nakłada sam, w środku uruchomienia — bez mrugnięcia domyślnym
            // wyglądem i bez zgadywania, czy `SH` zdążyło już powstać.
            // eslint-disable-next-line no-script-url -- tekst zakładki, patrz wyżej
            return "javascript:(async()=>{window['" + this.BOOT_GLOBAL + "']='" + this.encode()
                + "';const r=await fetch('" + CONFIG.RELEASE_URL
                + "',{cache:'no-store'});eval(await r.text());})();void 0;";
        },
    };
