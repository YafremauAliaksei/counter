    // ==========================================
    // 6f. KURSY WALUT (9.0.0)
    // ==========================================
    /**
     * Sprowadza dowolną walutę do euro.
     *
     * PO CO. Cena przychodzi w walucie rynku, z którego została zdjęta: funty
     * z co.uk, dolary z com, korony ze se, złote z pl. Trzymać wyniku zmiany
     * w pięciu walutach nie ma sensu, dodawać ich wprost to kłamstwo. Dlatego
     * wszystko sprowadza się do euro.
     *
     * Kursy brane są raz z otwartego źródła i kładzione do wspólnego
     * (nieversjonowanego) magazynu na dobę. To NIE jest sprzeczne z rezygnacją
     * z pamięci cen w 8.5.0: cena produktu zmienia się w ciągu dnia i musi być
     * czytana na nowo przy każdym przedmiocie, a kurs waluty przez jedną zmianę
     * nie przesunie się na tyle, żeby było to widać w szacunku „ile wyrobiłem”.
     *
     * 9.2.0 — NAJWAŻNIEJSZA ZMIANA W TYM MODULE.
     *
     * Przy wyłączonym module cen kursy NIE SĄ POBIERANE. Zamiast tego bierze się
     * to, co już leży w localStorage, a jeśli nie leży nic — tablicę wpisaną
     * w plik (CONFIG.FX_FALLBACK). Zero ruchu w sieci.
     *
     * Wejście do sieci jest dokładnie w jednym miejscu: init() wywołane po tym,
     * jak człowiek zaznaczył „Włącz moduł cen”.
     */
    const FxRates = {
        rates: null,        // { USD: 1.156, GBP: 0.856, ... } — jednostek za 1 EUR
        source: null,       // nazwa źródła albo 'wbudowane'
        fetchedAt: null,
        offline: false,     // 9.2.0: true = kursy wzięte bez dotykania sieci

        key() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_FX_RATES; },

        /**
         * Normalizuje odpowiedź dostawcy do { WALUTA: liczba }.
         *
         * 9.1.0: liczba przyjmowana jest też ŁAŃCUCHEM. Poprzednie sprawdzenie
         * `typeof v === 'number'` po cichu odrzucało floatrates, który oddaje
         * kurs jako „1.15514929”, — tablica wychodziła pusta, sprawdzenie USD nie
         * przechodziło i trzecie źródło nie zadziałało ANI RAZU przez cały czas
         * swojego istnienia.
         *
         * To jest zarazem granica zaufania do odpowiedzi z sieci: wchodzi tu
         * dowolny JSON z cudzego serwera, a wychodzi wyłącznie płaska tablica
         * dodatnich, skończonych liczb pod kluczami podniesionymi do wielkich
         * liter. Nic innego dalej nie przejdzie.
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
            // Minimalne sprawdzenie zdrowego rozsądku: dolar do euro nigdy nie był
            // ani trzy razy droższy, ani trzy razy tańszy. Krzywą odpowiedź lepiej
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
         * TRYB BEZ SIECI (9.2.0) — to właśnie wykonuje się przy starcie skryptu.
         *
         * Bierze kursy z localStorage, jeśli tam leżą i nie są przeterminowane,
         * a w przeciwnym razie tablicę wpisaną w plik. W obu przypadkach ani
         * jednego zapytania. Braku kursów nie zgłasza jako błędu, bo przy
         * wyłączonym module cen to jest stan normalny, a nie awaria.
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
         * Pobranie kursów z sieci. Wywoływane WYŁĄCZNIE po ręcznym włączeniu
         * modułu cen — sprawdzenie na początku jest ostatnią linią obrony.
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
         * WALUTA WYŚWIETLANIA (1.4.0) albo null, czyli „jak w sklepie”.
         *
         * Wartość przychodzi z localStorage, więc może być czymkolwiek:
         * `'__proto__'`, `'XYZ'`, liczbą. Przechodzi wyłącznie klucz własny
         * CONFIG.DISPLAY_CURRENCIES — wszystko inne to zachowanie domyślne.
         */
        displayCurrency() {
            const cur = store.userConfig && store.userConfig.displayCurrency;
            return typeof cur === 'string'
                && Object.prototype.hasOwnProperty.call(CONFIG.DISPLAY_CURRENCIES, cur) ? cur : null;
        },

        /**
         * Kwota w dowolnej walucie pokazana w walucie wyświetlania.
         *
         * `≈` stoi wtedy, gdy kwota została PRZELICZONA: kurs jest dzienny,
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

        /** `12.50 zł` — znak po kwocie, jak w linii 6 od zawsze. */
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
