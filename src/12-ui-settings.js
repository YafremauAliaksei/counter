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
        },
        /**
         * Odroczone przerysowanie (8.3.0).
         *
         * Obsługi kontrolek wołały this.render() wprost, a render() zaczyna się
         * od `this.el.innerHTML = ''` — czyli zdejmował element, który akurat
         * w tym momencie wysyła zdarzenie. Przeglądarki to przeżywają, ale
         * konstrukcja jest krucha, a przy wywołaniach zagnieżdżonych (checkbox ->
         * render -> checkbox) zachowanie nie jest już określone. Teraz
         * przerysowanie wychodzi poza granicę bieżącego zdarzenia i skleja się,
         * jeśli poproszono o nie kilka razy.
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
        render() {
            // 8.3.0: panel nadal składa się w całości od nowa, ale przewijanie
            // nie skacze już na początek — wcześniej było to zapisane w „znanych
            // ograniczeniach” i przeszkadzało w ustawianiu dolnych sekcji.
            const scrollTop = this.el.scrollTop;
            this.el.innerHTML = '';
            this.el.appendChild(h('h2', { textContent: I18n.get('settingsPanelTitle'), style: { textAlign: 'center', marginTop: '0' } }));

            // 1. Ogólne
            const secGen = UIBuilder.section(I18n.get('section_general'));
            secGen.appendChild(UIBuilder.row(I18n.get('language'), UIBuilder.select(CONFIG.AVAILABLE_LANGUAGES.map(l => ({ value: l.code, text: l.name })), store.userConfig.language, v => { store.userConfig.language = v; this.rerender(); })));
            // 8.1.0: było localStorage.clear() — to kasowało magazyn CAŁEJ domeny,
            // razem z roboczym stanem samego TREX. Teraz usuwane są wyłącznie
            // klucze skryptu.
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
                    // 8.3.0: piszemy całym obiektem. Wcześniej było tu odwołanie
                    // do `...[id].includeInGlobal`, choć dwie linie wyżej na ten
                    // sam przypadek stał już zapasowy `cust`: gdyby wpisu nie było,
                    // checkbox wywalałby się na TypeError.
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
                // co znaczą te dwie liczby.
                if (lineKey === 'line7_compact') {
                    lineBox.appendChild(UIBuilder.hint(I18n.get('lineSettings_compactHint')));
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
                // 9.2.0: pozycję nakłada renderer, bo od tej wersji potrafi ona
                // być przyklejona do dołu, a nie tylko do góry. Ręczne ustawianie
                // top/left tutaj zostawiłoby stare `bottom` i okno wylądowałoby
                // w dwóch miejscach naraz.
                StatsWindowRenderer.applyPosition();
                if (store.uiFlags.isStatsWindowDragging) {
                    store.uiFlags.isStatsWindowDragging = false;
                }
                this.rerender();
            }, { width: '100%', marginTop: '5px' }));
            this.el.appendChild(secWin);

            // 5. Statystyki globalne i liczniki ręczne
            const secGlob = UIBuilder.section(I18n.get('section_globalStats'));
            Object.values(CONFIG.KNOWN_TAB_TYPES).forEach(t => {
                const row = h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '5px', gap: '10px' } });
                row.appendChild(UIBuilder.checkbox(I18n.get('includeInGlobal_known', { tabName: I18n.get(t.displayNameKey) }), store.userConfig.globalStatsContributionKnown[t.key], v => store.userConfig.globalStatsContributionKnown[t.key] = v));
                row.appendChild(h('span', { textContent: I18n.get('settings_manualCounterInputLabel') + ':' }));
                row.appendChild(UIBuilder.numberInput(store.tabCounters[t.key] || 0, v => { store.tabCounters[t.key] = v; StorageManager.saveCounter(t.key, v); }));
                secGlob.appendChild(row);
            });
            this.el.appendChild(secGlob);

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
             * 7a. GŁÓWNY WYŁĄCZNIK MODUŁU CEN (9.2.0).
             *
             * Osobna sekcja, postawiona PRZED kartą ceny i dziennikiem wartości,
             * bo rozstrzyga o obu naraz. Póki jest wyłączony, sieć śpi.
             *
             * Włączenie jest tu obsłużone jawnie, a nie zostawione komuś innemu:
             * dopiero w tym momencie wolno pobrać kursy walut i zapytać o cenę
             * przedmiotu, który akurat jest na ekranie. To jedyne miejsce
             * w całym pliku, z którego rusza pierwsze zapytanie do sieci.
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
                // Dalszych sekcji nie rysujemy wcale. To nie jest kosmetyka:
                // ustawienia karty ceny sterują zachowaniem, którego przy
                // wyłączonym module nie ma, a pokazywanie ich sugerowałoby, że
                // coś się jednak dzieje w tle.
                const off = UIBuilder.section(I18n.get('priceCard_section'));
                off.appendChild(UIBuilder.hint(I18n.get('priceModule_offNotice')));
                this.el.appendChild(off);
            } else {

            // 7b. Karta ceny (8.2.0)
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

            // 8.4.0: trzy pozycje zamiast checkboxa „ciągnij tekstem”.
            // Kolejność na liście — od zalecanej do zapasowych.
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

                // Dolna granica zeszła z 14 na 11: karta ma dać się zrównać
                // z liniami okna statystyk, a te schodzą niżej.
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

            // 7c. Dziennik wartości (8.4.0)
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

            // Zamknięcie
            this.el.appendChild(h('hr', { style: { margin: '20px 0' } }));
            this.el.appendChild(UIBuilder.button(I18n.get('settings_applyAndCloseButton'), () => this.toggle(), { width: '100%', padding: '10px', fontSize: '1.1em' }));

            this.el.scrollTop = scrollTop;
        }
    };
