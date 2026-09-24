    // ==========================================
    // 5b. SESSION RESET (reset między zmianami)
    // ==========================================
    /**
     * Na części stanowisk (Windows, własne konto) sesja przeglądarki nie jest
     * resetowana między zmianami i localStorage wnosi do nowej zmiany liczniki
     * poprzedniej. Dane innej zmiany trzeba wyrzucić — inaczej tempo liczy się
     * od cudzego czasu startu. Ustawienia wyglądu zostają.
     */
    const SessionReset = {
        /**
         * Ostatni reset: {kind, reason}. Notifier pokazuje go, gdy UI jest
         * gotowy; `kind` decyduje o komunikacie (nowa zmiana, dane
         * przeterminowane, reset ręczny).
         */
        lastReset: null,

        /**
         * Zeruje wszystko, co dotyczy przetworzonych przedmiotów. Ustawienia
         * wyglądu zostają.
         * @param {string} reason — tekst do konsoli (diagnostyka).
         * @param {'shift'|'stale'|'manual'} kind — co pokazać człowiekowi.
         */
        resetItemData(reason, kind = 'shift') {
            Utils.log(`[RESET] Kasowanie danych o przedmiotach. Powód: ${reason}`);
            this.lastReset = { kind, reason };

            // Wszystko, co opisuje jedną zmianę: liczniki paczek, sprzedanych
            // i spoza mianownika oraz zadania z ich licznikami.
            const prefixes = [
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER),
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD),
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL),
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER),
                StorageManager.getKey(CONFIG.STORAGE_KEY_TASKS),
            ];
            Object.keys(localStorage)
                .filter(k => prefixes.some(p => k.startsWith(p)))
                .forEach(k => {
                    delete StorageManager._lastWritten[k];
                    localStorage.removeItem(k);
                });

            Object.keys(store.tabCounters).forEach(k => { store.tabCounters[k] = 0; });
            Object.keys(store.tabSold).forEach(k => { store.tabSold[k] = 0; });
            Object.keys(store.tabNeutral).forEach(k => { store.tabNeutral[k] = 0; });
            // Lista zadań wstaje od zera: TaskManager.init() postawi zadanie
            // domyślne, zaczynające się razem z nową zmianą.
            store.tasks = [];
            store.activeTaskId = null;
            store.taskCounters = {};
            TaskManager.init();

            // Dziennik wartości to ta sama ewidencja w pieniądzach. Podsumowanie
            // odchodzącej zmiany trafia przed czyszczeniem do archiwum.
            ValueLog.reset(reason);

            this.pruneTabInstances(true);
            StorageManager.saveState();
            bus.emit('session:reset', { reason, kind });
        },

        /**
         * Czyści rejestr aktywnych kart i osierocone wpisy kart UNKNOWN.
         * @param {boolean} dropAll - wyrzucić wszystkie wpisy poza bieżącą kartą.
         */
        pruneTabInstances(dropAll = false) {
            const current = store.currentTabInstanceId;
            const cutoff = Date.now() - CONFIG.TAB_INSTANCE_TTL_MS;
            const instances = store.sessionConfig.activeTabInstances || {};

            const kept = {};
            Object.keys(instances).forEach(id => {
                const ts = instances[id];
                if (id === current) return;
                if (!dropAll && typeof ts === 'number' && ts > cutoff) kept[id] = ts;
            });
            if (current) kept[current] = Date.now();
            store.sessionConfig.activeTabInstances = kept;

            // Wpisów znanych działów (CRET/REFURB/WHD) nie ruszamy nigdy —
            // czyścimy wyłącznie wygenerowane id kart bezimiennych.
            const alive = new Set(Object.keys(kept));
            const isOrphan = (id) => id.startsWith(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX) && !alive.has(id);

            Object.keys(store.userConfig.customTabSettings).forEach(id => {
                if (isOrphan(id)) delete store.userConfig.customTabSettings[id];
            });

            const allLocalsKey = StorageManager.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS);
            try {
                const allLocals = JSON.parse(localStorage.getItem(allLocalsKey) || "{}");
                let changed = false;
                Object.keys(allLocals).forEach(id => {
                    if (id === 'null' || isOrphan(id)) { delete allLocals[id]; changed = true; }
                });
                if (changed) StorageManager.write(allLocalsKey, JSON.stringify(allLocals));
            } catch (e) { Utils.error('pruneTabInstances: nie udało się rozebrać allLocalTabConfigs', e); }
        },

        /**
         * Sprawdzenie przy starcie: zapisany początek zmiany starszy niż 12 h
         * znaczy dane z poprzedniej zmiany. Działa także w martwej strefie
         * (17:55–18:19 i 05:55–06:19), gdy bieżącej zmiany nie da się
         * rozpoznać i porównać.
         */
        checkStaleOnBoot() {
            const start = store.sessionConfig.shiftCalculatedStartTime;
            if (!start || Date.now() - start <= CONFIG.STALE_SESSION_MS) return false;

            // Zegar ścienny wskazuje wciąż tę samą zmianę — dane nie są
            // przeterminowane, choćby minęło ponad 12 h. Tak jest w październikową
            // noc zmiany czasu: 18:30 CEST → 05:55 CET to 12,42 h.
            const current = ShiftManager.currentShift();
            if (current && current.start === start) return false;

            const ageH = ((Date.now() - start) / 3600000).toFixed(1);
            store.sessionConfig.shiftType = null;
            store.sessionConfig.shiftCalculatedStartTime = null;
            store.sessionConfig.selectedLunchIndex = null;
            this.resetItemData(`dane zmiany są przeterminowane (${ageH} h temu)`, 'stale');
            return true;
        }
    };

    const ShiftManager = {
        /**
         * Zmiana, która trwa teraz według zegara ściennego: `{type, start}`,
         * albo null w martwej strefie (17:55–18:19 i 05:55–06:19).
         *
         * Wspólne dla update() i checkStaleOnBoot(), żeby oba odpowiadały na
         * pytanie „która zmiana trwa” tak samo.
         */
        currentShift() {
            const now = new Date();
            const minutes = now.getHours() * 60 + now.getMinutes();
            const ST = CONFIG.SHIFT_TIMES_LOCAL;
            const CST = CONFIG.DEFAULT_CALCULATION_START_TIMES;

            const dStart = ST.DAY_SHIFT_START_H * 60 + ST.DAY_SHIFT_START_M;
            const dEnd = ST.DAY_SHIFT_END_H * 60 + ST.DAY_SHIFT_END_M;
            const nStart = ST.NIGHT_SHIFT_START_H * 60 + ST.NIGHT_SHIFT_START_M;
            const nEnd = ST.NIGHT_SHIFT_END_H * 60 + ST.NIGHT_SHIFT_END_M;

            let sType = null;
            const sTime = new Date(now);

            if (minutes >= dStart && minutes < dEnd) {
                sType = 'day'; sTime.setHours(CST.DAY.H, CST.DAY.M, 0, 0);
            } else if (
                (nStart > nEnd && (minutes >= nStart || minutes < nEnd)) ||
                (nStart < nEnd && (minutes >= nStart && minutes < nEnd))
            ) {
                sType = 'night'; sTime.setHours(CST.NIGHT.H, CST.NIGHT.M, 0, 0);
                if (now.getHours() < 12 && CST.NIGHT.H >= 12) sTime.setDate(now.getDate() - 1);
            }

            return sType ? { type: sType, start: sTime.getTime() } : null;
        },

        update() {
            const current = this.currentShift();

            // W martwej strefie między zmianami zapisana zmiana zostaje: kto
            // pracuje po 05:55, nie traci statystyki, a sprawdzenie
            // przeterminowanych danych ma do czego się odnieść.
            if (!current) return;

            const sType = current.type;
            const sTime = new Date(current.start);
            const newStart = current.start;
            const oldStart = store.sessionConfig.shiftCalculatedStartTime;
            const oldType = store.sessionConfig.shiftType;

            const sameShift = oldType === sType
                && typeof oldStart === 'number'
                && Math.abs(newStart - oldStart) < CONFIG.SHIFT_IDENTITY_TOLERANCE_MS;

            // Ta sama zmiana — wychodzimy, nie ruszając wybranej przez
            // człowieka przerwy.
            if (sameShift) return;

            // Zmiana różni się od zapisanej, a zapisana istniała — na maszynie
            // zostały dane poprzedniej zmiany. Np. dzienna od 06:30, a o 18:21
            // siada nocna: to 11 h 51 min, próg 12 h tego nie złapie,
            // porównanie początku zmiany — tak.
            const isShiftRollover = typeof oldStart === 'number' && oldStart !== newStart;

            store.sessionConfig.shiftType = sType;
            store.sessionConfig.shiftCalculatedStartTime = newStart;
            store.sessionConfig.selectedLunchIndex = sType === 'day'
                ? CONFIG.DEFAULT_LUNCH_INDEX_DAY
                : CONFIG.DEFAULT_LUNCH_INDEX_NIGHT;

            if (isShiftRollover) {
                const prev = new Date(oldStart);
                SessionReset.resetItemData(
                    `zaczęła się nowa zmiana (${sType}, start ${Utils.formatTime(sTime, false, ':')}); ` +
                    `poprzednia startowała ${Utils.formatTime(prev, false, ':')}`
                );
            } else {
                SessionReset.pruneTabInstances(false);
            }

            StorageManager.saveState();
        },
        /**
         * Ile z odcinka [from, to] zajęła przerwa obiadowa. Wspólne dla czasu
         * zmiany i czasu zadań, żeby obie strony odejmowały to samo — kto nie
         * zatrzymał zadania na obiad, nie dostaje pół godziny pracy, której
         * nie było.
         */
        lunchOverlapMs(from, to) {
            const idx = store.sessionConfig.selectedLunchIndex;
            const opt = idx !== null && CONFIG.LUNCH_OPTIONS_BASE[idx];
            if (!opt || !(to > from)) return 0;

            const shiftDate = new Date(store.sessionConfig.shiftCalculatedStartTime || from);
            const lStartObj = Utils.timeStringToDate(opt.start, shiftDate, opt.type==='night' && parseInt(opt.start.substring(0,2)) < 12 && shiftDate.getHours() >= 12);
            const lEndObj = Utils.timeStringToDate(opt.end, shiftDate, opt.type==='night' && parseInt(opt.end.substring(0,2)) < 12 && shiftDate.getHours() >= 12);
            if (lEndObj < lStartObj) lEndObj.setDate(lEndObj.getDate() + 1);

            const aStart = Math.max(from, lStartObj.getTime());
            const aEnd = Math.min(to, lEndObj.getTime());
            return aEnd > aStart ? aEnd - aStart : 0;
        },
        getWorkTime() {
            if (!store.sessionConfig.shiftCalculatedStartTime) return { workedMs: 0, lunchMs: 0 };
            const now = Date.now();
            const start = store.sessionConfig.shiftCalculatedStartTime;
            const elapsed = Math.max(0, now - start);
            const lunchMs = this.lunchOverlapMs(start, now);
            return { workedMs: Math.max(0, elapsed - lunchMs), lunchMs };
        }
    };
