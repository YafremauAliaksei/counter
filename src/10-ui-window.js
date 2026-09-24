    const StatsWindowRenderer = {
        init() {
            this.el = h('div', {
                id: 'statsWindow',
                style: {
                    position: 'fixed', padding: '5px 10px', borderRadius: '5px', zIndex: '2147483640',
                    pointerEvents: 'none', userSelect: 'none', whiteSpace: 'pre',
                    transition: 'top 0.2s, left 0.2s, background-color 0.2s',
                    backgroundColor: 'var(--sh-bg-color)',
                    fontFamily: 'var(--sh-font)'
                }
            });

            this.lines = {};
            LINE_KEYS.forEach(k => {
                const line = h('div', {
                    style: {
                        color: `var(--sh-${k}-color)`,
                        fontSize: `var(--sh-${k}-size)`,
                        display: `var(--sh-${k}-display)`,
                        lineHeight: '1.3', minHeight: '1em'
                    }
                });
                this.lines[k] = line;
                this.el.appendChild(line);
            });
            document.body.appendChild(this.el);
            this.applyPosition();
            // Bez uiFlags — okno od nich nie zależy, a zmieniają się przy każdym
            // przedmiocie. tabSold osobno od tabCounters, bo kod sortowania
            // potrafi przyjść w następnym skanie niż zaliczenie przedmiotu;
            // bez tej ścieżki procent czekałby na takt timera.
            onStorePaths(['tabCounters', 'tabSold', 'tabNeutral', 'tasks', 'activeTaskId',
                          'taskCounters', 'sessionConfig', 'userConfig', 'localTabConfig'],
                         () => this.renderContent());
            onStorePaths(['localTabConfig.statsWindowPosition'], () => this.applyPosition());
            bus.on('valueLog:changed', () => this.renderContent());
            // Takt raz na sekundę: zegar w linii 5 i czas pracy idą płynnie.
            this.tickTimer = setInterval(() => this.renderContent(), CONFIG.UI_UPDATE_INTERVAL_MS);


            bus.on('store:changed:uiFlags.isStatsWindowDragging', (data) => {
                const isDragActive = data.value;
                if (isDragActive) {
                    this.el.style.pointerEvents = 'auto';
                    this.el.style.cursor = 'grab';
                    this.el.style.outline = '2px dashed #FFA500';
                    this.el.style.outlineOffset = '2px';
                    this.el.style.backgroundColor = 'rgba(230, 230, 230, 0.95)';
                    this.el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                } else {
                    this.el.style.pointerEvents = 'none';
                    this.el.style.cursor = 'default';
                    this.el.style.outline = 'none';
                    this.el.style.boxShadow = 'none';
                    this.el.style.backgroundColor = 'var(--sh-bg-color)';
                }
            });
        },

        /**
         * Ustawia okno wg konfiguracji. Puste `top` znaczy „trzymaj się dołu”
         * i wtedy liczy się `bottom` (domyślny lewy dolny róg). Po przeciągnięciu
         * `top` dostaje współrzędną i przyklejenie znika.
         *
         * Wołane przy starcie, przez przycisk resetu pozycji i przy zmianie stanu.
         */
        applyPosition() {
            if (!this.el) return;
            const pos = store.localTabConfig.statsWindowPosition || {};
            this.el.style.left = pos.left || '20px';
            if (pos.top) {
                this.el.style.top = pos.top;
                this.el.style.bottom = 'auto';
            } else {
                this.el.style.top = 'auto';
                this.el.style.bottom = pos.bottom || '8px';
            }
        },

        /**
         * LINIA 6 — bilans zmiany:
         *
         *     +6000.00 -1500.00 = 4500.00 €  113 szt ?1
         *
         * Sprzedaż, utylizacja i różnica, czyli wynik zmiany. Kolory niosą
         * znak (plus zielony, minus czerwony, wynik według znaku), dlatego
         * linia składa się ze spanów. Kolor z ustawień dotyczy tylko części
         * neutralnej (liczby sztuk); przezroczystość — całej linii.
         *
         * `?N` to przedmioty bez kierunku, bez ceny albo bez kursu: nie wchodzą
         * do sum, ale przemilczenie ich tłumaczyłoby zaniżoną sumę.
         *
         * ValueLog.totals() woła się tylko tutaj — przy wyłączonej linii
         * dziennik nie jest przeliczany wcale.
         */
        renderValueSum() {
            const vt = ValueLog.totals();
            const l6 = this.lines.line6_valueSum;
            const cfg6 = store.localTabConfig.linesConfig.line6_valueSum;
            l6.innerHTML = '';
            const a6 = Math.max(0, Math.min(100, Number(cfg6.alpha))) / 100;
            const tone = (hex, k = 1) => `rgba(${Utils.hexToRgb(hex)}, ${(a6 * k).toFixed(3)})`;
            const GREEN = tone('#7CFFA8'), RED = tone('#FF9A9A');
            const WARN = tone('#FFC46B'), DIM = tone(cfg6.colorHex, 0.85);
            const piece = (text, color, bold) => {
                const sp = h('span', { textContent: text });
                if (color) sp.style.color = color;
                if (bold) sp.style.fontWeight = '700';
                return sp;
            };
            // Sumy są zawsze w euro; waluta wyświetlania to jedno mnożenie
            // tutaj. „Jak w sklepie” zostaje przy euro — bilans z kilku sklepów
            // nie ma jednej waluty. Bez kursu do wybranej waluty zostaje euro.
            let cur = FxRates.displayCurrency() || 'EUR';
            if (FxRates.fromEur(0, cur) == null) cur = 'EUR';
            const money = (v) => FxRates.fromEur(v, cur).toFixed(2);

            l6.appendChild(piece(`+${money(vt.sold)}`, GREEN));
            l6.appendChild(document.createTextNode(' '));
            l6.appendChild(piece(`-${money(vt.unsold)}`, RED));
            l6.appendChild(document.createTextNode(' = '));
            l6.appendChild(piece(`${vt.net >= 0 ? '' : '-'}${money(Math.abs(vt.net))} ${CONFIG.DISPLAY_CURRENCIES[cur]}`,
                                 vt.net >= 0 ? GREEN : RED, true));
            l6.appendChild(document.createTextNode('  '));
            l6.appendChild(piece(I18n.get('statsLine6_items', { n: vt.count }), DIM));
            const pending = vt.undetermined + vt.unpriced + vt.noRate;
            if (pending) {
                l6.appendChild(document.createTextNode(' '));
                l6.appendChild(piece(I18n.get('statsLine6_undet', { n: pending }), WARN));
            }
        },

        /**
         * Czy linia jest widoczna. Widocznością steruje CSS, ale kosztowne
         * składanie węzłów (linie 2 i 6) idzie tylko dla linii widocznych —
         * domyślnie widoczna jest jedna.
         *
         * Brak wpisu w konfiguracji znaczy „pokaż”: nowa linia bez wartości
         * domyślnej ma się pojawić, a nie zniknąć po cichu. Zmiana `visible`
         * przerysowuje okno od razu (subskrypcja localTabConfig).
         */
        isLineVisible(key) {
            const cfg = store.localTabConfig.linesConfig[key];
            return !cfg || cfg.visible !== false;
        },

        renderContent() {
            const { workedMs } = ShiftManager.getWorkTime();
            const hWorked = workedMs / 3600000;
            const cid = store.currentTabInstanceId;
            const cCount = store.tabCounters[cid] || 0;
            // Zawsze sama liczba. Granica „tempo jeszcze nie istnieje”
            // (RATE_MIN_WORKED_MS) jest ta sama dla zmiany i zadania, żeby
            // linie 1 i 8 mówiły to samo o pierwszej minucie pracy.
            const getIph = (c) => workedMs >= CONFIG.RATE_MIN_WORKED_MS ? (c / hWorked).toFixed(1) : '0.0';

            /**
             * PROCENT SPRZEDAŻY — na końcu linii 1, 2 i 7.
             *
             * Mianownik to licznik przedmiotów minus przedmioty spoza
             * mianownika (audyt, wpisy ręczne), a nie suma sprzedanych
             * i niesprzedanych. Przedmiot bez kodu obniża więc procent zamiast
             * znikać z rachunku, a oddany do audytu wypada, bo jego kierunek
             * rozstrzygnie się później i gdzie indziej. Liczba sztuk może być
             * przez to większa niż mianownik — to poprawne.
             *
             * Bez tekstu w słownikach: liczba i znak są takie same w każdym języku.
             */
            const cSold = store.tabSold[cid] || 0;
            const cRated = Math.max(0, cCount - (store.tabNeutral[cid] || 0));

            // Linia 1: bieżąca zakładka
            this.lines.line1_currentTab.textContent = I18n.get('statsLine1_current', {
                tabName: I18n.getTabName(cid), itemsPerHour: getIph(cCount), statsPerHourUnit: I18n.get('statsPerHourUnit'),
                count: cCount, completedUnit: I18n.get('completedUnit'), inUnit: I18n.get('inUnit'),
                workTimeFormatted: Utils.formatDuration(workedMs)
            }) + ` ${Utils.percentFloor(cSold, cRated)}%`;

            /**
             * Linia 2: podsumowanie wszystkich kart.
             *
             * Pętla po kartach chodzi zawsze, bo te same sumy pokazuje linia 7
             * i muszą pochodzić z jednego przebiegu. Pod warunkiem widoczności
             * stoi tylko składanie węzłów — to ono kosztuje.
             */
            const showLine2 = this.isLineVisible('line2_globalSummary');
            // Czyszczenie zawsze, także przy wyłączonej linii — inaczej w DOM
            // wisiałaby ostatnia, niewidoczna treść.
            this.lines.line2_globalSummary.innerHTML = '';
            let gTotal = 0;
            let gSold = 0;
            // Mianownik procentu zbiera się w tej samej pętli co suma sztuk,
            // żeby obie liczby pochodziły z jednego przebiegu.
            let gRated = 0;
            const allKeys =[...Object.keys(CONFIG.KNOWN_TAB_TYPES), ...Object.keys(store.userConfig.customTabSettings)];
            const fragments =[];
            const line2Cfg = store.localTabConfig.linesConfig.line2_globalSummary;

            allKeys.forEach(k => {
                const isKnown = !!CONFIG.KNOWN_TAB_TYPES[k];
                const included = isKnown ? store.userConfig.globalStatsContributionKnown[k] : store.userConfig.customTabSettings[k].includeInGlobal;
                const count = store.tabCounters[k] || 0;
                const active = store.sessionConfig.activeTabInstances[k] || count > 0;

                if (included && active) {
                    gTotal += count;
                    gSold += store.tabSold[k] || 0;
                    // Wkład karty nieujemny: „poza mianownikiem” większe od
                    // paczek to śmieć albo wyścig kart i nie może zawyżać
                    // procentu całości.
                    gRated += Math.max(0, count - (store.tabNeutral[k] || 0));
                    if (!showLine2) return;
                    const text = I18n.get('statsLine2_global_tab_format', {
                        tabName: I18n.getTabName(k).substring(0, 10),
                        itemsPerHour: getIph(count), statsPerHourUnit: I18n.get('statsPerHourUnit'), count: count
                    });

                    const span = h('span', { textContent: text });

                    if (isKnown && line2Cfg.multicolor) {
                        const hex = line2Cfg.customColors[k] || CONFIG.KNOWN_TAB_TYPES[k].baseColorHex;
                        const rgb = Utils.hexToRgb(hex);
                        // Kolor działu z przezroczystością linii 2.
                        span.style.color = `rgba(${rgb}, ${line2Cfg.alpha / 100})`;
                        span.style.fontWeight = 'bold';

                        // Cień skalowany do alfy, żeby przy niskiej przezroczystości
                        // tekst się nie rozmazywał.
                        const shadowAlpha = Math.min(0.5, line2Cfg.alpha / 100);
                        span.style.textShadow = `0 0 2px rgba(0,0,0,${shadowAlpha})`;
                    }

                    fragments.push(span);
                    fragments.push(document.createTextNode(I18n.get('statsLine2_global_separator')));
                }
            });

            if (showLine2 && fragments.length > 0) {
                fragments.forEach(f => this.lines.line2_globalSummary.appendChild(f));
                this.lines.line2_globalSummary.appendChild(document.createTextNode(
                    I18n.get('statsLine2_global_total_format', {
                        totalItemsPerHour: getIph(gTotal), statsPerHourUnit: I18n.get('statsPerHourUnit'), totalCount: gTotal
                    }) + ` ${Utils.percentFloor(gSold, gRated)}%`
                ));
            }

            // Linia 3: zmiana
            const sType = store.sessionConfig.shiftType;
            const sStart = store.sessionConfig.shiftCalculatedStartTime ? Utils.formatTime(new Date(store.sessionConfig.shiftCalculatedStartTime), false, ':') : I18n.get('notApplicable');
            this.lines.line3_shiftInfo.textContent = I18n.get('statsLine3_shift', {
                shiftType: sType ? I18n.get(`shift_${sType}`) : I18n.get('notApplicable'),
                shiftStartTime: sStart
            });

            // Linia 4: przerwa
            let lStr = I18n.get('notApplicable');
            const lIdx = store.sessionConfig.selectedLunchIndex;
            if (lIdx !== null && CONFIG.LUNCH_OPTIONS_BASE[lIdx]) {
                const opt = CONFIG.LUNCH_OPTIONS_BASE[lIdx];
                const typeArr = CONFIG.LUNCH_OPTIONS_BASE.filter(l => l.type === opt.type);
                lStr = I18n.get('statsLine4_lunch', {
                    lunchNumber: typeArr.indexOf(opt) + 1,
                    lunchStartTime: `${opt.start.substring(0,2)}:${opt.start.substring(2,4)}`,
                    lunchEndTime: `${opt.end.substring(0,2)}:${opt.end.substring(2,4)}`
                });
            }
            this.lines.line4_lunchInfo.textContent = lStr;

            // Linia 5: zegar
            this.lines.line5_realTimeClock.textContent = I18n.get('statsLine5_clock', { currentTime: Utils.formatTime(new Date(), true, ':') });

            // Linia 6 (renderValueSum): przy wyłączonej dziennik nie jest
            // przeliczany; czyszczenie bezwarunkowe, jak w linii 2.
            if (this.isLineVisible('line6_valueSum')) this.renderValueSum();
            else this.lines.line6_valueSum.innerHTML = '';

            /**
             * LINIA 7 — trzy liczby bez jednostek i nazw:
             *
             *     17.4 28 14%
             *
             * tempo (paczki na godzinę, wszystkie wliczane karty), liczba
             * zrobionych sztuk i procent sprzedaży — te same, które stoją na
             * końcu linii 2, z tego samego przebiegu pętli.
             */
            this.lines.line7_compact.textContent =
                `${getIph(gTotal)} ${gTotal} ${Utils.percentFloor(gSold, gRated)}%`;

            /**
             * LINIA 8 — bieżące zadanie i jego własne liczby, z własnym
             * zegarem (opóźniony start nie psuje tempa):
             *
             *     fast_process 12 34.3/h 58% 21m 00s
             *
             * Zatrzymane zadanie dostaje na końcu znak pauzy — inaczej stojące
             * tempo wyglądałoby jak zepsuty licznik.
             */
            const task = TaskManager.active();
            if (!task) {
                this.lines.line8_taskInfo.textContent = '';
            } else {
                const t = TaskManager.totals(task);
                const rate = TaskManager.rate(task);
                const paused = TaskManager.isRunning(task) ? '' : ' ' + I18n.get('taskPausedMark');
                this.lines.line8_taskInfo.textContent =
                    `${task.name} ${t.done} ${rate.toFixed(1)}${I18n.get('statsPerHourUnit')} `
                    + `${TaskManager.percent(task)}% ${Utils.formatDuration(TaskManager.workedMs(task))}${paused}`;
            }
        }
    };
