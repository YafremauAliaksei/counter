    // ==========================================
    // 7. WEJŚCIE I WYZWALACZE
    // ==========================================
    const InputManager = {
        /**
         * Ostatnie naciśnięte znaki, jako ŁAŃCUCH, a nie tablica.
         *
         * Wcześniej była tablica sklejana przez join('') przy każdym
         * naciśnięciu. Łańcuch z slice() robi to samo bez tworzenia tablicy
         * pośredniej — a to kod, który chodzi na każdy klawisz przez całą
         * dziesięciogodzinną zmianę.
         */
        seqBuffer: '',
        /** Najdłuższe hasło — tyle znaków trzeba pamiętać i ani znaku więcej. */
        _maxPasswordLen: 0,
        /**
         * Hasła pogrupowane po OSTATNIM znaku.
         *
         * Sedno optymalizacji. Bez tego każde naciśnięcie klawisza porównywałoby
         * bufor z każdym hasłem po kolei. Tak porównanie w ogóle się nie zaczyna,
         * dopóki naciśnięty znak nie jest ostatnim znakiem któregoś z haseł —
         * czyli przy zwykłym pisaniu prawie nigdy. Przy 'GORDONPAULE' i 'BOMBA'
         * pracę uruchamiają wyłącznie litery E i A.
         *
         * Mapa buduje się RAZ, w init(), a nie przy każdym klawiszu.
         */
        _passwordsByLastChar: null,
        init() {
            // 8.3.0: obsługa jest nazwana — potrzebna do Main.teardown().
            this.onKeyDown = (e) => {
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

                // AUTOPOWTARZANIE. Wciśnięty klawisz generuje keydown dziesiątki
                // razy na sekundę i do 8.3.0 każde takie zdarzenie dawało +1 do
                // licznika, z zapisem do localStorage. Dla licznika, dla którego
                // napisany jest cały skrypt, to wprost psucie danych roboczych:
                // prawy Shift, jeden z domyślnych wariantów, łatwo przycisnąć
                // przypadkiem. Hasło dostępu autopowtarzanie też zaśmieca.
                if (e.repeat) return;

                if (store.userConfig.keyboardShortcuts.INCREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.INCREMENT) {
                    this.modifyCounter(1, { manual: true }); e.preventDefault();
                } else if (store.userConfig.keyboardShortcuts.DECREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.DECREMENT) {
                    this.modifyCounter(-1, { manual: true }); e.preventDefault();
                }

                /**
                 * HASŁA DOSTĘPU (patrz SETTINGS_ACCESS_PASSWORDS na górze pliku).
                 *
                 * Bufor ma tyle znaków, ile NAJDŁUŻSZE hasło, i przesuwa się jak
                 * okno. Hasło uznaje się za wpisane, gdy bufor KOŃCZY SIĘ na nim —
                 * dzięki temu wpisywanie czegokolwiek wcześniej niczego nie psuje,
                 * a hasła różnej długości żyją na jednej liście bez osobnych
                 * buforów.
                 *
                 * Po trafieniu bufor jest czyszczony. To nie porządki: bez tego
                 * hasło, które jest końcówką innego, zadziałałoby dwa razy pod
                 * rząd, a `toggle()` otworzyłby i natychmiast zamknął panel.
                 *
                 * To nie jest zabezpieczenie kryptograficzne i nie ma nim być:
                 * chodzi wyłącznie o to, żeby panel nie otwierał się przypadkiem
                 * podczas normalnej pracy ze skanerem.
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
             * Przygotowanie haseł. Robi się RAZ, przy starcie: lista z góry pliku
             * jest stała przez całe życie egzemplarza, więc liczenie jej przy
             * każdym naciśnięciu klawisza byłoby czystą stratą.
             *
             * Kolejność w grupie zostaje taka, jak w CONFIG — od najdłuższego —
             * więc gdy w jednym naciśnięciu pasuje kilka haseł, wygrywa dłuższe.
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
            const applied = next - cur;
            if (opts.manual) {
                TaskManager.adjustManual(cid, applied);
                store.tabNeutral[cid] = TaskManager.shiftTotal(cid, 'neutral');
                StorageManager.saveNeutral(cid, store.tabNeutral[cid]);
            } else {
                TaskManager.addItem(cid);
            }
            store.tabCounters[cid] = next;
            StorageManager.saveCounter(cid, next);
            // Przerysowanie wywołuje sam zapis do stanu (onStorePaths po
            // 'tabCounters'), więc jawnego wywołania renderContent() już tu nie ma:
            // dawało dwa pełne rendery na każdy przedmiot.
        }
    };

    const AutoTrigger = {
        observer: null,
        debouncedScan: null,
        debouncedAttach: null,

        /**
         * Czy węzeł należy do własnego interfejsu skryptu.
         *
         * To kluczowa poprawka 8.1.0. Okno statystyk, nakładka, wskaźnik i panel
         * ustawień leżą w tym samym document.body, który obserwuje observer.
         * Strony, dla których pisany był skrypt, przez całą zmianę są statyczne —
         * czyli praktycznie JEDYNYM źródłem mutacji był sam skrypt, który
         * przerysowuje statystykę raz na sekundę. Każda taka mutacja uruchamiała
         * scan() z odczytem document.body.innerText, a to wymuszone przeliczenie
         * geometrii całej strony, jedna z najdroższych operacji w DOM.
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
            // 8.1.0: odtwarzanie observera opakowane w debounce. Wcześniej wisiało
            // na „surowej” zmianie stanu i przeciąganie suwaka interwału skanowania
            // wywoływało dziesiątki disconnect/observe pod rząd.
            // Uchwyt trzymany na obiekcie, żeby rozbiórka mogła go zgasić.
            this.debouncedAttach = Utils.debounce(() => this.attach(), 500);
            bus.on('store:changed:userConfig.triggerMutationDebounceMs', this.debouncedAttach);
        },

        scan() {
            const txt = document.body.innerText || '';
            /**
             * Kierunek czyta się PIERWSZY i to jest ważne (9.0.0).
             *
             * Kod sortowania i wyzwalacz końcowy nierzadko lądują w jednej klatce:
             * ekran przerysował się w całości i „Przypisz nowy”, i „Zeskanuj
             * CRITS-POZ1” widać jednocześnie. Odczytawszy kierunek przed
             * licznikiem, zdążymy postawić znak wprost w momencie tworzenia wpisu,
             * zamiast doganiać go następnym skanem.
             */
            Routing.observe(txt);

            if (CONFIG.PRE_TRIGGER_REGEX.test(txt)) store.uiFlags.itemInProgress = true;
            if (CONFIG.AUTO_TRIGGER_REGEX.test(txt)) {
                if (store.uiFlags.itemInProgress && !store.uiFlags.autoTriggerFound) {
                    InputManager.modifyCounter(1);
                    store.uiFlags.autoTriggerFound = true;
                    store.uiFlags.itemInProgress = false;
                    // 8.4.0: przedmiot przeszedł PEŁNĄ ścieżkę — dopiero teraz jego
                    // wartość trafia do dziennika. Zdarzenie emituje się właśnie
                    // tutaj, a nie w modifyCounter(): skróty klawiszowe i ręczna
                    // poprawka licznika dziennika nie napełniają.
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
