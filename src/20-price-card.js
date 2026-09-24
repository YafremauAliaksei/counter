    // ==========================================
    // 6b. PRICE CARD (karta ceny po ASIN)
    // ==========================================
    /**
     * Pokazuje cenę produktu, który jest właśnie obsługiwany.
     *
     * Zapytanie do amazon.* ze strony T-REX jest niemożliwe (Same-Origin
     * Policy: zwykły fetch, XHR, no-cors, iframe, script src i widżety
     * partnerskie są blokowane; Tampermonkey obchodzi to tylko dlatego, że
     * GM_xmlhttpRequest działa w kontekście rozszerzenia). Źródła są dwa:
     *   r.jina.ai       — tekst strony, oddaje nagłówki CORS;
     *   graph.keepa.com — obrazek, któremu CORS nie jest potrzebny.
     *
     * Jedno zapytanie na przedmiot, pytane przy nowym ASIN albo na początku
     * nowego przedmiotu. Nic nie wychodzi, dopóki moduł cen nie zostanie
     * włączony ręcznie.
     */
    const PriceCard = {
        // asin -> {status, current, rrp, source, ms}. To nie pamięć cen (cena
        // jest pytana przy każdym przedmiocie), tylko ostatni wynik do
        // rysowania, póki leci nowe zapytanie. Rozmiar ogranicza _remember().
        cache: new Map(),
        inFlight: new Set(),
        shownAsin: null,
        // ASIN, dla którego właśnie trwa przegląd sklepów.
        searchingOther: null,
        awaiting: false,         // zaczął się nowy przedmiot, czekamy na ASIN
        requestCount: 0,
        // Obrazki Keepa liczą się osobno od zapytań tekstowych — mają własny
        // limit (CONFIG.PRICE_MAX_IMAGE_REQUESTS).
        imageCount: 0,
        nextSlotAt: 0,
        el: null,

        /**
         * Blokady Content-Security-Policy — druga bariera, niezależna od CORS.
         * Wystawia ją serwer strony i z kodu strony obejść się jej nie da;
         * brakujące źródło przeglądarka tnie przed wyjściem w sieć.
         *
         * Blokadę zgłasza zdarzenie securitypolicyviolation — po nim karta
         * mówi, dlaczego ceny nie ma, zamiast zostawić pustą ramkę.
         */
        csp: { img: false, net: false, notified: false },

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
            return isNaN(n) ? null : { value: n, currency: cur, text: `${cur} ${n.toFixed(2)}` };
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

        keepaUrl(asin, market) { return KeepaOCR.url(asin, market); },

        // ---------------- źródła ----------------
        providers() {
            const self = this;
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
                    get available() {
                        const pc = store.localTabConfig.priceCard;
                        // Obrazek tnie CSP — nie ma czego czytać.
                        if (self.csp.img) return false;
                        return pc.source === 'ocr' || pc.source === 'graph' || !!pc.logValues;
                    },
                    isImage: true,
                    // Liczniki zapytań prowadzi pętla w resolve(), nie dostawca.
                    async run(asin, signal, market) {
                        const d = await KeepaOCR.read(asin, market);
                        if (!d) throw new Error('cena na wykresie nierozpoznana');
                        return self.buildOcrResult(d, market);
                    },
                },
                {
                    // Oficjalne API Keepa: oddaje CORS, wymaga płatnego klucza.
                    // Z kluczem to najlepsze źródło — dokładna cena bez
                    // rozbierania szablonu strony.
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
                        // 422 = bloku na stronie nie ma (inny szablon, strona
                        // zgody na ciasteczka) — próbujemy następnego trybu.
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
         * Przerwa między zapytaniami. Slot rezerwuje się synchronicznie, przed
         * pierwszym await — inaczej dwa równoległe resolve() odczytałyby tę
         * samą wartość i wyszły w sieć jednocześnie.
         */
        respectRateLimit() {
            const now = Date.now();
            const slot = Math.max(now, this.nextSlotAt || 0);
            this.nextSlotAt = slot + CONFIG.PRICE_MIN_REQUEST_GAP_MS;
            const wait = slot - now;
            return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve();
        },

        /**
         * Limit czasu zapytania: po przekroczeniu fetch jest przerywany
         * (AbortController), a timer zdejmowany w każdym przypadku.
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
         * Wynik rozbioru obrazka do wspólnej postaci. Waluta pochodzi z rynku,
         * z którego zdjęto cenę — przy przeglądzie sklepów to nie wybrany sklep.
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
         * Kolejność przeglądu sklepów: rynek z linku na stronie, potem Europa,
         * na końcu PRICE_FALLBACK_LAST — w obrębie grupy losowo. Bez wybranego
         * rynku (ten już odpowiedział „nie ma”) i bez rynków, dla których Keepa
         * nie ma danych.
         *
         * @param {string} from       rynek już sprawdzony
         * @param {string|null} hint  rynek z linku do produktu na stronie
         * @param {function} [random] źródło losowości (testy podają własne)
         */
        fallbackOrder(from, hint, random = Math.random) {
            const shuffle = (list) => {
                for (let i = list.length - 1; i > 0; i--) {     // tasowanie Fishera-Yatesa
                    const j = Math.floor(random() * (i + 1));
                    [list[i], list[j]] = [list[j], list[i]];
                }
                return list;
            };
            const pool = Object.keys(CONFIG.MARKETPLACES)
                .filter(k => k !== from && k !== hint && CONFIG.MARKETPLACES[k].keepa_ok);
            const late = pool.filter(k => CONFIG.PRICE_FALLBACK_LAST.includes(k));
            const first = hint && hint !== from && CONFIG.MARKETPLACES[hint]
                && CONFIG.MARKETPLACES[hint].keepa_ok ? [hint] : [];
            return first
                .concat(shuffle(pool.filter(k => !late.includes(k))), shuffle(late))
                .slice(0, CONFIG.PRICE_FALLBACK_MAX_TRIES);
        },

        /**
         * PRZEGLĄD POZOSTAŁYCH SKLEPÓW, gdy wybrany rynek ceny nie dał
         * (zasady: CONFIG.PRICE_FALLBACK_*). Zwraca pierwszy sukces albo null.
         * Wybrany sklep się nie zmienia — następny przedmiot zaczyna od niego.
         */
        async tryOtherMarkets(asin) {
            const from = marketplaceKey();
            const hint = this.linkMarket && this.linkMarket.asin === asin ? this.linkMarket.key : null;
            const tries = this.fallbackOrder(from, hint);
            Utils.log(`[CENA] ${asin}: na ${from} ceny nie ma, próbuję ${tries.join(', ')}`);

            for (const key of tries) {
                // Moduł mógł zostać wyłączony w trakcie przeglądu — przerywamy
                // natychmiast, zamiast dosyłać resztę zapytań.
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
         * Zapytać ponownie o cenę produktu na ekranie (po zmianie ustawień).
         * Gdy po tym ASIN już leci zapytanie, `inFlight` nowego nie przepuści
         * — wtedy zostaje flaga, a resolve() po zakończeniu sam ponawia
         * odświeżenie (inaczej po zmianie sklepu została cena starego rynku).
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
         * Pyta o cenę — na nowo przy każdym przedmiocie. Cena na Amazonie
         * zmienia się w ciągu dnia, więc trwałej pamięci cen nie ma; `cache`
         * to tylko ostatni wynik do rysowania.
         *
         * Przed lawiną chroni `inFlight` (drugie zapytanie po tym samym ASIN nie
         * wychodzi), a częstotliwość ogranicza cykl obsługi: check() woła
         * resolve() przy zmianie ASIN albo na początku przedmiotu, nie przy
         * każdej mutacji DOM. Pierwszy warunek to moduł cen — ta sama bariera
         * co w KeepaOCR.loadImage(), celowo na wejściu i na wyjściu.
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
                    // securitypolicyviolation przychodzi asynchronicznie, po
                    // odmowie fetch — flagę sprawdzamy w każdym obiegu, żeby
                    // następny dostawca nie wchodził w zablokowaną sieć.
                    if (this.csp.net) break;

                    // Limit sprawdza się po typie dostawcy: obrazki i zapytania
                    // tekstowe mają osobne liczniki i osobne limity.
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
         * Zapamiętać wynik po ASIN, przycinając pamięć karty do
         * PRICE_CACHE_MAX_ENTRIES. Mapa trzyma kolejność wstawiania, więc
         * „usuń i włóż od nowa” robi z niej LRU — bez przycinania rosłaby przez
         * całą zmianę.
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
        /**
         * Rynek z linku do produktu: `https://www.amazon.it/dp/…` → 'it'.
         *
         * Tylko hosty z CONFIG.MARKETPLACES, porównane w całości — link
         * względny, obcy host albo `amazon.it.evil.example` dają null. Wynik
         * decyduje wyłącznie o kolejności przeglądu rynków; adres zapytania
         * składa się z tablicy, a nie z tekstu strony.
         */
        marketFromHref(href) {
            const m = /^(?:https?:)?\/\/([^/?#:]+)/i.exec(String(href || ''));
            if (!m) return null;
            const host = m[1].toLowerCase().replace(/^www\./, '');
            return Object.keys(CONFIG.MARKETPLACES)
                .find(k => CONFIG.MARKETPLACES[k].host.replace(/^www\./, '') === host) || null;
        },

        /**
         * Rynek linku, z którego wzięto ostatni ASIN: { asin, key } albo null.
         * ASIN z samego tekstu strony rynku nie ma — wtedy przegląd idzie
         * zwykłą kolejnością.
         */
        linkMarket: null,

        detectAsin() {
            for (const a of document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
                if (a.closest('#' + CONFIG.SCRIPT_ID_PREFIX + 'priceCard')) continue;
                const href = a.getAttribute('href') || '';
                const m = href.match(CONFIG.PRICE_ASIN_FROM_HREF);
                if (m) {
                    const key = this.marketFromHref(href);
                    this.linkMarket = key ? { asin: m[1], key } : null;
                    return m[1];
                }
            }
            this.linkMarket = null;
            // Rezerwa po tekście, gdy linku do produktu nie ma.
            //
            // ASIN tylko wtedy, gdy na stronie jest jeden: przy kilku kolejność
            // w dokumencie nie mówi, który jest bieżący (pierwszy to bywa stary
            // wpis dziennika, ostatni — cudzy panel stanu). Przy
            // niejednoznaczności karta zostaje przy ostatnim pewnym ASIN.
            //
            // Karta znika na czas odczytu, żeby nie podać własnego ASIN
            // (pokazuje poprzedni przedmiot). Przywrócenie w `finally` —
            // innerText rzuca przy rozbieranym drzewie, a karta nie może
            // zostać schowana na zawsze.
            const prev = this.el && this.el.style.display;
            let text;
            try {
                if (this.el) this.el.style.display = 'none';
                text = document.body.innerText || '';
            } finally {
                if (this.el) this.el.style.display = prev || '';
            }

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
         * CSP to imienna lista hostów, a nie wyłącznik: to, że skrypt się
         * załadował, znaczy tylko, że dozwolony jest host, z którego go
         * pobrano, a nie graph.keepa.com czy r.jina.ai.
         *
         * Polityka częściej przychodzi nagłówkiem HTTP niż meta-tagiem, więc
         * nagłówek doczytuje się zapytaniem o własną stronę (własny origin,
         * przechodzi nawet przy `connect-src 'self'`). To jedyne zapytanie
         * niezależne od modułu cen: nie wychodzi poza własną domenę i leci tylko
         * po ręcznym SH.cspReport().
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

            // Rozbiór źródeł według gramatyki CSP: host (z maską *.),
            // sam schemat (`https:`), 'none' i 'self'.
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
         * przedmiotu: przy porzuconym przedmiocie flaga itemInProgress zostaje
         * podniesiona, armNewItem() nie zadziała, a karta i tak musi pokazać
         * nowy produkt.
         *
         * `awaiting` obsługuje przypadek odwrotny: ten sam ASIN pod rząd (pięć
         * jednakowych zwrotów) — ASIN się nie zmienia, więc o nowym zapytaniu
         * decyduje początek nowego przedmiotu.
         */
        check() {
            // Bez modułu cen ASIN nie jest potrzebny — służy tylko zapytaniu.
            if (!priceModuleOn()) return;
            const pc = store.localTabConfig.priceCard;
            // Karta może być schowana przy prowadzonym dzienniku (widać tylko
            // sumę w linii 6) — wychodzimy dopiero, gdy nie ma ani karty,
            // ani dziennika.
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
             * Kod produktu — jedyny element karty, który może łapać mysz.
             * Karta i jej dzieci mają `pointer-events:none`; link odzyskuje
             * zdarzenia własnym `pointer-events:auto`, gdy klikalność jest
             * włączona (applyStyle). Prowadzi do /dp/<ASIN> w sklepie, z którego
             * wzięto cenę.
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
            // no-referrer jest obowiązkowy: Keepa oddaje obrazek tylko bez
            // nagłówka Referer.
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

            // Blokady CSP po naszych hostach. Referencja do obsługi jest
            // zapamiętana dla Main.teardown().
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

            // Zmieniło się źródło ceny — wpisy 'off' w pamięci przestały być prawdziwe.
            bus.on('store:changed:localTabConfig.priceCard.source', () => this.refresh());
            bus.on('store:changed:localTabConfig.priceCard.logValues', () => this.refresh());
            // Zmiana sklepu zmienia i wykres, i walutę — pytamy ponownie.
            bus.on('store:changed:userConfig.marketplace', () => { this.cache.clear(); this.refresh(); });

            // Nowy przedmiot — wznosimy pokaz (przypadek „pięć jednakowych pod rząd”).
            bus.on('store:changed:uiFlags.itemInProgress', (d) => { if (d.value === true) this.armNewItem(); });
            // Stronę skanuje AutoTrigger, osobnego obserwatora nie zakładamy.
            bus.on('page:scanned', () => this.check());
            // Karta zależy tylko od własnych ustawień i języka.
            onStorePaths(['localTabConfig.priceCard', 'userConfig.language'], () => this.applyStyle());

            this.check();
        },

        /**
         * Kolor wszystkich tekstów karty — jedna wartość na kartę, jak w liniach
         * okna. Liczony przy każdym applyStyle(), więc zmiana w panelu działa
         * od razu.
         */
        textColor() {
            const pc = store.localTabConfig.priceCard;
            const alpha = Utils.clampNum(pc.alpha, 0, 100, 50) / 100;
            return `rgba(${Utils.hexToRgb(pc.colorHex)}, ${alpha.toFixed(3)})`;
        },

        applyStyle() {
            if (!this.el) return;
            const pc = store.localTabConfig.priceCard;

            // Bez modułu cen karty nie ma na ekranie — sama „—” sugerowałaby,
            // że coś liczy się w tle.
            this.el.style.display = (pc.visible && priceModuleOn()) ? 'block' : 'none';
            this.el.style.width = `${Utils.clampNum(pc.width, 120, 1600, 280)}px`;
            this.el.style.left = pc.position.left || '14px';
            if (pc.position.top) { this.el.style.top = pc.position.top; this.el.style.bottom = 'auto'; }
            else { this.el.style.top = 'auto'; this.el.style.bottom = '14px'; }

            // Tło, ramka i cień idą razem: przy przezroczystym tle ramka i cień
            // zostawiłyby pustą obwódkę nad stroną. Nie ma tła — zostaje sam
            // tekst, jak w liniach okna.
            const bgAlpha = Utils.clampNum(pc.bgAlpha, 0, 100, 0);
            const rgb = Utils.hexToRgb(pc.bgColorHex);
            this.el.style.background = bgAlpha > 0 ? `rgba(${rgb}, ${bgAlpha / 100})` : 'transparent';
            this.el.style.border = bgAlpha > 0 ? '1px solid rgba(130,170,255,.40)' : 'none';
            this.el.style.boxShadow = bgAlpha > 0 ? '0 6px 26px rgba(0,0,0,.55)' : 'none';
            this.el.style.padding = bgAlpha > 0 ? '10px 14px' : '0';
            // Krój z tej samej listy, co okno statystyk: karta ma czytać się jak
            // reszta interfejsu, a nie jak osobny widżet.
            this.el.style.fontFamily =
                CONFIG.FONT_FAMILY_OPTIONS[pc.fontFamily] || CONFIG.FONT_FAMILY_OPTIONS.default;

            // Właściwości osobno, nie skrótem `font:` — skrót wymaga rodziny,
            // nie przyjmuje `inherit` i przeglądarka po cichu wyrzuca całą regułę.
            const fs = Utils.clampNum(pc.fontSize, 10, 96, 16);
            const px = (k) => Math.max(9, Math.round(fs * k)) + 'px';

            // Słaby cień tekstu, bo tło bywa przezroczyste: jasny tekst na
            // jasnym fragmencie strony przestałby być czytelny.
            const SHADOW = 'text-shadow:0 1px 3px rgba(0,0,0,.6)';
            const COLOR = 'color:' + this.textColor();

            // pointer-events:auto — ten jedyny wyjątek od przezroczystej karty.
            // Przy włączonym przeciąganiu jest zdejmowany: wtedy ciągnie się całą
            // kartę, a kliknięcie w link wyprowadziłoby ze strony w środku gestu.
            const dragging = store.uiFlags.isPriceCardDragging;
            // Klikalność kodu produktu (domyślnie wyłączona — to jedyne miejsce,
            // w którym karta mogłaby przykryć przycisk T-REX). Przy przeciąganiu
            // link jest zdejmowany niezależnie od ustawienia.
            const linkOn = pc.asinClickable === true && !dragging;
            this.asinEl.style.cssText = [
                'font-weight:400', 'font-size:' + px(0.8), 'line-height:1.3',
                COLOR, 'letter-spacing:.5px', 'text-transform:uppercase',
                'display:' + (pc.showAsin === false ? 'none' : 'inline-block'),
                'pointer-events:' + (linkOn ? 'auto' : 'none'),
                'cursor:' + (linkOn ? 'pointer' : 'inherit'),
                'text-decoration:' + (linkOn ? 'underline' : 'none'),
                'text-decoration-style:dotted', 'text-underline-offset:2px',
                SHADOW,
            ].join(';');

            // Cena tą samą grubością co linie okna — to podpowiedź, nie baner.
            this.priceEl.style.cssText = [
                'font-weight:400', 'font-size:' + px(1), 'line-height:1.25',
                'margin:' + (bgAlpha > 0 ? '4px 0 2px' : '1px 0 0'),
                COLOR, SHADOW, 'letter-spacing:.2px',
            ].join(';');

            this.rrpEl.style.cssText = [
                'font-weight:400', 'font-size:' + px(0.8), 'line-height:1.3',
                COLOR, SHADOW,
            ].join(';');

            this.srcEl.style.cssText = [
                'font-size:' + px(0.7), 'line-height:1.35',
                COLOR, 'margin-top:' + (bgAlpha > 0 ? '4px' : '1px'),
                SHADOW,
            ].join(';');

            // Tryby wykresu. Przycięcie: obrazek w natywnych 500x200 przesuwa
            // się w lewo, więc zwężenie karty odcina wykres z lewej, a legenda
            // (prawy górny róg) zostaje piksel w piksel. Bez przycięcia: cały
            // wykres wpisany w szerokość karty.
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
            // Ramka wykresu tylko w trybie 'graph'. W trybie 'ocr' obrazek żyje
            // poza dokumentem (canvas) i na ekran nie trafia. Przy blokadzie
            // CSP pustej ramki nie pokazujemy.
            this.graphWrap.style.display =
                (pc.source === 'graph' && pc.showGraph && !this.csp.img && priceModuleOn()) ? 'block' : 'none';

            this.render();
        },

        /**
         * Tekst ceny na karcie: w walucie wyświetlania, jeśli ją wybrano,
         * inaczej tak, jak przyszła ze sklepu. Obiekt ceny się nie zmienia —
         * do dziennika idzie kwota i waluta sklepu, do sumy euro.
         */
        priceText(p) {
            return FxRates.display(p.value, p.currency) || p.text;
        },

        /**
         * Wpisuje tekst w wiersz karty; pusty tekst chowa wiersz, żeby nie
         * zostawała pusta linijka.
         *
         * Wiersz RRP i wiersz źródła niosą raz informację dodatkową (cena
         * katalogowa, dostawca, czas), a raz powód braku ceny (CSP, limit,
         * brak wyniku). Wyłączniki `showRrp` i `showSource` dotyczą tylko
         * pierwszej roli — powód awarii pokazuje się zawsze, bo karta z samą
         * kreską wygląda jak zepsuty skrypt. Stany przejściowe (zapytanie,
         * przegląd sklepów) idą pod wyłącznikami, żeby nie migać drugim
         * wierszem przy każdym przedmiocie. O roli decyduje wywołujący.
         *
         * @param {HTMLElement} el   wiersz do zapisania
         * @param {string} text      treść; pusta chowa wiersz
         */
        setLine(el, text) {
            el.textContent = text || '';
            el.style.display = text ? 'block' : 'none';
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
                this.rrpEl.textContent = ''; this.srcEl.textContent = '';
                this.graphWrap.style.display = 'none';
                return;
            }

            this.asinEl.textContent = `${asin}`;
            // Link prowadzi na rynek, z którego zdjęto cenę — po przeglądzie
            // sklepów to nie wybrany sklep.
            const found = this.cache.get(asin);
            if (pc.asinClickable === true) {
                const url = productUrl(asin, found && found.market);
                this.asinEl.setAttribute('href', url);
                this.asinEl.title = url;
            } else {
                // Bez klikalności kod jest zwykłym tekstem, bez href: element
                // z href zostaje w kolejności tabulacji i otwiera się środkowym
                // przyciskiem, nawet przy `pointer-events:none`.
                this.asinEl.removeAttribute('href');
                this.asinEl.title = '';
            }
            // !csp.img także tutaj — applyStyle() chowa ramkę, a render()
            // idzie później i przywróciłby ją.
            if (pc.source === 'graph' && pc.showGraph && !this.csp.img && priceModuleOn()) {
                this.graphWrap.style.display = 'block';
                const want = this.keepaUrl(asin, found && found.market);
                if (this.graphImg.getAttribute('src') !== want) this.graphImg.setAttribute('src', want);
            }

            if (this.inFlight.has(asin)) {
                // Póki trwa zapytanie, zostaje poprzedni wynik po tym ASIN —
                // „…” migałoby przy każdym przedmiocie.
                const prev = this.cache.get(asin);
                this.priceEl.style.display = 'block';
                this.priceEl.textContent =
                    (prev && prev.status === 'ok' && prev.current && pc.showPrice)
                        ? this.priceText(prev.current) : '…';
                this.rrpEl.style.textDecoration = 'none';
                // Stan przejściowy, nie awaria — idzie pod wyłącznikami.
                const hunting = this.searchingOther === asin;
                this.setLine(this.rrpEl, pc.showRrp
                    ? I18n.get(hunting ? 'priceCard_searchingOther' : 'priceCard_searching') : '');
                this.setLine(this.srcEl, pc.showSource && !hunting
                    ? I18n.get('priceCard_refreshing') : '');
                return;
            }

            const r = this.cache.get(asin);

            // Kolejność gałęzi jest ważna: najpierw „czy cena jest”, dopiero
            // potem „dlaczego jej nie ma”. Blokada samego obrazka (img-src) nie
            // może wyrzucić ceny otrzymanej z r.jina.ai (connect-src).

            // 1. Cena jest — pokazujemy, cokolwiek blokowałaby polityka.
            if (r && r.status === 'ok') {
                const price = r.current || r.rrp;
                this.priceEl.textContent = pc.showPrice && price ? this.priceText(price) : '';
                this.priceEl.style.display = pc.showPrice ? 'block' : 'none';

                // Druga linia: RRP (tylko z jina/keepa-api) albo druga seria
                // wykresu („Neu 11.49”). Przekreślenie tylko przy RRP —
                // przekreślona cena znaczy „stara”, nie żywa oferta.
                if (pc.showRrp && r.rrp) {
                    this.rrpEl.textContent = `${I18n.get('priceCard_rrp')} ${this.priceText(r.rrp)}`;
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

                // Adnotacja „z innego sklepu” nie podlega wyłącznikowi źródła —
                // przy dwóch rynkach w euro nie widać różnicy nawet po kwocie.
                const fromOther = (r.fallback && r.market)
                    ? I18n.get('priceCard_foundIn', { host: marketplace(r.market).host.replace(/^www\./, '') })
                    : '';
                const bits = [];
                if (pc.showSource) bits.push(r.source);
                // Przy przeliczeniu cena ze sklepu zostaje do wglądu w wierszu
                // źródła — dla kogoś, kto porównuje kartę ze stroną Amazonu.
                if (pc.showSource && price && this.priceText(price).startsWith('≈')) bits.push(price.text);
                if (fromOther) bits.push(fromOther);
                // Czas ma własny wyłącznik, niezależny od nazwy źródła.
                if (pc.showLatency) bits.push(`${r.ms}ms`);
                if (pc.showSource && r.stale) bits.push(I18n.get('priceCard_cached'));
                this.setLine(this.srcEl, bits.join(' · '));
                return;
            }

            // 2. Ceny nie ma i coś tnie CSP — to właśnie jest przyczyna.
            if (this.csp.img || this.csp.net || (r && r.status === 'csp')) {
                const both = this.csp.img && this.csp.net;
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
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
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                this.rrpEl.textContent = '';
                this.srcEl.textContent = '';
                return;
            }

            // 5. Źródła odpracowały, ceny nie ma.
            this.priceEl.style.display = 'block';
            this.priceEl.textContent = '—';
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
