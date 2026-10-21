    // ==========================================
    // 6h. POJEMNIK PRZYBITY
    // ==========================================
    /**
     * Przybicie pojemnika to dwa zdarzenia w tej kolejności:
     *   1. Enter w polu pojemnika z wartością wyglądającą jak pojemnik;
     *   2. zniknięcie tego pola ze strony.
     *
     * Bez limitu czasu: człowiek potrafi zostawić otwarty krok i odejść na
     * kilka minut — liczy się dopiero zniknięcie pola. Błędny pojemnik zostawia
     * pole na miejscu, więc nic się nie zalicza; następny Enter podmienia
     * oczekujący wpis.
     *
     * Sprawdzenie (check) nie ma własnego obserwatora: woła je skan AutoTrigger,
     * który i tak chodzi po każdej paczce mutacji — zniknięcie pola jest
     * mutacją. Koszt to jedno przejście w górę drzewa od zapamiętanego pola.
     */
    const ToteWatch = {
        /** @type {{input: any, value: string}|null} */
        pending: null,
        /** Przybite pojemniki w tej karcie — do porównania z licznikiem (SH.tote()). */
        confirmed: 0,

        init() {
            this.onKeyDown = (e) => {
                if (e.key !== 'Enter') return;
                const el = e.target;
                if (!el || el.tagName !== 'INPUT' || !this.isToteInput(el)) return;
                const value = String(el.value || '').trim();
                if (!CONFIG.TOTE_VALUE_REGEX.test(value)) return;
                this.pending = { input: el, value };
            };
            document.addEventListener('keydown', this.onKeyDown, true);
        },

        isToteInput(el) {
            if ((el.getAttribute('data-testid') || '').toLowerCase() === CONFIG.TOTE_INPUT_TESTID) return true;
            const label = (el.getAttribute('aria-label') || '').toLowerCase();
            return label !== '' && CONFIG.TOTE_INPUT_LABELS.some(l => label.includes(l));
        },

        /** Czy węzeł wisi jeszcze w dokumencie — bez `isConnected`, którego atrapa nie zna. */
        attached(el) {
            for (let n = el; n; n = n.parentElement) if (n === document.body) return true;
            return false;
        },

        /**
         * Zniknięcie pola po Enterze — zdjętego ze strony albo schowanego
         * (zerowe wymiary). Zwraca nazwę właśnie przybitego pojemnika albo null.
         */
        check() {
            const p = this.pending;
            if (!p) return null;
            if (this.attached(p.input) && (p.input.offsetWidth || p.input.offsetHeight)) return null;
            this.pending = null;
            this.confirmed++;
            store.sessionConfig.lastToteAt = Date.now();
            Diag.event('pojemnik', p.value);
            return p.value;
        },

        /**
         * Cel działu (sztuk na godzinę) z RATE_TARGETS w nagłówku pliku.
         * CRET i FAST dzielą kartę, więc o celu karty CRET decyduje panel.
         * 0 — działu bez celu; spreparowany wpis (tekst, ujemny, NaN) też daje 0.
         */
        targetFor(tabType) {
            const key = tabType === 'CRET' && store.userConfig.cretProfile === 'FAST' ? 'FAST' : tabType;
            const v = Number(CONFIG.RATE_TARGETS && CONFIG.RATE_TARGETS[key]);
            return Number.isFinite(v) && v > 0 ? v : 0;
        },

        /**
         * Bezczynność od ostatniego pojemnika, bez wybranego obiadu. Czas przedmiotu to 60 / cel
         * minut; bezczynność zaczyna narastać po dwóch takich czasach.
         * null — w tej zmianie nie przybito jeszcze pojemnika (albo zapis
         * jest spreparowany: tekst, przyszłość).
         * @param {number} now
         */
        offTask(now) {
            const at = Number(store.sessionConfig.lastToteAt);
            if (!Number.isFinite(at) || at <= 0 || at > now) return null;
            const target = this.targetFor(store.currentTabType);
            // Obiad nie jest bezczynnością: jego część w tym odcinku odpada.
            const elapsedMs = Math.max(0, now - at - ShiftManager.lunchOverlapMs(at, now));
            const limitMs = target ? 2 * 3600000 / target : 0;
            const overMs = limitMs && elapsedMs > limitMs ? elapsedMs - limitMs : 0;
            return { elapsedMs, limitMs, overMs };
        },

        /** Porównanie obu sposobów liczenia — do sprawdzania na stanowisku. */
        info() {
            return {
                'pojemniki przybite': this.confirmed,
                'przedmioty z wyzwalacza tekstu': AutoTrigger.textCompleted,
                'oczekuje na zniknięcie pola': this.pending ? this.pending.value : null,
            };
        },
    };
