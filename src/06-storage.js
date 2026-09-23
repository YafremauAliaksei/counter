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
                this.reportWriteFailure();
                return false;
            }
            this._lastWritten[key] = value;
            return true;
        },
        /**
         * Magazyn odmówił zapisu — człowiek ma się o tym dowiedzieć (1.3.3).
         *
         * Do tej pory odmowa szła wyłącznie do Utils.error, który domyślnie
         * milczy. Ekran pokazywał poprawne liczby do końca zmiany, a rozjazd
         * wychodził dopiero po F5 albo w sąsiedniej karcie — cicha utrata jest
         * gorsza niż jedno powiadomienie, więc tu reguła „skrypt milczy”
         * świadomie ustępuje. Znacznik zostaje w pamięci, bo odmowa zdarza się
         * i PRZED postawieniem interfejsu; Notifier pokazuje ją raz na stronę.
         */
        writeFailed: false,
        reportWriteFailure() {
            this.writeFailed = true;
            bus.emit('storage:writeFailed');
        },
        /**
         * USTAWIENIA WSPÓLNE DLA KART — scalanie trójstronne (1.3.3, audyt D4, D5).
         *
         * `userConfig` i `sessionConfig` leżą w jednym kluczu na wszystkie karty.
         * Do tej pory każda karta pisała tam cały obiekt ze swojej pamięci:
         * zmiana skrótu w karcie A znikała przy najbliższym zapisie karty B,
         * a wczytanie po zdarzeniu z sąsiedniej karty cofało świeżą, jeszcze
         * niezapisaną zmianę.
         *
         * Teraz karta pamięta, co ostatnio leżało w magazynie (`_synced`),
         * i przy zapisie oraz wczytaniu przenosi TYLKO SWOJE zmiany od tamtej
         * chwili — na wierzch tego, co jest w magazynie teraz. Dwie karty
         * zmieniające różne ustawienia nie przeszkadzają sobie; ta sama
         * wartość zmieniona w obu wygrywa ostatnim zapisem.
         */
        _synced: {},
        _mergeShared(name, raw) {
            let stored;
            try { stored = JSON.parse(raw || 'null'); } catch { stored = null; }
            if (!Utils.isObject(stored)) stored = null;
            const base = this._synced[name];
            const mine = store[name];
            // Bez podstawy (pierwsze wczytanie) cały stan w pamięci jest „nasz”.
            const changes = Utils.diffPaths(base === undefined ? {} : base, mine);
            const merged = Utils.applyPaths(stored ? JSON.parse(JSON.stringify(stored)) : {}, changes);
            return { stored, merged, changes };
        },
        /**
         * Scalony stan staje się stanem w pamięci — DOKŁADNIE, łącznie
         * z usunięciami. deepMerge umie tylko dopisywać: wpis usunięty
         * w sąsiedniej karcie zostawał tu i najbliższy zapis go wskrzeszał
         * (audyt D13). Scalony stan zawiera wszystko, co tu zmieniono, więc
         * usuwa się tylko to, co zniknęło gdzie indziej.
         */
        _adoptShared(name, merged) {
            // Brakujące pola (magazyn starszej wersji, ręczna edycja) uzupełniają
            // wartości domyślne — usunąć da się tylko wpisy bez domyślnej wartości,
            // czyli dokładnie te dynamiczne (karty nierozpoznane, znaczniki kart).
            const defaults = name === 'userConfig' ? DEFAULT_USER_CONFIG : DEFAULT_SESSION_CONFIG;
            const full = Utils.deepMerge(Utils.deepMerge({}, defaults), merged);
            const target = store[name];
            for (const key of Object.keys(target)) {
                if (!(key in full)) delete target[key];
            }
            Object.assign(target, full);
        },
        _saveShared(name, storageKey) {
            const key = this.getKey(storageKey);
            let raw;
            try { raw = localStorage.getItem(key); } catch { raw = null; }
            const { merged } = this._mergeShared(name, raw);
            this._adoptShared(name, merged);
            const text = JSON.stringify(merged);
            if (this.write(key, text) || this._lastWritten[key] === text) this._synced[name] = merged;
        },
        saveState() {
            if (!store.initialized) return;
            this._saveShared('userConfig', CONFIG.STORAGE_KEY_USER_CONFIG);
            this._saveShared('sessionConfig', CONFIG.STORAGE_KEY_SESSION_CONFIG);

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
            // 1.3.3 (audyt D4): zapis wyciszony po wczytaniu stanu sąsiedniej
            // karty NIE przepada — przesuwa się za koniec ciszy. Wcześniej
            // zmiana zrobiona w tym oknie nie trafiała do magazynu nigdy.
            const wait = StorageManager.suppressSaveUntil - Date.now();
            if (wait > 0) { setTimeout(() => StorageManager.scheduleSave(), wait); return; }
            StorageManager.saveState();
        }, CONFIG.AUTOSAVE_DEBOUNCE_MS),

        saveCounter(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey), String(count));
        },
        /**
         * Świeża wartość licznika prosto z magazynu (1.3.3, audyt D7).
         *
         * Dwie karty tego samego działu dzielą klucz licznika. Każda zwiększała
         * go o jeden od wartości ze SWOJEJ pamięci, więc gdy obie zaliczyły
         * przedmiot, zanim przeglądarka doręczyła zdarzenie, druga nadpisywała
         * pierwszą i paczka ginęła. Zwiększa się więc od tego, co leży w magazynie.
         *
         * Wyjątek: po odmowie zapisu magazyn stoi w miejscu i liczenie od niego
         * zatrzymałoby licznik na ekranie — wtedy prawdą jest pamięć.
         * Brak klucza to zero: sąsiednia karta zaczęła nową zmianę.
         */
        freshCount(key, fallback) {
            if (this.writeFailed) return fallback;
            try { return this.parseCount(localStorage.getItem(key)); } catch { return fallback; }
        },
        /** +1 do licznika karty (paczki, sprzedane albo poza mianownikiem). */
        bump(prefix, memory, tabKey) {
            const key = this.getKey(prefix + tabKey);
            const next = this.freshCount(key, memory[tabKey] || 0) + 1;
            memory[tabKey] = next;
            this.write(key, String(next));
            return next;
        },
        /** Świeże liczniki zadania dla karty — z tego samego powodu co freshCount. */
        freshTaskCounter(taskId, tabKey, fallback) {
            if (this.writeFailed) return fallback;
            try {
                const raw = localStorage.getItem(this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER + taskId + '_' + tabKey));
                return this.parseTaskCounterValue(raw);
            } catch { return fallback; }
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
        /** Zapis zadań scalony z magazynem — patrz TaskManager.merge (audyt D1). */
        saveTasks() {
            const key = this.getKey(CONFIG.STORAGE_KEY_TASKS);
            let stored;
            try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch { stored = null; }
            // Czyści się tylko to, co przyszło z magazynu: własne zadania zostają
            // tymi samymi obiektami, bo trzymają je wołający (TaskManager.active()).
            if (stored && Array.isArray(stored.list)) stored.list = this.cleanTasks(stored.list);
            const merged = TaskManager.merge(stored);
            TaskManager.adopt(merged);
            this.write(key, JSON.stringify(merged));
        },
        /** Klucze liczników danego zadania w magazynie — także cudzych kart. */
        storedTaskTabs(taskId) {
            const prefix = this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER);
            const tabs = [];
            try {
                for (const key of Object.keys(localStorage)) {
                    if (!key.startsWith(prefix)) continue;
                    const parsed = this.parseTaskCounterKey(key.substring(CONFIG.SCRIPT_ID_PREFIX.length));
                    if (parsed && parsed.taskId === taskId) tabs.push(parsed.tabKey);
                }
            } catch (e) { Utils.error('Nie udało się przejrzeć kluczy zadań', e); }
            return tabs;
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
         *
         * 1.3.3: z JEDNYM wyjątkiem. Karta nierozpoznana ma identyfikator
         * `unknownTabInstance_abc_def` — też z podkreśleniami — i podział po
         * ostatnim dawał kartę `def` i zadanie, którego nie ma. Po F5 paczki
         * takiej karty znikały z zadań, a pierwsza poprawka w panelu zerowała
         * licznik karty (syncTabCounters bierze sumę zadań za prawdę). Dlatego
         * najpierw szuka się przedrostka karty nierozpoznanej — w identyfikatorze
         * zadania on nie wystąpi — a dopiero potem ostatniego podkreślenia.
         * Format klucza się nie zmienia, stare zapisy czytają się tak samo.
         */
        parseTaskCounterKey(localKey) {
            const rest = localKey.substring(CONFIG.STORAGE_PREFIX_TASK_COUNTER.length);
            const unknownAt = rest.indexOf('_' + CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX);
            const cut = unknownAt > 0 ? unknownAt : rest.lastIndexOf('_');
            if (cut <= 0 || cut === rest.length - 1) return null;
            return { taskId: rest.substring(0, cut), tabKey: rest.substring(cut + 1) };
        },
        /**
         * Licznik z magazynu: liczba całkowita od zera do CONFIG.COUNTER_MAX.
         * Magazyn jest wspólny z T-REX i można go edytować ręcznie — ujemne,
         * ułamki i liczby na dwadzieścia cyfr nie mają prawa dojść do ekranu.
         */
        parseCount(raw) {
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n > 0 ? Math.min(n, CONFIG.COUNTER_MAX) : 0;
        },
        /** Wartość licznika zadania z magazynu; śmieć czyta się jako zera. */
        parseTaskCounterValue(raw) {
            const parts = String(raw == null ? '' : raw).split(',');
            const num = (i) => this.parseCount(parts[i]);
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
        /**
         * Sprzątanie to pierwsze wywołania w Main.init() i jedyne, które nie
         * są potrzebne do liczenia. Własny try (1.3.3): magazyn, który odmawia
         * nawet odczytu listy kluczy, nie może zatrzymać startu — śmieci po
         * poprzednich wersjach poczekają do następnego uruchomienia.
         */
        purgeLegacySharedKeys() {
            try {
                (CONFIG.LEGACY_SHARED_KEYS || []).forEach(k => {
                    const full = CONFIG.SHARED_ID_PREFIX + k;
                    if (localStorage.getItem(full) !== null) {
                        localStorage.removeItem(full);
                        Utils.log(`Usunięto klucz odwołanej funkcji: ${full}`);
                    }
                });
            } catch (e) { Utils.error('Sprzątanie kluczy odwołanych funkcji pominięte', e); }
        },
        /** Czyści klucze poprzednich wersji (ważne na maszynach bez resetu sesji). */
        purgeLegacyKeys() {
            try {
                const stale = Object.keys(localStorage).filter(k =>
                    CONFIG.LEGACY_ID_PREFIXES.some(p => k.startsWith(p)));
                stale.forEach(k => localStorage.removeItem(k));
                if (stale.length) Utils.log(`Usunięto kluczy poprzednich wersji: ${stale.length}`);
            } catch (e) { Utils.error('Sprzątanie kluczy poprzednich wersji pominięte', e); }
        },
        /**
         * @param {boolean} fromRemote - true, jeśli wczytanie wywołało zdarzenie
         *   'storage' z innej karty. Wtedy na chwilę wyciszamy autozapis, inaczej
         *   karty zaczynają w nieskończoność przepisywać sobie stan nawzajem.
         */
        loadAll(fromRemote = false) {
            try {
                for (const [name, storageKey] of [['userConfig', CONFIG.STORAGE_KEY_USER_CONFIG],
                                                  ['sessionConfig', CONFIG.STORAGE_KEY_SESSION_CONFIG]]) {
                    const raw = localStorage.getItem(this.getKey(storageKey));
                    if (!fromRemote) {
                        // Start: magazyn na wierzch wartości domyślnych, a to,
                        // co w nim leżało, staje się podstawą przyszłych scaleń.
                        let stored;
                        try { stored = JSON.parse(raw || 'null'); } catch { stored = null; }
                        if (Utils.isObject(stored)) Object.assign(store[name], Utils.deepMerge(store[name], stored));
                        this._synced[name] = Utils.isObject(stored) ? stored : {};
                        continue;
                    }
                    // Zdarzenie z sąsiedniej karty: jej stan, a na wierzch nasze
                    // niezapisane zmiany — autozapis dopisze je do magazynu.
                    const { stored, merged } = this._mergeShared(name, raw);
                    if (!stored) continue;
                    this._adoptShared(name, merged);
                    this._synced[name] = stored;
                }

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
                        store.tabCounters[tabKey] = this.parseCount(localStorage.getItem(key));
                    } else if (key && key.startsWith(soldPrefix)) {
                        const tabKey = key.substring(soldPrefix.length);
                        store.tabSold[tabKey] = this.parseCount(localStorage.getItem(key));
                    } else if (key && key.startsWith(neutralPrefix)) {
                        const tabKey = key.substring(neutralPrefix.length);
                        store.tabNeutral[tabKey] = this.parseCount(localStorage.getItem(key));
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
            const list = this.cleanTasks(parsed && Array.isArray(parsed.list) ? parsed.list : []);
            const activeId = parsed && typeof parsed.activeId === 'string' ? parsed.activeId : null;
            TaskManager.adopt({
                list,
                activeId: list.some(t => t.id === activeId) ? activeId : (list.length ? list[list.length - 1].id : null),
                activeAt: parsed && Number.isFinite(parsed.activeAt) ? parsed.activeAt : 0,
                removed: parsed && Utils.isObject(parsed.removed) ? parsed.removed : {},
            });
        },
        /** Zadania z magazynu: tylko poprawne pola, odcinki przez cleanSegments. */
        cleanTasks(raw) {
            return raw
                .filter(t => t && typeof t.id === 'string' && Array.isArray(t.segments) && t.segments.length)
                .map(t => ({
                    id: t.id,
                    name: String(t.name || CONFIG.DEFAULT_TASK_NAME).slice(0, CONFIG.TASK_MAX_NAME_LEN),
                    segments: this.cleanSegments(t.segments),
                    updated: Number.isFinite(t.updated) ? t.updated : 0,
                }));
        },
        /**
         * Odcinki zadania z magazynu (1.3.3, audyt E6, F11). JSON przepuszcza
         * `1e999`, czyli nieskończoność, a ręczna edycja — zero, liczby ujemne
         * i daty z przyszłości: na ekranie wychodziło „Infinityg NaNm”.
         *
         * Odcinek poprawny: początek skończony, dodatni, nie w przyszłości;
         * koniec pusty albo nie wcześniej niż początek. Resztę się pomija.
         * Zadanie, któremu nie zostało nic, NIE znika — dostaje zamknięty
         * odcinek zerowej długości. Jego paczki leżą pod osobnymi kluczami
         * i bez zadania wypadłyby z sumy, a panel wyzerowałby licznik karty.
         */
        cleanSegments(raw) {
            const now = Date.now();
            const ok = (Array.isArray(raw) ? raw : [])
                .filter(seg => seg && Number.isFinite(seg.from) && seg.from > 0 && seg.from <= now)
                .map(seg => ({ from: seg.from, to: Number.isFinite(seg.to) ? seg.to : null }))
                .filter(seg => seg.to === null || seg.to >= seg.from);
            return ok.length ? ok : [{ from: now, to: now }];
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
                // 1.3.3 (audyt D7): wartość bierze się z magazynu TERAZ, a nie
                // z `e.newValue`. Zdarzenie niesie wartość z chwili cudzego
                // zapisu — gdy między nim a doręczeniem ta karta sama zapisała
                // nowszą, stare `newValue` cofało jej pamięć o paczkę.
                const current = localStorage.getItem(e.key);
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
                    const val = this.parseCount(current);
                    if (store.tabCounters[tabKey] !== val) store.tabCounters[tabKey] = val;
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_SOLD)) {
                    // Licznik sprzedanych sąsiedniej karty — potrzebny liniom 2 i 7,
                    // które liczą procent po WSZYSTKICH kartach naraz.
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_SOLD.length);
                    const val = this.parseCount(current);
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
                        byTab[parsed.tabKey] = this.parseTaskCounterValue(current);
                        store.taskCounters = { ...store.taskCounters, [parsed.taskId]: byTab };
                    }
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL)) {
                    // Audyty sąsiedniej karty — z tego samego powodu: bez nich
                    // linie 2 i 7 policzyłyby procent z za dużego mianownika.
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL.length);
                    const val = this.parseCount(current);
                    if (store.tabNeutral[tabKey] !== val) store.tabNeutral[tabKey] = val;
                } else if (!store.uiFlags.isSettingsPanelVisible) {
                    this.debouncedLoad();
                }
            };
            window.addEventListener('storage', this.onStorage);
        },
        debouncedLoad: Utils.debounce(function() { StorageManager.loadAll(true); }, 300)
    };
