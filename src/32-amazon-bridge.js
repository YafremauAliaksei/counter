    // ==========================================
    // 6l. MOST AMAZON.DE — CENA Z KARTY SKLEPU
    // ==========================================
    /**
     * Dwie karty, jeden plik — jak most GRAVIS. Karta T-REX otwiera amazon.de
     * przez window.open i dostaje uchwyt okna; ten sam skrypt kliknięty na
     * karcie amazon.de rozpoznaje stronę (isAmazonPage) i staje się drugą
     * stroną mostu. Rozmowa idzie przez postMessage, w przeglądarce.
     *
     * KARTA T-REX NIE WYSYŁA NICZEGO NA ZEWNĄTRZ. Wysyła ASIN do sąsiedniej
     * karty; zapytanie /dp/<ASIN> robi karta amazon.de pod własnym adresem —
     * zwykłe zapytanie przeglądarki, z jej ciasteczkami, więc ani CORS, ani
     * blokady pośredników go nie dotyczą.
     *
     * Obie strony przyjmują wiadomość wyłącznie od znanego okna (e.source)
     * i znanego adresu (e.origin) i wysyłają ją wyłącznie na znany adres.
     * Karta amazon.de przyjmuje tylko ASIN pasujący do wzorca i pobiera tylko
     * ścieżkę /dp/<ASIN> własnego adresu; odsyła same liczby, które T-REX
     * jeszcze raz sprawdza (skończone, dodatnie, poniżej AMAZON_MAX_PRICE_EUR).
     *
     * Rozbiór strony produktu to algorytm z dawnego skryptu działu PS:
     * cena katalogowa z bloku „basisPrice” (przekreślona), cena do zapłaty
     * z „apex-pricetopay” i dawnych bloków priceblock; w bloku najpierw
     * .a-offscreen, potem symbol + część całkowita + grosze, na końcu tekst
     * (amazon drukuje go czasem dwa razy z rzędu).
     */
    const AmazonBridge = {
        win: null,
        ready: false,
        /** Chwila ostatniego sygnału z karty amazon.de; 0 — jeszcze żadnego. */
        lastSeen: 0,
        /** Zapytania czekające na odpowiedź: id → { resolve, reject }. */
        pending: new Map(),
        nextId: 1,

        isAmazonPage() {
            return window.location.origin === CONFIG.AMAZON_ORIGIN;
        },
        connected() {
            return !!(this.win && !this.win.closed && this.ready
                && Date.now() - this.lastSeen <= CONFIG.AMAZON_STALE_MS);
        },

        // --- strona T-REX ---
        init() {
            this.onMessage = (e) => {
                if (e.origin !== CONFIG.AMAZON_ORIGIN || !e.source) return;
                const d = e.data;
                if (!d || typeof d !== 'object') return;
                // Okno przyjmuje się z sygnału gotowości ze znanego adresu —
                // także po przeładowaniu T-REX, gdy uchwytu z window.open już nie ma.
                if (d.type === 'sh-amazon-ready') {
                    this.win = /** @type {Window} */ (e.source);
                    this.ready = true;
                    this.lastSeen = Date.now();
                    return;
                }
                if (e.source !== this.win || d.type !== 'sh-amazon-price') return;
                this.lastSeen = Date.now();
                const wait = this.pending.get(d.id);
                if (!wait) return;
                this.pending.delete(d.id);
                wait.resolve({ current: this.price(d.current), rrp: this.price(d.rrp), error: typeof d.error === 'string' ? d.error.slice(0, 120) : null });
            };
            window.addEventListener('message', this.onMessage);
        },
        /** Liczba od karty Amazon albo null: tylko skończona, dodatnia i rozsądna. */
        price(v) {
            const n = typeof v === 'number' ? v : NaN;
            return Number.isFinite(n) && n > 0 && n < CONFIG.AMAZON_MAX_PRICE_EUR ? Math.round(n * 100) / 100 : null;
        },
        /** Jedyne miejsce, z którego T-REX otwiera amazon.de — kliknięcie w panelu. */
        open() {
            const win = window.open(CONFIG.AMAZON_URL, CONFIG.AMAZON_WINDOW_NAME);
            // Blokada wyskakujących okien zwraca null: działające połączenie zostaje.
            if (!win) return;
            this.ready = false;
            this.win = win;
        },
        /**
         * Cena dla ASIN z karty amazon.de: { current, rrp, error } w euro albo
         * wyjątek, gdy karta nie jest połączona albo zapytanie przerwano
         * (`signal` — limit czasu karty ceny).
         */
        request(asin, signal) {
            if (!this.connected()) return Promise.reject(new Error('karta amazon.de niepodłączona'));
            const id = this.nextId++;
            return new Promise((resolve, reject) => {
                this.pending.set(id, { resolve, reject });
                if (signal) {
                    signal.addEventListener('abort', () => {
                        if (this.pending.delete(id)) reject(new Error('przekroczony czas'));
                    });
                }
                this.win.postMessage({ type: 'sh-amazon-asin', id, asin: String(asin) }, CONFIG.AMAZON_ORIGIN);
            });
        },
        teardown() {
            if (this.onMessage) window.removeEventListener('message', this.onMessage);
            for (const wait of this.pending.values()) wait.reject(new Error('skrypt zdjęty'));
            this.pending.clear();
        },

        // --- strona amazon.de ---
        /**
         * Na amazon.de skrypt nie liczy i nie ma ustawień: odpowiada na ASIN
         * i co AMAZON_HEARTBEAT_MS daje znać, że żyje. Znaczek w lewym górnym
         * rogu jest przezroczysty dla kliknięć.
         */
        initRemote() {
            const flag = CONFIG.SCRIPT_ID_PREFIX + 'AMAZON';
            if (window[flag]) return;
            if (!window.opener) { this.badge(I18n.get('amazon_badgeNoOpener'), '#C62828'); return; }
            window[flag] = true;
            this.onRemoteMessage = async (e) => {
                if (e.source !== window.opener || e.origin !== CONFIG.TREX_ORIGIN) return;
                const d = e.data;
                if (!d || d.type !== 'sh-amazon-asin' || !CONFIG.ASIN_VALUE_REGEX.test(String(d.asin))) return;
                const out = await this.lookup(d.asin);
                if (!window.opener) return;
                window.opener.postMessage({ type: 'sh-amazon-price', id: d.id, asin: d.asin, ...out }, CONFIG.TREX_ORIGIN);
            };
            window.addEventListener('message', this.onRemoteMessage);
            const beat = () => {
                if (window.opener) window.opener.postMessage({ type: 'sh-amazon-ready' }, CONFIG.TREX_ORIGIN);
            };
            beat();
            this.heartbeatTimer = setInterval(beat, CONFIG.AMAZON_HEARTBEAT_MS);
            this.badge(I18n.get('amazon_badgeOk'), '#2E7D32');
        },
        badge(text, color) {
            const old = document.getElementById(CONFIG.SCRIPT_ID_PREFIX + 'amazonBadge');
            if (old) old.remove();
            document.body.appendChild(h('div', {
                id: 'amazonBadge', textContent: text,
                style: { position: 'fixed', left: '6px', top: '6px', zIndex: '2147483646',
                         pointerEvents: 'none', opacity: '0.55', background: color, color: '#fff',
                         padding: '2px 8px', borderRadius: '10px', font: '11px sans-serif' },
            }));
        },
        /** Pobranie strony produktu z własnego adresu i rozbiór ceny. */
        async lookup(asin) {
            try {
                const r = await fetch('/dp/' + encodeURIComponent(asin), { credentials: 'include' });
                if (!r.ok) return { current: null, rrp: null, error: 'HTTP ' + r.status };
                const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
                return this.parsePage(doc);
            } catch (e) {
                return { current: null, rrp: null, error: String(e && e.message) };
            }
        },
        /** Selektory bloków ceny — w kolejności pytania. */
        RRP_SELECTORS: [
            '#corePriceDisplay_desktop_feature_div .basisPrice .a-price[data-a-strike="true"]',
            '#corePriceDisplay_desktop_feature_div .apex-basisprice-value',
            '#corePrice_desktop .apex-basisprice-value',
            '.basisPrice .a-price[data-a-strike="true"]',
            '#priceblock_ourprice_lbl + td .a-text-strike',
        ],
        PRICE_SELECTORS: [
            '#corePriceDisplay_desktop_feature_div .apex-pricetopay-value',
            '#corePrice_desktop .apex-pricetopay-value',
            '#price_inside_buybox',
            '#corePrice_feature_div .a-price',
            '.apex-pricetopay-value',
            'span.priceToPay',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
        ],
        /** { current, rrp } z dokumentu strony produktu; brak bloku — null. */
        parsePage(doc) {
            const area = doc.querySelector('#dp-container') || doc.querySelector('#dp') || doc.body;
            if (!area) return { current: null, rrp: null, error: 'pusta strona' };
            const rrp = this.amount(this.blockText(area, this.RRP_SELECTORS));
            const current = this.amount(this.blockText(area, this.PRICE_SELECTORS));
            return { current, rrp, error: current || rrp ? null : 'na stronie nie ma ceny' };
        },
        /** Tekst pierwszego bloku ceny, który coś zawiera. */
        blockText(area, selectors) {
            for (const s of selectors) {
                for (const el of area.querySelectorAll(s)) {
                    const off = el.querySelector('.a-offscreen');
                    if (off && off.textContent.trim().length > 1) return off.textContent.trim();
                    const whole = el.querySelector('.a-price-whole');
                    const fraction = el.querySelector('.a-price-fraction');
                    if (whole && fraction) return whole.textContent.replace(/[^0-9]/g, '') + '.' + fraction.textContent.trim();
                    const txt = el.textContent.replace(/\s+/g, '').trim();
                    if (txt) {
                        // Amazon drukuje cenę czasem dwa razy z rzędu („12,99€12,99€”).
                        const half = txt.length / 2;
                        return txt.length % 2 === 0 && txt.slice(0, half) === txt.slice(half) ? txt.slice(0, half) : txt;
                    }
                }
            }
            return null;
        },
        /**
         * Kwota z tekstu ceny („1.299,00 €”, „1,299.00”, „12,99”, „1.299”):
         * ostatni z dwóch separatorów to grosze; pojedynczy separator z trzema
         * cyframi po nim to tysiące.
         */
        amount(text) {
            if (!text) return null;
            let v = String(text).replace(/[^\d.,]/g, '');
            if (!v) return null;
            if (v.includes('.') && v.includes(',')) {
                v = v.lastIndexOf('.') > v.lastIndexOf(',') ? v.replace(/,/g, '') : v.replace(/\./g, '').replace(',', '.');
            } else if (v.includes(',')) {
                const parts = v.split(',');
                v = parts[parts.length - 1].length === 3 ? v.replace(/,/g, '') : v.replace(/,/g, '.');
            } else if (v.includes('.')) {
                const parts = v.split('.');
                if (parts[parts.length - 1].length === 3) v = v.replace(/\./g, '');
            }
            const n = parseFloat(v);
            return Number.isFinite(n) && n > 0 ? n : null;
        },
    };
