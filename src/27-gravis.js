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
     * ASIN pokazuje się pod polem skanu przedmiotu jako link; kliknięcie
     * wstawia go do pola, a Enter naciska człowiek. Tekst linku jest
     * rozerwany znakiem U+200B: skan strony nie może zobaczyć w nim ASIN
     * (zmiana ASIN to dla Routing granica przedmiotu).
     */
    const GravisBridge = {
        win: null,
        ready: false,
        lastLpn: null,
        pendingLpn: null,
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
                if (CONFIG.LPN_VALUE_REGEX.test(lpn)) this.send(lpn);
            };
            this.onMessage = (e) => {
                if (!this.win || e.source !== this.win || e.origin !== this.origin()) return;
                const d = e.data;
                if (!d || typeof d !== 'object') return;
                if (d.type === 'sh-gravis-ready') {
                    this.ready = true;
                    if (this.pendingLpn) this.send(this.pendingLpn);
                } else if (d.type === 'sh-gravis-asin' && d.lpn === this.lastLpn) {
                    this.asin = typeof d.asin === 'string' && CONFIG.ASIN_VALUE_REGEX.test(d.asin) ? d.asin : null;
                    this.place();
                }
            };
            document.addEventListener('keydown', this.onKeyDown, true);
            window.addEventListener('message', this.onMessage);
            bus.on('page:scanned', () => this.place());
        },
        /** Jedyne miejsce, z którego T-REX otwiera GRAVIS — kliknięcie w panelu. */
        open() {
            if (!this.enabled()) return;
            this.ready = false;
            this.win = window.open(CONFIG.GRAVIS_URL, CONFIG.GRAVIS_WINDOW_NAME);
        },
        /** Wyłączenie mostu. Karty GRAVIS nie zamykamy — mogła być potrzebna sama w sobie. */
        close() {
            this.ready = false;
            this.win = null;
            this.lastLpn = this.pendingLpn = this.asin = null;
            this.removeChip();
        },
        send(lpn) {
            this.lastLpn = lpn;
            this.asin = null;
            this.removeChip();
            if (!this.win || this.win.closed) return;
            if (!this.ready) { this.pendingLpn = lpn; return; }
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
        place() {
            if (!this.asin || !this.enabled()) { this.removeChip(); return; }
            const input = this.findScanInput();
            if (!input) { this.removeChip(); return; }
            const r = input.getBoundingClientRect();
            if (!this.chip) {
                const asin = this.asin;
                this.chip = h('div', {
                    id: 'gravisAsin',
                    textContent: asin.split('').join('​'),
                    title: 'GRAVIS',
                    onMousedown: (e) => e.preventDefault(),
                    onClick: () => {
                        const target = this.findScanInput();
                        if (target) { this.fill(target, asin); target.focus(); }
                    },
                    style: {
                        position: 'fixed', zIndex: '2147483645', cursor: 'pointer',
                        color: '#1a73e8', borderBottom: '1px dashed #1a73e8',
                        font: '13px monospace', background: 'transparent',
                    },
                });
                document.body.appendChild(this.chip);
            }
            this.chip.style.left = `${Math.round(r.left)}px`;
            this.chip.style.top = `${Math.round(r.top + r.height + 2)}px`;
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
        initRemote() {
            const flag = CONFIG.SCRIPT_ID_PREFIX + 'GRAVIS';
            if (window[flag]) { this.toast(I18n.get('gravis_alreadyRunning')); return; }
            if (!window.opener) { this.toast(I18n.get('gravis_remoteNoOpener')); return; }
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
            window.opener.postMessage({ type: 'sh-gravis-ready' }, CONFIG.TREX_ORIGIN);
            this.toast(I18n.get('gravis_remoteReady'));
        },
        toast(text) {
            const el = h('div', {
                id: 'gravisToast', textContent: text,
                style: { position: 'fixed', right: '24px', bottom: '24px', zIndex: '2147483646',
                         background: '#323232', color: '#fff', padding: '12px 16px', borderRadius: '4px',
                         font: '13px sans-serif' },
            });
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 4000);
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
