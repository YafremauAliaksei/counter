    /**
     * Kolejność sekcji panelu i ich stan domyślny — ułożone przez autora
     * na makiecie: na górze to, co zmienia się co zmianę (przerwa, cel,
     * zadania), na dole to, co ustawia się raz (język, reset).
     *
     * `open` — sekcja rozwinięta, póki człowiek jej nie zwinie; zwinięte
     * domyślnie jest to, czego nie ustawia się co zmianę (decyzja autora).
     * `keep` — zwinięta sekcja pokazuje dalej to, co jest włączone (jak kanały
     * z nieprzeczytanym w zwiniętej kategorii): zwinięte okno statystyk
     * zostawia na widoku ustawienia samych włączonych linii. Element
     * z `data-sh-keep` widać zawsze, z `data-sh-collapsed-only` — tylko
     * w sekcji zwiniętej (podpowiedź „rozwiń, żeby zobaczyć resztę”).
     */
    const PANEL_SECTIONS = [
        { id: 'lunch', open: true },
        { id: 'workflow', open: true },
        { id: 'tasks', open: false },
        { id: 'global', open: true },
        { id: 'current_tab', open: false },
        { id: 'visual', open: false },
        {
            id: 'window', open: false,
            keep: (child) => {
                const key = child.dataset && child.dataset.shLine;
                const cfg = key && store.localTabConfig.linesConfig[key];
                return !!(cfg && cfg.visible);
            },
        },
        { id: 'keys', open: false },
        { id: 'auto', open: false },
        { id: 'price_module', open: false },
        { id: 'price_card', open: false },
        { id: 'value_log', open: true },
        { id: 'code', open: false },
        { id: 'language', open: true },
        { id: 'general', open: true },
        // Diagnostyka na produkcji nie jest potrzebna: na samym końcu
        // i zwinięta, ale jest — do zgłaszania usterek z hali (i SH.debug()).
        { id: 'diag', open: false },
    ];

    /**
     * Podpisy linii okna statystyk, przy ich polu wyboru:
     *   - linia 6 koloruje się według znaczenia (plus zielony, minus
     *     czerwony), więc picker steruje tylko częścią neutralną — bez
     *     podpisu wyglądałoby to jak niedziałające ustawienie;
     *   - linia 7 jest celowo uboga w treść — trzeba powiedzieć, co znaczą liczby;
     *   - linia 8 opisuje zadanie, a nie zmianę — bez tego wygląda jak
     *     powtórzenie linii 1;
     *   - linia 9 — kiedy robi się czerwona.
     */
    const LINE_HINTS = {
        line6_valueSum: 'lineSettings_valueSumHint',
        line7_compact: 'lineSettings_compactHint',
        line8_taskInfo: 'lineSettings_taskInfoHint',
        line9_offTask: 'lineSettings_offTaskHint',
    };

    /**
     * Wygląd kontrolek panelu pod palec: pole i przycisk nie niższe niż
     * 40 px, czcionka 16 px (mniejszą przeglądarki dotykowe powiększają przy
     * wpisywaniu), pole wyboru 22 px. Stały tekst — żadna wartość z ustawień
     * do niego nie trafia.
     */
    const PANEL_CSS = `
        .sh-panel input[type=text], .sh-panel input[type=number], .sh-panel select {
            min-height: 40px; font-size: 16px; padding: 6px 8px; box-sizing: border-box;
        }
        .sh-panel button { min-height: 44px; font-size: 15px; touch-action: manipulation; margin-bottom: 6px; }
        .sh-panel input[type=checkbox] { width: 22px; height: 22px; flex-shrink: 0; }
        .sh-panel input[type=range] { min-height: 32px; }
        .sh-panel label { min-height: 40px; color: inherit; }
        .sh-panel .sh-section-head {
            display: flex; align-items: center; gap: 8px; width: 100%; margin: 0 0 4px 0;
            padding: 6px 6px; background: transparent; color: inherit; border: none;
            border-radius: 6px; cursor: pointer; text-align: left; font-size: 1.15em; font-weight: bold;
        }
        .sh-panel .sh-section-head:hover { background: rgba(0, 0, 0, 0.06); }
        .sh-panel .sh-section-head:focus-visible { outline: 3px solid #1f6feb; }
    `;

    const SettingsPanel = {
        init() {
            this.el = h('div', {
                id: 'settingsPanel', className: 'sh-panel',
                style: {
                    position: 'fixed', top: '10px', right: '10px', width: `${store.userConfig.settingsPanelWidth}px`,
                    maxWidth: 'calc(100vw - 20px)', boxSizing: 'border-box',
                    height: 'calc(100vh - 30px)', backgroundColor: CONFIG.SETTINGS_PANEL_BACKGROUND_COLOR,
                    color: CONFIG.SETTINGS_PANEL_TEXT_COLOR, border: `1px solid ${CONFIG.SETTINGS_PANEL_ACCENT_COLOR}`,
                    zIndex: '2147483646', overflowY: 'auto', padding: '15px', paddingLeft: '25px', display: 'none',
                    boxShadow: '-2px 0 5px rgba(0,0,0,0.2)', transition: 'transform 0.2s', transform: 'translateX(110%)'
                }
            });
            document.body.appendChild(this.el);
            this.styleEl = h('style', { id: 'settingsPanelStyles', textContent: PANEL_CSS });
            document.head.appendChild(this.styleEl);

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

        /** Czy sekcja jest rozwinięta: wybór człowieka, a bez niego stan domyślny. */
        isOpen(def) {
            const chosen = store.userConfig.panelSections && store.userConfig.panelSections[def.id];
            return typeof chosen === 'boolean' ? chosen : def.open;
        },

        /**
         * Sekcja ze zwijanym nagłówkiem — jak spojler: zwinięta pokazuje sam
         * tytuł (i to, co `keep` każe zostawić), klik w tytuł rozwija resztę.
         * Zwinięcie nie przerysowuje panelu, tylko chowa elementy: przewinięcie
         * i fokus zostają na miejscu.
         */
        collapsible(def, sec) {
            const [title, ...content] = Array.from(sec.children);
            const body = h('div');
            content.forEach(child => body.appendChild(child));
            const head = h('button', { type: 'button', className: 'sh-section-head' });
            const wrap = h('div', {
                className: 'sh-section', dataset: { shSection: def.id },
                style: { marginBottom: '8px', borderBottom: `1px dashed ${CONFIG.SETTINGS_PANEL_TEXT_COLOR}33`, paddingBottom: '6px' },
            }, head, body);
            const apply = () => {
                const open = this.isOpen(def);
                let hidden = 0;
                content.forEach(child => {
                    const data = child.dataset || {};
                    const show = open
                        ? !data.shCollapsedOnly
                        : !!(data.shKeep || data.shCollapsedOnly || (def.keep && def.keep(child)));
                    // Własny `display` elementu (flex wiersza) zostaje: pusty
                    // napis zamieniałby wiersz w blok i podpis spadałby nad pole.
                    if (child._shDisplay === undefined) child._shDisplay = child.style.display;
                    child.style.display = show ? child._shDisplay : 'none';
                    if (!show) hidden++;
                });
                head.textContent = '';
                head.appendChild(h('span', { textContent: open ? '▾' : '▸', style: { width: '1em' } }));
                head.appendChild(h('span', { textContent: title.textContent, style: { flexGrow: '1' } }));
                if (!open && hidden) head.appendChild(h('span', { textContent: `+${hidden}`, style: { fontSize: '0.8em', opacity: '0.6' } }));
                head.setAttribute('aria-expanded', String(open));
            };
            head.addEventListener('click', () => {
                // Zapis całym obiektem: spreparowany magazyn mógł zostawić
                // w tym polu tekst albo liczbę zamiast mapy.
                const chosen = Utils.isObject(store.userConfig.panelSections) ? store.userConfig.panelSections : {};
                store.userConfig.panelSections = { ...chosen, [def.id]: !this.isOpen(def) };
                apply();
            });
            apply();
            return wrap;
        },

        /**
         * Fokus przed przerysowaniem: które pole (po kolejności w panelu),
         * co w nim wpisano i gdzie stał kursor. Przerysowanie składa panel od
         * nowa, a bez tego pole, w którym człowiek pisze, znikałoby mu spod
         * palców w połowie liczby.
         */
        rememberFocus() {
            const active = /** @type {HTMLInputElement|null} */ (document.activeElement);
            if (!active || !this.el.contains(active)) return null;
            const fields = Array.from(this.el.querySelectorAll('input, select, textarea, button'));
            const index = fields.indexOf(active);
            if (index < 0) return null;
            let caret;
            try { caret = [active.selectionStart, active.selectionEnd]; } catch { caret = null; }
            return { index, tag: active.tagName, value: active.value, caret };
        },
        restoreFocus(focus) {
            if (!focus) return;
            const field = /** @type {HTMLInputElement|undefined} */ (Array.from(this.el.querySelectorAll('input, select, textarea, button'))[focus.index]);
            if (!field || field.tagName !== focus.tag) return;
            // Wpisany tekst zostaje: wartość przeliczona (np. tempo osiągalne)
            // pokaże się po wyjściu z pola, a nie w trakcie pisania.
            if (field.tagName === 'INPUT' && !field.readOnly && field.type !== 'checkbox') field.value = focus.value;
            field.focus();
            if (focus.caret && focus.caret[0] !== null) {
                try { field.setSelectionRange(focus.caret[0], focus.caret[1]); } catch { /* pole liczbowe nie ma kursora */ }
            }
        },
        /**
         * Kod Data Matrix na płótnie: czarne moduły na białym tle ze strefą
         * ciszy dwóch modułów — tyle potrzebuje skaner.
         * @returns {HTMLCanvasElement|null} null, gdy tekstu nie da się zakodować.
         */
        matrixCanvas(text) {
            const m = DataMatrix.encode(text);
            if (!m) return null;
            const cell = 4, quiet = 2, side = (m.length + 2 * quiet) * cell;
            const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { width: side, height: side }));
            canvas.style.display = 'block';
            canvas.style.marginTop = '6px';
            const ctx = canvas.getContext && canvas.getContext('2d');
            if (!ctx) return canvas;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, side, side);
            ctx.fillStyle = '#000000';
            m.forEach((row, r) => row.forEach((dark, c) => {
                if (dark) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
            }));
            return canvas;
        },
        toggle() {
            store.uiFlags.isSettingsPanelVisible = !store.uiFlags.isSettingsPanelVisible;
            // Animacja poprzedniego przełączenia nie może dokończyć się po
            // tym: szybkie zamknij-otwórz schowałoby otwarty już panel.
            clearTimeout(this._slideTimer);
            if (store.uiFlags.isSettingsPanelVisible) {
                this.render();
                this.el.style.display = 'block';
                this._slideTimer = setTimeout(() => this.el.style.transform = 'translateX(0)', 10);
                this.captureInput(true);
            } else {
                this.captureInput(false);
                this.el.style.transform = 'translateX(110%)';
                Persistence.saveState();
                this._slideTimer = setTimeout(() => this.el.style.display = 'none', 200);
            }
        },

        /**
         * Panel otwarty przejmuje klawiaturę i klik poza nim.
         *
         * KLAWIATURA. T-REX łapie klawisze na całej stronie (cyfry wybierają
         * przyciski kroku), więc bez tego cyfry wpisywane w pole panelu
         * przepadają. Słuchacz na `window` w fazie przechwytywania biegnie
         * przed słuchaczami dokumentu i elementów strony; dla zdarzeń
         * z wnętrza panelu zatrzymuje dalszą drogę. Domyślne działanie
         * klawisza (wpisanie znaku) zostaje, a pola panelu słuchają `input`
         * i `change`, których to nie dotyczy. Hasła dalej zamykają panel:
         * poza polem tekstowym zdarzenie idzie wprost do InputManager.
         * Po zamknięciu słuchacze znikają i strona dostaje klawisze jak
         * wcześniej.
         *
         * KLIK POZA PANELEM zamyka go — z wyjątkiem trybu przeciągania okna
         * albo karty ceny: wtedy klik poza panelem to właśnie przeciąganie.
         */
        captureInput(on) {
            if (!this.onPanelKey) {
                this.onPanelKey = (e) => {
                    if (!this.el.contains(e.target)) return;
                    e.stopImmediatePropagation();
                    const t = e.target;
                    const editable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
                    // Tab to człowiek przechodzący dalej — fokusu nie zawracamy.
                    if (editable && e.type === 'keydown') this._typedAt = e.key === 'Tab' ? 0 : Date.now();
                    if (e.type === 'keydown' && !editable) InputManager.onKeyDown(e);
                };
                this.onOutsideDown = (e) => {
                    if (this.el.contains(e.target)) return;
                    if (store.uiFlags.isStatsWindowDragging || store.uiFlags.isPriceCardDragging) return;
                    this.toggle();
                };
                /**
                 * FOKUS NIE UCIEKA Z POLA. Klik poza panelem go zamyka, więc
                 * przejście fokusu z pola panelu na element strony przy otwartym
                 * panelu robi sama strona (T-REX ustawia fokus na swoim polu
                 * skanu), a nie człowiek. Wtedy fokus wraca — ale tylko do pola,
                 * w którym przed chwilą pisano, i najwyżej kilka razy z rzędu,
                 * żeby nie przeciągać się ze stroną bez końca.
                 */
                this.onFocusOut = (e) => {
                    const field = e.target;
                    const next = e.relatedTarget;
                    if (!this.el.contains(field) || !next || this.el.contains(next)) return;
                    if (field.tagName !== 'INPUT' && field.tagName !== 'TEXTAREA') return;
                    const now = Date.now();
                    if (now - (this._typedAt || 0) > CONFIG.PANEL_FOCUS_GUARD_MS) return;
                    if (now - (this._refocusAt || 0) > CONFIG.PANEL_FOCUS_GUARD_MS) this._refocusCount = 0;
                    if (++this._refocusCount > CONFIG.PANEL_FOCUS_GUARD_TRIES) return;
                    this._refocusAt = now;
                    setTimeout(() => { if (store.uiFlags.isSettingsPanelVisible && field.isConnected) field.focus(); }, 0);
                };
            }
            const method = on ? 'addEventListener' : 'removeEventListener';
            ['keydown', 'keyup', 'keypress'].forEach(t => window[method](t, this.onPanelKey, true));
            document[method]('focusout', this.onFocusOut, true);
            // pointerdown, a nie mousedown: stuknięcie palcem daje „mysz” dopiero
            // po puszczeniu, a na części ekranów dotykowych wcale.
            document[method]('pointerdown', this.onOutsideDown, true);
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
                sec.appendChild(UIBuilder.row(I18n.get('tasks_name'), UIBuilder.live(h('input', {
                    type: 'text', value: task.name, maxLength: CONFIG.TASK_MAX_NAME_LEN,
                    style: { flexGrow: '1' },
                }), text => { TaskManager.rename(task.id, text); this.rerender(); })));

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
                // Godzinę do pół godziny naprzód wolno: o 18:25 wpisane „18:30”
                // zostaje 18:30 (TASK_START_AHEAD_MS). Pole stoi w jednym
                // wierszu ze skrótami — to ta sama czynność.
                quick.appendChild(UIBuilder.live(h('input', {
                    type: 'text', value: Utils.formatClock(startedAt), placeholder: 'HH:MM', inputMode: 'numeric',
                    style: { width: '90px', textAlign: 'center' },
                }), text => {
                    const ms = TaskManager.parseClock(text);
                    if (ms === null) return;
                    TaskManager.setStart(task.id, ms);
                    this.rerender();
                }));
                sec.appendChild(UIBuilder.row(I18n.get('tasks_startedAt'), quick));

                // --- odcinki: kilka powrotów do procesu w ciągu zmiany ---
                // Poprawny zapis przyjmuje się sam, w trakcie pisania; o błędzie
                // mówi dopiero przycisk — pół wpisanej godziny to jeszcze nie błąd.
                const segBox = UIBuilder.live(h('input', {
                    type: 'text', value: TaskManager.formatSegments(task), spellcheck: false,
                    style: { flexGrow: '1', fontFamily: 'monospace' },
                }), text => {
                    if (text !== TaskManager.formatSegments(task) && TaskManager.setSegments(task.id, text)) this.rerender();
                });
                sec.appendChild(UIBuilder.row(I18n.get('tasks_segments'), segBox));
                sec.appendChild(UIBuilder.hint(I18n.get('tasks_segmentsHint')));
                sec.appendChild(UIBuilder.button(I18n.get('tasks_segmentsApply'), () => {
                    if (!TaskManager.setSegments(task.id, segBox.value)) Notifier.show(I18n.get('tasks_segmentsError'));
                    this.rerender();
                }, { width: '100%', marginTop: '4px' }));

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
                // Tempo to tempo wobec celu: z kart, które liczą się do tego
                // zadania (to samo, co w linii 7).
                sec.appendChild(UIBuilder.row(I18n.get('tasks_rate'), UIBuilder.live(h('input', {
                    type: 'number', min: 0, step: '0.1', value: TaskManager.countedRate(task).toFixed(1), inputMode: 'decimal',
                    style: { width: '100px', textAlign: 'right' },
                }), text => {
                    const applied = TaskManager.setRate(task, parseFloat(text), cid);
                    if (applied !== null) this.syncTabCounters(cid);
                    this.rerender();
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
                style: { flexGrow: '1' },
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
                    textContent: `${TaskManager.packsText(t)} · ${TaskManager.countedRate(t).toFixed(1)}${I18n.get('statsPerHourUnit')} · ${TaskManager.percent(t)}%`,
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
        /**
         * CEL I POMOCE STANOWISKA: cel karty CRET (CRET albo FAST), liczenie
         * po pojemniku, Auto-LPN i most GRAVIS. Wszystko domyślnie wyłączone;
         * GRAVIS pokazuje się tylko na kartach, które go potrzebują — w REFURB
         * i WHD ASIN jest przypięty do LPN w samym programie.
         */
        buildWorkflowSection() {
            const sec = UIBuilder.section(I18n.get('section_workflow'));

            // Cel własny: nowy proces (np. 65 na godzinę) działa od tej zmiany,
            // bez czekania na wydanie z nowym wpisem w RATE_TARGETS.
            const own = Math.floor(Utils.clampNum(store.userConfig.customTarget, 0, CONFIG.CUSTOM_TARGET_MAX, 0));
            sec.appendChild(UIBuilder.row(I18n.get('workflow_customTarget'), UIBuilder.live(h('input', {
                type: 'number', min: 0, max: CONFIG.CUSTOM_TARGET_MAX, value: own || '', placeholder: '0',
                inputMode: 'numeric', style: { width: '100px', textAlign: 'right' },
            }), text => {
                // Puste pole to „bez celu własnego” — tu nic się nie liczy na
                // stałe, więc nie trzeba wpisywać zera świadomie.
                const n = text.trim() === '' ? 0 : parseInt(text, 10);
                if (!Number.isFinite(n)) return;
                const next = Math.max(0, Math.min(CONFIG.CUSTOM_TARGET_MAX, n));
                if (next === store.userConfig.customTarget) return;
                store.userConfig.customTarget = next;
                this.rerender();
            })));
            sec.appendChild(UIBuilder.hint(I18n.get('workflow_customTargetHint')));

            // Które karty idą do tempa BIEŻĄCEGO zadania. Każde zadanie ma
            // własny wybór: proces liczony z CRET i REFURB, choć człowiek robi
            // też WHD, odznacza WHD tylko w sobie — zadania wcześniejsze
            // zachowują swoje tempo.
            const task = TaskManager.active();
            if (task) {
                const tabs = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 14px' } });
                Object.values(CONFIG.KNOWN_TAB_TYPES).forEach(t => {
                    const box = UIBuilder.checkbox(t.key, TaskManager.countsFor(task, t.key), v => {
                        TaskManager.setCounted(task.id, t.key, v);
                        this.rerender();
                    });
                    box.style.flexGrow = '0';
                    tabs.appendChild(box);
                });
                sec.appendChild(UIBuilder.row(I18n.get('workflow_rateTabs', { name: task.name }), tabs));
                sec.appendChild(UIBuilder.hint(I18n.get('workflow_rateTabsHint')));
            }

            if (store.currentTabType === 'CRET' && !own) {
                sec.appendChild(UIBuilder.row(I18n.get('workflow_cretProfile'), UIBuilder.select(
                    ['CRET', 'FAST'].map(k => ({ value: k, text: `${k} (${CONFIG.RATE_TARGETS[k] || 0}/h)` })),
                    store.userConfig.cretProfile, v => { store.userConfig.cretProfile = v; })));
            }
            sec.appendChild(UIBuilder.hint(I18n.get('workflow_targetHint', { value: ToteWatch.targetFor(store.currentTabType) || '—' })));
            sec.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('workflow_autoLpn'), !!store.userConfig.autoLpn,
                v => { store.userConfig.autoLpn = !!v; })));
            sec.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('workflow_clearSession'), !!store.userConfig.clearSession,
                v => { store.userConfig.clearSession = !!v; }, I18n.get('workflow_clearSessionHint'))));
            if (CONFIG.GRAVIS_TAB_TYPES.includes(store.currentTabType)) {
                sec.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('workflow_gravis'), !!store.userConfig.gravisAsin,
                    v => { store.userConfig.gravisAsin = !!v; if (!v) GravisBridge.close(); this.rerender(); })));
                if (store.userConfig.gravisAsin) {
                    sec.appendChild(UIBuilder.hint(I18n.get('workflow_gravisHowTo')));
                    sec.appendChild(UIBuilder.button(I18n.get(GravisBridge.connected() ? 'workflow_gravisConnected' : 'workflow_gravisOpen'),
                        () => { GravisBridge.open(); this.rerender(); }, { width: '100%' }));
                }
            }
            return sec;
        },

        buildCountersSection() {
            const sec = UIBuilder.section(I18n.get('section_globalStats'));
            Object.values(CONFIG.KNOWN_TAB_TYPES).forEach(t => {
                const row = h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '10px' } });
                row.appendChild(UIBuilder.checkbox(I18n.get('includeInGlobal_known', { tabName: I18n.get(t.displayNameKey) }), store.userConfig.globalStatsContributionKnown[t.key], v => {
                    store.userConfig.globalStatsContributionKnown[t.key] = v;
                    this.rerender();
                }));
                row.appendChild(h('span', { textContent: I18n.get('settings_manualCounterInputLabel') + ':', style: { whiteSpace: 'nowrap' } }));
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
            const focus = this.rememberFocus();
            this.el.innerHTML = '';
            this.el.appendChild(h('h2', { textContent: I18n.get('settingsPanelTitle'), style: { textAlign: 'center', marginTop: '0' } }));

            // Sekcje powstają w dowolnej kolejności, a na ekran idą w kolejności
            // PANEL_SECTIONS — po jednej sekcji na identyfikator.
            const parts = {};
            const put = (id, el) => { parts[id] = el; };

            // Język ma własną sekcję: zwinięty pokazuje tylko nagłówek.
            const secLang = UIBuilder.section(I18n.get('language'));
            secLang.appendChild(UIBuilder.row('', UIBuilder.select(CONFIG.AVAILABLE_LANGUAGES.map(l => ({ value: l.code, text: l.name })), store.userConfig.language, v => { store.userConfig.language = v; this.rerender(); })));
            put('language', secLang);
            put('tasks', this.buildTasksSection());
            put('global', this.buildCountersSection());

            // Ogólne
            const secGen = UIBuilder.section(I18n.get('section_general'));
            // Pełny reset usuwa wyłącznie klucze skryptu (ownKeys) — resztę
            // localStorage tej domeny trzyma T-REX.
            secGen.appendChild(UIBuilder.button(I18n.get('settings_resetAllDataButton'), () => {
                if (!confirm(I18n.get('settings_resetConfirm'))) return;
                Persistence.ownKeys().forEach(k => localStorage.removeItem(k));
                CONFIG.LEGACY_ID_PREFIXES.forEach(p => {
                    Object.keys(localStorage).filter(k => k.startsWith(p)).forEach(k => localStorage.removeItem(k));
                });
                sessionStorage.removeItem(Persistence.getKey(CONFIG.SESSION_STORAGE_TAB_INSTANCE_ID_KEY));
                location.reload();
            }, { background: '#d9534f', width: '100%', marginTop: '10px' }));

            // Reset samych liczników przedmiotów, bez utraty ustawień wyglądu.
            secGen.appendChild(UIBuilder.button(I18n.get('settings_resetCountersButton'), () => {
                if (!confirm(I18n.get('settings_resetCountersConfirm'))) return;
                SessionReset.resetItemData('ręczny reset z panelu ustawień', 'manual');
                this.rerender();
            }, { background: '#e0a800', color: '#141414', width: '100%', marginTop: '5px' }));
            put('general', secGen);

            // Nazwy własne zakładek
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
                put('current_tab', secCur);
            }

            // Efekty wizualne
            const secVis = UIBuilder.section(I18n.get('section_visualAids', { tabName: I18n.getTabName(store.currentTabInstanceId) }));
            secVis.appendChild(UIBuilder.row('', ...UIBuilder.slider(0, CONFIG.MAX_PAGE_OVERLAY_OPACITY_PERCENT, store.localTabConfig.pageOverlayOpacity, v => store.localTabConfig.pageOverlayOpacity = v, v => I18n.get('overlayOpacity', { value: v }))));
            secVis.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get('showPageIndicator'), store.localTabConfig.pageIndicatorTextVisible, v => store.localTabConfig.pageIndicatorTextVisible = v)));
            put('visual', secVis);

            // Stylizacja okna statystyk
            const secWin = UIBuilder.section(I18n.get('section_statsWindow'));
            // Zwinięta sekcja pokazuje tylko linie włączone — trzeba powiedzieć,
            // gdzie są pozostałe.
            const moreLines = UIBuilder.hint(I18n.get('statsWindow_moreLinesHint'));
            moreLines.dataset.shCollapsedOnly = '1';
            secWin.appendChild(moreLines);

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
                const lineBox = h('div', { dataset: { shLine: lineKey }, style: { border: '1px solid #ddd', padding: '8px', marginBottom: '8px', borderRadius: '4px' } });

                // Podpis linii stoi przy jej polu wyboru (LINE_HINTS).
                const hintKey = LINE_HINTS[lineKey];
                lineBox.appendChild(UIBuilder.row('', UIBuilder.checkbox(I18n.get(`lineSettings_${lineKey.split('_')[1]}`), cfg.visible,
                    v => store.localTabConfig.linesConfig[lineKey].visible = v, hintKey ? I18n.get(hintKey) : undefined)));

                // Kolor, alfa i rozmiar są na stałe podpięte do DOM, niezależnie
                // od stanu checkboxa.
                lineBox.appendChild(UIBuilder.row('Color/Alpha', UIBuilder.colorPickerWithAlpha(
                    cfg.colorHex, cfg.alpha,
                    hex => store.localTabConfig.linesConfig[lineKey].colorHex = hex,
                    alpha => store.localTabConfig.linesConfig[lineKey].alpha = alpha
                )));
                lineBox.appendChild(UIBuilder.row('Size', ...UIBuilder.slider(8, 36, cfg.fontSize, v => store.localTabConfig.linesConfig[lineKey].fontSize = v, v => `${v}px`)));


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

            // Przeciąganie i reset pozycji okna widać zawsze, także w zwiniętej
            // sekcji — okno przesuwa się częściej niż zmienia kolory.
            const dragBtn = secWin.appendChild(UIBuilder.button(dragBtnText, () => {
                store.uiFlags.isStatsWindowDragging = !store.uiFlags.isStatsWindowDragging;
                this.rerender();
            }, { width: '100%', marginTop: '10px', transition: 'all 0.2s', ...dragBtnOverrides }));
            dragBtn.dataset.shKeep = '1';

            const resetBtn = secWin.appendChild(UIBuilder.button(I18n.get('settings_resetWindowPositionButton'), () => {
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
            resetBtn.dataset.shKeep = '1';
            put('window', secWin);

            // Skróty klawiszowe
            const secKeys = UIBuilder.section(I18n.get('section_keyboardShortcuts'));
            const keyOpts = CONFIG.AVAILABLE_SHORTCUT_KEYS.map(k => ({ value: k.code, text: I18n.get(k.name_key) }));
            secKeys.appendChild(UIBuilder.row(I18n.get('incrementKey'), UIBuilder.select(keyOpts, store.userConfig.keyboardShortcuts.INCREMENT, v => store.userConfig.keyboardShortcuts.INCREMENT = v)));
            secKeys.appendChild(UIBuilder.row(I18n.get('decrementKey'), UIBuilder.select(keyOpts, store.userConfig.keyboardShortcuts.DECREMENT, v => store.userConfig.keyboardShortcuts.DECREMENT = v)));
            secKeys.appendChild(UIBuilder.row(I18n.get('toggleWindowKey'), UIBuilder.select(keyOpts, store.userConfig.keyboardShortcuts.TOGGLE_WINDOW, v => store.userConfig.keyboardShortcuts.TOGGLE_WINDOW = v)));
            put('keys', secKeys);
            put('workflow', this.buildWorkflowSection());

            // Autoinkrementacja
            const secAuto = UIBuilder.section(I18n.get('section_autoIncrement'));
            secAuto.appendChild(UIBuilder.row('', ...UIBuilder.slider(CONFIG.MIN_TRIGGER_DEBOUNCE_MS, CONFIG.MAX_TRIGGER_DEBOUNCE_MS, store.userConfig.triggerMutationDebounceMs, v => store.userConfig.triggerMutationDebounceMs = v, v => I18n.get('scanIntervalAutoIncrement', { value: v }))));
            put('auto', secAuto);

            /**
             * GŁÓWNY WYŁĄCZNIK MODUŁU CEN — przed kartą ceny i dziennikiem
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
                }, I18n.get('priceModule_hint'))));
            put('price_module', secModule);

            if (!moduleOn) {
                // Dalszych sekcji nie ma: pokazane ustawienia karty sugerowałyby,
                // że przy wyłączonym module coś dzieje się w tle.
                const off = UIBuilder.section(I18n.get('priceCard_section'));
                off.appendChild(UIBuilder.hint(I18n.get('priceModule_offNotice')));
                put('price_card', off);
            } else {

            // Karta ceny
            const secPrice = UIBuilder.section(I18n.get('priceCard_section'));
            const pc = store.localTabConfig.priceCard;

            // Sklep: jedno ustawienie na link, wykres i walutę.
            const mkKey = store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE;
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_marketplace'), UIBuilder.select(
                Object.entries(CONFIG.MARKETPLACES).map(([k, m]) => ({
                    value: k, text: m.host.replace(/^www\./, '') + (PriceSources.coversMarket(k) ? '' : '  ⚠'),
                })), mkKey, v => { store.userConfig.marketplace = v; this.rerender(); })));
            if (!PriceSources.coversMarket(mkKey)) {
                secPrice.appendChild(h('div', {
                    textContent: '⚠ ' + I18n.get('priceCard_marketNoData'),
                    style: { fontSize: '0.85em', color: '#b06a00', margin: '-4px 0 10px 0', lineHeight: '1.35' },
                }));
            }

            // Waluta, w której kwoty się pokazuje. Liczy się zawsze w euro,
            // więc przełączenie w trakcie zmiany niczego nie gubi. Ustawienie
            // wspólne jak sklep: wszystkie karty mówią jedną walutą.
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_displayCurrency'), UIBuilder.select(
                Object.entries(CONFIG.DISPLAY_CURRENCIES).map(([code, sign]) => ({
                    value: code, text: `${code} (${sign})`,
                })),
                FxRates.displayCurrency(),
                v => { store.userConfig.displayCurrency = v; PriceCard.render(); this.rerender(); })));
            secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_displayCurrencyHint')));

            // Źródło ceny — tryby z PriceSources, od zalecanego do zapasowych.
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_source'), UIBuilder.select(
                PriceSources.modes.map(m => ({ value: m.value, text: I18n.get(m.labelKey) })),
                pc.source, v => { store.localTabConfig.priceCard.source = v; this.rerender(); })));

            secPrice.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                I18n.get('priceCard_fallback'), pc.marketFallback !== false,
                v => store.localTabConfig.priceCard.marketFallback = v, I18n.get('priceCard_fallbackHint'))));

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

                if (PriceSources.showsChart(pc.source)) {
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
                        v => store.localTabConfig.priceCard.asinClickable = v, I18n.get('priceCard_asinClickableHint'))));
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
                // karta nadal jest użyteczna — legenda wykresu nigdzie nie znika.
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
            put('price_card', secPrice);

            // Dziennik wartości
            const secVal = UIBuilder.section(I18n.get('valueLog_section'));
            secVal.appendChild(UIBuilder.row('', UIBuilder.checkbox(
                I18n.get('valueLog_enabled'), pc.logValues,
                v => { store.localTabConfig.priceCard.logValues = v; this.rerender(); }, I18n.get('valueLog_hint'))));

            const vt = ValueLog.totals();
            // Ta sama waluta co w linii 6 — dwie sumy jednego dziennika
            // w dwóch walutach to zagadka, a nie informacja.
            const sumCur = FxRates.sumCurrency();
            secVal.appendChild(h('div', {
                textContent: I18n.get('valueLog_stats', {
                    count: vt.count,
                    sum: FxRates.fromEur(vt.net, sumCur).toFixed(2),
                    currency: CONFIG.DISPLAY_CURRENCIES[sumCur],
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
            put('value_log', secVal);

            }   // koniec gałęzi „moduł cen włączony”

            // Wybór przerwy
            const secLunch = UIBuilder.section(I18n.get('section_lunchSelection'));
            const sType = store.sessionConfig.shiftType || 'day';
            const lOpts = CONFIG.LUNCH_OPTIONS_BASE.map((o, i) => ({ value: i, text: I18n.get(o.text_key), type: o.type })).filter(o => o.type === sType);
            secLunch.appendChild(UIBuilder.row('', UIBuilder.select(lOpts, store.sessionConfig.selectedLunchIndex, v => store.sessionConfig.selectedLunchIndex = parseInt(v))));
            put('lunch', secLunch);

            /**
             * KOD USTAWIEŃ
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
            secCode.appendChild(UIBuilder.row(I18n.get('configCode_yours'), codeBox));
            const link = ConfigCode.link();
            secCode.appendChild(link
                ? UIBuilder.row(I18n.get('configCode_link'), readOnlyBox(link))
                : UIBuilder.hint(I18n.get('configCode_linkMissing')));
            if (link) {
                // Kod obrazkowy rysuje się dopiero na żądanie: panel otwiera
                // się przy starcie, a obrazek jest potrzebny raz na maszynę.
                const holder = h('div');
                secCode.appendChild(UIBuilder.button(I18n.get('configCode_showMatrix'), () => {
                    holder.textContent = '';
                    const canvas = this.matrixCanvas(link);
                    if (!canvas) return;
                    holder.appendChild(canvas);
                    holder.appendChild(UIBuilder.hint(I18n.get('configCode_matrixHint')));
                }));
                secCode.appendChild(holder);
            }

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
            put('code', secCode);

            const secDiag = UIBuilder.section(I18n.get('diag_open'));
            secDiag.appendChild(UIBuilder.button(I18n.get('diag_open'), () => Diag.toggle(), { width: '100%' }));
            secDiag.appendChild(UIBuilder.hint(I18n.get('diag_hint')));
            put('diag', secDiag);

            PANEL_SECTIONS.forEach(def => {
                if (parts[def.id]) this.el.appendChild(this.collapsible(def, parts[def.id]));
            });

            /**
             * Zamknięcie przyklejone do dołu panelu (`position: sticky`):
             * widać je zawsze, bez przewijania na koniec, ile by sekcji nie
             * przybyło. Ustawienia zapisują się od razu przy zmianie, więc
             * przycisk tylko zamyka panel — wcześniej niczego nie gubi.
             *
             * Ujemne marginesy wyrównują pasek z krawędziami panelu (wcięcia
             * 15/25 px). Tło panelu jest lekko przezroczyste, więc pod paskiem
             * treść przewijana jest dodatkowo rozmyta — inaczej prześwitywałaby
             * spod przycisku.
             */
            this.el.appendChild(h('div', {
                id: 'settingsPanelFooter',
                style: {
                    position: 'sticky', bottom: '-15px', zIndex: '1',
                    margin: '20px -15px -15px -25px', padding: '10px 15px 15px 25px',
                    background: CONFIG.SETTINGS_PANEL_BACKGROUND_COLOR,
                    backdropFilter: 'blur(6px)',
                    borderTop: `1px solid ${CONFIG.SETTINGS_PANEL_ACCENT_COLOR}33`,
                    boxShadow: '0 -4px 8px rgba(0,0,0,0.06)',
                },
            }, UIBuilder.button(I18n.get('settings_applyAndCloseButton'), () => this.toggle(),
                { width: '100%', padding: '10px', fontSize: '1.1em' })));

            this.el.scrollTop = scrollTop;
            this.restoreFocus(focus);
        }
    };
