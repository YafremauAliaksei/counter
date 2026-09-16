    // ==========================================
    // 6b. PRICE CARD (karta ceny po ASIN)
    // ==========================================
    /**
     * Pokazuje cenę produktu, który jest właśnie obsługiwany.
     *
     * DLACZEGO TAK, A NIE PROŚCIEJ. Bezpośredni fetch na amazon.de ze strony
     * T-REX jest niemożliwy: Same-Origin Policy. Sprawdzone na żywo na obcej
     * domenie — blokuje się wszystko: zwykły fetch, XMLHttpRequest, no-cors
     * (oddaje opaque z pustym ciałem), iframe (odczyt rzuca SecurityError),
     * script src, a nawet widżety partnerskie amazon-adsystem, które niby są
     * stworzone do osadzania na cudzych stronach. Tampermonkey obchodzi to
     * wyłącznie dlatego, że GM_xmlhttpRequest wykonuje się w uprzywilejowanym
     * kontekście rozszerzenia, a nie w stronie.
     *
     * Dlatego źródła są dokładnie dwa:
     *   r.jina.ai       — oddaje nagłówki CORS, zwraca tekst strony;
     *   graph.keepa.com — obrazek, a obrazkowi CORS nie jest potrzebny z zasady.
     *
     * GŁÓWNA ZASADA: JEDNO ZAPYTANIE NA JEDEN ASIN. Logika ta sama, co
     * u licznika: `poniżej` daje dokładnie jeden przyrost — nowy ASIN daje
     * dokładnie jedno wejście do sieci. Pięć jednakowych przedmiotów pod rząd
     * (klient zwrócił pięć sztuk) odpracuje się jako pięć przedmiotów, ale
     * zapytanie pójdzie jedno.
     *
     * 9.2.0: nad tym wszystkim stoi jeszcze jeden warunek — moduł cen musi być
     * włączony ręcznie. Dopóki nie jest, ten moduł nie wysyła nic.
     */
    const PriceCard = {
        // asin -> {status, current, rrp, source, ms}. To nie pamięć cen: cena
        // pytana jest na nowo przy każdym przedmiocie (8.5.0). To ostatni znany
        // wynik, rysowany póki leci nowe zapytanie.
        // 9.1.0: rozmiar ograniczony, patrz _remember().
        cache: new Map(),
        inFlight: new Set(),
        shownAsin: null,
        // ASIN, dla którego właśnie trwa przegląd sklepów (8.6.0).
        searchingOther: null,
        awaiting: false,         // zaczął się nowy przedmiot, czekamy na ASIN
        requestCount: 0,
        // Obrazki Keepa liczą się osobno od zapytań tekstowych: mają własny,
        // hojniejszy limit (patrz CONFIG.PRICE_MAX_IMAGE_REQUESTS).
        imageCount: 0,
        nextSlotAt: 0,
        el: null,

        /**
         * Content-Security-Policy strony — DRUGA bariera, niezależna od CORS.
         * Wystawia ją serwer strony nagłówkiem albo meta-tagiem i obejść jej
         * z kodu strony nie da się w zasadzie: w tym cały sens CSP.
         *
         * Jeśli w polityce nie ma potrzebnego źródła, przeglądarka utnie
         * zapytanie jeszcze przed wyjściem w sieć. Wikipedia jest tu dobrym
         * przykładem: nie ma tam ani img-src, ani connect-src, wszystko spada
         * do `default-src 'self'` i nie ładuje się ani obrazek Keepa, ani
         * zapytanie do r.jina.ai.
         *
         * Zostawiać po cichu pustej ramki nie wolno — człowiek pomyśli, że skrypt
         * się zepsuł. Przeglądarka sama zgłasza blokadę zdarzeniem
         * securitypolicyviolation, po nim to rozpoznajemy.
         */
        csp: { img: false, net: false, notified: false },

        // ---------------- rozbiór odpowiedzi ----------------
        /**
         * Waluta to ścisła lista, a nie [A-Z]{3}. Złapane na stanowisku: szeroki
         * wzorzec wyciągnął „UTF 8.00” z linku ?ie=UTF8&nodeId=505048 i pokazał
         * to jako cenę. Grosze też są obowiązkowe: Amazon zawsze drukuje dwa
         * miejsca, a wymaganie części dziesiętnej odcina całą klasę śmieci.
         *
         * Jest to zarazem filtr bezpieczeństwa: wzorzec pracuje na tekście
         * ściągniętym z obcego serwisu, więc musi przepuszczać wyłącznie to,
         * co naprawdę wygląda jak kwota.
         */
        MONEY: String.raw`(?:(EUR|USD|GBP|PLN|CHF|SEK|DKK|NOK|CZK|HUF|RON)\s?|(€|\$|£|zł)\s?)(\d{1,3}(?:[., ]\d{3})*[.,]\d{2})`,

        normalize(currency, symbol, amount) {
            const cur = currency || symbol || '';
            let a = String(amount).replace(/[ \s]/g, '');
            const ld = a.lastIndexOf('.'), lc = a.lastIndexOf(',');
            if (ld >= 0 && lc >= 0) {
                a = lc > ld ? a.replace(/\./g, '').replace(',', '.') : a.replace(/,/g, '');
            } else if (lc >= 0) {
                a = (a.length - lc - 1) === 2 ? a.replace(',', '.') : a.replace(/,/g, '');
            }
            const n = parseFloat(a);
            return isNaN(n) ? null : { value: n, currency: cur, text: `${cur} ${n.toFixed(2)}` };
        },

        /**
         * Dwa tryby, a różnica jest zasadnicza. Odpowiedź adresowana
         * (z x-target-selector) to 350-1800 bajtów jednego bloku ceny i tam
         * pierwsze trafienie na kwotę jest ceną. Odpowiedź całą stroną to
         * 180-200 KB i pierwsze trafienie będzie śmieciem: w pomiarze taka
         * odpowiedź zawierała 12 różnych kwot. Dlatego na długim ciele cenę
         * bierze się TYLKO po kotwicy „… with N percent savings”.
         *
         * Pomiar na trzech produktach, czemu to ważne:
         *   Philips GU10  adresowo -> 15.08   stroną -> 17.04  (adresowo poprawnie)
         *   Tineco        oba tryby zgodne
         *   ARNOMED       adresowo 422, stroną ceny nie ma wcale
         */
        parseJina(text, targeted) {
            const body = text.split('Markdown Content:').pop() || '';
            const stale = /cached snapshot/i.test(text);
            // targeted przychodzi od dostawcy. Wcześniej ustalało się po długości
            // ciała (< 4000) i to kłamało: strona zgody na ciasteczka też jest
            // krótka, przez co zapasowa ścieżka „pierwsze trafienie” działała tam,
            // gdzie ceny nie ma w ogóle.
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

        keepaUrl(asin, market) { return KeepaOCR.url(asin, market); },

        // ---------------- źródła ----------------
        providers() {
            const self = this;
            return [
                {
                    /**
                     * Cena odczytana z obrazka wykresu (8.4.0).
                     *
                     * Stoi PIERWSZA i jest włączona domyślnie: daje euro
                     * z niemieckiej witryny, nie wymaga klucza i nie chodzi ani
                     * na Amazona, ani przez obce proxy — tylko obrazek
                     * z graph.keepa.com, który skrypt i tak umie wczytać od 8.2.0.
                     *
                     * Działa też w trybie 'graph': obrazek jest potrzebny w obu
                     * przypadkach, różnica polega tylko na tym, czy się go
                     * pokazuje. Dzięki temu dziennik wartości napełnia się
                     * niezależnie od wybranego widoku.
                     */
                    name: 'keepa-ocr',
                    get available() {
                        const pc = store.localTabConfig.priceCard;
                        // Obrazek tnie CSP — nie ma czego czytać.
                        if (self.csp.img) return false;
                        return pc.source === 'ocr' || pc.source === 'graph' || !!pc.logValues;
                    },
                    isImage: true,
                    // Licznik prowadzi pętla w resolve(): dostawca nie powinien
                    // wiedzieć, jak urządzona jest ewidencja limitów (w 8.4.0-8.5.0
                    // liczył sam i jego zapytania trafiały DO OBU liczników naraz).
                    async run(asin, signal, market) {
                        const d = await KeepaOCR.read(asin, market);
                        if (!d) throw new Error('cena na wykresie nierozpoznana');
                        return self.buildOcrResult(d, market);
                    },
                },
                {
                    // Oficjalne API Keepa. CORS oddaje (sprawdzone: zapytanie
                    // z obcej domeny zwróciło czytelny JSON), potrzebny jest
                    // tylko płatny klucz. Gdy klucz się pojawi, stanie się to
                    // najlepszym źródłem: dokładna cena w euro z niemieckiej
                    // witryny, bez rozbierania szablonu strony.
                    name: 'keepa-api',
                    get available() { return !!CONFIG.PRICE_KEEPA_API_KEY; },
                    async run(asin, signal) {
                        const u = `https://api.keepa.com/product?key=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_KEY)}`
                                + `&domain=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_DOMAIN)}&asin=${encodeURIComponent(asin)}&stats=1&history=0`;
                        const r = await fetch(u, { signal });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        const j = await r.json();
                        const p = j.products && j.products[0];
                        if (!p) throw new Error('produktu nie znaleziono');
                        const cents = (v) => (typeof v === 'number' && v > 0) ? v / 100 : null;
                        const st = p.stats || {};
                        const cur = cents(st.current && st.current[1]) ?? cents(st.current && st.current[0]);
                        const rrp = cents(p.listPrice);
                        if (cur == null && rrp == null) throw new Error('w odpowiedzi nie ma cen');
                        const mk = (v) => v == null ? null : { value: v, currency: 'EUR', text: `EUR ${v.toFixed(2)}` };
                        return { current: mk(cur), rrp: mk(rrp), stale: false };
                    },
                },
                {
                    name: 'jina/blok',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    async run(asin, signal) {
                        const r = await fetch(`https://r.jina.ai/https://${marketplace().host}/dp/${encodeURIComponent(asin)}`, {
                            signal,
                            headers: {
                                'x-target-selector': CONFIG.PRICE_JINA_SELECTOR,
                                'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S),
                            },
                        });
                        // 422 = takiego bloku na stronie nie ma (inny szablon albo
                        // strona zgody na ciasteczka). To nie awaria łącza, tylko
                        // powód, żeby spróbować następnego trybu.
                        if (r.status === 422) throw new Error('nie ma bloku z ceną');
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), true);
                    },
                },
                {
                    name: 'jina/strona',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    async run(asin, signal) {
                        const r = await fetch(`https://r.jina.ai/https://${marketplace().host}/dp/${encodeURIComponent(asin)}`, {
                            signal,
                            headers: { 'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S) },
                        });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), false);
                    },
                },
            ];
        },

        // ---------------- sieć ----------------
        /**
         * Przerwa między zapytaniami. 8.3.0: slot rezerwuje się SYNCHRONICZNIE,
         * przed jakimkolwiek await.
         *
         * Wcześniej `lastRequestAt` zapisywało się PO śnie, więc dwa równoległe
         * resolve() czytały tę samą wartość, spały tyle samo i wychodziły w sieć
         * w tym samym momencie — przerwy nie było wcale.
         */
        respectRateLimit() {
            const now = Date.now();
            const slot = Math.max(now, this.nextSlotAt || 0);
            this.nextSlotAt = slot + CONFIG.PRICE_MIN_REQUEST_GAP_MS;
            const wait = slot - now;
            return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve();
        },

        /**
         * Limit czasu zapytania. 8.3.0: timer jest zdejmowany, a sam fetch
         * przerywany.
         *
         * Wcześniej setTimeout nie był czyszczony przy powodzeniu — na każde
         * zapytanie zostawał wiszący timer na 30 s — a „odpadły po timeoucie”
         * fetch dalej ciągnął odpowiedź: nie było czym go anulować.
         *
         * @param {(signal: AbortSignal) => Promise} run
         */
        withTimeout(run, ms) {
            const ctl = new AbortController();
            let timer = null;
            const limit = new Promise((_, rej) => {
                timer = setTimeout(() => { ctl.abort(); rej(new Error('przekroczony czas')); }, ms);
            });
            return Promise.race([Promise.resolve().then(() => run(ctl.signal)), limit])
                .finally(() => clearTimeout(timer));
        },

        /**
         * Wynik rozbioru obrazka do wspólnej postaci. Waluta bierze się z TEGO
         * rynku, z którego zdjęto cenę, a nie z wybranego: przy przeglądzie
         * sklepów to są różne rzeczy.
         */
        buildOcrResult(d, market) {
            const key = market || marketplaceKey();
            const cur = marketplace(key).currency;
            const mk = (v) => ({ value: v, currency: cur, text: `${cur} ${v.toFixed(2)}` });
            return {
                current: mk(d.top.value),
                rrp: null,
                secondary: d.second ? { text: d.second.text } : null,
                series: d.top.series,
                market: key,
                stale: false,
            };
        },

        /**
         * PRZEGLĄD POZOSTAŁYCH SKLEPÓW (8.6.0).
         *
         * Wywoływany tylko wtedy, gdy wybrany rynek ceny nie dał. Przechodzi
         * pozostałe rynki z danymi Keepa w LOSOWEJ kolejności, z sekundową
         * przerwą, i zwraca pierwszy sukces. Ustawienia sklepu nie rusza: to
         * jednorazowa próba dla jednego przedmiotu, następny znów zacznie od
         * wybranego.
         *
         * Losowa kolejność nie jest tu ozdobą: przy stałej kolejności całe
         * pudło zmiany szłoby w jeden i ten sam rynek zapasowy.
         */
        async tryOtherMarkets(asin) {
            const from = marketplaceKey();
            const pool = Object.keys(CONFIG.MARKETPLACES)
                .filter(k => k !== from && CONFIG.MARKETPLACES[k].keepa_ok);
            for (let i = pool.length - 1; i > 0; i--) {         // tasowanie Fishera-Yatesa
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            const tries = pool.slice(0, CONFIG.PRICE_FALLBACK_MAX_TRIES);
            Utils.log(`[CENA] ${asin}: na ${from} ceny nie ma, próbuję ${tries.join(', ')}`);

            for (const key of tries) {
                // 9.2.0: moduł mógł zostać wyłączony w trakcie przeglądu —
                // przerywamy natychmiast, zamiast dosyłać resztę zapytań.
                if (!priceModuleOn()) break;
                if (this.csp.img) break;
                if (this.imageCount >= CONFIG.PRICE_MAX_IMAGE_REQUESTS) {
                    Utils.log('[CENA] przegląd zatrzymany: limit obrazków');
                    break;
                }
                await new Promise(r => setTimeout(r, CONFIG.PRICE_FALLBACK_DELAY_MS));
                // ASIN mógł się zmienić w trakcie przeglądu — wtedy przegląd jest zbędny.
                if (this.shownAsin !== asin) {
                    Utils.log(`[CENA] ${asin}: przegląd przerwany, na ekranie jest już inny przedmiot`);
                    return null;
                }
                this.imageCount++;
                const t0 = Date.now();
                try {
                    const d = await this.withTimeout(
                        () => KeepaOCR.read(asin, key), CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                    if (d) {
                        const out = this.buildOcrResult(d, key);
                        Utils.log(`[CENA] ${asin}: znalezione na ${marketplace(key).host} — ${out.current.text}`);
                        return { status: 'ok', ...out, source: 'keepa-ocr', fallback: true, ms: Date.now() - t0 };
                    }
                    Utils.log(`[CENA] ${asin}: na ${key} ceny też nie ma`);
                } catch (e) {
                    Utils.log(`[CENA] ${asin}: ${key} — ${e.message}`);
                }
            }
            return null;
        },

        /**
         * Zapytać ponownie o cenę produktu, który jest teraz na ekranie
         * (po zmianie ustawień).
         *
         * Jeśli po tym ASIN już leci zapytanie, `inFlight` nowego nie przepuści
         * — i bez notatki o zamiarze odświeżenie PRZEPADŁOBY PO CICHU. Łapie się
         * to tak: przełączono sklep w trakcie zapytania i na ekranie zostałaby
         * cena poprzedniego rynku. Dlatego stawiamy flagę, a resolve() po
         * zakończeniu sam ponawia odświeżenie.
         */
        _refreshPending: null,
        refresh() {
            const asin = this.shownAsin;
            if (!asin) { this.render(); return; }
            if (this.inFlight.has(asin)) { this._refreshPending = asin; return; }
            this._refreshPending = null;
            this.resolve(asin, { manual: true });
        },

        /**
         * CENA PYTANA JEST NA NOWO PRZY KAŻDYM PRZEDMIOCIE (8.5.0).
         *
         * W 8.4.0 stała tu pamięć na pięć dób i powtórne spotkanie ASIN brało
         * cenę z magazynu. Okazało się to błędem: cena na Amazonie zmienia się
         * w ciągu dnia — przy weryfikacji wzorca produkt podrożał z 9,20 do 9,22
         * w kilka godzin — a więc i w obrębie jednej zmiany ten sam produkt może
         * kosztować różnie. Dziennik nabity wczorajszymi cenami daje błędną sumę,
         * a poznać tego po samej sumie nie sposób.
         *
         * Dlatego trwałej pamięci cen nie ma wcale. Mapa `cache` została, ale
         * jest teraz po prostu OSTATNIM WYNIKIEM do rysowania, a nie powodem,
         * żeby pominąć zapytanie: każdy nowy przedmiot idzie do sieci.
         *
         * Ochroną przed lawiną jest `inFlight`: póki zapytanie po tym ASIN leci,
         * drugie nie wychodzi. Częstotliwość ogranicza sam cykl obsługi: check()
         * rusza resolve() przy zmianie ASIN albo na początku nowego przedmiotu,
         * a nie przy każdej mutacji DOM.
         *
         * 9.2.0: pierwszym warunkiem jest moduł cen. To jest ta sama bariera, co
         * w KeepaOCR.loadImage(), postawiona świadomie dwa razy — na wejściu
         * i na wyjściu.
         */
        async resolve(asin, { manual = false } = {}) {
            if (!asin) return null;
            if (!priceModuleOn()) return null;
            if (this.inFlight.has(asin)) return null;


            // Ani jednego włączonego źródła — do sieci nie idziemy wcale.
            // To normalny stan w trybie 'legend': cenę widać na obrazku.
            if (!this.providers().some(p => p.available !== false)) {
                this._remember(asin, { status: 'off' });
                this.render();
                return null;
            }

            this.inFlight.add(asin);
            this.render();

            let result = { status: 'fail', reason: I18n.get('priceCard_noPrice') };
            try {
                let limitHit = false;
                for (const p of this.providers()) {
                    if (p.available === false) continue;
                    // Zdarzenie securitypolicyviolation przylatuje asynchronicznie,
                    // już po odmowie fetch, dlatego flagę sprawdzamy w każdym
                    // obiegu: inaczej następny dostawca zdążyłby wejść w zawczasu
                    // zablokowaną sieć.
                    if (this.csp.net) break;

                    /**
                     * LIMIT SPRAWDZA SIĘ PO TYPIE DOSTAWCY (poprawka 8.6.0).
                     *
                     * Wcześniej wspólny licznik requestCount rósł u WSZYSTKICH
                     * dostawców, łącznie z obrazkowym, a sprawdzenie stało JEDNO,
                     * przed pętlą, przeciwko limitowi tekstowemu. Osobny licznik
                     * obrazków, założony w 8.4.0, niczego przy tym nie rozstrzygał.
                     */
                    const isImg = !!p.isImage;
                    const used = isImg ? this.imageCount : this.requestCount;
                    const cap  = isImg ? CONFIG.PRICE_MAX_IMAGE_REQUESTS
                                       : CONFIG.PRICE_MAX_REQUESTS_PER_SESSION;
                    if (used >= cap) {
                        limitHit = true;
                        Utils.error(`[CENA] osiągnięto limit ${isImg ? 'obrazków' : 'zapytań tekstowych'}: `
                                  + `${used}/${cap}. Podnieść w locie: SH.setLimits({ ${isImg ? 'images' : 'text'}: ${cap * 2} })`);
                        continue;
                    }

                    try {
                        await this.respectRateLimit();
                        // Moduł mógł zostać wyłączony, póki czekaliśmy na slot.
                        if (!priceModuleOn()) break;
                        if (isImg) this.imageCount++; else this.requestCount++;
                        const t0 = Date.now();
                        const d = await this.withTimeout((signal) => p.run(asin, signal), CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                        if (d && (d.current || d.rrp)) {
                            result = { status: 'ok', ...d, source: p.name, ms: Date.now() - t0 };
                            Utils.log(`[CENA] ${asin} <- ${p.name} w ${result.ms} ms`,
                                      result.current && result.current.text);
                            break;
                        }
                        Utils.log(`[CENA] ${asin}: ${p.name} odpowiedział, ceny nie ma`);
                    } catch (e) {
                        Utils.log(`[CENA] ${asin}: ${p.name} — ${e.message}`);
                    }
                }

                if (limitHit && result.status !== 'ok') {
                    result = { status: 'fail', reason: I18n.get('priceCard_limit') };
                }

                // Ceny na wybranym rynku nie ma — próbujemy pozostałych.
                // Tylko dla źródła obrazkowego: r.jina.ai rozbiera szablon
                // konkretnej witryny i gonienie go po obcych rynkach nie ma sensu.
                const wantsFallback = CONFIG.PRICE_FALLBACK_ENABLED
                    && priceModuleOn()
                    && store.localTabConfig.priceCard.marketFallback !== false
                    && result.status !== 'ok'
                    && !limitHit
                    && !this.csp.img
                    && store.localTabConfig.priceCard.source !== 'jina';
                if (wantsFallback) {
                    this.searchingOther = asin;
                    this.render();
                    try {
                        const alt = await this.tryOtherMarkets(asin);
                        if (alt) result = alt;
                    } finally {
                        this.searchingOther = null;
                    }
                }
            } finally {
                this.inFlight.delete(asin);
                this._remember(asin, result);   // zapisujemy i sukces, i porażkę
                this.render();
                // Przedmiot mógł skończyć się wcześniej, niż przyjechała cena.
                if (result.status === 'ok' && result.current) ValueLog.fillPending(asin, result.current);
                // W trakcie zapytania ustawienia mogły się zmienić — doganiamy.
                if (this._refreshPending === asin) {
                    this._refreshPending = null;
                    setTimeout(() => this.refresh(), 0);
                }
            }
            return result;
        },

        /**
         * Zapamiętać wynik po ASIN, przycinając pamięć karty (9.1.0).
         *
         * Mapa trzyma kolejność wstawiania, więc „usuń i włóż od nowa” robi z niej
         * LRU: najdawniej niespotykany ASIN ląduje pierwszym kluczem i wychodzi
         * pierwszy. Do 9.1.0 Mapa rosła przez całą zmianę — przy tysiącu z górą
         * przedmiotów to zbędne megabajty w pamięci karty, która i tak żyje
         * dziesięć godzin bez przeładowania.
         */
        _remember(asin, result) {
            this.cache.delete(asin);
            this.cache.set(asin, result);
            const cap = CONFIG.PRICE_CACHE_MAX_ENTRIES;
            while (this.cache.size > cap) {
                const oldest = this.cache.keys().next().value;
                if (oldest === this.shownAsin) break;   // bieżącego nie wyrzucamy
                this.cache.delete(oldest);
            }
        },

        // ---------------- szukanie ASIN ----------------
        detectAsin() {
            for (const a of document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
                if (a.closest('#' + CONFIG.SCRIPT_ID_PREFIX + 'priceCard')) continue;
                const m = (a.getAttribute('href') || '').match(CONFIG.PRICE_ASIN_FROM_HREF);
                if (m) return m[1];
            }
            // Rezerwa po tekście — gdy linku na stronie nie ma wcale.
            //
            // Przyjmujemy ASIN TYLKO WTEDY, gdy jest na stronie jeden. Jeśli jest
            // ich kilka, ustalić bieżącego po tekście się nie da: kolejność
            // w dokumencie nic nie mówi o świeżości. Sprawdzone na stanowisku —
            // najpierw brało się pierwsze trafienie i karta cofała się do
            // najstarszego ASIN z dziennika, potem ostatnie — i czepiała się ASIN
            // z cudzego panelu stanu. Oba warianty kłamały, więc przy
            // niejednoznaczności uczciwiej nie zgadywać, tylko zostawić na karcie
            // ostatnie, co było wiadome na pewno.
            const prev = this.el && this.el.style.display;
            if (this.el) this.el.style.display = 'none';
            const text = document.body.innerText || '';
            if (this.el) this.el.style.display = prev || '';

            const all = text.match(new RegExp(CONFIG.PRICE_ASIN_FROM_TEXT.source, 'g'));
            if (!all || !all.length) return null;
            const uniq = [...new Set(all)];
            if (uniq.length > 1) {
                if (this._ambiguousWarned !== uniq.join()) {
                    this._ambiguousWarned = uniq.join();
                    Utils.log(`[CENA] linku nie ma, a w tekście od razu kilka ASIN (${uniq.join(', ')}) — nie zgaduję`);
                }
                return null;
            }
            return uniq[0];
        },

        /**
         * Czyta i rozbiera Content-Security-Policy strony.
         *
         * CSP to IMIENNA LISTA HOSTÓW, a nie wyłącznik. Częsty błąd: „mój skrypt
         * z githuba się załadował, czyli polityka jest miękka”. Nie — znaczy to
         * tylko tyle, że dozwolony jest właśnie tamten host. U Wikipedii na
         * przykład raw.githubusercontent.com na liście jest (potrzebny do
         * gadżetów), a graph.keepa.com i r.jina.ai nie.
         *
         * Polityka częściej przychodzi nagłówkiem HTTP niż meta-tagiem, dlatego
         * nagłówek doczytuje się zapytaniem o własną stronę: idzie ono na własny
         * origin i przechodzi nawet przy `connect-src 'self'`.
         *
         * 9.2.0: to jedyne zapytanie w pliku, które nie zależy od modułu cen —
         * bo nie wychodzi poza własną domenę i leci wyłącznie wtedy, gdy człowiek
         * sam wywoła SH.cspReport() z konsoli.
         */
        async readCsp() {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            let header = null, headerError = null;
            try {
                const r = await fetch(location.href, { method: 'GET', cache: 'no-store' });
                header = r.headers.get('content-security-policy')
                      || r.headers.get('content-security-policy-report-only');
            } catch (e) { headerError = e.message; }

            const raw = header || (meta && meta.content) || null;
            const directives = {};
            if (raw) {
                raw.split(';').forEach(part => {
                    const bits = part.trim().split(/\s+/).filter(Boolean);
                    if (bits.length) directives[bits[0].toLowerCase()] = bits.slice(1);
                });
            }
            return {
                raw,
                directives,
                source: header ? 'nagłówek HTTP' : (meta ? 'meta-tag' : null),
                headerError,
            };
        },

        /** Czy polityka pozwala na odwołanie do hosta w danej dyrektywie. */
        cspAllows(parsed, directive, host) {
            if (!parsed.raw) return 'nie ma polityki';
            const list = parsed.directives[directive] || parsed.directives['default-src'];
            if (!list) return 'dyrektywa nie ustawiona i default-src też — dozwolone';
            const used = parsed.directives[directive] ? directive : 'default-src (fallback)';

            // 8.3.0: rozbiór źródeł według gramatyki CSP. Poprzednia wersja umiała
            // tylko gołą nazwę hosta i kłamała na wszystkim innym: politykę typu
            // `img-src https:` (dopuszcza dowolne źródło https) ogłaszała
            // zakazującą, a `'none'` i `'self'` nie rozumiała w ogóle.
            // Diagnostyka, której nie można wierzyć, jest gorsza niż jej brak.
            if (list.some(s => s.toLowerCase() === "'none'")) {
                return `ZABRONIONE (wg ${used}: 'none')`;
            }
            const ok = list.some(src => {
                const s = String(src).trim();
                const low = s.toLowerCase();
                if (low === "'self'") return host === location.hostname;
                // Pozostałe słowa kluczowe w cudzysłowach ('unsafe-inline',
                // 'nonce-...', 'sha256-...') nie mają nic wspólnego z hostami.
                if (low.startsWith("'")) return false;
                if (s === '*') return true;
                // Sam schemat: `https:` dopuszcza dowolne źródło https.
                if (/^https?:$/i.test(s)) return true;
                const v = low.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
                if (v === '*') return true;
                if (v.startsWith('*.')) return host === v.slice(2) || host.endsWith(v.slice(1));
                return v === host;
            });
            return `${ok ? 'DOZWOLONE' : 'ZABRONIONE'} (wg ${used})`;
        },

        /** Zaczął się nowy przedmiot: ten sam ASIN ma pokazać się od nowa. */
        armNewItem() { this.awaiting = true; },

        /**
         * Zmiana ASIN jest samodzielnym wyzwalaczem, niezależnym od cyklu
         * przedmiotu.
         *
         * To ważne przy przerwanej obsłudze. Jeśli przedmiot porzucono, nie
         * dochodząc do `Przypisz nowy`, flaga itemInProgress zostaje wzniesiona
         * i następne `poniżej` NIE daje już przejścia false->true, czyli
         * armNewItem() nie zadziała. Karta i tak musi pokazać nowy produkt,
         * dlatego decyzja zapada po samym ASIN, a nie po stanie cyklu.
         *
         * awaiting potrzebny jest tylko do przypadku odwrotnego: ten sam ASIN
         * pod rząd (klient zwrócił pięć jednakowych rzeczy) — tam ASIN się nie
         * zmienia i przerysowanie wznosi właśnie początek nowego przedmiotu.
         */
        check() {
            // 9.2.0: przy wyłączonym module nie ma nawet po co szukać ASIN —
            // wynik i tak byłby użyty wyłącznie do zapytania sieciowego.
            if (!priceModuleOn()) return;
            const pc = store.localTabConfig.priceCard;
            /**
             * 8.5.0: kartę można SCHOWAĆ, nie wyłączając silnika.
             *
             * Potrzebne na zmiany, gdzie patrzeć na cenę nie ma po co, a znać
             * sumę pod koniec zmiany warto: obrazek się ładuje, cena jest
             * rozpoznawana, dziennik się napełnia, a na ekranie zostaje tylko
             * linia sumy w oknie statystyk. Dlatego warunkiem wyjścia nie jest
             * „karta niewidoczna”, tylko „i niewidoczna, i dziennik nieprowadzony”.
             */
            if (!pc.visible && !pc.logValues) return;
            const asin = this.detectAsin();
            if (!asin) return;

            const changed = asin !== this.shownAsin;
            if (!changed && !this.awaiting) return;

            if (changed && store.uiFlags.itemInProgress && this.shownAsin) {
                Utils.log(`[CENA] ASIN zmienił się na ${asin}, choć poprzedni przedmiot nie został zakończony`);
            }

            this.awaiting = false;
            const wasAsin = this.shownAsin;
            this.shownAsin = asin;
            if (changed && wasAsin !== null) bus.emit('price:asinChanged', { asin });
            Utils.log(`[CENA] ASIN na ekranie: ${asin}`, this.cache.has(asin) ? '(z pamięci)' : '(nowy)');
            this.render();
            this.resolve(asin);
        },

        // ---------------- interfejs ----------------
        init() {
            this.el = h('div', {
                id: 'priceCard',
                style: {
                    position: 'fixed', zIndex: '2147483641', boxSizing: 'border-box',
                    borderRadius: '10px', padding: '10px 14px',
                    fontFamily: CONFIG.FONT_FAMILY_OPTIONS.default,
                    transition: 'top .2s, left .2s, opacity .2s',
                    pointerEvents: 'none', userSelect: 'none',
                },
            });

            /**
             * ASIN — JEDYNY KLIKALNY ELEMENT KARTY (8.5.0).
             *
             * Karta jest przezroczysta dla myszy: `pointer-events:none` na niej
             * i na wszystkich dzieciach, żeby kliknięcia dochodziły do interfejsu
             * T-REX. Dla linku robi się dokładnie jeden wyjątek —
             * `pointer-events:auto` na samym elemencie. CSS na to pozwala:
             * potomek może odzyskać zdarzenia, nawet jeśli przodek ich nie
             * przyjmuje. Wszystko inne — cena, RRP, źródło, ramka wykresu —
             * zostaje przezroczyste dla kliknięć.
             *
             * Link prowadzi do /dp/<ASIN> w TYM SAMYM sklepie, z którego wykresu
             * wzięto cenę (patrz CONFIG.MARKETPLACES), inaczej sprawdzenie ceny
             * oczami traci sens: otworzyłaby się witryna innego kraju.
             */
            this.asinEl = h('a', {
                target: '_blank',
                rel: 'noopener noreferrer',
                title: '',
            });
            this.priceEl = h('div');
            this.rrpEl = h('div');
            this.srcEl = h('div');
            this.graphWrap = h('div');
            // no-referrer jest obowiązkowy. Keepa oddaje obrazek tylko wtedy, gdy
            // nagłówka Referer nie ma: z localhost i z każdą inną polityką
            // przychodzi błąd, bez referera — 500x200 w 79 ms.
            this.graphImg = h('img', { referrerPolicy: 'no-referrer' });
            this.graphWrap.appendChild(this.graphImg);
            this.el.append(this.asinEl, this.priceEl, this.rrpEl, this.srcEl, this.graphWrap);

            document.body.appendChild(this.el);
            this.applyStyle();

            // Przeciąganie włącza się z ustawień: dopiero wtedy karta przestaje
            // być przezroczysta i zaczyna łapać mysz.
            bus.on('store:changed:uiFlags.isPriceCardDragging', (d) => {
                if (d.value) {
                    this.el.style.pointerEvents = 'auto';
                    this.el.style.cursor = 'grab';
                    this.el.style.outline = '2px dashed #FFA500';
                    this.el.style.outlineOffset = '2px';
                } else {
                    this.el.style.pointerEvents = 'none';
                    this.el.style.cursor = 'default';
                    this.el.style.outline = 'none';
                }
                this.applyStyle();   // link włącza się i wyłącza razem z trybem
            });

            // Łapiemy blokady CSP po naszych własnych hostach.
            // 8.3.0: referencja do obsługi jest zapamiętana — potrzebna
            // w Main.teardown().
            this.onCspViolation = (e) => {
                const uri = String(e.blockedURI || '');
                if (!/graph\.keepa\.com|r\.jina\.ai|api\.keepa\.com/.test(uri)) return;

                const dir = e.effectiveDirective || e.violatedDirective || '';
                if (dir.startsWith('img')) this.csp.img = true;
                else this.csp.net = true;

                if (!this.csp.notified) {
                    this.csp.notified = true;
                    Utils.error(
                        'Polityka bezpieczeństwa strony (CSP) blokuje źródła ceny. ' +
                        'To ograniczenie serwera, ze skryptu nie da się go obejść. ' +
                        'Dyrektywa: ' + dir + ', adres: ' + uri);
                }
                this.applyStyle();
            };
            document.addEventListener('securitypolicyviolation', this.onCspViolation);

            // 8.3.0: włączono/wyłączono źródło tekstowe — wpisy 'off' w pamięci
            // przestały być prawdziwe.
            bus.on('store:changed:localTabConfig.priceCard.source', () => this.refresh());
            bus.on('store:changed:localTabConfig.priceCard.logValues', () => this.refresh());
            // Zmiana sklepu zmienia i wykres, i walutę — pytamy ponownie.
            bus.on('store:changed:userConfig.marketplace', () => { this.cache.clear(); this.refresh(); });

            // Nowy przedmiot — wznosimy pokaz (przypadek „pięć jednakowych pod rząd”).
            bus.on('store:changed:uiFlags.itemInProgress', (d) => { if (d.value === true) this.armNewItem(); });
            // Stronę skanuje AutoTrigger, osobnego obserwatora nie zakładamy.
            bus.on('page:scanned', () => this.check());
            // 8.3.0: karta zależy tylko od własnych ustawień i języka.
            onStorePaths(['localTabConfig.priceCard', 'userConfig.language'], () => this.applyStyle());

            this.check();
        },

        applyStyle() {
            if (!this.el) return;
            const pc = store.localTabConfig.priceCard;

            // 9.2.0: przy wyłączonym module karty nie ma na ekranie w ogóle —
            // pokazywałaby wyłącznie „—”, sugerując, że coś się liczy w tle.
            this.el.style.display = (pc.visible && priceModuleOn()) ? 'block' : 'none';
            this.el.style.width = `${Utils.clampNum(pc.width, 120, 1600, 280)}px`;
            this.el.style.left = pc.position.left || '14px';
            if (pc.position.top) { this.el.style.top = pc.position.top; this.el.style.bottom = 'auto'; }
            else { this.el.style.top = 'auto'; this.el.style.bottom = '14px'; }

            const rgb = Utils.hexToRgb(pc.bgColorHex);
            this.el.style.background = `rgba(${rgb}, ${Utils.clampNum(pc.bgAlpha, 0, 100, 88) / 100})`;
            this.el.style.border = '1px solid rgba(130,170,255,.40)';
            this.el.style.boxShadow = '0 6px 26px rgba(0,0,0,.55)';

            // WAŻNE: skrót `font:` wymaga podania rodziny, a `inherit` jest w nim
            // niedopuszczalny — przeglądarka po cichu wyrzuca CAŁĄ regułę.
            // Złapane na stanowisku: cena rysowała się 14px/400 zamiast 30px/800.
            // Dlatego właściwości ustawia się osobno.
            const fs = Utils.clampNum(pc.fontSize, 10, 96, 30);
            const px = (k) => Math.round(fs * k) + 'px';

            // pointer-events:auto — ten jedyny wyjątek od przezroczystej karty.
            // Przy włączonym przeciąganiu jest zdejmowany: wtedy ciągnie się całą
            // kartę, a kliknięcie w link wyprowadziłoby ze strony w środku gestu.
            const dragging = store.uiFlags.isPriceCardDragging;
            this.asinEl.style.cssText = [
                'font-family:Consolas,Monaco,monospace', 'font-weight:600',
                'font-size:' + px(0.46), 'line-height:1.3',
                'color:rgba(190,215,255,.9)', 'letter-spacing:.6px', 'text-transform:uppercase',
                'display:inline-block',
                'pointer-events:' + (dragging ? 'none' : 'auto'),
                'cursor:' + (dragging ? 'inherit' : 'pointer'),
                'text-decoration:underline', 'text-decoration-style:dotted',
                'text-underline-offset:2px',
            ].join(';');

            this.priceEl.style.cssText = [
                'font-weight:800', 'font-size:' + px(1), 'line-height:1.15',
                'margin:4px 0 2px', 'text-shadow:0 2px 8px rgba(0,0,0,.75)', 'letter-spacing:.3px',
            ].join(';');

            this.rrpEl.style.cssText = [
                'font-weight:600', 'font-size:' + px(0.52), 'line-height:1.35',
                'color:rgba(255,214,130,.95)',
            ].join(';');

            this.srcEl.style.cssText = [
                'font-family:Consolas,Monaco,monospace', 'font-size:' + px(0.36),
                'line-height:1.4', 'color:rgba(205,220,245,.6)', 'margin-top:4px',
            ].join(';');

            // Dwa różne tryby wyświetlania wykresu.
            //
            // PRZYCIĘCIE (domyślnie): obrazek NIE jest skalowany — wychodzi
            // w natywnych 500x200 i przesuwa się w lewo o brakującą szerokość.
            // Czyli zwężenie karty odcina wykres z lewej, a nie ściska go.
            // Wysokość zostaje stała, a tekst legendy piksel w piksel — właśnie
            // tak cena czyta się najlepiej. Legenda Keepa jest narysowana
            // w prawym górnym rogu, więc widać ją nawet wtedy, gdy z wykresu
            // zostaje jedna trzecia szerokości.
            //
            // BEZ PRZYCIĘCIA: wykres wpisuje się w szerokość karty w całości,
            // proporcjonalnie się zmniejszając.
            const inner = Utils.clampNum(pc.width, 120, 1600, 280) - 28;
            const W = CONFIG.PRICE_KEEPA_PNG_W, H = CONFIG.PRICE_KEEPA_PNG_H;
            const frame = (w, h) => `overflow:hidden;width:${w}px;height:${h}px;margin-top:8px;`
                + 'border-radius:5px;border:1px solid rgba(255,255,255,.18);background:#fff';

            if (pc.graphMode === 'legend') {
                // TYLKO BLOK Z CENAMI. Obrazek wychodzi w całości, ale okienko
                // pokazuje wyłącznie ramkę legendy, a ujemne marginesy podsuwają
                // potrzebny fragment pod to okienko.
                const LX = CONFIG.PRICE_KEEPA_LEGEND_X, LY = CONFIG.PRICE_KEEPA_LEGEND_Y;
                const LW = CONFIG.PRICE_KEEPA_LEGEND_W, LH = CONFIG.PRICE_KEEPA_LEGEND_H;
                const k = inner / LW;
                this.graphWrap.style.cssText = frame(inner, Math.round(LH * k));
                this.graphImg.style.cssText = [
                    `width:${Math.round(W * k)}px`, `height:${Math.round(H * k)}px`,
                    `margin-left:${-Math.round(LX * k)}px`, `margin-top:${-Math.round(LY * k)}px`,
                    'display:block', 'max-width:none',
                ].join(';');
            } else if (pc.graphMode === 'right') {
                // Prawa część w naturalnej wielkości: obrazek nie jest skalowany,
                // zwężenie karty odcina wykres z lewej. Okienko opiera się o 500px,
                // inaczej z prawej zostawałoby puste białe pole.
                const shift = Math.max(0, W - inner);
                this.graphWrap.style.cssText = frame(Math.min(inner, W), H);
                this.graphImg.style.cssText =
                    `width:${W}px;height:${H}px;margin-left:${-shift}px;margin-top:0;display:block;max-width:none`;
            } else {
                // Cały wykres wpisany w szerokość karty.
                this.graphWrap.style.cssText = frame(inner, Math.round(inner * H / W));
                this.graphImg.style.cssText =
                    `width:${inner}px;height:auto;margin-left:0;margin-top:0;display:block;max-width:none`;
            }
            // 8.4.0: ramka wykresu widoczna TYLKO w trybie 'graph'.
            // W trybie 'ocr' obrazek i tak się ładuje — czyta się z niego cenę —
            // ale żyje poza dokumentem, w offscreen-canvas, i na ekran nie trafia.
            // Obrazek tnie CSP — pustej ramki nie pokazujemy wcale.
            this.graphWrap.style.display =
                (pc.source === 'graph' && pc.showGraph && !this.csp.img && priceModuleOn()) ? 'block' : 'none';

            this.render();
        },

        render() {
            if (!this.el) return;
            const pc = store.localTabConfig.priceCard;
            const asin = this.shownAsin;

            if (!asin) {
                this.asinEl.textContent = I18n.get('priceCard_noAsin');
                this.asinEl.removeAttribute('href');   // nie ma czego otwierać
                this.asinEl.title = '';
                this.priceEl.textContent = '—';
                this.priceEl.style.color = 'rgba(255,255,255,.5)';
                this.rrpEl.textContent = ''; this.srcEl.textContent = '';
                this.graphWrap.style.display = 'none';
                return;
            }

            this.asinEl.textContent = `${asin}`;
            // Link prowadzi na TEN rynek, z którego zdjęto cenę. Jeśli znaleziono
            // ją przeglądem sklepów, to nie jest wybrany sklep i prowadzić do
            // wybranego nie wolno: człowiek otworzyłby amazon.de i nie zobaczył
            // tam pokazanej ceny.
            const found = this.cache.get(asin);
            const url = productUrl(asin, found && found.market);
            this.asinEl.setAttribute('href', url);
            this.asinEl.title = url;
            // !csp.img jest obowiązkowy także tutaj: applyStyle() ramkę chowa,
            // a render() wywołuje się później i bez tego sprawdzenia przywracałby ją.
            if (pc.source === 'graph' && pc.showGraph && !this.csp.img && priceModuleOn()) {
                this.graphWrap.style.display = 'block';
                const want = this.keepaUrl(asin, found && found.market);
                if (this.graphImg.getAttribute('src') !== want) this.graphImg.setAttribute('src', want);
            }

            if (this.inFlight.has(asin)) {
                // 8.5.0: cena pytana jest na nowo przy każdym przedmiocie, więc
                // „…” zamiast liczby migałoby bez przerwy. Jeśli poprzedni wynik
                // po tym samym ASIN jest — pokazujemy go przygaszony, a w linii
                // źródła piszemy, że trwa odświeżanie.
                const prev = this.cache.get(asin);
                if (prev && prev.status === 'ok' && prev.current && pc.showPrice) {
                    this.priceEl.style.display = 'block';
                    this.priceEl.textContent = prev.current.text;
                    this.priceEl.style.color = 'rgba(124,255,168,.45)';
                } else {
                    this.priceEl.style.display = 'block';
                    this.priceEl.textContent = '…';
                    this.priceEl.style.color = 'rgba(255,255,255,.65)';
                }
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                const hunting = this.searchingOther === asin;
                this.rrpEl.textContent = I18n.get(hunting ? 'priceCard_searchingOther' : 'priceCard_searching');
                this.srcEl.textContent = hunting ? '' : I18n.get('priceCard_refreshing');
                return;
            }

            const r = this.cache.get(asin);

            // KOLEJNOŚĆ GAŁĘZI JEST WAŻNA (8.3.0).
            //
            // W 8.2.0 sprawdzenie CSP stało WYŻEJ niż rozbiór statusu i było
            // zapisane jako `r.status === 'csp' || this.csp.img || this.csp.net`.
            // Przez to wystarczyła blokada OBRAZKA (img-src), żeby otrzymana już
            // cena była wyrzucana, a zamiast niej pokazywało się „—” z komunikatem
            // o zablokowanym wykresie. Kombinacja całkiem realna: CSP to imienna
            // lista hostów i connect-src spokojnie przepuszcza r.jina.ai, podczas
            // gdy img-src tnie graph.keepa.com.
            //
            // Teraz najpierw patrzymy, czy cena jest, a dopiero potem tłumaczymy,
            // czemu jej nie ma.

            // 1. Cena jest — pokazujemy, cokolwiek blokowałaby polityka.
            if (r && r.status === 'ok') {
                const price = r.current || r.rrp;
                this.priceEl.textContent = pc.showPrice && price ? price.text : '';
                this.priceEl.style.color = '#7CFFA8';
                this.priceEl.style.display = pc.showPrice ? 'block' : 'none';

                // Druga linia: albo prawdziwa RRP (daje ją tylko jina/keepa-api),
                // albo druga seria wykresu („Neu 11.49”). Przekreślenie stawia się
                // TYLKO przy RRP: przekreślona cena znaczy „stara”, a wieszanie
                // tego na żywej ofercie byłoby wprost dezinformacją.
                if (pc.showRrp && r.rrp) {
                    this.rrpEl.textContent = `${I18n.get('priceCard_rrp')} ${r.rrp.text}`;
                    this.rrpEl.style.textDecoration = 'line-through';
                    this.rrpEl.style.display = 'block';
                } else if (pc.showRrp && r.secondary) {
                    this.rrpEl.textContent = r.secondary.text;
                    this.rrpEl.style.textDecoration = 'none';
                    this.rrpEl.style.display = 'block';
                } else {
                    this.rrpEl.textContent = '';
                    this.rrpEl.style.textDecoration = 'none';
                    this.rrpEl.style.display = pc.showRrp ? 'block' : 'none';
                }

                const bits = [r.source];
                // Cena z OBCEGO rynku musi być widoczna jako taka, inaczej suma
                // za zmianę niepostrzeżenie zmiesza waluty i witryny.
                if (r.fallback && r.market) {
                    bits.push(I18n.get('priceCard_foundIn', { host: marketplace(r.market).host.replace(/^www\./, '') }));
                }
                bits.push(`${r.ms}ms`);
                if (r.stale) bits.push(I18n.get('priceCard_cached'));
                this.srcEl.textContent = bits.join(' · ');
                this.srcEl.style.color = r.fallback ? 'rgba(255,214,130,.85)' : 'rgba(205,220,245,.6)';
                return;
            }

            // 2. Ceny nie ma i coś tnie CSP — to właśnie jest przyczyna.
            if (this.csp.img || this.csp.net || (r && r.status === 'csp')) {
                const both = this.csp.img && this.csp.net;
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
                this.priceEl.style.color = '#FFC46B';
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                // W trybie 'ocr' blokada obrazka znaczy nie „nie ma wykresu”,
                // tylko „nie ma skąd przeczytać ceny” — dla człowieka to różne rzeczy.
                const ocrMode = pc.source === 'ocr';
                this.rrpEl.textContent = I18n.get(
                    both ? 'priceCard_cspBoth'
                         : (this.csp.img ? (ocrMode ? 'priceCard_cspOcr' : 'priceCard_cspImg')
                                         : 'priceCard_cspNet'));
                this.srcEl.textContent = 'CSP';
                return;
            }

            // 3. Źródła tekstowe wyłączone, obrazek żyje — cena jest na wykresie,
            //    linie ceny i RRP po prostu chowamy, żeby nie zawadzały.
            if (r && r.status === 'off') {
                this.priceEl.style.display = 'none';
                this.rrpEl.style.display = 'none';
                this.rrpEl.style.textDecoration = 'none';
                this.srcEl.textContent = I18n.get('priceCard_jinaOff');
                return;
            }

            // 4. Odpowiedzi jeszcze nie ma.
            if (!r) {
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
                this.priceEl.style.color = 'rgba(255,255,255,.5)';
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                this.rrpEl.textContent = '';
                this.srcEl.textContent = '';
                return;
            }

            // 5. Źródła odpracowały, ceny nie ma.
            this.priceEl.style.display = 'block';
            this.priceEl.textContent = '—';
            this.priceEl.style.color = '#FF9A9A';
            this.rrpEl.style.display = 'block';
            this.rrpEl.textContent = r.reason || I18n.get('priceCard_noPrice');
            this.rrpEl.style.textDecoration = 'none';
            this.srcEl.textContent = I18n.get('priceCard_seeChart');
        },

        stats() {
            const cap = (v) => (isFinite(v) ? String(v) : 'bez limitu');
            return {
                'moduł cen': priceModuleOn() ? 'włączony' : 'WYŁĄCZONY (sieć nieużywana)',
                'zapytań tekstowych': `${this.requestCount} / ${cap(CONFIG.PRICE_MAX_REQUESTS_PER_SESSION)}`,
                'obrazków Keepa': `${this.imageCount} / ${cap(CONFIG.PRICE_MAX_IMAGE_REQUESTS)}`,
                'ASIN w pamięci sesji': this.cache.size,
                'udanych': [...this.cache.values()].filter(r => r.status === 'ok').length,
                'na ekranie': this.shownAsin,
                'sklep': store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE,
            };
        },
    };
