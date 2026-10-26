    // ==========================================
    // 6i. MOST GRAVIS — ASIN PO LPN
    // ==========================================
    /**
     * Dwie karty, jeden plik. Karta T-REX otwiera GRAVIS przez window.open
     * i dostaje uchwyt okna; ten sam skrypt kliknięty na karcie GRAVIS
     * rozpoznaje stronę (isGravisPage) i staje się drugą stroną mostu:
     * odpowiada przez window.opener. Rozmowa idzie przez postMessage —
     * przeglądarka przekazuje wiadomość między oknami bez sieci, a CORS
     * dotyczy tylko zapytań HTTP.
     *
     * Obie strony przyjmują wiadomość wyłącznie od znanego okna (e.source)
     * i znanego adresu (e.origin) i wysyłają ją wyłącznie na znany adres —
     * inna karta nie podsunie fałszywego ASIN ani nie podsłucha LPN.
     *
     * ASIN pokazuje się pod polem skanu przedmiotu, wyśrodkowany pod nim,
     * jako link; kliknięcie wstawia go do pola, a Enter naciska człowiek.
     * Tekst linku jest rozerwany znakiem U+200B: skan strony nie może zobaczyć
     * w nim ASIN (zmiana ASIN to dla Routing granica przedmiotu). Brak ASIN
     * albo brak odpowiedzi nie pokazuje niczego.
     *
     * Skrypt w GRAVIS co GRAVIS_HEARTBEAT_MS daje znać, że żyje. Dzięki temu
     * T-REX po własnym przeładowaniu odnajduje okno GRAVIS (przyjmuje je
     * z pierwszego sygnału ze znanego adresu), a gdy sygnały ustaną — karta
     * GRAVIS przeładowała się i skrypt zniknął — w miejscu ASIN pojawia się
     * cicha podpowiedź, żeby kliknąć tam zakładkę jeszcze raz. Dopóki GRAVIS
     * nie odezwał się ani razu, wygląd T-REX się nie zmienia.
     */
    const GravisBridge = {
        win: null,
        ready: false,
        /** Chwila ostatniego sygnału z GRAVIS; 0 — jeszcze żadnego. */
        lastSeen: 0,
        lastLpn: null,
        pendingLpn: null,
        /** LPN zeskanowany, a jeszcze niewysłany — czeka na pole ASIN. */
        candidateLpn: null,
        asin: null,
        chip: null,
        lookupToken: 0,

        origin() {
            const m = String(CONFIG.GRAVIS_URL).match(/^https?:\/\/[^/]+/);
            return m ? m[0] : '';
        },
        isGravisPage() {
            const loc = window.location;
            return loc.origin === this.origin() && String(loc.pathname || '').toLowerCase().startsWith('/gravis');
        },
        enabled() {
            return !!store.userConfig.gravisAsin && CONFIG.GRAVIS_TAB_TYPES.includes(store.currentTabType);
        },
        connected() {
            return !!(this.win && !this.win.closed && this.ready);
        },

        // --- strona T-REX ---
        init() {
            this.onKeyDown = (e) => {
                if (e.key !== 'Enter' || !this.enabled()) return;
                const el = e.target;
                if (!el || el.tagName !== 'INPUT') return;
                const tid = (el.getAttribute('data-testid') || '').toLowerCase();
                if (!CONFIG.LPN_INPUT_TESTIDS.includes(tid)) return;
                const lpn = String(el.value || '').trim();
                if (!CONFIG.LPN_VALUE_REGEX.test(lpn)) return;
                // LPN idzie do GRAVIS dopiero, gdy T-REX poprosi o ASIN (pole
                // skanu przedmiotu na ekranie). Większość przedmiotów ma ASIN
                // przypięty do LPN i tego pola nie pokazuje — wysyłanie każdego
                // LPN to setki zbędnych wyszukiwań w GRAVIS na zmianę.
                this.candidateLpn = lpn;
                this.asin = null;
                this.removeChip();
                this.sendIfAsked();
            };
            this.onMessage = (e) => {
                if (!this.enabled() || e.origin !== this.origin() || !e.source) return;
                const d = e.data;
                if (!d || typeof d !== 'object') return;
                // Okno przyjmuje się z sygnału gotowości ze znanego adresu —
                // także po przeładowaniu T-REX, gdy uchwytu z window.open już nie ma.
                if (d.type === 'sh-gravis-ready') {
                    this.win = /** @type {Window} */ (e.source);
                    const wasStale = !this.ready || this.stale();
                    this.ready = true;
                    this.lastSeen = Date.now();
                    if (this.pendingLpn) this.send(this.pendingLpn);
                    if (wasStale) this.place();
                    return;
                }
                if (e.source !== this.win) return;
                this.lastSeen = Date.now();
                if (d.type === 'sh-gravis-asin' && d.lpn === this.lastLpn) {
                    this.asin = typeof d.asin === 'string' && CONFIG.ASIN_VALUE_REGEX.test(d.asin) ? d.asin : null;
                    this.place();
                }
            };
            document.addEventListener('keydown', this.onKeyDown, true);
            window.addEventListener('message', this.onMessage);
            bus.on('page:scanned', () => { this.sendIfAsked(); this.place(); });
        },
        /**
         * Wysłanie czekającego LPN, gdy na ekranie jest pole ASIN. Woła się
         * z każdego skanu strony, ale pyta o pole tylko wtedy, gdy jakiś LPN
         * czeka — po wysłaniu nic już nie kosztuje.
         */
        sendIfAsked() {
            if (!this.candidateLpn || !this.enabled()) return;
            const input = this.findScanInput();
            if (!input || input.offsetParent === null) return;
            const lpn = this.candidateLpn;
            this.candidateLpn = null;
            this.send(lpn);
        },
        /** Jedyne miejsce, z którego T-REX otwiera GRAVIS — kliknięcie w panelu. */
        open() {
            if (!this.enabled()) return;
            const win = window.open(CONFIG.GRAVIS_URL, CONFIG.GRAVIS_WINDOW_NAME);
            // Blokada wyskakujących okien zwraca null: działające połączenie
            // zostaje, zamiast urwać się do następnego sygnału gotowości.
            if (!win) return;
            this.ready = false;
            this.win = win;
        },
        /** Wyłączenie mostu. Karty GRAVIS nie zamykamy — mogła być potrzebna sama w sobie. */
        close() {
            this.ready = false;
            this.lastSeen = 0;
            this.win = null;
            this.lastLpn = this.pendingLpn = this.candidateLpn = this.asin = null;
            this.removeChip();
        },
        send(lpn) {
            this.lastLpn = lpn;
            this.asin = null;
            this.removeChip();
            // Bez okna (T-REX po przeładowaniu, zanim GRAVIS da znak) LPN
            // czeka na sygnał gotowości, a nie przepada.
            if (!this.ready || !this.win || this.win.closed) { this.pendingLpn = lpn; return; }
            this.pendingLpn = null;
            this.win.postMessage({ type: 'sh-gravis-lpn', lpn }, this.origin());
        },
        findScanInput() {
            return /** @type {HTMLInputElement|null} */ (document.querySelector(`input[data-testid="${CONFIG.ITEM_SCAN_INPUT_TESTID}"]`));
        },
        removeChip() {
            if (this.chip) this.chip.remove();
            this.chip = null;
        },
        /**
         * Link z ASIN pod polem skanu. Woła się z każdego skanu strony, ale
         * zapytanie o pole idzie tylko wtedy, gdy jest ASIN do pokazania.
         */
        /** GRAVIS odzywał się wcześniej, a teraz milczy dłużej niż GRAVIS_STALE_MS. */
        stale() {
            return this.lastSeen > 0 && Date.now() - this.lastSeen > CONFIG.GRAVIS_STALE_MS;
        },
        /**
         * Pod polem skanu: link z ASIN, a gdy GRAVIS zamilkł — podpowiedź.
         * Woła się z każdego skanu strony, ale zapytanie o pole idzie tylko
         * wtedy, gdy jest co pokazać.
         */
        place() {
            const mode = !this.enabled() ? null : this.stale() ? 'hint' : this.asin ? 'asin:' + this.asin : null;
            if (!mode) { this.removeChip(); return; }
            const input = this.findScanInput();
            if (!input) { this.removeChip(); return; }
            if (this.chip && this.chip.dataset.mode !== mode) this.removeChip();
            if (!this.chip) {
                this.chip = mode === 'hint' ? h('div', {
                    id: 'gravisAsin',
                    textContent: I18n.get('gravis_restartHint'),
                    style: { position: 'fixed', zIndex: '2147483645', pointerEvents: 'none',
                             color: '#9E9E9E', font: '12px sans-serif', transform: 'translateX(-50%)' },
                }) : this.asinChip(this.asin);
                this.chip.dataset.mode = mode;
                document.body.appendChild(this.chip);
            }
            // Pola T-REX stoją na środku ekranu i są wąskie — link stoi
            // wyśrodkowany pod polem, a nie przy jego lewej krawędzi.
            const r = input.getBoundingClientRect();
            this.chip.style.left = `${Math.round(r.left + r.width / 2)}px`;
            this.chip.style.top = `${Math.round(r.top + r.height + 4)}px`;
        },
        asinChip(asin) {
            return h('div', {
                id: 'gravisAsin',
                textContent: asin.split('').join('\u200B'),
                title: 'GRAVIS',
                onMousedown: (e) => e.preventDefault(),
                onClick: () => {
                    const target = this.findScanInput();
                    if (target) { this.fill(target, asin); target.focus(); }
                },
                style: {
                    position: 'fixed', zIndex: '2147483645', cursor: 'pointer',
                    color: '#1a73e8', borderBottom: '1px dashed #1a73e8',
                    font: '13px monospace', background: 'transparent', transform: 'translateX(-50%)',
                },
            });
        },

        /**
         * Wpisanie wartości tak, żeby zauważył ją framework strony: setter
         * z prototypu (Angular i React pilnują własnej kopii wartości) i dwa
         * zdarzenia.
         */
        fill(input, value) {
            const proto = typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : null;
            const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
            if (desc && desc.set) desc.set.call(input, value);
            else input.value = value;
            ['input', 'change'].forEach(t => {
                try { input.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) { /* atrapa bez Event */ }
            });
        },
        pressEnter(input) {
            ['keydown', 'keyup'].forEach(t => {
                try {
                    input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                } catch (e) { /* atrapa bez KeyboardEvent */ }
            });
        },

        // --- strona GRAVIS ---
        /**
         * W GRAVIS skrypt nie liczy i nie ma ustawień: odpowiada tylko na LPN
         * i co GRAVIS_HEARTBEAT_MS daje znać, że żyje. W lewym górnym rogu
         * stoi półprzezroczysty znaczek, przezroczysty dla kliknięć.
         */
        initRemote() {
            const flag = CONFIG.SCRIPT_ID_PREFIX + 'GRAVIS';
            if (window[flag]) return;
            if (!window.opener) { this.badge(I18n.get('gravis_badgeNoOpener'), '#C62828'); return; }
            window[flag] = true;
            this.onRemoteMessage = async (e) => {
                if (e.source !== window.opener || e.origin !== CONFIG.TREX_ORIGIN) return;
                const d = e.data;
                if (!d || d.type !== 'sh-gravis-lpn' || !CONFIG.LPN_VALUE_REGEX.test(String(d.lpn))) return;
                const asin = await this.lookup(d.lpn);
                if (asin === undefined || !window.opener) return;
                window.opener.postMessage({ type: 'sh-gravis-asin', lpn: d.lpn, asin }, CONFIG.TREX_ORIGIN);
            };
            window.addEventListener('message', this.onRemoteMessage);
            const beat = () => {
                if (window.opener) window.opener.postMessage({ type: 'sh-gravis-ready' }, CONFIG.TREX_ORIGIN);
            };
            beat();
            this.heartbeatTimer = setInterval(beat, CONFIG.GRAVIS_HEARTBEAT_MS);
            this.badge(I18n.get('gravis_badgeOk'), '#2E7D32');
        },
        badge(text, color) {
            // Ponowne wklejenie skryptu w karcie bez opener zostawiłoby drugi znaczek.
            const old = document.getElementById(CONFIG.SCRIPT_ID_PREFIX + 'gravisBadge');
            if (old) old.remove();
            document.body.appendChild(h('div', {
                id: 'gravisBadge', textContent: text,
                style: { position: 'fixed', left: '6px', top: '6px', zIndex: '2147483646',
                         pointerEvents: 'none', opacity: '0.55', background: color, color: '#fff',
                         padding: '2px 8px', borderRadius: '10px', font: '11px sans-serif' },
            }));
        },
        asinOf(a) {
            const text = String(a.textContent || '').trim().toUpperCase();
            if (/^[B0-9][A-Z0-9]{9}$/.test(text)) return text;
            const m = String(a.href || '').match(/\/(?:dp|product)\/([B0-9][A-Z0-9]{9})/i);
            return m ? m[1].toUpperCase() : null;
        },
        /**
         * Wyszukanie LPN w GRAVIS i odczyt ASIN z wyniku. Linki z ASIN, które
         * już stały na stronie, dostają znacznik i są pomijane — inaczej
         * wynik poprzedniego przedmiotu przyszedłby jako odpowiedź na bieżący.
         * Zwraca ASIN, null (nie znaleziono) albo undefined (wyszukiwanie
         * przerwane nowszym LPN — odpowiedź nie jest już potrzebna).
         */
        async lookup(lpn) {
            const token = ++this.lookupToken;
            const wait = (ms) => new Promise(r => setTimeout(r, ms));
            const region = /** @type {HTMLElement|null} */ (document.querySelector('.mat-select-value'));
            if (region && String(region.textContent || '').trim().toUpperCase() !== 'EU') {
                region.click();
                await wait(100);
                const eu = Array.from(document.querySelectorAll('mat-option')).map(o => /** @type {HTMLElement} */ (o))
                    .find(o => String(o.textContent || '').trim().toUpperCase() === 'EU');
                if (eu) eu.click();
            }
            document.querySelectorAll('a').forEach(a => { if (this.asinOf(a)) a.dataset.shStale = '1'; });
            const input = document.querySelector('input.mat-input-element');
            if (!input) return null;
            this.fill(input, lpn);
            this.pressEnter(input);
            const until = Date.now() + CONFIG.GRAVIS_ASIN_TIMEOUT_MS;
            while (Date.now() < until) {
                await wait(CONFIG.GRAVIS_POLL_MS);
                if (token !== this.lookupToken) return undefined;
                for (const a of document.querySelectorAll('a')) {
                    if (a.dataset.shStale) continue;
                    const asin = this.asinOf(a);
                    if (asin) return asin;
                }
            }
            return null;
        },
    };
