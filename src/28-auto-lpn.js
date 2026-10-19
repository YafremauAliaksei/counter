    // ==========================================
    // 6j. AUTO-LPN
    // ==========================================
    /**
     * Na kroku pojemnika człowiek skanuje czasem etykietę LPN zamiast
     * pojemnika — wtedy trzeba wcisnąć „Przypisz ponownie LPN”. Auto-LPN robi
     * to za niego: o decyzji przesądza pierwszy znak wpisu (t/w/c to
     * pojemnik, wszystko inne to etykieta), a przerwa po decyzji chroni przed
     * powtórnym wciśnięciem przy kolejnych znakach tego samego skanu.
     * Domyślnie wyłączone; słuchacz wychodzi od razu, gdy opcja jest zgaszona.
     */
    const AutoLpn = {
        cooldownUntil: 0,
        init() {
            this.onInput = (e) => {
                if (!store.userConfig.autoLpn) return;
                const el = e.target;
                if (!el || el.tagName !== 'INPUT' || !ToteWatch.isToteInput(el)) return;
                const value = String(el.value || '').trim().toLowerCase();
                if (!value) return;
                const now = Date.now();
                if (now < this.cooldownUntil) return;
                const btn = /** @type {HTMLButtonElement|null} */ (document.querySelector(`button[data-testid="${CONFIG.REASSIGN_LPN_BUTTON_TESTID}"]`));
                if (!btn || btn.disabled || btn.offsetParent === null) return;
                this.cooldownUntil = now + CONFIG.AUTO_LPN_COOLDOWN_MS;
                if (CONFIG.AUTO_LPN_TOTE_PREFIXES.includes(value[0])) return;
                btn.click();
            };
            document.addEventListener('input', this.onInput, true);
        },
    };
