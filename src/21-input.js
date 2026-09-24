    // ==========================================
    // 7. WEJŚCIE I WYZWALACZE
    // ==========================================
    const InputManager = {
        /**
         * Ostatnie naciśnięte znaki — łańcuch przycinany slice(), bez tablicy
         * pośredniej (kod chodzi na każdy klawisz przez całą zmianę).
         */
        seqBuffer: '',
        /** Najdłuższe hasło — tyle znaków trzeba pamiętać i ani znaku więcej. */
        _maxPasswordLen: 0,
        /**
         * Hasła pogrupowane po ostatnim znaku. Porównanie z buforem zaczyna się
         * tylko wtedy, gdy naciśnięty znak kończy któreś hasło — przy
         * 'GORDONPAULE' i 'BOMBA' tylko przy E i A. Mapa buduje się raz, w init().
         */
        _passwordsByLastChar: null,
        init() {
            // Obsługa nazwana — potrzebna do Main.teardown().
            this.onKeyDown = (e) => {
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

                // Autopowtarzanie pomijamy: przytrzymany klawisz daje dziesiątki
                // keydown na sekundę, a każde byłoby +1 do licznika (prawy Shift
                // łatwo przycisnąć przypadkiem) i śmieciem w buforze haseł.
                if (e.repeat) return;

                if (store.userConfig.keyboardShortcuts.INCREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.INCREMENT) {
                    this.modifyCounter(1, { manual: true }); e.preventDefault();
                } else if (store.userConfig.keyboardShortcuts.DECREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.DECREMENT) {
                    this.modifyCounter(-1, { manual: true }); e.preventDefault();
                }

                /**
                 * Hasła dostępu (SETTINGS_ACCESS_PASSWORDS w nagłówku pliku).
                 *
                 * Bufor ma długość najdłuższego hasła i przesuwa się jak okno;
                 * hasło jest wpisane, gdy bufor się na nim kończy. Po trafieniu
                 * bufor jest czyszczony — inaczej hasło będące końcówką innego
                 * zadziałałoby dwa razy, a toggle() otworzyłby i zamknął panel.
                 *
                 * To nie jest zabezpieczenie kryptograficzne — chodzi tylko o to,
                 * żeby panel nie otwierał się przypadkiem przy pracy ze skanerem.
                 */
                if (this._maxPasswordLen > 0 && e.key.length === 1) {
                    const ch = e.key.toUpperCase();
                    this.seqBuffer = (this.seqBuffer + ch).slice(-this._maxPasswordLen);
                    const candidates = this._passwordsByLastChar.get(ch);
                    if (candidates) {
                        for (const password of candidates) {
                            if (!this.seqBuffer.endsWith(password)) continue;
                            SettingsPanel.toggle();
                            this.seqBuffer = '';
                            break;
                        }
                    }
                }
            };
            /**
             * Przygotowanie haseł — raz, przy starcie. Kolejność w grupie jak
             * w CONFIG (od najdłuższego), więc przy kilku trafieniach naraz
             * wygrywa dłuższe hasło.
             */
            const passwords = CONFIG.SETTINGS_PANEL_ACCESS_PASSWORDS || [];
            this._passwordsByLastChar = new Map();
            this._maxPasswordLen = 0;
            for (const password of passwords) {
                if (password.length > this._maxPasswordLen) this._maxPasswordLen = password.length;
                const last = password[password.length - 1];
                if (!this._passwordsByLastChar.has(last)) this._passwordsByLastChar.set(last, []);
                this._passwordsByLastChar.get(last).push(password);
            }

            document.addEventListener('keydown', this.onKeyDown, true);
        },
        /**
         * @param {number} delta
         * @param {{manual?: boolean}} [opts] — `manual` znaczy „człowiek poprawia
         *   to, czego program nie zobaczył”. Taka paczka wchodzi do zadania
         *   inaczej niż zaliczona automatycznie: razem z licznikiem „poza
         *   mianownikiem”, bo jej kierunku nikt nie zna (patrz TaskManager).
         */
        modifyCounter(delta, opts = {}) {
            const cid = store.currentTabInstanceId;
            const cur = store.tabCounters[cid] || 0;
            const next = Math.max(0, cur + delta);
            if (opts.manual) {
                // Liczniki zmiany (paczki, sprzedane, poza mianownikiem) idą
                // z zadań — odjęcie zmienia też sprzedane (patrz _shrink).
                TaskManager.adjustManual(cid, next - cur);
                TaskManager.syncShift(cid);
                return;
            }
            TaskManager.addItem(cid);
            StorageManager.bump(CONFIG.STORAGE_PREFIX_TAB_COUNTER, store.tabCounters, cid);
            // Przerysowanie wywołuje sam zapis do stanu (onStorePaths po
            // 'tabCounters') — jawne renderContent() dałoby drugi render.
        }
    };

    const AutoTrigger = {
        observer: null,
        debouncedScan: null,
        debouncedAttach: null,

        /**
         * Czy węzeł należy do własnego interfejsu skryptu. Okno statystyk,
         * nakładka i panel leżą w obserwowanym document.body, a okno
         * przerysowuje się co sekundę — bez tego filtra każda taka mutacja
         * uruchamiałaby scan() z odczytem innerText (przeliczenie geometrii
         * całej strony).
         */
        isOwnNode(node) {
            if (!node) return false;
            const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            if (!el || typeof el.closest !== 'function') return false;
            return !!el.closest(`[id^="${CONFIG.SCRIPT_ID_PREFIX}"]`);
        },

        attach() {
            if (this.observer) this.observer.disconnect();

            const delay = Number(store.userConfig.triggerMutationDebounceMs) || CONFIG.DEFAULT_TRIGGER_MUTATION_DEBOUNCE_MS;
            this.debouncedScan = Utils.debounce(() => this.scan(), delay);

            this.observer = new MutationObserver((mutations) => {
                // Paczka złożona w całości z naszych własnych zmian jest pomijana.
                if (mutations.every(m => this.isOwnNode(m.target))) return;
                this.debouncedScan();
            });

            const root = document.querySelector(CONFIG.TRIGGER_OBSERVE_AREA_SELECTOR) || document.body;
            this.observer.observe(root, { childList: true, subtree: true, characterData: true });
        },

        init() {
            this.attach();
            // Odtwarzanie observera z debounce — przeciąganie suwaka interwału
            // dawałoby dziesiątki disconnect/observe. Uchwyt na obiekcie, żeby
            // rozbiórka mogła go zgasić.
            this.debouncedAttach = Utils.debounce(() => this.attach(), 500);
            bus.on('store:changed:userConfig.triggerMutationDebounceMs', this.debouncedAttach);
        },

        scan() {
            const txt = document.body.innerText || '';
            // Kierunek czyta się przed licznikiem: kod sortowania i wyzwalacz
            // końcowy często przychodzą w jednej klatce, a wtedy znak staje od
            // razu przy tworzeniu wpisu.
            Routing.observe(txt);

            if (CONFIG.PRE_TRIGGER_REGEX.test(txt)) store.uiFlags.itemInProgress = true;
            if (CONFIG.AUTO_TRIGGER_REGEX.test(txt)) {
                if (store.uiFlags.itemInProgress && !store.uiFlags.autoTriggerFound) {
                    InputManager.modifyCounter(1);
                    store.uiFlags.autoTriggerFound = true;
                    store.uiFlags.itemInProgress = false;
                    // Przedmiot przeszedł pełną ścieżkę — zdarzenie dla dziennika
                    // idzie stąd, a nie z modifyCounter(), bo skróty i ręczne
                    // poprawki dziennika nie napełniają.
                    bus.emit('item:completed');
                }
            } else {
                store.uiFlags.autoTriggerFound = false;
            }
            // Karta ceny korzysta z tego skanu zamiast własnego obserwatora
            // i drugiego odczytu document.innerText.
            bus.emit('page:scanned');
        }
    };
