    // ==========================================
    // 6k. DIAGNOSTYKA NA STANOWISKU
    // ==========================================
    /**
     * Okno diagnostyki dla stanowisk bez narzędzi deweloperskich (F12
     * wyłączone przez administratora). Pokazuje to, czego na takim komputerze
     * inaczej nie da się zobaczyć: ostatnie zdarzenia cyklu przedmiotu, stan
     * bieżącego przedmiotu i pola formularzy widoczne na stronie (podpis,
     * data-testid) — po tym widać, czy skrypt w ogóle znajduje pole pojemnika
     * albo naklejkę. Przycisk kopiuje całość jako JSON do schowka.
     *
     * Dziennik zdarzeń jest pierścieniem o stałej długości (DIAG_MAX_EVENTS) —
     * pamięć nie rośnie w ciągu zmiany. Do sieci nic nie idzie, do konsoli też.
     *
     * Tekst okna jest częścią strony (document.body.innerText), więc każdy
     * napis przechodzi przez defuse(): słowa wyzwalaczy dostają U+200B
     * i okno nie może samo podnieść flagi przedmiotu.
     */
    const Diag = {
        events: [],
        el: null,
        timer: null,

        event(what, detail) {
            this.events.push({ t: Date.now(), what, detail: detail === undefined ? '' : String(detail) });
            if (this.events.length > CONFIG.DIAG_MAX_EVENTS) this.events.shift();
        },

        /** Rozrywa w tekście wszystko, co skrypt rozpoznaje na stronie. */
        defuse(text) {
            let out = String(text);
            for (const re of [CONFIG.PRE_TRIGGER_REGEX, CONFIG.AUTO_TRIGGER_REGEX, CONFIG.RESALE_PHRASE_REGEX]) {
                out = out.replace(new RegExp(re.source, 'gi'), m => m.slice(0, 2) + '​' + m.slice(2));
            }
            return out;
        },

        /** Pola formularzy na stronie (bez własnych) — najwyżej DIAG_MAX_INPUTS. */
        inputs() {
            return Array.from(document.querySelectorAll('input'))
                .filter(i => !AutoTrigger.isOwnNode(i))
                .slice(0, CONFIG.DIAG_MAX_INPUTS)
                .map(i => ({
                    'podpis': i.getAttribute('aria-label') || '',
                    'data-testid': i.getAttribute('data-testid') || '',
                    'widoczne': i.offsetParent !== null,
                    'pole pojemnika': ToteWatch.isToteInput(i),
                }));
        },

        snapshot() {
            const sticker = document.getElementById(CONFIG.STICKER_ELEMENT_ID);
            const text = document.body.innerText || '';
            return {
                'wersja': CONFIG.SCRIPT_VERSION,
                'karta': store.currentTabType,
                'przedmiot': AutoTrigger.item ? { ...AutoTrigger.item } : null,
                'na stronie: początek': CONFIG.PRE_TRIGGER_REGEX.test(text),
                'na stronie: koniec': CONFIG.AUTO_TRIGGER_REGEX.test(text),
                'na stronie: fraza odsprzedaży': CONFIG.RESALE_PHRASE_REGEX.test(text),
                'naklejka': sticker ? { 'widoczna': sticker.offsetParent !== null, 'znacznik': sticker.tagName } : null,
                'pojemnik czeka': ToteWatch.pending ? ToteWatch.pending.value : null,
                'pola': this.inputs(),
                'zdarzenia': this.events.map(e => `${Utils.formatTime(new Date(e.t), true, ':')} ${e.what}${e.detail ? ' ' + e.detail : ''}`),
            };
        },

        toggle() {
            if (this.el) { this.close(); return; }
            const pre = h('pre', { style: { margin: '0', whiteSpace: 'pre-wrap', maxHeight: '60vh', overflowY: 'auto' } });
            this.el = h('div', {
                id: 'diagPanel',
                style: { position: 'fixed', left: '10px', top: '10px', width: '440px', zIndex: '2147483646',
                         background: 'rgba(20,20,20,0.92)', color: '#e0e0e0', font: '11px monospace',
                         padding: '8px', borderRadius: '6px' },
            },
            h('div', { style: { display: 'flex', gap: '6px', marginBottom: '6px' } },
                UIBuilder.button(I18n.get('diag_copy'), () => {
                    const json = JSON.stringify(this.snapshot(), null, 2);
                    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).catch(() => {});
                }, { marginTop: '0' }),
                UIBuilder.button(I18n.get('diag_close'), () => this.close(), { marginTop: '0' })),
            pre);
            document.body.appendChild(this.el);
            const paint = () => { pre.textContent = this.defuse(JSON.stringify(this.snapshot(), null, 1)); };
            paint();
            this.timer = setInterval(paint, CONFIG.DIAG_REFRESH_MS);
        },

        close() {
            clearInterval(this.timer);
            this.timer = null;
            if (this.el) this.el.remove();
            this.el = null;
        },
    };
