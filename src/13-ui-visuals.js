    // Renderer przyciemnienia i wskaźnika
    const VisualsRenderer = {
        init() {
            // id jest obowiązkowe — po nim AutoTrigger odróżnia własne elementy
            // skryptu od zmian strony (AutoTrigger.isOwnNode).
            this.overlay = h('div', { id: 'pageOverlay', style: { position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: '1', pointerEvents: 'none', transition: 'background-color 0.4s', backgroundColor: 'transparent' } });
            this.indicator = h('div', { id: 'pageIndicator', style: { position: 'fixed', top: '50%', right: '100px', transform: 'translateY(-50%) rotate(90deg)', transformOrigin: 'bottom right', fontSize: '5vw', fontWeight: 'bold', zIndex: '2', pointerEvents: 'none', transition: 'opacity 0.4s', opacity: '0' } });
            document.body.appendChild(this.overlay);
            document.body.appendChild(this.indicator);
            onStorePaths(['localTabConfig', 'userConfig', 'currentTabType', 'currentTabInstanceId'],
                         () => this.update());
        },
        update() {
            const lc = store.localTabConfig;
            const cInfo = CONFIG.KNOWN_TAB_TYPES[store.currentTabType] || CONFIG.DEFAULT_UNKNOWN_TAB_DETAILS;

            if (lc.pageOverlayOpacity > 0) {
                this.overlay.style.backgroundColor = `rgba(${Utils.hexToRgb(cInfo.baseColorHex)}, ${Utils.clampNum(lc.pageOverlayOpacity, 0, 100, 0) / 100})`;
            } else {
                this.overlay.style.backgroundColor = 'transparent';
            }

            if (lc.pageIndicatorTextVisible) {
                this.indicator.textContent = I18n.getTabName(store.currentTabInstanceId).toUpperCase();
                this.indicator.style.color = `rgba(${Utils.hexToRgb(cInfo.baseColorHex)}, 0.2)`;
                this.indicator.style.opacity = '1';
            } else {
                this.indicator.style.opacity = '0';
            }
        }
    };

    /**
     * Krótkie wyskakujące powiadomienie — głównie przy resecie liczników:
     * człowiek ma widzieć, że zerowanie było zamierzone, a nie że dane zgubiły
     * się same. Reset bywa przed postawieniem interfejsu, więc ostatni
     * komunikat czeka w SessionReset.lastReset.
     */
    const Notifier = {
        init() {
            // id jest obowiązkowe: inaczej AutoTrigger uzna pojawienie się
            // powiadomienia za zmianę strony i uruchomi zbędny skan.
            this.el = h('div', {
                id: 'toast',
                style: {
                    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
                    padding: '10px 18px', borderRadius: '6px', zIndex: '2147483645',
                    background: 'rgba(20, 20, 20, 0.92)', color: '#fff', fontSize: '14px',
                    fontFamily: CONFIG.FONT_FAMILY_OPTIONS.default, pointerEvents: 'none',
                    opacity: '0', transition: 'opacity 0.35s', maxWidth: '70vw', textAlign: 'center'
                }
            });
            document.body.appendChild(this.el);

            bus.on('session:reset', (d) => this.show(this.resetText(d && d.kind)));
            if (SessionReset.lastReset) {
                this.show(this.resetText(SessionReset.lastReset.kind));
                SessionReset.lastReset = null;
            }
            bus.on('storage:writeFailed', () => this.warnStorageFull());
            if (Persistence.writeFailed) this.warnStorageFull();
        },
        /**
         * Pełny magazyn — raz na stronę. Zapisów jest kilka na przedmiot, więc
         * bez tego znacznika powiadomienie wisiałoby na ekranie przez całą zmianę.
         */
        storageWarned: false,
        warnStorageFull() {
            if (this.storageWarned) return;
            this.storageWarned = true;
            this.show(I18n.get('notice_storageFull'), 12000);
        },
        /** Tekst powiadomienia wg rodzaju resetu. */
        resetText(kind) {
            if (kind === 'manual') return I18n.get('resetNotice_manual');
            if (kind === 'stale') return I18n.get('resetNotice_stale');
            return I18n.get('newShiftDetected');
        },
        show(text, ms = 6000) {
            if (!this.el) return;
            this.el.textContent = text;
            this.el.style.opacity = '1';
            clearTimeout(this._hideTimer);
            this._hideTimer = setTimeout(() => { this.el.style.opacity = '0'; }, ms);
        }
    };
