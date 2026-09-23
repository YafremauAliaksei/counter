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

            // Działy ręczne (bez `urlKeyword`, np. OTHER) nie mają swojej karty
            // i nie biorą udziału w rozpoznawaniu — inaczej pierwszy taki wpis
            // wywaliłby całe uruchomienie na `undefined.toUpperCase()`.
            const detectable = Object.values(CONFIG.KNOWN_TAB_TYPES).filter(t => !!t.urlKeyword);

            let known;
            if (gradingMode) {
                // Dokładne dopasowanie
                known = detectable.find(t => gradingMode === t.urlKeyword.toUpperCase());
                Utils.log(`[DIAGNOSTICS] Strict match attempt result:`, known ? known.key : 'NOT_FOUND');
            }

            if (!known) {
                // Zapasowo po podłańcuchu.
                // KRYTYCZNIE WAŻNE: sortujemy klucze po długości malejąco.
                // Gwarantuje to, że CRETURN_REFURB (14 znaków) sprawdzi się PRZED
                // CRETURN (7 znaków).
                const sortedTypes = detectable.slice().sort((a, b) => b.urlKeyword.length - a.urlKeyword.length);
                known = sortedTypes.find(t => fullUrl.includes(t.urlKeyword.toUpperCase()));
                Utils.log(`[DIAGNOSTICS] Fallback substring match result:`, known ? known.key : 'NOT_FOUND');
            }

            if (known) {
                store.currentTabType = known.key;
                store.currentTabInstanceId = known.key;
            } else {
                store.currentTabType = CONFIG.UNKNOWN_TAB_TYPE_KEY;
                // Identyfikator karty nierozpoznanej żyje w sessionStorage, żeby
                // przeżył F5. Magazyn bywa pełny albo zablokowany — wtedy
                // identyfikator żyje w pamięci do końca strony. Bez własnego try
                // wyjątek szedł do catch w init() i skrypt nie wstawał wcale
                // (1.3.3; test w 11-storage-failure).
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
         * Sprawdzanie zmiany z timera — przez cały czas życia skryptu.
         *
         * Do 8.x timer chodził tylko do pierwszego rozpoznania zmiany: jedyną
         * przewidzianą sytuacją był skrypt wklejony parę minut przed otwarciem
         * okna zmiany (np. o 18:17). W 8.0.0 ShiftManager.update() wywoływał się
         * dokładnie raz i taka karta zostawała bez zmiany do końca.
         *
         * Od 1.3.3 chodzi ZAWSZE. Na stanowisku bez resetu sesji karta T-REX
         * potrafi zostać otwarta przez noc, a ponowne kliknięcie zakładki na
         * działającej stronie jest ignorowane (ochrona przed podwójnym
         * uruchomieniem). Bez tego timera piątkowe paczki dopisywały się do
         * czwartkowego licznika, aż ktoś przeładował stronę.
         *
         * To bezpieczne o każdej porze, bo update() zeruje dane TYLKO wtedy,
         * gdy zegar ścienny wskazuje inną zmianę niż zapisana: w trakcie tej
         * samej zmiany (także po północy na nocnej) wylicza ten sam początek,
         * a w martwej strefie nie robi nic. Pilnuje tego
         * tests/26-shift-boundaries.test.js.
         */
        shiftWatchTimer: null,
        startShiftWatch() {
            // 8.3.0: uchwyt timera trzyma Main. Wcześniej żył tylko w zmiennej
            // lokalnej i nie było czym zatrzymać przeglądu przy rozbiórce.
            clearInterval(this.shiftWatchTimer);
            this.shiftWatchTimer = setInterval(() => ShiftManager.update(), CONFIG.SHIFT_RETRY_INTERVAL_MS);
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
            // 1.3.3: odłożone wywołania z debounce. Żyły w domknięciach i po
            // rozbiórce wciąż strzelały: autozapis nadpisywał magazyn starym
            // stanem, a skan dopisywał paczkę do klucza, który prowadzi już
            // nowy egzemplarz (test w 27-pending-writes).
            StorageManager.scheduleSave.cancel();
            StorageManager.debouncedLoad.cancel();
            if (AutoTrigger.debouncedScan) AutoTrigger.debouncedScan.cancel();
            if (AutoTrigger.debouncedAttach) AutoTrigger.debouncedAttach.cancel();
            document.querySelectorAll(`[id^="${CONFIG.SCRIPT_ID_PREFIX}"]`).forEach(el => el.remove());
            bus.clear();
            // Dostęp z konsoli należał do zdjętego egzemplarza: zostawić go znaczy
            // trzymać w pamięci cały stan i wszystkie menedżery.
            try { delete window[CONFIG.SCRIPT_ID_PREFIX + 'API']; delete window.SH; } catch (e) { /* własność mogła być niekasowalna — rozbiórki to nie zatrzymuje */ }
            // Skrót `config` zdejmujemy TYLKO wtedy, gdy to my go postawiliśmy:
            // inaczej rozbiórka zabrałaby stronie jej własną funkcję.
            if (this.ownsConfigAlias) {
                try { delete window.config; } catch (e) { /* jak wyżej */ }
                this.ownsConfigAlias = false;
            }
            // Egzemplarza na stronie już nie ma — więc i zamek na powtórne
            // uruchomienie się zdejmuje, inaczej poprawionego pliku nie dałoby się
            // już wkleić.
            window[CONFIG.SCRIPT_ID_PREFIX + 'INIT'] = false;
            Utils.log('Egzemplarz zdjęty ze strony. Można wkleić skrypt od nowa.');
        },

        init() {
            if (window[CONFIG.SCRIPT_ID_PREFIX + 'INIT']) {
                /**
                 * Kod ustawień z zakładki wchodzi MIMO TO — powtórne kliknięcie
                 * zakładki z innym kodem jest jedynym sposobem zmiany wyglądu
                 * bez przeładowania strony, a przeładowanie w środku zmiany
                 * kosztuje tyle, co wklejenie skryptu od nowa.
                 *
                 * Ale nakłada się na egzemplarz, KTÓRY JUŻ STOI, przez jego
                 * własne `SH.config`. Ten, który właśnie się nie uruchomi, ma
                 * osobny stan w swoim domknięciu: zapis do niego poszedłby
                 * w próżnię, a przy okazji nadpisałby w magazynie ustawienia
                 * tamtego egzemplarza.
                 *
                 * Gdy na stronie stoi wydanie starsze niż 1.2.0, `config` tam
                 * nie istnieje — wtedy kod po prostu przepada i trzeba odświeżyć
                 * stronę. Zgadywanie po wnętrznościach cudzego egzemplarza
                 * kosztowałoby więcej, niż jest warte.
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

                // KOLEJNOŚĆ JEST WAŻNA. W 8.0.0 loadAll() szedł pierwszy, a czyta
                // on ustawienia po kluczu store.currentTabInstanceId, który w tym
                // momencie był jeszcze null. Przez to wygląd okna (pozycja, kolory,
                // rozmiary, widoczność linii) nie przywracał się po przeładowaniu
                // strony nigdy.
                this.identifyTab();
                StorageManager.loadAll();

                /**
                 * Kod ustawień z zakładki — PO wczytaniu magazynu, PRZED
                 * postawieniem interfejsu.
                 *
                 * Po wczytaniu, bo inaczej `loadAll()` nadpisałby to, co przyszło
                 * z kodu, zapisanym wcześniej stanem. Przed interfejsem, bo okno
                 * ma się narysować od razu takie, jakiego człowiek chce — a nie
                 * mrugnąć domyślnym wyglądem. Zapis do magazynu robi `saveState()`
                 * kilka linii niżej, po podniesieniu `store.initialized`.
                 */
                ConfigCode.applyBoot();

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

                /**
                 * Zadania PO ustaleniu zmiany, a przed pierwszym przedmiotem.
                 *
                 * Po ustaleniu, bo zadanie domyślne zaczyna się razem ze zmianą,
                 * a `shiftCalculatedStartTime` liczy dopiero ShiftManager.update()
                 * linijkę wyżej. Przed przedmiotem, bo licznik nie ma prawa
                 * zaliczyć paczki, dla której nie ma gdzie jej zapisać —
                 * AutoTrigger rusza znacznie niżej.
                 */
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
                // inaczej by do niego nie zdążyła.
                //
                // 1.3.3: to samo dotyczy dwóch innych odłożonych zapisów.
                // Autozapis ustawień czeka sekundę — zmiana sprzed chwili ginęła
                // przy F5. Dopisanie własnych wpisów do wspólnego dziennika po
                // synchronizacji z sąsiednią kartą czeka 400 ms — przedmiot
                // zamknięty tuż przed wyjściem mógł z niego wypaść.
                this.onPageHide = () => {
                    try {
                        StorageManager.scheduleSave.flush();
                        ValueLog.flushWriteBack();
                        ValueLog.flushArchive();
                    } catch (e) { /* strona już się zamyka — nie ma komu zgłosić błędu */ }
                };
                window.addEventListener('pagehide', this.onPageHide);

                // Autozapis ustawień. Do 8.1.0 stan zapisywał się dopiero przy
                // zamykaniu panelu i przeładowanie strony w środku zmiany go gubiło.
                // 8.3.0: zapisują się tylko te gałęzie, które saveState() naprawdę
                // pisze. uiFlags nie są trwałe, a liczniki idą osobnym kluczem
                // przez saveCounter() — obie gałęzie wcześniej na darmo budziły
                // autozapis.
                onStorePaths(['userConfig', 'sessionConfig', 'localTabConfig'],
                             () => StorageManager.scheduleSave());

                /**
                 * Skrót `config("0x…")` bez przedrostka SH.
                 *
                 * Zakładka w przeglądarce wkleja się jednym ciągiem i krótsza
                 * nazwa jest tam wygodniejsza. Nazwa jest jednak POSPOLITA,
                 * a strona nie jest nasza — więc zajmujemy ją TYLKO wtedy, gdy
                 * jest wolna. Gdy T-REX ma własne `window.config`, zostaje
                 * `SH.config(...)`, które nie koliduje z niczym i dlatego to
                 * ono stoi w kopiowanym z panelu odnośniku.
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
                    // 8.4.0
                    KeepaOCR, ValueLog, FxRates, Routing,
                    // 9.2.0 — potrzebne testom i diagnostyce
                    Utils, PriceModule, StatsWindowRenderer, CSSManager, LINE_KEYS,
                    DEFAULT_LINE_CONFIG, DEFAULT_LOCAL_CONFIG, DEFAULT_USER_CONFIG,
                    priceModuleOn,
                    // 1.1.0 — hasła dostępu. InputManager trzyma bufor i mapę
                    // haseł, normalizeAccessPasswords pokazuje, co naprawdę
                    // wyjdzie z listy wpisanej na górze pliku: po edycji warto
                    // sprawdzić SH.normalizeAccessPasswords(['moje', 'hasła'])
                    // zamiast zgadywać, czy literówka przeszła.
                    InputManager, normalizeAccessPasswords,
                    /**
                     * KOD KONFIGURACJI (1.2.0).
                     *
                     * Funkcje, a nie sam obiekt: `SH.config('0x…')` ma być
                     * krótkim poleceniem do wklejenia w konsoli, a nie ścieżką
                     * przez wnętrzności. Sam rejestr stoi niżej, pod własną
                     * nazwą, dla testów i dla pytania „pod jakim numerem siedzi
                     * to ustawienie”.
                     */
                    config: (code) => ConfigCode.apply(code),
                    configCode: () => ConfigCode.encode(),
                    configLink: () => ConfigCode.link(),
                    ConfigCode,
                    /**
                     * ZADANIA (1.3.0). `SH.tasks()` wypisuje podsumowanie
                     * wszystkich zadań zmiany, reszta to sam menedżer — do
                     * przełączania z konsoli, gdy panel jest akurat zamknięty.
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
