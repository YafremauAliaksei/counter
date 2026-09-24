    // ==========================================
    // 6f. KURSY WALUT
    // ==========================================
    /**
     * Przeliczanie walut przez euro.
     *
     * Cena przychodzi w walucie rynku (funty z co.uk, dolary z com, korony
     * ze se); dodawać ich wprost nie wolno, więc wszystko sprowadza się do euro.
     * Kursy pobiera się raz i trzyma dobę we wspólnym magazynie — kurs przez
     * zmianę nie przesunie się na tyle, żeby było to widać w wyniku (w odróżnieniu
     * od ceny produktu, pytanej przy każdym przedmiocie).
     *
     * Przy wyłączonym module cen kursów się nie pobiera: bierze się te z
     * localStorage, a gdy ich nie ma — CONFIG.FX_FALLBACK. Do sieci wychodzi
     * tylko init() po ręcznym włączeniu modułu.
     */
    const FxRates = {
        rates: null,        // { USD: 1.156, GBP: 0.856, ... } — jednostek za 1 EUR
        source: null,       // nazwa źródła albo 'wbudowane'
        fetchedAt: null,
        offline: false,     // true = kursy wzięte bez dotykania sieci

        key() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_FX_RATES; },

        /**
         * Normalizuje odpowiedź dostawcy do { WALUTA: liczba }. Kurs może
         * przyjść łańcuchem („1.15514929” u floatrates).
         *
         * Granica zaufania do sieci: wchodzi dowolny JSON z cudzego serwera,
         * wychodzi wyłącznie płaska tablica dodatnich, skończonych liczb pod
         * kluczami wielkimi literami.
         */
        normalize(raw) {
            if (!raw || typeof raw !== 'object') return null;
            const out = {};
            for (const k of Object.keys(raw)) {
                if (Utils.UNSAFE_KEYS.includes(k)) continue;
                const v = typeof raw[k] === 'string' ? Number(raw[k]) : raw[k];
                if (typeof v === 'number' && isFinite(v) && v > 0) out[k.toUpperCase()] = v;
            }
            out.EUR = 1;
            // Sprawdzenie zdrowego rozsądku: dolar do euro nie jest ani trzy
            // razy droższy, ani trzy razy tańszy. Krzywą odpowiedź lepiej
            // odrzucić, niż policzyć po niej całą zmianę.
            if (!out.USD || out.USD < 0.3 || out.USD > 3) return null;
            return out;
        },

        loadCached() {
            try {
                const raw = JSON.parse(localStorage.getItem(this.key()) || 'null');
                if (!raw || !raw.rates || typeof raw.ts !== 'number') return false;
                if (Date.now() - raw.ts > CONFIG.FX_TTL_MS) return false;
                const norm = this.normalize(raw.rates);
                if (!norm) return false;
                this.rates = norm; this.source = raw.source; this.fetchedAt = raw.ts;
                return true;
            } catch (e) { return false; }
        },

        save() {
            try {
                localStorage.setItem(this.key(), JSON.stringify({
                    rates: this.rates, source: this.source, ts: this.fetchedAt,
                }));
            } catch (e) { /* magazyn przepełniony — nic krytycznego */ }
        },

        useFallback(why) {
            this.rates = { ...CONFIG.FX_FALLBACK };
            this.source = 'wbudowane';
            this.fetchedAt = null;
            Utils.error(`Kursy walut nie zostały pobrane (${why}). Wzięto wbudowane — sumy w euro będą przybliżone.`);
        },

        /**
         * Tryb bez sieci — wykonuje się przy starcie. Kursy z localStorage,
         * jeśli są świeże, inaczej tablica wbudowana; ani jednego zapytania.
         * Brak kursów nie jest błędem — przy wyłączonym module to stan normalny.
         */
        initOffline() {
            if (this.loadCached()) {
                this.offline = false;
                Utils.log(`Kursy walut z magazynu (${this.source}), sieci nie ruszaliśmy.`);
                return this.rates;
            }
            this.rates = { ...CONFIG.FX_FALLBACK };
            this.source = I18n.get('priceModule_fxOffline');
            this.fetchedAt = null;
            this.offline = true;
            Utils.log('Kursy walut: tablica wbudowana (moduł cen wyłączony, sieci nie ruszaliśmy).');
            return this.rates;
        },

        /**
         * Pobranie kursów z sieci — tylko po ręcznym włączeniu modułu cen;
         * sprawdzenie na początku jest ostatnią linią obrony.
         */
        async init() {
            if (!priceModuleOn()) return this.initOffline();
            if (this.loadCached()) {
                this.offline = false;
                Utils.log(`Kursy walut z magazynu (${this.source}), wiek `
                        + `${Math.round((Date.now() - this.fetchedAt) / 3600000)} h`);
                return this.rates;
            }
            for (const p of CONFIG.FX_PROVIDERS) {
                try {
                    const ctl = new AbortController();
                    const timer = setTimeout(() => ctl.abort(), CONFIG.FX_TIMEOUT_MS);
                    const r = await fetch(p.url, { signal: ctl.signal, cache: 'no-store' });
                    clearTimeout(timer);
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    const norm = this.normalize(p.pick(await r.json()));
                    if (!norm) throw new Error('odpowiedź nie wygląda na kursy');
                    this.rates = norm; this.source = p.name; this.fetchedAt = Date.now();
                    this.offline = false;
                    this.save();
                    Utils.log(`Kursy walut: ${p.name}`, this.brief());
                    return this.rates;
                } catch (e) {
                    Utils.log(`[KURSY] ${p.name} — ${e.message}`);
                }
            }
            this.useFallback('wszystkie źródła niedostępne');
            return this.rates;
        },

        /** @returns {number|null} kwota w euro albo null, jeśli kursu nie ma. */
        toEur(value, currency) {
            if (typeof value !== 'number' || !isFinite(value)) return null;
            const cur = (currency || 'EUR').toUpperCase();
            if (cur === 'EUR') return value;
            const table = this.rates || CONFIG.FX_FALLBACK;
            const rate = table[cur];
            if (!rate || !isFinite(rate) || rate <= 0) return null;
            return value / rate;      // w tablicy — jednostek waluty za 1 EUR
        },

        /**
         * Euro na walutę wyświetlania — odwrotność toEur, ta sama tablica.
         *
         * @returns {number|null} kwota albo null, jeśli kursu nie ma (wtedy
         *   wywołujący zostaje przy euro, a nie pokazuje zera).
         */
        fromEur(eur, currency) {
            if (typeof eur !== 'number' || !isFinite(eur)) return null;
            const cur = String(currency || 'EUR').toUpperCase();
            if (cur === 'EUR') return eur;
            const table = this.rates || CONFIG.FX_FALLBACK;
            const rate = Object.prototype.hasOwnProperty.call(table, cur) ? table[cur] : null;
            if (!rate || !isFinite(rate) || rate <= 0) return null;
            return eur * rate;
        },

        /**
         * Waluta wyświetlania albo null, czyli „jak w sklepie”.
         *
         * Wartość przychodzi z localStorage, więc może być czymkolwiek:
         * `'__proto__'`, `'XYZ'`, liczbą. Przechodzi wyłącznie 'native' albo
         * klucz własny CONFIG.DISPLAY_CURRENCIES — wszystko inne to wartość
         * domyślna (euro), a nie ciche przejście na waluty sklepów.
         */
        displayCurrency() {
            const own = (c) => typeof c === 'string'
                && Object.prototype.hasOwnProperty.call(CONFIG.DISPLAY_CURRENCIES, c);
            const cur = store.userConfig && store.userConfig.displayCurrency;
            if (cur === 'native') return null;
            if (own(cur)) return cur;
            return own(DEFAULT_USER_CONFIG.displayCurrency) ? DEFAULT_USER_CONFIG.displayCurrency : null;
        },

        /**
         * Kwota w dowolnej walucie pokazana w walucie wyświetlania.
         *
         * `≈` stoi wtedy, gdy kwota została przeliczona: kurs jest dzienny,
         * a bez sieci — wbudowany, więc to szacunek, nie cena z Amazonu. Ta
         * sama waluta co w sklepie idzie bez znaku, bo niczego nie liczono.
         *
         * @returns {string|null} tekst albo null, gdy wybrano „jak w sklepie”
         *   lub nie ma kursu — wtedy wywołujący pokazuje cenę tak, jak przyszła.
         */
        display(value, currency) {
            const cur = this.displayCurrency();
            if (!cur) return null;
            const from = String(currency || 'EUR').toUpperCase();
            const v = from === cur ? value : this.fromEur(this.toEur(value, from), cur);
            if (typeof v !== 'number' || !isFinite(v)) return null;
            return (from === cur ? '' : '≈ ') + this.money(v, cur);
        },

        /** `12.50 zł` — znak po kwocie, jak w linii 6. */
        money(value, currency) {
            return `${value.toFixed(2)} ${CONFIG.DISPLAY_CURRENCIES[currency] || currency}`;
        },

        brief() {
            const t = this.rates || CONFIG.FX_FALLBACK;
            return ['USD', 'GBP', 'PLN', 'SEK', 'CAD']
                .filter(c => t[c]).map(c => `${c} ${t[c].toFixed(3)}`).join(', ');
        },

        status() {
            return {
                'źródło': this.source || 'jeszcze nie pobrane',
                'pobrane': this.fetchedAt ? new Date(this.fetchedAt).toLocaleString() : '—',
                'kursy za 1 EUR': this.brief(),
                'bez sieci': this.offline,
            };
        },

        /**
         * Wymusić ponowne pobranie (np. gdy sieć pojawiła się później).
         * Przy wyłączonym module cen sprowadza się do odczytu bez sieci.
         */
        async refresh() {
            try { localStorage.removeItem(this.key()); } catch (e) { /* zapisanych kursów mogło nie być — odświeżenie i tak pobierze je od nowa */ }
            this.rates = null; this.source = null; this.fetchedAt = null;
            await this.init();
            bus.emit('valueLog:changed');     // sumy przeliczają się w locie
            return this.status();
        },
    };
