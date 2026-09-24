    // ==========================================
    // 6c. ŹRÓDŁA CEN I KURSÓW — JEDYNE MIEJSCE, KTÓRE ZNA SIEĆ ZEWNĘTRZNĄ
    // ==========================================
    /**
     * Wszystko, co wie, SKĄD przychodzi cena produktu i kurs waluty, stoi
     * w tym pliku. Karta ceny, dziennik wartości, kursy walut i panel znają
     * tylko kontrakt opisany niżej — nie znają ani hostów, ani formatów
     * odpowiedzi. Wymiana źródeł (np. na wewnętrzne API) to przepisanie tego
     * pliku według kontraktu; reszta skryptu tego nie zauważy.
     *
     * Zawartość:
     *   PriceNet     — jedyne wyjście do sieci modułu cen: zapytanie HTTP
     *                  i obrazek w tle, każde z twardym priceModuleOn();
     *   KeepaOCR     — odczyt ceny z pikseli wykresu Keepa;
     *   PriceSources — źródła ceny i kursów według kontraktu.
     *
     * KONTRAKT ŹRÓDŁA CENY — element PriceSources.list():
     *   name          nazwa w wierszu źródła karty i w logach;
     *   kind          'image' | 'text' — który licznik i limit zapytań się
     *                 liczy i która blokada CSP (img-src / connect-src)
     *                 wyłącza źródło;
     *   available     czy źródło jest w użyciu przy bieżących ustawieniach
     *                 karty; false — pomijane;
     *   marketSearch  czy nadaje się do przeglądu innych sklepów, gdy
     *                 w wybranym ceny nie ma;
     *   run(asin, signal, market) → Promise<PriceResult|null>
     *                 null — źródło odpowiedziało, ceny nie ma;
     *                 wyjątek — awaria (sieć, HTTP, format odpowiedzi);
     *                 `signal` przerywa zapytanie po limicie czasu, `market`
     *                 to klucz z CONFIG.MARKETPLACES (bez niego: wybrany).
     *
     *   PriceResult = { current: Money|null, rrp: Money|null, stale: boolean,
     *                   secondary?: { text }, series?: string, market?: string }
     *   Money       = { value: number, currency: string, text: string }
     *                 — waluta musi mieć kurs w CONFIG.FX_FALLBACK, inaczej
     *                 kwota nie wejdzie do sum w euro (PriceSources.money()).
     *
     * Pozostała część kontraktu (opisy przy polach): modes, chart, cspHosts,
     * coversMarket(), fxProviders, probes().
     *
     * Kolejność list jest kolejnością pytania. Limity, przerwy między
     * zapytaniami, limit czasu, przegląd sklepów i blokady CSP prowadzi karta
     * ceny (PriceCard) — źródło tylko pyta i rozbiera odpowiedź.
     */
    const PriceNet = {
        /**
         * Zapytanie HTTP. `init` idzie do fetch bez zmian — tędy wchodzą
         * `signal`, nagłówki, `cache` i `credentials` (np. 'include' dla
         * usługi, która rozpoznaje zalogowanego pracownika po ciasteczkach
         * przeglądarki).
         *
         * Najniższy poziom, na którym moduł cen dotyka sieci, więc stoi tu
         * twarde sprawdzenie modułu: nowa ścieżka wywołania bez sprawdzenia
         * wyżej i tak nie wyśle zapytania.
         */
        request(url, init) {
            if (!priceModuleOn()) {
                return Promise.reject(new Error('moduł cen wyłączony — zapytanie nie zostało wysłane'));
            }
            return fetch(url, init);
        },

        /**
         * Obrazek ładowany w tle, poza dokumentem.
         *   crossOrigin    — 'anonymous', gdy potrzebne są piksele: bez niego
         *                    canvas jest skażony i getImageData rzuca
         *                    SecurityError; null — sam fakt załadowania;
         *   referrerPolicy — Keepa oddaje obrazek tylko bez nagłówka Referer.
         * Po limicie czasu ładowanie jest przerywane (`src = ''`).
         *
         * Sprawdzenie modułu cen — jak w request().
         */
        image(url, { timeoutMs, crossOrigin = 'anonymous', referrerPolicy = 'no-referrer' } = {}) {
            if (!priceModuleOn()) {
                return Promise.reject(new Error('moduł cen wyłączony — zapytanie nie zostało wysłane'));
            }
            return new Promise((res, rej) => {
                const im = new Image();
                if (crossOrigin) im.crossOrigin = crossOrigin;
                im.referrerPolicy = referrerPolicy;
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true; im.src = '';
                    rej(new Error('przekroczony czas oczekiwania na obrazek'));
                }, timeoutMs || CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                im.onload = () => { if (done) return; done = true; clearTimeout(timer); res(im); };
                im.onerror = () => { if (done) return; done = true; clearTimeout(timer); rej(new Error('obrazek się nie załadował')); };
                im.src = url;
            });
        },
    };

    /**
     * ODCZYT CENY Z OBRAZKA KEEPA.
     *
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
         * Obrazek do rozbioru — przez PriceNet.image(), z crossOrigin, bo
         * potrzebne są piksele. Widoczny <img> wykresu (tryb 'graph') idzie
         * bez crossOrigin — tam pikseli się nie czyta.
         *
         * Zły ASIN kończy się odrzuceniem obietnicy, a nie wyjątkiem.
         */
        loadImage(asin, timeoutMs, market) {
            let url;
            try { url = this.url(asin, market); } catch (e) { return Promise.reject(e); }
            return PriceNet.image(url, { timeoutMs });
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

    /**
     * ŹRÓDŁA CENY I KURSÓW według kontraktu z nagłówka pliku.
     *
     * Zapytanie do amazon.* ze strony T-REX jest niemożliwe (Same-Origin
     * Policy: zwykły fetch, XHR, no-cors, iframe, script src i widżety
     * partnerskie są blokowane; Tampermonkey obchodzi to tylko dlatego, że
     * GM_xmlhttpRequest działa w kontekście rozszerzenia). Dlatego źródła są
     * pośrednie:
     *   graph.keepa.com — obrazek wykresu; cena odczytana z pikseli;
     *   api.keepa.com   — oficjalne API, tylko z płatnym kluczem;
     *   r.jina.ai       — tekst strony produktu, oddaje nagłówki CORS.
     */
    const PriceSources = {
        /**
         * Wartości ustawienia `priceCard.source` w kolejności panelu, od
         * zalecanej. Wartość siedzi w zapisanych ustawieniach i w kodzie
         * ustawień, więc nowe źródło dostaje nową wartość, a istniejących się
         * nie przemianowuje. Nową wartość dopisuje się też NA KONIEC
         * ConfigCode.ENUMS.source — inaczej kod ustawień jej nie przeniesie.
         *   showsChart — w tym trybie karta pokazuje obrazek wykresu (chart);
         *   readsImage — cena pochodzi z obrazka, więc blokada img-src znaczy
         *                „nie ma skąd przeczytać ceny”, a nie „nie ma wykresu”.
         */
        modes: [
            { value: 'ocr',   labelKey: 'priceCard_src_ocr', readsImage: true },
            { value: 'graph', labelKey: 'priceCard_src_graph', showsChart: true },
            { value: 'jina',  labelKey: 'priceCard_src_jina' },
        ],

        /** Opis trybu po wartości ustawienia albo null. */
        mode(value) { return this.modes.find(m => m.value === value) || null; },

        /** Czy w tym trybie karta pokazuje obrazek wykresu. */
        showsChart(value) {
            const m = this.mode(value);
            return !!(this.chart && m && m.showsChart);
        },

        /**
         * Obrazek wykresu do pokazania na karcie albo null, gdy źródła nie
         * mają wykresu (karta chowa wtedy ramkę i opcje wykresu w panelu).
         *   url(asin, market) — adres obrazka;
         *   width, height     — natywny rozmiar obrazka w pikselach;
         *   legend            — prostokąt z samymi cenami {x, y, w, h}, do
         *                       trybu „tylko blok z cenami”.
         * Wartości czytane w chwili rysowania, więc zmiana CONFIG w locie
         * działa od razu.
         */
        chart: {
            url(asin, market) { return KeepaOCR.url(asin, market); },
            get width() { return CONFIG.PRICE_KEEPA_PNG_W; },
            get height() { return CONFIG.PRICE_KEEPA_PNG_H; },
            get legend() {
                return {
                    x: CONFIG.PRICE_KEEPA_LEGEND_X, y: CONFIG.PRICE_KEEPA_LEGEND_Y,
                    w: CONFIG.PRICE_KEEPA_LEGEND_W, h: CONFIG.PRICE_KEEPA_LEGEND_H,
                };
            },
        },

        /**
         * Hosty źródeł ceny z dyrektywą CSP, której potrzebują. Blokada na
         * którymś z nich wyłącza źródła tego rodzaju (PriceCard.csp), a raport
         * SH.cspReport() sprawdza je po kolei.
         */
        cspHosts: {
            'graph.keepa.com': 'img-src',
            'r.jina.ai': 'connect-src',
            'api.keepa.com': 'connect-src',
        },

        /**
         * Czy źródła mają dane dla rynku. Keepa dla Polski oddaje pusty wykres:
         * link działa, ceny nie będzie — panel ostrzega, a przegląd sklepów
         * takie rynki pomija.
         */
        coversMarket(key) {
            const m = CONFIG.MARKETPLACES[key];
            return !!(m && m.keepa_ok);
        },

        /** Kwota w postaci wspólnej dla wszystkich źródeł (Money). */
        money(value, currency) {
            return { value, currency, text: `${currency} ${value.toFixed(2)}` };
        },

        // ---------------- rozbiór odpowiedzi ----------------
        /**
         * Kwota w tekście strony. Waluta ze ścisłej listy, a nie [A-Z]{3}
         * (szeroki wzorzec łapie „UTF 8.00” z parametru ?ie=UTF8), grosze
         * obowiązkowe (Amazon drukuje zawsze dwa miejsca). Tekst pochodzi
         * z obcego serwisu, więc wzorzec przepuszcza wyłącznie to, co wygląda
         * jak kwota — i wyłącznie waluty, które da się przeliczyć (test pilnuje
         * zgodności z CONFIG.FX_FALLBACK).
         */
        MONEY: String.raw`(?:(EUR|USD|GBP|PLN|SEK|CAD)\s?|(€|\$|£|zł)\s?)(\d{1,3}(?:[., ]\d{3})*[.,]\d{2})`,

        /**
         * Symbol waluty → kod z tablicy kursów. Symbol przepuszczony dalej
         * jako „waluta” nie miałby kursu i kwota wypadłaby z sumy zmiany.
         * „$” zależy od rynku: na amazon.ca to dolar kanadyjski.
         */
        symbolCode(symbol) {
            if (symbol === '$') return store.userConfig.marketplace === 'ca' ? 'CAD' : 'USD';
            return { '€': 'EUR', '£': 'GBP', 'zł': 'PLN' }[symbol] || '';
        },

        normalize(currency, symbol, amount) {
            const cur = currency || this.symbolCode(symbol);
            let a = String(amount).replace(/[ \s]/g, '');
            const ld = a.lastIndexOf('.'), lc = a.lastIndexOf(',');
            if (ld >= 0 && lc >= 0) {
                a = lc > ld ? a.replace(/\./g, '').replace(',', '.') : a.replace(/,/g, '');
            } else if (lc >= 0) {
                a = (a.length - lc - 1) === 2 ? a.replace(',', '.') : a.replace(/,/g, '');
            }
            const n = parseFloat(a);
            return isNaN(n) ? null : this.money(n, cur);
        },

        /**
         * Rozbiór odpowiedzi r.jina.ai w dwóch trybach. Odpowiedź adresowana
         * (x-target-selector) to jeden blok ceny i pierwsza kwota jest ceną.
         * Cała strona (ok. 200 KB) zawiera kilkanaście kwot — tam cenę bierze
         * się tylko po kotwicy „… with N percent savings”.
         */
        parseJina(text, targeted) {
            const body = text.split('Markdown Content:').pop() || '';
            const stale = /cached snapshot/i.test(text);
            // O trybie mówi dostawca (`targeted`), a nie długość ciała — strona
            // zgody na ciasteczka też jest krótka, a ceny na niej nie ma.
            const M = this.MONEY;

            const rrpM = body.match(new RegExp(String.raw`(?:RRP|UVP|Statt|List Price):\s*` + M, 'i'));
            const rrp = rrpM ? this.normalize(rrpM[1], rrpM[2], rrpM[3]) : null;

            const anchored = body.match(new RegExp(M + String.raw`\s+with\s+[\d.,]+\s+percent savings`, 'i'));
            let current = anchored ? this.normalize(anchored[1], anchored[2], anchored[3]) : null;

            if (!current && targeted) {
                const m = (body.split(/RRP:|UVP:|List Price:/i)[0]).match(new RegExp(M));
                if (m) current = this.normalize(m[1], m[2], m[3]);
            }
            if (!current && !rrp) return null;
            return { current, rrp, stale };
        },

        /**
         * Wynik rozbioru obrazka do wspólnej postaci. Waluta pochodzi z rynku,
         * z którego zdjęto cenę — przy przeglądzie sklepów to nie wybrany sklep.
         */
        ocrResult(d, market) {
            const key = market || marketplaceKey();
            return {
                current: this.money(d.top.value, marketplace(key).currency),
                rrp: null,
                secondary: d.second ? { text: d.second.text } : null,
                series: d.top.series,
                market: key,
                stale: false,
            };
        },

        // ---------------- źródła ceny ----------------
        /** Źródła ceny w kolejności pytania (kontrakt w nagłówku pliku). */
        list() {
            const self = this;
            const jinaUrl = (asin) => `https://r.jina.ai/https://${marketplace().host}/dp/${encodeURIComponent(asin)}`;
            return [
                {
                    /**
                     * Cena odczytana z obrazka wykresu — pierwsza i domyślna:
                     * nie wymaga klucza ani obcego proxy, tylko obrazka
                     * z graph.keepa.com. Działa też w trybie 'graph' (różnica
                     * to tylko to, czy obrazek się pokazuje), więc dziennik
                     * napełnia się niezależnie od widoku.
                     */
                    name: 'keepa-ocr',
                    kind: 'image',
                    get available() {
                        const pc = store.localTabConfig.priceCard;
                        return pc.source === 'ocr' || pc.source === 'graph' || !!pc.logValues;
                    },
                    // r.jina.ai rozbiera szablon konkretnej witryny — gonienie
                    // go po obcych rynkach nie ma sensu, więc w trybie 'jina'
                    // przeglądu sklepów nie ma.
                    get marketSearch() { return store.localTabConfig.priceCard.source !== 'jina'; },
                    async run(asin, signal, market) {
                        const d = await KeepaOCR.read(asin, market);
                        return d ? self.ocrResult(d, market) : null;
                    },
                },
                {
                    // Oficjalne API Keepa: oddaje CORS, wymaga płatnego klucza.
                    // Z kluczem to najlepsze źródło — dokładna cena bez
                    // rozbierania szablonu strony.
                    name: 'keepa-api',
                    kind: 'text',
                    get available() { return !!CONFIG.PRICE_KEEPA_API_KEY; },
                    marketSearch: false,
                    async run(asin, signal) {
                        const u = `https://api.keepa.com/product?key=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_KEY)}`
                                + `&domain=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_DOMAIN)}&asin=${encodeURIComponent(asin)}&stats=1&history=0`;
                        const r = await PriceNet.request(u, { signal });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        const j = await r.json();
                        const p = j.products && j.products[0];
                        if (!p) throw new Error('produktu nie znaleziono');
                        const cents = (v) => (typeof v === 'number' && v > 0) ? v / 100 : null;
                        const st = p.stats || {};
                        const cur = cents(st.current && st.current[1]) ?? cents(st.current && st.current[0]);
                        const rrp = cents(p.listPrice);
                        if (cur == null && rrp == null) throw new Error('w odpowiedzi nie ma cen');
                        const mk = (v) => v == null ? null : self.money(v, 'EUR');
                        return { current: mk(cur), rrp: mk(rrp), stale: false };
                    },
                },
                {
                    name: 'jina/blok',
                    kind: 'text',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    marketSearch: false,
                    async run(asin, signal) {
                        const r = await PriceNet.request(jinaUrl(asin), {
                            signal,
                            headers: {
                                'x-target-selector': CONFIG.PRICE_JINA_SELECTOR,
                                'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S),
                            },
                        });
                        // 422 = bloku na stronie nie ma (inny szablon, strona
                        // zgody na ciasteczka) — próbujemy następnego trybu.
                        if (r.status === 422) throw new Error('nie ma bloku z ceną');
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), true);
                    },
                },
                {
                    name: 'jina/strona',
                    kind: 'text',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    marketSearch: false,
                    async run(asin, signal) {
                        const r = await PriceNet.request(jinaUrl(asin), {
                            signal,
                            headers: { 'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S) },
                        });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), false);
                    },
                },
            ];
        },

        // ---------------- kursy walut ----------------
        /**
         * ŹRÓDŁA KURSÓW WALUT, pytane po kolei do pierwszego sukcesu
         * (FxRates.init). Wszystkie oddają nagłówki CORS i nie wymagają klucza.
         *   url  — adres zapytania (odpowiedź JSON);
         *   pick — z odpowiedzi wyciąga { WALUTA: jednostek za 1 EUR };
         *          resztę sprawdza FxRates.normalize().
         * Dokładność co do grosza nie jest potrzebna: to szacunek wyniku
         * zmiany, a nie księgowość.
         */
        fxProviders: [
            { name: 'jsdelivr', url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
              pick: (j) => j && j.eur },
            { name: 'er-api',   url: 'https://open.er-api.com/v6/latest/EUR',
              pick: (j) => j && j.rates },
            // floatrates oddaje kurs łańcuchem („1.15514929”) — stąd Number().
            { name: 'floatrates', url: 'https://www.floatrates.com/daily/eur.json',
              pick: (j) => { if (!j) return null; const o = {}; for (const k in j) o[k] = j[k] && Number(j[k].rate); return o; } },
        ],

        // ---------------- diagnostyka ----------------
        /**
         * Sprawdzenia faktyczne do SH.cspReport(): czy obrazek i zapytanie
         * źródeł naprawdę przechodzą przez politykę strony. Wołane tylko przy
         * włączonym module cen (PriceNet i tak by odmówił).
         * @returns {Array<{label: string, run: () => Promise<string>}>}
         */
        probes() {
            return [
                {
                    label: 'obrazek Keepa',
                    // Sam fakt załadowania — piksele niepotrzebne, więc bez crossOrigin.
                    run: () => PriceNet.image(KeepaOCR.url('B0915C748N'), { timeoutMs: 8000, crossOrigin: null })
                        .then(im => (im.naturalWidth > 10 ? 'załadowany' : 'pusty'),
                              e => (/czas/.test(e.message) ? 'przekroczony czas' : 'ZABLOKOWANY')),
                },
                {
                    label: 'zapytanie r.jina.ai',
                    run: () => PriceNet.request('https://r.jina.ai/https://example.com', {
                        headers: { 'x-cache-tolerance': '259200' },
                    }).then(r => 'przeszedł, HTTP ' + r.status, e => 'ZABLOKOWANY (' + e.message + ')'),
                },
            ];
        },
    };
