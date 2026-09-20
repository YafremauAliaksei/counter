    const StorageManager = {
        // Pamięć ostatniej zapisanej wartości dla każdego klucza. Potrzebna, żeby
        // nie pisać do localStorage tego samego: zbędny zapis rodzi zdarzenie
        // 'storage' w sąsiednich kartach i zmusza je do przeliczania stanu.
        _lastWritten: {},
        // Do tego momentu autozapis milczy (patrz REMOTE_APPLY_SUPPRESS_MS).
        suppressSaveUntil: 0,

        getKey(key) { return `${CONFIG.SCRIPT_ID_PREFIX}${key}`; },

        /**
         * Zapis z odnotowaniem wartości — JEDYNE miejsce, z którego skrypt pisze
         * do localStorage poza dziennikiem wartości i kursami.
         *
         * ZAPIS MA PRAWO NIE DOJŚĆ i to nie jest sytuacja teoretyczna:
         * localStorage tej domeny dzielimy z samym TREX, więc kwota potrafi się
         * skończyć nie z naszej winy. Do tego część konfiguracji przeglądarki
         * (zablokowany magazyn dla witryny) sprawia, że setItem rzuca wyjątek
         * przy każdym wywołaniu.
         *
         * Wcześniej wyjątek szedł stąd w górę nieprzechwycony. Skutek był
         * nieproporcjonalny do przyczyny: saveState() woła się w Main.init(),
         * więc przy pełnym magazynie catch w init() rozbierał całość i skrypt
         * NIE WSTAWAŁ WCALE. Licznik, który doskonale policzyłby zmianę
         * w pamięci, nie pokazywał się na ekranie.
         *
         * Teraz nieudany zapis jest zdarzeniem zwykłym: wraca `false`, skrypt
         * pracuje dalej na stanie w pamięci, a człowiek traci tylko przeniesienie
         * liczników przez F5 — czyli dokładnie tyle, ile naprawdę zepsuł pełny
         * magazyn.
         *
         * Notatka `_lastWritten` stawia się DOPIERO PO UDANYM zapisie i to jest
         * druga połowa tej poprawki. Gdy stała przed nim, po nieudanym zapisie
         * pamięć twierdziła, że wartość leży w magazynie, i deduplikacja
         * odrzucała następną, już możliwą próbę zapisania tego samego.
         *
         * @returns {boolean} czy wartość naprawdę trafiła do magazynu.
         */
        write(key, value) {
            if (this._lastWritten[key] === value) return false;
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                delete this._lastWritten[key];
                Utils.error(`Zapis do magazynu nie powiódł się (${key}): ${e.name}. `
                          + 'Skrypt pracuje dalej, ale stan nie przeżyje przeładowania strony.');
                return false;
            }
            this._lastWritten[key] = value;
            return true;
        },
        saveState() {
            if (!store.initialized) return;
            this.write(this.getKey(CONFIG.STORAGE_KEY_USER_CONFIG), JSON.stringify(store.userConfig));
            this.write(this.getKey(CONFIG.STORAGE_KEY_SESSION_CONFIG), JSON.stringify(store.sessionConfig));

            const allLocalsKey = this.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS);
            let allLocals;
            try { allLocals = JSON.parse(localStorage.getItem(allLocalsKey) || "{}"); } catch (e) { allLocals = {}; }
            if (store.currentTabInstanceId) {
                allLocals[store.currentTabInstanceId] = store.localTabConfig;
            }
            // Sprzątamy śmieciowy klucz "null", który zapisywała 8.0.0 przez to,
            // że loadAll() szedł przed identifyTab().
            delete allLocals['null'];
            this.write(allLocalsKey, JSON.stringify(allLocals));
        },
        // Autozapis: każda zmiana stanu odkłada zapis o sekundę.
        // W 8.0.0 ustawienia zapisywały się dopiero przy zamykaniu panelu, a F5
        // w środku zmiany je gubiło.
        scheduleSave: Utils.debounce(function() {
            if (Date.now() < StorageManager.suppressSaveUntil) return;
            StorageManager.saveState();
        }, CONFIG.AUTOSAVE_DEBOUNCE_MS),

        saveCounter(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey), String(count));
        },
        /** Licznik sprzedanych — mianownikiem procentu jest zwykły licznik obok. */
        saveSold(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD + tabKey), String(count));
        },
        /** Licznik przedmiotów wyjętych z mianownika procentu (audyt, ręczne wpisy). */
        saveNeutral(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL + tabKey), String(count));
        },
        /**
         * Lista zadań i identyfikator aktywnego — jeden klucz wspólny dla
         * wszystkich kart. Zapis jest mały (kilka zadań na zmianę), więc idzie
         * w całości, bez różnicowania.
         */
        saveTasks() {
            this.write(this.getKey(CONFIG.STORAGE_KEY_TASKS),
                       JSON.stringify({ activeId: store.activeTaskId, list: store.tasks }));
        },
        /** Liczniki jednego zadania na jednej karcie: „paczki,sprzedane,poza mianownikiem”. */
        saveTaskCounter(taskId, tabKey, c) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER + taskId + '_' + tabKey),
                       `${c.done},${c.sold},${c.neutral}`);
        },
        removeTaskCounter(taskId, tabKey) {
            const key = this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER + taskId + '_' + tabKey);
            delete this._lastWritten[key];
            localStorage.removeItem(key);
        },
        /**
         * Rozbiór klucza licznika zadania. Identyfikator zadania sam zawiera
         * podkreślenia (`task_abc_def`), więc dzieli się od PRAWEJ: ostatni
         * człon to karta, wszystko przed nim to identyfikator.
         */
        parseTaskCounterKey(localKey) {
            const rest = localKey.substring(CONFIG.STORAGE_PREFIX_TASK_COUNTER.length);
            const cut = rest.lastIndexOf('_');
            if (cut <= 0) return null;
            return { taskId: rest.substring(0, cut), tabKey: rest.substring(cut + 1) };
        },
        /** Wartość licznika zadania z magazynu; śmieć czyta się jako zera. */
        parseTaskCounterValue(raw) {
            const parts = String(raw == null ? '' : raw).split(',');
            const num = (i) => Math.max(0, parseInt(parts[i], 10) || 0);
            return { done: num(0), sold: num(1), neutral: num(2) };
        },
        removeCounter(tabKey) {
            const key = this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey);
            delete this._lastWritten[key];
            localStorage.removeItem(key);
        },
        /**
         * Wszystkie klucze localStorage należące do skryptu.
         *
         * 8.4.0: wchodzi tu także wspólny, nieversjonowany prefiks — archiwum
         * podsumowań. Zwykły reset zmiany go nie rusza (w tym cały sens:
         * archiwum żyje dziesiątki zmian), ale przycisk PEŁNEGO resetu musi
         * usuwać wszystko, co skrypt kiedykolwiek zapisał.
         *
         * Filtr po dwóch prefiksach jest też zabezpieczeniem: localStorage tej
         * domeny należy w większości do samego TREX i skrypt nie ma prawa
         * dotknąć ani jednego cudzego klucza.
         */
        ownKeys() {
            return Object.keys(localStorage).filter(k =>
                k.startsWith(CONFIG.SCRIPT_ID_PREFIX) || k.startsWith(CONFIG.SHARED_ID_PREFIX));
        },
        /**
         * Klucze wspólnego magazynu po możliwościach, których już nie ma.
         * 8.5.0: trafiła tu pamięć cen na pięć dób — została odwołana i nie ma
         * po co, żeby wisiała w localStorage.
         */
        purgeLegacySharedKeys() {
            (CONFIG.LEGACY_SHARED_KEYS || []).forEach(k => {
                const full = CONFIG.SHARED_ID_PREFIX + k;
                if (localStorage.getItem(full) !== null) {
                    localStorage.removeItem(full);
                    Utils.log(`Usunięto klucz odwołanej funkcji: ${full}`);
                }
            });
        },
        /** Czyści klucze poprzednich wersji (ważne na maszynach bez resetu sesji). */
        purgeLegacyKeys() {
            const stale = Object.keys(localStorage).filter(k =>
                CONFIG.LEGACY_ID_PREFIXES.some(p => k.startsWith(p)));
            stale.forEach(k => localStorage.removeItem(k));
            if (stale.length) Utils.log(`Usunięto kluczy poprzednich wersji: ${stale.length}`);
        },
        /**
         * @param {boolean} fromRemote - true, jeśli wczytanie wywołało zdarzenie
         *   'storage' z innej karty. Wtedy na chwilę wyciszamy autozapis, inaczej
         *   karty zaczynają w nieskończoność przepisywać sobie stan nawzajem.
         */
        loadAll(fromRemote = false) {
            try {
                const uc = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_USER_CONFIG)) || "null");
                if (uc) Object.assign(store.userConfig, Utils.deepMerge(store.userConfig, uc));

                const sc = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_SESSION_CONFIG)) || "null");
                if (sc) Object.assign(store.sessionConfig, Utils.deepMerge(store.sessionConfig, sc));

                const allLocals = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS)) || "{}");
                if (store.currentTabInstanceId && allLocals[store.currentTabInstanceId]) {
                    Object.assign(store.localTabConfig, Utils.deepMerge(store.localTabConfig, allLocals[store.currentTabInstanceId]));
                }

                const prefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER);
                const soldPrefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD);
                const neutralPrefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL);
                const taskPrefix = this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER);
                this.loadTasks();
                const taskCounters = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        const tabKey = key.substring(prefix.length);
                        store.tabCounters[tabKey] = parseInt(localStorage.getItem(key), 10) || 0;
                    } else if (key && key.startsWith(soldPrefix)) {
                        const tabKey = key.substring(soldPrefix.length);
                        store.tabSold[tabKey] = parseInt(localStorage.getItem(key), 10) || 0;
                    } else if (key && key.startsWith(neutralPrefix)) {
                        const tabKey = key.substring(neutralPrefix.length);
                        store.tabNeutral[tabKey] = parseInt(localStorage.getItem(key), 10) || 0;
                    } else if (key && key.startsWith(taskPrefix)) {
                        const parsed = this.parseTaskCounterKey(key.substring(CONFIG.SCRIPT_ID_PREFIX.length));
                        if (!parsed) continue;
                        if (!taskCounters[parsed.taskId]) taskCounters[parsed.taskId] = {};
                        taskCounters[parsed.taskId][parsed.tabKey] =
                            this.parseTaskCounterValue(localStorage.getItem(key));
                    }
                }
                store.taskCounters = taskCounters;
            } catch (e) { Utils.error("Storage load failed", e); }

            if (fromRemote) this.suppressSaveUntil = Date.now() + CONFIG.REMOTE_APPLY_SUPPRESS_MS;
        },
        /**
         * Wczytanie listy zadań. Śmieciowy zapis (cudza wersja, ręczna edycja
         * magazynu) nie może zatrzymać startu — wtedy lista zostaje pusta,
         * a TaskManager.init() postawi zadanie domyślne.
         */
        loadTasks() {
            let parsed;
            try { parsed = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_TASKS)) || 'null'); }
            catch (e) { parsed = null; }
            const list = (parsed && Array.isArray(parsed.list) ? parsed.list : [])
                .filter(t => t && typeof t.id === 'string' && Array.isArray(t.segments) && t.segments.length)
                .map(t => ({
                    id: t.id,
                    name: String(t.name || CONFIG.DEFAULT_TASK_NAME).slice(0, CONFIG.TASK_MAX_NAME_LEN),
                    segments: t.segments
                        .filter(seg => seg && typeof seg.from === 'number')
                        .map(seg => ({ from: seg.from, to: typeof seg.to === 'number' ? seg.to : null })),
                }))
                .filter(t => t.segments.length);
            store.tasks = list;
            const activeId = parsed && typeof parsed.activeId === 'string' ? parsed.activeId : null;
            store.activeTaskId = list.some(t => t.id === activeId) ? activeId : (list.length ? list[list.length - 1].id : null);
        },
        listen() {
            // 8.3.0: referencja do obsługi jest zapamiętana — potrzebna w Main.teardown().
            this.onStorage = (e) => {
                if (!e.key || !e.key.startsWith(CONFIG.SCRIPT_ID_PREFIX)) return;
                // 9.1.0: wartość klucza zmienił KTOŚ INNY, więc nasza notatka
                // „ostatnie zapisane” nie opisuje już magazynu. Bez tego
                // deduplikacja mogłaby pominąć nasz następny zapis tej samej
                // wartości i zostawić w kluczu cudzą.
                delete this._lastWritten[e.key];
                const localKey = e.key.substring(CONFIG.SCRIPT_ID_PREFIX.length);
                if (localKey === CONFIG.STORAGE_KEY_VALUE_LOG) {
                    // Dziennik wartości jest wspólny na wszystkie karty: sąsiadka
                    // dopisała przedmiot albo postawiła znak — scalamy, nie zamazujemy.
                    ValueLog.adoptRemote();
                    return;
                }
                if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_COUNTER)) {
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_COUNTER.length);
                    // e.newValue === null znaczy, że klucz został usunięty — to
                    // reset liczników przez sąsiednią kartę przy zmianie zmiany.
                    const val = parseInt(e.newValue, 10) || 0;
                    if (store.tabCounters[tabKey] !== val) store.tabCounters[tabKey] = val;
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_SOLD)) {
                    // Licznik sprzedanych sąsiedniej karty — potrzebny liniom 2 i 7,
                    // które liczą procent po WSZYSTKICH kartach naraz.
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_SOLD.length);
                    const val = parseInt(e.newValue, 10) || 0;
                    if (store.tabSold[tabKey] !== val) store.tabSold[tabKey] = val;
                } else if (localKey === CONFIG.STORAGE_KEY_TASKS) {
                    // Zadanie jest własnością człowieka, a nie karty: przejście
                    // do innego procesu w jednej karcie obowiązuje we wszystkich.
                    this.loadTasks();
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TASK_COUNTER)) {
                    // Liczniki zadania z sąsiedniej karty — potrzebne panelowi,
                    // który pokazuje podsumowanie zadania po WSZYSTKICH kartach.
                    const parsed = this.parseTaskCounterKey(localKey);
                    if (parsed) {
                        const byTab = { ...(store.taskCounters[parsed.taskId] || {}) };
                        byTab[parsed.tabKey] = this.parseTaskCounterValue(e.newValue);
                        store.taskCounters = { ...store.taskCounters, [parsed.taskId]: byTab };
                    }
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL)) {
                    // Audyty sąsiedniej karty — z tego samego powodu: bez nich
                    // linie 2 i 7 policzyłyby procent z za dużego mianownika.
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL.length);
                    const val = parseInt(e.newValue, 10) || 0;
                    if (store.tabNeutral[tabKey] !== val) store.tabNeutral[tabKey] = val;
                } else if (!store.uiFlags.isSettingsPanelVisible) {
                    this.debouncedLoad();
                }
            };
            window.addEventListener('storage', this.onStorage);
        },
        debouncedLoad: Utils.debounce(function() { StorageManager.loadAll(true); }, 300)
    };
