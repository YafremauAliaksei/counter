// ==UserScript==
// @name         StatsHelper (Reactive Architecture Edition)
// @namespace    bomba.stats.helper
// @version      1.0.0
// @description  Stan reaktywny + EventBus + zmienne CSS. Licznik przetworzonych przedmiotów dla TREX.
// @match        https://trex-prod-eu.aka.amazon.com/*
// @run-at       document-end
// @sandbox      raw
// ==/UserScript==

// =====================================================================
//  HASŁO DOSTĘPU DO PANELU USTAWIEŃ
//  ---------------------------------------------------------------
//  Wpisz te litery gdziekolwiek na stronie (poza polem tekstowym),
//  a panel ustawień się otworzy. Zmiana hasła = zmiana tej jednej
//  linii; długość jest dowolna, wielkość liter nie ma znaczenia
//  (bufor klawiatury jest podnoszony do wielkich liter).
// =====================================================================
const SETTINGS_ACCESS_PASSWORD = 'GORDONPAULE';

// =====================================================================
//  LOGI W KONSOLI — GŁÓWNY WYŁĄCZNIK
//  ---------------------------------------------------------------
//  false (domyślnie) — skrypt NIC nie pisze do konsoli. Ani przy
//                      starcie, ani przy każdym przedmiocie.
//  true              — pełny dziennik pracy: rozpoznanie karty i zmiany,
//                      każdy przedmiot, kierunek sortowania, ceny, kursy.
//
//  Dlaczego domyślnie wyłączone: przez dziesięciogodzinną zmianę licznik
//  wypisywał kilka linii NA KAŻDY przedmiot, czyli tysiące wpisów. Każdy
//  z nich trzyma w pamięci przekazane obiekty (konsola nie zwalnia tego,
//  co jej podano), więc karta puchnie przez całą zmianę, choć nikt do tej
//  konsoli nie patrzy.
//
//  Można przełączyć w locie, bez przeładowania strony:
//      SH.logsOn()    — włącz
//      SH.logsOff()   — wyłącz
//      SH.logs()      — sprawdź stan
//
//  UWAGA: awaria startu skryptu jest wypisywana ZAWSZE, niezależnie od
//  tego ustawienia (Utils.fatal). Inaczej nieudane uruchomienie wyglądałoby
//  jak „nic się nie stało”, a to najszybszy sposób na stracenie pół godziny.
// =====================================================================
const SCRIPT_LOGS_ENABLED = false;

// UWAGA: podstawowy sposób uruchomienia to wklejenie pliku do konsoli DevTools (F12).
// Nagłówek ==UserScript== zostawiono jako dokumentację; API menedżera skryptów (GM_*)
// nie jest nigdzie używane, cały zapis idzie przez localStorage / sessionStorage.
//
// ZMIANY 8.1.0 — CHANGELOG_8.1.0.md (cykl życia zmiany, autozapis)
// ZMIANY 8.2.0 — CHANGELOG_8.2.0.md (karta ceny po ASIN)
// ZMIANY 8.3.0 — CHANGELOG_8.3.0.md (rozbiór błędów znalezionych w przeglądzie 8.2.0)
// ZMIANY 8.4.0/8.4.1 — CHANGELOG_8.4.0.md (cena tekstem, dziennik wartości)
// ZMIANY 8.5.0 — CHANGELOG_8.5.0.md (link do produktu, wybór sklepu,
//                tryb tła karty, pamięć cen usunięta)
// ZMIANY 8.6.0 — CHANGELOG_8.6.0.md (limity zapytań, przegląd sklepów)
// ZMIANY 9.0.0 — CHANGELOG_9.0.0.md (kursy walut w euro, podział
//                sprzedaż/niesprzedaż po kodzie sortowania, bilans w linii 6)
// ZMIANY 9.1.0 — CHANGELOG_9.1.0.md (wspólny dziennik wartości na wszystkie karty)
// ZMIANY 9.1.1 — CHANGELOG_9.1.1.md (separator tysięcy w odczycie ceny)
//
// ZMIANY 9.2.0 — tryb cichy (zawartość przeniesiona do wydania 1.0.0):
//   1. MODUŁ CEN JEST DOMYŚLNIE WYŁĄCZONY. Po uruchomieniu skryptu nie leci
//      ŻADNE zapytanie do sieci zewnętrznej — ani po kursy walut, ani po
//      wykres Keepa, ani przez r.jina.ai. Sieć budzi się dopiero wtedy, gdy
//      człowiek ręcznie włączy moduł w panelu ustawień.
//   2. Linia 2 (podsumowanie globalne) i linia 6 (suma wartości) są domyślnie
//      WYŁĄCZONE. Linia 6 bez modułu cen i tak nie miałaby czego sumować.
//   3. Nowa LINIA 7 — maksymalnie zwięzły widok: dwie liczby oddzielone
//      spacją, szary kolor, alfa 50%, czcionka 13 px, lewy dolny róg
//      (20 px od lewej, 8 px od dołu).
//      Pierwsza liczba to bieżąca wydajność (paczki na godzinę, suma ze
//      WSZYSTKICH otwartych kart), druga to łączna liczba zrobionych
//      przedmiotów — też ze wszystkich kart.
//   4. LOGI W KONSOLI DOMYŚLNIE WYŁĄCZONE (SCRIPT_LOGS_ENABLED poniżej).
//      Cały tekst logów przełożony na polski.
//   5. Zestaw ustawień do samodzielnej edycji znajduje się w zakomentowanym
//      bloku na SAMYM KOŃCU pliku, razem z krótką instrukcją.
//
// ZACHOWANIE DOMYŚLNE, JEDNYM ZDANIEM: skrypt siedzi cicho w lewym dolnym
// rogu, liczy przedmioty ze wszystkich otwartych kart, nie wchodzi do sieci
// i nie pisze nic do konsoli.
//
// ---------------------------------------------------------------------
//  WYDANIE 1.0.0 — PIERWSZE OFICJALNE
// ---------------------------------------------------------------------
//  Kod jest ten sam, co w 9.2.0 — zmieniła się numeracja i sposób pracy
//  nad projektem. Od tego wydania:
//
//    * numeracja zaczyna się od nowa i trzyma SemVer (MAJOR.MINOR.PATCH),
//      gdzie MAJOR rośnie wtedy i tylko wtedy, gdy zmienia się prefiks
//      magazynu, czyli gdy liczniki nie przeniosą się na nową wersję;
//    * TEN PLIK JEST ARTEFAKTEM, NIE ŹRÓDŁEM. Powstaje ze sklejenia
//      modułów z katalogu src/ przez `npm run build`. Ręczne poprawki tutaj
//      zostaną nadpisane przy następnym budowaniu, a CI je odrzuci;
//    * pełny opis możliwości i konfiguracji: README.md w repozytorium,
//      historia wydań: CHANGELOG.md.
//
//  Znaczniki `// ─── src/xx-nazwa.js ───` poniżej pokazują, z którego
//  modułu pochodzi dany fragment — przydaje się przy czytaniu w konsoli.
// ---------------------------------------------------------------------

(function() {
    'use strict';

    // ─── src/01-config.js ───
    // ==========================================
    // 1. STAŁE PODSTAWOWE I KONFIGURACJA
    // ==========================================
    const CONFIG = {
        SCRIPT_VERSION: '1.0.0',
        SCRIPT_NAME: 'Helper (Reactive)',
        /**
         * Prefiks koduje SCHEMAT MAGAZYNU, a nie numer buildu: wydania
         * poprawkowe (jak 8.4.1) nim nie ruszają, żeby nie zerować liczników
         * dla jednej poprawki parsera.
         *
         * Czyli: 1.1.0 i 1.2.0 zostaną przy `v1_0_0`, dopóki nie zmieni się
         * układ zapisywanych pól. Dopiero wtedy prefiks idzie na `v2_0_0`
         * — i to samo w SemVer oznacza podniesienie MAJOR. Jedna reguła,
         * zapisana w dwóch miejscach, i dlatego nie da się o niej zapomnieć:
         *
         *     prefiks się zmienia  <=>  wersja MAJOR rośnie
         *     prefiks się zmienia  =>   liczniki i ustawienia startują od zera
         *     a więc              =>   aktualizacja MIĘDZY zmianami, nie w trakcie
         *
         * Historia: ostatnia taka zmiana to wydanie 9.2.0 (poprzednia numeracja),
         * gdzie doszła linia 7, nowe położenie okna i pole `moduleEnabled`.
         * Gdyby prefiks wtedy został stary, zapisana konfiguracja przykryłaby
         * nowe wartości domyślne i moduł cen wstałby WŁĄCZONY u każdego, kto
         * już używał poprzedniej wersji — czyli dokładnie odwrotnie do zamiaru.
         */
        SCRIPT_ID_PREFIX: 'statsHelper_v1_0_0_',
        // Prefiksy poprzednich wersji: ich klucze są usuwane z localStorage przy
        // pierwszym uruchomieniu, żeby na maszynach ze stałą sesją nie zbierały
        // się śmieci.
        LEGACY_ID_PREFIXES: ['statsHelper_v8_0_0_', 'statsHelper_v8_1_0_', 'statsHelper_v8_2_0_',
                             'statsHelper_v8_3_0_', 'statsHelper_v8_4_0_', 'statsHelper_v8_5_0_',
                             'statsHelper_v8_6_0_', 'statsHelper_v9_0_0_', 'statsHelper_v9_2_0_'],
        /**
         * Czy pisać cokolwiek do konsoli. Wartość bierze się z jednego miejsca
         * na górze pliku (SCRIPT_LOGS_ENABLED), a tutaj żyje dlatego, że
         * SH.logsOn() / SH.logsOff() przełączają ją w locie — stała na górze
         * jest tylko wartością startową.
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
        // Hasło z góry pliku rozbite na znaki — porównanie idzie znak po znaku
        // z buforem klawiatury (patrz InputManager).
        SETTINGS_PANEL_ACCESS_SEQUENCE: String(SETTINGS_ACCESS_PASSWORD).toUpperCase().split(''),
        KNOWN_TAB_TYPES: {
            CRET: { key: 'CRET', displayNameKey: 'tabName_CRET', baseColorHex: '#0078D7', urlKeyword: 'CRETURN' },
            REFURB: { key: 'REFURB', displayNameKey: 'tabName_REFURB', baseColorHex: '#FFA500', urlKeyword: 'CRETURN_REFURB' },
            WHD: { key: 'WHD', displayNameKey: 'tabName_WHD', baseColorHex: '#1EB41E', urlKeyword: 'WAREHOUSE_DEALS' },
        },
        UNKNOWN_TAB_TYPE_KEY: 'UNKNOWN',
        DEFAULT_UNKNOWN_TAB_DETAILS: { key: 'UNKNOWN', displayNameKey: 'tabName_UNKNOWN', baseColorHex: '#808080' },
        UNKNOWN_TAB_INSTANCE_ID_PREFIX: 'unknownTabInstance_',
        MAX_PAGE_OVERLAY_OPACITY_PERCENT: 15,
        // 8.3.0: wcześniej nazywało się SHIFT_TIMES_UTC_PLUS_2, choć w obliczeniu
        // nie ma ani jednej operacji na UTC — wszystko liczy się po CZASIE
        // LOKALNYM przeglądarki (now.getHours()). Nazwa obiecywała przesunięcie,
        // którego w kodzie nie było, i przy przejściu Polski na czas zimowy
        // (UTC+1) wprowadzałaby w błąd.
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
        SESSION_STORAGE_TAB_INSTANCE_ID_KEY: 'tabInstanceId',
        STORAGE_KEY_VALUE_LOG: 'valueLog',

        // --- MAGAZYN WSPÓLNY, NIEZWIĄZANY Z WERSJĄ ---
        // Świadome odstępstwo od zasady „wersja w każdym kluczu”: archiwum
        // podsumowań zmian musi przeżyć aktualizację skryptu, inaczej historia
        // zerowałaby się przy każdej instalacji.
        //
        // Tego klucza NIE rusza ani reset zmiany, ani czyszczenie starych wersji.
        // Przycisk pełnego resetu go usuwa — jawnie wyliczony, patrz ownKeys().
        SHARED_ID_PREFIX: 'statsHelper_shared_',
        STORAGE_KEY_VALUE_ARCHIVE: 'valueArchive',
        STORAGE_KEY_FX_RATES: 'fxRates',
        /**
         * KURSY WALUT (9.0.0).
         *
         * Cena przychodzi w walucie rynku, z którego została zdjęta: funty
         * z co.uk, dolary z com, korony ze se. Składać ich w jedną sumę nie
         * wolno, a trzymać sumę w pięciu walutach nie ma sensu — dlatego
         * wszystko sprowadza się do euro po kursie, który skrypt bierze
         * z otwartego źródła.
         *
         * Trzy źródła po kolei, do pierwszego sukcesu. Sprawdzone na żywo pod
         * kątem nagłówków CORS i szybkości; frankfurter.app i exchangerate.host
         * odpadły (pierwszy nie oddaje CORS, drugi wymaga klucza).
         *
         * ⚠ 9.2.0: te zapytania NIE WYCHODZĄ przy starcie. Kursy pobierane są
         * dopiero po ręcznym włączeniu modułu cen — patrz FxRates.initOffline()
         * i priceModuleOn().
         *
         * ⚠ Dokładność NIE jest tu potrzebna co do grosza: to szacunek „ile
         * wyrobiłem na zmianie”, a nie księgowość. Kurs sprzed miesiąca daje
         * błąd rzędu procentów, co dla takiego szacunku jest bez znaczenia.
         */
        FX_PROVIDERS: [
            { name: 'jsdelivr', url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
              pick: (j) => j && j.eur },
            { name: 'er-api',   url: 'https://open.er-api.com/v6/latest/EUR',
              pick: (j) => j && j.rates },
            // 9.1.0: floatrates oddaje rate ŁAŃCUCHEM („1.15514929”), a normalize()
            // przyjmowało wyłącznie liczbę — przez co trzecie źródło po cichu nie
            // działało nigdy i „trzy źródła po kolei” były w praktyce dwoma.
            // Rzutowanie typu robi teraz i pick, i samo normalize.
            { name: 'floatrates', url: 'https://www.floatrates.com/daily/eur.json',
              pick: (j) => { if (!j) return null; const o = {}; for (const k in j) o[k] = j[k] && Number(j[k].rate); return o; } },
        ],
        // Kursy zmieniają się wolno, a skrypt startuje co zmianę.
        // Doba to jedno zapytanie dziennie i zawsze „kurs z tego miesiąca”.
        FX_TTL_MS: 24 * 60 * 60 * 1000,
        FX_TIMEOUT_MS: 8000,
        /**
         * Kursy zapasowe (ile jednostek waluty za 1 EUR) na wypadek, gdy sieć
         * albo CSP nie pozwalają zapytać. Zdjęte 15.09.2026; trzy niezależne
         * źródła zgodziły się tego dnia co do trzeciego miejsca po przecinku.
         *
         * 9.2.0: to jest wartość, z którą skrypt pracuje przy WYŁĄCZONYM module
         * cen. Nie ma tu żadnego zapytania — tablica jest wpisana w plik.
         */
        FX_FALLBACK: { EUR: 1, USD: 1.156, GBP: 0.856, PLN: 4.33, SEK: 11.27, CAD: 1.605 },
        // 8.5.0: klucz pamięci cen został wyłącznie do jednorazowego sprzątania —
        // sama pamięć została usunięta.
        LEGACY_SHARED_KEYS: ['asinPrices'],
        /**
         * Wpisów w dzienniku bieżącej zmiany. 10,5 h pracy tylu nie da, to
         * zabezpieczenie przed nieskończonym wzrostem przy nietypowym
         * zachowaniu strony.
         *
         * 9.1.0: podniesione z 3000. Dziennik jest teraz WSPÓLNY na wszystkie
         * karty, a jeden fizyczny przedmiot zgodnie z prawdą daje dwa wpisy
         * (wyjechał z CRET do WHD ze znakiem minus, wrócił sprzedażą z karty
         * WHD ze znakiem plus). 6000 wpisów to ~1 MB JSON — granica, za którą
         * localStorage dzielony z samym TREX robi się ciasny.
         */
        VALUE_LOG_MAX_ENTRIES: 6000,
        // Archiwum przepisywane jest nie przy każdym wpisie, tylko paczką: przez
        // zmianę idą tysiące przedmiotów, a pełny rozbiór i złożenie 60 zmian
        // dla każdego z nich to czysta strata i na CPU, i na zapis do localStorage.
        VALUE_ARCHIVE_WRITE_DEBOUNCE_MS: 5000,
        // Archiwum trzyma tylko PODSUMOWANIA zmian, nie pozycje: pełna lista
        // z 60 zmian nie zmieściłaby się w localStorage dzielonym z samym TREX.
        VALUE_ARCHIVE_MAX_SHIFTS: 60,

        // --- Zarządzanie cyklem życia zmiany (8.1.0) ---
        // Zmiana trwa 10,5 h. Jeśli zapisany początek zmiany jest starszy niż
        // 12 h — dane są na pewno z poprzedniej zmiany (maszyna nie zresetowała
        // sesji) i podlegają wyczyszczeniu.
        STALE_SESSION_MS: 12 * 60 * 60 * 1000,
        // Wpisy o aktywnych kartach starsze niż ten okres są wyrzucane.
        TAB_INSTANCE_TTL_MS: 12 * 60 * 60 * 1000,
        // Różnica między zapisanym a wyliczonym początkiem zmiany, po której
        // zmianę uznaje się za inną (ochrona przed drganiem paru sekund).
        SHIFT_IDENTITY_TOLERANCE_MS: 60 * 1000,
        // Dopóki zmiana nie jest rozpoznana (skrypt wystartował przed otwarciem
        // okna zmiany) — sprawdzać ponownie w tym odstępie.
        SHIFT_RETRY_INTERVAL_MS: 30 * 1000,
        // Autozapis ustawień po zmianie stanu.
        AUTOSAVE_DEBOUNCE_MS: 1000,
        // Okno ciszy po zastosowaniu danych z innej karty: chroni przed
        // nieskończonym ping-pongiem zapisów między kartami.
        REMOTE_APPLY_SUPPRESS_MS: 2500,
        PRE_TRIGGER_REGEX: /poniżej|видите ниже|Transparency/i,
        AUTO_TRIGGER_REGEX: /Przypisz (nowy|ponownie)|канирование номера LP:|Przedmiot wysłano do (?!PROBLEM-SOLVE\b).+/i,
        /**
         * DOKĄD POJECHAŁ PRZEDMIOT: sprzedaż czy utylizacja (9.0.0).
         *
         * Na ekranie pojawia się linia typu „Zeskanuj <KOD>” albo
         * „Zeskanuj - <KOD>” (z myślnikiem i bez — oba warianty występują).
         * Kod mówi, w którą stronę pojechał przedmiot, i jego wartość idzie
         * albo na plus, albo na minus.
         *
         * Moment pojawienia się kodu NIE jest związany z zakończeniem
         * przedmiotu: może wyskoczyć przed wyzwalaczem końcowym, razem z nim
         * albo już po nim — ale zawsze PRZED początkiem następnego przedmiotu.
         * Dlatego kierunek śledzi osobny mały automat (moduł Routing), a nie
         * odczyt „w momencie zakończenia”.
         */
        ROUTE_SELL_CODES: ['CRITS-PRG2', 'CRITS-MXP6', 'CRITS-POZ1', 'CRITS-LEJ5'],
        ROUTE_UNSELL_CODES: ['Liquidation', 'FBA-DE-Unsellable', 'Remove', 'WHD',
                             'Stow-Unsellable', 'Refurb'],
        /**
         * Kod, który sam z siebie niczego nie rozstrzyga: przedmiot może
         * pojechać i na sprzedaż, i do utylizacji. Kierunek staje się znany
         * z następnej linii — ROUTE_CONFIRM_SELL albo ROUTE_CONFIRM_UNSELL.
         * Do tego czasu przedmiot wisi nieokreślony.
         */
        ROUTE_AMBIGUOUS_CODE: 'Secondary-Sorting',
        ROUTE_CONFIRM_SELL: /Przedmiot\s+wys[łl]ano\s+do\s+Transfer\s*[-–—]\s*Sellable/gi,
        // Ogon nazwy bywa różny („FBATransfer-...”), więc czepiamy się początku
        // słowa, a nie dokładnego dopasowania.
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
        // --- KARTA CENY (8.2.0) ---
        // Bezpośrednie zapytanie do amazon.* ze strony jest niemożliwe:
        // Same-Origin Policy. Sprawdzone na żywo — zablokowane we wszystkich
        // wariantach, łącznie z no-cors, iframe, script src i widżetami
        // partnerskimi amazon-adsystem. Działają dokładnie dwa źródła:
        //   r.jina.ai       — tekst strony, oddaje nagłówki CORS;
        //   graph.keepa.com — obrazek, któremu CORS z zasady nie jest potrzebny.
        /**
         * SKLEPY AMAZON (8.5.0).
         *
         * Jedno ustawienie rozstrzyga naraz trzy rzeczy: dokąd prowadzi link
         * z ASIN, z którego rynku Keepa rysuje wykres i w jakiej walucie liczy
         * się dziennik. Rozdzielać ich na osobne ustawienia nie wolno: dałoby
         * się wtedy otworzyć link na amazon.de, a sumę zbierać po cenach
         * z amazon.co.uk.
         *
         * Pole keepa — wartość parametru domain dla graph.keepa.com.
         *
         * ⚠ POKRYCIE KEEPA JEST NIEPEŁNE. Sprawdzone na żywo: wykres z danymi
         * oddają de, co.uk, com, it, fr, es, nl, ca. Dla POLSKI Keepa oddaje
         * pusty wykres — i dla łańcuchowego `pl`, i dla liczbowego `16`, na
         * wszystkich sprawdzonych polskich bestsellerach. Link do produktu
         * działa przy tym dla każdego sklepu z tablicy, tylko ceny nie będzie.
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
        // Blok ceny na stronie produktu. Odpowiedź ~350-1800 bajtów zamiast 200 KB.
        PRICE_JINA_SELECTOR: '#corePriceDisplay_desktop_feature_div',
        // Wiek pamięci jina, który nam odpowiada: 3 doby.
        // Pomiar: 3 dni -> 0,6 s z pamięci, 0 -> 13,1 s zapytanie na żywo.
        PRICE_JINA_CACHE_TOLERANCE_S: 259200,
        PRICE_KEEPA_RANGE: 3,       // dni na wykresie
        // Natywny rozmiar PNG u Keepy. W trybie przycięcia obrazek wychodzi
        // dokładnie w tym rozmiarze i przesuwa się w lewo — wtedy tekst legendy
        // zostaje piksel w piksel i czyta się najlepiej.
        PRICE_KEEPA_PNG_W: 500,
        PRICE_KEEPA_PNG_H: 200,
        // Ramka legendy wewnątrz PNG — ta część, w której Keepa drukuje same ceny.
        // Współrzędne dobrane nie na oko: obrazki 20 produktów rozebrane przez
        // canvas (Keepa oddaje CORS, więc dostęp do pikseli jest). Znaczniki
        // legendy — kółka 8x8 — leżą stabilnie w wierszach y 25..32 i y 37..44,
        // a lewa krawędź bloku pływa w zakresie x 402..421, bo legenda jest
        // wyrównana do prawej i przesuwa się zależnie od długości ceny.
        // Ramka poniżej sprawdzona na wszystkich 20 próbkach: czysty blok z cenami,
        // bez siatki i linii wykresu.
        // Lewa granica 407 nie jest wybrana na ślepo: prawa oś wykresu stoi na
        // x=399 albo x=405 (zależnie od szerokości podpisów), a tekst legendy
        // nigdzie nie zaczyna się na lewo od x=423. 407 na pewno odcina oś
        // i siatkę, nie dotykając tekstu. Sprawdzone na wszystkich 20 próbkach.
        PRICE_KEEPA_LEGEND_X: 407,
        PRICE_KEEPA_LEGEND_Y: 20,
        PRICE_KEEPA_LEGEND_W: 93,
        PRICE_KEEPA_LEGEND_H: 32,
        PRICE_KEEPA_API_KEY: '',    // płatny klucz Keepa: wpisz — stanie się pierwszym źródłem
        PRICE_KEEPA_API_DOMAIN: 3,  // 1=com 2=co.uk 3=de
        PRICE_MIN_REQUEST_GAP_MS: 3000,
        /**
         * LIMITY ZAPYTAŃ NA SESJĘ — ZDJĘTE W 9.1.0.
         *
         * Wcześniej stały tu skończone liczby, a sens miały higieniczny: nie
         * dobijać cudzego serwisu, jeśli skrypt zwariuje. W praktyce cena tego
         * zabezpieczenia okazała się wyższa niż pożytek: w limit można wejść
         * dopiero POD KONIEC zmiany, czyli dokładnie wtedy, gdy dziennik jest
         * prawie zebrany i utrata ostatnich przedmiotów boli najbardziej.
         *
         * Samoograniczenie nie zniknęło i trzyma się na czym innym: przerwa
         * PRICE_MIN_REQUEST_GAP_MS między zapytaniami fizycznie nie pozwala
         * wyjść szybciej niż 20 zapytań na minutę, a zapytanie idzie na
         * przedmiot, nie na mutację DOM.
         *
         * 9.2.0 dokłada do tego mocniejszy bezpiecznik: przy wyłączonym module
         * cen liczba zapytań wynosi dokładnie ZERO, bo sieci nie dotyka nikt.
         *
         * Mechanizm limitów w kodzie ZOSTAŁ: w razie potrzeby skończona liczba
         * wraca w locie, bez przeładowania — SH.setLimits({ images: 3000 }).
         */
        PRICE_MAX_REQUESTS_PER_SESSION: Infinity,
        PRICE_REQUEST_TIMEOUT_MS: 30000,
        // --- Odczyt ceny z obrazka (8.4.0) ---
        // Pasy wierszy legendy. Nie „na oko”: rozbiór 20 obrazków pokazał, że
        // tekst jest zawsze dokładnie w tych wierszach — pierwsza seria y25..y31,
        // druga y37..y43, wysokość znaku 7 pikseli.
        PRICE_OCR_BANDS: [[25, 31], [37, 43]],
        // Bardziej w lewo nie ma czego czytać: prawa oś wykresu stoi na x=399..405.
        PRICE_OCR_SCAN_FROM_X: 406,
        /**
         * Osobna, bardziej lewa granica dla szukania KOLOROWEGO ZNACZNIKA serii (9.1.1).
         *
         * Legenda jest wyrównana do prawej, więc im dłuższa cena, tym bardziej
         * w lewo ucieka cały blok. Przy cenie czterocyfrowej („€ 2,991.39”)
         * kółko serii ląduje na x≈390 — czyli NA LEWO od PRICE_OCR_SCAN_FROM_X,
         * i seria przestawała być rozpoznawana w ogóle: na karcie było
         * „? 2991.39”.
         *
         * Granica tekstu i granica znacznika to różne rzeczy i rozdzielone są
         * celowo: tekstu na lewo od 406 nadal czytać nie wolno (tam jest oś
         * wykresu), a znacznika tam szukać można, bo rozpoznaje się go po
         * NASYCONYM kolorze, a oś i siatka są szare.
         */
        PRICE_OCR_SERIES_FROM_X: 382,
        // Na ile kolor musi być „kolorowy”, żeby uznać go za znacznik serii:
        // max(R,G,B) - min(R,G,B). Wypełnienie pod wykresem to blady odcień
        // (rozrzut poniżej 50), znacznik to czysty kolor (rozrzut powyżej 80).
        PRICE_OCR_SERIES_MIN_CHROMA: 60,
        // Próg binaryzacji. Tekst jest wygładzony, ale przy 200 kształty glifów
        // są stabilne.
        PRICE_OCR_INK_THRESHOLD: 200,
        PRICE_MAX_IMAGE_REQUESTS: Infinity,
        // Pamięć karty na ostatnie wyniki. To nie jest cache (cena pytana jest
        // od nowa na każdy przedmiot, patrz 8.5.0), tylko to, co rysuje się na
        // ekranie, póki leci nowe zapytanie. Przez zmianę ASIN-ów jest ponad
        // tysiąc, dlatego Mapa jest przycinana zasadą „wyrzucamy najdawniejszy”.
        PRICE_CACHE_MAX_ENTRIES: 300,

        /**
         * PRZEGLĄD SKLEPÓW, GDY CENY NIE MA (8.6.0).
         *
         * Keepa nierzadko oddaje pustą legendę dla wybranego rynku, choć
         * produkt jest na stronie w sprzedaży: historia tego ASIN na tym rynku
         * po prostu nie została zebrana. Ten sam produkt bywa przy tym na
         * sąsiednim rynku — sprawdzone: B00006JCUB daje EUR 5,99 na amazon.de
         * i EUR 13,31 na amazon.it.
         *
         * Dlatego po niepowodzeniu skrypt przegląda POZOSTAŁE sklepy i bierze
         * pierwszy, który oddał cenę. Zasady przeglądu:
         *
         *   - tylko dla JEDNEGO przedmiotu: ustawienie sklepu się nie zmienia,
         *     następny przedmiot znów zaczyna od wybranego domyślnie;
         *   - kolejność LOSOWA, żeby nie dobijać tego samego rynku zapasowego
         *     tysiąc razy na zmianę;
         *   - między próbami sekunda przerwy — to tło, nie ma po co się spieszyć;
         *   - tylko rynki, dla których Keepa w ogóle ma dane (keepa_ok).
         *
         * Cena znaleziona na innym rynku ciągnie za sobą i walutę, i link
         * z ASIN: inaczej człowiek otworzyłby amazon.de i nie znalazł tam tej
         * ceny, którą widzi na karcie.
         */
        PRICE_FALLBACK_ENABLED: true,
        PRICE_FALLBACK_DELAY_MS: 1000,
        // Ile rynków zapasowych próbować. Więcej — dłużej i drożej w zapytaniach;
        // w praktyce cena znajduje się w pierwszych dwóch-trzech.
        PRICE_FALLBACK_MAX_TRIES: 5,
        PRICE_ASIN_FROM_HREF: /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/,
        PRICE_ASIN_FROM_TEXT: /\b(B[01][A-Z0-9]{8})\b/,

        DEFAULT_LANGUAGE: 'pl',
        AVAILABLE_LANGUAGES:[{ code: 'pl', name: 'Polski' }, { code: 'en', name: 'English' }, { code: 'ru', name: 'Русский' }],
    };

    /**
     * Domyślna konfiguracja linii (visible, color, alpha 0-100, fontSize
     * oraz ewentualne podsekcje).
     *
     * ZMIANA DOMYŚLNYCH USTAWIEŃ W 9.2.0 — trzy rzeczy naraz:
     *
     *   linia 2 — WYŁĄCZONA. Jej treść (rozbicie na działy + suma) w całości
     *             mieści się w nowej linii 7, tylko dużo ciszej.
     *   linia 6 — WYŁĄCZONA. To bilans pieniężny zmiany, a przy wyłączonym
     *             module cen nie ma z czego go złożyć: wszystkie pozycje byłyby
     *             bez ceny, więc linia pokazywałaby same zera i „?N”.
     *   linia 7 — WŁĄCZONA. Jedyna widoczna domyślnie.
     */
    const DEFAULT_LINE_CONFIG = {
        line1_currentTab: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        line2_globalSummary: {
            visible: false, colorHex: '#808080', alpha: 60, fontSize: 14,
            multicolor: true,
            customColors: { CRET: '#0078D7', REFURB: '#FFA500', WHD: '#1EB41E' }
        },
        line3_shiftInfo: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        line4_lunchInfo: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        line5_realTimeClock: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 14 },
        // 8.4.0: suma wartości przetworzonych przedmiotów. Od 9.2.0 domyślnie
        // wyłączona — patrz komentarz wyżej.
        line6_valueSum: { visible: false, colorHex: '#7CFFA8', alpha: 85, fontSize: 14 },
        /**
         * LINIA 7 — TRYB ZWIĘZŁY (9.2.0).
         *
         * Dwie liczby oddzielone spacją i nic więcej:
         *
         *     17.4 28
         *
         * Pierwsza to bieżąca wydajność w paczkach na godzinę, zsumowana ze
         * WSZYSTKICH kart — dokładnie ta sama liczba, która w linii 2 stoi po
         * znaku „=”. Druga to łączna liczba zrobionych przedmiotów, czyli to,
         * co w linii 2 jest w nawiasie na samym końcu.
         *
         * Bez oznaczeń, bez jednostek, bez nazw działów. Odświeżanie raz na
         * sekundę, tak jak reszta okna.
         */
        line7_compact: { visible: true, colorHex: '#808080', alpha: 50, fontSize: 13 }
    };

    const DEFAULT_LOCAL_CONFIG = {
        statsWindowFontFamily: 'monospace',
        linesConfig: JSON.parse(JSON.stringify(DEFAULT_LINE_CONFIG)), // Deep copy
        pageOverlayOpacity: 0,
        pageIndicatorTextVisible: false,
        /**
         * POŁOŻENIE OKNA STATYSTYK (9.2.0: LEWY DOLNY RÓG).
         *
         * Puste `top` znaczy „przyklejone do dołu”, wtedy liczy się `bottom`.
         * Po przeciągnięciu okna myszą do `top` trafia współrzędna i przyklejenie
         * samo znika (patrz createDragger i StatsWindowRenderer.applyPosition).
         *
         * Ten sam wzorzec, co w karcie ceny — nie trzeba było wymyślać drugiego.
         */
        statsWindowPosition: { top: '', left: '20px', bottom: '8px' },
        statsWindowBgColorHex: '#ffffff',
        statsWindowBgAlpha: 0,
        priceCard: {
            /**
             * GŁÓWNY WYŁĄCZNIK MODUŁU CEN (9.2.0) — NAJWAŻNIEJSZE POLE W PLIKU.
             *
             * false = skrypt NIE DOTYKA sieci zewnętrznej. Żadnych kursów walut,
             * żadnego wykresu Keepa, żadnego r.jina.ai, żadnego api.keepa.com.
             * Licznik przedmiotów, zmiany, przerwy i linia 7 działają w całości
             * — one nie potrzebują sieci nigdy.
             *
             * true  = wszystko wraca: kursy pobierają się raz, a cena pytana jest
             * na każdy nowy przedmiot.
             *
             * Przełącznik jest w panelu ustawień (sekcja „Moduł cen”) i tylko
             * tam — sam z siebie nie włączy się nigdy, nawet po restarcie
             * przeglądarki, bo wartość leży w konfiguracji karty.
             *
             * Zabezpieczenie jest WIELOWARSTWOWE, celowo nadmiarowo: sprawdzają
             * je PriceCard.check(), PriceCard.resolve(), KeepaOCR.loadImage(),
             * ValueLog.add() i FxRates.init(). Jedna zapomniana ścieżka nie
             * wystarczy, żeby zapytanie wyszło.
             */
            moduleEnabled: false,
            visible: true,
            // ŹRÓDŁO CENY — jedna z trzech pozycji (8.4.0):
            //   'ocr'   — obrazek Keepa ładuje się W TLE, jest rozpoznawany,
            //             a na kartę trafia sama LICZBA. Domyślnie.
            //   'graph' — pokazywać sam obrazek wykresu (zachowanie 8.2-8.3).
            //   'jina'  — zapytanie tekstowe do r.jina.ai.
            //
            // WAŻNE o 'ocr': tekst bierze się Z OBRAZKA, więc zapytanie do
            // graph.keepa.com i tak jest potrzebne — obrazek po prostu nigdzie
            // się nie pokazuje. Jeśli CSP strony tnie img-src, tryb nie działa
            // w ogóle i karta mówi o tym wprost.
            source: 'ocr',
            // Prowadzić dziennik wartości przetworzonych przedmiotów.
            // Działa tylko przy włączonym module cen — patrz ValueLog.add().
            logValues: true,
            // Szukać ceny w innych sklepach, jeśli w wybranym jej nie ma (8.6.0).
            marketFallback: true,
            showPrice: true,
            showRrp: true,
            showGraph: true,
            // top puste = karta przyklejona do dołu; po przeciągnięciu trafia
            // tam współrzędna i przyklejenie znika.
            position: { left: '14px', top: '' },
            // Szerokość karty przycina wykres OD LEWEJ, nie ściskając go: przy
            // 280px widać prawą część w naturalnej wielkości, a tam jest legenda
            // z cenami.
            width: 280,
            fontSize: 30,
            // Tryb wyświetlania wykresu Keepa:
            //   'legend' — tylko blok z cenami (domyślnie)
            //   'right'  — prawa część wykresu w naturalnej wielkości
            //   'full'   — cały wykres wpisany w szerokość karty
            graphMode: 'legend',
            bgColorHex: '#0a0e18',
            bgAlpha: 88,
        },
    };

    // ─── src/02-i18n-strings.js ───
    // ==========================================
    // 2. SŁOWNIKI I18N
    // ==========================================
    const LANG_STRINGS = {
        en: {
            scriptLoaded: '${scriptName} v${version} Loaded.', yes: 'Yes', no: 'No', notApplicable: 'NA',
            error_items_per_hour_unavailable: '~0.0/h (short work time)', fromUnit: 'from', inUnit: 'in',
            hoursShort: 'h', minutesShort: 'm', secondsShort: 's', statsPerHourUnit: '/h', completedUnit: 'done',
            tabName_CRET: 'CRET', tabName_REFURB: 'REFURB', tabName_WHD: 'WHD', tabName_UNKNOWN: 'UNKNOWN',
            statsLine1_current: '${tabName} ${itemsPerHour}${statsPerHourUnit} (${count} ${completedUnit} ${inUnit} ${workTimeFormatted})',
            statsLine2_global_separator: ' ',
            statsLine2_global_tab_format: '${tabName} ${itemsPerHour}${statsPerHourUnit}(${count})',
            statsLine2_global_total_format: '= ~${totalItemsPerHour}${statsPerHourUnit} (${totalCount})',
            statsLine3_shift: '${shiftType} Shift (${shiftStartTime})', statsLine4_lunch: 'Lunch #${lunchNumber} (${lunchStartTime} - ${lunchEndTime})',
            statsLine5_clock: '[ ${currentTime} ]', shift_day: 'DAY', shift_night: 'NIGHT',
            statsLine6_undet: '?${n}',
            statsLine6_items: '${n} pcs',
            valueLog_fx: 'Rates: ${src} (${brief})',
            valueLog_fxRefresh: 'Refresh Rates',
            valueLog_routeStats: 'sold ${sold}, unsold ${unsold}, undetermined ${undet}',
            lineSettings_valueSum: 'Line 6: Processed Value Sum',
            lineSettings_compact: 'Line 7: Compact counter',
            lineSettings_compactHint: 'Two numbers: items per hour (all tabs) and items done. Nothing else.',
            priceModule_section: 'Price Module (network)',
            priceModule_enabled: 'Enable the price module',
            priceModule_hint: 'OFF by default. While it is off the script makes NO requests to the internet: no currency rates, no Keepa chart, no r.jina.ai. The item counter, shift, breaks and line 7 work without the network.',
            priceModule_offNotice: 'Module off — the settings below start working once you switch it on.',
            priceModule_fxOffline: 'built-in (no network)',
            lineSettings_valueSumHint: 'Opacity applies to the whole line. The colour applies to the item count only — plus stays green and minus stays red, that is what makes the sign readable.',
            valueLog_section: 'Processed Value Log',
            valueLog_enabled: 'Log value of completed items',
            valueLog_hint: 'Only items that went the full path are counted (the counter added +1).',
            valueLog_reset: 'Reset Value Log',
            valueLog_resetConfirm: 'Clear the value log for this shift? Item counters are kept.',
            valueLog_export: 'Print Log to Console',
            valueLog_stats: '${count} items, Σ ${sum} ${currency}, without price: ${unpriced}',
            lunch_day1: 'Day Lunch 1 (11:20-11:50)', lunch_day2: 'Day Lunch 2 (11:50-12:20)', lunch_day3: 'Day Lunch 3 (12:20-12:50)', lunch_day4: 'Day Lunch 4 (12:50-13:20)',
            lunch_night1: 'Night Lunch 1 (23:20-23:50)', lunch_night2: 'Night Lunch 2 (23:50-00:20)', lunch_night3: 'Night Lunch 3 (00:20-00:50)', lunch_night4: 'Night Lunch 4 (00:50-01:20)',
            settingsPanelTitle: '${scriptName} Settings', settings_applyAndCloseButton: 'Apply & Close', settings_applyButton: 'Apply',
            settings_resetAllDataButton: 'Reset All Script Data', settings_resetWindowPositionButton: 'Reset Window Position',
            settings_resetConfirm: 'Erase all StatsHelper data (settings and counters)? Data of the TREX app itself is not affected.',
            settings_resetCountersButton: 'Reset Item Counters Only', settings_resetCountersConfirm: 'Reset item counters to zero? Appearance settings are kept.',
            newShiftDetected: 'New shift detected — item counters have been reset.',
            resetNotice_stale: 'Data from the previous shift — item counters have been reset.',
            resetNotice_manual: 'Item counters have been reset.',
            settings_manualCounterInputLabel: 'Set count', section_general: 'General', section_currentTab: 'Current Tab Settings (${tabInstanceId})',
            section_visualAids: 'Page Visual Aids (for ${tabName})', section_statsWindow: 'Statistics Window Styling',
            section_globalStats: 'Global Statistics (Known Types)', section_keyboardShortcuts: 'Keyboard Shortcuts',
            section_autoIncrement: 'Auto-Increment', section_lunchSelection: 'Lunch Break Selection', section_otherCustomTabs: 'Other Configured Custom Tabs',
            language: 'Language', customTabDisplayName: 'Display Name', customTabIncludeInGlobal: 'Include this tab in global sum',
            overlayOpacity: 'Overlay Opacity: ${value}%', showPageIndicator: 'Show Page Indicator Text', windowBgSettings: 'Window Background',
            lineSettings_currentTab: 'Line 1: Current Tab Stats', lineSettings_globalSummary: 'Line 2: Global Summary',
            lineSettings_shiftInfo: 'Line 3: Shift Information', lineSettings_lunchInfo: 'Line 4: Lunch Information', lineSettings_realTimeClock: 'Line 5: Real-Time Clock',
            fontFamily: 'Font Family', fontSize: 'Font Size: ${value}px', dragStatsWindowButton: 'Make Stats Window Draggable', dragStatsWindowActiveButton: 'Window is Draggable (Click to Pin)',
            includeInGlobal_known: 'Include ${tabName}', incrementKey: 'Increment (+1) Key', decrementKey: 'Decrement (-1) Key', scanIntervalAutoIncrement: 'Scan Interval: ${value}ms',
            noCustomTabsConfigured: 'No other custom tabs configured yet.', customTabEntryFormat: '${displayName} (${instanceId_short}) - Included: ${isIncludedStr}',
            fontFamily_default: 'Default (System UI)', fontFamily_monospace: 'Monospace', fontFamily_sans_serif_thin: 'Thin Sans-Serif',
            key_None: 'Disabled', key_ShiftRight: 'Right Shift', key_ControlRight: 'Right Ctrl', key_AltRight: 'Right Alt', key_ScrollLock: 'Scroll Lock', key_PauseBreak: 'Pause/Break', key_Insert: 'Insert',
            key_Numpad0: 'Numpad 0', key_NumpadMultiply: 'Numpad *', key_NumpadSubtract: 'Numpad -', key_NumpadAdd: 'Numpad +', key_F10: 'F10',
            initialNotification_currentTab: 'Current Tab:', initialNotification_shiftStart: 'Shift Start:',
            priceCard_cspImg: 'Page CSP blocks the Keepa chart',
            priceCard_cspNet: 'Page CSP blocks price requests',
            priceCard_cspBoth: 'Page CSP blocks both sources',
            priceCard_marketplace: 'Amazon store',
            priceCard_fallback: 'Search other stores if there is no price',
            priceCard_fallbackHint: 'One item at a time, random order, 1s apart. The default store is not changed.',
            priceCard_searchingOther: 'searching other stores…',
            priceCard_foundIn: 'found on ${host}',
            priceCard_marketNoKeepa: 'Keepa has no chart for this store — link works, price will not',
            priceCard_openHint: 'Click the ASIN to open the product page',
            priceCard_hiddenHint: 'Card hidden — price is still read and added to the sum',
            priceCard_showCard: 'Show the card on screen',
            priceCard_refreshing: 'refreshing…',
            priceCard_source: 'Price source',
            priceCard_src_ocr: 'Price as text (recognised from chart)',
            priceCard_src_graph: 'Keepa chart image',
            priceCard_src_jina: 'Text request (r.jina.ai)',
            priceCard_ocrFail: 'could not read price off the chart',
            priceCard_cspOcr: 'Page CSP blocks the Keepa image — cannot read price',
            priceCard_fromCache: 'from cache',
            priceCard_cacheAge: '${days}d ago',
            priceCard_graphMode: 'Chart area', priceCard_mode_legend: 'Prices only (from chart)',
            priceCard_mode_right: 'Right part, actual size', priceCard_mode_full: 'Whole chart',
            priceCard_jinaOff: 'text lookup off',
            priceCard_section: 'Price Card', priceCard_enabled: 'Show price card',
            priceCard_showPrice: 'Show current price', priceCard_showRrp: 'Show list price (RRP)',
            priceCard_showGraph: 'Show Keepa chart',
            priceCard_width: 'Card width: ${value}px', priceCard_fontSize: 'Price size: ${value}px',
            priceCard_bg: 'Card background', priceCard_drag: 'Make Card Draggable',
            priceCard_dragActive: 'Card is Draggable (Click to Pin)', priceCard_resetPosition: 'Reset Card Position',
            priceCard_searching: 'looking up price...', priceCard_noPrice: 'price not available',
            priceCard_noAsin: 'no ASIN on page', priceCard_item: 'item', priceCard_rrp: 'RRP',
            priceCard_seeChart: 'see the chart', priceCard_cached: 'cached', priceCard_limit: 'session limit reached',
            multicolorMode: 'Multi-Color Departments', tabColors: 'Dept. Colors:'
        },
        pl: {
            scriptLoaded: '${scriptName} v${version} Załadowany.', yes: 'Tak', no: 'Nie', notApplicable: 'BD',
            error_items_per_hour_unavailable: '~0.0/h (za krótki czas)', fromUnit: 'od', inUnit: 'w',
            hoursShort: 'g', minutesShort: 'm', secondsShort: 's', statsPerHourUnit: '/h', completedUnit: 'zrobione',
            tabName_CRET: 'CRET', tabName_REFURB: 'REFURB', tabName_WHD: 'WHD', tabName_UNKNOWN: 'NIEZNANA',
            statsLine1_current: '${tabName} ${itemsPerHour}${statsPerHourUnit} (${count} ${completedUnit} ${inUnit} ${workTimeFormatted})',
            statsLine2_global_separator: ' ', statsLine2_global_tab_format: '${tabName} ${itemsPerHour}${statsPerHourUnit}(${count})', statsLine2_global_total_format: '= ~${totalItemsPerHour}${statsPerHourUnit} (${totalCount})',
            statsLine3_shift: '${shiftType} zmiana (${shiftStartTime})', statsLine4_lunch: 'Przerwa #${lunchNumber} (${lunchStartTime} - ${lunchEndTime})', statsLine5_clock: '[ ${currentTime} ]',
            statsLine6_undet: '?${n}',
            statsLine6_items: '${n} szt',
            valueLog_fx: 'Kursy: ${src} (${brief})',
            valueLog_fxRefresh: 'Odśwież kursy',
            valueLog_routeStats: 'sprzedane ${sold}, niesprzedane ${unsold}, nieokreślone ${undet}',
            lineSettings_valueSum: 'Linia 6: Suma wartości',
            lineSettings_compact: 'Linia 7: Licznik zwięzły',
            lineSettings_compactHint: 'Dwie liczby: paczki na godzinę (wszystkie karty) i zrobione sztuki. Nic więcej.',
            priceModule_section: 'Moduł cen (sieć)',
            priceModule_enabled: 'Włącz moduł cen',
            priceModule_hint: 'Domyślnie WYŁĄCZONY. Póki jest wyłączony, skrypt nie wysyła ŻADNYCH zapytań do internetu: ani po kursy walut, ani po wykres Keepa, ani do r.jina.ai. Licznik przedmiotów, zmiana, przerwy i linia 7 działają bez sieci.',
            priceModule_offNotice: 'Moduł wyłączony — ustawienia poniżej zaczną działać po jego włączeniu.',
            priceModule_fxOffline: 'wbudowane (bez sieci)',
            lineSettings_valueSumHint: 'Przezroczystość działa na całą linię. Kolor dotyczy tylko liczby sztuk — plus zostaje zielony, minus czerwony, bo to po nich rozpoznaje się znak.',
            valueLog_section: 'Dziennik wartości',
            valueLog_enabled: 'Zapisuj wartość zrobionych przedmiotów',
            valueLog_hint: 'Liczone są tylko przedmioty, które przeszły pełną ścieżkę (licznik dodał +1).',
            valueLog_reset: 'Wyczyść dziennik wartości',
            valueLog_resetConfirm: 'Wyczyścić dziennik wartości tej zmiany? Liczniki przedmiotów zostaną.',
            valueLog_export: 'Wypisz dziennik do konsoli',
            valueLog_stats: '${count} szt., Σ ${sum} ${currency}, bez ceny: ${unpriced}',
            shift_day: 'DZIENNA', shift_night: 'NOCNA', lunch_day1: 'Przerwa dzienna 1 (11:20-11:50)', lunch_day2: 'Przerwa dzienna 2 (11:50-12:20)', lunch_day3: 'Przerwa dzienna 3 (12:20-12:50)', lunch_day4: 'Przerwa dzienna 4 (12:50-13:20)',
            lunch_night1: 'Przerwa nocna 1 (23:20-23:50)', lunch_night2: 'Przerwa nocna 2 (23:50-00:20)', lunch_night3: 'Przerwa nocna 3 (00:20-00:50)', lunch_night4: 'Przerwa nocna 4 (00:50-01:20)',
            settingsPanelTitle: 'Ustawienia ${scriptName}', settings_applyAndCloseButton: 'Zastosuj i Zamknij', settings_applyButton: 'Zastosuj',
            settings_resetAllDataButton: 'Zresetuj Wszystkie Dane', settings_resetWindowPositionButton: 'Zresetuj Pozycję Okna',
            settings_resetConfirm: 'Usunąć wszystkie dane StatsHelper (ustawienia i liczniki)? Dane samej aplikacji TREX nie zostaną naruszone.',
            settings_resetCountersButton: 'Zresetuj Tylko Liczniki', settings_resetCountersConfirm: 'Wyzerować liczniki przedmiotów? Ustawienia wyglądu zostaną zachowane.',
            newShiftDetected: 'Wykryto nową zmianę — liczniki przedmiotów zostały wyzerowane.',
            resetNotice_stale: 'Dane z poprzedniej zmiany — liczniki przedmiotów wyzerowane.',
            resetNotice_manual: 'Liczniki przedmiotów zostały wyzerowane.',
            settings_manualCounterInputLabel: 'Ustaw licznik', section_general: 'Ogólne', section_currentTab: 'Ustawienia Bieżącej Karty (${tabInstanceId})',
            section_visualAids: 'Pomoce Wizualne (dla ${tabName})', section_statsWindow: 'Stylizacja Okna Statystyk', section_globalStats: 'Statystyki Globalne',
            section_keyboardShortcuts: 'Skróty Klawiszowe', section_autoIncrement: 'Auto-Inkrementacja', section_lunchSelection: 'Wybór Przerwy', section_otherCustomTabs: 'Inne Skonfigurowane Karty',
            language: 'Język', customTabDisplayName: 'Nazwa Wyświetlana', customTabIncludeInGlobal: 'Wlicz do sumy globalnej', overlayOpacity: 'Przezroczystość Nakładki: ${value}%',
            showPageIndicator: 'Pokaż Wskaźnik Tekstowy', windowBgSettings: 'Tło Okna', lineSettings_currentTab: 'Linia 1: Statystyki Bieżącej Karty',
            lineSettings_globalSummary: 'Linia 2: Podsumowanie Globalne', lineSettings_shiftInfo: 'Linia 3: Informacje o Zmianie', lineSettings_lunchInfo: 'Linia 4: Informacje o Przerwie', lineSettings_realTimeClock: 'Linia 5: Zegar Czasu Rzeczywistego',
            fontFamily: 'Czcionka', fontSize: 'Rozmiar Czcionki: ${value}px', dragStatsWindowButton: 'Uaktywnij Przeciąganie', dragStatsWindowActiveButton: 'Okno Przeciągalne (Kliknij by Przypiąć)',
            includeInGlobal_known: 'Wlicz ${tabName}', incrementKey: 'Inkrementacja (+1)', decrementKey: 'Dekrementacja (-1)', scanIntervalAutoIncrement: 'Skanowanie: ${value}ms',
            noCustomTabsConfigured: 'Brak innych kart.', customTabEntryFormat: '${displayName} (${instanceId_short}) - Włączona: ${isIncludedStr}',
            fontFamily_default: 'Domyślna', fontFamily_monospace: 'Monospace', fontFamily_sans_serif_thin: 'Cienka Sans-Serif',
            key_None: 'Wyłączony', key_ShiftRight: 'Prawy Shift', key_ControlRight: 'Prawy Ctrl', key_AltRight: 'Prawy Alt', key_ScrollLock: 'Scroll Lock', key_PauseBreak: 'Pause/Break', key_Insert: 'Insert',
            key_Numpad0: 'Num 0', key_NumpadMultiply: 'Num *', key_NumpadSubtract: 'Num -', key_NumpadAdd: 'Num +', key_F10: 'F10',
            initialNotification_currentTab: 'Bieżąca Karta:', initialNotification_shiftStart: 'Początek Zmiany:',
            priceCard_cspImg: 'CSP strony blokuje wykres Keepa',
            priceCard_cspNet: 'CSP strony blokuje zapytania o cenę',
            priceCard_cspBoth: 'CSP strony blokuje oba źródła',
            priceCard_marketplace: 'Sklep Amazon',
            priceCard_fallback: 'Szukaj w innych sklepach, gdy nie ma ceny',
            priceCard_fallbackHint: 'Tylko dla jednego przedmiotu, losowo, co 1 s. Domyślny sklep nie zmienia się.',
            priceCard_searchingOther: 'szukam w innych sklepach…',
            priceCard_foundIn: 'znaleziono na ${host}',
            priceCard_marketNoKeepa: 'Keepa nie ma wykresu dla tego sklepu — link działa, ceny nie będzie',
            priceCard_openHint: 'Kliknij ASIN, aby otworzyć stronę produktu',
            priceCard_hiddenHint: 'Karta ukryta — cena nadal jest odczytywana i wliczana do sumy',
            priceCard_showCard: 'Pokazuj kartę na ekranie',
            priceCard_refreshing: 'odświeżanie…',
            priceCard_source: 'Źródło ceny',
            priceCard_src_ocr: 'Cena tekstem (odczyt z wykresu)',
            priceCard_src_graph: 'Obrazek wykresu Keepa',
            priceCard_src_jina: 'Zapytanie tekstowe (r.jina.ai)',
            priceCard_ocrFail: 'nie udało się odczytać ceny z wykresu',
            priceCard_cspOcr: 'CSP strony blokuje obrazek Keepa — nie da się odczytać ceny',
            priceCard_fromCache: 'z pamięci',
            priceCard_cacheAge: '${days}d temu',
            priceCard_graphMode: 'Obszar wykresu', priceCard_mode_legend: 'Tylko ceny (z wykresu)',
            priceCard_mode_right: 'Prawa część, rozmiar oryginalny', priceCard_mode_full: 'Cały wykres',
            priceCard_jinaOff: 'pobieranie tekstu wyłączone',
            priceCard_section: 'Karta ceny', priceCard_enabled: 'Pokaż kartę ceny',
            priceCard_showPrice: 'Pokaż aktualną cenę', priceCard_showRrp: 'Pokaż cenę katalogową (RRP)',
            priceCard_showGraph: 'Pokaż wykres Keepa',
            priceCard_width: 'Szerokość karty: ${value}px', priceCard_fontSize: 'Rozmiar ceny: ${value}px',
            priceCard_bg: 'Tło karty', priceCard_drag: 'Uaktywnij przeciąganie karty',
            priceCard_dragActive: 'Karta przeciągalna (kliknij by przypiąć)', priceCard_resetPosition: 'Zresetuj pozycję karty',
            priceCard_searching: 'szukam ceny...', priceCard_noPrice: 'brak ceny',
            priceCard_noAsin: 'nie znaleziono ASIN', priceCard_item: 'przedmiot', priceCard_rrp: 'katalogowa',
            priceCard_seeChart: 'cena na wykresie', priceCard_cached: 'z pamięci', priceCard_limit: 'limit sesji',
            multicolorMode: 'Wielokolorowe Działy', tabColors: 'Kolory Działów:'
        },
        ru: {
            scriptLoaded: '${scriptName} v${version} Загружен.', yes: 'Да', no: 'Нет', notApplicable: 'Н/Д',
            error_items_per_hour_unavailable: '~0.0/ч (мало времени)', fromUnit: 'от', inUnit: 'за',
            hoursShort: 'ч', minutesShort: 'м', secondsShort: 'с', statsPerHourUnit: '/ч', completedUnit: 'готово',
            tabName_CRET: 'CRET', tabName_REFURB: 'REFURB', tabName_WHD: 'WHD', tabName_UNKNOWN: 'НЕИЗВЕСТНО',
            statsLine1_current: '${tabName} ${itemsPerHour}${statsPerHourUnit} (${count} ${completedUnit} ${inUnit} ${workTimeFormatted})',
            statsLine2_global_separator: ' ', statsLine2_global_tab_format: '${tabName} ${itemsPerHour}${statsPerHourUnit}(${count})', statsLine2_global_total_format: '= ~${totalItemsPerHour}${statsPerHourUnit} (${totalCount})',
            statsLine3_shift: '${shiftType} смена (${shiftStartTime})', statsLine4_lunch: 'Перерыв #${lunchNumber} (${lunchStartTime} - ${lunchEndTime})', statsLine5_clock: '[ ${currentTime} ]',
            statsLine6_undet: '?${n}',
            statsLine6_items: '${n} шт',
            valueLog_fx: 'Курсы: ${src} (${brief})',
            valueLog_fxRefresh: 'Обновить курсы',
            valueLog_routeStats: 'продано ${sold}, непродано ${unsold}, не определено ${undet}',
            lineSettings_valueSum: 'Строка 6: Сумма стоимости',
            lineSettings_compact: 'Строка 7: Компактный счётчик',
            lineSettings_compactHint: 'Два числа: предметов в час (все вкладки) и сделано штук. Больше ничего.',
            priceModule_section: 'Модуль цен (сеть)',
            priceModule_enabled: 'Включить модуль цен',
            priceModule_hint: 'По умолчанию ВЫКЛЮЧЕН. Пока он выключен, скрипт не делает НИКАКИХ запросов в интернет: ни за курсами валют, ни за графиком Keepa, ни к r.jina.ai. Счётчик предметов, смена, перерывы и строка 7 работают без сети.',
            priceModule_offNotice: 'Модуль выключен — настройки ниже заработают после его включения.',
            priceModule_fxOffline: 'встроенные (без сети)',
            lineSettings_valueSumHint: 'Прозрачность действует на всю строку. Цвет — только на количество штук: плюс остаётся зелёным, минус красным, по ним и читается знак.',
            valueLog_section: 'Журнал стоимости',
            valueLog_enabled: 'Вести журнал стоимости сделанных предметов',
            valueLog_hint: 'Считаются только предметы, прошедшие полный путь (счётчик добавил +1).',
            valueLog_reset: 'Очистить журнал стоимости',
            valueLog_resetConfirm: 'Очистить журнал стоимости этой смены? Счётчики предметов останутся.',
            valueLog_export: 'Вывести журнал в консоль',
            valueLog_stats: '${count} шт., Σ ${sum} ${currency}, без цены: ${unpriced}',
            shift_day: 'ДНЕВНАЯ', shift_night: 'НОЧНАЯ', lunch_day1: 'Перерыв днем 1 (11:20-11:50)', lunch_day2: 'Перерыв днем 2 (11:50-12:20)', lunch_day3: 'Перерыв днем 3 (12:20-12:50)', lunch_day4: 'Перерыв днем 4 (12:50-13:20)',
            lunch_night1: 'Перерыв ночью 1 (23:20-23:50)', lunch_night2: 'Перерыв ночью 2 (23:50-00:20)', lunch_night3: 'Перерыв ночью 3 (00:20-00:50)', lunch_night4: 'Перерыв ночью 4 (00:50-01:20)',
            settingsPanelTitle: 'Настройки ${scriptName}', settings_applyAndCloseButton: 'Применить и Закрыть', settings_applyButton: 'Применить',
            settings_resetAllDataButton: 'Сбросить все данные', settings_resetWindowPositionButton: 'Сбросить позицию окна',
            settings_resetConfirm: 'Удалить все данные StatsHelper (настройки и счётчики)? Данные самого TREX не затрагиваются.',
            settings_resetCountersButton: 'Сбросить только счётчики', settings_resetCountersConfirm: 'Обнулить счётчики предметов? Настройки внешнего вида сохранятся.',
            newShiftDetected: 'Обнаружена новая смена — счётчики предметов обнулены.',
            resetNotice_stale: 'Данные прошлой смены — счётчики предметов обнулены.',
            resetNotice_manual: 'Счётчики предметов обнулены.',
            settings_manualCounterInputLabel: 'Счетчик', section_general: 'Общие', section_currentTab: 'Текущая вкладка (${tabInstanceId})',
            section_visualAids: 'Визуальные эффекты (для ${tabName})', section_statsWindow: 'Стилизация окна статистики', section_globalStats: 'Глобальная статистика',
            section_keyboardShortcuts: 'Горячие клавиши', section_autoIncrement: 'Авто-инкремент', section_lunchSelection: 'Выбор перерыва', section_otherCustomTabs: 'Другие пользовательские вкладки',
            language: 'Язык', customTabDisplayName: 'Отображаемое имя', customTabIncludeInGlobal: 'Включить в глобальную сумму', overlayOpacity: 'Непрозрачность наложения: ${value}%',
            showPageIndicator: 'Показать текстовый индикатор', windowBgSettings: 'Фон окна', lineSettings_currentTab: 'Линия 1: Статистика текущей вкладки',
            lineSettings_globalSummary: 'Линия 2: Глобальная сводка', lineSettings_shiftInfo: 'Линия 3: Информация о смене', lineSettings_lunchInfo: 'Линия 4: Информация о перерыве', lineSettings_realTimeClock: 'Линия 5: Часы',
            fontFamily: 'Шрифт', fontSize: 'Размер шрифта: ${value}px', dragStatsWindowButton: 'Включить перетаскивание', dragStatsWindowActiveButton: 'Окно перемещается (Кликните для фиксации)',
            includeInGlobal_known: 'Включить ${tabName}', incrementKey: 'Кнопка инкремента (+1)', decrementKey: 'Кнопка декремента (-1)', scanIntervalAutoIncrement: 'Интервал сканирования: ${value}мс',
            noCustomTabsConfigured: 'Других вкладок не настроено.', customTabEntryFormat: '${displayName} (${instanceId_short}) - Включено: ${isIncludedStr}',
            fontFamily_default: 'По умолчанию', fontFamily_monospace: 'Моноширинный', fontFamily_sans_serif_thin: 'Тонкий без засечек',
            key_None: 'Отключено', key_ShiftRight: 'Правый Shift', key_ControlRight: 'Правый Ctrl', key_AltRight: 'Правый Alt', key_ScrollLock: 'Scroll Lock', key_PauseBreak: 'Pause/Break', key_Insert: 'Insert',
            key_Numpad0: 'Num 0', key_NumpadMultiply: 'Num *', key_NumpadSubtract: 'Num -', key_NumpadAdd: 'Num +', key_F10: 'F10',
            initialNotification_currentTab: 'Текущая вкладка:', initialNotification_shiftStart: 'Начало смены:',
            priceCard_cspImg: 'CSP страницы блокирует график Keepa',
            priceCard_cspNet: 'CSP страницы блокирует запрос цены',
            priceCard_cspBoth: 'CSP страницы блокирует оба источника',
            priceCard_marketplace: 'Магазин Amazon',
            priceCard_fallback: 'Искать в других магазинах, если цены нет',
            priceCard_fallbackHint: 'Только для одного предмета, в случайном порядке, раз в секунду. Магазин по умолчанию не меняется.',
            priceCard_searchingOther: 'ищу в других магазинах…',
            priceCard_foundIn: 'найдено на ${host}',
            priceCard_marketNoKeepa: 'У Keepa нет графика для этого магазина — ссылка работает, цены не будет',
            priceCard_openHint: 'Клик по ASIN открывает страницу товара',
            priceCard_hiddenHint: 'Карточка скрыта — цена всё равно читается и идёт в сумму',
            priceCard_showCard: 'Показывать карточку на экране',
            priceCard_refreshing: 'обновляется…',
            priceCard_source: 'Источник цены',
            priceCard_src_ocr: 'Цена текстом (распознана с графика)',
            priceCard_src_graph: 'Картинка графика Keepa',
            priceCard_src_jina: 'Текстовый запрос (r.jina.ai)',
            priceCard_ocrFail: 'не удалось прочитать цену с графика',
            priceCard_cspOcr: 'CSP страницы блокирует картинку Keepa — цену не прочитать',
            priceCard_fromCache: 'из кэша',
            priceCard_cacheAge: '${days} сут. назад',
            priceCard_graphMode: 'Область графика', priceCard_mode_legend: 'Только цены (с графика)',
            priceCard_mode_right: 'Правая часть, натуральный размер', priceCard_mode_full: 'Весь график',
            priceCard_jinaOff: 'текстовый запрос выключен',
            priceCard_section: 'Карточка цены', priceCard_enabled: 'Показывать карточку цены',
            priceCard_showPrice: 'Показывать текущую цену', priceCard_showRrp: 'Показывать RRP',
            priceCard_showGraph: 'Показывать график Keepa',
            priceCard_width: 'Ширина карточки: ${value}px', priceCard_fontSize: 'Размер цены: ${value}px',
            priceCard_bg: 'Фон карточки', priceCard_drag: 'Включить перетаскивание карточки',
            priceCard_dragActive: 'Карточка перемещается (клик чтобы зафиксировать)', priceCard_resetPosition: 'Сбросить позицию карточки',
            priceCard_searching: 'ищу цену...', priceCard_noPrice: 'цены нет',
            priceCard_noAsin: 'ASIN не найден', priceCard_item: 'предмет', priceCard_rrp: 'RRP',
            priceCard_seeChart: 'цена на графике', priceCard_cached: 'из кэша', priceCard_limit: 'лимит сессии',
            multicolorMode: 'Разноцветные отделы', tabColors: 'Цвета отделов:'
        }
    };

    // ─── src/03-utils.js ───
    // ==========================================
    // 3. NARZĘDZIA I GENERATOR DOM
    // ==========================================
    const Utils = {
        /**
         * TRZY POZIOMY WYPISYWANIA (9.2.0) — i to nie jest ozdoba.
         *
         *   log()   — dziennik pracy. Idzie kilka linii NA KAŻDY przedmiot,
         *             więc przez zmianę to tysiące wpisów. Domyślnie wyłączony.
         *   error() — sytuacje nienormalne, ale takie, po których skrypt działa
         *             dalej (kursy nie przyszły, dziennik przepełniony, CSP
         *             tnie źródło). Też podlega wyłącznikowi: to informacja dla
         *             kogoś, kto akurat patrzy w konsolę, a nie dla nikogo.
         *   fatal() — skrypt NIE WSTAŁ albo się rozsypał. Wypisuje się ZAWSZE,
         *             bo cicha awaria startu wygląda jak „nic się nie stało”.
         *
         * Sprawdzenie idzie przez CONFIG.DEBUG_MODE, a nie przez stałą z góry
         * pliku, bo SH.logsOn() musi działać w locie — inaczej trzeba by
         * przewklejać skrypt w środku zmiany i zerować liczniki.
         */
        log(...args) { if (CONFIG.DEBUG_MODE) console.log(`[${CONFIG.SCRIPT_NAME} v${CONFIG.SCRIPT_VERSION}]`, ...args); },
        error(...args) { if (CONFIG.DEBUG_MODE) console.error(`[${CONFIG.SCRIPT_NAME} ERROR]`, ...args); },
        fatal(...args) { console.error(`[${CONFIG.SCRIPT_NAME} FATAL]`, ...args); },
        generateId(prefix = '') { return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`; },
        isObject(item) { return (item && typeof item === 'object' && !Array.isArray(item)); },
        /**
         * Scalanie z GŁĘBOKIM kopiowaniem zagnieżdżonych obiektów.
         *
         * 8.3.0 — kluczowa poprawka. Wcześniej gałąź „klucza nie ma w target”
         * robiła `Object.assign(output, { [key]: source[key] })`, czyli kładła
         * do stanu REFERENCJĘ do obiektu źródła. Przy `deepMerge({}, DEFAULT_LOCAL_CONFIG)`
         * target jest pusty, więc WSZYSTKIE zagnieżdżone bloki — linesConfig,
         * statsWindowPosition, priceCard — były jednym i tym samym obiektem
         * naraz w trzech miejscach.
         *
         * Skutek łapany ręcznie: przeciągnięto kartę ceny — nowa pozycja
         * zapisała się do wspólnego obiektu, czyli do SAMEGO DEFAULT_LOCAL_CONFIG,
         * — a przycisk „Zresetuj pozycję karty”, który robi
         * `{ ...DEFAULT_LOCAL_CONFIG.priceCard.position }`, posłusznie
         * przywracał już zepsutą wartość. Przycisk nie działał.
         *
         * Łapało się to tylko przy PIERWSZYM uruchomieniu na czystej
         * przeglądarce: za drugim razem loadAll() znajdował zapisaną
         * konfigurację, klucz był już w target, szła druga gałąź — i alias
         * rwał się sam.
         *
         * BEZPIECZEŃSTWO (9.2.0): klucze `__proto__`, `constructor`
         * i `prototype` są tu jawnie pomijane. Do scalania trafia JSON
         * z localStorage, a localStorage tej domeny dzielimy z samą aplikacją
         * TREX — spreparowana wartość mogłaby inaczej dopisać pole do
         * Object.prototype i zatruć każdy obiekt na stronie.
         */
        UNSAFE_KEYS: ['__proto__', 'constructor', 'prototype'],
        deepMerge(target, source) {
            const output = Utils.isObject(target) ? { ...target } : {};
            if (Utils.isObject(source)) {
                Object.keys(source).forEach(key => {
                    if (Utils.UNSAFE_KEYS.includes(key)) return;
                    if (Utils.isObject(source[key])) {
                        // Kopiujemy ZAWSZE — także wtedy, gdy klucza w target jeszcze nie ma.
                        output[key] = Utils.deepMerge(output[key], source[key]);
                    } else { output[key] = source[key]; }
                });
            }
            return output;
        },
        /** Głęboka kopia bloku ustawień. */
        clone(value) { return Utils.isObject(value) ? Utils.deepMerge({}, value) : value; },
        debounce(func, delay) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), delay);
            };
        },
        /**
         * Kolor HEX na trójkę „R, G, B” gotową do wstawienia w rgba().
         *
         * Regexp jest KOTWICZONY z obu stron celowo i to jest zabezpieczenie,
         * a nie kosmetyka: wynik trafia prosto do łańcucha CSS budowanego
         * w CSSManager. Gdyby wzorzec dopuszczał cokolwiek poza sześcioma
         * cyframi szesnastkowymi, wartość z zapisanej konfiguracji mogłaby
         * zamknąć regułę i dopisać własne — czyli wstrzyknąć CSS. Przy
         * niedopasowaniu wracamy do neutralnej szarości.
         */
        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '128, 128, 128';
        },
        formatTime(dateObject, showSeconds = true, separator = '') {
            if (!(dateObject instanceof Date) || isNaN(dateObject.getTime())) return showSeconds ? `00${separator}00${separator}00` : `00${separator}00`;
            const h = String(dateObject.getHours()).padStart(2, '0');
            const m = String(dateObject.getMinutes()).padStart(2, '0');
            if (!showSeconds) return `${h}${separator}${m}`;
            const s = String(dateObject.getSeconds()).padStart(2, '0');
            return `${h}${separator}${m}${separator}${s}`;
        },
        timeStringToDate(timeStr, baseDate = new Date(), crossesMidnight = false) {
            const h = parseInt(timeStr.substring(0, 2), 10);
            const m = parseInt(timeStr.substring(2, 4), 10);
            const d = new Date(baseDate);
            d.setHours(h, m, 0, 0);
            if (crossesMidnight) d.setDate(d.getDate() + 1);
            return d;
        },
        formatDuration(ms) {
            if (isNaN(ms) || ms <= 0) return I18n.get('notApplicable');
            let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); const h = Math.floor(m / 60);
            s %= 60; m %= 60;
            const hS = I18n.get('hoursShort'), mS = I18n.get('minutesShort'), sS = I18n.get('secondsShort');
            if (h > 0) return `${h}${hS} ${String(m).padStart(2, '0')}${mS}`;
            else if (m > 0) return `${m}${mS} ${String(s).padStart(2, '0')}${sS}`;
            return `${s}${sS}`;
        },
        /**
         * Liczba z konfiguracji sprowadzona do bezpiecznego zakresu (9.2.0).
         *
         * Konfiguracja przychodzi z localStorage, czyli z miejsca, którego nie
         * kontrolujemy w całości. Rozmiar czcionki albo alfa wzięte stamtąd
         * wprost lądują w łańcuchu CSS; NaN albo `10px; position:fixed`
         * rozjechałyby regułę. Dlatego każda liczba idąca do stylu przechodzi
         * tędy.
         */
        clampNum(value, min, max, fallback) {
            const n = Number(value);
            if (!isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, n));
        }
    };

    /**
     * Generator DOM w stylu hyperscript.
     *
     * Znaczników NIE składa się z łańcuchów: atrybuty i właściwości ustawia się
     * przez przypisanie, tekst — wyłącznie przez document.createTextNode. Tekst
     * z zewnątrz nigdy więc nie trafia do parsera HTML, czyli XSS jest wykluczony
     * konstrukcyjnie. To jest główna gwarancja bezpieczeństwa całego interfejsu
     * i dlatego w całym pliku nie ma ani jednego przypisania do innerHTML poza
     * czyszczeniem (`= ''`).
     */
    function h(tag, props = {}, ...children) {
        const el = document.createElement(tag);
        for (const[k, v] of Object.entries(props)) {
            if (k.startsWith('on') && typeof v === 'function') {
                el.addEventListener(k.substring(2).toLowerCase(), v);
            } else if (k === 'style' && typeof v === 'object') {
                Object.assign(el.style, v);
            } else if (k === 'dataset' && typeof v === 'object') {
                for (const[dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
            } else if (k === 'className') {
                el.className = v;
            } else if (k === 'id') {
                el.id = v.startsWith(CONFIG.SCRIPT_ID_PREFIX) ? v : CONFIG.SCRIPT_ID_PREFIX + v;
            } else {
                el[k] = v;
            }
        }
        const append = (child) => {
            if (Array.isArray(child)) child.forEach(append);
            else if (child instanceof Node) el.appendChild(child);
            else if (child !== null && child !== undefined) el.appendChild(document.createTextNode(String(child)));
        };
        children.forEach(append);
        return el;
    }

    // ─── src/04-core-state.js ───
    // ==========================================
    // 4. ARCHITEKTURA: EventBus i stan reaktywny
    // ==========================================
    class EventBus {
        constructor() { this.listeners = {}; }
        on(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
            return () => this.off(event, callback);
        }
        off(event, callback) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
        emit(event, payload) {
            if (!this.listeners[event]) return;
            // Kopia listy: obsługa ma prawo wypisać się w trakcie rozsyłki.
            this.listeners[event].slice().forEach(cb => {
                try { cb(payload); } catch (e) { Utils.error(`Event handler error for ${event}`, e); }
            });
        }
        /** Zdejmuje wszystkie subskrypcje. Potrzebne przy awaryjnym rozbiórce (Main.teardown). */
        clear() { this.listeners = {}; }
    }

    const bus = new EventBus();

    /**
     * Subskrypcja zmian stanu PO GAŁĘZIACH (8.3.0).
     *
     * W 8.2.0 na gołym `store:changed` wisiało pięć procedur: przebudowa CSS,
     * render okna statystyk, nakładka, przerysowanie karty ceny i autozapis.
     * Żadna nie patrzyła na ścieżkę, więc każdy drobiazg ciągnął za sobą
     * wszystko naraz. Najbardziej biło to po uiFlags: AutoTrigger.scan() rusza
     * itemInProgress i autoTriggerFound na każdym przedmiocie, a każda taka
     * flaga wywoływała pełną przebudowę łańcucha CSS z podmianą textContent
     * w <style> — czyli unieważnienie stylów całego dokumentu — plus pełny
     * re-render statystyk i karty ceny.
     */
    function onStorePaths(prefixes, handler) {
        return bus.on('store:changed', ({ path }) => {
            const p = String(path);
            if (prefixes.some(pref => p === pref || p.startsWith(pref + '.'))) handler();
        });
    }

    function createReactive(target, path = "") {
        if (Utils.isObject(target)) {
            for (const key of Object.keys(target)) {
                if (Utils.isObject(target[key])) {
                    target[key] = createReactive(target[key], path ? `${path}.${key}` : key);
                }
            }
        }

        return new Proxy(target, {
            get(obj, prop) {
                return obj[prop];
            },
            set(obj, prop, value) {
                const fullPath = path ? `${path}.${prop}` : prop;
                const oldValue = obj[prop];

                if (oldValue !== value) {
                    if (Utils.isObject(value)) {
                        obj[prop] = createReactive(value, fullPath);
                    } else {
                        obj[prop] = value;
                    }

                    bus.emit(`store:changed`, { path: fullPath, value: obj[prop], oldValue });
                    bus.emit(`store:changed:${fullPath}`, { value: obj[prop], oldValue });
                }
                return true;
            },
            // 8.1.0: usunięcie klucza też jest reaktywne. Potrzebne do zbierania
            // śmieci po kartach (SessionReset.pruneTabInstances) — wcześniej
            // delete przechodził obok magistrali i UI się nie przerysowywał.
            deleteProperty(obj, prop) {
                if (!(prop in obj)) return true;
                const fullPath = path ? `${path}.${prop}` : prop;
                const oldValue = obj[prop];
                delete obj[prop];
                bus.emit(`store:changed`, { path: fullPath, value: undefined, oldValue });
                bus.emit(`store:changed:${fullPath}`, { value: undefined, oldValue });
                return true;
            }
        });
    }

    // Definicja podstawowej struktury stanu
    const baseState = {
        initialized: false,
        currentTabType: CONFIG.UNKNOWN_TAB_TYPE_KEY,
        currentTabInstanceId: null,
        tabCounters: {},
        userConfig: {
            language: CONFIG.DEFAULT_LANGUAGE,
            // Sklep Amazon: link z ASIN, rynek wykresu Keepa i waluta dziennika.
            marketplace: CONFIG.DEFAULT_MARKETPLACE,
            globalStatsContributionKnown: Object.keys(CONFIG.KNOWN_TAB_TYPES).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
            keyboardShortcuts: { INCREMENT: 'None', DECREMENT: 'None' },
            triggerMutationDebounceMs: CONFIG.DEFAULT_TRIGGER_MUTATION_DEBOUNCE_MS,
            settingsPanelWidth: CONFIG.SETTINGS_PANEL_INITIAL_WIDTH_PX,
            customTabSettings: {},
            // 8.3.0: usunięte pole defaultLocalTabConfig — nikt go nigdy nie
            // czytał, a w całości dublowało się w localStorage przy każdym
            // zapisie.
        },
        localTabConfig: Utils.deepMerge({}, DEFAULT_LOCAL_CONFIG),
        sessionConfig: {
            // 8.3.0: usunięte sessionLastActivityTimestamp — zadeklarowane
            // w 8.0.0, nigdzie nieczytane i niezapisywane.
            shiftType: null, shiftCalculatedStartTime: null, selectedLunchIndex: null, activeTabInstances: {},
        },
        // itemInProgress zadeklarowany jawnie (w 8.0.0 powstawał w locie z AutoTrigger.scan)
        uiFlags: { isSettingsPanelVisible: false, isStatsWindowDragging: false, isPriceCardDragging: false,
                   autoTriggerFound: false, itemInProgress: false }
    };

    const store = createReactive(baseState);

    /**
     * CZY MODUŁ CEN JEST WŁĄCZONY (9.2.0).
     *
     * Jedno miejsce prawdy dla wszystkich bezpieczników sieciowych. Świadomie
     * porównanie do `true`, a nie zwykła prawdziwość: wartość przychodzi
     * z localStorage, a wszystko, co nie jest jawnym `true` (brak pola, `null`,
     * łańcuch, liczba), ma znaczyć WYŁĄCZONE.
     */
    function priceModuleOn() {
        return store.localTabConfig
            && store.localTabConfig.priceCard
            && store.localTabConfig.priceCard.moduleEnabled === true;
    }

    // ─── src/05-i18n-runtime.js ───
    // ==========================================
    // 5. MENEDŻERY
    // ==========================================

    const I18n = {
        get(key, replacements = {}) {
            const lang = store.userConfig.language || CONFIG.DEFAULT_LANGUAGE;
            const pack = LANG_STRINGS[lang] || LANG_STRINGS[CONFIG.DEFAULT_LANGUAGE];
            let str = pack[key] !== undefined ? pack[key] : LANG_STRINGS[CONFIG.DEFAULT_LANGUAGE][key];
            if (!str) return `[${key}]`;
            // 8.3.0: podstawianie przez split/join, a nie przez String.replace.
            // Łańcuch ZASTĘPUJĄCY w replace traktuje $& $` $' $1 jako sekwencje
            // specjalne, więc nazwa karty typu "Tab ($&)" psuła wynik. To także
            // kwestia bezpieczeństwa: nazwę karty wpisuje człowiek, a więc jest
            // to dane wejściowe, nad którym parser nie powinien mieć władzy.
            const put = (text, name, value) => text.split('${' + name + '}').join(String(value));
            for (const r in replacements) str = put(str, r, replacements[r]);
            return put(put(str, 'version', CONFIG.SCRIPT_VERSION), 'scriptName', CONFIG.SCRIPT_NAME);
        },
        getTabName(idOrKey) {
            if (CONFIG.KNOWN_TAB_TYPES[idOrKey]) return I18n.get(CONFIG.KNOWN_TAB_TYPES[idOrKey].displayNameKey);
            if (store.userConfig.customTabSettings[idOrKey]) return store.userConfig.customTabSettings[idOrKey].displayName;
            if (idOrKey.startsWith(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX)) {
                return `${I18n.get(CONFIG.DEFAULT_UNKNOWN_TAB_DETAILS.displayNameKey)} (${idOrKey.substring(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX.length, CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX.length + 5)})`;
            }
            return idOrKey;
        }
    };

    // ─── src/06-storage.js ───
    const StorageManager = {
        // Pamięć ostatniej zapisanej wartości dla każdego klucza. Potrzebna, żeby
        // nie pisać do localStorage tego samego: zbędny zapis rodzi zdarzenie
        // 'storage' w sąsiednich kartach i zmusza je do przeliczania stanu.
        _lastWritten: {},
        // Do tego momentu autozapis milczy (patrz REMOTE_APPLY_SUPPRESS_MS).
        suppressSaveUntil: 0,

        getKey(key) { return `${CONFIG.SCRIPT_ID_PREFIX}${key}`; },

        /**
         * Zapis z odnotowaniem wartości — JEDYNE miejsce, z którego skrypt pisze
         * do localStorage poza dziennikiem wartości i kursami.
         *
         * ZAPIS MA PRAWO NIE DOJŚĆ i to nie jest sytuacja teoretyczna:
         * localStorage tej domeny dzielimy z samym TREX, więc kwota potrafi się
         * skończyć nie z naszej winy. Do tego część konfiguracji przeglądarki
         * (zablokowany magazyn dla witryny) sprawia, że setItem rzuca wyjątek
         * przy każdym wywołaniu.
         *
         * Wcześniej wyjątek szedł stąd w górę nieprzechwycony. Skutek był
         * nieproporcjonalny do przyczyny: saveState() woła się w Main.init(),
         * więc przy pełnym magazynie catch w init() rozbierał całość i skrypt
         * NIE WSTAWAŁ WCALE. Licznik, który doskonale policzyłby zmianę
         * w pamięci, nie pokazywał się na ekranie.
         *
         * Teraz nieudany zapis jest zdarzeniem zwykłym: wraca `false`, skrypt
         * pracuje dalej na stanie w pamięci, a człowiek traci tylko przeniesienie
         * liczników przez F5 — czyli dokładnie tyle, ile naprawdę zepsuł pełny
         * magazyn.
         *
         * Notatka `_lastWritten` stawia się DOPIERO PO UDANYM zapisie i to jest
         * druga połowa tej poprawki. Gdy stała przed nim, po nieudanym zapisie
         * pamięć twierdziła, że wartość leży w magazynie, i deduplikacja
         * odrzucała następną, już możliwą próbę zapisania tego samego.
         *
         * @returns {boolean} czy wartość naprawdę trafiła do magazynu.
         */
        write(key, value) {
            if (this._lastWritten[key] === value) return false;
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                delete this._lastWritten[key];
                Utils.error(`Zapis do magazynu nie powiódł się (${key}): ${e.name}. `
                          + 'Skrypt pracuje dalej, ale stan nie przeżyje przeładowania strony.');
                return false;
            }
            this._lastWritten[key] = value;
            return true;
        },
        saveState() {
            if (!store.initialized) return;
            this.write(this.getKey(CONFIG.STORAGE_KEY_USER_CONFIG), JSON.stringify(store.userConfig));
            this.write(this.getKey(CONFIG.STORAGE_KEY_SESSION_CONFIG), JSON.stringify(store.sessionConfig));

            const allLocalsKey = this.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS);
            let allLocals;
            try { allLocals = JSON.parse(localStorage.getItem(allLocalsKey) || "{}"); } catch (e) { allLocals = {}; }
            if (store.currentTabInstanceId) {
                allLocals[store.currentTabInstanceId] = store.localTabConfig;
            }
            // Sprzątamy śmieciowy klucz "null", który zapisywała 8.0.0 przez to,
            // że loadAll() szedł przed identifyTab().
            delete allLocals['null'];
            this.write(allLocalsKey, JSON.stringify(allLocals));
        },
        // Autozapis: każda zmiana stanu odkłada zapis o sekundę.
        // W 8.0.0 ustawienia zapisywały się dopiero przy zamykaniu panelu, a F5
        // w środku zmiany je gubiło.
        scheduleSave: Utils.debounce(function() {
            if (Date.now() < StorageManager.suppressSaveUntil) return;
            StorageManager.saveState();
        }, CONFIG.AUTOSAVE_DEBOUNCE_MS),

        saveCounter(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey), String(count));
        },
        removeCounter(tabKey) {
            const key = this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey);
            delete this._lastWritten[key];
            localStorage.removeItem(key);
        },
        /**
         * Wszystkie klucze localStorage należące do skryptu.
         *
         * 8.4.0: wchodzi tu także wspólny, nieversjonowany prefiks — archiwum
         * podsumowań. Zwykły reset zmiany go nie rusza (w tym cały sens:
         * archiwum żyje dziesiątki zmian), ale przycisk PEŁNEGO resetu musi
         * usuwać wszystko, co skrypt kiedykolwiek zapisał.
         *
         * Filtr po dwóch prefiksach jest też zabezpieczeniem: localStorage tej
         * domeny należy w większości do samego TREX i skrypt nie ma prawa
         * dotknąć ani jednego cudzego klucza.
         */
        ownKeys() {
            return Object.keys(localStorage).filter(k =>
                k.startsWith(CONFIG.SCRIPT_ID_PREFIX) || k.startsWith(CONFIG.SHARED_ID_PREFIX));
        },
        /**
         * Klucze wspólnego magazynu po możliwościach, których już nie ma.
         * 8.5.0: trafiła tu pamięć cen na pięć dób — została odwołana i nie ma
         * po co, żeby wisiała w localStorage.
         */
        purgeLegacySharedKeys() {
            (CONFIG.LEGACY_SHARED_KEYS || []).forEach(k => {
                const full = CONFIG.SHARED_ID_PREFIX + k;
                if (localStorage.getItem(full) !== null) {
                    localStorage.removeItem(full);
                    Utils.log(`Usunięto klucz odwołanej funkcji: ${full}`);
                }
            });
        },
        /** Czyści klucze poprzednich wersji (ważne na maszynach bez resetu sesji). */
        purgeLegacyKeys() {
            const stale = Object.keys(localStorage).filter(k =>
                CONFIG.LEGACY_ID_PREFIXES.some(p => k.startsWith(p)));
            stale.forEach(k => localStorage.removeItem(k));
            if (stale.length) Utils.log(`Usunięto kluczy poprzednich wersji: ${stale.length}`);
        },
        /**
         * @param {boolean} fromRemote - true, jeśli wczytanie wywołało zdarzenie
         *   'storage' z innej karty. Wtedy na chwilę wyciszamy autozapis, inaczej
         *   karty zaczynają w nieskończoność przepisywać sobie stan nawzajem.
         */
        loadAll(fromRemote = false) {
            try {
                const uc = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_USER_CONFIG)) || "null");
                if (uc) Object.assign(store.userConfig, Utils.deepMerge(store.userConfig, uc));

                const sc = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_SESSION_CONFIG)) || "null");
                if (sc) Object.assign(store.sessionConfig, Utils.deepMerge(store.sessionConfig, sc));

                const allLocals = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS)) || "{}");
                if (store.currentTabInstanceId && allLocals[store.currentTabInstanceId]) {
                    Object.assign(store.localTabConfig, Utils.deepMerge(store.localTabConfig, allLocals[store.currentTabInstanceId]));
                }

                const prefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER);
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        const tabKey = key.substring(prefix.length);
                        store.tabCounters[tabKey] = parseInt(localStorage.getItem(key), 10) || 0;
                    }
                }
            } catch (e) { Utils.error("Storage load failed", e); }

            if (fromRemote) this.suppressSaveUntil = Date.now() + CONFIG.REMOTE_APPLY_SUPPRESS_MS;
        },
        listen() {
            // 8.3.0: referencja do obsługi jest zapamiętana — potrzebna w Main.teardown().
            this.onStorage = (e) => {
                if (!e.key || !e.key.startsWith(CONFIG.SCRIPT_ID_PREFIX)) return;
                // 9.1.0: wartość klucza zmienił KTOŚ INNY, więc nasza notatka
                // „ostatnie zapisane” nie opisuje już magazynu. Bez tego
                // deduplikacja mogłaby pominąć nasz następny zapis tej samej
                // wartości i zostawić w kluczu cudzą.
                delete this._lastWritten[e.key];
                const localKey = e.key.substring(CONFIG.SCRIPT_ID_PREFIX.length);
                if (localKey === CONFIG.STORAGE_KEY_VALUE_LOG) {
                    // Dziennik wartości jest wspólny na wszystkie karty: sąsiadka
                    // dopisała przedmiot albo postawiła znak — scalamy, nie zamazujemy.
                    ValueLog.adoptRemote();
                    return;
                }
                if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_COUNTER)) {
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_COUNTER.length);
                    // e.newValue === null znaczy, że klucz został usunięty — to
                    // reset liczników przez sąsiednią kartę przy zmianie zmiany.
                    const val = parseInt(e.newValue, 10) || 0;
                    if (store.tabCounters[tabKey] !== val) store.tabCounters[tabKey] = val;
                } else if (!store.uiFlags.isSettingsPanelVisible) {
                    this.debouncedLoad();
                }
            };
            window.addEventListener('storage', this.onStorage);
        },
        debouncedLoad: Utils.debounce(function() { StorageManager.loadAll(true); }, 300)
    };

    // ─── src/07-session-shift.js ───
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

            const prefix = StorageManager.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER);
            Object.keys(localStorage)
                .filter(k => k.startsWith(prefix))
                .forEach(k => {
                    delete StorageManager._lastWritten[k];
                    localStorage.removeItem(k);
                });

            Object.keys(store.tabCounters).forEach(k => { store.tabCounters[k] = 0; });

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

    // ─── src/08-drag.js ───
    /**
     * Fabryka przeciągania.
     *
     * W 8.1.0 był to jeden na sztywno zapisany obiekt dla okna statystyk.
     * W 8.2.0 pojawił się drugi przeciągalny panel — karta ceny — więc logika
     * została wyniesiona do fabryki zamiast kopiowania.
     *
     * Oba panele w normalnym stanie są przezroczyste dla myszy
     * (pointer-events:none), dlatego przeciąganie włącza się flagą z ustawień:
     * dopiero wtedy element zaczyna przyjmować zdarzenia.
     */
    function createDragger({ elementId, getFlag, setFlag, savePosition }) {
        return {
            init() {
                this.el = document.getElementById(CONFIG.SCRIPT_ID_PREFIX + elementId);
                this.isDragging = false;
                this.offsetX = 0;
                this.offsetY = 0;

                this.onMouseDown = this.onMouseDown.bind(this);
                this.onMouseMove = this.onMouseMove.bind(this);
                this.onMouseUp = this.onMouseUp.bind(this);

                if (this.el) this.el.addEventListener('mousedown', this.onMouseDown);
                else Utils.error(`Dragger: element ${elementId} nie znaleziony w DOM.`);
            },
            onMouseDown(e) {
                if (!getFlag() || e.button !== 0) return;
                this.isDragging = true;
                const rect = this.el.getBoundingClientRect();
                this.offsetX = e.clientX - rect.left;
                this.offsetY = e.clientY - rect.top;
                this.el.style.cursor = 'grabbing';
                this.el.style.transition = 'none';
                document.addEventListener('mousemove', this.onMouseMove);
                document.addEventListener('mouseup', this.onMouseUp);
            },
            onMouseMove(e) {
                if (!this.isDragging) return;
                e.preventDefault();

                let x = e.clientX - this.offsetX;
                let y = e.clientY - this.offsetY;
                x = Math.max(0, Math.min(x, window.innerWidth - this.el.offsetWidth));
                y = Math.max(0, Math.min(y, window.innerHeight - this.el.offsetHeight));

                this.el.style.left = `${x}px`;
                this.el.style.top = `${y}px`;
                this.el.style.bottom = 'auto';   // zdejmujemy przyklejenie do dołu
            },
            onMouseUp() {
                if (!this.isDragging) return;
                this.isDragging = false;
                document.removeEventListener('mousemove', this.onMouseMove);
                document.removeEventListener('mouseup', this.onMouseUp);
                this.el.style.transition = 'top 0.2s, left 0.2s, background-color 0.2s';
                // `bottom` idzie pusty celowo: skoro człowiek postawił okno ręcznie,
                // to liczy się `top`, a domyślne przyklejenie do dołu ma zniknąć.
                savePosition({ left: this.el.style.left, top: this.el.style.top, bottom: '' });
                setFlag(false);
                StorageManager.saveState();
            },
        };
    }

    const DragDropManager = createDragger({
        elementId: 'statsWindow',
        getFlag: () => store.uiFlags.isStatsWindowDragging,
        setFlag: (v) => { store.uiFlags.isStatsWindowDragging = v; },
        savePosition: (p) => { store.localTabConfig.statsWindowPosition = p; },
    });

    const PriceCardDrag = createDragger({
        elementId: 'priceCard',
        getFlag: () => store.uiFlags.isPriceCardDragging,
        setFlag: (v) => { store.uiFlags.isPriceCardDragging = v; },
        savePosition: (p) => { store.localTabConfig.priceCard.position = p; },
    });

    // ─── src/09-ui-css.js ───
    // ==========================================
    // 6. INTERFEJS I RENDERERY
    // ==========================================
    const CSSManager = {
        init() {
            this.styleEl = h('style', { id: 'reactiveStyles' });
            document.head.appendChild(this.styleEl);
            this.updateAll();
            // 8.3.0: tylko wygląd karty. Wcześniej przebudowa całego łańcucha CSS
            // (z podmianą textContent w <style>, czyli unieważnieniem stylów
            // całego dokumentu) szła przy KAŻDEJ zmianie stanu, łącznie
            // z uiFlags na każdym przetworzonym przedmiocie.
            onStorePaths(['localTabConfig'], () => this.updateAll());
        },
        updateAll() {
            const lc = store.localTabConfig;
            // 8.1.0: usunięta zmienna --sh-overlay-opacity — nikt jej nie czytał.
            // Parzysta do niej --sh-bg-overlay w VisualsRenderer była natomiast
            // czytana, ale nigdzie niedefiniowana; kolor nakładki i tak ustawia się
            // z JS.
            //
            // BEZPIECZEŃSTWO: każda liczba wchodząca do tego łańcucha przechodzi
            // przez Utils.clampNum, a każdy kolor przez Utils.hexToRgb. Oba
            // zwracają wyłącznie cyfry, więc wartość z localStorage nie może
            // zamknąć reguły i dopisać własnej.
            const bgAlpha = Utils.clampNum(lc.statsWindowBgAlpha, 0, 100, 0);
            let css = `:root {
                --sh-bg-color: rgba(${Utils.hexToRgb(lc.statsWindowBgColorHex)}, ${bgAlpha / 100});
                --sh-font: ${CONFIG.FONT_FAMILY_OPTIONS[lc.statsWindowFontFamily] || CONFIG.FONT_FAMILY_OPTIONS.default};
            `;

            Object.keys(lc.linesConfig).forEach(k => {
                // Nazwa zmiennej CSS powstaje z klucza konfiguracji, więc klucz
                // musi być nazwą, a nie dowolnym tekstem. Zapisana konfiguracja
                // mogłaby przynieść klucz ze spacją albo nawiasem klamrowym.
                if (!/^[A-Za-z0-9_]+$/.test(k)) return;
                const cfg = lc.linesConfig[k];
                const alpha = Utils.clampNum(cfg.alpha, 0, 100, 60);
                const size = Utils.clampNum(cfg.fontSize, 6, 96, 14);
                css += `
                --sh-${k}-color: rgba(${Utils.hexToRgb(cfg.colorHex)}, ${alpha / 100});
                --sh-${k}-size: ${size}px;
                --sh-${k}-display: ${cfg.visible ? 'block' : 'none'};
                `;
            });
            css += `}`;
            this.styleEl.textContent = css;
        }
    };

    // Kolejność linii w oknie. Jedno miejsce prawdy: po tej liście renderer
    // tworzy elementy, a CSSManager i panel ustawień chodzą po linesConfig.
    const LINE_KEYS = ['line1_currentTab', 'line2_globalSummary', 'line3_shiftInfo',
                       'line4_lunchInfo', 'line5_realTimeClock', 'line6_valueSum',
                       'line7_compact'];

    // ─── src/10-ui-window.js ───
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

        /**
         * Składanie linii 6 — bilansu zmiany.
         *
         * Wyniesione z renderContent() RAZEM z wywołaniem ValueLog.totals():
         * przy wyłączonej linii nie ma po co przechodzić po całym dzienniku
         * i przeliczać każdej pozycji po kursie, skoro wynik nie trafi na ekran.
         * Linia 6 jest jedynym odbiorcą totals(), więc nic innego tego przebiegu
         * nie potrzebuje.
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
        },

        /**
         * Czy linia jest w ogóle widoczna.
         *
         * Widocznością steruje wyłącznie CSS (zmienna `--sh-<klucz>-display`),
         * więc do tej poprawki render szedł bezwarunkowo: raz na sekundę składały
         * się linie, których nikt nie ogląda. Przy ustawieniach domyślnych
         * widoczna jest JEDNA linia z siedmiu, a każdy takt i tak tworzył komplet
         * węzłów i przechodził po całym dzienniku wartości.
         *
         * Brak wpisu w konfiguracji znaczy „pokaż”, a nie „ukryj”: nowa linia
         * dodana bez wartości domyślnej ma się pojawić, a nie zniknąć po cichu.
         *
         * Zmiana `visible` idzie przez onStorePaths(['localTabConfig']), czyli
         * przez tę samą subskrypcję, która wywołuje renderContent() — włączona
         * linia zapełnia się natychmiast, a nie dopiero przy następnym takcie.
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

            /**
             * Linia 2: podsumowanie globalne.
             *
             * Pętla po kartach chodzi ZAWSZE, bo `gTotal` potrzebuje go także
             * linia 7, a obie muszą pokazywać tę samą liczbę: dwa niezależne
             * przebiegi prędzej czy później by się rozjechały. Pod warunkiem
             * widoczności stoi natomiast SKŁADANIE WĘZŁÓW — to ono kosztuje,
             * a nie przejście po trzech kluczach.
             */
            const showLine2 = this.isLineVisible('line2_globalSummary');
            // Czyścimy ZAWSZE, także przy wyłączonej linii: inaczej po jej
            // schowaniu w węźle zostawałaby ostatnia treść — niewidoczna,
            // ale wciąż wisząca w DOM i myląca przy diagnostyce.
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
                    if (!showLine2) return;
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

            if (showLine2 && fragments.length > 0) {
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
            // Linia 6: przy wyłączonej nie ma po co przechodzić po całym
            // dzienniku i przeliczać pozycji po kursie — wynik i tak nie trafi
            // na ekran. Czyszczenie zostaje bezwarunkowe, z tego samego powodu
            // co w linii 2.
            if (this.isLineVisible('line6_valueSum')) this.renderValueSum();
            else this.lines.line6_valueSum.innerHTML = '';

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

    // ─── src/11-ui-builder.js ───
    const UIBuilder = {
        row(labelStr, ...controls) {
            return h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '10px', flexWrap: 'nowrap' } },
                labelStr ? h('label', { textContent: labelStr + ':', style: { minWidth: '150px', fontWeight: '500', marginRight: '10px' } }) : null,
                h('div', { style: { display: 'flex', alignItems: 'center', flexGrow: '1', gap: '8px' } }, ...controls)
            );
        },
        section(title) {
            return h('div', { className: 'sh-section', style: { marginBottom: '20px', borderBottom: `1px dashed ${CONFIG.SETTINGS_PANEL_TEXT_COLOR}33`, paddingBottom: '15px' } },
                h('h3', { textContent: title, style: { margin: '0 0 12px 0', fontSize: '1.15em', color: CONFIG.SETTINGS_PANEL_ACCENT_COLOR } })
            );
        },
        hint(text) {
            return h('div', {
                textContent: text,
                style: { fontSize: '0.85em', color: '#666', margin: '-4px 0 10px 0', lineHeight: '1.35' },
            });
        },
        slider(min, max, value, onChange, labelFormatter) {
            const lbl = h('span', { textContent: labelFormatter(value), style: { minWidth: '70px', fontSize: '0.9em' } });
            const inp = h('input', {
                type: 'range', min, max, value, style: { flexGrow: '1' },
                // 8.1.0: Number() — input.value to łańcuch, i do konfiguracji szło
                // fontSize: "14" zamiast 14. Działało na rzutowaniu typów, ale
                // śmieciło w zapisanym JSON.
                onInput: (e) => { lbl.textContent = labelFormatter(e.target.value); onChange(Number(e.target.value)); }
            });
            return[inp, lbl];
        },
        colorPickerWithAlpha(hex, alpha, onColorChange, onAlphaChange) {
            const picker = h('input', {
                type: 'color', value: hex, style: { width: '40px', height: '24px', padding: '0', border: '1px solid #ccc', cursor: 'pointer' },
                onChange: (e) => onColorChange(e.target.value)
            });
            const [alphaSlider, alphaLabel] = this.slider(0, 100, alpha, onAlphaChange, v => `${v}%`);
            return h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', flexGrow: '1' } }, picker, alphaSlider, alphaLabel);
        },
        button(text, onClick, cssOverrides = {}) {
            return h('button', {
                textContent: text, onClick,
                style: { padding: '6px 12px', background: CONFIG.SETTINGS_PANEL_ACCENT_COLOR, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', ...cssOverrides }
            });
        },
        select(options, value, onChange) {
            const sel = h('select', { onChange: (e) => onChange(e.target.value), style: { padding: '4px', borderRadius: '4px', border: '1px solid #ccc' } });
            options.forEach(opt => sel.appendChild(h('option', { value: opt.value, textContent: opt.text, selected: String(opt.value) === String(value) })));
            return sel;
        },
        checkbox(label, checked, onChange) {
            const chk = h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked), style: { transform: 'scale(1.2)', marginRight: '8px', cursor: 'pointer' } });
            return h('label', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer', flexGrow: '1' } }, chk, h('span', { textContent: label }));
        },
        numberInput(val, onChange) {
            return h('input', { type: 'number', min: 0, value: val, onChange: (e) => onChange(parseInt(e.target.value, 10) || 0), style: { width: '80px', padding: '4px', textAlign: 'right' }});
        }
    };

    // ─── src/12-ui-settings.js ───
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

                // Dolna granica jest celowo niska: w trybie przycięcia wąska
                // karta nadal jest użyteczna — legenda Keepa nigdzie nie znika.
                secPrice.appendChild(UIBuilder.row('', ...UIBuilder.slider(
                    170, 900, pc.width,
                    v => store.localTabConfig.priceCard.width = v,
                    v => I18n.get('priceCard_width', { value: v }))));

                secPrice.appendChild(UIBuilder.row('', ...UIBuilder.slider(
                    14, 48, pc.fontSize,
                    v => store.localTabConfig.priceCard.fontSize = v,
                    v => I18n.get('priceCard_fontSize', { value: v }))));

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

    // ─── src/13-ui-visuals.js ───
    // Renderer przyciemnienia i wskaźnika
    const VisualsRenderer = {
        init() {
            // 8.1.0: id jest obowiązkowe — po nim AutoTrigger odróżnia własne
            // elementy skryptu od zmian strony (patrz AutoTrigger.isOwnNode).
            this.overlay = h('div', { id: 'pageOverlay', style: { position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: '1', pointerEvents: 'none', transition: 'background-color 0.4s', backgroundColor: 'transparent' } });
            this.indicator = h('div', { id: 'pageIndicator', style: { position: 'fixed', top: '50%', right: '100px', transform: 'translateY(-50%) rotate(90deg)', transformOrigin: 'bottom right', fontSize: '5vw', fontWeight: 'bold', zIndex: '2', pointerEvents: 'none', transition: 'opacity 0.4s', opacity: '0' } });
            document.body.appendChild(this.overlay);
            document.body.appendChild(this.indicator);
            onStorePaths(['localTabConfig', 'userConfig', 'currentTabType', 'currentTabInstanceId'],
                         () => this.update());
        },
        update() {
            const lc = store.localTabConfig;
            const cInfo = CONFIG.KNOWN_TAB_TYPES[store.currentTabType] || CONFIG.DEFAULT_UNKNOWN_TAB_DETAILS;

            if (lc.pageOverlayOpacity > 0) {
                this.overlay.style.backgroundColor = `rgba(${Utils.hexToRgb(cInfo.baseColorHex)}, ${Utils.clampNum(lc.pageOverlayOpacity, 0, 100, 0) / 100})`;
            } else {
                this.overlay.style.backgroundColor = 'transparent';
            }

            if (lc.pageIndicatorTextVisible) {
                this.indicator.textContent = I18n.getTabName(store.currentTabInstanceId).toUpperCase();
                this.indicator.style.color = `rgba(${Utils.hexToRgb(cInfo.baseColorHex)}, 0.2)`;
                this.indicator.style.opacity = '1';
            } else {
                this.indicator.style.opacity = '0';
            }
        }
    };

    /**
     * Krótkie wyskakujące powiadomienie. Potrzebne przede wszystkim przy
     * resecie liczników: człowiek musi widzieć, że zerowanie było zamierzone,
     * a nie że dane zgubiły się same. Reset może zdarzyć się przed pojawieniem
     * się UI (na etapie ładowania), dlatego ostatni komunikat pamiętany jest
     * w SessionReset.lastReset i pokazuje się zaraz po inicjalizacji interfejsu.
     */
    const Notifier = {
        init() {
            // id jest obowiązkowe: inaczej AutoTrigger uzna pojawienie się
            // powiadomienia za zmianę strony i uruchomi zbędny skan.
            this.el = h('div', {
                id: 'toast',
                style: {
                    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
                    padding: '10px 18px', borderRadius: '6px', zIndex: '2147483645',
                    background: 'rgba(20, 20, 20, 0.92)', color: '#fff', fontSize: '14px',
                    fontFamily: CONFIG.FONT_FAMILY_OPTIONS.default, pointerEvents: 'none',
                    opacity: '0', transition: 'opacity 0.35s', maxWidth: '70vw', textAlign: 'center'
                }
            });
            document.body.appendChild(this.el);

            bus.on('session:reset', (d) => this.show(this.resetText(d && d.kind)));
            if (SessionReset.lastReset) {
                this.show(this.resetText(SessionReset.lastReset.kind));
                SessionReset.lastReset = null;
            }
        },
        /** Tekst powiadomienia wg rodzaju resetu. */
        resetText(kind) {
            if (kind === 'manual') return I18n.get('resetNotice_manual');
            if (kind === 'stale') return I18n.get('resetNotice_stale');
            return I18n.get('newShiftDetected');
        },
        show(text, ms = 6000) {
            if (!this.el) return;
            this.el.textContent = text;
            this.el.style.opacity = '1';
            clearTimeout(this._hideTimer);
            this._hideTimer = setTimeout(() => { this.el.style.opacity = '0'; }, ms);
        }
    };

    // ─── src/14-marketplace.js ───
    /**
     * Bieżący sklep Amazon (8.5.0). Jedno miejsce prawdy dla linku, wykresu
     * i waluty dziennika — patrz CONFIG.MARKETPLACES.
     */
    function marketplaceKey() {
        const key = store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE;
        return CONFIG.MARKETPLACES[key] ? key : CONFIG.DEFAULT_MARKETPLACE;
    }
    /** @param {string} [key] — konkretny rynek; bez niego bierze się wybrany. */
    function marketplace(key) {
        return CONFIG.MARKETPLACES[key] || CONFIG.MARKETPLACES[marketplaceKey()];
    }
    /**
     * Link do karty produktu.
     *
     * @param {string} [key] — rynek, NA KTÓRYM ZNALEZIONO CENĘ. Trzeba go
     *   podawać jawnie: jeśli ceny trzeba było szukać przeglądem sklepów, link
     *   musi prowadzić właśnie tam, inaczej człowiek otworzy amazon.de i nie
     *   znajdzie tam ceny, którą widzi na karcie.
     *
     * BEZPIECZEŃSTWO: host pochodzi WYŁĄCZNIE z tablicy CONFIG.MARKETPLACES
     * (marketplace() przy nieznanym kluczu wraca do domyślnego), a ASIN idzie
     * przez encodeURIComponent. Schemat jest wpisany na sztywno, więc do
     * atrybutu href nie da się wstawić `javascript:` ani `data:` — nawet gdyby
     * ASIN przyszedł ze strony w spreparowanej postaci.
     */
    function productUrl(asin, key) {
        return `https://${marketplace(key).host}/dp/${encodeURIComponent(asin)}`;
    }

    // ─── src/15-price-ocr.js ───
    // ==========================================
    // 6c. ODCZYT CENY Z OBRAZKA KEEPA (8.4.0)
    // ==========================================
    /**
     * Keepa drukuje aktualne ceny wprost w legendzie wykresu. Obrazek wychodzi
     * z nagłówkami CORS, więc piksele są dostępne przez canvas — i cenę da się
     * dostać LICZBĄ, bez płatnego klucza API i bez zapytań do Amazona.
     *
     * DLACZEGO WŁASNY ODCZYT, A NIE GOTOWA BIBLIOTEKA. Rozbiór pikseli 20
     * prawdziwych produktów (stanowisko ocr_verify.html) pokazał: font legendy
     * jest RASTROWY i NIEZMIENNY — ten sam znak u różnych produktów zgadza się
     * piksel w piksel, 166 egzemplarzy glifów sprowadziło się do 16 kształtów.
     * To nie jest zadanie rozpoznawania, tylko wyszukiwania w tablicy.
     *
     * Pomiar na tych samych 20 produktach (32 wiersze legendy):
     *   ten odczyt    32/32,  0,14 ms,  bez zależności
     *   tesseract.js  13/20,   140 ms,  +315 ms start, ~2-4 MB pobierania
     *
     * Przy czym błędy tesseracta są groźne właśnie dla ewidencji: gubi kropkę
     * dziesiętną („5.99” -> „599”) i myli rzędy („17.90” -> „175.90”), czyli
     * kłamie W STRONĘ ZAWYŻENIA i po cichu. Porównanie z wzorcami tak pomylić
     * się nie może: sprawdza glify bit po bicie, a przy niezgodności nie zgaduje
     * najbliższego, tylko zwraca null.
     */
    const KeepaOCR = {
        // Znak ma 7 pikseli wysokości. '#' — atrament, '.' — tło.
        // Alfabet wyuczony automatycznie po znanych cenach, patrz ocr_probe.js
        // (OCR.learn) — tam też można go dobudować, gdyby Keepa zmieniła font.
        GLYPHS: {
            '0': ['.####','##..#','##..#','##..#','##..#','##..#','.####'],
            '1': ['###','###','.##','.##','.##','.##','.##'],
            '2': ['.####','##..#','....#','...#.','..##.','.##..','#####'],
            '3': ['.####','##..#','...##','..##.','....#','##..#','.####'],
            '4': ['...##','..###','.####','.#.##','#####','#####','...##'],
            '5': ['####','#...','###.','####','...#','#..#','####'],
            '6': ['..##.','.#...','.###.','##.##','##..#','.#..#','.####'],
            '7': ['#####','....#','...##','...#.','..##.','..#..','.##..'],
            '8': ['.####','##..#','.#.##','.###.','##..#','##..#','.####'],
            '9': ['.####','##..#','##..#','.#.##','.####','...##','.###.'],
            '.': ['.','.','.','.','.','.','#'],
        },
        // Kolor znacznika 8x8 na lewo od podpisu rozpoznaje serię.
        SERIES: [
            { name: 'Amazon', rgb: [255, 165, 0] },
            { name: 'Neu',    rgb: [136, 136, 221] },
        ],

        _tpl: null,
        templates() {
            if (this._tpl) return this._tpl;
            this._tpl = new Map();
            for (const [ch, rows] of Object.entries(this.GLYPHS)) {
                const w = rows[0].length, cols = [];
                for (let x = 0; x < w; x++) {
                    let c = '';
                    for (let y = 0; y < rows.length; y++) c += rows[y][x] === '#' ? '1' : '0';
                    cols.push(c);
                }
                this._tpl.set(ch, cols);
            }
            return this._tpl;
        },

        /**
         * Adres obrazka wykresu.
         *
         * ASIN jest tu WYMUSZANY do formatu (dziesięć znaków A-Z0-9), a nie
         * tylko kodowany. Powód: adres składa się łańcuchem, a ASIN pochodzi ze
         * strony — czyli z zewnątrz. Kotwiczony wzorzec odcina próbę doklejenia
         * własnych parametrów albo podmiany ścieżki, a przy niezgodności rzuca
         * wyjątek, zamiast wysyłać cokolwiek w sieć.
         */
        url(asin, market) {
            const clean = String(asin || '').toUpperCase();
            if (!/^[A-Z0-9]{10}$/.test(clean)) throw new Error('niedozwolony ASIN: ' + asin);
            return `https://graph.keepa.com/pricehistory.png?asin=${encodeURIComponent(clean)}`
                 + `&domain=${encodeURIComponent(marketplace(market).keepa)}&range=${Number(CONFIG.PRICE_KEEPA_RANGE) || 3}`;
        },

        /**
         * Obrazek do rozbioru. Ładuje się W TLE i do dokumentu nie trafia.
         *
         * Oba atrybuty są obowiązkowe i z różnych powodów:
         *   crossOrigin    — bez niego canvas jest „skażony” (tainted)
         *                    i getImageData rzuca SecurityError, czyli pikseli
         *                    nie widać;
         *   referrerPolicy — bez niego Keepa nie oddaje obrazka w ogóle.
         * Widoczny <img> wykresu zostaje BEZ crossOrigin: tam piksele nie są
         * potrzebne, a zbędnego nagłówka Origin w trybie roboczym nie ma po co
         * zmieniać.
         *
         * 9.2.0 — BEZPIECZNIK SIECIOWY. To jest najniższy poziom, na którym
         * skrypt dotyka sieci zewnętrznej, więc stoi tu twarde sprawdzenie
         * modułu cen. Gdyby ktoś dorobił nową ścieżkę wywołania i zapomniał
         * o sprawdzeniu wyżej, zapytanie i tak nie wyjdzie.
         */
        loadImage(asin, timeoutMs, market) {
            if (!priceModuleOn()) {
                return Promise.reject(new Error('moduł cen wyłączony — zapytanie nie zostało wysłane'));
            }
            return new Promise((res, rej) => {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.referrerPolicy = 'no-referrer';
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true; im.src = '';
                    rej(new Error('przekroczony czas oczekiwania na obrazek'));
                }, timeoutMs || CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                im.onload = () => { if (done) return; done = true; clearTimeout(timer); res(im); };
                im.onerror = () => { if (done) return; done = true; clearTimeout(timer); rej(new Error('obrazek się nie załadował')); };
                im.src = this.url(asin, market);
            });
        },

        pixels(im) {
            const c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(im, 0, 0);
            try {
                return ctx.getImageData(0, 0, c.width, c.height);
            } catch (e) {
                // cause zachowuje pierwotny SecurityError: bez niego w konsoli zostaje
                // sam nasz komunikat i nie widać, co dokładnie zablokowała przeglądarka.
                throw new Error('canvas skażony — obrazek bez crossOrigin', { cause: e });
            }
        },

        isInk(px, x, y) {
            const i = (y * px.width + x) * 4;
            return (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3 < CONFIG.PRICE_OCR_INK_THRESHOLD;
        },

        bandColumns(px, y0, y1) {
            const out = [];
            for (let x = CONFIG.PRICE_OCR_SCAN_FROM_X; x < px.width; x++) {
                let c = '';
                for (let y = y0; y <= y1; y++) c += this.isInk(px, x, y) ? '1' : '0';
                out.push(c);
            }
            return out;
        },

        /**
         * Czy w pasie jest podpis.
         *
         * Produkt może mieć jedną serię zamiast dwóch i wtedy drugi pas jest
         * pusty — ale nie całkiem: zostaje w nim pionowa oś wykresu. Bez tego
         * sprawdzenia oś bierze się za tekst.
         */
        hasContent(cols) {
            let ink = 0;
            for (let i = 2; i < cols.length; i++) if (cols[i].includes('1')) ink++;
            return ink > 3;
        },

        /**
         * Separator dziesiętny opisuje REGUŁA, a nie bitmapa (8.4.1).
         *
         * Znalezione na 60 nowych produktach z bestsellerów amazon.de: przy
         * „€ 12.99” i „€ 12.27” odczyt zwracał „nie przeczytano”, choć wszystkie
         * cyfry zgadzały się z wzorcami. Przyczyna — kropka szerokości DWÓCH
         * pikseli zamiast jednego. Keepa rysuje wiersz z subpikselowym
         * przesunięciem zależnym od jego pełnej szerokości, a wygładzona kropka
         * raz mieści się w jednej kolumnie, raz rozlewa na dwie. Odczyt czytał
         * „12..99” i odrzucał wynik jako niepodobny do ceny.
         *
         * Wyliczanie bitmap kropki na wszystkie przypadki to ślepa uliczka:
         * przesunięcie jest ciągłe. Dlatego kropka rozpoznaje się po tym, czym
         * w tym foncie JEST: kolejne kolumny, w których atrament stoi TYLKO
         * w dolnym wierszu znaku. Żadna cyfra się pod to nie podszywa — wszystkie
         * zajmują pełną wysokość — więc reguła nie może przechwycić cudzego glifu.
         *
         * Długość ograniczona do dwóch kolumn: dłuższy ogon u dołu to już nie
         * separator, tylko podkreślenie albo linia siatki.
         *
         * @returns {number} ile kolumn zjeść (0 — to nie separator)
         */
        dotRun(cols, x) {
            let n = 0;
            while (x + n < cols.length) {
                const c = cols[x + n];
                if (!c.includes('1')) break;                 // pusto
                if (c.slice(0, -1).includes('1')) break;     // atrament wyżej niż dolny wiersz
                n++;
            }
            return (n >= 1 && n <= 2) ? n : 0;
        },

        /**
         * Rozbiór wiersza oknem przesuwnym.
         *
         * Dlaczego nie segmentacja po pustych kolumnach: sąsiednie glify SIĘ
         * SKLEJAJĄ („90” w „17.90” idzie jednym blokiem szerokości 10)
         * i granic po odstępach nie da się znaleźć. Okno przesuwne od sklejania
         * nie zależy.
         *
         * Dlaczego bierze się najdłuższy pasujący rozbiór: na lewo od ceny stoi
         * podpis serii i znak „€”, a one nie zgadzają się z żadnym wzorcem cyfry,
         * więc rozbiór z ich pozycji nie dochodzi do końca wiersza. Przejście po
         * wszystkich startach i wybór najdłuższego wyniku zdejmuje pytanie
         * o granicę słowa. To właśnie naprawia utratę najstarszego rzędu: bez
         * tego „15.51” czytało się jako „5.51”, a „11.89” jako „1.89”.
         */
        readPrice(cols) {
            const L = cols.length;
            // '.' wyłączona z przeglądu: łapie ją dotRun() po regule powyżej.
            const tpl = [...this.templates().entries()]
                .filter(([ch]) => ch !== '.')
                .sort((a, b) => b[1].length - a[1].length);
            const blank = (c) => !c.includes('1');

            const parseFrom = (start) => {
                let x = start, out = '';
                while (x < L) {
                    while (x < L && blank(cols[x])) x++;
                    if (x >= L) break;
                    const dn = this.dotRun(cols, x);
                    if (dn) { out += '.'; x += dn; continue; }
                    let hit = null;
                    for (const [ch, t] of tpl) {
                        if (x + t.length > L) continue;
                        let ok = true;
                        for (let i = 0; i < t.length; i++) if (cols[x + i] !== t[i]) { ok = false; break; }
                        if (ok) { hit = [ch, t.length]; break; }
                    }
                    if (!hit) return null;
                    out += hit[0]; x += hit[1];
                }
                return out;
            };

            let best = null, bestRaw = '';
            for (let s = 0; s < L; s++) {
                if (blank(cols[s])) continue;
                const t = parseFrom(s);
                if (!t) continue;
                const d = this.toDecimal(t);
                // Długość porównuje się po SUROWYM rozbiorze, a nie po liczbie:
                // to właśnie ona odróżnia „2.991.39” od jego własnego kawałka „991.39”.
                if (d && t.length > bestRaw.length) { best = d; bestRaw = t; }
            }
            return best;
        },

        /**
         * SEPARATOR TYSIĘCY (9.1.1) — poprawka cichej utraty najstarszego rzędu.
         *
         * Złapane na B091FXSL4P (FLUKE networks Advanced-Kit): Keepa drukuje
         * „€ 2,991.39”, a odczyt zwracał „991.39”. Błąd 2000 € na jednym
         * przedmiocie, po cichu, z pozoru wiarygodną liczbą.
         *
         * Mechanizm. Przecinek-separator w pasie legendy wygląda jak kropka
         * (jego ogon schodzi PONIŻEJ znaku i w pas nie wchodzi), więc dotRun()
         * uczciwie czytał „2.991.39”. Poprzednie sprawdzenie `^\d{1,5}\.\d{2}$`
         * taki łańcuch odrzucało — są w nim dwie kropki — po czym reguła
         * „bierzemy najdłuższy pasujący rozbiór” wybierała „991.39”, bo TEN
         * kawałek sprawdzenie przechodził. Czyli odrzucenie poprawnej odpowiedzi
         * prowadziło nie do odmowy, tylko do wydania obciętej.
         *
         * Dlaczego rozstrzyga pozycja, a nie rozpoznanie przecinka. Przecinek od
         * kropki da się odróżnić — ma ogon pod wierszem. Ale to zbędne: cena ma
         * dokładnie jeden separator dziesiętny i jest on zawsze OSTATNI.
         * Wszystko na lewo to grupowanie rzędów. Reguła nie zależy od tego, który
         * znak jest który, więc tak samo poprawnie rozbiera angielskie
         * „2,991.39” i niemieckie „2.991,39”: oba przyjdą tu jako „2.991.39”
         * i oba dadzą 2991.39.
         *
         * Grupa sztywno po TRZY cyfry — i to jest zabezpieczenie przed śmieciem:
         * obcinki w rodzaju „.991.39” czy „12.34.56” formy nie przechodzą.
         *
         * @param {string} text — surowy rozbiór, w którym każdy separator to '.'
         * @returns {string|null} łańcuch typu „2991.39”, nadający się do parseFloat
         */
        PRICE_SHAPE: /^\d{1,3}(?:\.\d{3})+\.\d{2}$|^\d{1,5}\.\d{2}$/,

        toDecimal(text) {
            if (!this.PRICE_SHAPE.test(text)) return null;
            const i = text.lastIndexOf('.');
            return text.slice(0, i).split('.').join('') + '.' + text.slice(i + 1);
        },

        /**
         * Nazwa serii po kolorze kółka na lewo od podpisu.
         *
         * 9.1.1: szukanie zaczyna się od PRICE_OCR_SERIES_FROM_X, a nie od
         * granicy rozbioru tekstu. Legenda jest wyrównana do prawej i przy
         * długiej cenie kółko ucieka na lewo od 406 — wtedy seria nie była
         * rozpoznawana wcale.
         *
         * Ceną za szersze okno jest to, że wchodzi w nie kawałek pola wykresu,
         * więc doszedł warunek NASYCENIA: wypełnienie pod linią ceny to blady
         * odcień, znacznik to czysty kolor. Pomyłka kosztuje tu tanio: nazwa
         * serii tylko się pokazuje, a cena wybierana jest PO LICZBIE (patrz
         * pickHighest), więc na ewidencję nie wpływa.
         */
        seriesOf(px, y0) {
            const y = y0 + 3;
            const to = CONFIG.PRICE_OCR_SCAN_FROM_X + 20;
            for (let x = CONFIG.PRICE_OCR_SERIES_FROM_X; x < to; x++) {
                const i = (y * px.width + x) * 4;
                const [r, g, b] = [px.data[i], px.data[i + 1], px.data[i + 2]];
                if (r === g && g === b) continue;                        // szare: oś, siatka, tekst
                if (r > 240 && g > 240 && b > 240) continue;             // prawie białe: tło
                const chroma = Math.max(r, g, b) - Math.min(r, g, b);
                if (chroma < CONFIG.PRICE_OCR_SERIES_MIN_CHROMA) continue;  // blade wypełnienie
                let best = null, bd = 1e9;
                for (const s of this.SERIES) {
                    const d = Math.abs(r - s.rgb[0]) + Math.abs(g - s.rgb[1]) + Math.abs(b - s.rgb[2]);
                    if (d < bd) { bd = d; best = s.name; }
                }
                if (bd < 120) return best;
            }
            return '?';
        },

        /** Wszystkie wiersze legendy: [{series, price}]. */
        readAll(px) {
            const rows = [];
            for (const [y0, y1] of CONFIG.PRICE_OCR_BANDS) {
                const cols = this.bandColumns(px, y0, y1);
                if (!this.hasContent(cols)) continue;
                rows.push({ series: this.seriesOf(px, y0), price: this.readPrice(cols) });
            }
            return rows;
        },

        /**
         * NAJWYŻSZA cena z wierszy legendy.
         *
         * Do ewidencji potrzebna jest cena przedmiotu, a nie najtańsza oferta:
         * wiersz Amazon prawie zawsze stoi wyżej niż wiersz Neu (na próbkach —
         * 15,51 wobec 11,49, 10,95 wobec 9,20, 13,95 wobec 10,93). Wybór idzie
         * PO LICZBIE, a nie po nazwie serii: jeśli wiersza Amazon nie ma wcale,
         * zostanie Neu, a gdyby Keepa kiedyś zmieniła kolejność — reguła się nie
         * zepsuje.
         */
        pickHighest(rows) {
            let best = null;
            for (const r of rows) {
                if (!r.price) continue;
                const v = parseFloat(r.price);
                if (!isFinite(v)) continue;
                if (!best || v > best.value) best = { value: v, price: r.price, series: r.series };
            }
            return best;
        },

        /**
         * Pełny cykl: wczytać obrazek, rozebrać, zwrócić ceny.
         * @param {string} [market] — rynek; bez niego bierze się wybrany.
         */
        async read(asin, market) {
            const im = await this.loadImage(asin, undefined, market);
            const px = this.pixels(im);
            const rows = this.readAll(px);
            const top = this.pickHighest(rows);
            if (!top) return null;
            const second = rows
                .filter(r => r.price && r.price !== top.price)
                .map(r => ({ series: r.series, text: `${r.series} ${r.price}` }))[0] || null;
            return { top, second, rows };
        },
    };

    // ─── src/16-value-log.js ───
    // ==========================================
    // 6e. DZIENNIK WARTOŚCI (8.4.0)
    // ==========================================
    /**
     * Łączna wartość przedmiotów przetworzonych przez zmianę.
     *
     * CO SIĘ LICZY. Wyłącznie przedmiot, który przeszedł PEŁNĄ ścieżkę: ten,
     * na którym zadziałał automatyczny przyrost licznika (pojawiło się
     * `Przypisz nowy` przy wzniesionej fladze początku). Ani skróty klawiszowe,
     * ani ręczna poprawka licznika do dziennika nie piszą — ręcznie poprawia się
     * zwykle właśnie to, czego program nie zobaczył, a ceny do tego i tak nie ma.
     *
     * Przedmioty przerwane nie liczą się z tego samego powodu, co w liczniku:
     * `Przypisz nowy` nie zadziałał, nie ma czego liczyć.
     *
     * CYKL ŻYCIA — jak u liczników: dziennik żyje jedną zmianę i zeruje się
     * razem z nimi przy przejściu na nową. Podsumowania idą przy tym do
     * archiwum (wspólny, nieversjonowany klucz), więc historia nie ginie.
     *
     * 9.2.0: dziennik napełnia się TYLKO przy włączonym module cen — patrz add().
     */
    const ValueLog = {
        entries: [],
        shiftStart: null,
        _archiveTimer: null,
        _writeBackTimer: null,

        key() { return StorageManager.getKey(CONFIG.STORAGE_KEY_VALUE_LOG); },
        archiveKey() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_VALUE_ARCHIVE; },

        // ---------------- wspólny dziennik na wszystkie karty (9.1.0) ----------------
        /**
         * DZIENNIK JEST JEDEN NA WSZYSTKIE KARTY I TO GŁÓWNA WŁASNOŚĆ WERSJI 9.1.0.
         *
         * Co było zepsute wcześniej. Dziennik czytało się z localStorage DOKŁADNIE
         * RAZ, przy starcie, a save() pisała do wspólnego klucza CAŁĄ swoją
         * tablicę. Dwie otwarte karty (CRET i WHD — normalny tryb pracy) trzymały
         * dwie niezależne kopie i zamazywały się nawzajem: w kluczu zostawały
         * wpisy tej karty, która zapisała ostatnia.
         *
         * Dlaczego to ważne właśnie tutaj. Ewidencja jest przekrojowa po
         * przedmiocie, a nie po karcie: ta sama rzecz jedzie z CRET do WHD (kod
         * `WHD`, znak minus, −150 €), a potem jest obsługiwana na karcie WHD
         * i idzie na sprzedaż (znak plus, +150 €). Poprawny wynik to zero i widać
         * go TYLKO wtedy, gdy oba wpisy leżą w jednym dzienniku.
         *
         * Jak to zrobiono. Klucz localStorage jest jedynym źródłem prawdy,
         * a pamięć karty jego kopią roboczą:
         *
         *   1. każdy wpis ma NIEZMIENNE `id` i znacznik `updated`;
         *   2. save() PRZECZYTUJE wspólny dziennik, scala z nim swoją kopię po id
         *      (przy konflikcie wygrywa świeższy `updated`) i pisze scalenie —
         *      czyli cudzych wpisów nie da się fizycznie zamazać;
         *   3. zdarzenie `storage` z sąsiedniej karty wywołuje adoptRemote():
         *      to samo scalanie, tylko w drugą stronę;
         *   4. jeśli po scaleniu mamy wpisy, których we wspólnym dzienniku nie ma,
         *      robi się jeden dopisujący save(). Scalanie jest monotoniczne, więc
         *      wymiana zbiega się i nie zapętla;
         *   5. usunięcie klucza przez sąsiada traktuje się jako reset zmiany
         *      i czyści naszą kopię — nie ma czego wskrzeszać.
         *
         * Kolejność pozycji w scaleniu — po czasie (`ts`), a nie po tym, kto
         * zdążył zapisać: dziennik czyta się oczami.
         */
        _migrate(e) {
            if (!e || typeof e !== 'object') return null;
            // Wpisy sprzed 9.1.0 nie mają id. Nadajemy stabilne, wyprowadzone
            // z samego wpisu: dwa odczyty tego samego starego dziennika muszą dać
            // to samo id, inaczej scalanie rozmnoży pozycję.
            if (!e.id) e.id = `v90_${e.ts || 0}_${e.asin || 'noasin'}_${e.dept || '?'}`;
            if (typeof e.updated !== 'number') e.updated = e.ts || 0;
            return e;
        },

        /** Wspólny dziennik w postaci, w jakiej leży teraz w localStorage. */
        _readShared() {
            try {
                const raw = JSON.parse(localStorage.getItem(this.key()) || 'null');
                if (raw && Array.isArray(raw.entries)) {
                    return {
                        shiftStart: raw.shiftStart || null,
                        entries: raw.entries.map(e => this._migrate(e)).filter(Boolean),
                    };
                }
            } catch (e) { Utils.error('Dziennik wartości nie został odczytany', e); }
            return null;
        },

        /**
         * Czy po scaleniu mamy coś, czego we wspólnym dzienniku nie ma.
         *
         * Wcześniej rozstrzygała o tym sama DŁUGOŚĆ: `merged.length >
         * shared.entries.length`. Gubiło to przypadek, w którym liczba pozycji
         * się zgadza, a różni się ich TREŚĆ — czyli dokładnie skutek wyścigu
         * przy odczycie i zapisie wspólnego klucza (localStorage nie daje tu
         * żadnej atomowości):
         *
         *   1. stawiamy kierunek przedmiotu, save() czyta wspólny dziennik;
         *   2. sąsiednia karta zdążyła w tej szparze zapisać swoją, starszą
         *      wersję tej samej pozycji;
         *   3. dostajemy zdarzenie `storage`, scalamy — nasza wersja wygrywa
         *      po `updated`, ale długość się zgadza, więc dopisanie się nie
         *      planowało i we wspólnym kluczu zostawała wersja starsza.
         *
         * Naprawiało się to samo przy następnym przedmiocie (save() scala),
         * więc realnie zagrożony był wyłącznie OSTATNI przedmiot zmiany — ten,
         * po którym nic już nie zapisywało. Cicho i akurat na podsumowaniu.
         *
         * Teraz porównanie idzie po id i po `updated`: to ta sama miara, którą
         * rozstrzyga _merge(), więc obie strony wymiany widzą tak samo.
         */
        _aheadOfShared(merged, sharedEntries) {
            const theirs = new Map();
            for (const e of sharedEntries) if (e && e.id) theirs.set(e.id, e.updated || 0);
            return merged.some(e => {
                if (!e || !e.id) return false;
                if (!theirs.has(e.id)) return true;
                return (e.updated || 0) > theirs.get(e.id);
            });
        },

        /** Scalenie dwóch list po id; przy konflikcie wygrywa świeższy updated. */
        _merge(base, mine) {
            const map = new Map();
            for (const e of base) if (e && e.id) map.set(e.id, e);
            for (const e of mine) {
                if (!e || !e.id) continue;
                const cur = map.get(e.id);
                if (!cur || (e.updated || 0) >= (cur.updated || 0)) map.set(e.id, e);
            }
            return [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        },

        load() {
            const shared = this._readShared();
            this.entries = shared ? shared.entries : [];
            this.shiftStart = shared ? shared.shiftStart : null;
            if (this.entries.length) Utils.log(`[DZIENNIK] wczytano wpisów: ${this.entries.length}`);
        },

        save() {
            const shared = this._readShared();
            const merged = shared ? this._merge(shared.entries, this.entries) : this.entries.slice();
            this.entries = merged;
            if (!this.shiftStart && shared && shared.shiftStart) this.shiftStart = shared.shiftStart;
            try {
                localStorage.setItem(this.key(), JSON.stringify({
                    shiftStart: this.shiftStart, entries: merged,
                }));
                // Pamięć „nie pisz tego samego” żyje w StorageManager i o tym
                // kluczu nic nie wie — zdejmujemy notatkę, żeby nie przeszkodziła
                // sąsiedniej karcie przy następnym zapisie.
                delete StorageManager._lastWritten[this.key()];
            } catch (e) { Utils.error('Dziennik wartości nie został zapisany', e); }
            this.scheduleArchive();
            bus.emit('valueLog:changed');
        },

        /** Sąsiednia karta zmieniła wspólny dziennik. */
        adoptRemote() {
            const shared = this._readShared();
            if (!shared) {
                // Klucza już nie ma — sąsiednia karta zresetowała zmianę.
                if (this.entries.length) {
                    Utils.log('[DZIENNIK] sąsiednia karta wyczyściła dziennik — zdejmujemy swoją kopię');
                }
                clearTimeout(this._writeBackTimer);
                this.entries = [];
                this.shiftStart = store.sessionConfig.shiftCalculatedStartTime || null;
                bus.emit('valueLog:changed');
                return;
            }
            const before = this.entries.length;
            const merged = this._merge(shared.entries, this.entries);
            const haveOurOwn = this._aheadOfShared(merged, shared.entries);
            this.entries = merged;
            if (shared.shiftStart) this.shiftStart = shared.shiftStart;
            bus.emit('valueLog:changed');
            if (before !== merged.length || haveOurOwn) {
                Utils.log(`[DZIENNIK] synchronizacja: u nas było ${before}, w magazynie `
                        + `${shared.entries.length}, jest ${merged.length}`);
            }
            if (haveOurOwn) this._scheduleWriteBack();
        },

        /**
         * Dopisać do wspólnego dziennika nasze wpisy, których sąsiad nie widział.
         * Przerwa jest potrzebna tylko po to, żeby skleić paczkę zdarzeń
         * `storage`; sam zapis jest bezpieczny w dowolnym momencie, bo save()
         * scala.
         */
        _scheduleWriteBack() {
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = setTimeout(() => { this._writeBackTimer = null; this.save(); }, 400);
        },

        // ---------------- archiwum ----------------
        /**
         * Archiwum trzyma tylko PODSUMOWANIA zmian, nie pozycje: pełna lista
         * z dziesiątek zmian nie zmieściłaby się w localStorage dzielonym
         * z samą aplikacją TREX. Dla bieżącej zmiany pozycje są w entries.
         *
         * 9.1.0: zapis jest odroczony. Wcześniej writeArchive() szła przy KAŻDYM
         * wywołaniu save(), czyli dwa razy na przedmiot (utworzenie wpisu
         * i postawienie znaku), a za każdym razem był to rozbiór i złożenie
         * całego archiwum na 60 zmian.
         */
        scheduleArchive() {
            clearTimeout(this._archiveTimer);
            this._archiveTimer = setTimeout(() => {
                this._archiveTimer = null;
                this.writeArchive();
            }, CONFIG.VALUE_ARCHIVE_WRITE_DEBOUNCE_MS);
        },
        /** Zapisać archiwum natychmiast (reset zmiany, wyjście ze strony). */
        flushArchive() {
            clearTimeout(this._archiveTimer);
            this._archiveTimer = null;
            this.writeArchive();
        },

        writeArchive() {
            const start = this.shiftStart || store.sessionConfig.shiftCalculatedStartTime;
            if (!start) return;
            let arc = {};
            try { arc = JSON.parse(localStorage.getItem(this.archiveKey()) || '{}') || {}; } catch (e) { arc = {}; }
            const t = this.totals();
            const byDept = {};
            for (const e of this.entries) {
                const d = e.dept || '?';
                if (!byDept[d]) byDept[d] = { count: 0, sold: 0, unsold: 0 };
                byDept[d].count++;
                const eur = FxRates.toEur(e.price, e.currency);
                if (eur == null) continue;
                if (e.sign > 0) byDept[d].sold += eur;
                else if (e.sign < 0) byDept[d].unsold += eur;
            }
            for (const d of Object.keys(byDept)) {
                byDept[d].sold = +byDept[d].sold.toFixed(2);
                byDept[d].unsold = +byDept[d].unsold.toFixed(2);
            }
            arc[String(start)] = {
                start,
                shiftType: store.sessionConfig.shiftType || null,
                count: t.count,
                sold: +t.sold.toFixed(2), unsold: +t.unsold.toFixed(2), net: +t.net.toFixed(2),
                soldN: t.soldN, unsoldN: t.unsoldN,
                undetermined: t.undetermined, unpriced: t.unpriced,
                currency: 'EUR', byDept,
                updated: Date.now(),
            };
            const keys = Object.keys(arc).sort((a, b) => Number(a) - Number(b));
            if (keys.length > CONFIG.VALUE_ARCHIVE_MAX_SHIFTS) {
                keys.slice(0, keys.length - CONFIG.VALUE_ARCHIVE_MAX_SHIFTS).forEach(k => delete arc[k]);
            }
            try { localStorage.setItem(this.archiveKey(), JSON.stringify(arc)); } catch (e) { /* magazyn pełny albo zablokowany — archiwum jest wygodą, nie danymi krytycznymi */ }
        },

        // ---------------- wpisy ----------------
        /**
         * Zapisuje zrobiony przedmiot. price może być null — dopisze się później.
         *
         * 9.2.0: pierwszy warunek to moduł cen. Przy wyłączonym module wszystkie
         * pozycje i tak byłyby bez ceny, a dziennik pełen pustych wpisów tylko
         * zaśmiecałby localStorage i mylił w podsumowaniu.
         *
         * @returns {string|null} id wpisu (nie indeks: po scaleniu z cudzymi
         *   wpisami kolejność w tablicy się zmienia i indeks przestaje być adresem).
         */
        add(asin, priceObj, dept) {
            if (!priceModuleOn()) return null;
            if (!store.localTabConfig.priceCard.logValues) return null;
            if (this.entries.length >= CONFIG.VALUE_LOG_MAX_ENTRIES) {
                Utils.error('Dziennik wartości przepełniony, wpis pominięty');
                return null;
            }
            if (!this.shiftStart) this.shiftStart = store.sessionConfig.shiftCalculatedStartTime || Date.now();
            const now = Date.now();
            const entry = {
                // id jest unikalne po karcie i po czasie: dwie karty, które
                // zapisały przedmiot w tej samej milisekundzie, nie zleją się
                // w jedną pozycję.
                id: Utils.generateId(`${dept || store.currentTabInstanceId || 'x'}_`),
                asin: asin || null,
                price: priceObj && typeof priceObj.value === 'number' ? priceObj.value : null,
                currency: priceObj && priceObj.currency ? priceObj.currency : null,
                dept: dept || store.currentTabInstanceId || '?',
                ts: now,
                /**
                 * ZNAK KIERUNKU (9.0.0):
                 *    +1 — przedmiot poszedł na sprzedaż, wartość idzie na plus;
                 *    -1 — poszedł do utylizacji, wartość idzie na minus;
                 *     0 — kierunek TAK I NIE ZOSTAŁ USTALONY.
                 *
                 * Zero nie jest błędem ani „jeszcze nie policzyliśmy”: to uczciwe
                 * „kod sortowania nie pojawił się do początku następnego
                 * przedmiotu”. Taki wpis nie idzie ani na plus, ani na minus, ale
                 * widać go osobnym licznikiem, żeby było jasne, że ustalono 112
                 * ze 113, a nie że suma jest zaniżona nie wiadomo czemu.
                 */
                sign: 0,
                route: null,      // sam kod sortowania, do analizy po fakcie
                updated: now,     // 9.1.0: po nim rozstrzyga się konflikt kart
            };
            this.entries.push(entry);
            this.save();
            Utils.log(`[DZIENNIK] przedmiot ${entry.asin || 'bez ASIN'} (${entry.dept}), razem ${this.entries.length}: `
                    + (entry.price != null ? `${entry.price} ${entry.currency}` : 'cena na razie nieznana'));
            return entry.id;
        },

        /**
         * Stawia kierunek wpisu. Woła go moduł Routing — albo od razu przy
         * tworzeniu wpisu, albo później, gdy kod sortowania wreszcie przyszedł.
         * @param {string} id — identyfikator wpisu wydany przez add().
         */
        setDirection(id, direction, code) {
            const e = id ? this.entries.find(x => x.id === id) : null;
            if (!e) return false;
            const sign = direction === 'sell' ? 1 : direction === 'unsell' ? -1 : 0;
            if (e.sign === sign && e.route === (code || null)) return false;
            e.sign = sign;
            e.route = code || null;
            e.updated = Date.now();
            this.save();
            Utils.log(`[DZIENNIK] ${e.asin || 'bez ASIN'} (${e.dept}): `
                    + `${direction === 'sell' ? 'SPRZEDAŻ +' : 'NIESPRZEDAŻ -'}`
                    + (e.price != null ? `${e.price} ${e.currency}` : 'bez ceny')
                    + (code ? ` (${code})` : ''));
            return true;
        },

        /**
         * Dopisuje cenę przedmiotowi, który skończył się wcześniej, niż ona
         * przyjechała. W praktyce rzadkość — obrazek Keepa odpowiada w dziesiątki
         * milisekund, a przedmiot obsługuje się minutami — ale jeśli sieć zwalnia,
         * pozycji tracić nie wolno.
         */
        fillPending(asin, priceObj) {
            if (!asin || !priceObj || typeof priceObj.value !== 'number') return 0;
            let n = 0;
            const now = Date.now();
            for (let i = this.entries.length - 1; i >= 0; i--) {
                const e = this.entries[i];
                if (e.asin === asin && e.price == null) {
                    e.price = priceObj.value;
                    e.currency = priceObj.currency || 'EUR';
                    e.updated = now;
                    n++;
                }
            }
            if (n) { this.save(); Utils.log(`[DZIENNIK] dopisano cenę ${asin}: ${priceObj.value} (pozycji: ${n})`); }
            return n;
        },

        /**
         * Podsumowanie zmiany — trzy liczby w EURO, po WSZYSTKICH kartach naraz.
         *
         * Wszystko sprowadza się do euro (FxRates): funtów z co.uk i dolarów
         * z com nie wolno dodawać do euro, a trzymać wyniku w pięciu walutach dla
         * wskaźnika „ile wyrobiłem na zmianie” nie ma sensu.
         *
         * Liczy się oddzielnie:
         *   sold   — wartość sprzedanego (znak +1);
         *   unsold — wartość tego, co poszło do utylizacji (znak -1), jako liczba
         *            DODATNIA: znak dopisuje się przy pokazywaniu, tak wygodniej
         *            liczyć;
         *   net    — różnica, i to jest wynik zmiany.
         *
         * Wpisy bez ceny i bez kursu do sum nie wchodzą i liczone są osobno:
         * po cichu zaniżać wyniku nie wolno, to to samo kłamstwo, tylko w drugą
         * stronę.
         */
        totals() {
            let sold = 0, unsold = 0, soldN = 0, unsoldN = 0;
            let undetermined = 0, unpriced = 0, noRate = 0;
            for (const e of this.entries) {
                if (typeof e.price !== 'number') { unpriced++; continue; }
                const eur = FxRates.toEur(e.price, e.currency);
                if (eur == null) { noRate++; continue; }
                if (e.sign > 0) { sold += eur; soldN++; }
                else if (e.sign < 0) { unsold += eur; unsoldN++; }
                else undetermined++;
            }
            return {
                count: this.entries.length,
                sold, unsold, net: sold - unsold,
                soldN, unsoldN, undetermined, unpriced, noRate,
                currency: 'EUR',
            };
        },

        reset(reason) {
            this.flushArchive();               // podsumowań odchodzącej zmiany nie tracimy
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = null;
            this.entries = [];
            this.shiftStart = store.sessionConfig.shiftCalculatedStartTime || null;
            try { localStorage.removeItem(this.key()); } catch (e) { /* nie ma czego usuwać albo magazyn niedostępny — i tak czyścimy stan w pamięci */ }
            delete StorageManager._lastWritten[this.key()];
            Utils.log(`[DZIENNIK] wyczyszczony: ${reason}`);
            bus.emit('valueLog:changed');
        },

        /** Szczegółowy wydruk do konsoli — do przeniesienia do sprawozdania. */
        report() {
            const t = this.totals();
            const rows = this.entries.map((e, i) => {
                const eur = FxRates.toEur(e.price, e.currency);
                return {
                    '#': i + 1,
                    czas: Utils.formatTime(new Date(e.ts), true, ':'),
                    ASIN: e.asin || '—',
                    cena: e.price != null ? e.price.toFixed(2) : '—',
                    waluta: e.currency || '—',
                    'w euro': eur != null ? eur.toFixed(2) : '—',
                    kierunek: e.sign > 0 ? 'sprzedaż' : e.sign < 0 ? 'niesprzedaż' : 'NIEOKREŚLONY',
                    kod: e.route || '—',
                    dział: e.dept,
                };
            });
            if (console.table) console.table(rows); else Utils.log(rows);
            Utils.log('RAZEM:', t);
            return { totals: t, entries: this.entries };
        },

        archive() {
            try { return JSON.parse(localStorage.getItem(this.archiveKey()) || '{}'); }
            catch (e) { return {}; }
        },
    };

    // ─── src/17-fx-rates.js ───
    // ==========================================
    // 6f. KURSY WALUT (9.0.0)
    // ==========================================
    /**
     * Sprowadza dowolną walutę do euro.
     *
     * PO CO. Cena przychodzi w walucie rynku, z którego została zdjęta: funty
     * z co.uk, dolary z com, korony ze se, złote z pl. Trzymać wyniku zmiany
     * w pięciu walutach nie ma sensu, dodawać ich wprost to kłamstwo. Dlatego
     * wszystko sprowadza się do euro.
     *
     * Kursy brane są raz z otwartego źródła i kładzione do wspólnego
     * (nieversjonowanego) magazynu na dobę. To NIE jest sprzeczne z rezygnacją
     * z pamięci cen w 8.5.0: cena produktu zmienia się w ciągu dnia i musi być
     * czytana na nowo przy każdym przedmiocie, a kurs waluty przez jedną zmianę
     * nie przesunie się na tyle, żeby było to widać w szacunku „ile wyrobiłem”.
     *
     * 9.2.0 — NAJWAŻNIEJSZA ZMIANA W TYM MODULE.
     *
     * Przy wyłączonym module cen kursy NIE SĄ POBIERANE. Zamiast tego bierze się
     * to, co już leży w localStorage, a jeśli nie leży nic — tablicę wpisaną
     * w plik (CONFIG.FX_FALLBACK). Zero ruchu w sieci.
     *
     * Wejście do sieci jest dokładnie w jednym miejscu: init() wywołane po tym,
     * jak człowiek zaznaczył „Włącz moduł cen”.
     */
    const FxRates = {
        rates: null,        // { USD: 1.156, GBP: 0.856, ... } — jednostek za 1 EUR
        source: null,       // nazwa źródła albo 'wbudowane'
        fetchedAt: null,
        offline: false,     // 9.2.0: true = kursy wzięte bez dotykania sieci

        key() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_FX_RATES; },

        /**
         * Normalizuje odpowiedź dostawcy do { WALUTA: liczba }.
         *
         * 9.1.0: liczba przyjmowana jest też ŁAŃCUCHEM. Poprzednie sprawdzenie
         * `typeof v === 'number'` po cichu odrzucało floatrates, który oddaje
         * kurs jako „1.15514929”, — tablica wychodziła pusta, sprawdzenie USD nie
         * przechodziło i trzecie źródło nie zadziałało ANI RAZU przez cały czas
         * swojego istnienia.
         *
         * To jest zarazem granica zaufania do odpowiedzi z sieci: wchodzi tu
         * dowolny JSON z cudzego serwera, a wychodzi wyłącznie płaska tablica
         * dodatnich, skończonych liczb pod kluczami podniesionymi do wielkich
         * liter. Nic innego dalej nie przejdzie.
         */
        normalize(raw) {
            if (!raw || typeof raw !== 'object') return null;
            const out = {};
            for (const k of Object.keys(raw)) {
                if (Utils.UNSAFE_KEYS.includes(k)) continue;
                const v = typeof raw[k] === 'string' ? Number(raw[k]) : raw[k];
                if (typeof v === 'number' && isFinite(v) && v > 0) out[k.toUpperCase()] = v;
            }
            out.EUR = 1;
            // Minimalne sprawdzenie zdrowego rozsądku: dolar do euro nigdy nie był
            // ani trzy razy droższy, ani trzy razy tańszy. Krzywą odpowiedź lepiej
            // odrzucić, niż policzyć po niej całą zmianę.
            if (!out.USD || out.USD < 0.3 || out.USD > 3) return null;
            return out;
        },

        loadCached() {
            try {
                const raw = JSON.parse(localStorage.getItem(this.key()) || 'null');
                if (!raw || !raw.rates || typeof raw.ts !== 'number') return false;
                if (Date.now() - raw.ts > CONFIG.FX_TTL_MS) return false;
                const norm = this.normalize(raw.rates);
                if (!norm) return false;
                this.rates = norm; this.source = raw.source; this.fetchedAt = raw.ts;
                return true;
            } catch (e) { return false; }
        },

        save() {
            try {
                localStorage.setItem(this.key(), JSON.stringify({
                    rates: this.rates, source: this.source, ts: this.fetchedAt,
                }));
            } catch (e) { /* magazyn przepełniony — nic krytycznego */ }
        },

        useFallback(why) {
            this.rates = { ...CONFIG.FX_FALLBACK };
            this.source = 'wbudowane';
            this.fetchedAt = null;
            Utils.error(`Kursy walut nie zostały pobrane (${why}). Wzięto wbudowane — sumy w euro będą przybliżone.`);
        },

        /**
         * TRYB BEZ SIECI (9.2.0) — to właśnie wykonuje się przy starcie skryptu.
         *
         * Bierze kursy z localStorage, jeśli tam leżą i nie są przeterminowane,
         * a w przeciwnym razie tablicę wpisaną w plik. W obu przypadkach ani
         * jednego zapytania. Braku kursów nie zgłasza jako błędu, bo przy
         * wyłączonym module cen to jest stan normalny, a nie awaria.
         */
        initOffline() {
            if (this.loadCached()) {
                this.offline = false;
                Utils.log(`Kursy walut z magazynu (${this.source}), sieci nie ruszaliśmy.`);
                return this.rates;
            }
            this.rates = { ...CONFIG.FX_FALLBACK };
            this.source = I18n.get('priceModule_fxOffline');
            this.fetchedAt = null;
            this.offline = true;
            Utils.log('Kursy walut: tablica wbudowana (moduł cen wyłączony, sieci nie ruszaliśmy).');
            return this.rates;
        },

        /**
         * Pobranie kursów z sieci. Wywoływane WYŁĄCZNIE po ręcznym włączeniu
         * modułu cen — sprawdzenie na początku jest ostatnią linią obrony.
         */
        async init() {
            if (!priceModuleOn()) return this.initOffline();
            if (this.loadCached()) {
                this.offline = false;
                Utils.log(`Kursy walut z magazynu (${this.source}), wiek `
                        + `${Math.round((Date.now() - this.fetchedAt) / 3600000)} h`);
                return this.rates;
            }
            for (const p of CONFIG.FX_PROVIDERS) {
                try {
                    const ctl = new AbortController();
                    const timer = setTimeout(() => ctl.abort(), CONFIG.FX_TIMEOUT_MS);
                    const r = await fetch(p.url, { signal: ctl.signal, cache: 'no-store' });
                    clearTimeout(timer);
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    const norm = this.normalize(p.pick(await r.json()));
                    if (!norm) throw new Error('odpowiedź nie wygląda na kursy');
                    this.rates = norm; this.source = p.name; this.fetchedAt = Date.now();
                    this.offline = false;
                    this.save();
                    Utils.log(`Kursy walut: ${p.name}`, this.brief());
                    return this.rates;
                } catch (e) {
                    Utils.log(`[KURSY] ${p.name} — ${e.message}`);
                }
            }
            this.useFallback('wszystkie źródła niedostępne');
            return this.rates;
        },

        /** @returns {number|null} kwota w euro albo null, jeśli kursu nie ma. */
        toEur(value, currency) {
            if (typeof value !== 'number' || !isFinite(value)) return null;
            const cur = (currency || 'EUR').toUpperCase();
            if (cur === 'EUR') return value;
            const table = this.rates || CONFIG.FX_FALLBACK;
            const rate = table[cur];
            if (!rate || !isFinite(rate) || rate <= 0) return null;
            return value / rate;      // w tablicy — jednostek waluty za 1 EUR
        },

        brief() {
            const t = this.rates || CONFIG.FX_FALLBACK;
            return ['USD', 'GBP', 'PLN', 'SEK', 'CAD']
                .filter(c => t[c]).map(c => `${c} ${t[c].toFixed(3)}`).join(', ');
        },

        status() {
            return {
                'źródło': this.source || 'jeszcze nie pobrane',
                'pobrane': this.fetchedAt ? new Date(this.fetchedAt).toLocaleString() : '—',
                'kursy za 1 EUR': this.brief(),
                'bez sieci': this.offline,
            };
        },

        /**
         * Wymusić ponowne pobranie (np. gdy sieć pojawiła się później).
         * Przy wyłączonym module cen sprowadza się do odczytu bez sieci.
         */
        async refresh() {
            try { localStorage.removeItem(this.key()); } catch (e) { /* zapisanych kursów mogło nie być — odświeżenie i tak pobierze je od nowa */ }
            this.rates = null; this.source = null; this.fetchedAt = null;
            await this.init();
            bus.emit('valueLog:changed');     // sumy przeliczają się w locie
            return this.status();
        },
    };

    // ─── src/18-routing.js ───
    // ==========================================
    // 6g. DOKĄD POJECHAŁ PRZEDMIOT (9.0.0)
    // ==========================================
    /**
     * Ustala, czy przedmiot został sprzedany, czy wysłany do utylizacji,
     * po kodzie sortowania.
     *
     * DLACZEGO TO OSOBNY AUTOMAT, A NIE SPRAWDZENIE W MOMENCIE ZAKOŃCZENIA.
     * Kod pojawia się na ekranie kiedy chce: przed wyzwalaczem końcowym, razem
     * z nim albo już po — byle przed początkiem następnego przedmiotu. Znaczy to,
     * że moment „poznaliśmy kierunek” i moment „przedmiot zaliczony” są
     * niezależne, a ich kolejność dowolna. Stąd dwie połowy stanu — zakończenie
     * i kierunek — oraz wpis do dziennika dopisywany wstecz.
     *
     * CZTERY SCENARIUSZE, KTÓRE TO POKRYWA:
     *   1. kod przyszedł PO +1  -> dopisujemy znak istniejącemu już wpisowi;
     *   2. kod przyszedł PRZED +1 -> czekamy, znak stawiamy przy tworzeniu wpisu;
     *   3. kod i +1 w jednej klatce -> kolejność wewnątrz scan() gwarantuje, że
     *      kierunek czyta się wcześniej niż licznik;
     *   4. kodu nie było wcale -> wpis zostaje neutralny (sign 0), do sumy nie
     *      wchodzi, ale widać go w linii 6 jako „?N”.
     *
     * DLACZEGO LICZY SIĘ WYSTĄPIENIA, A NIE ZWYKŁE `test()`.
     * Na ekranie jest dziennik, w którym kod wisi dalej po tym, jak zadziałał.
     * Proste sprawdzenie „czy kod jest w tekście” doczepiałoby stary kod do
     * następnego przedmiotu. Dlatego zapamiętuje się LICZBĘ wystąpień każdego
     * kodu, a zadziałanie liczy się dopiero wtedy, gdy ona WZROSŁA — czyli kod
     * pojawił się na nowo. Ta sama sztuczka przeżywa dwa jednakowe kody pod rząd,
     * czego nie wytrzymałoby proste „było/nie było”.
     */
    const Routing = {
        state: null,        // { completed, entryId, code, direction, pending }
        _prev: null,        // liczniki poprzedniego skanu
        /**
         * Niezamknięty Secondary-Sorting (9.1.0).
         *
         * Odwołanie do stanu przedmiotu, który dostał niejednoznaczny kod i nie
         * doczekał się jeszcze uściślenia. Żyje ODDZIELNIE od this.state
         * i przeżywa początek następnego przedmiotu: linia uściślająca czasem
         * przychodzi już po tym, jak na ekranie zmienił się ASIN, i tracić jej
         * nie wolno.
         */
        _ambiguous: null,

        codes() {
            return [...CONFIG.ROUTE_SELL_CODES, ...CONFIG.ROUTE_UNSELL_CODES,
                    CONFIG.ROUTE_AMBIGUOUS_CODE];
        },

        codeRegex() {
            if (this._re) return this._re;
            // Ucieczka znaków specjalnych jest tu obowiązkowa, a nie ozdobna:
            // kody trafiają do wzorca jako tekst, a wzorzec powstaje z łańcucha.
            // Bez tego kod z kropką albo nawiasem zmieniłby znaczenie wyrażenia.
            const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Malejąco po długości: inaczej krótki kod przechwyciłby dłuższy,
            // którego jest początkiem.
            const all = this.codes().slice().sort((a, b) => b.length - a.length).map(esc);
            this._re = new RegExp('Zeskanuj\\s*[-–—]?\\s*(' + all.join('|') + ')', 'gi');
            return this._re;
        },

        canon(raw) {
            const low = String(raw).toLowerCase();
            return this.codes().find(c => c.toLowerCase() === low) || raw;
        },

        countAll(text) {
            const m = new Map();
            const re = this.codeRegex(); re.lastIndex = 0;
            let x;
            while ((x = re.exec(text)) !== null) {
                const c = this.canon(x[1]);
                m.set(c, (m.get(c) || 0) + 1);
            }
            return m;
        },

        countRe(text, re) {
            re.lastIndex = 0;
            let k = 0;
            while (re.exec(text) !== null) k++;
            return k;
        },

        /**
         * Nowy przedmiot: zapominamy wszystko, co wiedzieliśmy o poprzednim.
         *
         * @param {string} reason — do konsoli.
         * @param {{closeAmbiguous?: boolean}} [opts] — closeAmbiguous mówi, że
         *   granica przedmiotu jest PRAWDZIWA (pojawiło się `poniżej`) i wiszący
         *   Secondary-Sorting pora zamknąć domyślnie. Zmiana ASIN taką granicą
         *   NIE jest: linia uściślająca może przyjść i po niej.
         */
        startItem(reason, opts = {}) {
            if (opts.closeAmbiguous) this.closeAmbiguous('do nowego przedmiotu nie było uściślenia');
            const prev = this.state;
            if (prev && prev.completed && !prev.direction && prev !== this._ambiguous) {
                Utils.log('[KIERUNEK] poprzedni przedmiot pozostał nieokreślony '
                        + '(kod sortowania tak i się nie pojawił)');
            }
            this.state = { completed: false, entryId: null, code: null,
                           direction: null, pending: false };
            if (reason) Utils.log(`[KIERUNEK] nowy przedmiot (${reason})`);
        },

        /**
         * SECONDARY-SORTING BEZ UŚCIŚLENIA = NIESPRZEDAŻ (9.1.0).
         *
         * Reguła jest niesymetryczna i nie jest to uproszczenie, tylko własność
         * samego systemu: potwierdzenie sprzedażowe `Przedmiot wysłano do
         * Transfer - Sellable` przychodzi ZAWSZE, a niesprzedażowe `Przedmiot
         * wysłano do FBATransfer` pojawia się nie za każdym razem. Znaczy to, że
         * „uściślenia nie było” może znaczyć dokładnie jedno — przedmiot pojechał
         * nie na sprzedaż.
         */
        closeAmbiguous(reason) {
            const a = this._ambiguous;
            this._ambiguous = null;
            if (!a || !a.pending) return;
            a.pending = false;
            a.direction = 'unsell';
            Utils.log(`[KIERUNEK] ${CONFIG.ROUTE_AMBIGUOUS_CODE} bez uściślenia -> NIESPRZEDAŻ (${reason})`);
            this.applyTo(a);
        },

        /** Czyta tekst strony i aktualizuje kierunek. Wołane przy każdym skanie. */
        observe(text) {
            const counts = this.countAll(text);
            const sellC = this.countRe(text, CONFIG.ROUTE_CONFIRM_SELL);
            const unsellC = this.countRe(text, CONFIG.ROUTE_CONFIRM_UNSELL);

            // Pierwszy skan tylko fotografuje stronę: wszystko, co już na niej
            // leży, jest przeszłością, a nie zdarzeniem.
            if (!this._prev) { this._prev = { counts, sellC, unsellC }; return; }

            for (const [code, k] of counts) {
                if (k > (this._prev.counts.get(code) || 0)) this.onCode(code);
            }
            if (sellC > this._prev.sellC) this.onConfirm('sell');
            if (unsellC > this._prev.unsellC) this.onConfirm('unsell');

            this._prev = { counts, sellC, unsellC };
        },

        onCode(code) {
            if (!this.state) this.startItem('kod przyszedł przed początkiem');
            this.state.code = code;
            if (code === CONFIG.ROUTE_AMBIGUOUS_CODE) {
                // Sam z siebie niczego nie rozstrzyga — czekamy na linię uściślającą.
                this.state.pending = true;
                this.state.direction = null;
                this._ambiguous = this.state;
                Utils.log(`[KIERUNEK] ${code} — czekam na uściślenie`);
            } else {
                this.state.pending = false;
                if (this._ambiguous === this.state) this._ambiguous = null;
                this.state.direction = CONFIG.ROUTE_SELL_CODES.includes(code) ? 'sell' : 'unsell';
                Utils.log(`[KIERUNEK] ${code} -> ${this.state.direction === 'sell' ? 'SPRZEDAŻ' : 'NIESPRZEDAŻ'}`);
                this.apply();
            }
        },

        onConfirm(dir) {
            // Uściślenie ma sens TYLKO po niejednoznacznym kodzie: linia
            // „Przedmiot wysłano do ...” występuje też sama z siebie.
            //
            // 9.1.0: cel wybiera się jawnie. Zwykle jest to bieżący przedmiot,
            // ale jeśli już się zmienił, a wisi niezamknięty Secondary-Sorting,
            // uściślenie dotyczy jego — inaczej linia, która przyszła o pół
            // sekundy po zmianie ASIN, przepadałaby na darmo.
            const target = (this.state && this.state.pending) ? this.state
                         : (this._ambiguous && this._ambiguous.pending) ? this._ambiguous
                         : null;
            if (!target) return;
            target.pending = false;
            target.direction = dir;
            if (this._ambiguous === target) this._ambiguous = null;
            Utils.log(`[KIERUNEK] uściślono: ${CONFIG.ROUTE_AMBIGUOUS_CODE} -> `
                    + (dir === 'sell' ? 'SPRZEDAŻ' : 'NIESPRZEDAŻ'));
            this.applyTo(target);
        },

        /**
         * Przedmiot zaliczony przez licznik: od tego momentu wolno zastosować sumę.
         * @param {string} entryId — id wpisu dziennika (nie indeks: dziennik jest
         *   wspólny na wszystkie karty i po scaleniu kolejność się zmienia).
         */
        onCompleted(entryId) {
            if (!this.state) this.startItem('zakończenie bez początku');
            this.state.completed = true;
            this.state.entryId = entryId;
            this.apply();
        },

        /**
         * Zapisuje znak, gdy znane są OBA warunki: przedmiot zaliczony i kierunek
         * ustalony. Kolejność ich wystąpienia nie ma znaczenia.
         */
        applyTo(st) {
            if (!st || !st.completed || !st.entryId || !st.direction) return;
            ValueLog.setDirection(st.entryId, st.direction, st.code);
        },
        apply() { this.applyTo(this.state); },

        info() {
            const st = this.state || {};
            const amb = this._ambiguous;
            return { kod: st.code || '—', kierunek: st.direction || 'nieokreślony',
                     'czeka na uściślenie': !!st.pending, 'przedmiot zaliczony': !!st.completed,
                     'wisi Secondary-Sorting': amb ? (amb === st ? 'bieżący przedmiot' : 'poprzedni przedmiot') : 'nie' };
        },
    };

    // ─── src/19-price-module.js ───
    // ==========================================
    // 6h. WŁĄCZNIK MODUŁU CEN (9.2.0)
    // ==========================================
    /**
     * Dwie operacje: „obudź sieć” i „uśpij sieć”. Woła je wyłącznie panel
     * ustawień oraz konsola (SH.priceOn() / SH.priceOff()).
     *
     * Sensem tego modułu jest to, że PIERWSZE w całym cyklu życia skryptu
     * zapytanie do sieci zewnętrznej wychodzi stąd i znikąd indziej. Dopóki
     * enable() nie zostanie wywołane, ani FxRates, ani KeepaOCR, ani PriceCard
     * nie mają prawa nawiązać połączenia — i każde z nich sprawdza to samodzielnie.
     */
    const PriceModule = {
        enable() {
            store.localTabConfig.priceCard.moduleEnabled = true;
            StorageManager.saveState();
            Utils.log('[MODUŁ CEN] włączony ręcznie — od tej chwili zapytania sieciowe są dozwolone.');
            // Kursy walut: jedno zapytanie, dalej z pamięci przez dobę.
            FxRates.init().then(() => bus.emit('valueLog:changed'));
            // Karta mogła być schowana — pokazujemy i pytamy o cenę tego, co na ekranie.
            if (PriceCard.el) PriceCard.applyStyle();
            PriceCard.check();
            PriceCard.refresh();
        },
        disable() {
            store.localTabConfig.priceCard.moduleEnabled = false;
            StorageManager.saveState();
            // Zapytania, które już lecą, dokończą się same — przerwać ich nie
            // ma czym, a nowe już nie wyjdą, bo wszystkie wejścia sprawdzają
            // priceModuleOn(). Pamięć wyników czyścimy, żeby po ponownym
            // włączeniu nie pokazać ceny sprzed godziny jako świeżej.
            PriceCard.cache.clear();
            if (PriceCard.el) PriceCard.applyStyle();
            Utils.log('[MODUŁ CEN] wyłączony — zapytania sieciowe wstrzymane.');
        },
    };

    // ─── src/20-price-card.js ───
    // ==========================================
    // 6b. PRICE CARD (karta ceny po ASIN)
    // ==========================================
    /**
     * Pokazuje cenę produktu, który jest właśnie obsługiwany.
     *
     * DLACZEGO TAK, A NIE PROŚCIEJ. Bezpośredni fetch na amazon.de ze strony
     * T-REX jest niemożliwy: Same-Origin Policy. Sprawdzone na żywo na obcej
     * domenie — blokuje się wszystko: zwykły fetch, XMLHttpRequest, no-cors
     * (oddaje opaque z pustym ciałem), iframe (odczyt rzuca SecurityError),
     * script src, a nawet widżety partnerskie amazon-adsystem, które niby są
     * stworzone do osadzania na cudzych stronach. Tampermonkey obchodzi to
     * wyłącznie dlatego, że GM_xmlhttpRequest wykonuje się w uprzywilejowanym
     * kontekście rozszerzenia, a nie w stronie.
     *
     * Dlatego źródła są dokładnie dwa:
     *   r.jina.ai       — oddaje nagłówki CORS, zwraca tekst strony;
     *   graph.keepa.com — obrazek, a obrazkowi CORS nie jest potrzebny z zasady.
     *
     * GŁÓWNA ZASADA: JEDNO ZAPYTANIE NA JEDEN ASIN. Logika ta sama, co
     * u licznika: `poniżej` daje dokładnie jeden przyrost — nowy ASIN daje
     * dokładnie jedno wejście do sieci. Pięć jednakowych przedmiotów pod rząd
     * (klient zwrócił pięć sztuk) odpracuje się jako pięć przedmiotów, ale
     * zapytanie pójdzie jedno.
     *
     * 9.2.0: nad tym wszystkim stoi jeszcze jeden warunek — moduł cen musi być
     * włączony ręcznie. Dopóki nie jest, ten moduł nie wysyła nic.
     */
    const PriceCard = {
        // asin -> {status, current, rrp, source, ms}. To nie pamięć cen: cena
        // pytana jest na nowo przy każdym przedmiocie (8.5.0). To ostatni znany
        // wynik, rysowany póki leci nowe zapytanie.
        // 9.1.0: rozmiar ograniczony, patrz _remember().
        cache: new Map(),
        inFlight: new Set(),
        shownAsin: null,
        // ASIN, dla którego właśnie trwa przegląd sklepów (8.6.0).
        searchingOther: null,
        awaiting: false,         // zaczął się nowy przedmiot, czekamy na ASIN
        requestCount: 0,
        // Obrazki Keepa liczą się osobno od zapytań tekstowych: mają własny,
        // hojniejszy limit (patrz CONFIG.PRICE_MAX_IMAGE_REQUESTS).
        imageCount: 0,
        nextSlotAt: 0,
        el: null,

        /**
         * Content-Security-Policy strony — DRUGA bariera, niezależna od CORS.
         * Wystawia ją serwer strony nagłówkiem albo meta-tagiem i obejść jej
         * z kodu strony nie da się w zasadzie: w tym cały sens CSP.
         *
         * Jeśli w polityce nie ma potrzebnego źródła, przeglądarka utnie
         * zapytanie jeszcze przed wyjściem w sieć. Wikipedia jest tu dobrym
         * przykładem: nie ma tam ani img-src, ani connect-src, wszystko spada
         * do `default-src 'self'` i nie ładuje się ani obrazek Keepa, ani
         * zapytanie do r.jina.ai.
         *
         * Zostawiać po cichu pustej ramki nie wolno — człowiek pomyśli, że skrypt
         * się zepsuł. Przeglądarka sama zgłasza blokadę zdarzeniem
         * securitypolicyviolation, po nim to rozpoznajemy.
         */
        csp: { img: false, net: false, notified: false },

        // ---------------- rozbiór odpowiedzi ----------------
        /**
         * Waluta to ścisła lista, a nie [A-Z]{3}. Złapane na stanowisku: szeroki
         * wzorzec wyciągnął „UTF 8.00” z linku ?ie=UTF8&nodeId=505048 i pokazał
         * to jako cenę. Grosze też są obowiązkowe: Amazon zawsze drukuje dwa
         * miejsca, a wymaganie części dziesiętnej odcina całą klasę śmieci.
         *
         * Jest to zarazem filtr bezpieczeństwa: wzorzec pracuje na tekście
         * ściągniętym z obcego serwisu, więc musi przepuszczać wyłącznie to,
         * co naprawdę wygląda jak kwota.
         */
        MONEY: String.raw`(?:(EUR|USD|GBP|PLN|CHF|SEK|DKK|NOK|CZK|HUF|RON)\s?|(€|\$|£|zł)\s?)(\d{1,3}(?:[., ]\d{3})*[.,]\d{2})`,

        normalize(currency, symbol, amount) {
            const cur = currency || symbol || '';
            let a = String(amount).replace(/[ \s]/g, '');
            const ld = a.lastIndexOf('.'), lc = a.lastIndexOf(',');
            if (ld >= 0 && lc >= 0) {
                a = lc > ld ? a.replace(/\./g, '').replace(',', '.') : a.replace(/,/g, '');
            } else if (lc >= 0) {
                a = (a.length - lc - 1) === 2 ? a.replace(',', '.') : a.replace(/,/g, '');
            }
            const n = parseFloat(a);
            return isNaN(n) ? null : { value: n, currency: cur, text: `${cur} ${n.toFixed(2)}` };
        },

        /**
         * Dwa tryby, a różnica jest zasadnicza. Odpowiedź adresowana
         * (z x-target-selector) to 350-1800 bajtów jednego bloku ceny i tam
         * pierwsze trafienie na kwotę jest ceną. Odpowiedź całą stroną to
         * 180-200 KB i pierwsze trafienie będzie śmieciem: w pomiarze taka
         * odpowiedź zawierała 12 różnych kwot. Dlatego na długim ciele cenę
         * bierze się TYLKO po kotwicy „… with N percent savings”.
         *
         * Pomiar na trzech produktach, czemu to ważne:
         *   Philips GU10  adresowo -> 15.08   stroną -> 17.04  (adresowo poprawnie)
         *   Tineco        oba tryby zgodne
         *   ARNOMED       adresowo 422, stroną ceny nie ma wcale
         */
        parseJina(text, targeted) {
            const body = text.split('Markdown Content:').pop() || '';
            const stale = /cached snapshot/i.test(text);
            // targeted przychodzi od dostawcy. Wcześniej ustalało się po długości
            // ciała (< 4000) i to kłamało: strona zgody na ciasteczka też jest
            // krótka, przez co zapasowa ścieżka „pierwsze trafienie” działała tam,
            // gdzie ceny nie ma w ogóle.
            const M = this.MONEY;

            const rrpM = body.match(new RegExp(String.raw`(?:RRP|UVP|Statt|List Price):\s*` + M, 'i'));
            const rrp = rrpM ? this.normalize(rrpM[1], rrpM[2], rrpM[3]) : null;

            const anchored = body.match(new RegExp(M + String.raw`\s+with\s+[\d.,]+\s+percent savings`, 'i'));
            let current = anchored ? this.normalize(anchored[1], anchored[2], anchored[3]) : null;

            if (!current && targeted) {
                const m = (body.split(/RRP:|UVP:|List Price:/i)[0]).match(new RegExp(M));
                if (m) current = this.normalize(m[1], m[2], m[3]);
            }
            if (!current && !rrp) return null;
            return { current, rrp, stale };
        },

        keepaUrl(asin, market) { return KeepaOCR.url(asin, market); },

        // ---------------- źródła ----------------
        providers() {
            const self = this;
            return [
                {
                    /**
                     * Cena odczytana z obrazka wykresu (8.4.0).
                     *
                     * Stoi PIERWSZA i jest włączona domyślnie: daje euro
                     * z niemieckiej witryny, nie wymaga klucza i nie chodzi ani
                     * na Amazona, ani przez obce proxy — tylko obrazek
                     * z graph.keepa.com, który skrypt i tak umie wczytać od 8.2.0.
                     *
                     * Działa też w trybie 'graph': obrazek jest potrzebny w obu
                     * przypadkach, różnica polega tylko na tym, czy się go
                     * pokazuje. Dzięki temu dziennik wartości napełnia się
                     * niezależnie od wybranego widoku.
                     */
                    name: 'keepa-ocr',
                    get available() {
                        const pc = store.localTabConfig.priceCard;
                        // Obrazek tnie CSP — nie ma czego czytać.
                        if (self.csp.img) return false;
                        return pc.source === 'ocr' || pc.source === 'graph' || !!pc.logValues;
                    },
                    isImage: true,
                    // Licznik prowadzi pętla w resolve(): dostawca nie powinien
                    // wiedzieć, jak urządzona jest ewidencja limitów (w 8.4.0-8.5.0
                    // liczył sam i jego zapytania trafiały DO OBU liczników naraz).
                    async run(asin, signal, market) {
                        const d = await KeepaOCR.read(asin, market);
                        if (!d) throw new Error('cena na wykresie nierozpoznana');
                        return self.buildOcrResult(d, market);
                    },
                },
                {
                    // Oficjalne API Keepa. CORS oddaje (sprawdzone: zapytanie
                    // z obcej domeny zwróciło czytelny JSON), potrzebny jest
                    // tylko płatny klucz. Gdy klucz się pojawi, stanie się to
                    // najlepszym źródłem: dokładna cena w euro z niemieckiej
                    // witryny, bez rozbierania szablonu strony.
                    name: 'keepa-api',
                    get available() { return !!CONFIG.PRICE_KEEPA_API_KEY; },
                    async run(asin, signal) {
                        const u = `https://api.keepa.com/product?key=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_KEY)}`
                                + `&domain=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_DOMAIN)}&asin=${encodeURIComponent(asin)}&stats=1&history=0`;
                        const r = await fetch(u, { signal });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        const j = await r.json();
                        const p = j.products && j.products[0];
                        if (!p) throw new Error('produktu nie znaleziono');
                        const cents = (v) => (typeof v === 'number' && v > 0) ? v / 100 : null;
                        const st = p.stats || {};
                        const cur = cents(st.current && st.current[1]) ?? cents(st.current && st.current[0]);
                        const rrp = cents(p.listPrice);
                        if (cur == null && rrp == null) throw new Error('w odpowiedzi nie ma cen');
                        const mk = (v) => v == null ? null : { value: v, currency: 'EUR', text: `EUR ${v.toFixed(2)}` };
                        return { current: mk(cur), rrp: mk(rrp), stale: false };
                    },
                },
                {
                    name: 'jina/blok',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    async run(asin, signal) {
                        const r = await fetch(`https://r.jina.ai/https://${marketplace().host}/dp/${encodeURIComponent(asin)}`, {
                            signal,
                            headers: {
                                'x-target-selector': CONFIG.PRICE_JINA_SELECTOR,
                                'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S),
                            },
                        });
                        // 422 = takiego bloku na stronie nie ma (inny szablon albo
                        // strona zgody na ciasteczka). To nie awaria łącza, tylko
                        // powód, żeby spróbować następnego trybu.
                        if (r.status === 422) throw new Error('nie ma bloku z ceną');
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), true);
                    },
                },
                {
                    name: 'jina/strona',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    async run(asin, signal) {
                        const r = await fetch(`https://r.jina.ai/https://${marketplace().host}/dp/${encodeURIComponent(asin)}`, {
                            signal,
                            headers: { 'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S) },
                        });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), false);
                    },
                },
            ];
        },

        // ---------------- sieć ----------------
        /**
         * Przerwa między zapytaniami. 8.3.0: slot rezerwuje się SYNCHRONICZNIE,
         * przed jakimkolwiek await.
         *
         * Wcześniej `lastRequestAt` zapisywało się PO śnie, więc dwa równoległe
         * resolve() czytały tę samą wartość, spały tyle samo i wychodziły w sieć
         * w tym samym momencie — przerwy nie było wcale.
         */
        respectRateLimit() {
            const now = Date.now();
            const slot = Math.max(now, this.nextSlotAt || 0);
            this.nextSlotAt = slot + CONFIG.PRICE_MIN_REQUEST_GAP_MS;
            const wait = slot - now;
            return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve();
        },

        /**
         * Limit czasu zapytania. 8.3.0: timer jest zdejmowany, a sam fetch
         * przerywany.
         *
         * Wcześniej setTimeout nie był czyszczony przy powodzeniu — na każde
         * zapytanie zostawał wiszący timer na 30 s — a „odpadły po timeoucie”
         * fetch dalej ciągnął odpowiedź: nie było czym go anulować.
         *
         * @param {(signal: AbortSignal) => Promise} run
         */
        withTimeout(run, ms) {
            const ctl = new AbortController();
            let timer = null;
            const limit = new Promise((_, rej) => {
                timer = setTimeout(() => { ctl.abort(); rej(new Error('przekroczony czas')); }, ms);
            });
            return Promise.race([Promise.resolve().then(() => run(ctl.signal)), limit])
                .finally(() => clearTimeout(timer));
        },

        /**
         * Wynik rozbioru obrazka do wspólnej postaci. Waluta bierze się z TEGO
         * rynku, z którego zdjęto cenę, a nie z wybranego: przy przeglądzie
         * sklepów to są różne rzeczy.
         */
        buildOcrResult(d, market) {
            const key = market || marketplaceKey();
            const cur = marketplace(key).currency;
            const mk = (v) => ({ value: v, currency: cur, text: `${cur} ${v.toFixed(2)}` });
            return {
                current: mk(d.top.value),
                rrp: null,
                secondary: d.second ? { text: d.second.text } : null,
                series: d.top.series,
                market: key,
                stale: false,
            };
        },

        /**
         * PRZEGLĄD POZOSTAŁYCH SKLEPÓW (8.6.0).
         *
         * Wywoływany tylko wtedy, gdy wybrany rynek ceny nie dał. Przechodzi
         * pozostałe rynki z danymi Keepa w LOSOWEJ kolejności, z sekundową
         * przerwą, i zwraca pierwszy sukces. Ustawienia sklepu nie rusza: to
         * jednorazowa próba dla jednego przedmiotu, następny znów zacznie od
         * wybranego.
         *
         * Losowa kolejność nie jest tu ozdobą: przy stałej kolejności całe
         * pudło zmiany szłoby w jeden i ten sam rynek zapasowy.
         */
        async tryOtherMarkets(asin) {
            const from = marketplaceKey();
            const pool = Object.keys(CONFIG.MARKETPLACES)
                .filter(k => k !== from && CONFIG.MARKETPLACES[k].keepa_ok);
            for (let i = pool.length - 1; i > 0; i--) {         // tasowanie Fishera-Yatesa
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            const tries = pool.slice(0, CONFIG.PRICE_FALLBACK_MAX_TRIES);
            Utils.log(`[CENA] ${asin}: na ${from} ceny nie ma, próbuję ${tries.join(', ')}`);

            for (const key of tries) {
                // 9.2.0: moduł mógł zostać wyłączony w trakcie przeglądu —
                // przerywamy natychmiast, zamiast dosyłać resztę zapytań.
                if (!priceModuleOn()) break;
                if (this.csp.img) break;
                if (this.imageCount >= CONFIG.PRICE_MAX_IMAGE_REQUESTS) {
                    Utils.log('[CENA] przegląd zatrzymany: limit obrazków');
                    break;
                }
                await new Promise(r => setTimeout(r, CONFIG.PRICE_FALLBACK_DELAY_MS));
                // ASIN mógł się zmienić w trakcie przeglądu — wtedy przegląd jest zbędny.
                if (this.shownAsin !== asin) {
                    Utils.log(`[CENA] ${asin}: przegląd przerwany, na ekranie jest już inny przedmiot`);
                    return null;
                }
                this.imageCount++;
                const t0 = Date.now();
                try {
                    const d = await this.withTimeout(
                        () => KeepaOCR.read(asin, key), CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                    if (d) {
                        const out = this.buildOcrResult(d, key);
                        Utils.log(`[CENA] ${asin}: znalezione na ${marketplace(key).host} — ${out.current.text}`);
                        return { status: 'ok', ...out, source: 'keepa-ocr', fallback: true, ms: Date.now() - t0 };
                    }
                    Utils.log(`[CENA] ${asin}: na ${key} ceny też nie ma`);
                } catch (e) {
                    Utils.log(`[CENA] ${asin}: ${key} — ${e.message}`);
                }
            }
            return null;
        },

        /**
         * Zapytać ponownie o cenę produktu, który jest teraz na ekranie
         * (po zmianie ustawień).
         *
         * Jeśli po tym ASIN już leci zapytanie, `inFlight` nowego nie przepuści
         * — i bez notatki o zamiarze odświeżenie PRZEPADŁOBY PO CICHU. Łapie się
         * to tak: przełączono sklep w trakcie zapytania i na ekranie zostałaby
         * cena poprzedniego rynku. Dlatego stawiamy flagę, a resolve() po
         * zakończeniu sam ponawia odświeżenie.
         */
        _refreshPending: null,
        refresh() {
            const asin = this.shownAsin;
            if (!asin) { this.render(); return; }
            if (this.inFlight.has(asin)) { this._refreshPending = asin; return; }
            this._refreshPending = null;
            this.resolve(asin, { manual: true });
        },

        /**
         * CENA PYTANA JEST NA NOWO PRZY KAŻDYM PRZEDMIOCIE (8.5.0).
         *
         * W 8.4.0 stała tu pamięć na pięć dób i powtórne spotkanie ASIN brało
         * cenę z magazynu. Okazało się to błędem: cena na Amazonie zmienia się
         * w ciągu dnia — przy weryfikacji wzorca produkt podrożał z 9,20 do 9,22
         * w kilka godzin — a więc i w obrębie jednej zmiany ten sam produkt może
         * kosztować różnie. Dziennik nabity wczorajszymi cenami daje błędną sumę,
         * a poznać tego po samej sumie nie sposób.
         *
         * Dlatego trwałej pamięci cen nie ma wcale. Mapa `cache` została, ale
         * jest teraz po prostu OSTATNIM WYNIKIEM do rysowania, a nie powodem,
         * żeby pominąć zapytanie: każdy nowy przedmiot idzie do sieci.
         *
         * Ochroną przed lawiną jest `inFlight`: póki zapytanie po tym ASIN leci,
         * drugie nie wychodzi. Częstotliwość ogranicza sam cykl obsługi: check()
         * rusza resolve() przy zmianie ASIN albo na początku nowego przedmiotu,
         * a nie przy każdej mutacji DOM.
         *
         * 9.2.0: pierwszym warunkiem jest moduł cen. To jest ta sama bariera, co
         * w KeepaOCR.loadImage(), postawiona świadomie dwa razy — na wejściu
         * i na wyjściu.
         */
        async resolve(asin, { manual = false } = {}) {
            if (!asin) return null;
            if (!priceModuleOn()) return null;
            if (this.inFlight.has(asin)) return null;


            // Ani jednego włączonego źródła — do sieci nie idziemy wcale.
            // To normalny stan w trybie 'legend': cenę widać na obrazku.
            if (!this.providers().some(p => p.available !== false)) {
                this._remember(asin, { status: 'off' });
                this.render();
                return null;
            }

            this.inFlight.add(asin);
            this.render();

            let result = { status: 'fail', reason: I18n.get('priceCard_noPrice') };
            try {
                let limitHit = false;
                for (const p of this.providers()) {
                    if (p.available === false) continue;
                    // Zdarzenie securitypolicyviolation przylatuje asynchronicznie,
                    // już po odmowie fetch, dlatego flagę sprawdzamy w każdym
                    // obiegu: inaczej następny dostawca zdążyłby wejść w zawczasu
                    // zablokowaną sieć.
                    if (this.csp.net) break;

                    /**
                     * LIMIT SPRAWDZA SIĘ PO TYPIE DOSTAWCY (poprawka 8.6.0).
                     *
                     * Wcześniej wspólny licznik requestCount rósł u WSZYSTKICH
                     * dostawców, łącznie z obrazkowym, a sprawdzenie stało JEDNO,
                     * przed pętlą, przeciwko limitowi tekstowemu. Osobny licznik
                     * obrazków, założony w 8.4.0, niczego przy tym nie rozstrzygał.
                     */
                    const isImg = !!p.isImage;
                    const used = isImg ? this.imageCount : this.requestCount;
                    const cap  = isImg ? CONFIG.PRICE_MAX_IMAGE_REQUESTS
                                       : CONFIG.PRICE_MAX_REQUESTS_PER_SESSION;
                    if (used >= cap) {
                        limitHit = true;
                        Utils.error(`[CENA] osiągnięto limit ${isImg ? 'obrazków' : 'zapytań tekstowych'}: `
                                  + `${used}/${cap}. Podnieść w locie: SH.setLimits({ ${isImg ? 'images' : 'text'}: ${cap * 2} })`);
                        continue;
                    }

                    try {
                        await this.respectRateLimit();
                        // Moduł mógł zostać wyłączony, póki czekaliśmy na slot.
                        if (!priceModuleOn()) break;
                        if (isImg) this.imageCount++; else this.requestCount++;
                        const t0 = Date.now();
                        const d = await this.withTimeout((signal) => p.run(asin, signal), CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                        if (d && (d.current || d.rrp)) {
                            result = { status: 'ok', ...d, source: p.name, ms: Date.now() - t0 };
                            Utils.log(`[CENA] ${asin} <- ${p.name} w ${result.ms} ms`,
                                      result.current && result.current.text);
                            break;
                        }
                        Utils.log(`[CENA] ${asin}: ${p.name} odpowiedział, ceny nie ma`);
                    } catch (e) {
                        Utils.log(`[CENA] ${asin}: ${p.name} — ${e.message}`);
                    }
                }

                if (limitHit && result.status !== 'ok') {
                    result = { status: 'fail', reason: I18n.get('priceCard_limit') };
                }

                // Ceny na wybranym rynku nie ma — próbujemy pozostałych.
                // Tylko dla źródła obrazkowego: r.jina.ai rozbiera szablon
                // konkretnej witryny i gonienie go po obcych rynkach nie ma sensu.
                const wantsFallback = CONFIG.PRICE_FALLBACK_ENABLED
                    && priceModuleOn()
                    && store.localTabConfig.priceCard.marketFallback !== false
                    && result.status !== 'ok'
                    && !limitHit
                    && !this.csp.img
                    && store.localTabConfig.priceCard.source !== 'jina';
                if (wantsFallback) {
                    this.searchingOther = asin;
                    this.render();
                    try {
                        const alt = await this.tryOtherMarkets(asin);
                        if (alt) result = alt;
                    } finally {
                        this.searchingOther = null;
                    }
                }
            } finally {
                this.inFlight.delete(asin);
                this._remember(asin, result);   // zapisujemy i sukces, i porażkę
                this.render();
                // Przedmiot mógł skończyć się wcześniej, niż przyjechała cena.
                if (result.status === 'ok' && result.current) ValueLog.fillPending(asin, result.current);
                // W trakcie zapytania ustawienia mogły się zmienić — doganiamy.
                if (this._refreshPending === asin) {
                    this._refreshPending = null;
                    setTimeout(() => this.refresh(), 0);
                }
            }
            return result;
        },

        /**
         * Zapamiętać wynik po ASIN, przycinając pamięć karty (9.1.0).
         *
         * Mapa trzyma kolejność wstawiania, więc „usuń i włóż od nowa” robi z niej
         * LRU: najdawniej niespotykany ASIN ląduje pierwszym kluczem i wychodzi
         * pierwszy. Do 9.1.0 Mapa rosła przez całą zmianę — przy tysiącu z górą
         * przedmiotów to zbędne megabajty w pamięci karty, która i tak żyje
         * dziesięć godzin bez przeładowania.
         */
        _remember(asin, result) {
            this.cache.delete(asin);
            this.cache.set(asin, result);
            const cap = CONFIG.PRICE_CACHE_MAX_ENTRIES;
            while (this.cache.size > cap) {
                const oldest = this.cache.keys().next().value;
                if (oldest === this.shownAsin) break;   // bieżącego nie wyrzucamy
                this.cache.delete(oldest);
            }
        },

        // ---------------- szukanie ASIN ----------------
        detectAsin() {
            for (const a of document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
                if (a.closest('#' + CONFIG.SCRIPT_ID_PREFIX + 'priceCard')) continue;
                const m = (a.getAttribute('href') || '').match(CONFIG.PRICE_ASIN_FROM_HREF);
                if (m) return m[1];
            }
            // Rezerwa po tekście — gdy linku na stronie nie ma wcale.
            //
            // Przyjmujemy ASIN TYLKO WTEDY, gdy jest na stronie jeden. Jeśli jest
            // ich kilka, ustalić bieżącego po tekście się nie da: kolejność
            // w dokumencie nic nie mówi o świeżości. Sprawdzone na stanowisku —
            // najpierw brało się pierwsze trafienie i karta cofała się do
            // najstarszego ASIN z dziennika, potem ostatnie — i czepiała się ASIN
            // z cudzego panelu stanu. Oba warianty kłamały, więc przy
            // niejednoznaczności uczciwiej nie zgadywać, tylko zostawić na karcie
            // ostatnie, co było wiadome na pewno.
            const prev = this.el && this.el.style.display;
            if (this.el) this.el.style.display = 'none';
            const text = document.body.innerText || '';
            if (this.el) this.el.style.display = prev || '';

            const all = text.match(new RegExp(CONFIG.PRICE_ASIN_FROM_TEXT.source, 'g'));
            if (!all || !all.length) return null;
            const uniq = [...new Set(all)];
            if (uniq.length > 1) {
                if (this._ambiguousWarned !== uniq.join()) {
                    this._ambiguousWarned = uniq.join();
                    Utils.log(`[CENA] linku nie ma, a w tekście od razu kilka ASIN (${uniq.join(', ')}) — nie zgaduję`);
                }
                return null;
            }
            return uniq[0];
        },

        /**
         * Czyta i rozbiera Content-Security-Policy strony.
         *
         * CSP to IMIENNA LISTA HOSTÓW, a nie wyłącznik. Częsty błąd: „mój skrypt
         * z githuba się załadował, czyli polityka jest miękka”. Nie — znaczy to
         * tylko tyle, że dozwolony jest właśnie tamten host. U Wikipedii na
         * przykład raw.githubusercontent.com na liście jest (potrzebny do
         * gadżetów), a graph.keepa.com i r.jina.ai nie.
         *
         * Polityka częściej przychodzi nagłówkiem HTTP niż meta-tagiem, dlatego
         * nagłówek doczytuje się zapytaniem o własną stronę: idzie ono na własny
         * origin i przechodzi nawet przy `connect-src 'self'`.
         *
         * 9.2.0: to jedyne zapytanie w pliku, które nie zależy od modułu cen —
         * bo nie wychodzi poza własną domenę i leci wyłącznie wtedy, gdy człowiek
         * sam wywoła SH.cspReport() z konsoli.
         */
        async readCsp() {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            let header = null, headerError = null;
            try {
                const r = await fetch(location.href, { method: 'GET', cache: 'no-store' });
                header = r.headers.get('content-security-policy')
                      || r.headers.get('content-security-policy-report-only');
            } catch (e) { headerError = e.message; }

            const raw = header || (meta && meta.content) || null;
            const directives = {};
            if (raw) {
                raw.split(';').forEach(part => {
                    const bits = part.trim().split(/\s+/).filter(Boolean);
                    if (bits.length) directives[bits[0].toLowerCase()] = bits.slice(1);
                });
            }
            return {
                raw,
                directives,
                source: header ? 'nagłówek HTTP' : (meta ? 'meta-tag' : null),
                headerError,
            };
        },

        /** Czy polityka pozwala na odwołanie do hosta w danej dyrektywie. */
        cspAllows(parsed, directive, host) {
            if (!parsed.raw) return 'nie ma polityki';
            const list = parsed.directives[directive] || parsed.directives['default-src'];
            if (!list) return 'dyrektywa nie ustawiona i default-src też — dozwolone';
            const used = parsed.directives[directive] ? directive : 'default-src (fallback)';

            // 8.3.0: rozbiór źródeł według gramatyki CSP. Poprzednia wersja umiała
            // tylko gołą nazwę hosta i kłamała na wszystkim innym: politykę typu
            // `img-src https:` (dopuszcza dowolne źródło https) ogłaszała
            // zakazującą, a `'none'` i `'self'` nie rozumiała w ogóle.
            // Diagnostyka, której nie można wierzyć, jest gorsza niż jej brak.
            if (list.some(s => s.toLowerCase() === "'none'")) {
                return `ZABRONIONE (wg ${used}: 'none')`;
            }
            const ok = list.some(src => {
                const s = String(src).trim();
                const low = s.toLowerCase();
                if (low === "'self'") return host === location.hostname;
                // Pozostałe słowa kluczowe w cudzysłowach ('unsafe-inline',
                // 'nonce-...', 'sha256-...') nie mają nic wspólnego z hostami.
                if (low.startsWith("'")) return false;
                if (s === '*') return true;
                // Sam schemat: `https:` dopuszcza dowolne źródło https.
                if (/^https?:$/i.test(s)) return true;
                const v = low.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
                if (v === '*') return true;
                if (v.startsWith('*.')) return host === v.slice(2) || host.endsWith(v.slice(1));
                return v === host;
            });
            return `${ok ? 'DOZWOLONE' : 'ZABRONIONE'} (wg ${used})`;
        },

        /** Zaczął się nowy przedmiot: ten sam ASIN ma pokazać się od nowa. */
        armNewItem() { this.awaiting = true; },

        /**
         * Zmiana ASIN jest samodzielnym wyzwalaczem, niezależnym od cyklu
         * przedmiotu.
         *
         * To ważne przy przerwanej obsłudze. Jeśli przedmiot porzucono, nie
         * dochodząc do `Przypisz nowy`, flaga itemInProgress zostaje wzniesiona
         * i następne `poniżej` NIE daje już przejścia false->true, czyli
         * armNewItem() nie zadziała. Karta i tak musi pokazać nowy produkt,
         * dlatego decyzja zapada po samym ASIN, a nie po stanie cyklu.
         *
         * awaiting potrzebny jest tylko do przypadku odwrotnego: ten sam ASIN
         * pod rząd (klient zwrócił pięć jednakowych rzeczy) — tam ASIN się nie
         * zmienia i przerysowanie wznosi właśnie początek nowego przedmiotu.
         */
        check() {
            // 9.2.0: przy wyłączonym module nie ma nawet po co szukać ASIN —
            // wynik i tak byłby użyty wyłącznie do zapytania sieciowego.
            if (!priceModuleOn()) return;
            const pc = store.localTabConfig.priceCard;
            /**
             * 8.5.0: kartę można SCHOWAĆ, nie wyłączając silnika.
             *
             * Potrzebne na zmiany, gdzie patrzeć na cenę nie ma po co, a znać
             * sumę pod koniec zmiany warto: obrazek się ładuje, cena jest
             * rozpoznawana, dziennik się napełnia, a na ekranie zostaje tylko
             * linia sumy w oknie statystyk. Dlatego warunkiem wyjścia nie jest
             * „karta niewidoczna”, tylko „i niewidoczna, i dziennik nieprowadzony”.
             */
            if (!pc.visible && !pc.logValues) return;
            const asin = this.detectAsin();
            if (!asin) return;

            const changed = asin !== this.shownAsin;
            if (!changed && !this.awaiting) return;

            if (changed && store.uiFlags.itemInProgress && this.shownAsin) {
                Utils.log(`[CENA] ASIN zmienił się na ${asin}, choć poprzedni przedmiot nie został zakończony`);
            }

            this.awaiting = false;
            const wasAsin = this.shownAsin;
            this.shownAsin = asin;
            if (changed && wasAsin !== null) bus.emit('price:asinChanged', { asin });
            Utils.log(`[CENA] ASIN na ekranie: ${asin}`, this.cache.has(asin) ? '(z pamięci)' : '(nowy)');
            this.render();
            this.resolve(asin);
        },

        // ---------------- interfejs ----------------
        init() {
            this.el = h('div', {
                id: 'priceCard',
                style: {
                    position: 'fixed', zIndex: '2147483641', boxSizing: 'border-box',
                    borderRadius: '10px', padding: '10px 14px',
                    fontFamily: CONFIG.FONT_FAMILY_OPTIONS.default,
                    transition: 'top .2s, left .2s, opacity .2s',
                    pointerEvents: 'none', userSelect: 'none',
                },
            });

            /**
             * ASIN — JEDYNY KLIKALNY ELEMENT KARTY (8.5.0).
             *
             * Karta jest przezroczysta dla myszy: `pointer-events:none` na niej
             * i na wszystkich dzieciach, żeby kliknięcia dochodziły do interfejsu
             * T-REX. Dla linku robi się dokładnie jeden wyjątek —
             * `pointer-events:auto` na samym elemencie. CSS na to pozwala:
             * potomek może odzyskać zdarzenia, nawet jeśli przodek ich nie
             * przyjmuje. Wszystko inne — cena, RRP, źródło, ramka wykresu —
             * zostaje przezroczyste dla kliknięć.
             *
             * Link prowadzi do /dp/<ASIN> w TYM SAMYM sklepie, z którego wykresu
             * wzięto cenę (patrz CONFIG.MARKETPLACES), inaczej sprawdzenie ceny
             * oczami traci sens: otworzyłaby się witryna innego kraju.
             */
            this.asinEl = h('a', {
                target: '_blank',
                rel: 'noopener noreferrer',
                title: '',
            });
            this.priceEl = h('div');
            this.rrpEl = h('div');
            this.srcEl = h('div');
            this.graphWrap = h('div');
            // no-referrer jest obowiązkowy. Keepa oddaje obrazek tylko wtedy, gdy
            // nagłówka Referer nie ma: z localhost i z każdą inną polityką
            // przychodzi błąd, bez referera — 500x200 w 79 ms.
            this.graphImg = h('img', { referrerPolicy: 'no-referrer' });
            this.graphWrap.appendChild(this.graphImg);
            this.el.append(this.asinEl, this.priceEl, this.rrpEl, this.srcEl, this.graphWrap);

            document.body.appendChild(this.el);
            this.applyStyle();

            // Przeciąganie włącza się z ustawień: dopiero wtedy karta przestaje
            // być przezroczysta i zaczyna łapać mysz.
            bus.on('store:changed:uiFlags.isPriceCardDragging', (d) => {
                if (d.value) {
                    this.el.style.pointerEvents = 'auto';
                    this.el.style.cursor = 'grab';
                    this.el.style.outline = '2px dashed #FFA500';
                    this.el.style.outlineOffset = '2px';
                } else {
                    this.el.style.pointerEvents = 'none';
                    this.el.style.cursor = 'default';
                    this.el.style.outline = 'none';
                }
                this.applyStyle();   // link włącza się i wyłącza razem z trybem
            });

            // Łapiemy blokady CSP po naszych własnych hostach.
            // 8.3.0: referencja do obsługi jest zapamiętana — potrzebna
            // w Main.teardown().
            this.onCspViolation = (e) => {
                const uri = String(e.blockedURI || '');
                if (!/graph\.keepa\.com|r\.jina\.ai|api\.keepa\.com/.test(uri)) return;

                const dir = e.effectiveDirective || e.violatedDirective || '';
                if (dir.startsWith('img')) this.csp.img = true;
                else this.csp.net = true;

                if (!this.csp.notified) {
                    this.csp.notified = true;
                    Utils.error(
                        'Polityka bezpieczeństwa strony (CSP) blokuje źródła ceny. ' +
                        'To ograniczenie serwera, ze skryptu nie da się go obejść. ' +
                        'Dyrektywa: ' + dir + ', adres: ' + uri);
                }
                this.applyStyle();
            };
            document.addEventListener('securitypolicyviolation', this.onCspViolation);

            // 8.3.0: włączono/wyłączono źródło tekstowe — wpisy 'off' w pamięci
            // przestały być prawdziwe.
            bus.on('store:changed:localTabConfig.priceCard.source', () => this.refresh());
            bus.on('store:changed:localTabConfig.priceCard.logValues', () => this.refresh());
            // Zmiana sklepu zmienia i wykres, i walutę — pytamy ponownie.
            bus.on('store:changed:userConfig.marketplace', () => { this.cache.clear(); this.refresh(); });

            // Nowy przedmiot — wznosimy pokaz (przypadek „pięć jednakowych pod rząd”).
            bus.on('store:changed:uiFlags.itemInProgress', (d) => { if (d.value === true) this.armNewItem(); });
            // Stronę skanuje AutoTrigger, osobnego obserwatora nie zakładamy.
            bus.on('page:scanned', () => this.check());
            // 8.3.0: karta zależy tylko od własnych ustawień i języka.
            onStorePaths(['localTabConfig.priceCard', 'userConfig.language'], () => this.applyStyle());

            this.check();
        },

        applyStyle() {
            if (!this.el) return;
            const pc = store.localTabConfig.priceCard;

            // 9.2.0: przy wyłączonym module karty nie ma na ekranie w ogóle —
            // pokazywałaby wyłącznie „—”, sugerując, że coś się liczy w tle.
            this.el.style.display = (pc.visible && priceModuleOn()) ? 'block' : 'none';
            this.el.style.width = `${Utils.clampNum(pc.width, 120, 1600, 280)}px`;
            this.el.style.left = pc.position.left || '14px';
            if (pc.position.top) { this.el.style.top = pc.position.top; this.el.style.bottom = 'auto'; }
            else { this.el.style.top = 'auto'; this.el.style.bottom = '14px'; }

            const rgb = Utils.hexToRgb(pc.bgColorHex);
            this.el.style.background = `rgba(${rgb}, ${Utils.clampNum(pc.bgAlpha, 0, 100, 88) / 100})`;
            this.el.style.border = '1px solid rgba(130,170,255,.40)';
            this.el.style.boxShadow = '0 6px 26px rgba(0,0,0,.55)';

            // WAŻNE: skrót `font:` wymaga podania rodziny, a `inherit` jest w nim
            // niedopuszczalny — przeglądarka po cichu wyrzuca CAŁĄ regułę.
            // Złapane na stanowisku: cena rysowała się 14px/400 zamiast 30px/800.
            // Dlatego właściwości ustawia się osobno.
            const fs = Utils.clampNum(pc.fontSize, 10, 96, 30);
            const px = (k) => Math.round(fs * k) + 'px';

            // pointer-events:auto — ten jedyny wyjątek od przezroczystej karty.
            // Przy włączonym przeciąganiu jest zdejmowany: wtedy ciągnie się całą
            // kartę, a kliknięcie w link wyprowadziłoby ze strony w środku gestu.
            const dragging = store.uiFlags.isPriceCardDragging;
            this.asinEl.style.cssText = [
                'font-family:Consolas,Monaco,monospace', 'font-weight:600',
                'font-size:' + px(0.46), 'line-height:1.3',
                'color:rgba(190,215,255,.9)', 'letter-spacing:.6px', 'text-transform:uppercase',
                'display:inline-block',
                'pointer-events:' + (dragging ? 'none' : 'auto'),
                'cursor:' + (dragging ? 'inherit' : 'pointer'),
                'text-decoration:underline', 'text-decoration-style:dotted',
                'text-underline-offset:2px',
            ].join(';');

            this.priceEl.style.cssText = [
                'font-weight:800', 'font-size:' + px(1), 'line-height:1.15',
                'margin:4px 0 2px', 'text-shadow:0 2px 8px rgba(0,0,0,.75)', 'letter-spacing:.3px',
            ].join(';');

            this.rrpEl.style.cssText = [
                'font-weight:600', 'font-size:' + px(0.52), 'line-height:1.35',
                'color:rgba(255,214,130,.95)',
            ].join(';');

            this.srcEl.style.cssText = [
                'font-family:Consolas,Monaco,monospace', 'font-size:' + px(0.36),
                'line-height:1.4', 'color:rgba(205,220,245,.6)', 'margin-top:4px',
            ].join(';');

            // Dwa różne tryby wyświetlania wykresu.
            //
            // PRZYCIĘCIE (domyślnie): obrazek NIE jest skalowany — wychodzi
            // w natywnych 500x200 i przesuwa się w lewo o brakującą szerokość.
            // Czyli zwężenie karty odcina wykres z lewej, a nie ściska go.
            // Wysokość zostaje stała, a tekst legendy piksel w piksel — właśnie
            // tak cena czyta się najlepiej. Legenda Keepa jest narysowana
            // w prawym górnym rogu, więc widać ją nawet wtedy, gdy z wykresu
            // zostaje jedna trzecia szerokości.
            //
            // BEZ PRZYCIĘCIA: wykres wpisuje się w szerokość karty w całości,
            // proporcjonalnie się zmniejszając.
            const inner = Utils.clampNum(pc.width, 120, 1600, 280) - 28;
            const W = CONFIG.PRICE_KEEPA_PNG_W, H = CONFIG.PRICE_KEEPA_PNG_H;
            const frame = (w, h) => `overflow:hidden;width:${w}px;height:${h}px;margin-top:8px;`
                + 'border-radius:5px;border:1px solid rgba(255,255,255,.18);background:#fff';

            if (pc.graphMode === 'legend') {
                // TYLKO BLOK Z CENAMI. Obrazek wychodzi w całości, ale okienko
                // pokazuje wyłącznie ramkę legendy, a ujemne marginesy podsuwają
                // potrzebny fragment pod to okienko.
                const LX = CONFIG.PRICE_KEEPA_LEGEND_X, LY = CONFIG.PRICE_KEEPA_LEGEND_Y;
                const LW = CONFIG.PRICE_KEEPA_LEGEND_W, LH = CONFIG.PRICE_KEEPA_LEGEND_H;
                const k = inner / LW;
                this.graphWrap.style.cssText = frame(inner, Math.round(LH * k));
                this.graphImg.style.cssText = [
                    `width:${Math.round(W * k)}px`, `height:${Math.round(H * k)}px`,
                    `margin-left:${-Math.round(LX * k)}px`, `margin-top:${-Math.round(LY * k)}px`,
                    'display:block', 'max-width:none',
                ].join(';');
            } else if (pc.graphMode === 'right') {
                // Prawa część w naturalnej wielkości: obrazek nie jest skalowany,
                // zwężenie karty odcina wykres z lewej. Okienko opiera się o 500px,
                // inaczej z prawej zostawałoby puste białe pole.
                const shift = Math.max(0, W - inner);
                this.graphWrap.style.cssText = frame(Math.min(inner, W), H);
                this.graphImg.style.cssText =
                    `width:${W}px;height:${H}px;margin-left:${-shift}px;margin-top:0;display:block;max-width:none`;
            } else {
                // Cały wykres wpisany w szerokość karty.
                this.graphWrap.style.cssText = frame(inner, Math.round(inner * H / W));
                this.graphImg.style.cssText =
                    `width:${inner}px;height:auto;margin-left:0;margin-top:0;display:block;max-width:none`;
            }
            // 8.4.0: ramka wykresu widoczna TYLKO w trybie 'graph'.
            // W trybie 'ocr' obrazek i tak się ładuje — czyta się z niego cenę —
            // ale żyje poza dokumentem, w offscreen-canvas, i na ekran nie trafia.
            // Obrazek tnie CSP — pustej ramki nie pokazujemy wcale.
            this.graphWrap.style.display =
                (pc.source === 'graph' && pc.showGraph && !this.csp.img && priceModuleOn()) ? 'block' : 'none';

            this.render();
        },

        render() {
            if (!this.el) return;
            const pc = store.localTabConfig.priceCard;
            const asin = this.shownAsin;

            if (!asin) {
                this.asinEl.textContent = I18n.get('priceCard_noAsin');
                this.asinEl.removeAttribute('href');   // nie ma czego otwierać
                this.asinEl.title = '';
                this.priceEl.textContent = '—';
                this.priceEl.style.color = 'rgba(255,255,255,.5)';
                this.rrpEl.textContent = ''; this.srcEl.textContent = '';
                this.graphWrap.style.display = 'none';
                return;
            }

            this.asinEl.textContent = `${asin}`;
            // Link prowadzi na TEN rynek, z którego zdjęto cenę. Jeśli znaleziono
            // ją przeglądem sklepów, to nie jest wybrany sklep i prowadzić do
            // wybranego nie wolno: człowiek otworzyłby amazon.de i nie zobaczył
            // tam pokazanej ceny.
            const found = this.cache.get(asin);
            const url = productUrl(asin, found && found.market);
            this.asinEl.setAttribute('href', url);
            this.asinEl.title = url;
            // !csp.img jest obowiązkowy także tutaj: applyStyle() ramkę chowa,
            // a render() wywołuje się później i bez tego sprawdzenia przywracałby ją.
            if (pc.source === 'graph' && pc.showGraph && !this.csp.img && priceModuleOn()) {
                this.graphWrap.style.display = 'block';
                const want = this.keepaUrl(asin, found && found.market);
                if (this.graphImg.getAttribute('src') !== want) this.graphImg.setAttribute('src', want);
            }

            if (this.inFlight.has(asin)) {
                // 8.5.0: cena pytana jest na nowo przy każdym przedmiocie, więc
                // „…” zamiast liczby migałoby bez przerwy. Jeśli poprzedni wynik
                // po tym samym ASIN jest — pokazujemy go przygaszony, a w linii
                // źródła piszemy, że trwa odświeżanie.
                const prev = this.cache.get(asin);
                if (prev && prev.status === 'ok' && prev.current && pc.showPrice) {
                    this.priceEl.style.display = 'block';
                    this.priceEl.textContent = prev.current.text;
                    this.priceEl.style.color = 'rgba(124,255,168,.45)';
                } else {
                    this.priceEl.style.display = 'block';
                    this.priceEl.textContent = '…';
                    this.priceEl.style.color = 'rgba(255,255,255,.65)';
                }
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                const hunting = this.searchingOther === asin;
                this.rrpEl.textContent = I18n.get(hunting ? 'priceCard_searchingOther' : 'priceCard_searching');
                this.srcEl.textContent = hunting ? '' : I18n.get('priceCard_refreshing');
                return;
            }

            const r = this.cache.get(asin);

            // KOLEJNOŚĆ GAŁĘZI JEST WAŻNA (8.3.0).
            //
            // W 8.2.0 sprawdzenie CSP stało WYŻEJ niż rozbiór statusu i było
            // zapisane jako `r.status === 'csp' || this.csp.img || this.csp.net`.
            // Przez to wystarczyła blokada OBRAZKA (img-src), żeby otrzymana już
            // cena była wyrzucana, a zamiast niej pokazywało się „—” z komunikatem
            // o zablokowanym wykresie. Kombinacja całkiem realna: CSP to imienna
            // lista hostów i connect-src spokojnie przepuszcza r.jina.ai, podczas
            // gdy img-src tnie graph.keepa.com.
            //
            // Teraz najpierw patrzymy, czy cena jest, a dopiero potem tłumaczymy,
            // czemu jej nie ma.

            // 1. Cena jest — pokazujemy, cokolwiek blokowałaby polityka.
            if (r && r.status === 'ok') {
                const price = r.current || r.rrp;
                this.priceEl.textContent = pc.showPrice && price ? price.text : '';
                this.priceEl.style.color = '#7CFFA8';
                this.priceEl.style.display = pc.showPrice ? 'block' : 'none';

                // Druga linia: albo prawdziwa RRP (daje ją tylko jina/keepa-api),
                // albo druga seria wykresu („Neu 11.49”). Przekreślenie stawia się
                // TYLKO przy RRP: przekreślona cena znaczy „stara”, a wieszanie
                // tego na żywej ofercie byłoby wprost dezinformacją.
                if (pc.showRrp && r.rrp) {
                    this.rrpEl.textContent = `${I18n.get('priceCard_rrp')} ${r.rrp.text}`;
                    this.rrpEl.style.textDecoration = 'line-through';
                    this.rrpEl.style.display = 'block';
                } else if (pc.showRrp && r.secondary) {
                    this.rrpEl.textContent = r.secondary.text;
                    this.rrpEl.style.textDecoration = 'none';
                    this.rrpEl.style.display = 'block';
                } else {
                    this.rrpEl.textContent = '';
                    this.rrpEl.style.textDecoration = 'none';
                    this.rrpEl.style.display = pc.showRrp ? 'block' : 'none';
                }

                const bits = [r.source];
                // Cena z OBCEGO rynku musi być widoczna jako taka, inaczej suma
                // za zmianę niepostrzeżenie zmiesza waluty i witryny.
                if (r.fallback && r.market) {
                    bits.push(I18n.get('priceCard_foundIn', { host: marketplace(r.market).host.replace(/^www\./, '') }));
                }
                bits.push(`${r.ms}ms`);
                if (r.stale) bits.push(I18n.get('priceCard_cached'));
                this.srcEl.textContent = bits.join(' · ');
                this.srcEl.style.color = r.fallback ? 'rgba(255,214,130,.85)' : 'rgba(205,220,245,.6)';
                return;
            }

            // 2. Ceny nie ma i coś tnie CSP — to właśnie jest przyczyna.
            if (this.csp.img || this.csp.net || (r && r.status === 'csp')) {
                const both = this.csp.img && this.csp.net;
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
                this.priceEl.style.color = '#FFC46B';
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                // W trybie 'ocr' blokada obrazka znaczy nie „nie ma wykresu”,
                // tylko „nie ma skąd przeczytać ceny” — dla człowieka to różne rzeczy.
                const ocrMode = pc.source === 'ocr';
                this.rrpEl.textContent = I18n.get(
                    both ? 'priceCard_cspBoth'
                         : (this.csp.img ? (ocrMode ? 'priceCard_cspOcr' : 'priceCard_cspImg')
                                         : 'priceCard_cspNet'));
                this.srcEl.textContent = 'CSP';
                return;
            }

            // 3. Źródła tekstowe wyłączone, obrazek żyje — cena jest na wykresie,
            //    linie ceny i RRP po prostu chowamy, żeby nie zawadzały.
            if (r && r.status === 'off') {
                this.priceEl.style.display = 'none';
                this.rrpEl.style.display = 'none';
                this.rrpEl.style.textDecoration = 'none';
                this.srcEl.textContent = I18n.get('priceCard_jinaOff');
                return;
            }

            // 4. Odpowiedzi jeszcze nie ma.
            if (!r) {
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
                this.priceEl.style.color = 'rgba(255,255,255,.5)';
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                this.rrpEl.textContent = '';
                this.srcEl.textContent = '';
                return;
            }

            // 5. Źródła odpracowały, ceny nie ma.
            this.priceEl.style.display = 'block';
            this.priceEl.textContent = '—';
            this.priceEl.style.color = '#FF9A9A';
            this.rrpEl.style.display = 'block';
            this.rrpEl.textContent = r.reason || I18n.get('priceCard_noPrice');
            this.rrpEl.style.textDecoration = 'none';
            this.srcEl.textContent = I18n.get('priceCard_seeChart');
        },

        stats() {
            const cap = (v) => (isFinite(v) ? String(v) : 'bez limitu');
            return {
                'moduł cen': priceModuleOn() ? 'włączony' : 'WYŁĄCZONY (sieć nieużywana)',
                'zapytań tekstowych': `${this.requestCount} / ${cap(CONFIG.PRICE_MAX_REQUESTS_PER_SESSION)}`,
                'obrazków Keepa': `${this.imageCount} / ${cap(CONFIG.PRICE_MAX_IMAGE_REQUESTS)}`,
                'ASIN w pamięci sesji': this.cache.size,
                'udanych': [...this.cache.values()].filter(r => r.status === 'ok').length,
                'na ekranie': this.shownAsin,
                'sklep': store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE,
            };
        },
    };

    // ─── src/21-input.js ───
    // ==========================================
    // 7. WEJŚCIE I WYZWALACZE
    // ==========================================
    const InputManager = {
        seqBuffer:[],
        init() {
            // 8.3.0: obsługa jest nazwana — potrzebna do Main.teardown().
            this.onKeyDown = (e) => {
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

                // AUTOPOWTARZANIE. Wciśnięty klawisz generuje keydown dziesiątki
                // razy na sekundę i do 8.3.0 każde takie zdarzenie dawało +1 do
                // licznika, z zapisem do localStorage. Dla licznika, dla którego
                // napisany jest cały skrypt, to wprost psucie danych roboczych:
                // prawy Shift, jeden z domyślnych wariantów, łatwo przycisnąć
                // przypadkiem. Hasło dostępu autopowtarzanie też zaśmieca.
                if (e.repeat) return;

                if (store.userConfig.keyboardShortcuts.INCREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.INCREMENT) {
                    this.modifyCounter(1); e.preventDefault();
                } else if (store.userConfig.keyboardShortcuts.DECREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.DECREMENT) {
                    this.modifyCounter(-1); e.preventDefault();
                }

                /**
                 * HASŁO DOSTĘPU (patrz SETTINGS_ACCESS_PASSWORD na górze pliku).
                 *
                 * Bufor ma dokładnie tyle znaków, ile hasło, i przesuwa się jak
                 * okno. Dzięki temu porównanie jest zawsze na stałej długości,
                 * a wpisywanie czegokolwiek innego wcześniej niczego nie psuje.
                 *
                 * To nie jest zabezpieczenie kryptograficzne i nie ma nim być:
                 * chodzi wyłącznie o to, żeby panel nie otwierał się przypadkiem
                 * podczas normalnej pracy ze skanerem.
                 */
                if (e.key.length === 1) {
                    this.seqBuffer.push(e.key.toUpperCase());
                    if (this.seqBuffer.length > CONFIG.SETTINGS_PANEL_ACCESS_SEQUENCE.length) this.seqBuffer.shift();
                    if (this.seqBuffer.join('') === CONFIG.SETTINGS_PANEL_ACCESS_SEQUENCE.join('')) {
                        SettingsPanel.toggle();
                        this.seqBuffer =[];
                    }
                }
            };
            document.addEventListener('keydown', this.onKeyDown, true);
        },
        modifyCounter(delta) {
            const cid = store.currentTabInstanceId;
            const cur = store.tabCounters[cid] || 0;
            const next = Math.max(0, cur + delta);
            store.tabCounters[cid] = next;
            StorageManager.saveCounter(cid, next);
            // Przerysowanie wywołuje sam zapis do stanu (onStorePaths po
            // 'tabCounters'), więc jawnego wywołania renderContent() już tu nie ma:
            // dawało dwa pełne rendery na każdy przedmiot.
        }
    };

    const AutoTrigger = {
        observer: null,
        debouncedScan: null,

        /**
         * Czy węzeł należy do własnego interfejsu skryptu.
         *
         * To kluczowa poprawka 8.1.0. Okno statystyk, nakładka, wskaźnik i panel
         * ustawień leżą w tym samym document.body, który obserwuje observer.
         * Strony, dla których pisany był skrypt, przez całą zmianę są statyczne —
         * czyli praktycznie JEDYNYM źródłem mutacji był sam skrypt, który
         * przerysowuje statystykę raz na sekundę. Każda taka mutacja uruchamiała
         * scan() z odczytem document.body.innerText, a to wymuszone przeliczenie
         * geometrii całej strony, jedna z najdroższych operacji w DOM.
         */
        isOwnNode(node) {
            if (!node) return false;
            const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            if (!el || typeof el.closest !== 'function') return false;
            return !!el.closest(`[id^="${CONFIG.SCRIPT_ID_PREFIX}"]`);
        },

        attach() {
            if (this.observer) this.observer.disconnect();

            const delay = Number(store.userConfig.triggerMutationDebounceMs) || CONFIG.DEFAULT_TRIGGER_MUTATION_DEBOUNCE_MS;
            this.debouncedScan = Utils.debounce(() => this.scan(), delay);

            this.observer = new MutationObserver((mutations) => {
                // Paczka złożona w całości z naszych własnych zmian jest pomijana.
                if (mutations.every(m => this.isOwnNode(m.target))) return;
                this.debouncedScan();
            });

            const root = document.querySelector(CONFIG.TRIGGER_OBSERVE_AREA_SELECTOR) || document.body;
            this.observer.observe(root, { childList: true, subtree: true, characterData: true });
        },

        init() {
            this.attach();
            // 8.1.0: odtwarzanie observera opakowane w debounce. Wcześniej wisiało
            // na „surowej” zmianie stanu i przeciąganie suwaka interwału skanowania
            // wywoływało dziesiątki disconnect/observe pod rząd.
            bus.on('store:changed:userConfig.triggerMutationDebounceMs',
                Utils.debounce(() => this.attach(), 500));
        },

        scan() {
            const txt = document.body.innerText || '';
            /**
             * Kierunek czyta się PIERWSZY i to jest ważne (9.0.0).
             *
             * Kod sortowania i wyzwalacz końcowy nierzadko lądują w jednej klatce:
             * ekran przerysował się w całości i „Przypisz nowy”, i „Zeskanuj
             * CRITS-POZ1” widać jednocześnie. Odczytawszy kierunek przed
             * licznikiem, zdążymy postawić znak wprost w momencie tworzenia wpisu,
             * zamiast doganiać go następnym skanem.
             */
            Routing.observe(txt);

            if (CONFIG.PRE_TRIGGER_REGEX.test(txt)) store.uiFlags.itemInProgress = true;
            if (CONFIG.AUTO_TRIGGER_REGEX.test(txt)) {
                if (store.uiFlags.itemInProgress && !store.uiFlags.autoTriggerFound) {
                    InputManager.modifyCounter(1);
                    store.uiFlags.autoTriggerFound = true;
                    store.uiFlags.itemInProgress = false;
                    // 8.4.0: przedmiot przeszedł PEŁNĄ ścieżkę — dopiero teraz jego
                    // wartość trafia do dziennika. Zdarzenie emituje się właśnie
                    // tutaj, a nie w modifyCounter(): skróty klawiszowe i ręczna
                    // poprawka licznika dziennika nie napełniają.
                    bus.emit('item:completed');
                }
            } else {
                store.uiFlags.autoTriggerFound = false;
            }
            // Karta ceny korzysta z tego skanu zamiast własnego obserwatora
            // i drugiego odczytu document.innerText.
            bus.emit('page:scanned');
        }
    };

    // ─── src/22-bootstrap.js ───
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
                    if (entryId) Routing.onCompleted(entryId);
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

    // ─── src/23-presets.js ───
// ==========================================
    // 9. USTAWIENIA PRACOWNIKA (KONFIGURACJA OSOBISTA)
    // ==========================================


///POCZĄTEK KONFIGURACJI UŻYTKOWNIKA
/*
        const originalInit = Main.init;

        Main.init = function() {
        // 1. Wołamy oryginalny rdzeń (wczytanie pamięci, rozpoznanie zmiany)
        originalInit.call(Main);

        // 2. WYMUSZONA PRZERWA NR 4

        // Indeks 3 dla zmiany dziennej (12:50-13:20), indeks 7 dla nocnej (00:50-01:20)
        // indeksy 0-3 dla dziennej, indeksy 4-7 dla nocnej
        const isNight = store.sessionConfig.shiftType === 'night';
        store.sessionConfig.selectedLunchIndex = isNight ? 7 : 3;

        // 3. USTAWIENIA INDYWIDUALNE ZALEŻNE OD BIEŻĄCEGO DZIAŁU
        const tab = store.currentTabType; // 'CRET', 'REFURB', 'WHD' albo 'UNKNOWN'

        if (tab === 'CRET') {
            // --- Przykład: ustawienia dla karty CRET ---

            // Włączamy tylko linię 1 i linię 2
            store.localTabConfig.linesConfig.line1_currentTab.visible = true;
            store.localTabConfig.linesConfig.line2_globalSummary.visible = true;
            store.localTabConfig.linesConfig.line3_shiftInfo.visible = false;
            store.localTabConfig.linesConfig.line4_lunchInfo.visible = false;
            store.localTabConfig.linesConfig.line5_realTimeClock.visible = false;
            store.localTabConfig.linesConfig.line7_compact.visible = false;

            // Linia 1: przezroczystość 53%, kolor czarny (#000000)
            store.localTabConfig.linesConfig.line1_currentTab.alpha = 53;
            store.localTabConfig.linesConfig.line1_currentTab.colorHex = '#000000';

            // Linia 2: włączyć wielokolor i ustawić własne kolory
            store.localTabConfig.linesConfig.line2_globalSummary.multicolor = true;
            store.localTabConfig.linesConfig.line2_globalSummary.customColors.CRET = '#0078D7';
            store.localTabConfig.linesConfig.line2_globalSummary.customColors.REFURB = '#FF0000';
            store.localTabConfig.linesConfig.line2_globalSummary.customColors.WHD = '#FF0000';

            // Pozycja okna na ekranie (lewy górny róg z niewielkim odstępem)
            store.localTabConfig.statsWindowPosition.top = '15px';
            store.localTabConfig.statsWindowPosition.left = '15%';

            // Globalne zaznaczenia
            store.userConfig.globalStatsContributionKnown.CRET = true;
            store.userConfig.globalStatsContributionKnown.REFURB = true;
            store.userConfig.globalStatsContributionKnown.WHD = true;

        } else if (tab === 'REFURB') {
            // --- Przykład: ustawienia dla karty REFURB ---
            store.localTabConfig.linesConfig.line1_currentTab.visible = true;
            store.localTabConfig.linesConfig.line1_currentTab.colorHex = '#FFA500'; // pomarańczowy
            store.localTabConfig.linesConfig.line1_currentTab.alpha = 100; // pełna nieprzezroczystość

            // Liczyć do sumy globalnej wszystko
            store.userConfig.globalStatsContributionKnown.CRET = true;
            store.userConfig.globalStatsContributionKnown.REFURB = true;
            store.userConfig.globalStatsContributionKnown.WHD = true;
        }

        // 4. Utrwalenie stanu (gwarantuje zapis do localStorage i render)
        StorageManager.saveState();
    };

*/
// można zdjąć komentarz i dopisać własne ustawienia


///KONIEC KONFIGURACJI UŻYTKOWNIKA


    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Main.init());
    else Main.init();

})();

/* =============================================================================
   PEŁNA ŚCIĄGA KONFIGURACYJNA — WSZYSTKIE USTAWIENIA DO ZMIANY POD SIEBIE
   =============================================================================

   JAK Z TEGO KORZYSTAĆ
   --------------------
   Są trzy sposoby i różnią się tym, jak długo zmiana żyje.

   1. PANEL USTAWIEŃ (najprostszy, nic nie trzeba edytować).
      Wpisz na stronie hasło — domyślnie GORDONPAULE — a panel się otworzy.
      Wszystko, co tam zmienisz, zapisze się w przeglądarce i przeżyje F5.
      Hasło zmienia się w JEDNEJ linii na samej górze pliku:
          const SETTINGS_ACCESS_PASSWORD = 'GORDONPAULE';

   2. KONSOLA (na próbę, do najbliższego przeładowania strony).
      Po uruchomieniu skryptu dostępny jest obiekt SH, np.:
          SH.store.localTabConfig.linesConfig.line7_compact.fontSize = 16;
          SH.StorageManager.saveState();      // żeby zapisać na stałe
          SH.priceOn();                       // włączyć moduł cen (sieć!)
          SH.priceOff();                      // wyłączyć moduł cen
          SH.priceStats();                    // ile zapytań poszło
          SH.fxStatus();                      // skąd wzięte kursy walut
          SH.valueReport();                   // dziennik wartości do konsoli

   3. EDYCJA PLIKU (na stałe, dla siebie).
      Skopiuj plik, zmień wartości w blokach DEFAULT_LINE_CONFIG,
      DEFAULT_LOCAL_CONFIG i CONFIG albo odkomentuj blok
      „KONFIGURACJA UŻYTKOWNIKA” powyżej i wpisz tam swoje ustawienia.

   UWAGA O ZAPISANYCH USTAWIENIACH: wartości domyślne z pliku działają tylko
   przy PIERWSZYM uruchomieniu. Potem pierwszeństwo ma to, co zapisane
   w przeglądarce. Żeby wrócić do domyślnych: panel ustawień -> „Zresetuj
   wszystkie dane”.

   -----------------------------------------------------------------------------
   MODUŁ CEN — NAJWAŻNIEJSZE USTAWIENIE
   -----------------------------------------------------------------------------
   store.localTabConfig.priceCard.moduleEnabled = false;
       false (domyślnie) — skrypt NIE wysyła żadnych zapytań do internetu.
       true              — wolno pobierać kursy walut i ceny z Keepa/r.jina.ai.
       Włącza się to w panelu ustawień (sekcja „Moduł cen”) albo SH.priceOn().

   -----------------------------------------------------------------------------
   LOGI W KONSOLI — DRUGIE NAJWAŻNIEJSZE USTAWIENIE
   -----------------------------------------------------------------------------
   const SCRIPT_LOGS_ENABLED = false;      // druga linia od góry pliku
       false (domyślnie) — skrypt nie pisze do konsoli NIC.
       true              — pełny dziennik: każdy przedmiot, kierunek, cena, kurs.

   W locie, bez przeładowania strony:
       SH.logsOn()    włącz logi
       SH.logsOff()   wyłącz logi
       SH.logs()      sprawdź, czy są włączone

   Wyjątek: awaria startu skryptu wypisuje się ZAWSZE (Utils.fatal), bo cicha
   awaria wygląda jak „nic się nie stało”.

   -----------------------------------------------------------------------------
   LINIE OKNA STATYSTYK  (store.localTabConfig.linesConfig.<linia>)
   -----------------------------------------------------------------------------
   Każda linia ma te same cztery pola:
       visible   — true / false      (czy pokazywać)
       colorHex  — '#RRGGBB'         (kolor tekstu)
       alpha     — 0..100            (przezroczystość w procentach)
       fontSize  — 8..36             (rozmiar czcionki w px)

   line1_currentTab      statystyka bieżącej karty       domyślnie: OFF, #808080, 60%, 14px
   line2_globalSummary   podsumowanie wszystkich kart    domyślnie: OFF, #808080, 60%, 14px
   line3_shiftInfo       rodzaj i początek zmiany        domyślnie: OFF, #808080, 60%, 14px
   line4_lunchInfo       wybrana przerwa                 domyślnie: OFF, #808080, 60%, 14px
   line5_realTimeClock   zegar                           domyślnie: OFF, #808080, 60%, 14px
   line6_valueSum        bilans pieniężny zmiany         domyślnie: OFF, #7CFFA8, 85%, 14px
   line7_compact         dwie liczby: wydajność i sztuki domyślnie: ON,  #808080, 50%, 13px

   Linia 2 ma dodatkowo:
       multicolor    — true/false, kolorowanie działów osobnymi kolorami
       customColors  — { CRET: '#0078D7', REFURB: '#FFA500', WHD: '#1EB41E' }

   Linia 6: picker koloru działa tylko na liczbę sztuk. Plus zawsze zielony,
   minus zawsze czerwony — po tym rozpoznaje się znak.

   Linia 7: pokazuje dokładnie dwie liczby oddzielone spacją, np. „17.4 28”.
   Pierwsza to paczki na godzinę (suma ze wszystkich wliczanych kart), druga to
   liczba zrobionych sztuk. Nic więcej się tam nie da dodać bez zmiany kodu.

   -----------------------------------------------------------------------------
   OKNO STATYSTYK  (store.localTabConfig)
   -----------------------------------------------------------------------------
   statsWindowPosition = { top: '', left: '20px', bottom: '8px' }
       Domyślnie lewy dolny róg: 20 px od lewej, 8 px od dołu.
       Puste `top` = trzymaj się dołu (liczy się `bottom`).
       Żeby przykleić do góry: { top: '15px', left: '20px', bottom: '' }
       Wartości mogą być w px, % albo calc(), np. left: 'calc(17% - 1px)'.
   statsWindowBgColorHex = '#ffffff'      tło okna
   statsWindowBgAlpha    = 0              0 = całkiem przezroczyste
   statsWindowFontFamily = 'monospace'    'default' | 'monospace' | 'sans_serif_thin'
   pageOverlayOpacity      = 0            0..15, kolorowa nakładka na całą stronę
   pageIndicatorTextVisible = false       wielki napis z nazwą działu z boku ekranu

   -----------------------------------------------------------------------------
   KARTA CENY  (store.localTabConfig.priceCard) — działa tylko przy moduleEnabled
   -----------------------------------------------------------------------------
   visible    = true          pokazywać kartę na ekranie
   source     = 'ocr'         'ocr' (cena tekstem z wykresu) | 'graph' | 'jina'
   logValues  = true          prowadzić dziennik wartości
   marketFallback = true      szukać ceny w innych sklepach, gdy w wybranym brak
   showPrice  = true          pokazywać aktualną cenę
   showRrp    = true          pokazywać cenę katalogową / drugą serię
   showGraph  = true          pokazywać obrazek wykresu (tylko przy source 'graph')
   graphMode  = 'legend'      'legend' (same ceny) | 'right' | 'full'
   width      = 280           170..900 px
   fontSize   = 30            14..48 px
   bgColorHex = '#0a0e18'     tło karty
   bgAlpha    = 88            0..100
   position   = { left: '14px', top: '' }   puste top = przy dole ekranu

   -----------------------------------------------------------------------------
   USTAWIENIA WSPÓLNE DLA WSZYSTKICH KART  (store.userConfig)
   -----------------------------------------------------------------------------
   language    = 'pl'         'pl' | 'en' | 'ru'
   marketplace = 'de'         'de' | 'co.uk' | 'com' | 'it' | 'fr' | 'es' | 'nl'
                              | 'ca' | 'se' | 'com.be' | 'pl'
                              (Keepa nie ma danych dla 'pl' — link zadziała, cena nie)
   globalStatsContributionKnown = { CRET: true, REFURB: true, WHD: true }
                              które działy wliczają się do sumy w liniach 2 i 7
   keyboardShortcuts = { INCREMENT: 'None', DECREMENT: 'None' }
                              'None' | 'ShiftRight' | 'ControlRight' | 'AltRight'
                              | 'ScrollLock' | 'Pause' | 'Insert' | 'Numpad0'
                              | 'NumpadMultiply' | 'NumpadSubtract' | 'NumpadAdd' | 'F10'
   triggerMutationDebounceMs = 50     50..200, jak często skanować stronę
   settingsPanelWidth        = 450    szerokość panelu ustawień w px

   -----------------------------------------------------------------------------
   STAŁE W CONFIG (zmiana wymaga edycji pliku)
   -----------------------------------------------------------------------------
   SCRIPT_VERSION             podstawiany przy budowaniu z package.json
   SCRIPT_ID_PREFIX = 'statsHelper_v1_0_0_'
       Prefiks wszystkich kluczy w localStorage. Koduje SCHEMAT danych, a nie
       numer wydania: 1.1.0 i 1.2.0 zostaną przy 'v1_0_0', dopóki układ
       zapisywanych pól się nie zmieni. Zmiana prefiksu = start od zera
       (stare ustawienia i liczniki przestają być widoczne).
   DEBUG_MODE = false         bierze się z SCRIPT_LOGS_ENABLED z góry pliku;
                              tu jest wartość startowa, SH.logsOn() zmienia ją w locie
   UI_UPDATE_INTERVAL_MS = 1000   jak często odświeża się okno (linia 7 też)
   DEFAULT_LANGUAGE = 'pl'
   DEFAULT_MARKETPLACE = 'de'
   DEFAULT_LUNCH_INDEX_DAY = 3        przerwa domyślna dla zmiany dziennej (0-3)
   DEFAULT_LUNCH_INDEX_NIGHT = 7      przerwa domyślna dla zmiany nocnej (4-7)
   SHIFT_TIMES_LOCAL                  granice zmian wg czasu lokalnego
   DEFAULT_CALCULATION_START_TIMES    od której godziny liczy się wydajność
   PRE_TRIGGER_REGEX                  co oznacza POCZĄTEK przedmiotu
   AUTO_TRIGGER_REGEX                 co oznacza KONIEC przedmiotu (+1 do licznika)
   ROUTE_SELL_CODES / ROUTE_UNSELL_CODES   kody sortowania: sprzedaż / utylizacja
   PRICE_MIN_REQUEST_GAP_MS = 3000    minimalna przerwa między zapytaniami
   PRICE_FALLBACK_MAX_TRIES = 5       ile sklepów zapasowych sprawdzać
   FX_FALLBACK                        kursy wbudowane, używane bez sieci
   PRICE_KEEPA_API_KEY = ''           płatny klucz Keepa (opcjonalny)

   -----------------------------------------------------------------------------
   PRZYKŁAD: „chcę tylko linię 7, ale większą i bardziej widoczną”
   -----------------------------------------------------------------------------
   W bloku DEFAULT_LINE_CONFIG:
       line7_compact: { visible: true, colorHex: '#FFFFFF', alpha: 80, fontSize: 18 }
   albo w konsoli, bez edycji pliku:
       SH.store.localTabConfig.linesConfig.line7_compact.fontSize = 18;
       SH.store.localTabConfig.linesConfig.line7_compact.alpha = 80;
       SH.StorageManager.saveState();

   PRZYKŁAD: „przenieść okno do prawego dolnego rogu”
       SH.store.localTabConfig.statsWindowPosition = { top: '', left: 'calc(100% - 200px)', bottom: '8px' };
       SH.StatsWindowRenderer.applyPosition();
       SH.StorageManager.saveState();

   PRZYKŁAD: „włączyć ceny na jedną zmianę i potem wyłączyć”
       SH.priceOn();     // pobiera kursy i zaczyna pytać o ceny
       SH.priceOff();    // koniec zapytań, karta znika

   PRZYKŁAD: „coś nie działa, chcę zobaczyć, co skrypt robi”
       SH.logsOn();      // od tej chwili konsola pokazuje każdy krok
       SH.logsOff();     // z powrotem cisza

   ============================================================================= */
