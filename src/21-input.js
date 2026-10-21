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
                } else if (store.userConfig.keyboardShortcuts.TOGGLE_WINDOW !== 'None' && e.code === store.userConfig.keyboardShortcuts.TOGGLE_WINDOW) {
                    StatsWindowRenderer.toggleHidden(); e.preventDefault();
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
         * @param {{manual?: boolean, taskId?: string}} [opts] - `manual` znaczy
         *   „człowiek poprawia to, czego program nie zobaczył”. Taka paczka
         *   wchodzi do zadania inaczej niż zaliczona automatycznie: razem
         *   z licznikiem „poza mianownikiem”, bo jej kierunku nikt nie zna
         *   (patrz TaskManager). `taskId` — zadanie, do którego należy paczka,
         *   gdy nie jest nim zadanie aktywne (premia za sprzedaż).
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
            TaskManager.addItem(cid, opts.taskId);
            Persistence.bump(CONFIG.STORAGE_PREFIX_TAB_COUNTER, store.tabCounters, cid);
            // Przerysowanie wywołuje sam zapis do stanu (onStorePaths po
            // 'tabCounters') — jawne renderContent() dałoby drugi render.
        }
    };

    /**
     * CYKL PRZEDMIOTU — od wyzwalacza początku do zaliczenia.
     *
     *   początek   — wyzwalacz początku POJAWIŁ SIĘ na stronie (zbocze: nie
     *                było go w poprzednim skanie). Gdy poprzedni przedmiot
     *                nie dostał wyzwalacza końcowego, został przerwany i nic
     *                nie dostaje; gdy dostał, a pojemnika nie było — zalicza
     *                się teraz (pole pojemnika bywa poza naszym zasięgiem).
     *   koniec     — wyzwalacz końcowy przy trwającym przedmiocie.
     *   pojemnik   — przybity pojemnik. `tsREP…` przerywa przedmiot na każdym
     *                etapie. Zwykły zalicza przedmiot, jeśli był już koniec;
     *                jeśli nie — zaliczy go koniec.
     *   czas       — koniec bez pojemnika przez ITEM_FINISH_GRACE_MS: zalicza.
     *
     * Zaliczenie: +1, a w działach DOUBLE_TAB_TYPES +2, gdy była widoczna
     * naklejka albo fraza o odsprzedaży i przedmiot pojechał na sprzedaż
     * (o sprzedaży rozstrzyga Routing — także po zaliczeniu, gdy kod
     * sortowania przyjdzie później).
     */
    const AutoTrigger = {
        observer: null,
        debouncedScan: null,
        debouncedAttach: null,
        /** Przedmioty, które dostały wyzwalacz końcowy — porównanie w SH.tote(). */
        textCompleted: 0,
        /** @type {{finished: boolean, finishedAt: number, toteOk: boolean, sticker: boolean, phrase: boolean, stickerLeftover: boolean}|null} */
        item: null,
        /** Czy wyzwalacz początku był w poprzednim skanie (do wykrycia zbocza). */
        preSeen: false,
        /** Czy naklejka była widoczna w poprzednim skanie (do wykrycia zbocza). */
        stickerSeen: false,

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
            this.tickTimer = setInterval(() => this.tick(), CONFIG.ITEM_TICK_MS);
            // Odtwarzanie observera z debounce — przeciąganie suwaka interwału
            // dawałoby dziesiątki disconnect/observe. Uchwyt na obiekcie, żeby
            // rozbiórka mogła go zgasić.
            this.debouncedAttach = Utils.debounce(() => this.attach(), 500);
            bus.on('store:changed:userConfig.triggerMutationDebounceMs', this.debouncedAttach);
        },

        scan() {
            const startedAt = performance.now();
            const txt = document.body.innerText || '';
            // Kierunek czyta się przed licznikiem: kod sortowania i wyzwalacz
            // końcowy często przychodzą w jednej klatce, a wtedy znak staje od
            // razu przy tworzeniu wpisu.
            Routing.observe(txt);

            // Pojemnik przed wyzwalaczem początku: pole poprzedniego przedmiotu
            // potrafi zniknąć w tej samej klatce, w której pojawia się następny
            // krok, a przybity pojemnik (także `tsREP…`) należy do przedmiotu,
            // który go dostał, a nie do tego, który dopiero się zaczyna.
            const tote = ToteWatch.check();
            if (tote !== null) this.onTote(tote);

            const pre = CONFIG.PRE_TRIGGER_REGEX.test(txt);
            if (pre && !this.preSeen) this.start();
            this.preSeen = pre;

            const item = this.item;
            if (CONFIG.DOUBLE_TAB_TYPES.includes(store.currentTabType)) {
                // Naklejka liczy się widoczna: strona potrafi przysłać następny
                // krok z wyprzedzeniem, ukryty (offsetParent === null). Sam
                // element bywa pusty i bez wymiarów, więc rozmiar nie świadczy
                // o niczym.
                const el = document.getElementById(CONFIG.STICKER_ELEMENT_ID);
                const visible = !!el && el.offsetParent !== null;
                // Naklejka widoczna już w chwili startu wisi z poprzedniego
                // przedmiotu: nowy dostaje ją dopiero, gdy zniknie i pojawi się
                // znowu.
                if (item && !visible) item.stickerLeftover = false;
                if (item && !item.sticker && visible && !item.stickerLeftover) {
                    item.sticker = true;
                    Diag.event('naklejka');
                    Routing.onSticker();
                }
                this.stickerSeen = visible;
                if (item && !item.phrase && CONFIG.RESALE_PHRASE_REGEX.test(txt)) {
                    item.phrase = true;
                    Diag.event('fraza odsprzedaży');
                }
            }

            if (CONFIG.AUTO_TRIGGER_REGEX.test(txt)) {
                if (!store.uiFlags.autoTriggerFound && item && !item.finished) {
                    store.uiFlags.autoTriggerFound = true;
                    item.finished = true;
                    item.finishedAt = Date.now();
                    this.textCompleted++;
                    Diag.event('koniec');
                    if (item.toteOk) this.count('pojemnik przed końcem');
                }
            } else {
                store.uiFlags.autoTriggerFound = false;
            }

            // Karta ceny korzysta z tego skanu zamiast własnego obserwatora
            // i drugiego odczytu document.innerText.
            bus.emit('page:scanned', { text: txt });
            Perf.scan(performance.now() - startedAt);
        },

        /** Wyzwalacz początku: nowy przedmiot; poprzedni zaliczony albo przerwany. */
        start() {
            const prev = this.item;
            if (prev && prev.finished) this.count('nowy początek bez pojemnika');
            else if (prev) Diag.event('przerwany — nowy początek');
            // Pojemnik wpisany, a pole jeszcze nie zniknęło: należy do
            // poprzedniego przedmiotu, którego już nie ma — następny nie może
            // go dostać jako własny.
            ToteWatch.pending = null;
            this.item = { finished: false, finishedAt: 0, toteOk: false, sticker: false, phrase: false,
                          stickerLeftover: this.stickerSeen };
            if (this.stickerSeen) Diag.event('naklejka z poprzedniego przedmiotu — pominięta');
            // Zbocze false -> true flagi: Routing i karta ceny zaczynają nowy
            // przedmiot także wtedy, gdy poprzedni został przerwany w trakcie.
            store.uiFlags.itemInProgress = false;
            store.uiFlags.itemInProgress = true;
            Diag.event('początek');
        },

        /** Przybity pojemnik (wartość z ToteWatch). */
        onTote(value) {
            const item = this.item;
            if (CONFIG.ESCALATION_TOTE_REGEX.test(value)) {
                if (item) {
                    this.item = null;
                    store.uiFlags.itemInProgress = false;
                    Diag.event('eskalacja — przedmiot przerwany', value);
                }
                return;
            }
            if (!item) return;
            item.toteOk = true;
            if (item.finished) this.count('pojemnik');
        },

        /** Koniec bez pojemnika przez ITEM_FINISH_GRACE_MS — zaliczenie. */
        tick() {
            const item = this.item;
            if (item && item.finished && Date.now() - item.finishedAt >= CONFIG.ITEM_FINISH_GRACE_MS) {
                this.count('czas bez pojemnika');
            }
        },

        /**
         * Zaliczenie: +1, z naklejką +2 od razu. Fraza o odsprzedaży daje +1
         * dopiero przy sprzedaży — rozstrzyga Routing.countDirection, bo kod
         * sortowania potrafi przyjść po zaliczeniu. Zdarzenie dla dziennika
         * idzie stąd, a nie z modifyCounter(), bo skróty i ręczne poprawki
         * dziennika nie napełniają.
         */
        count(reason) {
            const item = this.item;
            if (!item) return;
            this.item = null;
            const weight = item.sticker ? 2 : 1;
            for (let i = 0; i < weight; i++) InputManager.modifyCounter(1);
            Routing.markItem({ weight, bonusIfSell: item.phrase && !item.sticker });
            store.uiFlags.itemInProgress = false;
            Diag.event(`zaliczony +${weight}`, reason);
            bus.emit('item:completed', { weight });
        }
    };
