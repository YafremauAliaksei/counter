    // ==========================================
    // 5b. SESSION RESET (reset między zmianami)
    // ==========================================
    /**
     * Na części stacji roboczych (Windows, logowanie na własne konto) sesja
     * przeglądarki NIE jest resetowana między zmianami, więc localStorage wnosi
     * do nowej zmiany liczniki poprzedniej. Zmiana trwa 10,5 h, więc wszelkie
     * dane dotyczące innej zmiany trzeba wyrzucić — inaczej wskaźnik
     * „przedmiotów na godzinę” liczy się od cudzego czasu startu i kłamie.
     */
    const SessionReset = {
        /**
         * Ostatni reset: {kind, reason}. Notifier pokazuje go, gdy UI jest gotowy.
         *
         * 8.3.0: wcześniej leżał tu tylko łańcuch przyczyny, a Notifier przy
         * KAŻDYM resecie pokazywał „Wykryto nową zmianę”. W efekcie przycisk
         * „Zresetuj tylko liczniki” informował człowieka o nieistniejącej zmianie.
         * Teraz rodzaj resetu przychodzi osobnym polem i tłumaczy się normalnie.
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

            // Licznik sprzedanych żyje dokładnie tyle samo, co zwykły licznik:
            // procent sprzedaży opisuje JEDNĄ zmianę, więc zostawienie go przez
            // granicę zmiany dałoby liczbę z cudzego dnia.
            const prefixes = [
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER),
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD),
                StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL),
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

            // 8.4.0: dziennik wartości żyje dokładnie tyle samo, co liczniki —
            // to ta sama ewidencja, tylko w pieniądzach. Podsumowania odchodzącej
            // zmiany przed czyszczeniem idą do archiwum, więc historia nie ginie.
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
         * Sprawdzenie asekuracyjne przy starcie: zapisany początek zmiany jest
         * starszy niż 12 h. Działa nawet w tych przerwach, gdy bieżącej zmiany
         * jeszcze nie da się rozpoznać (17:55-18:19 i 05:55-06:19) — wtedy
         * porównać zmian ze sobą się nie da.
         */
        checkStaleOnBoot() {
            const start = store.sessionConfig.shiftCalculatedStartTime;
            if (!start || Date.now() - start <= CONFIG.STALE_SESSION_MS) return false;

            const ageH = ((Date.now() - start) / 3600000).toFixed(1);
            store.sessionConfig.shiftType = null;
            store.sessionConfig.shiftCalculatedStartTime = null;
            store.sessionConfig.selectedLunchIndex = null;
            this.resetItemData(`dane zmiany są przeterminowane (${ageH} h temu)`, 'stale');
            return true;
        }
    };

    const ShiftManager = {
        update() {
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

            // 8.1.0: w „martwej strefie” między zmianami (17:55-18:19 / 05:55-06:19)
            // NIE zerujemy zapisanej zmiany. Wcześniej kasowało to czas startu
            // i temu, kto został po 05:00, statystyka nagle się zerowała.
            // Przy okazji zostaje kotwica do sprawdzenia przeterminowanych danych.
            if (!sType) return;

            const newStart = sTime.getTime();
            const oldStart = store.sessionConfig.shiftCalculatedStartTime;
            const oldType = store.sessionConfig.shiftType;

            const sameShift = oldType === sType
                && typeof oldStart === 'number'
                && Math.abs(newStart - oldStart) < CONFIG.SHIFT_IDENTITY_TOLERANCE_MS;

            // Ta sama zmiana — wychodzimy, nie ruszając wybranej przez człowieka
            // przerwy. (W 8.0.0 wybór przerwy kasował się przy każdym przeliczeniu.)
            if (sameShift) return;

            // Zmiana RÓŻNI SIĘ od zapisanej, a zapisana istniała — czyli na tej
            // maszynie zostały dane poprzedniej zmiany. Kluczowy przypadek:
            // zmiana dzienna zaczęła się o 06:30, a o 18:21 przy tym samym
            // komputerze siada zmiana nocna. Różnica to ledwie 11 h 51 min,
            // próg 12 h jej nie złapie, a porównanie czasu startu — łapie.
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
        getWorkTime() {
            if (!store.sessionConfig.shiftCalculatedStartTime) return { workedMs: 0, lunchMs: 0 };
            const now = Date.now();
            const start = store.sessionConfig.shiftCalculatedStartTime;
            const elapsed = Math.max(0, now - start);
            let lunchMs = 0;

            const idx = store.sessionConfig.selectedLunchIndex;
            if (idx !== null && CONFIG.LUNCH_OPTIONS_BASE[idx]) {
                const opt = CONFIG.LUNCH_OPTIONS_BASE[idx];
                const shiftDate = new Date(start);

                const lStartObj = Utils.timeStringToDate(opt.start, shiftDate, opt.type==='night' && parseInt(opt.start.substring(0,2)) < 12 && shiftDate.getHours() >= 12);
                const lEndObj = Utils.timeStringToDate(opt.end, shiftDate, opt.type==='night' && parseInt(opt.end.substring(0,2)) < 12 && shiftDate.getHours() >= 12);

                if (lEndObj < lStartObj) lEndObj.setDate(lEndObj.getDate() + 1);

                const aStart = Math.max(start, lStartObj.getTime());
                const aEnd = Math.min(now, lEndObj.getTime());
                if (aEnd > aStart) lunchMs = aEnd - aStart;
            }
            return { workedMs: Math.max(0, elapsed - lunchMs), lunchMs };
        }
    };
