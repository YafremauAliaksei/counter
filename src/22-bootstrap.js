    // ==========================================
    // 8. ROZRUCH
    // ==========================================
    const Main = {
        identifyTab() {
            const fullUrl = window.location.href.toUpperCase();

            // 1. Wyciągamy parametr gradingMode wyrażeniem regularnym.
            // Obchodzi to ograniczenia URLSearchParams, gdy parametry są schowane
            // za hashem (routing SPA).
            const match = fullUrl.match(/[?&#]GRADINGMODE=([^&#]*)/);
            const gradingMode = match ? match[1] : null;

            Utils.log(`[DIAGNOSTICS] Full URL: ${fullUrl}`);
            Utils.log(`[DIAGNOSTICS] Extracted gradingMode: ${gradingMode}`);

            let known;
            if (gradingMode) {
                // Dokładne dopasowanie
                known = Object.values(CONFIG.KNOWN_TAB_TYPES).find(t => gradingMode === t.urlKeyword.toUpperCase());
                Utils.log(`[DIAGNOSTICS] Strict match attempt result:`, known ? known.key : 'NOT_FOUND');
            }

            if (!known) {
                // Zapasowo po podłańcuchu.
                // KRYTYCZNIE WAŻNE: sortujemy klucze po długości malejąco.
                // Gwarantuje to, że CRETURN_REFURB (14 znaków) sprawdzi się PRZED
                // CRETURN (7 znaków).
                const sortedTypes = Object.values(CONFIG.KNOWN_TAB_TYPES).sort((a, b) => b.urlKeyword.length - a.urlKeyword.length);
                known = sortedTypes.find(t => fullUrl.includes(t.urlKeyword.toUpperCase()));
                Utils.log(`[DIAGNOSTICS] Fallback substring match result:`, known ? known.key : 'NOT_FOUND');
            }

            if (known) {
                store.currentTabType = known.key;
                store.currentTabInstanceId = known.key;
            } else {
                store.currentTabType = CONFIG.UNKNOWN_TAB_TYPE_KEY;
                store.currentTabInstanceId = sessionStorage.getItem(StorageManager.getKey(CONFIG.SESSION_STORAGE_TAB_INSTANCE_ID_KEY)) || Utils.generateId(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX);
                sessionStorage.setItem(StorageManager.getKey(CONFIG.SESSION_STORAGE_TAB_INSTANCE_ID_KEY), store.currentTabInstanceId);
                if (!store.userConfig.customTabSettings[store.currentTabInstanceId]) {
                    store.userConfig.customTabSettings[store.currentTabInstanceId] = { displayName: `Tab (${store.currentTabInstanceId.substring(19, 23)})`, includeInGlobal: true };
                }
            }

            Utils.log(`[DIAGNOSTICS] Final assigned tab type: ${store.currentTabType}`);
            store.sessionConfig.activeTabInstances[store.currentTabInstanceId] = Date.now();
        },
        /**
         * Póki zmiana nie jest rozpoznana, sprawdzać ją z timera.
         * Jedyny realny przypadek: skrypt wklejono do konsoli parę minut przed
         * otwarciem okna zmiany (np. o 18:17). W 8.0.0 ShiftManager.update()
         * wywoływał się dokładnie raz i taka karta zostawała bez zmiany do końca.
         * Sprawdzanie idzie TYLKO póki zmiany nie ma, więc wyzerować już
         * trwającej zmiany ten timer nie może.
         */
        shiftWatchTimer: null,
        startShiftWatch() {
            if (store.sessionConfig.shiftType) return;
            // 8.3.0: uchwyt timera trzyma Main. Wcześniej żył tylko w zmiennej
            // lokalnej i gdyby zmiana nigdy nie została rozpoznana (skrypt
            // wklejono w dzień wolny), nie było czym zatrzymać przeglądu.
            clearInterval(this.shiftWatchTimer);
            this.shiftWatchTimer = setInterval(() => {
                ShiftManager.update();
                if (store.sessionConfig.shiftType) {
                    clearInterval(this.shiftWatchTimer);
                    this.shiftWatchTimer = null;
                    Utils.log('Zmiana rozpoznana przez timer oczekiwania.');
                }
            }, CONFIG.SHIFT_RETRY_INTERVAL_MS);
        },

        /**
         * Rozbiórka do połowy postawionego skryptu (8.3.0).
         *
         * Wcześniej catch w init() jedynie cofał flagę uruchomienia na false. Ale
         * jeśli awaria zdarzyła się PO utworzeniu interfejsu, w stronie żyły już
         * okno statystyk ze swoim setInterval, MutationObserver i nasłuchy
         * zdarzeń. Powtórne wklejenie poprawionego pliku — a to wprost zalecany
         * sposób naprawy — stawiało DRUGI egzemplarz z własnym stanem i drugim
         * obserwatorem, a oba zwiększały ten sam klucz localStorage.
         */
        teardown() {
            if (AutoTrigger.observer) { AutoTrigger.observer.disconnect(); AutoTrigger.observer = null; }
            if (StatsWindowRenderer.tickTimer) { clearInterval(StatsWindowRenderer.tickTimer); StatsWindowRenderer.tickTimer = null; }
            if (this.shiftWatchTimer) { clearInterval(this.shiftWatchTimer); this.shiftWatchTimer = null; }
            if (InputManager.onKeyDown) document.removeEventListener('keydown', InputManager.onKeyDown, true);
            if (StorageManager.onStorage) window.removeEventListener('storage', StorageManager.onStorage);
            if (PriceCard.onCspViolation) document.removeEventListener('securitypolicyviolation', PriceCard.onCspViolation);
            if (this.onPageHide) { window.removeEventListener('pagehide', this.onPageHide); this.onPageHide = null; }
            // 9.1.0: pojedyncze timery też gasimy. Wcześniej przeżywały rozbiórkę
            // i po sekundzie-dwóch ruszały render() zdjętego już interfejsu — na
            // starym egzemplarzu dawało to strumień wyjątków dokładnie w chwili,
            // gdy wklejano poprawiony plik.
            clearTimeout(SettingsPanel._rerenderTimer);
            clearTimeout(Notifier._hideTimer);
            clearTimeout(ValueLog._archiveTimer);
            clearTimeout(ValueLog._writeBackTimer);
            ValueLog._archiveTimer = ValueLog._writeBackTimer = null;
            document.querySelectorAll(`[id^="${CONFIG.SCRIPT_ID_PREFIX}"]`).forEach(el => el.remove());
            bus.clear();
            // Dostęp z konsoli należał do zdjętego egzemplarza: zostawić go znaczy
            // trzymać w pamięci cały stan i wszystkie menedżery.
            try { delete window[CONFIG.SCRIPT_ID_PREFIX + 'API']; delete window.SH; } catch (e) { /* własność mogła być niekasowalna — rozbiórki to nie zatrzymuje */ }
            // Egzemplarza na stronie już nie ma — więc i zamek na powtórne
            // uruchomienie się zdejmuje, inaczej poprawionego pliku nie dałoby się
            // już wkleić.
            window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = false;
            Utils.log('Egzemplarz zdjęty ze strony. Można wkleić skrypt od nowa.');
        },

        init() {
            if (window[CONFIG.SCRIPT_ID_PREFIX + 'INIT']) {
                Utils.log('Skrypt już działa na tej stronie — powtórne wklejenie zignorowane. Aby zrestartować, przeładuj stronę (F5).');
                return;
            }
            window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = true;

            try {
                StorageManager.purgeLegacyKeys();
                StorageManager.purgeLegacySharedKeys();

                // KOLEJNOŚĆ JEST WAŻNA. W 8.0.0 loadAll() szedł pierwszy, a czyta
                // on ustawienia po kluczu store.currentTabInstanceId, który w tym
                // momencie był jeszcze null. Przez to wygląd okna (pozycja, kolory,
                // rozmiary, widoczność linii) nie przywracał się po przeładowaniu
                // strony nigdy.
                this.identifyTab();
                StorageManager.loadAll();

                // Dane poprzedniej zmiany na maszynach bez resetu sesji.
                // Dziennik wartości podnosi się PRZED sprawdzeniem zmiany:
                // SessionReset.resetItemData() go czyści i do tego momentu musi
                // być już wczytany, inaczej wyczyści się pustka, a wpisy
                // poprzedniej zmiany zostaną w localStorage.
                ValueLog.load();
                Routing.startItem('uruchomienie skryptu');

                /**
                 * KURSY WALUT BEZ SIECI (9.2.0).
                 *
                 * Tu była jedyna rzecz, która wychodziła do internetu od razu po
                 * uruchomieniu. Teraz na starcie czyta się wyłącznie to, co leży
                 * w localStorage, a jeśli nie leży nic — tablicę wpisaną w plik.
                 *
                 * Pobranie na żywo robi PriceModule.enable(), czyli moment,
                 * w którym człowiek świadomie włącza moduł cen.
                 */
                FxRates.initOffline();

                SessionReset.checkStaleOnBoot();
                // Zmiana jest inna, ale młodsza niż 12 h (dzień -> noc przy tym
                // samym komputerze).
                ShiftManager.update();
                SessionReset.pruneTabInstances(false);

                store.initialized = true;
                StorageManager.saveState();

                CSSManager.init();
                StatsWindowRenderer.init();
                DragDropManager.init();
                SettingsPanel.init();
                VisualsRenderer.init();
                PriceCard.init();
                PriceCardDrag.init();
                Notifier.init();
                InputManager.init();
                AutoTrigger.init();
                StorageManager.listen();

                // 8.4.0: przedmiot przeszedł pełną ścieżkę — zapisujemy jego
                // wartość. Cena bierze się z pamięci sesji; jeśli jeszcze nie
                // przyjechała, pozycja położy się bez ceny i dopisze się
                // w resolve() po gotowości.
                bus.on('item:completed', () => {
                    const asin = PriceCard.shownAsin;
                    const r = asin ? PriceCard.cache.get(asin) : null;
                    const price = (r && r.status === 'ok' && r.current) ? r.current : null;
                    // 9.1.0: add() zwraca id wpisu, a nie jego indeks. Dziennik
                    // jest wspólny na wszystkie karty, scalanie przestawia pozycje
                    // po czasie i indeks przestał być adresem.
                    const entryId = ValueLog.add(asin, price, store.currentTabInstanceId);
                    // Znak stawia Routing: albo od razu (kod już znany), albo
                    // później, gdy kod pojawi się na ekranie.
                    //
                    // Wołamy ZAWSZE, także gdy wpisu dziennika nie ma (entryId
                    // null przy wyłączonym module cen). Do 1.0.0 stał tu warunek
                    // `if (entryId)` i był poprawny, dopóki jedynym odbiorcą
                    // kierunku był dziennik. Od czasu procentu sprzedaży kierunek
                    // ma drugiego odbiorcę, który sieci nie potrzebuje — a przy
                    // ustawieniach domyślnych to jest JEDYNY odbiorca.
                    Routing.onCompleted(entryId);
                });

                /**
                 * Początek nowego przedmiotu do ewidencji kierunku. Sygnały są dwa
                 * i oba są potrzebne, dokładnie z tego samego powodu, co w karcie
                 * ceny:
                 *   - wzniesienie flagi `poniżej` pokrywa zwykły cykl;
                 *   - zmiana ASIN pokrywa przedmiot przerwany, po którym flaga
                 *     zostaje wzniesiona i przejścia false->true nie będzie.
                 */
                // `poniżej` to PRAWDZIWA granica przedmiotu, więc tu zamyka się
                // też wiszący Secondary-Sorting: uściślenie nie przyszło, czyli
                // przedmiot jest niesprzedażowy (patrz Routing.closeAmbiguous).
                bus.on('store:changed:uiFlags.itemInProgress', (d) => {
                    if (d.value === true) Routing.startItem('poniżej', { closeAmbiguous: true });
                });
                // Zmiana ASIN granicą NIE jest: linia uściślająca czasem przychodzi
                // już po tym, jak na ekranie jest nowy produkt.
                bus.on('price:asinChanged', (d) => Routing.startItem('zmienił się ASIN ' + d.asin));

                // Wyjście ze strony: archiwum pisze się z opóźnieniem (patrz
                // ValueLog.scheduleArchive), więc ostatnia paczka przedmiotów
                // inaczej by do niego nie zdążyła. Sam dziennik pozycji jest
                // w tym momencie już w localStorage — on pisze się od razu.
                this.onPageHide = () => { try { ValueLog.flushArchive(); } catch (e) { /* strona już się zamyka — nie ma komu zgłosić błędu */ } };
                window.addEventListener('pagehide', this.onPageHide);

                // Autozapis ustawień. Do 8.1.0 stan zapisywał się dopiero przy
                // zamykaniu panelu i przeładowanie strony w środku zmiany go gubiło.
                // 8.3.0: zapisują się tylko te gałęzie, które saveState() naprawdę
                // pisze. uiFlags nie są trwałe, a liczniki idą osobnym kluczem
                // przez saveCounter() — obie gałęzie wcześniej na darmo budziły
                // autozapis.
                onStorePaths(['userConfig', 'sessionConfig', 'localTabConfig'],
                             () => StorageManager.scheduleSave());

                this.startShiftWatch();
                StatsWindowRenderer.renderContent();

                // Dostęp do wnętrza z konsoli. Skrypt uruchamia się właśnie przez
                // F12, więc możliwość obejrzenia stanu i wywołania metody w locie
                // jest narzędziem roboczym, a nie pozostałością po debugowaniu.
                window[CONFIG.SCRIPT_ID_PREFIX + 'API'] = window.SH = {
                    store, CONFIG, PriceCard, ShiftManager, SessionReset,
                    StorageManager, SettingsPanel, AutoTrigger, I18n,
                    // 8.4.0
                    KeepaOCR, ValueLog, FxRates, Routing,
                    // 9.2.0 — potrzebne testom i diagnostyce
                    Utils, PriceModule, StatsWindowRenderer, CSSManager, LINE_KEYS,
                    DEFAULT_LINE_CONFIG, DEFAULT_LOCAL_CONFIG,
                    priceModuleOn,
                    /**
                     * Włączenie/wyłączenie modułu cen z konsoli. Robi dokładnie
                     * to samo, co przełącznik w panelu ustawień.
                     */
                    priceOn: () => { PriceModule.enable(); return PriceCard.stats(); },
                    priceOff: () => { PriceModule.disable(); return PriceCard.stats(); },
                    /**
                     * Logi w konsoli — włącz / wyłącz / sprawdź, bez przeładowania.
                     * Wartość startowa siedzi w SCRIPT_LOGS_ENABLED na górze pliku.
                     */
                    logsOn: () => { CONFIG.DEBUG_MODE = true; console.log('[' + CONFIG.SCRIPT_NAME + '] logi WŁĄCZONE'); return true; },
                    logsOff: () => { console.log('[' + CONFIG.SCRIPT_NAME + '] logi WYŁĄCZONE'); CONFIG.DEBUG_MODE = false; return false; },
                    logs: () => CONFIG.DEBUG_MODE,
                    fxStatus: () => FxRates.status(),
                    fxRefresh: () => FxRates.refresh(),
                    routeInfo: () => Routing.info(),
                    valueReport: () => ValueLog.report(),
                    valueArchive: () => ValueLog.archive(),
                    marketplace: () => marketplace(),
                    productUrl: (asin) => productUrl(asin || PriceCard.shownAsin),
                    /**
                     * Podnieść limity zapytań bez przeładowania strony.
                     * Potrzebne, gdy zmiana okazała się dłuższa niż zakładano:
                     * ceny przestają przychodzić, a przewklejać skryptu w środku
                     * zmiany nie wolno — wyzerują się liczniki i dziennik.
                     *   SH.setLimits({ images: 3000 })
                     */
                    setLimits: ({ images, text } = {}) => {
                        if (typeof images === 'number') CONFIG.PRICE_MAX_IMAGE_REQUESTS = images;
                        if (typeof text === 'number') CONFIG.PRICE_MAX_REQUESTS_PER_SESSION = text;
                        const now = {
                            obrazki: `${PriceCard.imageCount} / ${CONFIG.PRICE_MAX_IMAGE_REQUESTS}`,
                            tekst: `${PriceCard.requestCount} / ${CONFIG.PRICE_MAX_REQUESTS_PER_SESSION}`,
                        };
                        Utils.log('Limity zapytań:', now);
                        PriceCard.refresh();
                        return now;
                    },
                    /** Przeczytać cenę z wykresu teraz, z pominięciem pamięci. */
                    readPrice: (asin) => KeepaOCR.read(asin || PriceCard.shownAsin),
                    // 8.3.0: Main dostępny z konsoli dla SH.Main.teardown() —
                    // poprawnego zdjęcia do połowy postawionego egzemplarza.
                    Main,
                    priceStats: () => PriceCard.stats(),
                    /**
                     * Pełna diagnostyka CSP: co pozwala polityka strony i co
                     * naprawdę przechodzi. Asynchroniczna — wołać przez
                     * `await SH.cspReport()` albo `SH.cspReport().then(console.table)`.
                     *
                     * 9.2.0: praktyczna część sprawdzenia (obrazek Keepa i zapytanie
                     * do r.jina.ai) wychodzi w sieć, więc wymaga włączonego modułu
                     * cen. Sam rozbiór polityki działa zawsze — nie wychodzi poza
                     * własną domenę.
                     */
                    cspReport: async () => {
                        const parsed = await PriceCard.readCsp();
                        const HOSTS = {
                            'graph.keepa.com': 'img-src',
                            'r.jina.ai': 'connect-src',
                            'api.keepa.com': 'connect-src',
                            'raw.githubusercontent.com': 'connect-src',
                        };
                        const verdict = {};
                        for (const [host, dir] of Object.entries(HOSTS)) {
                            verdict[`${host} (${dir})`] = PriceCard.cspAllows(parsed, dir, host);
                        }

                        let imgTest = 'moduł cen wyłączony — sprawdzenie nie było wykonane';
                        let netTest = 'moduł cen wyłączony — sprawdzenie nie było wykonane';
                        if (priceModuleOn()) {
                            // Praktyczne sprawdzenie: polityka polityką, a ważne
                            // jest to, co naprawdę przechodzi.
                            imgTest = await new Promise(res => {
                                const im = new Image();
                                im.referrerPolicy = 'no-referrer';
                                im.onload = () => res(im.naturalWidth > 10 ? 'załadowany' : 'pusty');
                                im.onerror = () => res('ZABLOKOWANY');
                                setTimeout(() => res('przekroczony czas'), 8000);
                                im.src = PriceCard.keepaUrl('B0915C748N');
                            });
                            try {
                                const r = await fetch('https://r.jina.ai/https://example.com', {
                                    headers: { 'x-cache-tolerance': '259200' },
                                });
                                netTest = 'przeszedł, HTTP ' + r.status;
                            } catch (e) { netTest = 'ZABLOKOWANY (' + e.message + ')'; }
                        }

                        return {
                            'polityka wzięta z': parsed.source || 'polityki nie znaleziono',
                            'pełny tekst': parsed.raw || '—',
                            'rozbiór po hostach': verdict,
                            'sprawdzenie faktyczne: obrazek Keepa': imgTest,
                            'sprawdzenie faktyczne: zapytanie r.jina.ai': netTest,
                            'zarejestrowane blokady': {
                                obrazek: PriceCard.csp.img,
                                zapytania: PriceCard.csp.net,
                            },
                        };
                    },
                    forcePrice: (asin) => {
                        const target = asin || PriceCard.shownAsin;
                        if (!target) {
                            Utils.error('ASIN nie podany, a na ekranie go nie ma — nie ma o co pytać.');
                            return Promise.resolve(null);
                        }
                        if (!priceModuleOn()) {
                            Utils.error('Moduł cen wyłączony. Włącz go: SH.priceOn()');
                            return Promise.resolve(null);
                        }
                        return PriceCard.resolve(target, { manual: true });
                    },
                };

                Utils.log(`v${CONFIG.SCRIPT_VERSION} załadowany. Karta: ${store.currentTabInstanceId}, zmiana: ${store.sessionConfig.shiftType || 'nierozpoznana'}.`);
                Utils.log(priceModuleOn()
                    ? 'Moduł cen WŁĄCZONY — zapytania sieciowe dozwolone.'
                    : 'Moduł cen wyłączony: zapytań sieciowych nie było i nie będzie do ręcznego włączenia (SH.priceOn() albo panel ustawień).');
            } catch (e) {
                // Bez tego jeden błąd na starcie wygląda jak „nic się nie stało”:
                // przy uruchamianiu z konsoli to najczęstszy sposób stracenia
                // pół godziny.
                window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = false;
                // 8.3.0: sprzątamy po sobie wszystko, co zdążyliśmy postawić —
                // inaczej powtórne wklejenie daje dwa działające egzemplarze naraz.
                try { this.teardown(); } catch (e2) { Utils.fatal('Rozbiórka po awarii nie powiodła się:', e2); }
                Utils.fatal('Inicjalizacja nie powiodła się, skrypt nie działa:', e);
            }
        }
    };
