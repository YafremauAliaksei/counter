    // ==========================================
    // 6j. AUTO-LPN
    // ==========================================
    /**
     * Na kroku pojemnika człowiek skanuje czasem etykietę LPN zamiast
     * pojemnika — wtedy trzeba wcisnąć „Przypisz ponownie LPN”. Auto-LPN robi
     * to za niego. Pierwszy znak t/w/c to pojemnik — nic się nie dzieje.
     *
     * LPN czeka się do końca: wciśnięcie w połowie skanu przenosi fokus na
     * nowe pole, a reszta cyfr i Enter skanera trafiają tam i dają błąd —
     * trzeba skanować drugi raz. Przycisk idzie więc dopiero, gdy wpis jest
     * całym LPN (CONFIG.LPN_VALUE_REGEX), a Enter, który skaner dokłada na
     * końcu, jest połykany. Wpis, który nie jest ani pojemnikiem, ani
     * początkiem LPN, to inna etykieta — przycisk od razu.
     *
     * Przerwa po wciśnięciu chroni przed powtórzeniem przy kolejnych znakach
     * tego samego skanu. Domyślnie wyłączone; słuchacz wychodzi od razu, gdy
     * opcja jest zgaszona.
     */
    const AutoLpn = {
        cooldownUntil: 0,
        swallowEnterUntil: 0,
        init() {
            this.onInput = (e) => {
                if (!store.userConfig.autoLpn) return;
                const el = e.target;
                if (!el || el.tagName !== 'INPUT' || !ToteWatch.isToteInput(el)) return;
                const value = String(el.value || '').trim();
                if (!value) return;
                const now = Date.now();
                if (now < this.cooldownUntil) return;
                if (CONFIG.AUTO_LPN_TOTE_PREFIXES.includes(value[0].toLowerCase())) {
                    this.cooldownUntil = now + CONFIG.AUTO_LPN_COOLDOWN_MS;
                    return;
                }
                // LPN jeszcze się wpisuje — czekamy na resztę znaków.
                if (CONFIG.LPN_PARTIAL_REGEX.test(value)) return;
                const btn = /** @type {HTMLButtonElement|null} */ (document.querySelector(`button[data-testid="${CONFIG.REASSIGN_LPN_BUTTON_TESTID}"]`));
                if (!btn || btn.disabled || btn.offsetParent === null) return;
                this.cooldownUntil = now + CONFIG.AUTO_LPN_COOLDOWN_MS;
                if (CONFIG.LPN_VALUE_REGEX.test(value)) this.swallowEnterUntil = now + CONFIG.AUTO_LPN_SWALLOW_ENTER_MS;
                Diag.event('auto-LPN', value);
                btn.click();
            };
            this.onKeyDown = (e) => {
                if (e.key !== 'Enter' || Date.now() > this.swallowEnterUntil) return;
                this.swallowEnterUntil = 0;
                e.preventDefault();
                e.stopImmediatePropagation();
            };
            document.addEventListener('input', this.onInput, true);
            document.addEventListener('keydown', this.onKeyDown, true);
        },
    };
