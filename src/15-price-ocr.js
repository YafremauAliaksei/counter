    // ==========================================
    // 6c. ODCZYT CENY Z OBRAZKA KEEPA
    // ==========================================
    /**
     * Keepa drukuje aktualne ceny w legendzie wykresu. Obrazek wychodzi
     * z nagłówkami CORS, więc piksele są dostępne przez canvas i cenę da się
     * odczytać jako liczbę — bez klucza API i bez zapytań do Amazona.
     *
     * Własny odczyt zamiast biblioteki OCR: font legendy jest rastrowy
     * i niezmienny (166 glifów z 20 produktów to 16 kształtów zgodnych piksel
     * w piksel), więc to wyszukiwanie w tablicy, a nie rozpoznawanie.
     * Na 32 wierszach legendy: ten odczyt 32/32 w 0,14 ms, tesseract.js 13/20
     * w 140 ms plus kilka MB pobierania — i to z błędami zawyżającymi cenę
     * („5.99” -> „599”). Porównanie wzorców nie zgaduje: przy niezgodności
     * zwraca null.
     */
    const KeepaOCR = {
        // Znak ma 7 pikseli wysokości. '#' — atrament, '.' — tło.
        // Wzorce wyuczone z pikseli obrazków o znanych cenach.
        GLYPHS: {
            '0': ['.####','##..#','##..#','##..#','##..#','##..#','.####'],
            '1': ['###','###','.##','.##','.##','.##','.##'],
            '2': ['.####','##..#','....#','...#.','..##.','.##..','#####'],
            '3': ['.####','##..#','...##','..##.','....#','##..#','.####'],
            '4': ['...##','..###','.####','.#.##','#####','#####','...##'],
            '5': ['####','#...','###.','####','...#','#..#','####'],
            '6': ['..##.','.#...','.###.','##.##','##..#','.#..#','.####'],
            '7': ['#####','....#','...##','...#.','..##.','..#..','.##..'],
            '8': ['.####','##..#','.#.##','.###.','##..#','##..#','.####'],
            '9': ['.####','##..#','##..#','.#.##','.####','...##','.###.'],
            '.': ['.','.','.','.','.','.','#'],
        },
        // Kolor znacznika 8x8 na lewo od podpisu rozpoznaje serię.
        SERIES: [
            { name: 'Amazon', rgb: [255, 165, 0] },
            { name: 'Neu',    rgb: [136, 136, 221] },
        ],

        _tpl: null,
        templates() {
            if (this._tpl) return this._tpl;
            this._tpl = new Map();
            for (const [ch, rows] of Object.entries(this.GLYPHS)) {
                const w = rows[0].length, cols = [];
                for (let x = 0; x < w; x++) {
                    let c = '';
                    for (let y = 0; y < rows.length; y++) c += rows[y][x] === '#' ? '1' : '0';
                    cols.push(c);
                }
                this._tpl.set(ch, cols);
            }
            return this._tpl;
        },

        /**
         * Adres obrazka wykresu. ASIN pochodzi ze strony, więc musi mieć format
         * (dziesięć znaków A-Z0-9), a nie tylko być zakodowany: zakotwiczony
         * wzorzec odcina doklejenie parametrów, a przy niezgodności leci
         * wyjątek zamiast zapytania.
         */
        url(asin, market) {
            const clean = String(asin || '').toUpperCase();
            if (!/^[A-Z0-9]{10}$/.test(clean)) throw new Error('niedozwolony ASIN: ' + asin);
            return `https://graph.keepa.com/pricehistory.png?asin=${encodeURIComponent(clean)}`
                 + `&domain=${encodeURIComponent(marketplace(market).keepa)}&range=${Number(CONFIG.PRICE_KEEPA_RANGE) || 3}`;
        },

        /**
         * Obrazek do rozbioru — ładuje się w tle, do dokumentu nie trafia.
         *   crossOrigin    — bez niego canvas jest skażony i getImageData
         *                    rzuca SecurityError;
         *   referrerPolicy — bez niego Keepa nie oddaje obrazka.
         * Widoczny <img> wykresu (tryb 'graph') jest bez crossOrigin — tam
         * piksele nie są potrzebne.
         *
         * Najniższy poziom, na którym skrypt dotyka sieci, więc stoi tu twarde
         * sprawdzenie modułu cen: nowa ścieżka wywołania bez sprawdzenia wyżej
         * i tak nie wyśle zapytania.
         */
        loadImage(asin, timeoutMs, market) {
            if (!priceModuleOn()) {
                return Promise.reject(new Error('moduł cen wyłączony — zapytanie nie zostało wysłane'));
            }
            return new Promise((res, rej) => {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.referrerPolicy = 'no-referrer';
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true; im.src = '';
                    rej(new Error('przekroczony czas oczekiwania na obrazek'));
                }, timeoutMs || CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                im.onload = () => { if (done) return; done = true; clearTimeout(timer); res(im); };
                im.onerror = () => { if (done) return; done = true; clearTimeout(timer); rej(new Error('obrazek się nie załadował')); };
                im.src = this.url(asin, market);
            });
        },

        pixels(im) {
            const c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(im, 0, 0);
            try {
                return ctx.getImageData(0, 0, c.width, c.height);
            } catch (e) {
                // cause zachowuje pierwotny SecurityError — widać, co dokładnie
                // zablokowała przeglądarka.
                throw new Error('canvas skażony — obrazek bez crossOrigin', { cause: e });
            }
        },

        isInk(px, x, y) {
            const i = (y * px.width + x) * 4;
            return (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3 < CONFIG.PRICE_OCR_INK_THRESHOLD;
        },

        bandColumns(px, y0, y1) {
            const out = [];
            for (let x = CONFIG.PRICE_OCR_SCAN_FROM_X; x < px.width; x++) {
                let c = '';
                for (let y = y0; y <= y1; y++) c += this.isInk(px, x, y) ? '1' : '0';
                out.push(c);
            }
            return out;
        },

        /**
         * Czy w pasie jest podpis. Przy jednej serii drugi pas jest pusty poza
         * pionową osią wykresu — bez tego sprawdzenia oś brałaby się za tekst.
         */
        hasContent(cols) {
            let ink = 0;
            for (let i = 2; i < cols.length; i++) if (cols[i].includes('1')) ink++;
            return ink > 3;
        },

        /**
         * Separator dziesiętny rozpoznaje reguła, a nie bitmapa.
         *
         * Keepa rysuje wiersz z przesunięciem subpikselowym, więc wygładzona
         * kropka ma raz jedną, raz dwie kolumny — wzorzec by jej nie złapał.
         * Kropka to kolejne kolumny z atramentem wyłącznie w dolnym wierszu
         * znaku; cyfry zajmują pełną wysokość, więc reguła nie przechwyci
         * cudzego glifu. Najwyżej dwie kolumny — dłuższy ogon to podkreślenie
         * albo siatka.
         *
         * @returns {number} ile kolumn zjeść (0 — to nie separator)
         */
        dotRun(cols, x) {
            let n = 0;
            while (x + n < cols.length) {
                const c = cols[x + n];
                if (!c.includes('1')) break;                 // pusto
                if (c.slice(0, -1).includes('1')) break;     // atrament wyżej niż dolny wiersz
                n++;
            }
            return (n >= 1 && n <= 2) ? n : 0;
        },

        /**
         * Rozbiór wiersza oknem przesuwnym. Segmentacja po pustych kolumnach
         * nie działa, bo sąsiednie glify się sklejają („90” to jeden blok).
         *
         * Wygrywa najdłuższy pełny rozbiór ze wszystkich pozycji startowych:
         * podpis serii i „€” na lewo od ceny nie pasują do żadnej cyfry, więc
         * rozbiór od nich nie dochodzi do końca, a start od środka ceny
         * zgubiłby najstarszy rząd („15.51” jako „5.51”).
         */
        readPrice(cols) {
            const L = cols.length;
            // '.' wyłączona z przeglądu: łapie ją dotRun() po regule powyżej.
            const tpl = [...this.templates().entries()]
                .filter(([ch]) => ch !== '.')
                .sort((a, b) => b[1].length - a[1].length);
            const blank = (c) => !c.includes('1');

            const parseFrom = (start) => {
                let x = start, out = '';
                while (x < L) {
                    while (x < L && blank(cols[x])) x++;
                    if (x >= L) break;
                    const dn = this.dotRun(cols, x);
                    if (dn) { out += '.'; x += dn; continue; }
                    let hit = null;
                    for (const [ch, t] of tpl) {
                        if (x + t.length > L) continue;
                        let ok = true;
                        for (let i = 0; i < t.length; i++) if (cols[x + i] !== t[i]) { ok = false; break; }
                        if (ok) { hit = [ch, t.length]; break; }
                    }
                    if (!hit) return null;
                    out += hit[0]; x += hit[1];
                }
                return out;
            };

            let best = null, bestRaw = '';
            for (let s = 0; s < L; s++) {
                if (blank(cols[s])) continue;
                const t = parseFrom(s);
                if (!t) continue;
                const d = this.toDecimal(t);
                // Długość surowego rozbioru, a nie liczby: odróżnia „2.991.39”
                // od jego kawałka „991.39”.
                if (d && t.length > bestRaw.length) { best = d; bestRaw = t; }
            }
            return best;
        },

        /**
         * Surowy rozbiór na liczbę dziesiętną, z separatorem tysięcy.
         *
         * Przecinek w pasie legendy wygląda jak kropka (jego ogon jest pod
         * pasem), więc „€ 2,991.39” przychodzi jako „2.991.39”. Rozstrzyga
         * pozycja: separator dziesiętny jest zawsze ostatni, wszystko na lewo
         * to grupowanie rzędów — tak samo dla „2,991.39” i „2.991,39”. Gdyby
         * forma z tysiącami była odrzucana, najdłuższym poprawnym rozbiorem
         * zostałby kawałek „991.39” — cena zaniżona o 2000 €, po cichu.
         *
         * Grupy sztywno po trzy cyfry: obcinki w rodzaju „.991.39” czy
         * „12.34.56” formy nie przechodzą.
         *
         * @param {string} text — surowy rozbiór, w którym każdy separator to '.'
         * @returns {string|null} łańcuch typu „2991.39” dla parseFloat
         */
        PRICE_SHAPE: /^\d{1,3}(?:\.\d{3})+\.\d{2}$|^\d{1,5}\.\d{2}$/,

        toDecimal(text) {
            if (!this.PRICE_SHAPE.test(text)) return null;
            const i = text.lastIndexOf('.');
            return text.slice(0, i).split('.').join('') + '.' + text.slice(i + 1);
        },

        /**
         * Nazwa serii po kolorze kółka na lewo od podpisu. Szukanie zaczyna się
         * od PRICE_OCR_SERIES_FROM_X, bo przy długiej cenie kółko wychodzi na
         * lewo od granicy tekstu. W szersze okno wchodzi kawałek pola wykresu,
         * stąd warunek nasycenia (wypełnienie jest blade, znacznik czysty).
         * Pomyłka jest tania: nazwa serii tylko się pokazuje, a cenę wybiera
         * pickHighest po liczbie.
         */
        seriesOf(px, y0) {
            const y = y0 + 3;
            const to = CONFIG.PRICE_OCR_SCAN_FROM_X + 20;
            for (let x = CONFIG.PRICE_OCR_SERIES_FROM_X; x < to; x++) {
                const i = (y * px.width + x) * 4;
                const [r, g, b] = [px.data[i], px.data[i + 1], px.data[i + 2]];
                if (r === g && g === b) continue;                        // szare: oś, siatka, tekst
                if (r > 240 && g > 240 && b > 240) continue;             // prawie białe: tło
                const chroma = Math.max(r, g, b) - Math.min(r, g, b);
                if (chroma < CONFIG.PRICE_OCR_SERIES_MIN_CHROMA) continue;  // blade wypełnienie
                let best = null, bd = 1e9;
                for (const s of this.SERIES) {
                    const d = Math.abs(r - s.rgb[0]) + Math.abs(g - s.rgb[1]) + Math.abs(b - s.rgb[2]);
                    if (d < bd) { bd = d; best = s.name; }
                }
                if (bd < 120) return best;
            }
            return '?';
        },

        /** Wszystkie wiersze legendy: [{series, price}]. */
        readAll(px) {
            const rows = [];
            for (const [y0, y1] of CONFIG.PRICE_OCR_BANDS) {
                const cols = this.bandColumns(px, y0, y1);
                if (!this.hasContent(cols)) continue;
                rows.push({ series: this.seriesOf(px, y0), price: this.readPrice(cols) });
            }
            return rows;
        },

        /**
         * Najwyższa cena z wierszy legendy. Do ewidencji liczy się cena
         * przedmiotu, a nie najtańsza oferta; wiersz Amazon jest zwykle wyżej
         * niż Neu. Wybór po liczbie, a nie po nazwie serii — działa także bez
         * wiersza Amazon i przy innej kolejności wierszy.
         */
        pickHighest(rows) {
            let best = null;
            for (const r of rows) {
                if (!r.price) continue;
                const v = parseFloat(r.price);
                if (!isFinite(v)) continue;
                if (!best || v > best.value) best = { value: v, price: r.price, series: r.series };
            }
            return best;
        },

        /**
         * Pełny cykl: wczytać obrazek, rozebrać, zwrócić ceny.
         * @param {string} [market] — rynek; bez niego bierze się wybrany.
         */
        async read(asin, market) {
            const im = await this.loadImage(asin, undefined, market);
            const px = this.pixels(im);
            const rows = this.readAll(px);
            const top = this.pickHighest(rows);
            if (!top) return null;
            const second = rows
                .filter(r => r.price && r.price !== top.price)
                .map(r => ({ series: r.series, text: `${r.series} ${r.price}` }))[0] || null;
            return { top, second, rows };
        },
    };
