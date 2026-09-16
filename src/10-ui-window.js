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
            // 8.3.0: uiFlags tu nie wchodzą — okno statystyk od nich nie zależy,
            // a ruszane są przy każdym przedmiocie. Raz na sekundę linia i tak
            // przerysowuje się z timera poniżej.
            onStorePaths(['tabCounters', 'sessionConfig', 'userConfig', 'localTabConfig'],
                         () => this.renderContent());
            onStorePaths(['localTabConfig.statsWindowPosition'], () => this.applyPosition());
            bus.on('valueLog:changed', () => this.renderContent());
            // 8.1.0: było na sztywno 10000 ms, przez co zegar w linii 5 spóźniał
            // się do dziesięciu sekund, a licznik przepracowanego czasu szedł
            // skokami. Teraz używa się CONFIG.UI_UPDATE_INTERVAL_MS (1000 ms),
            // zadeklarowanego jeszcze w 8.0.0, ale nigdzie niestosowanego.
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
         * Ustawia okno wg konfiguracji (9.2.0).
         *
         * Puste `top` znaczy „trzymaj się dołu” i wtedy liczy się `bottom` —
         * tak wygląda domyślny lewy dolny róg z odstępem 20 px. Po przeciągnięciu
         * myszą `top` dostaje konkretną wartość i przyklejenie znika samo.
         *
         * Wydzielone w osobną metodę, bo wywołują ją trzy miejsca: start,
         * przycisk resetu pozycji i reakcja na zmianę stanu.
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

        renderContent() {
            const { workedMs } = ShiftManager.getWorkTime();
            const hWorked = workedMs / 3600000;
            const cid = store.currentTabInstanceId;
            const cCount = store.tabCounters[cid] || 0;
            // 8.1.0: wcześniej przy zbyt krótkim czasie podstawiało się tu całe
            // zdanie, zawierające już „/h”, i w linii wychodziło „~0.0/h (...)/h”.
            // Teraz funkcja zwraca zawsze samą liczbę.
            const getIph = (c) => hWorked > 0.0027 ? (c / hWorked).toFixed(1) : '0.0';

            // Linia 1: bieżąca zakładka
            this.lines.line1_currentTab.textContent = I18n.get('statsLine1_current', {
                tabName: I18n.getTabName(cid), itemsPerHour: getIph(cCount), statsPerHourUnit: I18n.get('statsPerHourUnit'),
                count: cCount, completedUnit: I18n.get('completedUnit'), inUnit: I18n.get('inUnit'),
                workTimeFormatted: Utils.formatDuration(workedMs)
            });

            // Linia 2: podsumowanie globalne
            this.lines.line2_globalSummary.innerHTML = '';
            let gTotal = 0;
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
                    const text = I18n.get('statsLine2_global_tab_format', {
                        tabName: I18n.getTabName(k).substring(0, 10),
                        itemsPerHour: getIph(count), statsPerHourUnit: I18n.get('statsPerHourUnit'), count: count
                    });

                    const span = h('span', { textContent: text });

                    if (isKnown && line2Cfg.multicolor) {
                        const hex = line2Cfg.customColors[k] || CONFIG.KNOWN_TAB_TYPES[k].baseColorHex;
                        const rgb = Utils.hexToRgb(hex);
                        // Mieszamy własny kolor działu z ustawieniem alfy linii 2
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

            if (fragments.length > 0) {
                fragments.forEach(f => this.lines.line2_globalSummary.appendChild(f));
                this.lines.line2_globalSummary.appendChild(document.createTextNode(
                    I18n.get('statsLine2_global_total_format', {
                        totalItemsPerHour: getIph(gTotal), statsPerHourUnit: I18n.get('statsPerHourUnit'), totalCount: gTotal
                    })
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

            /**
             * Line 6 — BILANS ZMIANY (9.0.0): trzy liczby w jednej linii.
             *
             *     +6000.00  -1500.00  = 4500.00 €  113szt ?1
             *
             * Pierwsza to ile wyrobiono na sprzedaży, druga ile poszło do
             * utylizacji, trzecia (po „=”) to różnica, czyli wynik zmiany.
             * Wszystko w euro: ceny z różnych rynków są przeliczone po kursie,
             * inaczej funty i dolary po cichu zmieszałyby się z euro.
             *
             * Kolory niosą treść, a nie zdobią: plus zielony, minus czerwony,
             * wynik pokolorowany wg własnego znaku — od razu widać, czy zmiana
             * jest na plusie. Dlatego linia składa się ze spanów, jak linia 2
             * z wielokolorowością, a nie pisze się jednym textContent.
             *
             * „?N” na końcu to przedmioty, dla których kod sortowania się nie
             * pojawił. Nie idą ani na plus, ani na minus, ale milczeć o nich
             * nie wolno: bez tego licznika nie wiadomo, czemu suma jest niższa
             * od oczekiwanej.
             *
             * KOLOR I PRZEZROCZYSTOŚĆ (9.1.0): przezroczystość działa na całą
             * linię, kolor z pickera tylko na część NEUTRALNĄ (liczbę sztuk).
             * Zielony/czerwony/pomarańczowy nie są oddane pickerowi, bo to nie
             * ozdoba, tylko jedyny sposób odczytania znaku jednym spojrzeniem.
             *
             * 9.2.0: linia domyślnie wyłączona — przy wyłączonym module cen nie
             * ma czego sumować.
             */
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
            const money = (v) => v.toFixed(2);

            l6.appendChild(piece(`+${money(vt.sold)}`, GREEN));
            l6.appendChild(document.createTextNode(' '));
            l6.appendChild(piece(`-${money(vt.unsold)}`, RED));
            l6.appendChild(document.createTextNode(' = '));
            l6.appendChild(piece(`${vt.net >= 0 ? '' : '-'}${money(Math.abs(vt.net))} €`,
                                 vt.net >= 0 ? GREEN : RED, true));
            l6.appendChild(document.createTextNode('  '));
            l6.appendChild(piece(I18n.get('statsLine6_items', { n: vt.count }), DIM));
            const pending = vt.undetermined + vt.unpriced + vt.noRate;
            if (pending) {
                l6.appendChild(document.createTextNode(' '));
                l6.appendChild(piece(I18n.get('statsLine6_undet', { n: pending }), WARN));
            }

            /**
             * Line 7 — TRYB ZWIĘZŁY (9.2.0).
             *
             *     17.4 28
             *
             * Dwie liczby oddzielone pojedynczą spacją, nic więcej: żadnych
             * jednostek, nazw działów ani nawiasów.
             *
             *   pierwsza — paczki na godzinę, suma ze WSZYSTKICH wliczanych kart.
             *              To dokładnie ta liczba, która w linii 2 stoi po „=”;
             *   druga    — łączna liczba zrobionych sztuk, czyli to, co w linii 2
             *              jest w nawiasie na samym końcu.
             *
             * `gTotal` liczy się wyżej, przy składaniu linii 2, i to jest
             * świadome: obie linie MUSZĄ pokazywać tę samą liczbę, a dwa
             * niezależne przebiegi po kartach prędzej czy później by się
             * rozjechały. Linia 2 może być wyłączona — pętla i tak chodzi, bo
             * kosztuje tyle, co przejście po trzech kluczach.
             *
             * Cały tekst idzie przez textContent, więc nie ma tu żadnego
             * składania HTML — kolor i rozmiar ustawia CSS ze zmiennych
             * --sh-line7_compact-*.
             */
            this.lines.line7_compact.textContent = `${getIph(gTotal)} ${gTotal}`;
        }
    };
