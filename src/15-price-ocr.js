    // ==========================================
    // 6c. ODCZYT CENY Z OBRAZKA KEEPA (8.4.0)
    // ==========================================
    /**
     * Keepa drukuje aktualne ceny wprost w legendzie wykresu. Obrazek wychodzi
     * z nagłówkami CORS, więc piksele są dostępne przez canvas — i cenę da się
     * dostać LICZBĄ, bez płatnego klucza API i bez zapytań do Amazona.
     *
     * DLACZEGO WŁASNY ODCZYT, A NIE GOTOWA BIBLIOTEKA. Rozbiór pikseli 20
     * prawdziwych produktów (stanowisko ocr_verify.html) pokazał: font legendy
     * jest RASTROWY i NIEZMIENNY — ten sam znak u różnych produktów zgadza się
     * piksel w piksel, 166 egzemplarzy glifów sprowadziło się do 16 kształtów.
     * To nie jest zadanie rozpoznawania, tylko wyszukiwania w tablicy.
     *
     * Pomiar na tych samych 20 produktach (32 wiersze legendy):
     *   ten odczyt    32/32,  0,14 ms,  bez zależności
     *   tesseract.js  13/20,   140 ms,  +315 ms start, ~2-4 MB pobierania
     *
     * Przy czym błędy tesseracta są groźne właśnie dla ewidencji: gubi kropkę
     * dziesiętną („5.99” -> „599”) i myli rzędy („17.90” -> „175.90”), czyli
     * kłamie W STRONĘ ZAWYŻENIA i po cichu. Porównanie z wzorcami tak pomylić
     * się nie może: sprawdza glify bit po bicie, a przy niezgodności nie zgaduje
     * najbliższego, tylko zwraca null.
     */
    const KeepaOCR = {
        // Znak ma 7 pikseli wysokości. '#' — atrament, '.' — tło.
        // Alfabet wyuczony automatycznie po znanych cenach, patrz ocr_probe.js
        // (OCR.learn) — tam też można go dobudować, gdyby Keepa zmieniła font.
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
         * Adres obrazka wykresu.
         *
         * ASIN jest tu WYMUSZANY do formatu (dziesięć znaków A-Z0-9), a nie
         * tylko kodowany. Powód: adres składa się łańcuchem, a ASIN pochodzi ze
         * strony — czyli z zewnątrz. Kotwiczony wzorzec odcina próbę doklejenia
         * własnych parametrów albo podmiany ścieżki, a przy niezgodności rzuca
         * wyjątek, zamiast wysyłać cokolwiek w sieć.
         */
        url(asin, market) {
            const clean = String(asin || '').toUpperCase();
            if (!/^[A-Z0-9]{10}$/.test(clean)) throw new Error('niedozwolony ASIN: ' + asin);
            return `https://graph.keepa.com/pricehistory.png?asin=${encodeURIComponent(clean)}`
                 + `&domain=${encodeURIComponent(marketplace(market).keepa)}&range=${Number(CONFIG.PRICE_KEEPA_RANGE) || 3}`;
        },

        /**
         * Obrazek do rozbioru. Ładuje się W TLE i do dokumentu nie trafia.
         *
         * Oba atrybuty są obowiązkowe i z różnych powodów:
         *   crossOrigin    — bez niego canvas jest „skażony” (tainted)
         *                    i getImageData rzuca SecurityError, czyli pikseli
         *                    nie widać;
         *   referrerPolicy — bez niego Keepa nie oddaje obrazka w ogóle.
         * Widoczny <img> wykresu zostaje BEZ crossOrigin: tam piksele nie są
         * potrzebne, a zbędnego nagłówka Origin w trybie roboczym nie ma po co
         * zmieniać.
         *
         * 9.2.0 — BEZPIECZNIK SIECIOWY. To jest najniższy poziom, na którym
         * skrypt dotyka sieci zewnętrznej, więc stoi tu twarde sprawdzenie
         * modułu cen. Gdyby ktoś dorobił nową ścieżkę wywołania i zapomniał
         * o sprawdzeniu wyżej, zapytanie i tak nie wyjdzie.
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
                // cause zachowuje pierwotny SecurityError: bez niego w konsoli zostaje
                // sam nasz komunikat i nie widać, co dokładnie zablokowała przeglądarka.
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
         * Czy w pasie jest podpis.
         *
         * Produkt może mieć jedną serię zamiast dwóch i wtedy drugi pas jest
         * pusty — ale nie całkiem: zostaje w nim pionowa oś wykresu. Bez tego
         * sprawdzenia oś bierze się za tekst.
         */
        hasContent(cols) {
            let ink = 0;
            for (let i = 2; i < cols.length; i++) if (cols[i].includes('1')) ink++;
            return ink > 3;
        },

        /**
         * Separator dziesiętny opisuje REGUŁA, a nie bitmapa (8.4.1).
         *
         * Znalezione na 60 nowych produktach z bestsellerów amazon.de: przy
         * „€ 12.99” i „€ 12.27” odczyt zwracał „nie przeczytano”, choć wszystkie
         * cyfry zgadzały się z wzorcami. Przyczyna — kropka szerokości DWÓCH
         * pikseli zamiast jednego. Keepa rysuje wiersz z subpikselowym
         * przesunięciem zależnym od jego pełnej szerokości, a wygładzona kropka
         * raz mieści się w jednej kolumnie, raz rozlewa na dwie. Odczyt czytał
         * „12..99” i odrzucał wynik jako niepodobny do ceny.
         *
         * Wyliczanie bitmap kropki na wszystkie przypadki to ślepa uliczka:
         * przesunięcie jest ciągłe. Dlatego kropka rozpoznaje się po tym, czym
         * w tym foncie JEST: kolejne kolumny, w których atrament stoi TYLKO
         * w dolnym wierszu znaku. Żadna cyfra się pod to nie podszywa — wszystkie
         * zajmują pełną wysokość — więc reguła nie może przechwycić cudzego glifu.
         *
         * Długość ograniczona do dwóch kolumn: dłuższy ogon u dołu to już nie
         * separator, tylko podkreślenie albo linia siatki.
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
         * Rozbiór wiersza oknem przesuwnym.
         *
         * Dlaczego nie segmentacja po pustych kolumnach: sąsiednie glify SIĘ
         * SKLEJAJĄ („90” w „17.90” idzie jednym blokiem szerokości 10)
         * i granic po odstępach nie da się znaleźć. Okno przesuwne od sklejania
         * nie zależy.
         *
         * Dlaczego bierze się najdłuższy pasujący rozbiór: na lewo od ceny stoi
         * podpis serii i znak „€”, a one nie zgadzają się z żadnym wzorcem cyfry,
         * więc rozbiór z ich pozycji nie dochodzi do końca wiersza. Przejście po
         * wszystkich startach i wybór najdłuższego wyniku zdejmuje pytanie
         * o granicę słowa. To właśnie naprawia utratę najstarszego rzędu: bez
         * tego „15.51” czytało się jako „5.51”, a „11.89” jako „1.89”.
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
                // Długość porównuje się po SUROWYM rozbiorze, a nie po liczbie:
                // to właśnie ona odróżnia „2.991.39” od jego własnego kawałka „991.39”.
                if (d && t.length > bestRaw.length) { best = d; bestRaw = t; }
            }
            return best;
        },

        /**
         * SEPARATOR TYSIĘCY (9.1.1) — poprawka cichej utraty najstarszego rzędu.
         *
         * Złapane na B091FXSL4P (FLUKE networks Advanced-Kit): Keepa drukuje
         * „€ 2,991.39”, a odczyt zwracał „991.39”. Błąd 2000 € na jednym
         * przedmiocie, po cichu, z pozoru wiarygodną liczbą.
         *
         * Mechanizm. Przecinek-separator w pasie legendy wygląda jak kropka
         * (jego ogon schodzi PONIŻEJ znaku i w pas nie wchodzi), więc dotRun()
         * uczciwie czytał „2.991.39”. Poprzednie sprawdzenie `^\d{1,5}\.\d{2}$`
         * taki łańcuch odrzucało — są w nim dwie kropki — po czym reguła
         * „bierzemy najdłuższy pasujący rozbiór” wybierała „991.39”, bo TEN
         * kawałek sprawdzenie przechodził. Czyli odrzucenie poprawnej odpowiedzi
         * prowadziło nie do odmowy, tylko do wydania obciętej.
         *
         * Dlaczego rozstrzyga pozycja, a nie rozpoznanie przecinka. Przecinek od
         * kropki da się odróżnić — ma ogon pod wierszem. Ale to zbędne: cena ma
         * dokładnie jeden separator dziesiętny i jest on zawsze OSTATNI.
         * Wszystko na lewo to grupowanie rzędów. Reguła nie zależy od tego, który
         * znak jest który, więc tak samo poprawnie rozbiera angielskie
         * „2,991.39” i niemieckie „2.991,39”: oba przyjdą tu jako „2.991.39”
         * i oba dadzą 2991.39.
         *
         * Grupa sztywno po TRZY cyfry — i to jest zabezpieczenie przed śmieciem:
         * obcinki w rodzaju „.991.39” czy „12.34.56” formy nie przechodzą.
         *
         * @param {string} text — surowy rozbiór, w którym każdy separator to '.'
         * @returns {string|null} łańcuch typu „2991.39”, nadający się do parseFloat
         */
        PRICE_SHAPE: /^\d{1,3}(?:\.\d{3})+\.\d{2}$|^\d{1,5}\.\d{2}$/,

        toDecimal(text) {
            if (!this.PRICE_SHAPE.test(text)) return null;
            const i = text.lastIndexOf('.');
            return text.slice(0, i).split('.').join('') + '.' + text.slice(i + 1);
        },

        /**
         * Nazwa serii po kolorze kółka na lewo od podpisu.
         *
         * 9.1.1: szukanie zaczyna się od PRICE_OCR_SERIES_FROM_X, a nie od
         * granicy rozbioru tekstu. Legenda jest wyrównana do prawej i przy
         * długiej cenie kółko ucieka na lewo od 406 — wtedy seria nie była
         * rozpoznawana wcale.
         *
         * Ceną za szersze okno jest to, że wchodzi w nie kawałek pola wykresu,
         * więc doszedł warunek NASYCENIA: wypełnienie pod linią ceny to blady
         * odcień, znacznik to czysty kolor. Pomyłka kosztuje tu tanio: nazwa
         * serii tylko się pokazuje, a cena wybierana jest PO LICZBIE (patrz
         * pickHighest), więc na ewidencję nie wpływa.
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
         * NAJWYŻSZA cena z wierszy legendy.
         *
         * Do ewidencji potrzebna jest cena przedmiotu, a nie najtańsza oferta:
         * wiersz Amazon prawie zawsze stoi wyżej niż wiersz Neu (na próbkach —
         * 15,51 wobec 11,49, 10,95 wobec 9,20, 13,95 wobec 10,93). Wybór idzie
         * PO LICZBIE, a nie po nazwie serii: jeśli wiersza Amazon nie ma wcale,
         * zostanie Neu, a gdyby Keepa kiedyś zmieniła kolejność — reguła się nie
         * zepsuje.
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
