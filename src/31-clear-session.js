    // ==========================================
    // 6k. USUŃ SESJĘ SKRÓTEM
    // ==========================================
    /**
     * Przedmiot zacięty w połowie (zły krok, zawieszony formularz) zaczyna
     * się od nowa przez „Usuń sesję”: przycisk sesji, „Kontynuuj”, potem
     * T-REX pyta o LPN i o stację roboczą. Ten moduł robi to za człowieka po
     * literach „u”, „s” wpisanych poza polem tekstowym: klika oba przyciski
     * i wpisuje ten sam LPN i tę samą stację, z Enterem.
     *
     * LPN i stację moduł zapamiętuje sam, z Entera w ich polach: LPN
     * w sessionStorage (każda karta ma swój przedmiot), stację w localStorage
     * (jedna na maszynę). Bez zapamiętanego LPN albo stacji kończy na tym
     * kroku i mówi to w powiadomieniu — wpisanie czegokolwiek „na ślepo”
     * dałoby cudzy przedmiot.
     *
     * Litery w polu tekstowym nie są skrótem (skaner i pisanie), litery
     * z Ctrl, Alt albo Meta też nie. Domyślnie wyłączone; słuchacze wychodzą
     * od razu, gdy opcja jest zgaszona. Przerwany przedmiot się nie liczy —
     * licznik widzi po prostu nowy początek tego samego LPN.
     */
    const ClearSession = {
        keys: '',
        keyAt: 0,
        busy: false,
        /** Numer przebiegu: rozbiórka albo nowy przebieg unieważnia czekające kroki. */
        run: 0,

        init() {
            this.onKeyDown = (e) => {
                if (!store.userConfig.clearSession) return;
                const el = e.target;
                if (e.key === 'Enter') { this.remember(el); return; }
                if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) { this.keys = ''; return; }
                if (e.ctrlKey || e.altKey || e.metaKey || typeof e.key !== 'string' || !/^[a-z]$/i.test(e.key)) { this.keys = ''; return; }
                const now = Date.now();
                if (now - this.keyAt > CONFIG.CLEAR_SESSION_KEY_GAP_MS) this.keys = '';
                this.keyAt = now;
                const want = CONFIG.CLEAR_SESSION_KEYS;
                this.keys = (this.keys + e.key.toLowerCase()).slice(-want.length);
                if (this.keys !== want) return;
                this.keys = '';
                this.start();
            };
            document.addEventListener('keydown', this.onKeyDown, true);
        },

        /** Enter w polu LPN albo stacji — zapamiętanie wartości. */
        remember(el) {
            if (!el || el.tagName !== 'INPUT') return;
            const tid = (el.getAttribute('data-testid') || '').toLowerCase();
            const value = String(el.value || '').trim();
            try {
                if (CONFIG.LPN_INPUT_TESTIDS.includes(tid) && CONFIG.LPN_VALUE_REGEX.test(value)) {
                    sessionStorage.setItem(Persistence.getKey(CONFIG.SESSION_STORAGE_LAST_LPN_KEY), value);
                } else if (tid === CONFIG.WORKSTATION_INPUT_TESTID && CONFIG.WORKSTATION_VALUE_REGEX.test(value)) {
                    localStorage.setItem(Persistence.getKey(CONFIG.STORAGE_KEY_WORKSTATION), value);
                }
            } catch { /* magazyn zablokowany — skrót powie, czego brakuje */ }
        },
        /** Zapamiętana wartość, o ile dalej ma właściwy kształt (magazyn mógł ktoś zmienić). */
        recall(storage, key, regex) {
            let value;
            try { value = storage.getItem(Persistence.getKey(key)); } catch { value = null; }
            return typeof value === 'string' && regex.test(value) ? value : null;
        },

        /** Widoczny element po data-testid; null, gdy go nie ma albo jest schowany. */
        find(tag, testId) {
            const el = /** @type {HTMLElement|null} */ (document.querySelector(`${tag}[data-testid="${testId}"]`));
            return el && el.offsetParent !== null ? el : null;
        },
        /** Czekanie na element do `ms`; null po czasie albo po unieważnieniu przebiegu. */
        async waitFor(tag, testId, ms, run) {
            const until = Date.now() + ms;
            for (;;) {
                if (run !== this.run) return null;
                const el = this.find(tag, testId);
                if (el) return el;
                if (Date.now() >= until) return null;
                await new Promise(r => { this.timer = setTimeout(r, CONFIG.CLEAR_SESSION_POLL_MS); });
            }
        },
        /** Pierwsze widoczne pole LPN — każdy dział ma swoje (LPN_INPUT_TESTIDS). */
        async waitForLpnInput(ms, run) {
            const until = Date.now() + ms;
            for (;;) {
                if (run !== this.run) return null;
                for (const tid of CONFIG.LPN_INPUT_TESTIDS) {
                    const el = this.find('input', tid);
                    if (el) return el;
                }
                if (Date.now() >= until) return null;
                await new Promise(r => { this.timer = setTimeout(r, CONFIG.CLEAR_SESSION_POLL_MS); });
            }
        },

        async start() {
            if (this.busy) return;
            const button = /** @type {HTMLButtonElement|null} */ (this.find('button', CONFIG.CLEAR_SESSION_BUTTON_TESTID));
            if (!button || button.disabled) return;
            this.busy = true;
            const run = ++this.run;
            try {
                const lpn = this.recall(sessionStorage, CONFIG.SESSION_STORAGE_LAST_LPN_KEY, CONFIG.LPN_VALUE_REGEX);
                Diag.event('usuń sesję', lpn || '—');
                button.click();
                const cont = /** @type {HTMLButtonElement|null} */ (await this.waitFor('button', CONFIG.CLEAR_SESSION_CONTINUE_TESTID, CONFIG.CLEAR_SESSION_WAIT_CONTINUE_MS, run));
                if (cont && !cont.disabled) cont.click();
                const lpnInput = await this.waitForLpnInput(CONFIG.CLEAR_SESSION_WAIT_LPN_MS, run);
                if (lpnInput) {
                    if (!lpn) { Notifier.show(I18n.get('clearSession_noLpn')); return; }
                    GravisBridge.fill(lpnInput, lpn);
                    GravisBridge.pressEnter(lpnInput);
                }
                const wsInput = await this.waitFor('input', CONFIG.WORKSTATION_INPUT_TESTID, CONFIG.CLEAR_SESSION_WAIT_STATION_MS, run);
                if (!wsInput) return;
                const station = this.recall(localStorage, CONFIG.STORAGE_KEY_WORKSTATION, CONFIG.WORKSTATION_VALUE_REGEX);
                if (!station) { Notifier.show(I18n.get('clearSession_noStation')); return; }
                GravisBridge.fill(wsInput, station);
                GravisBridge.pressEnter(wsInput);
            } finally {
                if (run === this.run) this.busy = false;
            }
        },

        teardown() {
            if (this.onKeyDown) document.removeEventListener('keydown', this.onKeyDown, true);
            this.run++;
            this.busy = false;
            clearTimeout(this.timer);
        },
    };
