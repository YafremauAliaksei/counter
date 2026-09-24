    const SettingsPanel = {
        init() {
            this.el = h('div', {
                id: 'settingsPanel',
                style: {
                    position: 'fixed', top: '10px', right: '10px', width: `${store.userConfig.settingsPanelWidth}px`,
                    height: 'calc(100vh - 30px)', backgroundColor: CONFIG.SETTINGS_PANEL_BACKGROUND_COLOR,
                    color: CONFIG.SETTINGS_PANEL_TEXT_COLOR, border: `1px solid ${CONFIG.SETTINGS_PANEL_ACCENT_COLOR}`,
                    zIndex: '2147483646', overflowY: 'auto', padding: '15px', paddingLeft: '25px', display: 'none',
                    boxShadow: '-2px 0 5px rgba(0,0,0,0.2)', transition: 'transform 0.2s', transform: 'translateX(110%)'
                }
            });
            document.body.appendChild(this.el);

            /**
             * Przyciski przeciągania pokazują stan flag `uiFlags.*Dragging`,
             * a flagi zdejmuje nie tylko kliknięcie, ale też dragger po
             * puszczeniu myszy i reset pozycji. Panel przerysowuje się więc na
             * każdą zmianę flagi — inaczej przycisk świeciłby „przeciąganie
             * włączone” przy wyłączonym trybie.
             *
             * Subskrypcja w init(), a nie w render(), bo render() woła się przy
             * każdej zmianie ustawienia i subskrypcje by się mnożyły.
             */
            bus.on('store:changed:uiFlags.isStatsWindowDragging', () => this.rerender());
            bus.on('store:changed:uiFlags.isPriceCardDragging', () => this.rerender());
        },
        /**
         * Odroczone przerysowanie. render() zaczyna od `innerHTML = ''`, czyli
         * zdejmuje także element, który właśnie wysyła zdarzenie — dlatego
         * obsługi kontrolek wołają rerender(), który wychodzi poza bieżące
         * zdarzenie i skleja kilka próśb w jedno przerysowanie.
         */
        rerender() {
            clearTimeout(this._rerenderTimer);
            this._rerenderTimer = setTimeout(() => {
                if (store.uiFlags.isSettingsPanelVisible) this.render();
            }, 0);
        },
        toggle() {
            store.uiFlags.isSettingsPanelVisible = !store.uiFlags.isSettingsPanelVisible;
            if (store.uiFlags.isSettingsPanelVisible) {
                this.render();
                this.el.style.display = 'block';
                setTimeout(() => this.el.style.transform = 'translateX(0)', 10);
            } else {
                this.el.style.transform = 'translateX(110%)';
                StorageManager.saveState();
                setTimeout(() => this.el.style.display = 'none', 200);
            }
        },
        /**
         * SEKCJA ZADAŃ — jedyna część panelu otwierana w trakcie pracy, więc
         * stoi na górze; reszta (wygląd, kolory, skróty) ustawia się raz.
         *
         * Obok siebie stoją trzy rzeczy robione szybko: przełączenie procesu,
         * poprawa jego początku i wpisanie liczb po awarii maszyny — każda
         * w dwóch-trzech kliknięciach.
         */
        buildTasksSection() {
            const sec = UIBuilder.section(I18n.get('section_tasks'));
            const task = TaskManager.active();
            const cid = store.currentTabInstanceId;
            sec.appendChild(UIBuilder.hint(I18n.get('tasks_hint')));

            if (task) {
                // --- nazwa bieżącego zadania ---
                sec.appendChild(UIBuilder.row(I18n.get('tasks_name'), h('input', {
                    type: 'text', value: task.name, maxLength: CONFIG.TASK_MAX_NAME_LEN,
                    onChange: (e) => { TaskManager.rename(task.id, e.target.value); this.rerender(); },
                    style: { flexGrow: '1', padding: '4px' },
                })));

                // --- początek bieżącego odcinka ---
                // Skróty w minutach wstecz zamiast list godzin i minut: człowiek
                // siada do skryptu zwykle kilka minut po faktycznym starcie.
                // Kontrolki przestawiają początek całego zadania, a nie
                // ostatniego odcinka — „to zadanie zaczęło się o X”
                // (TaskManager.setStart).
                const startedAt = TaskManager.span(task).from;
                const quick = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } });
                CONFIG.TASK_QUICK_OFFSETS_MIN.forEach(min => {
                    quick.appendChild(UIBuilder.button(
                        min === 0 ? I18n.get('tasks_now') : I18n.get('tasks_minutesBack', { value: min }),
                        () => { TaskManager.setStart(task.id, Date.now() - min * 60000); this.rerender(); },
                        { padding: '4px 8px', marginTop: '0' }));
                });
                if (store.sessionConfig.shiftCalculatedStartTime) {
                    quick.appendChild(UIBuilder.button(I18n.get('tasks_shiftStart'), () => {
                        TaskManager.setStart(task.id, store.sessionConfig.shiftCalculatedStartTime);
                        this.rerender();
                    }, { padding: '4px 8px', marginTop: '0' }));
                }
                sec.appendChild(UIBuilder.row(I18n.get('tasks_startedAt'), quick));
                sec.appendChild(UIBuilder.row('', h('input', {
                    type: 'text', value: Utils.formatClock(startedAt), placeholder: 'HH:MM',
                    onChange: (e) => {
                        const ms = TaskManager.parseClock(e.target.value);
                        if (ms !== null) TaskManager.setStart(task.id, ms);
                        this.rerender();
                    },
                    style: { width: '70px', padding: '4px', textAlign: 'center' },
                })));

                // --- paczki i tempo: dwa pola opisujące to samo ---
                // Wpisuje się jedno, drugie przelicza się samo. Po wpisaniu
                // tempa pokazuje się wartość osiągalna przy całych paczkach:
                // przy 1:17 pracy „118” to 151 paczek, czyli 117,7 na godzinę.
                const totals = TaskManager.totals(task);
                sec.appendChild(UIBuilder.row(I18n.get('tasks_packages'), UIBuilder.numberInput(totals.done, v => {
                    TaskManager.applyTaskTotal(task, cid, v);
                    this.syncTabCounters(cid);
                    this.rerender();
                })));
                sec.appendChild(UIBuilder.row(I18n.get('tasks_rate'), h('input', {
                    type: 'number', min: 0, step: '0.1', value: TaskManager.rate(task).toFixed(1),
                    onChange: (e) => {
                        const applied = TaskManager.setRate(task, parseFloat(e.target.value), cid);
                        if (applied !== null) this.syncTabCounters(cid);
                        this.rerender();
                    },
                    style: { width: '80px', padding: '4px', textAlign: 'right' },
                })));
                sec.appendChild(UIBuilder.row(I18n.get('tasks_summary'), h('span', {
                    textContent: `${TaskManager.percent(task)}% · ${Utils.formatDuration(TaskManager.workedMs(task))}`,
                })));

                // --- przyciski ---
                const running = TaskManager.isRunning(task);
                sec.appendChild(UIBuilder.button(
                    running ? I18n.get('tasks_pause') : I18n.get('tasks_unpause'),
                    () => {
                        if (running) TaskManager.pause();
                        else TaskManager.resume(task.id, Date.now());
                        this.rerender();
                    },
                    { width: '100%', marginTop: '8px', ...(running ? {} : { background: '#e0a800', color: '#141414' }) }));
            }

            // --- nowe zadanie ---
            const nameInput = h('input', {
                type: 'text', placeholder: I18n.get('tasks_newPlaceholder'), maxLength: CONFIG.TASK_MAX_NAME_LEN,
                style: { flexGrow: '1', padding: '4px' },
            });
            const newRow = h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } });
            newRow.appendChild(nameInput);
            newRow.appendChild(UIBuilder.button(I18n.get('tasks_new'), () => {
                TaskManager.create(nameInput.value, Date.now());
                this.rerender();
            }, { marginTop: '0', whiteSpace: 'nowrap' }));
            sec.appendChild(newRow);

            // --- historia zmiany ---
            // Dwie linie na zadanie i ani znaku więcej: kolumna panelu jest
            // wąska, a linia ucięta przez przeglądarkę nie mówi nic. Gdy liczby
            // przestaną się mieścić, poprawia się szerokość panelu, a nie treść.
            if (store.tasks.length) {
                sec.appendChild(h('div', {
                    textContent: I18n.get('tasks_history'),
                    style: { marginTop: '12px', fontWeight: 'bold', fontSize: '0.9em' },
                }));
            }
            store.tasks.forEach(t => {
                const isActive = t.id === store.activeTaskId;
                const tot = TaskManager.totals(t);
                const span = TaskManager.span(t);
                const box = h('div', {
                    style: {
                        borderLeft: `3px solid ${isActive ? CONFIG.SETTINGS_PANEL_ACCENT_COLOR : '#ccc'}`,
                        padding: '4px 0 4px 8px', marginTop: '6px', fontSize: '0.85em', lineHeight: '1.35',
                    },
                });
                const period = `${Utils.formatClock(span.from)}–${span.to === null ? I18n.get('tasks_ongoing') : Utils.formatClock(span.to)}`;
                box.appendChild(h('div', {
                    textContent: `${t.name} · ${period} (${Utils.formatDuration(TaskManager.workedMs(t))})`,
                    style: { fontWeight: isActive ? 'bold' : 'normal' },
                }));
                box.appendChild(h('div', {
                    textContent: `${tot.done} · ${TaskManager.rate(t).toFixed(1)}${I18n.get('statsPerHourUnit')} · ${TaskManager.percent(t)}%`,
                }));
                const buttons = h('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } });
                if (!isActive) {
                    buttons.appendChild(UIBuilder.button(I18n.get('tasks_resume'), () => {
                        TaskManager.resume(t.id, Date.now());
                        this.rerender();
                    }, { padding: '2px 8px', marginTop: '0', fontSize: '0.9em' }));
                }
                if (store.tasks.length > 1) {
                    buttons.appendChild(UIBuilder.button(I18n.get('tasks_delete'), () => {
                        if (!confirm(I18n.get('tasks_deleteConfirm', { name: t.name }))) return;
                        TaskManager.remove(t.id);
                        this.syncTabCounters(cid);
                        this.rerender();
                    }, { padding: '2px 8px', marginTop: '0', fontSize: '0.9em', background: '#d9534f' }));
                }
                if (buttons.childNodes.length) box.appendChild(buttons);
                sec.appendChild(box);
            });
            return sec;
        },

        /**
         * Liczniki karty po zmianie w zadaniach.
         *
         * Suma zadań jest źródłem prawdy w jedną stronę: to ona właśnie się
         * zmieniła, a licznik karty ma za nią nadążyć. Gdyby zostało po staremu,
         * linia 1 pokazywałaby inną liczbę niż linia 8 dla tej samej pracy.
         */
        syncTabCounters(tabKey) { TaskManager.syncShift(tabKey); },

        /**
         * LICZNIKI DZIAŁÓW — obok zadań, bo wpisanie liczby wprost („zrobiłem
         * dziś 180”) to sposób na powrót do pracy po awarii maszyny.
         */
        buildCountersSection() {
            const sec = UIBuilder.section(I18n.get('section_globalStats'));
            Object.values(CONFIG.KNOWN_TAB_TYPES).forEach(t => {
                const row = h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '5px', gap: '10px' } });
                row.appendChild(UIBuilder.checkbox(I18n.get('includeInGlobal_known', { tabName: I18n.get(t.displayNameKey) }), store.userConfig.globalStatsContributionKnown[t.key], v => store.userConfig.globalStatsContributionKnown[t.key] = v));
                row.appendChild(h('span', { textContent: I18n.get('settings_manualCounterInputLabel') + ':' }));
                // Różnicę bierze na siebie aktywne zadanie, razem z licznikiem
                // „poza mianownikiem” — kierunku wpisanych paczek nikt nie zna,
                // więc nie mają prawa ruszyć procentu sprzedaży.
                row.appendChild(UIBuilder.numberInput(store.tabCounters[t.key] || 0, v => {
                    TaskManager.applyManualTotal(t.key, v);
                    this.syncTabCounters(t.key);
                    this.rerender();
                }));
                sec.appendChild(row);
            });
            return sec;
        },

        render() {
            // Panel składa się od nowa, ale pozycja przewinięcia zostaje.
            const scrollTop = this.el.scrollTop;
            this.el.innerHTML = '';
            this.el.appendChild(h('h2', { textContent: I18n.get('settingsPanelTitle'), style: { textAlign: 'center', marginTop: '0' } }));

            // 0. Zadania i liczniki — na górze, jedyna sekcja używana w trakcie pracy.
            this.el.appendChild(this.buildTasksSection());
            this.el.appendChild(this.buildCountersSection());

            // 1. Ogólne
            const secGen = UIBuilder.section(I18n.get('section_general'));
            secGen.appendChild(UIBuilder.row(I18n.get('language'), UIBuilder.select(CONFIG.AVAILABLE_LANGUAGES.map(l => ({ value: l.code, text: l.name })), store.userConfig.language, v => { store.userConfig.language = v; this.rerender(); })));
            // Pełny reset usuwa wyłącznie klucze skryptu (ownKeys) — resztę
            // localStorage tej domeny trzyma T-REX.
            secGen.appendChild(UIBuilder.button(I18n.get('settings_resetAllDataButton'), () => {
                if (!confirm(I18n.get('settings_resetConfirm'))) return;
                StorageManager.ownKeys().forEach(k => localStorage.removeItem(k));
                CONFIG.LEGACY_ID_PREFIXES.forEach(p => {
                    Object.keys(localStorage).filter(k => k.startsWith(p)).forEach(k => localStorage.removeItem(k));
                });
                sessionStorage.removeItem(StorageManager.getKey(CONFIG.SESSION_STORAGE_TAB_INSTANCE_ID_KEY));
                location.reload();
            }, { background: '#d9534f', width: '100%', marginTop: '10px' }));

            // Reset samych liczników przedmiotów, bez utraty ustawień wyglądu.
            secGen.appendChild(UIBuilder.button(I18n.get('settings_resetCountersButton'), () => {
                if (!confirm(I18n.get('settings_resetCountersConfirm'))) return;
                SessionReset.resetItemData('ręczny reset z panelu ustawień', 'manual');
                this.rerender();
            }, { background: '#e0a800', color: '#141414', width: '100%', marginTop: '5px' }));
            this.el.appendChild(secGen);

            // 2. Nazwy własne zakładek
            if (store.currentTabType === CONFIG.UNKNOWN_TAB_TYPE_KEY) {
                const secCur = UIBuilder.section(I18n.get('section_currentTab', { tabInstanceId: store.currentTabInstanceId.substring(0, 8) + '...' }));
                const cust = store.userConfig.customTabSettings[store.currentTabInstanceId] || { displayName: store.currentTabInstanceId, includeInGlobal: true };
                secCur.appendChild(UIBuilder.row(I18n.get('customTabDisplayName'), h('input', { type: 'text', value: cust.displayName, onInput: e => {
                    store.userConfig.customTabSettings[store.currentTabInstanceId] = { ...cust, displayName: e.target.value };
                }, style: { flexGrow: '1', padding: '4px' } })));
                secCur.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('customTabIncludeInGlobal'), cust.includeInGlobal, v => {
                    // Zapis całym obiektem — wpisu dla karty może jeszcze nie być.
                    store.userConfig.customTabSettings[store.currentTabInstanceId] =
                        { ...store.userConfig.customTabSettings[store.currentTabInstanceId] || cust, includeInGlobal: v };
                })));
                this.el.appendChild(secCur);
            }

            // 3. Efekty wizualne
            const secVis = UIBuilder.section(I18n.get('section_visualAids', { tabName: I18n.getTabName(store.currentTabInstanceId) }));
            secVis.appendChild(UIBuilder.row('', ...UIBuilder.slider(0, CONFIG.MAX_PAGE_OVERLAY_OPACITY_PERCENT, store.localTabConfig.pageOverlayOpacity, v => store.localTabConfig.pageOverlayOpacity = v, v => I18n.get('overlayOpacity', { value: v }))));
            secVis.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('showPageIndicator'), store.localTabConfig.pageIndicatorTextVisible, v => store.localTabConfig.pageIndicatorTextVisible = v)));
            this.el.appendChild(secVis);

            // 4. Stylizacja okna statystyk
            const secWin = UIBuilder.section(I18n.get('section_statsWindow'));

            secWin.appendChild(UIBuilder.row(I18n.get('windowBgSettings'), UIBuilder.colorPickerWithAlpha(
                store.localTabConfig.statsWindowBgColorHex, store.localTabConfig.statsWindowBgAlpha,
                hex => store.localTabConfig.statsWindowBgColorHex = hex, alpha => store.localTabConfig.statsWindowBgAlpha = alpha
            )));

            const fontOpts = Object.keys(CONFIG.FONT_FAMILY_OPTIONS).map(k => ({ value: k, text: I18n.get(`fontFamily_${k}`) }));
            secWin.appendChild(UIBuilder.row(I18n.get('fontFamily'), UIBuilder.select(fontOpts, store.localTabConfig.statsWindowFontFamily, v => store.localTabConfig.statsWindowFontFamily = v)));

            // Ustawienia poszczególnych linii — rysowane dla WSZYSTKICH linii,
            // niezależnie od tego, czy są włączone.
            Object.keys(DEFAULT_LINE_CONFIG).forEach(lineKey => {
                const cfg = store.localTabConfig.linesConfig[lineKey];
                if (!cfg) return;
                const lineBox = h('div', { style: { border: '1px solid #ddd', padding: '8px', marginBottom: '8px', borderRadius: '4px' } });

                lineBox.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get(`lineSettings_${lineKey.split('_')[1]}`), cfg.visible, v => store.localTabConfig.linesConfig[lineKey].visible = v)));

                // Kolor, alfa i rozmiar są na stałe podpięte do DOM, niezależnie
                // od stanu checkboxa.
                lineBox.appendChild(UIBuilder.row('Color/Alpha', UIBuilder.colorPickerWithAlpha(
                    cfg.colorHex, cfg.alpha,
                    hex => store.localTabConfig.linesConfig[lineKey].colorHex = hex,
                    alpha => store.localTabConfig.linesConfig[lineKey].alpha = alpha
                )));
                lineBox.appendChild(UIBuilder.row('Size', ...UIBuilder.slider(8, 36, cfg.fontSize, v => store.localTabConfig.linesConfig[lineKey].fontSize = v, v => `${v}px`)));

                // Linia 6 koloruje się według znaczenia (plus zielony, minus
                // czerwony), więc picker steruje tam tylko częścią neutralną.
                // Bez podpisu wyglądałoby to jak niedziałające ustawienie.
                if (lineKey === 'line6_valueSum') {
                    lineBox.appendChild(UIBuilder.hint(I18n.get('lineSettings_valueSumHint')));
                }
                // Linia 7 jest celowo uboga w treść — warto powiedzieć wprost,
                // co znaczą te trzy liczby.
                if (lineKey === 'line7_compact') {
                    lineBox.appendChild(UIBuilder.hint(I18n.get('lineSettings_compactHint')));
                }
                // Linia 8 opisuje zadanie, a nie zmianę — bez tego zdania wygląda
                // jak powtórzenie linii 1 z innymi liczbami.
                if (lineKey === 'line8_taskInfo') {
                    lineBox.appendChild(UIBuilder.hint(I18n.get('lineSettings_taskInfoHint')));
                }

                // Obsługa wielokoloru dla linii 2 (podsumowanie globalne)
                if (lineKey === 'line2_globalSummary') {
                    const subBox = h('div', { style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #ccc' } });

                    subBox.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('multicolorMode'), cfg.multicolor, v => {
                        store.localTabConfig.linesConfig[lineKey].multicolor = v;
                        this.rerender(); // wymusza render, żeby przygasić pickery kolorów
                    })));

                    const colorRow = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '25px', opacity: cfg.multicolor ? '1' : '0.4', pointerEvents: cfg.multicolor ? 'auto' : 'none', transition: 'opacity 0.2s' } });
                    colorRow.appendChild(h('span', { textContent: I18n.get('tabColors'), style: { fontSize: '0.9em' } }));

                    Object.keys(CONFIG.KNOWN_TAB_TYPES).forEach(k => {
                        const cPickerWrapper = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } });
                        cPickerWrapper.appendChild(h('span', { textContent: k, style: { fontSize: '0.7em', color: '#666' } }));
                        cPickerWrapper.appendChild(h('input', {
                            type: 'color',
                            value: cfg.customColors[k] || CONFIG.KNOWN_TAB_TYPES[k].baseColorHex,
                            title: k,
                            style: { width: '26px', height: '26px', padding: '0', border: '1px solid #ccc', cursor: 'pointer', borderRadius: '4px' },
                            onChange: (e) => store.localTabConfig.linesConfig.line2_globalSummary.customColors[k] = e.target.value
                        }));
                        colorRow.appendChild(cPickerWrapper);
                    });

                    subBox.appendChild(colorRow);
                    lineBox.appendChild(subBox);
                }

                secWin.appendChild(lineBox);
            });

            const isDragActive = store.uiFlags.isStatsWindowDragging;
            const dragBtnText = isDragActive ? I18n.get('dragStatsWindowActiveButton') : I18n.get('dragStatsWindowButton');
            const dragBtnOverrides = isDragActive
                ? { background: '#FFA500', color: '#141414', outline: '2px solid #141414', fontWeight: 'bold' }
                : {};

            secWin.appendChild(UIBuilder.button(dragBtnText, () => {
                store.uiFlags.isStatsWindowDragging = !store.uiFlags.isStatsWindowDragging;
                this.rerender();
            }, { width: '100%', marginTop: '10px', transition: 'all 0.2s', ...dragBtnOverrides }));

            secWin.appendChild(UIBuilder.button(I18n.get('settings_resetWindowPositionButton'), () => {
                store.localTabConfig.statsWindowPosition = Utils.clone(DEFAULT_LOCAL_CONFIG.statsWindowPosition);
                // Pozycję nakłada renderer (applyPosition): okno bywa
                // przyklejone do dołu, a ustawienie tu samych top/left
                // zostawiłoby stare `bottom`.
                StatsWindowRenderer.applyPosition();
                if (store.uiFlags.isStatsWindowDragging) {
                    store.uiFlags.isStatsWindowDragging = false;
                }
                this.rerender();
            }, { width: '100%', marginTop: '5px' }));
            this.el.appendChild(secWin);

            // 6. Skróty klawiszowe
            const secKeys = UIBuilder.section(I18n.get('section_keyboardShortcuts'));
            const keyOpts = CONFIG.AVAILABLE_SHORTCUT_KEYS.map(k => ({ value: k.code, text: I18n.get(k.name_key) }));
            secKeys.appendChild(UIBuilder.row(I18n.get('incrementKey'), UIBuilder.select(keyOpts, store.userConfig.keyboardShortcuts.INCREMENT, v => store.userConfig.keyboardShortcuts.INCREMENT = v)));
            secKeys.appendChild(UIBuilder.row(I18n.get('decrementKey'), UIBuilder.select(keyOpts, store.userConfig.keyboardShortcuts.DECREMENT, v => store.userConfig.keyboardShortcuts.DECREMENT = v)));
            this.el.appendChild(secKeys);

            // 7. Autoinkrementacja
            const secAuto = UIBuilder.section(I18n.get('section_autoIncrement'));
            secAuto.appendChild(UIBuilder.row('', ...UIBuilder.slider(CONFIG.MIN_TRIGGER_DEBOUNCE_MS, CONFIG.MAX_TRIGGER_DEBOUNCE_MS, store.userConfig.triggerMutationDebounceMs, v => store.userConfig.triggerMutationDebounceMs = v, v => I18n.get('scanIntervalAutoIncrement', { value: v }))));
            this.el.appendChild(secAuto);

            /**
             * 7a. GŁÓWNY WYŁĄCZNIK MODUŁU CEN — przed kartą ceny i dziennikiem
             * wartości, bo rozstrzyga o obu. Póki jest wyłączony, sieć śpi.
             *
             * Kliknięcie tutaj (PriceModule.enable) to jedyne miejsce w pliku,
             * z którego rusza pierwsze zapytanie do sieci: kursy walut i cena
             * przedmiotu na ekranie.
             */
            const secModule = UIBuilder.section(I18n.get('priceModule_section'));
            const moduleOn = priceModuleOn();
            secModule.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                I18n.get('priceModule_enabled'), moduleOn,
                v => {
                    store.localTabConfig.priceCard.moduleEnabled = !!v;
                    if (v) PriceModule.enable();
                    else PriceModule.disable();
                    this.rerender();
                })));
            secModule.appendChild(UIBuilder.hint(I18n.get('priceModule_hint')));
            this.el.appendChild(secModule);

            if (!moduleOn) {
                // Dalszych sekcji nie ma: pokazane ustawienia karty sugerowałyby,
                // że przy wyłączonym module coś dzieje się w tle.
                const off = UIBuilder.section(I18n.get('priceCard_section'));
                off.appendChild(UIBuilder.hint(I18n.get('priceModule_offNotice')));
                this.el.appendChild(off);
            } else {

            // 7b. Karta ceny
            const secPrice = UIBuilder.section(I18n.get('priceCard_section'));
            const pc = store.localTabConfig.priceCard;

            // Sklep: jedno ustawienie na link, wykres i walutę.
            const mkKey = store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE;
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_marketplace'), UIBuilder.select(
                Object.entries(CONFIG.MARKETPLACES).map(([k, m]) => ({
                    value: k, text: m.host.replace(/^www\./, '') + (m.keepa_ok ? '' : '  ⚠'),
                })), mkKey, v => { store.userConfig.marketplace = v; this.rerender(); })));
            if (!CONFIG.MARKETPLACES[mkKey].keepa_ok) {
                secPrice.appendChild(h('div', {
                    textContent: '⚠ ' + I18n.get('priceCard_marketNoKeepa'),
                    style: { fontSize: '0.85em', color: '#b06a00', margin: '-4px 0 10px 0', lineHeight: '1.35' },
                }));
            }

            // Waluta, w której kwoty się pokazuje. Liczy się zawsze w euro,
            // więc przełączenie w trakcie zmiany niczego nie gubi. Ustawienie
            // wspólne jak sklep: wszystkie karty mówią jedną walutą.
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_displayCurrency'), UIBuilder.select(
                [{ value: 'native', text: I18n.get('priceCard_displayNative') }]
                    .concat(Object.entries(CONFIG.DISPLAY_CURRENCIES).map(([code, sign]) => ({
                        value: code, text: `${code} (${sign})`,
                    }))),
                FxRates.displayCurrency() || 'native',
                v => { store.userConfig.displayCurrency = v; PriceCard.render(); this.rerender(); })));
            secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_displayCurrencyHint')));

            // Źródło ceny — od zalecanego do zapasowych.
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_source'), UIBuilder.select([
                { value: 'ocr',   text: I18n.get('priceCard_src_ocr')   },
                { value: 'graph', text: I18n.get('priceCard_src_graph') },
                { value: 'jina',  text: I18n.get('priceCard_src_jina')  },
            ], pc.source, v => { store.localTabConfig.priceCard.source = v; this.rerender(); })));

            secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                I18n.get('priceCard_fallback'), pc.marketFallback !== false,
                v => store.localTabConfig.priceCard.marketFallback = v)));
            secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_fallbackHint')));

            secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                I18n.get('priceCard_showCard'), pc.visible,
                v => { store.localTabConfig.priceCard.visible = v; this.rerender(); })));

            if (!pc.visible) {
                secPrice.appendChild(UIBuilder.hint(pc.logValues
                    ? I18n.get('priceCard_hiddenHint')
                    : I18n.get('priceCard_enabled') + ': ' + I18n.get('no')));
            }

            if (pc.visible) {
                secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_openHint')));

                if (pc.source === 'graph') {
                    secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                        I18n.get('priceCard_showGraph'), pc.showGraph,
                        v => { store.localTabConfig.priceCard.showGraph = v; this.rerender(); })));

                    if (pc.showGraph) {
                        secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_graphMode'), UIBuilder.select([
                            { value: 'legend', text: I18n.get('priceCard_mode_legend') },
                            { value: 'right',  text: I18n.get('priceCard_mode_right')  },
                            { value: 'full',   text: I18n.get('priceCard_mode_full')   },
                        ], pc.graphMode, v => store.localTabConfig.priceCard.graphMode = v)));
                    }
                }

                secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                    I18n.get('priceCard_showPrice'), pc.showPrice,
                    v => store.localTabConfig.priceCard.showPrice = v)));
                secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                    I18n.get('priceCard_showRrp'), pc.showRrp,
                    v => store.localTabConfig.priceCard.showRrp = v)));

                // Zawartość karty — wyłącznik na każdy element osobno, tak samo
                // jak przy liniach okna statystyk.
                secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                    I18n.get('priceCard_showAsin'), pc.showAsin !== false,
                    v => { store.localTabConfig.priceCard.showAsin = v; this.rerender(); })));
                if (pc.showAsin !== false) {
                    secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                        I18n.get('priceCard_asinClickable'), pc.asinClickable === true,
                        v => store.localTabConfig.priceCard.asinClickable = v)));
                    secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_asinClickableHint')));
                }
                secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                    I18n.get('priceCard_showSource'), pc.showSource === true,
                    v => store.localTabConfig.priceCard.showSource = v)));
                secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                    I18n.get('priceCard_showLatency'), pc.showLatency === true,
                    v => store.localTabConfig.priceCard.showLatency = v)));

                secPrice.appendChild(UIBuilder.row(I18n.get('fontFamily'), UIBuilder.select(
                    Object.keys(CONFIG.FONT_FAMILY_OPTIONS).map(k => ({ value: k, text: I18n.get(`fontFamily_${k}`) })),
                    pc.fontFamily || 'default',
                    v => store.localTabConfig.priceCard.fontFamily = v)));

                // Dolna granica jest celowo niska: w trybie przycięcia wąska
                // karta nadal jest użyteczna — legenda Keepa nigdzie nie znika.
                secPrice.appendChild(UIBuilder.row('', ...UIBuilder.slider(
                    170, 900, pc.width,
                    v => store.localTabConfig.priceCard.width = v,
                    v => I18n.get('priceCard_width', { value: v }))));

                // Od 11: karta ma dać się zrównać z liniami okna statystyk.
                secPrice.appendChild(UIBuilder.row('', ...UIBuilder.slider(
                    11, 48, pc.fontSize,
                    v => store.localTabConfig.priceCard.fontSize = v,
                    v => I18n.get('priceCard_fontSize', { value: v }))));

                // Jeden kolor na wszystkie wiersze karty — tak samo, jak przy
                // liniach okna statystyk.
                secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_textColor'), UIBuilder.colorPickerWithAlpha(
                    pc.colorHex, pc.alpha,
                    hex => store.localTabConfig.priceCard.colorHex = hex,
                    alpha => store.localTabConfig.priceCard.alpha = alpha)));
                secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_textColorHint')));

                secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_bg'), UIBuilder.colorPickerWithAlpha(
                    pc.bgColorHex, pc.bgAlpha,
                    hex => store.localTabConfig.priceCard.bgColorHex = hex,
                    alpha => store.localTabConfig.priceCard.bgAlpha = alpha)));

                const pDragOn = store.uiFlags.isPriceCardDragging;
                secPrice.appendChild(UIBuilder.button(
                    I18n.get(pDragOn ? 'priceCard_dragActive' : 'priceCard_drag'),
                    () => { store.uiFlags.isPriceCardDragging = !store.uiFlags.isPriceCardDragging; this.rerender(); },
                    Object.assign({ width: '100%', marginTop: '10px' },
                        pDragOn ? { background: '#FFA500', color: '#141414', fontWeight: 'bold' } : {})));

                secPrice.appendChild(UIBuilder.button(I18n.get('priceCard_resetPosition'), () => {
                    store.localTabConfig.priceCard.position = Utils.clone(DEFAULT_LOCAL_CONFIG.priceCard.position);
                    if (store.uiFlags.isPriceCardDragging) store.uiFlags.isPriceCardDragging = false;
                    PriceCard.applyStyle();
                    this.rerender();
                }, { width: '100%', marginTop: '5px' }));
            }
            this.el.appendChild(secPrice);

            // 7c. Dziennik wartości
            const secVal = UIBuilder.section(I18n.get('valueLog_section'));
            secVal.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                I18n.get('valueLog_enabled'), pc.logValues,
                v => { store.localTabConfig.priceCard.logValues = v; this.rerender(); })));
            secVal.appendChild(UIBuilder.hint(I18n.get('valueLog_hint')));

            const vt = ValueLog.totals();
            secVal.appendChild(h('div', {
                textContent: I18n.get('valueLog_stats', {
                    count: vt.count,
                    sum: vt.net.toFixed(2),
                    currency: vt.currency,
                    unpriced: vt.unpriced + vt.noRate,
                }),
                style: { fontWeight: '600', marginBottom: '4px' },
            }));
            secVal.appendChild(h('div', {
                textContent: I18n.get('valueLog_routeStats', {
                    sold: vt.soldN, unsold: vt.unsoldN, undet: vt.undetermined }),
                style: { fontSize: '0.9em', color: '#444', marginBottom: '4px' },
            }));
            secVal.appendChild(h('div', {
                textContent: I18n.get('valueLog_fx', {
                    src: FxRates.source || '—', brief: FxRates.brief() }),
                style: { fontSize: '0.85em', color: '#666', marginBottom: '8px' },
            }));
            secVal.appendChild(UIBuilder.button(I18n.get('valueLog_fxRefresh'),
                () => FxRates.refresh().then(() => this.rerender()),
                { width: '100%', marginBottom: '5px' }));

            secVal.appendChild(UIBuilder.button(I18n.get('valueLog_export'),
                () => ValueLog.report(), { width: '100%', marginBottom: '5px' }));
            secVal.appendChild(UIBuilder.button(I18n.get('valueLog_reset'), () => {
                if (!confirm(I18n.get('valueLog_resetConfirm'))) return;
                ValueLog.reset('ręczne czyszczenie z panelu ustawień');
                this.rerender();
            }, { background: '#e0a800', color: '#141414', width: '100%' }));
            this.el.appendChild(secVal);

            }   // koniec gałęzi „moduł cen włączony”

            // 8. Wybór przerwy
            const secLunch = UIBuilder.section(I18n.get('section_lunchSelection'));
            const sType = store.sessionConfig.shiftType || 'day';
            const lOpts = CONFIG.LUNCH_OPTIONS_BASE.map((o, i) => ({ value: i, text: I18n.get(o.text_key), type: o.type })).filter(o => o.type === sType);
            secLunch.appendChild(UIBuilder.row('', UIBuilder.select(lOpts, store.sessionConfig.selectedLunchIndex, v => store.sessionConfig.selectedLunchIndex = parseInt(v))));
            this.el.appendChild(secLunch);

            /**
             * 9. KOD USTAWIEŃ
             *
             * Dwa pola do odczytu i jedno do wklejenia. Pola są `readOnly`,
             * a nie `disabled`: wyłączonego pola nie da się zaznaczyć, a o to
             * tu właśnie chodzi — o skopiowanie zawartości.
             */
            const secCode = UIBuilder.section(I18n.get('configCode_section'));
            secCode.appendChild(UIBuilder.hint(I18n.get('configCode_hint')));

            const boxStyle = {
                width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '6px',
                fontFamily: CONFIG.FONT_FAMILY_OPTIONS.monospace, fontSize: '11px',
            };
            const readOnlyBox = (value) => h('input', {
                type: 'text', value, readOnly: true, spellcheck: false,
                style: boxStyle,
                onFocus: (e) => e.target.select(),
            });

            const codeBox = readOnlyBox(ConfigCode.encode());
            const linkBox = readOnlyBox(ConfigCode.link());
            secCode.appendChild(UIBuilder.row(I18n.get('configCode_yours'), codeBox));
            secCode.appendChild(UIBuilder.row(I18n.get('configCode_link'), linkBox));

            secCode.appendChild(UIBuilder.button(I18n.get('configCode_select'), () => {
                codeBox.focus();
                codeBox.select();
                // Schowek bywa niedostępny (brak zgody, stara przeglądarka),
                // więc jest dodatkiem do zaznaczenia, a nie zamiast niego.
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(codeBox.value).catch(() => {});
                }
            }, { width: '100%', marginTop: '6px' }));

            const pasteBox = h('input', {
                type: 'text', placeholder: I18n.get('configCode_paste'), spellcheck: false,
                style: Object.assign({}, boxStyle, { marginTop: '10px' }),
            });
            secCode.appendChild(pasteBox);
            secCode.appendChild(UIBuilder.button(I18n.get('configCode_apply'), () => {
                const report = ConfigCode.apply(pasteBox.value);
                // Sprawozdanie ma klucze po polsku (idzie też do konsoli), więc
                // wynik czytamy po pierwszym polu, a nie po nazwie.
                const okay = report['kod przyjęty'] === true;
                if (okay) {
                    Notifier.show(I18n.get('configCode_applied', { n: report['ustawień nałożonych'] }));
                    pasteBox.value = '';
                    this.rerender();
                } else {
                    Notifier.show(String(report['powód']));
                }
            }, { width: '100%', marginTop: '6px' }));
            this.el.appendChild(secCode);

            // Zamknięcie
            this.el.appendChild(h('hr', { style: { margin: '20px 0' } }));
            this.el.appendChild(UIBuilder.button(I18n.get('settings_applyAndCloseButton'), () => this.toggle(), { width: '100%', padding: '10px', fontSize: '1.1em' }));

            this.el.scrollTop = scrollTop;
        }
    };
