    // ==========================================
    // 8. ROZRUCH
    // ==========================================
    const Main = {
        identifyTab() {
            const fullUrl = window.location.href.toUpperCase();

            // 1. Parametr gradingMode wyrażeniem regularnym — działa także, gdy
            // parametry są za hashem (routing SPA), gdzie URLSearchParams ich nie widzi.
            const match = fullUrl.match(/[?&#]GRADINGMODE=([^&#]*)/);
            const gradingMode = match ? match[1] : null;

            Utils.log(`[DIAGNOSTICS] Full URL: ${fullUrl}`);
            Utils.log(`[DIAGNOSTICS] Extracted gradingMode: ${gradingMode}`);

            // Działy ręczne (bez `urlKeyword`, np. OTHER) nie mają swojej karty
            // i nie biorą udziału w rozpoznawaniu.
            const detectable = Object.values(CONFIG.KNOWN_TAB_TYPES).filter(t => !!t.urlKeyword);

            let known;
            if (gradingMode) {
                // Dokładne dopasowanie
                known = detectable.find(t => gradingMode === t.urlKeyword.toUpperCase());
                Utils.log(`[DIAGNOSTICS] Strict match attempt result:`, known ? known.key : 'NOT_FOUND');
            }

            if (!known) {
                // Zapasowo po podłańcuchu, od najdłuższego klucza — CRETURN_REFURB
                // musi być sprawdzony przed CRETURN.
                const sortedTypes = detectable.slice().sort((a, b) => b.urlKeyword.length - a.urlKeyword.length);
                known = sortedTypes.find(t => fullUrl.includes(t.urlKeyword.toUpperCase()));
                Utils.log(`[DIAGNOSTICS] Fallback substring match result:`, known ? known.key : 'NOT_FOUND');
            }

            if (known) {
                store.currentTabType = known.key;
                store.currentTabInstanceId = known.key;
            } else {
                store.currentTabType = CONFIG.UNKNOWN_TAB_TYPE_KEY;
                // Identyfikator karty nierozpoznanej leży w sessionStorage, żeby
                // przeżył F5. Gdy magazyn odmawia, identyfikator żyje w pamięci
                // do końca strony — własny try, bo wyjątek zatrzymałby start.
                const idKey = StorageManager.getKey(CONFIG.SESSION_STORAGE_TAB_INSTANCE_ID_KEY);
                let saved = null;
                try { saved = sessionStorage.getItem(idKey); } catch (e) { Utils.error('sessionStorage niedostępny', e); }
                store.currentTabInstanceId = saved || Utils.generateId(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX);
                try { sessionStorage.setItem(idKey, store.currentTabInstanceId); } catch (e) { Utils.error('Identyfikator karty nie został zapisany', e); }
                if (!store.userConfig.customTabSettings[store.currentTabInstanceId]) {
                    store.userConfig.customTabSettings[store.currentTabInstanceId] = { displayName: `Tab (${store.currentTabInstanceId.substring(19, 23)})`, includeInGlobal: true };
                }
            }

            Utils.log(`[DIAGNOSTICS] Final assigned tab type: ${store.currentTabType}`);
            store.sessionConfig.activeTabInstances[store.currentTabInstanceId] = Date.now();
        },
        /**
         * Sprawdzanie zmiany z timera, przez cały czas życia skryptu.
         *
         * Obsługuje skrypt wklejony tuż przed otwarciem okna zmiany (18:17)
         * i kartę otwartą przez noc na stanowisku bez resetu sesji — ponowne
         * kliknięcie zakładki na działającej stronie jest ignorowane, więc bez
         * timera następna zmiana liczyłaby się do poprzedniej.
         *
         * Bezpieczne o każdej porze: update() zeruje dane tylko wtedy, gdy zegar
         * wskazuje inną zmianę niż zapisana; w trakcie tej samej zmiany (także
         * po północy) wylicza ten sam początek, a w martwej strefie nic nie
         * robi (tests/26-shift-boundaries.test.js).
         */
        shiftWatchTimer: null,
        startShiftWatch() {
            // Uchwyt timera trzyma Main, żeby rozbiórka mogła go zatrzymać.
            clearInterval(this.shiftWatchTimer);
            this.shiftWatchTimer = setInterval(() => ShiftManager.update(), CONFIG.SHIFT_RETRY_INTERVAL_MS);
        },

        /**
         * Rozbiórka egzemplarza — także postawionego do połowy. Awaria po
         * utworzeniu interfejsu zostawia w stronie timery, MutationObserver
         * i nasłuchy; bez rozbiórki powtórne wklejenie pliku postawiłoby drugi
         * egzemplarz, a oba zwiększałyby ten sam klucz localStorage.
         */
        teardown() {
            if (AutoTrigger.observer) { AutoTrigger.observer.disconnect(); AutoTrigger.observer = null; }
            if (StatsWindowRenderer.tickTimer) { clearInterval(StatsWindowRenderer.tickTimer); StatsWindowRenderer.tickTimer = null; }
            if (this.shiftWatchTimer) { clearInterval(this.shiftWatchTimer); this.shiftWatchTimer = null; }
            if (InputManager.onKeyDown) document.removeEventListener('keydown', InputManager.onKeyDown, true);
            if (StorageManager.onStorage) window.removeEventListener('storage', StorageManager.onStorage);
            if (PriceCard.onCspViolation) document.removeEventListener('securitypolicyviolation', PriceCard.onCspViolation);
            if (this.onPageHide) { window.removeEventListener('pagehide', this.onPageHide); this.onPageHide = null; }
            // Jednorazowe timery też — inaczej po chwili ruszyłyby render()
            // zdjętego interfejsu.
            clearTimeout(SettingsPanel._rerenderTimer);
            clearTimeout(Notifier._hideTimer);
            clearTimeout(ValueLog._archiveTimer);
            clearTimeout(ValueLog._writeBackTimer);
            ValueLog._archiveTimer = ValueLog._writeBackTimer = null;
            // Odłożone wywołania debounce — po rozbiórce autozapis nadpisałby
            // magazyn starym stanem, a skan dopisałby paczkę do klucza nowego
            // egzemplarza (test w 27-pending-writes).
            StorageManager.scheduleSave.cancel();
            StorageManager.debouncedLoad.cancel();
            if (AutoTrigger.debouncedScan) AutoTrigger.debouncedScan.cancel();
            if (AutoTrigger.debouncedAttach) AutoTrigger.debouncedAttach.cancel();
            document.querySelectorAll(`[id^="${CONFIG.SCRIPT_ID_PREFIX}"]`).forEach(el => el.remove());
            bus.clear();
            // SH należał do zdjętego egzemplarza — zostawiony trzymałby w pamięci
            // cały stan.
            try { delete window[CONFIG.SCRIPT_ID_PREFIX + 'API']; delete window.SH; } catch (e) { /* własność mogła być niekasowalna — rozbiórki to nie zatrzymuje */ }
            // Skrót `config` zdejmujemy TYLKO wtedy, gdy to my go postawiliśmy:
            // inaczej rozbiórka zabrałaby stronie jej własną funkcję.
            if (this.ownsConfigAlias) {
                try { delete window.config; } catch (e) { /* jak wyżej */ }
                this.ownsConfigAlias = false;
            }
            // Zamek na powtórne uruchomienie też znika — inaczej poprawionego
            // pliku nie dałoby się wkleić.
            window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = false;
            Utils.log('Egzemplarz zdjęty ze strony. Można wkleić skrypt od nowa.');
        },

        init() {
            if (window[CONFIG.SCRIPT_ID_PREFIX + 'INIT']) {
                /**
                 * Skrypt już działa, ale kod ustawień z zakładki i tak wchodzi —
                 * powtórne kliknięcie zakładki z innym kodem zmienia wygląd bez
                 * przeładowania strony. Nakłada się go przez `SH.config`
                 * działającego egzemplarza: ten, który się nie uruchomi, ma
                 * własny stan i zapis do niego nadpisałby ustawienia tamtego.
                 * Gdy działający egzemplarz nie ma `config`, kod przepada.
                 */
                const bootCode = ConfigCode.takeBoot();
                const running = window[CONFIG.SCRIPT_ID_PREFIX + 'API'];
                if (bootCode && running && typeof running.config === 'function') {
                    running.config(bootCode);
                }
                Utils.log('Skrypt już działa na tej stronie — powtórne wklejenie zignorowane. Aby zrestartować, przeładuj stronę (F5).');
                return;
            }
            window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = true;

            try {
                StorageManager.purgeLegacyKeys();
                StorageManager.purgeLegacySharedKeys();

                // Kolejność jest ważna: loadAll() czyta ustawienia karty po
                // store.currentTabInstanceId, więc karta musi być rozpoznana
                // wcześniej.
                this.identifyTab();
                StorageManager.loadAll();

                /**
                 * Kod ustawień z zakładki — po wczytaniu magazynu (inaczej
                 * loadAll() by go nadpisał) i przed postawieniem interfejsu (okno
                 * rysuje się od razu we właściwym wyglądzie). Zapis robi
                 * saveState() niżej, po podniesieniu `store.initialized`.
                 */
                ConfigCode.applyBoot();

                // Dane poprzedniej zmiany na maszynach bez resetu sesji.
                // Dziennik wczytuje się przed sprawdzeniem zmiany — reset czyści
                // go razem z localStorage, więc musi być już wczytany.
                ValueLog.load();
                Routing.startItem('uruchomienie skryptu');

                // Kursy walut bez sieci: z localStorage albo tablica wbudowana.
                // Pobranie na żywo robi dopiero PriceModule.enable().
                FxRates.initOffline();

                SessionReset.checkStaleOnBoot();
                // Zmiana jest inna, ale młodsza niż 12 h (dzień -> noc przy tym
                // samym komputerze).
                ShiftManager.update();
                SessionReset.pruneTabInstances(false);

                // Zadania po ustaleniu zmiany (zadanie domyślne zaczyna się
                // razem z nią) i przed pierwszym przedmiotem (paczka musi mieć
                // gdzie się zapisać — AutoTrigger rusza niżej).
                TaskManager.init();

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

                // Przedmiot przeszedł pełną ścieżkę — wpis do dziennika. Cena
                // z pamięci karty; jeśli jeszcze nie przyszła, dopisze ją
                // resolve() (ValueLog.fillPending).
                bus.on('item:completed', () => {
                    const asin = PriceCard.shownAsin;
                    const r = asin ? PriceCard.cache.get(asin) : null;
                    const price = (r && r.status === 'ok' && r.current) ? r.current : null;
                    // add() zwraca id wpisu, nie indeks — scalanie przestawia pozycje.
                    const entryId = ValueLog.add(asin, price, store.currentTabInstanceId);
                    // Znak stawia Routing — od razu albo gdy kod się pojawi.
                    // Wołane zawsze, także bez wpisu (entryId null bez modułu
                    // cen): procent sprzedaży potrzebuje kierunku bez sieci.
                    Routing.onCompleted(entryId);
                });

                /**
                 * Początek nowego przedmiotu dla ewidencji kierunku — dwa sygnały:
                 *   - podniesienie flagi `poniżej` — zwykły cykl;
                 *   - zmiana ASIN — przedmiot przerwany, po którym flaga zostaje
                 *     podniesiona i przejścia false->true nie będzie.
                 */
                // `poniżej` to prawdziwa granica przedmiotu, więc zamyka też
                // wiszący Secondary-Sorting jako niesprzedaż (Routing.closeAmbiguous).
                bus.on('store:changed:uiFlags.itemInProgress', (d) => {
                    if (d.value === true) Routing.startItem('poniżej', { closeAmbiguous: true });
                });
                // Zmiana ASIN granicą nie jest — linia uściślająca bywa spóźniona.
                bus.on('price:asinChanged', (d) => Routing.startItem('zmienił się ASIN ' + d.asin));

                // Wyjście ze strony: trzy zapisy czekają na timer — archiwum,
                // autozapis ustawień (sekunda) i dopisanie do wspólnego dziennika
                // (400 ms). Bez dokończenia tutaj ostatnie zmiany ginęłyby przy F5.
                this.onPageHide = () => {
                    try {
                        StorageManager.scheduleSave.flush();
                        ValueLog.flushWriteBack();
                        ValueLog.flushArchive();
                    } catch (e) { /* strona już się zamyka — nie ma komu zgłosić błędu */ }
                };
                window.addEventListener('pagehide', this.onPageHide);

                // Autozapis tylko dla gałęzi, które saveState() naprawdę pisze:
                // uiFlags nie są trwałe, a liczniki mają własne klucze.
                onStorePaths(['userConfig', 'sessionConfig', 'localTabConfig'],
                             () => StorageManager.scheduleSave());

                /**
                 * Skrót `config("0x…")` bez przedrostka SH. Nazwa jest pospolita,
                 * a strona nie jest nasza — zajmujemy ją tylko wtedy, gdy jest
                 * wolna. `SH.config(...)` działa zawsze i to on stoi w zakładce
                 * kopiowanej z panelu.
                 */
                if (typeof window.config === 'undefined') {
                    window.config = (code) => ConfigCode.apply(code);
                    this.ownsConfigAlias = true;
                }

                this.startShiftWatch();
                StatsWindowRenderer.renderContent();

                // Dostęp do wnętrza z konsoli. Skrypt uruchamia się właśnie przez
                // F12, więc możliwość obejrzenia stanu i wywołania metody w locie
                // jest narzędziem roboczym, a nie pozostałością po debugowaniu.
                window[CONFIG.SCRIPT_ID_PREFIX + 'API'] = window.SH = {
                    store, CONFIG, PriceCard, ShiftManager, SessionReset,
                    StorageManager, SettingsPanel, AutoTrigger, I18n,
                    KeepaOCR, ValueLog, FxRates, Routing,
                    // Potrzebne testom i diagnostyce.
                    Utils, PriceModule, StatsWindowRenderer, CSSManager, LINE_KEYS,
                    DEFAULT_LINE_CONFIG, DEFAULT_LOCAL_CONFIG, DEFAULT_USER_CONFIG,
                    priceModuleOn,
                    // Hasła dostępu: SH.normalizeAccessPasswords(['moje', 'hasła'])
                    // pokazuje, co naprawdę wyjdzie z listy w nagłówku pliku.
                    InputManager, UIBuilder, normalizeAccessPasswords,
                    /**
                     * Kod ustawień: krótkie polecenia do konsoli. Sam rejestr
                     * (SH.ConfigCode) — dla testów i pytania „pod jakim numerem
                     * siedzi to ustawienie”.
                     */
                    config: (code) => ConfigCode.apply(code),
                    configCode: () => ConfigCode.encode(),
                    configLink: () => ConfigCode.link(),
                    ConfigCode,
                    /**
                     * Zadania: `SH.tasks()` wypisuje podsumowanie zmiany, menedżer
                     * pozwala przełączać zadania z konsoli.
                     */
                    TaskManager,
                    tasks: () => TaskManager.info(),
                    // Przeciąganie okna i karty — wystawione dla diagnostyki
                    // („czemu nie da się przesunąć okna”) i dla testów, które
                    // odtwarzają pełny gest myszy.
                    DragDropManager, PriceCardDrag,
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
                     * Zmiana limitów zapytań bez przeładowania strony:
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
                    // SH.Main.teardown() — zdjęcie egzemplarza z konsoli.
                    Main,
                    priceStats: () => PriceCard.stats(),
                    /**
                     * Pełna diagnostyka CSP: co pozwala polityka strony i co
                     * naprawdę przechodzi. Asynchroniczna — wołać przez
                     * `await SH.cspReport()` albo `SH.cspReport().then(console.table)`.
                     *
                     * Część praktyczna (obrazek Keepa, zapytanie do r.jina.ai)
                     * wychodzi w sieć, więc wymaga włączonego modułu cen. Rozbiór
                     * polityki działa zawsze — nie wychodzi poza własną domenę.
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
                // Awaria startu zawsze w konsoli — inaczej wygląda jak „nic się
                // nie stało”.
                window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = false;
                // Sprzątamy wszystko, co zdążyło stanąć — inaczej powtórne
                // wklejenie dałoby dwa egzemplarze naraz.
                try { this.teardown(); } catch (e2) { Utils.fatal('Rozbiórka po awarii nie powiodła się:', e2); }
                Utils.fatal('Inicjalizacja nie powiodła się, skrypt nie działa:', e);
            }
        }
    };
