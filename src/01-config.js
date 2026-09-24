    // ==========================================
    // 1. STAŁE PODSTAWOWE I KONFIGURACJA
    // ==========================================
    /**
     * Sprowadza listę haseł z nagłówka pliku do jednej postaci.
     *
     *   - pojedynczy łańcuch zamiast tablicy jest przyjmowany (inaczej
     *     rozpadłby się na litery);
     *   - białe znaki z brzegów są obcinane, wielkość liter znika (bufor
     *     klawiatury jest podnoszony do wielkich);
     *   - puste pozycje wylatują — `''` pasowałoby do każdego bufora
     *     i otwierało panel na pierwszym klawiszu;
     *   - powtórzenia znikają;
     *   - sortowanie od najdłuższego: gdy jedno hasło jest końcówką drugiego,
     *     wygrywa dłuższe, niezależnie od kolejności w pliku.
     *
     * Stoi tutaj, a nie w Utils, bo moduł 01 jest pierwszy w sklejeniu
     * i w chwili budowania CONFIG Utils jeszcze nie istnieje.
     */
    function normalizeAccessPasswords(raw) {
        const lista = Array.isArray(raw) ? raw : [raw];
        const out = [];
        for (const poz of lista) {
            if (typeof poz !== 'string' && typeof poz !== 'number') continue;
            const h = String(poz).trim().toUpperCase();
            if (!h) continue;
            if (out.indexOf(h) === -1) out.push(h);
        }
        return out.sort((a, b) => b.length - a.length);
    }

    const CONFIG = {
        SCRIPT_VERSION: '__VERSION__',
        SCRIPT_NAME: 'Helper (Reactive)',
        /**
         * Prefiks kluczy w localStorage. Koduje SCHEMAT zapisanych danych,
         * a nie numer wydania:
         *
         *     prefiks się zmienia  <=>  rośnie wersja MAJOR
         *     prefiks się zmienia  =>   liczniki i ustawienia startują od zera
         *                          =>   aktualizacja tylko między zmianami
         *
         * Nowe pole z wartością domyślną prefiksu nie zmienia. Zmienia go
         * dopiero układ, w którym zapisane stare dane przykryłyby nowe wartości
         * domyślne albo zostały źle odczytane.
         */
        SCRIPT_ID_PREFIX: 'statsHelper_v1_3_0_',
        // Prefiksy poprzednich schematów. Ich klucze są usuwane przy starcie,
        // żeby na maszynach bez resetu sesji nie zbierały się śmieci. Przy
        // każdej zmianie SCRIPT_ID_PREFIX poprzedni trafia tutaj — pilnuje
        // tego test w 02-defaults.
        LEGACY_ID_PREFIXES: ['statsHelper_v8_0_0_', 'statsHelper_v8_1_0_', 'statsHelper_v8_2_0_',
                             'statsHelper_v8_3_0_', 'statsHelper_v8_4_0_', 'statsHelper_v8_5_0_',
                             'statsHelper_v8_6_0_', 'statsHelper_v9_0_0_', 'statsHelper_v9_2_0_',
                             'statsHelper_v1_0_0_'],
        /**
         * Czy pisać do konsoli. Wartość startowa pochodzi z SCRIPT_LOGS_ENABLED
         * w nagłówku; tutaj żyje, bo SH.logsOn() i SH.logsOff() przełączają ją
         * w locie.
         */
        DEBUG_MODE: SCRIPT_LOGS_ENABLED === true,
        UI_UPDATE_INTERVAL_MS: 1000,
        FONT_FAMILY_OPTIONS: {
            default: 'Segoe UI, Roboto, Arial, sans-serif',
            monospace: 'Consolas, Monaco, Courier New, monospace',
            sans_serif_thin: 'Roboto, Helvetica Neue, Arial, sans-serif',
        },
        SETTINGS_PANEL_BACKGROUND_COLOR: 'rgba(245, 245, 245, 0.95)',
        SETTINGS_PANEL_TEXT_COLOR: '#141414',
        SETTINGS_PANEL_ACCENT_COLOR: '#141414',
        SETTINGS_PANEL_INITIAL_WIDTH_PX: 450,
        /**
         * Adres, spod którego zakładka pobiera skrypt. Z niego ConfigCode.link()
         * składa gotową zakładkę z kodem ustawień.
         *
         * Musi to być raw.githubusercontent.com: zakładka pobiera plik przez
         * `fetch` z cudzej strony, a to przechodzi tylko przy nagłówku
         * `Access-Control-Allow-Origin`. raw go wystawia (`*`); pobranie
         * wydania z github.com odpowiada przekierowaniem bez tego nagłówka
         * i przeglądarka zrywa zapytanie („blocked by CORS policy”).
         *
         * Gałąź `release` wskazuje ostatnie wydanie — przesuwa ją tylko
         * workflow wydania, więc uruchamia się wyłącznie kod świadomie wydany.
         * Przypięcie do wersji: ta sama ścieżka z tagiem zamiast `release`.
         */
        RELEASE_URL: 'https://raw.githubusercontent.com/YafremauAliaksei/counter/release/counter.js',
        /**
         * Hasła z nagłówka w jednej postaci (normalizeAccessPasswords).
         * Porównuje je z buforem klawiatury InputManager. Pusta lista znaczy
         * „żadne hasło nie otwiera panelu” — zostaje SH.SettingsPanel.toggle().
         */
        SETTINGS_PANEL_ACCESS_PASSWORDS: normalizeAccessPasswords(SETTINGS_ACCESS_PASSWORDS),
        /**
         * DZIAŁY. Kolejność w mapie jest kolejnością na ekranie; panel,
         * linia 2 i menedżer zadań chodzą po tej mapie, więc nowy dział to
         * jedna linia tutaj plus nazwa w trzech słownikach.
         *
         * `urlKeyword` — po nim karta rozpoznaje sama siebie w adresie T-REX.
         * Dział bez tego pola nie jest nigdy kartą.
         *
         * OTHER — dział ręczny na paczki robione poza trzema procesami. Nie ma
         * swojej karty, więc liczby wpisuje się w panelu; licznik nie zwiększa
         * go sam.
         */
        KNOWN_TAB_TYPES: {
            CRET: { key: 'CRET', displayNameKey: 'tabName_CRET', baseColorHex: '#0078D7', urlKeyword: 'CRETURN' },
            REFURB: { key: 'REFURB', displayNameKey: 'tabName_REFURB', baseColorHex: '#FFA500', urlKeyword: 'CRETURN_REFURB' },
            WHD: { key: 'WHD', displayNameKey: 'tabName_WHD', baseColorHex: '#1EB41E', urlKeyword: 'WAREHOUSE_DEALS' },
            OTHER: { key: 'OTHER', displayNameKey: 'tabName_OTHER', baseColorHex: '#9E9E9E' },
        },
        UNKNOWN_TAB_TYPE_KEY: 'UNKNOWN',
        DEFAULT_UNKNOWN_TAB_DETAILS: { key: 'UNKNOWN', displayNameKey: 'tabName_UNKNOWN', baseColorHex: '#808080' },
        UNKNOWN_TAB_INSTANCE_ID_PREFIX: 'unknownTabInstance_',
        MAX_PAGE_OVERLAY_OPACITY_PERCENT: 15,
        // Granice rozpoznawania zmiany, w czasie LOKALNYM przeglądarki
        // (getHours), bez żadnego przeliczania na UTC.
        SHIFT_TIMES_LOCAL: {
            DAY_SHIFT_START_H: 6, DAY_SHIFT_START_M: 19, DAY_SHIFT_END_H: 17, DAY_SHIFT_END_M: 55,
            NIGHT_SHIFT_START_H: 18, NIGHT_SHIFT_START_M: 19, NIGHT_SHIFT_END_H: 5, NIGHT_SHIFT_END_M: 55,
        },
        DEFAULT_CALCULATION_START_TIMES: { DAY: { H: 6, M: 30 }, NIGHT: { H: 18, M: 30 } },
        LUNCH_OPTIONS_BASE:[
            { text_key: 'lunch_day1', start: '1120', end: '1150', type: 'day' },
            { text_key: 'lunch_day2', start: '1150', end: '1220', type: 'day' },
            { text_key: 'lunch_day3', start: '1220', end: '1250', type: 'day' },
            { text_key: 'lunch_day4', start: '1250', end: '1320', type: 'day' },
            { text_key: 'lunch_night1', start: '2320', end: '2350', type: 'night' },
            { text_key: 'lunch_night2', start: '2350', end: '0020', type: 'night' },
            { text_key: 'lunch_night3', start: '0020', end: '0050', type: 'night' },
            { text_key: 'lunch_night4', start: '0050', end: '0120', type: 'night' },
        ],
        DEFAULT_LUNCH_INDEX_DAY: 3,
        DEFAULT_LUNCH_INDEX_NIGHT: 7,
        STORAGE_KEY_USER_CONFIG: 'userConfig',
        STORAGE_KEY_SESSION_CONFIG: 'sessionConfig',
        STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS: 'allLocalTabConfigs',
        STORAGE_PREFIX_TAB_COUNTER: 'counter_',
        /**
         * Licznik przedmiotów sprzedanych — klucz na kartę, jak licznik ogólny.
         * Osobny, a nie liczony z dziennika wartości, bo dziennik działa tylko
         * z modułem cen, a procent sprzedaży ma działać bez sieci. Kierunek
         * wynika z samego tekstu strony (Routing).
         */
        STORAGE_PREFIX_TAB_SOLD: 'sold_',
        /**
         * Licznik przedmiotów spoza mianownika procentu (audyty, wpisy ręczne)
         * — klucz na kartę. Linie 2 i 7 sumują wszystkie karty, więc każda
         * musi mieć tę liczbę we własnym kluczu.
         */
        STORAGE_PREFIX_TAB_NEUTRAL: 'neutral_',
        /**
         * ZADANIA. Lista zadań i aktywne zadanie leżą pod jednym kluczem
         * wspólnym dla kart: zadanie należy do człowieka, nie do karty.
         * Liczniki mają klucz na parę zadanie+karta — dwie karty piszące
         * jeden klucz zamazywałyby sobie liczby.
         */
        STORAGE_KEY_TASKS: 'tasks',
        STORAGE_PREFIX_TASK_COUNTER: 'taskcnt_',
        /** Nazwa pierwszego zadania: cała zmiana jest jednym procesem, dopóki człowiek nie powie inaczej. */
        DEFAULT_TASK_NAME: 'Default',
        /**
         * Poniżej tylu milisekund pracy tempo wynosi zero. Pierwsza paczka
         * tuż po starcie dawałaby „3600 na godzinę”. Ta sama granica chroni
         * przeliczanie tempa wpisanego ręcznie na paczki, które trafiają do
         * liczników na stałe.
         */
        RATE_MIN_WORKED_MS: 10000,
        /** Granica nazwy — panel ma wąską kolumnę, a nazwa stoi też w linii 8. */
        TASK_MAX_NAME_LEN: 24,
        /**
         * Skróty początku zadania, w minutach wstecz. Gęsto na początku, bo
         * człowiek siada do skryptu zwykle kilka minut po faktycznym starcie
         * procesu.
         */
        TASK_QUICK_OFFSETS_MIN: [0, 2, 5, 15, 30],
        SESSION_STORAGE_TAB_INSTANCE_ID_KEY: 'tabInstanceId',
        STORAGE_KEY_VALUE_LOG: 'valueLog',

        // --- MAGAZYN WSPÓLNY, NIEZALEŻNY OD SCHEMATU ---
        // Archiwum podsumowań zmian ma przeżyć aktualizację skryptu, więc jego
        // prefiks nie zawiera wersji. Nie rusza go ani reset zmiany, ani
        // sprzątanie starych schematów; usuwa go tylko pełny reset (ownKeys()).
        SHARED_ID_PREFIX: 'statsHelper_shared_',
        STORAGE_KEY_VALUE_ARCHIVE: 'valueArchive',
        STORAGE_KEY_FX_RATES: 'fxRates',
        /**
         * ŹRÓDŁA KURSÓW WALUT, pytane po kolei do pierwszego sukcesu.
         * Wszystkie oddają nagłówki CORS i nie wymagają klucza.
         *
         * Pytane są dopiero po ręcznym włączeniu modułu cen (FxRates.init,
         * priceModuleOn). Dokładność co do grosza nie jest potrzebna: to
         * szacunek wyniku zmiany, a nie księgowość.
         */
        FX_PROVIDERS: [
            { name: 'jsdelivr', url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
              pick: (j) => j && j.eur },
            { name: 'er-api',   url: 'https://open.er-api.com/v6/latest/EUR',
              pick: (j) => j && j.rates },
            // floatrates oddaje kurs łańcuchem („1.15514929”) — stąd Number().
            { name: 'floatrates', url: 'https://www.floatrates.com/daily/eur.json',
              pick: (j) => { if (!j) return null; const o = {}; for (const k in j) o[k] = j[k] && Number(j[k].rate); return o; } },
        ],
        // Kursy zmieniają się wolno: jedno zapytanie na dobę wystarcza.
        FX_TTL_MS: 24 * 60 * 60 * 1000,
        FX_TIMEOUT_MS: 8000,
        /**
         * Kursy wbudowane (jednostek waluty za 1 EUR). Z nimi skrypt pracuje
         * przy wyłączonym module cen i wtedy, gdy sieć albo CSP nie pozwalają
         * zapytać. Stan z 15.09.2026, zgodny w trzech źródłach.
         */
        FX_FALLBACK: { EUR: 1, USD: 1.156, GBP: 0.856, PLN: 4.33, SEK: 11.27, CAD: 1.605 },
        /**
         * Waluty wyświetlania i znak stawiany po kwocie. Tylko te, dla których
         * FX_FALLBACK ma kurs — przeliczenie musi działać bez sieci. Liczy się
         * zawsze w euro; waluta wyświetlania to ostatnie mnożenie przy
         * rysowaniu, więc jej zmiana w trakcie zmiany niczego nie gubi.
         */
        DISPLAY_CURRENCIES: { EUR: '€', PLN: 'zł', GBP: '£', SEK: 'kr', USD: '$', CAD: 'CA$' },
        // Klucze wspólne, które już nie są używane — tylko do sprzątania.
        LEGACY_SHARED_KEYS: ['asinPrices'],
        /**
         * Górna granica wpisów w dzienniku zmiany — ochrona przed wzrostem bez
         * końca. Dziennik jest wspólny dla kart, a jeden przedmiot może dać
         * dwa wpisy (minus w CRET, plus po sprzedaży z WHD). 6000 wpisów to
         * ok. 1 MB JSON; więcej robi się ciasno w localStorage dzielonym z T-REX.
         */
        VALUE_LOG_MAX_ENTRIES: 6000,
        // Archiwum zapisuje się paczką, a nie przy każdym wpisie — rozbiór
        // i złożenie 60 zmian na każdy przedmiot to strata CPU i zapisów.
        VALUE_ARCHIVE_WRITE_DEBOUNCE_MS: 5000,
        // Archiwum trzyma same podsumowania zmian, nie pozycje — pełne listy
        // z 60 zmian nie zmieściłyby się w localStorage.
        VALUE_ARCHIVE_MAX_SHIFTS: 60,

        // --- Cykl życia zmiany ---
        // Zmiana trwa 10,5 h. Zapisany początek starszy niż 12 h znaczy dane
        // z poprzedniej zmiany (maszyna bez resetu sesji) — do wyczyszczenia.
        // Wyjątek: zegar ścienny wskazuje wciąż tę samą zmianę, bo w noc
        // zmiany czasu nocna zmiana trwa 12,42 h (checkStaleOnBoot).
        STALE_SESSION_MS: 12 * 60 * 60 * 1000,
        // Górna granica licznika czytanego z magazynu. Zmiana to kilkaset
        // paczek; wartość spoza zakresu to śmieć (`'9'.repeat(21)` dałoby 1e21).
        COUNTER_MAX: 1000000,
        // Wpisy o aktywnych kartach starsze niż ten okres są wyrzucane.
        TAB_INSTANCE_TTL_MS: 12 * 60 * 60 * 1000,
        // Różnica między zapisanym a wyliczonym początkiem zmiany, po której
        // zmianę uznaje się za inną (ochrona przed drganiem paru sekund).
        SHIFT_IDENTITY_TOLERANCE_MS: 60 * 1000,
        // Co ile sprawdzać, jaka zmiana trwa — przez cały czas życia skryptu,
        // żeby karta otwarta przez noc sama zauważyła następną zmianę
        // (Main.startShiftWatch).
        SHIFT_RETRY_INTERVAL_MS: 30 * 1000,
        // Autozapis ustawień po zmianie stanu.
        AUTOSAVE_DEBOUNCE_MS: 1000,
        // Okno ciszy po zastosowaniu danych z innej karty: chroni przed
        // nieskończonym ping-pongiem zapisów między kartami.
        REMOTE_APPLY_SUPPRESS_MS: 2500,
        // Wyzwalacze liczenia: pierwszy podnosi flagę „zaczął się przedmiot”,
        // drugi przy podniesionej fladze daje +1. Teksty rosyjskie to napisy
        // samego T-REX. PROBLEM-SOLVE jest wyłączony, bo taki przedmiot wraca
        // do obsługi i zostałby policzony dwa razy.
        PRE_TRIGGER_REGEX: /poniżej|видите ниже|Transparency/i,
        AUTO_TRIGGER_REGEX: /Przypisz (nowy|ponownie)|канирование номера LP:|Przedmiot wysłano do (?!PROBLEM-SOLVE\b).+/i,
        /**
         * KODY KIERUNKU: sprzedaż czy utylizacja.
         *
         * Na ekranie pojawia się „Zeskanuj <KOD>” albo „Zeskanuj - <KOD>”.
         * Kod może przyjść przed wyzwalaczem końcowym, razem z nim albo po
         * nim, ale zawsze przed następnym przedmiotem — dlatego kierunek śledzi
         * osobny automat (Routing), a nie odczyt w chwili zakończenia.
         *
         * Dopasowanie zaczepia się o `Zeskanuj` i początek kodu, bez domykania
         * ogona: `External` łapie też `External-Repair`. Wielkość liter nie ma
         * znaczenia (flaga `i`, Routing.canon sprowadza do zapisu z listy).
         *
         * Przedrostek `NS-` („nie-sort”) opisuje gabaryt, nie kierunek:
         * `NS-Stow-Unsellable` jedzie tam, gdzie `Stow-Unsellable`, więc każda
         * rodzina niesprzedażowa ma oba warianty. Dla kodów magazynowych
         * `CRITS-*` odpowiednikiem nie-sortu jest jeden `NS-PL-Sellable`.
         */
        ROUTE_SELL_CODES: ['CRITS-PRG2', 'CRITS-MXP6', 'CRITS-POZ1', 'CRITS-LEJ5',
                           'PL-Sellable', 'NS-PL-Sellable'],
        ROUTE_UNSELL_CODES: ['Liquidation', 'NS-Liquidation',
                             'FBA-DE-Unsellable', 'NS-FBA-DE-Unsellable',
                             'Remove', 'NS-Remove',
                             'WHD', 'NS-WHD',
                             'Stow-Unsellable', 'NS-Stow-Unsellable',
                             'Refurb', 'NS-Refurb',
                             'External', 'NS-External'],
        /**
         * Kody, których nie da się rozstrzygnąć nigdy. Audyt oddaje przedmiot
         * audytorowi, który zdecyduje o nim długo po zniknięciu z ekranu, więc
         * taki przedmiot wypada z mianownika procentu sprzedaży. Brak kodu to
         * co innego — zostaje w mianowniku (Routing.countDirection).
         *
         * `NS-AUDIT` nie był jeszcze widziany w pracy; stoi, bo przedrostek
         * `NS-` może wyjść przy każdym kodzie.
         */
        ROUTE_NEUTRAL_CODES: ['AUDIT', 'NS-AUDIT'],
        /**
         * Kody bez kierunku: przedmiot może pojechać w obie strony. Kierunek
         * rozstrzyga następna linia (ROUTE_CONFIRM_SELL / ROUTE_CONFIRM_UNSELL),
         * do tego czasu przedmiot jest nieokreślony.
         */
        ROUTE_AMBIGUOUS_CODES: ['Secondary-Sorting', 'NS-Secondary-Sorting'],
        // Linie uściślające są bez przedrostka `NS-`: to status przedmiotu,
        // taki sam dla sortu i nie-sortu. Przedrostek stoi przy kodzie kierunku.
        ROUTE_CONFIRM_SELL: /Przedmiot\s+wys[łl]ano\s+do\s+Transfer\s*[-–—]\s*Sellable/gi,
        // Ogon nazwy bywa różny („FBATransfer-...”) — dopasowanie po początku.
        ROUTE_CONFIRM_UNSELL: /Przedmiot\s+wys[łl]ano\s+do\s+FBATransfer/gi,
        TRIGGER_OBSERVE_AREA_SELECTOR: 'body',
        DEFAULT_TRIGGER_MUTATION_DEBOUNCE_MS: 50,
        MIN_TRIGGER_DEBOUNCE_MS: 50,
        MAX_TRIGGER_DEBOUNCE_MS: 200,
        AVAILABLE_SHORTCUT_KEYS:[
            { code: 'None', name_key: 'key_None' }, { code: 'ShiftRight', name_key: 'key_ShiftRight' },
            { code: 'ControlRight', name_key: 'key_ControlRight' }, { code: 'AltRight', name_key: 'key_AltRight' },
            { code: 'ScrollLock', name_key: 'key_ScrollLock' }, { code: 'Pause', name_key: 'key_PauseBreak' },
            { code: 'Insert', name_key: 'key_Insert' }, { code: 'Numpad0', name_key: 'key_Numpad0' },
            { code: 'NumpadMultiply', name_key: 'key_NumpadMultiply' }, { code: 'NumpadSubtract', name_key: 'key_NumpadSubtract' },
            { code: 'NumpadAdd', name_key: 'key_NumpadAdd' }, { code: 'F10', name_key: 'key_F10' },
        ],
        // --- KARTA CENY ---
        // Zapytanie do amazon.* ze strony T-REX jest niemożliwe (Same-Origin
        // Policy; zablokowane także no-cors, iframe, script src i widżety
        // partnerskie). Działają dwa źródła:
        //   r.jina.ai       — tekst strony, oddaje nagłówki CORS;
        //   graph.keepa.com — obrazek, któremu CORS nie jest potrzebny.
        /**
         * SKLEPY AMAZON. Wybrany sklep rozstrzyga naraz link z ASIN, rynek
         * wykresu Keepa i walutę ceny — rozdzielenie pozwoliłoby otworzyć
         * amazon.de, a liczyć ceny z amazon.co.uk.
         *
         * `keepa` — wartość parametru domain dla graph.keepa.com.
         * `keepa_ok` — czy Keepa ma dane dla rynku. Dla Polski oddaje pusty
         * wykres; link działa, ceny nie będzie.
         */
        MARKETPLACES: {
            'de':     { host: 'www.amazon.de',     keepa: 'de',     currency: 'EUR', keepa_ok: true  },
            'co.uk':  { host: 'www.amazon.co.uk',  keepa: 'co.uk',  currency: 'GBP', keepa_ok: true  },
            'com':    { host: 'www.amazon.com',    keepa: 'com',    currency: 'USD', keepa_ok: true  },
            'it':     { host: 'www.amazon.it',     keepa: 'it',     currency: 'EUR', keepa_ok: true  },
            'fr':     { host: 'www.amazon.fr',     keepa: 'fr',     currency: 'EUR', keepa_ok: true  },
            'es':     { host: 'www.amazon.es',     keepa: 'es',     currency: 'EUR', keepa_ok: true  },
            'nl':     { host: 'www.amazon.nl',     keepa: 'nl',     currency: 'EUR', keepa_ok: true  },
            'ca':     { host: 'www.amazon.ca',     keepa: 'ca',     currency: 'CAD', keepa_ok: true  },
            'se':     { host: 'www.amazon.se',     keepa: 'se',     currency: 'SEK', keepa_ok: true  },
            'com.be': { host: 'www.amazon.com.be', keepa: 'com.be', currency: 'EUR', keepa_ok: true  },
            'pl':     { host: 'www.amazon.pl',     keepa: 'pl',     currency: 'PLN', keepa_ok: false },
        },
        DEFAULT_MARKETPLACE: 'de',
        // Blok ceny na stronie produktu — odpowiedź ok. 1 KB zamiast 200 KB.
        PRICE_JINA_SELECTOR: '#corePriceDisplay_desktop_feature_div',
        // Akceptowany wiek pamięci r.jina.ai: 3 doby (0,6 s z pamięci
        // zamiast ok. 13 s zapytania na żywo).
        PRICE_JINA_CACHE_TOLERANCE_S: 259200,
        PRICE_KEEPA_RANGE: 3,       // dni na wykresie
        // Natywny rozmiar PNG Keepy. W trybie przycięcia obrazek ma dokładnie
        // ten rozmiar i przesuwa się w lewo — tekst legendy zostaje piksel
        // w piksel.
        PRICE_KEEPA_PNG_W: 500,
        PRICE_KEEPA_PNG_H: 200,
        // Ramka legendy w PNG — część, w której Keepa drukuje same ceny.
        // Wyznaczona z pikseli 20 obrazków: znaczniki serii (kółka 8x8) leżą
        // w wierszach y 25..32 i 37..44; legenda jest wyrównana do prawej,
        // więc jej lewa krawędź pływa w x 402..421. Prawa oś wykresu stoi na
        // x=399 albo 405, a tekst nie zaczyna się na lewo od x=423 — granica
        // 407 odcina oś i siatkę, nie dotykając tekstu.
        PRICE_KEEPA_LEGEND_X: 407,
        PRICE_KEEPA_LEGEND_Y: 20,
        PRICE_KEEPA_LEGEND_W: 93,
        PRICE_KEEPA_LEGEND_H: 32,
        PRICE_KEEPA_API_KEY: '',    // płatny klucz Keepa: wpisz — stanie się pierwszym źródłem
        PRICE_KEEPA_API_DOMAIN: 3,  // 1=com 2=co.uk 3=de
        PRICE_MIN_REQUEST_GAP_MS: 3000,
        /**
         * Limit zapytań na sesję — domyślnie bez limitu. Limit trafiałby pod
         * koniec zmiany, gdy utrata ostatnich przedmiotów boli najbardziej.
         * Tempo ogranicza PRICE_MIN_REQUEST_GAP_MS (najwyżej 20 zapytań na
         * minutę) i to, że zapytanie idzie na przedmiot, a nie na mutację DOM.
         * Przy wyłączonym module cen zapytań jest zero.
         *
         * Skończony limit ustawia się w locie: SH.setLimits({ images: 3000 }).
         */
        PRICE_MAX_REQUESTS_PER_SESSION: Infinity,
        PRICE_REQUEST_TIMEOUT_MS: 30000,
        // --- Odczyt ceny z obrazka ---
        // Pasy wierszy legendy: pierwsza seria y25..y31, druga y37..y43,
        // wysokość znaku 7 pikseli (wyznaczone z 20 obrazków).
        PRICE_OCR_BANDS: [[25, 31], [37, 43]],
        // Na lewo od tego jest oś wykresu (x=399..405) — tekstu tam nie ma.
        PRICE_OCR_SCAN_FROM_X: 406,
        /**
         * Lewa granica szukania kolorowego ZNACZNIKA serii — dalej niż granica
         * tekstu. Legenda jest wyrównana do prawej, więc przy cenie
         * czterocyfrowej („€ 2,991.39”) kółko serii ląduje na x≈390. Tekstu na
         * lewo od 406 czytać nie wolno (oś), ale znacznik można tam szukać, bo
         * rozpoznaje się go po nasyconym kolorze, a oś i siatka są szare.
         */
        PRICE_OCR_SERIES_FROM_X: 382,
        // Minimalne max(R,G,B) - min(R,G,B) znacznika serii. Wypełnienie pod
        // wykresem ma rozrzut poniżej 50, znacznik powyżej 80.
        PRICE_OCR_SERIES_MIN_CHROMA: 60,
        // Próg binaryzacji; tekst jest wygładzony, ale przy 200 kształty
        // glifów są stabilne.
        PRICE_OCR_INK_THRESHOLD: 200,
        PRICE_MAX_IMAGE_REQUESTS: Infinity,
        // Ostatnie wyniki do rysowania, póki leci nowe zapytanie — to nie jest
        // pamięć cen (cena jest pytana na nowo przy każdym przedmiocie).
        // Przycinana od najdawniejszego.
        PRICE_CACHE_MAX_ENTRIES: 300,

        /**
         * PRZEGLĄD SKLEPÓW, GDY CENY NIE MA.
         *
         * Keepa bywa bez danych dla wybranego rynku, choć produkt jest na
         * sąsiednim (B00006JCUB: EUR 5,99 na amazon.de, EUR 13,31 na
         * amazon.it). Wtedy skrypt przegląda pozostałe rynki i bierze
         * pierwszy, który oddał cenę:
         *
         *   - tylko dla jednego przedmiotu; wybrany sklep się nie zmienia;
         *   - wszystkie rynki z danymi Keepa (keepa_ok) — cena bywa tylko na
         *     jednym z nich;
         *   - najpierw rynek z linku na stronie (np. amazon.it/dp/…): tam
         *     produkt był wystawiony, zwykle wystarcza jedno zapytanie;
         *   - potem Europa, na końcu PRICE_FALLBACK_LAST; w grupie losowo,
         *     żeby nie dobijać ciągle tego samego rynku;
         *   - sekunda przerwy między próbami; przegląd przerywa się, gdy na
         *     ekranie pojawi się inny przedmiot.
         *
         * Znaleziona cena niesie walutę i link swojego rynku — inaczej link
         * prowadziłby do sklepu, w którym tej ceny nie ma.
         */
        PRICE_FALLBACK_ENABLED: true,
        PRICE_FALLBACK_DELAY_MS: 1000,
        // Hamulec na wypadek, gdyby lista rynków urosła; dziś pytane są wszystkie.
        PRICE_FALLBACK_MAX_TRIES: Infinity,
        // Rynki spoza Europy — w przeglądzie na samym końcu.
        PRICE_FALLBACK_LAST: ['com', 'ca'],
        PRICE_ASIN_FROM_HREF: /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/,
        PRICE_ASIN_FROM_TEXT: /\b(B[01][A-Z0-9]{8})\b/,

        DEFAULT_LANGUAGE: 'pl',
        AVAILABLE_LANGUAGES:[{ code: 'pl', name: 'Polski' }, { code: 'en', name: 'English' }, { code: 'ru', name: 'Русский' }],
    };

    /**
     * Wartości domyślne ustawień wspólnych dla wszystkich kart. Osobny obiekt,
     * bo kod ustawień porównuje z nim stan — do ciągu wchodzi tylko to, co
     * różni się od domyślnego.
     */
    const DEFAULT_USER_CONFIG = {
        language: CONFIG.DEFAULT_LANGUAGE,
        // Sklep Amazon: link z ASIN, rynek wykresu Keepa i waluta ceny.
        marketplace: CONFIG.DEFAULT_MARKETPLACE,
        // Waluta, w której karta ceny i linia 6 pokazują kwoty; sumy są zawsze
        // w euro. 'native' = bez przeliczania (karta w walucie sklepu, linia 6
        // w euro). Domyślne 'EUR' to świadomy wyjątek od zasady „nowe
        // domyślnie wyłączone” (decyzja autora, CLAUDE.md §3): nie dotyka
        // sieci ani liczb, a kartę widać dopiero po włączeniu modułu cen.
        displayCurrency: 'EUR',
        globalStatsContributionKnown: Object.keys(CONFIG.KNOWN_TAB_TYPES)
            .reduce((acc, key) => ({ ...acc, [key]: true }), {}),
        keyboardShortcuts: { INCREMENT: 'None', DECREMENT: 'None' },
        triggerMutationDebounceMs: CONFIG.DEFAULT_TRIGGER_MUTATION_DEBOUNCE_MS,
        settingsPanelWidth: CONFIG.SETTINGS_PANEL_INITIAL_WIDTH_PX,
        customTabSettings: {},
    };

    /**
     * Domyślna konfiguracja linii okna statystyk (visible, kolor, alfa 0-100,
     * rozmiar). Widoczna jest tylko linia 7; linia 6 bez modułu cen nie ma
     * czego sumować.
     */
    const DEFAULT_LINE_CONFIG = {
        line1_currentTab: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        line2_globalSummary: {
            visible: false, colorHex: '#808080', alpha: 60, fontSize: 14,
            multicolor: true,
            customColors: { CRET: '#0078D7', REFURB: '#FFA500', WHD: '#1EB41E', OTHER: '#9E9E9E' }
        },
        line3_shiftInfo: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        line4_lunchInfo: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        line5_realTimeClock: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        // Bilans wartości zmiany; działa tylko z modułem cen.
        line6_valueSum: { visible: false, colorHex: '#7CFFA8', alpha: 85, fontSize: 14 },
        /**
         * LINIA 7 — trzy liczby bez oznaczeń: tempo (paczki na godzinę,
         * wszystkie karty), liczba zrobionych przedmiotów i procent sprzedaży,
         * np. `17.4 28 14%`. To te same liczby, co w linii 2.
         */
        line7_compact: { visible: true, colorHex: '#808080', alpha: 50, fontSize: 13 },
        /**
         * LINIA 8 — bieżące zadanie: nazwa i jego własne liczby (paczki,
         * tempo, procent, przepracowany czas). Linie 1, 2 i 7 pokazują całą
         * zmianę, ta — proces, przy którym człowiek siedzi teraz.
         */
        line8_taskInfo: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 13 }
    };

    const DEFAULT_LOCAL_CONFIG = {
        statsWindowFontFamily: 'monospace',
        linesConfig: JSON.parse(JSON.stringify(DEFAULT_LINE_CONFIG)), // Deep copy
        pageOverlayOpacity: 0,
        pageIndicatorTextVisible: false,
        /**
         * Położenie okna statystyk: lewy dolny róg. Puste `top` znaczy
         * „przyklejone do dołu” i wtedy liczy się `bottom`; po przeciągnięciu
         * do `top` trafia współrzędna (createDragger, applyPosition).
         */
        statsWindowPosition: { top: '', left: '20px', bottom: '8px' },
        statsWindowBgColorHex: '#ffffff',
        statsWindowBgAlpha: 0,
        priceCard: {
            /**
             * GŁÓWNY WYŁĄCZNIK MODUŁU CEN — najważniejsze pole w pliku.
             *
             * false — skrypt nie dotyka sieci zewnętrznej: żadnych kursów,
             * wykresu Keepa, r.jina.ai ani api.keepa.com. Licznik, zmiany,
             * przerwy i linia 7 działają w całości bez sieci.
             * true  — kursy pobierają się raz, cena jest pytana na każdy
             * nowy przedmiot.
             *
             * Włącza się wyłącznie ręcznie, w panelu. Kod ustawień tego pola
             * nie niesie (ConfigCode.RETIRED_IDS). Sprawdzają je niezależnie
             * PriceCard.check(), PriceCard.resolve(), KeepaOCR.loadImage(),
             * ValueLog.add() i FxRates.init() — jedna zapomniana ścieżka nie
             * wystarczy, żeby zapytanie wyszło.
             */
            moduleEnabled: false,
            visible: true,
            // ŹRÓDŁO CENY:
            //   'ocr'   — obrazek Keepa ładuje się w tle i jest rozpoznawany;
            //             na kartę trafia sama liczba. Domyślnie.
            //   'graph' — pokazywać sam obrazek wykresu.
            //   'jina'  — zapytanie tekstowe do r.jina.ai.
            // 'ocr' też potrzebuje graph.keepa.com; gdy CSP strony tnie
            // img-src, tryb nie działa i karta mówi o tym wprost.
            source: 'ocr',
            // Prowadzić dziennik wartości (tylko z modułem cen — ValueLog.add()).
            logValues: true,
            // Szukać ceny w innych sklepach, gdy w wybranym jej nie ma.
            marketFallback: true,
            showPrice: true,
            /**
             * Drugi wiersz ceny: cena katalogowa (RRP) albo druga seria
             * wykresu. Wyłącznik dotyczy tylko cen — powód braku ceny (blokada
             * CSP, limit) idzie tym wierszem zawsze, bo cicha awaria wygląda
             * jak zepsuty skrypt.
             */
            showRrp: false,
            showGraph: true,
            /**
             * Wiersz źródła („keepa-ocr · 96ms”) — informacja dla kogoś, kto
             * dobiera źródło ceny. Adnotacja, że cenę wzięto z innego sklepu,
             * pokazuje się zawsze: bez niej przy dwóch rynkach w euro nie widać
             * różnicy nawet po kwocie.
             */
            showSource: false,
            /**
             * Wyłączniki elementów karty, jak przy liniach okna statystyk:
             * showAsin      — wiersz z kodem produktu;
             * asinClickable — czy kod jest linkiem do sklepu;
             * showLatency   — czas zdobycia ceny.
             */
            showAsin: false,
            /**
             * Karta ma `pointer-events:none`, żeby kliknięcia dochodziły do
             * T-REX; link z kodem produktu jest jedynym miejscem, które łapie
             * mysz i może przykryć cudzy przycisk — dlatego włącza się ręcznie.
             * Przy `false` kod jest zwykłym tekstem: bez `href`, podkreślenia,
             * kursora i `pointer-events`.
             */
            asinClickable: false,
            // Czas zdobycia ceny — liczba diagnostyczna, w pracy tylko hałas.
            showLatency: false,
            // Krój pisma z listy okna statystyk (CONFIG.FONT_FAMILY_OPTIONS):
            // karta ma wyglądać jak reszta interfejsu.
            fontFamily: 'default',
            // Puste top = karta przyklejona do dołu; po przeciągnięciu trafia
            // tam współrzędna i przyklejenie znika.
            position: { left: '14px', top: '' },
            // Szerokość przycina wykres od lewej bez ściskania: przy 280 px
            // widać prawą część, a tam jest legenda z cenami.
            width: 280,
            // Rozmiar jak w linii 7 — karta ma wyglądać jak jedna szara linijka.
            fontSize: 13,
            /**
             * Kolor i przezroczystość wszystkich tekstów karty — jak w linii 7.
             * Kolor jest wyłącznie wyglądem, nie niesie stanu: stan (brak ceny,
             * blokada CSP) mówi tekst, który przy awarii pokazuje się zawsze.
             */
            colorHex: '#808080',
            alpha: 50,
            // Tryb wykresu Keepa:
            //   'legend' — tylko blok z cenami (domyślnie)
            //   'right'  — prawa część wykresu w naturalnej wielkości
            //   'full'   — cały wykres wpisany w szerokość karty
            graphMode: 'legend',
            bgColorHex: '#0a0e18',
            // Tło przezroczyste: przy zerze znikają też ramka i cień
            // (applyStyle), zostaje sam tekst jak w liniach okna. Wyższa
            // wartość przywraca tło, ramkę i cień.
            bgAlpha: 0,
        },
    };
