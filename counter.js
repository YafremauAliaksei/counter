// ==UserScript==
// @name         StatsHelper (Reactive Architecture Edition)
// @namespace    statshelper.counter
// @version      1.4.1
// @description  Stan reaktywny + EventBus + zmienne CSS. Licznik przetworzonych przedmiotów dla TREX.
// @match        https://trex-prod-eu.aka.amazon.com/*
// @run-at       document-end
// @sandbox      raw
// ==/UserScript==

// =====================================================================
//  HASŁA DOSTĘPU DO PANELU USTAWIEŃ
//  ---------------------------------------------------------------
//  Wpisane gdziekolwiek na stronie (poza polem tekstowym) otwiera panel.
//  Wszystkie hasła są równorzędne. Wielkość liter i białe znaki z brzegów
//  nie mają znaczenia, powtórzenia są pomijane.
//
//  Hasło nie może być początkiem innego hasła: przy 'BOM' i 'BOMBA'
//  'BOM' zadziała po trzeciej literze i wyczyści bufor, więc 'BOMBA'
//  nie da się wpisać nigdy. Pilnuje tego tests/18-passwords.test.js.
// =====================================================================
const SETTINGS_ACCESS_PASSWORDS = ['GORDONPAULE', 'BOMBA'];

// =====================================================================
//  LOGI W KONSOLI — GŁÓWNY WYŁĄCZNIK
//  ---------------------------------------------------------------
//  false (domyślnie) — skrypt nic nie pisze do konsoli.
//  true              — pełny dziennik pracy: karta, zmiana, każdy
//                      przedmiot, kierunek sortowania, ceny, kursy.
//
//  Domyślnie wyłączone, bo przy kilku liniach na przedmiot zmiana daje
//  tysiące wpisów, a konsola trzyma w pamięci każdy przekazany obiekt —
//  karta puchnie, choć nikt do konsoli nie patrzy.
//
//  Przełączanie w locie: SH.logsOn(), SH.logsOff(), SH.logs() (stan).
//
//  Awaria startu (Utils.fatal) jest wypisywana zawsze, niezależnie od
//  tego ustawienia — nieudany start nie może wyglądać jak cisza.
// =====================================================================
/** @type {boolean} */
const SCRIPT_LOGS_ENABLED = false;

// ---------------------------------------------------------------------
//  Uruchomienie: wklejenie pliku do konsoli DevTools (F12) albo zakładka
//  z README. Nagłówek ==UserScript== jest tylko opisem — API menedżera
//  skryptów (GM_*) nie jest używane, stan leży w localStorage
//  i sessionStorage.
//
//  Zachowanie domyślne: jedna szara linia w lewym dolnym rogu, liczba
//  przedmiotów ze wszystkich otwartych kart, zero zapytań do sieci, zero
//  linii w konsoli. Moduł cen i pozostałe linie włącza się ręcznie.
//
//  TEN PLIK JEST ARTEFAKTEM. Powstaje z modułów w src/ poleceniem
//  `npm run build`; ręczne poprawki tutaj zostaną nadpisane, a CI je
//  odrzuci. Znaczniki `// ─── src/xx-nazwa.js ───` pokazują, z którego
//  modułu pochodzi fragment. Opis i konfiguracja: README.md, historia
//  zmian: CHANGELOG.md.
// ---------------------------------------------------------------------

(function() {
    'use strict';

    // ─── src/01-config.js ───
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
        SCRIPT_VERSION: '1.4.1',
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
         * składa gotową zakładkę z kodem ustawień. Pusty adres znaczy „zakładki
         * nie ma”: panel pokazuje podpowiedź, a kod ustawień działa bez zmian.
         *
         * Wartość podstawia build.js z pola `config.releaseUrl` w package.json,
         * więc w źródłach adresu nie ma — każde miejsce publikacji ustawia
         * własny. Serwer musi odpowiadać nagłówkiem
         * `Access-Control-Allow-Origin`: zakładka pobiera plik przez `fetch`
         * ze strony T-REX, a bez nagłówka (także po przekierowaniu, które go
         * gubi) przeglądarka zrywa zapytanie („blocked by CORS policy”).
         */
        RELEASE_URL: '',
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
        // Źródła kursów walut: PriceSources.fxProviders (src/15-price-sources.js).
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
        // Źródła ceny i ich hosty: src/15-price-sources.js. Tu stoją tylko
        // ich nastawy (PRICE_KEEPA_*, PRICE_JINA_*, PRICE_OCR_*, pola keepa
        // w MARKETPLACES) i to, co wspólne dla każdego źródła.
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
             * PriceCard.check(), PriceCard.resolve(), PriceNet (każde wyjście
             * do sieci), ValueLog.add() i FxRates.init() — jedna zapomniana
             * ścieżka nie wystarczy, żeby zapytanie wyszło.
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

    // ─── src/02-i18n-strings.js ───
    // ==========================================
    // 2. SŁOWNIKI I18N
    // ==========================================
    const LANG_STRINGS = {
        en: {
            scriptLoaded: '${scriptName} v${version} Loaded.', yes: 'Yes', no: 'No', notApplicable: 'NA',
            error_items_per_hour_unavailable: '~0.0/h (short work time)', fromUnit: 'from', inUnit: 'in',
            hoursShort: 'h', minutesShort: 'm', secondsShort: 's', statsPerHourUnit: '/h', completedUnit: 'done',
            taskPausedMark: '(paused)',
            section_tasks: 'Tasks',
            tasks_hint: 'A task is one work process with its own clock. Switching tasks keeps the shift counters intact — only the rate is counted separately, so a late start no longer spoils it.',
            tasks_name: 'Name',
            tasks_startedAt: 'Started',
            tasks_now: 'now',
            tasks_minutesBack: '-${value} min',
            tasks_shiftStart: 'shift start',
            tasks_packages: 'Packages',
            tasks_rate: 'Rate',
            tasks_summary: 'Sales / time',
            tasks_pause: 'Pause the clock',
            tasks_unpause: 'Resume the clock',
            tasks_new: 'New task',
            tasks_newPlaceholder: 'name of the new task',
            tasks_history: 'Tasks of this shift',
            tasks_resume: 'Resume',
            tasks_delete: 'Delete',
            tasks_deleteConfirm: 'Delete the task "${name}"? Its packages will be taken off the shift counter.',
            tasks_ongoing: 'now',
            lineSettings_taskInfoHint: 'Name of the current task and its own numbers: packages, rate, sales percentage, time worked. The lines above describe the whole shift; this one describes the process you are on right now.',
            tabName_CRET: 'CRET', tabName_REFURB: 'REFURB', tabName_WHD: 'WHD', tabName_OTHER: 'Other', tabName_UNKNOWN: 'UNKNOWN',
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
            lineSettings_compactHint: 'Three numbers: items per hour (all tabs), items done and the sales percentage. Nothing else.',
            lineSettings_taskInfo: 'Line 8: Current task',
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
            notice_storageFull: 'Browser storage is full — numbers on screen are correct, but will not survive a page reload (F5).',
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
            priceCard_marketNoData: 'Keepa has no chart for this store — link works, price will not',
            priceCard_displayCurrency: 'Show amounts in',
            priceCard_displayNative: 'store currency (no conversion)',
            priceCard_displayCurrencyHint: 'Totals are always counted in euro; the chosen currency is only how they are shown, so switching it mid-shift loses nothing. A converted price is marked with ≈.',
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
            priceCard_textOff: 'text lookup off',
            priceCard_section: 'Price Card', priceCard_enabled: 'Show price card',
            priceCard_showPrice: 'Show current price', priceCard_showRrp: 'Show list price (RRP)',
            priceCard_showGraph: 'Show Keepa chart',
            priceCard_showAsin: 'Show product code (ASIN)',
            priceCard_asinClickable: 'Product code is a link to the store',
            priceCard_asinClickableHint: 'Off by default: a link is the only part of the card that catches the mouse and can cover a T-REX button.',
            priceCard_showLatency: 'Show price lookup time (ms)',
            priceCard_width: 'Card width: ${value}px', priceCard_fontSize: 'Price size: ${value}px',
            priceCard_bg: 'Card background', priceCard_drag: 'Make Card Draggable',
            priceCard_showSource: 'Show price source',
            configCode_section: 'Settings code',
            configCode_hint: 'The code holds everything you changed away from the defaults: lines, colours, transparency, sizes, position, switches. Paste it on another machine and you get the same interface.',
            configCode_yours: 'Your code',
            configCode_link: 'Ready-made bookmarklet',
            configCode_linkMissing: 'This build has no release address, so there is no ready-made bookmarklet. The code above works as usual: paste it on another machine.',
            configCode_select: 'Select for copying',
            configCode_paste: 'Paste a code here',
            configCode_apply: 'Apply code',
            configCode_applied: 'Settings applied: ${n}',
            priceCard_textColor: 'Text colour',
            priceCard_textColorHint: 'One colour for every line of the card. Failure messages are always shown, whatever the switches say.',
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
            taskPausedMark: '(pauza)',
            section_tasks: 'Zadania',
            tasks_hint: 'Zadanie to jeden proces pracy z własnym zegarem. Przełączenie nie rusza liczników zmiany — osobno liczy się tylko tempo, więc spóźniony start przestaje je psuć.',
            tasks_name: 'Nazwa',
            tasks_startedAt: 'Początek',
            tasks_now: 'teraz',
            tasks_minutesBack: '-${value} min',
            tasks_shiftStart: 'początek zmiany',
            tasks_packages: 'Paczki',
            tasks_rate: 'Tempo',
            tasks_summary: 'Sprzedaż / czas',
            tasks_pause: 'Zatrzymaj zegar',
            tasks_unpause: 'Uruchom zegar',
            tasks_new: 'Nowe zadanie',
            tasks_newPlaceholder: 'nazwa nowego zadania',
            tasks_history: 'Zadania tej zmiany',
            tasks_resume: 'Wznów',
            tasks_delete: 'Usuń',
            tasks_deleteConfirm: 'Usunąć zadanie „${name}”? Jego paczki zejdą z licznika zmiany.',
            tasks_ongoing: 'teraz',
            lineSettings_taskInfoHint: 'Nazwa bieżącego zadania i jego własne liczby: paczki, tempo, procent sprzedaży, przepracowany czas. Linie wyżej opisują całą zmianę, ta — proces, przy którym siedzisz teraz.',
            tabName_CRET: 'CRET', tabName_REFURB: 'REFURB', tabName_WHD: 'WHD', tabName_OTHER: 'Inne', tabName_UNKNOWN: 'NIEZNANA',
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
            lineSettings_compactHint: 'Trzy liczby: paczki na godzinę (wszystkie karty), zrobione sztuki i procent sprzedaży. Nic więcej.',
            lineSettings_taskInfo: 'Linia 8: Bieżące zadanie',
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
            notice_storageFull: 'Pamięć przeglądarki jest pełna — liczby na ekranie są aktualne, ale nie przeżyją przeładowania strony (F5).',
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
            priceCard_marketNoData: 'Keepa nie ma wykresu dla tego sklepu — link działa, ceny nie będzie',
            priceCard_displayCurrency: 'Kwoty pokazywać w',
            priceCard_displayNative: 'walucie sklepu (bez przeliczania)',
            priceCard_displayCurrencyHint: 'Sumy liczone są zawsze w euro, a wybrana waluta to tylko sposób pokazania — zmiana w trakcie zmiany niczego nie gubi. Cena przeliczona ma znak ≈.',
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
            priceCard_textOff: 'pobieranie tekstu wyłączone',
            priceCard_section: 'Karta ceny', priceCard_enabled: 'Pokaż kartę ceny',
            priceCard_showPrice: 'Pokaż aktualną cenę', priceCard_showRrp: 'Pokaż cenę katalogową (RRP)',
            priceCard_showGraph: 'Pokaż wykres Keepa',
            priceCard_showAsin: 'Pokaż kod produktu (ASIN)',
            priceCard_asinClickable: 'Kod produktu jest linkiem do sklepu',
            priceCard_asinClickableHint: 'Domyślnie wyłączone: link to jedyne miejsce karty, które łapie mysz i potrafi przykryć przycisk T-REX.',
            priceCard_showLatency: 'Pokaż czas zdobycia ceny (ms)',
            priceCard_width: 'Szerokość karty: ${value}px', priceCard_fontSize: 'Rozmiar ceny: ${value}px',
            priceCard_bg: 'Tło karty', priceCard_drag: 'Uaktywnij przeciąganie karty',
            priceCard_showSource: 'Pokaż źródło ceny',
            configCode_section: 'Kod ustawień',
            configCode_hint: 'W kodzie siedzi wszystko, co zmieniłeś względem wartości domyślnych: linie, kolory, przezroczystość, rozmiary, położenie, wyłączniki. Wklejony na innej maszynie daje ten sam interfejs.',
            configCode_yours: 'Twój kod',
            configCode_link: 'Gotowa zakładka',
            configCode_linkMissing: 'Ta kompilacja nie ma adresu wydania, więc gotowej zakładki nie ma. Kod powyżej działa jak zwykle: wklej go na innej maszynie.',
            configCode_select: 'Zaznacz do skopiowania',
            configCode_paste: 'Wklej tu kod',
            configCode_apply: 'Nałóż kod',
            configCode_applied: 'Nałożono ustawień: ${n}',
            priceCard_textColor: 'Kolor tekstu',
            priceCard_textColorHint: 'Jeden kolor na wszystkie wiersze karty. Komunikat o tym, dlaczego ceny nie ma, pokazuje się zawsze, niezależnie od wyłączników.',
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
            taskPausedMark: '(пауза)',
            section_tasks: 'Задачи',
            tasks_hint: 'Задача — это один процесс работы со своими часами. Переключение не трогает счётчики смены: отдельно считается только темп, поэтому опоздание к началу процесса его больше не портит.',
            tasks_name: 'Название',
            tasks_startedAt: 'Начало',
            tasks_now: 'сейчас',
            tasks_minutesBack: '-${value} мин',
            tasks_shiftStart: 'начало смены',
            tasks_packages: 'Пачки',
            tasks_rate: 'Темп',
            tasks_summary: 'Продажа / время',
            tasks_pause: 'Остановить часы',
            tasks_unpause: 'Запустить часы',
            tasks_new: 'Новая задача',
            tasks_newPlaceholder: 'название новой задачи',
            tasks_history: 'Задачи этой смены',
            tasks_resume: 'Продолжить',
            tasks_delete: 'Удалить',
            tasks_deleteConfirm: 'Удалить задачу «${name}»? Её пачки уйдут со счётчика смены.',
            tasks_ongoing: 'сейчас',
            lineSettings_taskInfoHint: 'Название текущей задачи и её собственные числа: пачки, темп, процент продажи, отработанное время. Строки выше описывают всю смену, эта — процесс, которым вы заняты сейчас.',
            tabName_CRET: 'CRET', tabName_REFURB: 'REFURB', tabName_WHD: 'WHD', tabName_OTHER: 'Прочее', tabName_UNKNOWN: 'НЕИЗВЕСТНО',
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
            lineSettings_compactHint: 'Три числа: предметов в час (все вкладки), сделано штук и процент продажи. Больше ничего.',
            lineSettings_taskInfo: 'Строка 8: Текущая задача',
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
            notice_storageFull: 'Память браузера переполнена — числа на экране верные, но не переживут перезагрузку страницы (F5).',
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
            priceCard_marketNoData: 'У Keepa нет графика для этого магазина — ссылка работает, цены не будет',
            priceCard_displayCurrency: 'Показывать суммы в',
            priceCard_displayNative: 'валюте магазина (без пересчёта)',
            priceCard_displayCurrencyHint: 'Суммы всегда считаются в евро, выбранная валюта — только способ показа, поэтому смена посреди смены ничего не теряет. Пересчитанная цена помечена знаком ≈.',
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
            priceCard_textOff: 'текстовый запрос выключен',
            priceCard_section: 'Карточка цены', priceCard_enabled: 'Показывать карточку цены',
            priceCard_showPrice: 'Показывать текущую цену', priceCard_showRrp: 'Показывать RRP',
            priceCard_showGraph: 'Показывать график Keepa',
            priceCard_showAsin: 'Показывать код товара (ASIN)',
            priceCard_asinClickable: 'Код товара — ссылка на магазин',
            priceCard_asinClickableHint: 'По умолчанию выключено: ссылка — единственное место карточки, которое ловит мышь и может перекрыть кнопку T-REX.',
            priceCard_showLatency: 'Показывать время получения цены (мс)',
            priceCard_width: 'Ширина карточки: ${value}px', priceCard_fontSize: 'Размер цены: ${value}px',
            priceCard_bg: 'Фон карточки', priceCard_drag: 'Включить перетаскивание карточки',
            priceCard_showSource: 'Показывать источник цены',
            configCode_section: 'Код настроек',
            configCode_hint: 'В коде лежит всё, что вы изменили относительно значений по умолчанию: строки, цвета, прозрачность, размеры, положение, выключатели. Вставленный на другой машине даёт тот же интерфейс.',
            configCode_yours: 'Ваш код',
            configCode_link: 'Готовая закладка',
            configCode_linkMissing: 'В этой сборке не задан адрес релиза, поэтому готовой закладки нет. Код выше работает как обычно: вставьте его на другой машине.',
            configCode_select: 'Выделить для копирования',
            configCode_paste: 'Вставьте сюда код',
            configCode_apply: 'Применить код',
            configCode_applied: 'Применено настроек: ${n}',
            priceCard_textColor: 'Цвет текста',
            priceCard_textColorHint: 'Один цвет на все строки карточки. Сообщение о том, почему цены нет, показывается всегда, независимо от выключателей.',
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
         * Trzy poziomy wypisywania:
         *   log()   — dziennik pracy, kilka linii na przedmiot; pod wyłącznikiem.
         *   error() — sytuacja nienormalna, po której skrypt działa dalej
         *             (brak kursów, pełny dziennik, CSP); pod wyłącznikiem.
         *   fatal() — skrypt nie wstał albo się rozsypał; zawsze, bo cicha
         *             awaria startu wygląda jak „nic się nie stało”.
         *
         * Wyłącznikiem jest CONFIG.DEBUG_MODE, a nie stała z nagłówka, żeby
         * SH.logsOn() działało w locie, bez ponownego wklejania skryptu.
         */
        log(...args) { if (CONFIG.DEBUG_MODE) console.log(`[${CONFIG.SCRIPT_NAME} v${CONFIG.SCRIPT_VERSION}]`, ...args); },
        error(...args) { if (CONFIG.DEBUG_MODE) console.error(`[${CONFIG.SCRIPT_NAME} ERROR]`, ...args); },
        fatal(...args) { console.error(`[${CONFIG.SCRIPT_NAME} FATAL]`, ...args); },
        generateId(prefix = '') { return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`; },
        isObject(item) { return (item && typeof item === 'object' && !Array.isArray(item)); },
        /**
         * Scalanie z głębokim kopiowaniem. Zagnieżdżone obiekty źródła są
         * zawsze kopiowane, także gdy klucza w target nie ma — referencja
         * oznaczałaby, że stan w pamięci i DEFAULT_LOCAL_CONFIG dzielą jeden
         * obiekt, a zmiana stanu psuje wartości domyślne (np. reset pozycji
         * karty przywraca już zmienioną pozycję).
         *
         * Klucze `__proto__`, `constructor` i `prototype` są pomijane: do
         * scalania trafia JSON z localStorage, który dzielimy z T-REX,
         * a spreparowana wartość mogłaby dopisać pole do Object.prototype.
         */
        UNSAFE_KEYS: ['__proto__', 'constructor', 'prototype'],
        deepMerge(target, source) {
            const output = Utils.isObject(target) ? { ...target } : {};
            if (Utils.isObject(source)) {
                Object.keys(source).forEach(key => {
                    if (Utils.UNSAFE_KEYS.includes(key)) return;
                    if (Utils.isObject(source[key])) {
                        // Kopia zawsze — także wtedy, gdy klucza w target jeszcze nie ma.
                        output[key] = Utils.deepMerge(output[key], source[key]);
                    } else { output[key] = source[key]; }
                });
            }
            return output;
        },
        /**
         * Różnice między dwoma stanami ustawień: lista [ścieżka, nowa wartość]
         * dla każdego zmienionego liścia (undefined = klucz zniknął). Tablice
         * i wartości proste są liśćmi.
         *
         * Podstawa scalania ustawień wspólnych: karta nakłada na magazyn tylko
         * to, co sama zmieniła od ostatniej synchronizacji, zamiast pisać cały
         * obiekt z pamięci i wymazywać zmiany sąsiedniej karty.
         */
        diffPaths(base, current, prefix = [], out = []) {
            if (Utils.isObject(base) && Utils.isObject(current)) {
                const keys = new Set([...Object.keys(base), ...Object.keys(current)]);
                for (const key of keys) {
                    if (Utils.UNSAFE_KEYS.includes(key)) continue;
                    Utils.diffPaths(base[key], current[key], prefix.concat(key), out);
                }
            } else if (JSON.stringify(base) !== JSON.stringify(current)) {
                out.push([prefix, current]);
            }
            return out;
        },
        /** Nałożenie różnic z diffPaths na obiekt — w miejscu; zwraca ten obiekt. */
        applyPaths(target, changes) {
            for (const [path, value] of changes) {
                if (!path.length || path.some(k => Utils.UNSAFE_KEYS.includes(k))) continue;
                let node = target;
                for (const key of path.slice(0, -1)) {
                    if (!Utils.isObject(node[key])) node[key] = {};
                    node = node[key];
                }
                const last = path[path.length - 1];
                if (value === undefined) delete node[last];
                // Kopia, a nie referencja: stan w pamięci nie może dzielić
                // obiektów z tym, co idzie do magazynu.
                else node[last] = value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
            }
            return target;
        },
        /** Głęboka kopia bloku ustawień. */
        clone(value) { return Utils.isObject(value) ? Utils.deepMerge({}, value) : value; },
        /**
         * Odłożenie wywołania do chwili, gdy przez `delay` ms nic się nie działo.
         *
         * `.cancel()` gasi czekające wywołanie (rozbiórka egzemplarza nie może
         * po sekundzie nadpisać magazynu starym stanem), `.flush()` wykonuje je
         * od razu (zamknięcie karty nie może zgubić ostatniej zmiany).
         */
        debounce(func, delay) {
            let timeout = null;
            let pending = null;
            const run = () => {
                const call = pending;
                timeout = pending = null;
                if (call) func.apply(call.self, call.args);
            };
            /** @this {unknown} — wywołujący; przekazywany dalej do func. */
            const debounced = function(...args) {
                clearTimeout(timeout);
                pending = { self: this, args };
                timeout = setTimeout(run, delay);
            };
            debounced.cancel = () => { clearTimeout(timeout); timeout = pending = null; };
            debounced.flush = () => { clearTimeout(timeout); run(); };
            return debounced;
        },
        /**
         * Kolor HEX na „R, G, B” do wstawienia w rgba().
         *
         * Wyrażenie jest zakotwiczone z obu stron, bo wynik trafia wprost do
         * łańcucha CSS (CSSManager): cokolwiek poza sześcioma cyframi
         * szesnastkowymi mogłoby zamknąć regułę i dopisać własną. Przy
         * niedopasowaniu — neutralna szarość.
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
            // Number.isFinite, a nie isNaN: nieskończoność przechodzi przez
            // isNaN i dałaby na ekranie „Infinityg NaNm”.
            if (!Number.isFinite(ms) || ms <= 0) return I18n.get('notApplicable');
            let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); const h = Math.floor(m / 60);
            s %= 60; m %= 60;
            const hS = I18n.get('hoursShort'), mS = I18n.get('minutesShort'), sS = I18n.get('secondsShort');
            if (h > 0) return `${h}${hS} ${String(m).padStart(2, '0')}${mS}`;
            else if (m > 0) return `${m}${mS} ${String(s).padStart(2, '0')}${sS}`;
            return `${s}${sS}`;
        },
        /**
         * Godzina i minuta ze znacznika czasu — `18:32`. Bez daty: zadanie
         * mieści się w jednej zmianie, a kolumna panelu jest wąska.
         */
        formatClock(ms) {
            const d = new Date(Number(ms));
            if (isNaN(d.getTime())) return '—';
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
        /**
         * Udział w procentach, z odrzuceniem części ułamkowej.
         *
         * Odrzucenie, a nie zaokrąglenie: procent sprzedaży nie może obiecywać
         * więcej, niż zrobiono (1 z 17 to 5,88% — na ekranie 5%, nie 6%).
         * Mnożenie idzie przed dzieleniem, bo `(29/100)*100` daje
         * 28.999999999999996. Wynik zamknięty w 0-100 także przy danych
         * niespójnych (licznik poprawiony ręcznie w dół, sprzedane nie).
         */
        percentFloor(part, whole) {
            const p = Number(part), w = Number(whole);
            if (!isFinite(p) || !isFinite(w) || w <= 0 || p <= 0) return 0;
            return Math.max(0, Math.min(100, Math.floor(p * 100 / w)));
        },
        /**
         * Liczba z konfiguracji sprowadzona do zakresu; NaN i śmieci dają
         * `fallback`. Każda liczba idąca do stylu przechodzi tędy — wartość
         * z localStorage w rodzaju `10px; position:fixed` rozjechałaby regułę CSS.
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
     * Znaczniki nie powstają z łańcuchów: atrybuty i właściwości ustawia się
     * przypisaniem, tekst wyłącznie przez document.createTextNode. Tekst
     * z zewnątrz nigdy nie trafia do parsera HTML, więc XSS jest wykluczony
     * konstrukcyjnie — dlatego w pliku nie ma przypisania do innerHTML poza
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
        /** Zdejmuje wszystkie subskrypcje — przy rozbiórce egzemplarza (Main.teardown). */
        clear() { this.listeners = {}; }
    }

    const bus = new EventBus();

    /**
     * Subskrypcja zmian stanu ograniczona do gałęzi (`prefixes`).
     *
     * Obsługa na gołym `store:changed` reagowałaby na każdą zmianę, także na
     * flagi uiFlags przestawiane przy każdym przedmiocie — a przebudowa CSS
     * unieważnia style całego dokumentu. Każdy odbiorca słucha więc tylko
     * swoich ścieżek.
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
                // Klucz symboliczny (np. Symbol.toStringTag dopisany przez
                // bibliotekę) nie jest ścieżką stanu: zapis bez zdarzeń.
                // Wstawiony do napisu ścieżki rzuciłby TypeError.
                if (typeof prop === 'symbol') { obj[prop] = value; return true; }
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
            // Usunięcie klucza też jest reaktywne — na nim stoi sprzątanie
            // wpisów po kartach (SessionReset.pruneTabInstances).
            deleteProperty(obj, prop) {
                if (typeof prop === 'symbol') return delete obj[prop];
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

    /**
     * Stan zmiany — wspólny dla wszystkich kart. Osobny obiekt, bo scalanie
     * ustawień między kartami uzupełnia nim pola, których brakuje w magazynie
     * (Persistence._adoptShared).
     */
    const DEFAULT_SESSION_CONFIG = {
        shiftType: null, shiftCalculatedStartTime: null, selectedLunchIndex: null, activeTabInstances: {},
    };

    const baseState = {
        initialized: false,
        currentTabType: CONFIG.UNKNOWN_TAB_TYPE_KEY,
        currentTabInstanceId: null,
        tabCounters: {},
        // Ile z policzonych przedmiotów pojechało na sprzedaż — na kartę,
        // jak tabCounters. Mianownikiem procentu jest tabCounters.
        tabSold: {},
        // Przedmioty wyjęte z mianownika procentu (audyt, ręczne wpisy) — patrz
        // Routing i TaskManager.
        tabNeutral: {},
        /**
         * Zadania. Tablica nie jest reaktywna po elementach — TaskManager
         * podmienia ją w całości przy każdej zmianie i dzięki temu linia 8
         * oraz panel dowiadują się o niej.
         */
        tasks: [],
        activeTaskId: null,
        taskCounters: {},
        userConfig: Utils.deepMerge({}, DEFAULT_USER_CONFIG),
        localTabConfig: Utils.deepMerge({}, DEFAULT_LOCAL_CONFIG),
        sessionConfig: Utils.deepMerge({}, DEFAULT_SESSION_CONFIG),
        // itemInProgress: trwa przedmiot (między wyzwalaczem wstępnym a końcowym).
        uiFlags: { isSettingsPanelVisible: false, isStatsWindowDragging: false, isPriceCardDragging: false,
                   autoTriggerFound: false, itemInProgress: false }
    };

    const store = createReactive(baseState);

    /**
     * Czy moduł cen jest włączony — jedno miejsce prawdy dla wszystkich
     * bezpieczników sieciowych. Porównanie do `true`, a nie prawdziwość:
     * wartość przychodzi z localStorage i wszystko inne niż jawne `true`
     * (brak pola, `null`, łańcuch, liczba) znaczy „wyłączony”.
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
            // Podstawianie przez split/join, a nie String.replace: w łańcuchu
            // zastępującym replace traktuje $& $` $' $1 jako sekwencje
            // specjalne, a nazwę karty wpisuje człowiek — „Tab ($&)” psułaby
            // wynik.
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
    /**
     * Zapis i odczyt stanu skryptu w localStorage.
     *
     * Nazwa nie może brzmieć StorageManager: tak nazywa się globalny typ
     * przeglądarki (navigator.storage), a sprawdzanie typów widzi wszystkie
     * moduły w jednym zakresie razem z typami DOM.
     */
    const Persistence = {
        // Pamięć ostatniej zapisanej wartości dla każdego klucza. Potrzebna, żeby
        // nie pisać do localStorage tego samego: zbędny zapis rodzi zdarzenie
        // 'storage' w sąsiednich kartach i zmusza je do przeliczania stanu.
        _lastWritten: {},
        // Do tego momentu autozapis milczy (patrz REMOTE_APPLY_SUPPRESS_MS).
        suppressSaveUntil: 0,

        getKey(key) { return `${CONFIG.SCRIPT_ID_PREFIX}${key}`; },

        /**
         * Zapis z odnotowaniem wartości — jedyne miejsce, z którego skrypt pisze
         * do localStorage poza dziennikiem wartości i kursami.
         *
         * Zapis może się nie udać: localStorage dzielimy z T-REX, więc kwota
         * potrafi się skończyć, a zablokowany magazyn rzuca przy każdym
         * setItem. Nieudany zapis nie przerywa pracy — wraca `false`, skrypt
         * liczy dalej w pamięci, traci się tylko przeniesienie stanu przez F5.
         * Wyjątek puszczony w górę zatrzymałby Main.init() i skrypt nie wstałby.
         *
         * `_lastWritten` ustawia się dopiero po udanym zapisie; inaczej
         * deduplikacja odrzuciłaby następną, już możliwą próbę tej samej wartości.
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
                this.reportWriteFailure();
                return false;
            }
            this._lastWritten[key] = value;
            return true;
        },
        /**
         * Magazyn odmówił zapisu — człowiek ma się o tym dowiedzieć.
         *
         * Utils.error domyślnie milczy, a ekran do końca zmiany pokazywałby
         * poprawne liczby; rozjazd wyszedłby dopiero po F5. Cicha utrata jest
         * gorsza niż jedno powiadomienie, więc tu reguła „skrypt milczy”
         * ustępuje. Znacznik zostaje w pamięci, bo odmowa zdarza się także
         * przed postawieniem interfejsu; Notifier pokazuje ją raz na stronę.
         */
        writeFailed: false,
        reportWriteFailure() {
            this.writeFailed = true;
            bus.emit('storage:writeFailed');
        },
        /**
         * USTAWIENIA WSPÓLNE DLA KART — scalanie trójstronne.
         *
         * `userConfig` i `sessionConfig` leżą w jednym kluczu na wszystkie
         * karty. Karta pamięta, co ostatnio leżało w magazynie (`_synced`),
         * i przy zapisie oraz wczytaniu przenosi tylko swoje zmiany od tamtej
         * chwili, na wierzch tego, co jest w magazynie teraz. Zapis całego
         * obiektu z pamięci wymazywałby zmiany sąsiedniej karty.
         *
         * Dwie karty zmieniające różne ustawienia nie przeszkadzają sobie; ta
         * sama wartość zmieniona w obu wygrywa ostatnim zapisem.
         */
        _synced: {},
        _mergeShared(name, raw) {
            let stored;
            try { stored = JSON.parse(raw || 'null'); } catch { stored = null; }
            if (!Utils.isObject(stored)) stored = null;
            const base = this._synced[name];
            const mine = store[name];
            // Bez podstawy (pierwsze wczytanie) cały stan w pamięci jest „nasz”.
            const changes = Utils.diffPaths(base === undefined ? {} : base, mine);
            const merged = Utils.applyPaths(stored ? JSON.parse(JSON.stringify(stored)) : {}, changes);
            return { stored, merged, changes };
        },
        /**
         * Scalony stan staje się stanem w pamięci — dokładnie, łącznie
         * z usunięciami. deepMerge umie tylko dopisywać, więc wpis usunięty
         * w sąsiedniej karcie zostałby tu i najbliższy zapis by go wskrzesił.
         * Scalony stan zawiera wszystkie zmiany tej karty, więc usuwa się tylko
         * to, co zniknęło gdzie indziej.
         */
        _adoptShared(name, merged) {
            // Brakujące pola (starszy zapis, ręczna edycja) uzupełniają wartości
            // domyślne — usunąć da się tylko wpisy bez wartości domyślnej, czyli
            // dynamiczne (karty nierozpoznane, znaczniki kart).
            const defaults = name === 'userConfig' ? DEFAULT_USER_CONFIG : DEFAULT_SESSION_CONFIG;
            const full = Utils.deepMerge(Utils.deepMerge({}, defaults), merged);
            const target = store[name];
            for (const key of Object.keys(target)) {
                if (!(key in full)) delete target[key];
            }
            Object.assign(target, full);
        },
        _saveShared(name, storageKey) {
            const key = this.getKey(storageKey);
            let raw;
            try { raw = localStorage.getItem(key); } catch { raw = null; }
            const { merged } = this._mergeShared(name, raw);
            this._adoptShared(name, merged);
            const text = JSON.stringify(merged);
            if (this.write(key, text) || this._lastWritten[key] === text) this._synced[name] = merged;
        },
        saveState() {
            if (!store.initialized) return;
            this._saveShared('userConfig', CONFIG.STORAGE_KEY_USER_CONFIG);
            this._saveShared('sessionConfig', CONFIG.STORAGE_KEY_SESSION_CONFIG);

            const allLocalsKey = this.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS);
            let allLocals;
            try { allLocals = JSON.parse(localStorage.getItem(allLocalsKey) || "{}"); } catch (e) { allLocals = {}; }
            if (store.currentTabInstanceId) {
                allLocals[store.currentTabInstanceId] = store.localTabConfig;
            }
            // Klucz "null" to zapis konfiguracji sprzed rozpoznania karty —
            // śmieć, usuwany przy każdym zapisie.
            delete allLocals['null'];
            this.write(allLocalsKey, JSON.stringify(allLocals));
        },
        // Autozapis: każda zmiana stanu odkłada zapis o sekundę, więc F5
        // w środku zmiany nie gubi ustawień.
        scheduleSave: Utils.debounce(function() {
            // Zapis w oknie ciszy po wczytaniu stanu sąsiedniej karty nie
            // przepada — przesuwa się za koniec ciszy.
            const wait = Persistence.suppressSaveUntil - Date.now();
            if (wait > 0) { setTimeout(() => Persistence.scheduleSave(), wait); return; }
            Persistence.saveState();
        }, CONFIG.AUTOSAVE_DEBOUNCE_MS),

        saveCounter(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey), String(count));
        },
        /**
         * Świeża wartość licznika prosto z magazynu.
         *
         * Dwie karty tego samego działu dzielą klucz licznika. Zwiększanie od
         * wartości z własnej pamięci gubiłoby paczkę, gdy obie zaliczą
         * przedmiot, zanim przeglądarka doręczy zdarzenie — dlatego zwiększa
         * się od tego, co leży w magazynie.
         *
         * Po odmowie zapisu magazyn stoi w miejscu — wtedy prawdą jest pamięć.
         * Brak klucza to zero: sąsiednia karta zaczęła nową zmianę.
         */
        freshCount(key, fallback) {
            if (this.writeFailed) return fallback;
            try { return this.parseCount(localStorage.getItem(key)); } catch { return fallback; }
        },
        /** +1 do licznika karty (paczki, sprzedane albo poza mianownikiem). */
        bump(prefix, memory, tabKey) {
            const key = this.getKey(prefix + tabKey);
            const next = this.freshCount(key, memory[tabKey] || 0) + 1;
            memory[tabKey] = next;
            this.write(key, String(next));
            return next;
        },
        /** Świeże liczniki zadania dla karty — z tego samego powodu co freshCount. */
        freshTaskCounter(taskId, tabKey, fallback) {
            if (this.writeFailed) return fallback;
            try {
                const raw = localStorage.getItem(this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER + taskId + '_' + tabKey));
                return this.parseTaskCounterValue(raw);
            } catch { return fallback; }
        },
        /** Licznik sprzedanych — mianownikiem procentu jest zwykły licznik obok. */
        saveSold(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD + tabKey), String(count));
        },
        /** Licznik przedmiotów wyjętych z mianownika procentu (audyt, ręczne wpisy). */
        saveNeutral(tabKey, count) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL + tabKey), String(count));
        },
        /**
         * Lista zadań i aktywne zadanie — jeden klucz wspólny dla kart. Zapis
         * scala się z tym, co leży w magazynie (TaskManager.merge), żeby
         * zmiany listy w dwóch kartach naraz nie wymazywały się nawzajem.
         */
        saveTasks() {
            const key = this.getKey(CONFIG.STORAGE_KEY_TASKS);
            let stored;
            try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch { stored = null; }
            // Czyści się tylko to, co przyszło z magazynu: własne zadania zostają
            // tymi samymi obiektami, bo trzymają je wołający (TaskManager.active()).
            if (stored && Array.isArray(stored.list)) stored.list = this.cleanTasks(stored.list);
            const merged = TaskManager.merge(stored);
            TaskManager.adopt(merged);
            this.write(key, JSON.stringify(merged));
        },
        /** Klucze liczników danego zadania w magazynie — także cudzych kart. */
        storedTaskTabs(taskId) {
            const prefix = this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER);
            const tabs = [];
            try {
                for (const key of Object.keys(localStorage)) {
                    if (!key.startsWith(prefix)) continue;
                    const parsed = this.parseTaskCounterKey(key.substring(CONFIG.SCRIPT_ID_PREFIX.length));
                    if (parsed && parsed.taskId === taskId) tabs.push(parsed.tabKey);
                }
            } catch (e) { Utils.error('Nie udało się przejrzeć kluczy zadań', e); }
            return tabs;
        },
        /** Liczniki jednego zadania na jednej karcie: „paczki,sprzedane,poza mianownikiem”. */
        saveTaskCounter(taskId, tabKey, c) {
            this.write(this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER + taskId + '_' + tabKey),
                       `${c.done},${c.sold},${c.neutral}`);
        },
        removeTaskCounter(taskId, tabKey) {
            const key = this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER + taskId + '_' + tabKey);
            delete this._lastWritten[key];
            localStorage.removeItem(key);
        },
        /**
         * Rozbiór klucza licznika zadania: `taskcnt_<zadanie>_<karta>`.
         *
         * Identyfikator zadania sam ma podkreślenia (`task_abc_def`), więc
         * dzieli się od prawej: ostatni człon to karta. Wyjątkiem jest karta
         * nierozpoznana (`unknownTabInstance_abc_def`) — też z podkreśleniami;
         * dla niej dzieli się przed jej przedrostkiem, który w identyfikatorze
         * zadania nie występuje. Zły podział przypisałby paczki nieistniejącemu
         * zadaniu, a pierwsza poprawka w panelu wyzerowałaby licznik karty.
         */
        parseTaskCounterKey(localKey) {
            const rest = localKey.substring(CONFIG.STORAGE_PREFIX_TASK_COUNTER.length);
            const unknownAt = rest.indexOf('_' + CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX);
            const cut = unknownAt > 0 ? unknownAt : rest.lastIndexOf('_');
            if (cut <= 0 || cut === rest.length - 1) return null;
            return { taskId: rest.substring(0, cut), tabKey: rest.substring(cut + 1) };
        },
        /**
         * Licznik z magazynu: liczba całkowita od zera do CONFIG.COUNTER_MAX.
         * Magazyn jest wspólny z T-REX i można go edytować ręcznie — ujemne,
         * ułamki i liczby na dwadzieścia cyfr nie mają prawa dojść do ekranu.
         */
        parseCount(raw) {
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n > 0 ? Math.min(n, CONFIG.COUNTER_MAX) : 0;
        },
        /** Wartość licznika zadania z magazynu; śmieć czyta się jako zera. */
        parseTaskCounterValue(raw) {
            const parts = String(raw == null ? '' : raw).split(',');
            const num = (i) => this.parseCount(parts[i]);
            return { done: num(0), sold: num(1), neutral: num(2) };
        },
        removeCounter(tabKey) {
            const key = this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER + tabKey);
            delete this._lastWritten[key];
            localStorage.removeItem(key);
        },
        /**
         * Wszystkie klucze localStorage należące do skryptu, łącznie ze
         * wspólnym prefiksem archiwum. Zwykły reset zmiany archiwum nie rusza,
         * ale pełny reset usuwa wszystko, co skrypt zapisał.
         *
         * Filtr po dwóch prefiksach jest też zabezpieczeniem: reszta
         * localStorage tej domeny należy do T-REX i nie wolno jej dotknąć.
         */
        ownKeys() {
            return Object.keys(localStorage).filter(k =>
                k.startsWith(CONFIG.SCRIPT_ID_PREFIX) || k.startsWith(CONFIG.SHARED_ID_PREFIX));
        },
        /**
         * Usuwa klucze wspólnego magazynu po funkcjach, których już nie ma
         * (CONFIG.LEGACY_SHARED_KEYS).
         *
         * Sprzątanie to pierwsze wywołania w Main.init() i jedyne, które nie są
         * potrzebne do liczenia — stąd własny try: magazyn, który odmawia
         * nawet odczytu listy kluczy, nie może zatrzymać startu.
         */
        purgeLegacySharedKeys() {
            try {
                (CONFIG.LEGACY_SHARED_KEYS || []).forEach(k => {
                    const full = CONFIG.SHARED_ID_PREFIX + k;
                    if (localStorage.getItem(full) !== null) {
                        localStorage.removeItem(full);
                        Utils.log(`Usunięto klucz odwołanej funkcji: ${full}`);
                    }
                });
            } catch (e) { Utils.error('Sprzątanie kluczy odwołanych funkcji pominięte', e); }
        },
        /** Czyści klucze poprzednich schematów (ważne na maszynach bez resetu sesji). */
        purgeLegacyKeys() {
            try {
                const stale = Object.keys(localStorage).filter(k =>
                    CONFIG.LEGACY_ID_PREFIXES.some(p => k.startsWith(p)));
                stale.forEach(k => localStorage.removeItem(k));
                if (stale.length) Utils.log(`Usunięto kluczy poprzednich wersji: ${stale.length}`);
            } catch (e) { Utils.error('Sprzątanie kluczy poprzednich wersji pominięte', e); }
        },
        /**
         * @param {boolean} fromRemote - true, jeśli wczytanie wywołało zdarzenie
         *   'storage' z innej karty. Wtedy na chwilę wyciszamy autozapis, inaczej
         *   karty zaczynają w nieskończoność przepisywać sobie stan nawzajem.
         */
        loadAll(fromRemote = false) {
            try {
                for (const [name, storageKey] of [['userConfig', CONFIG.STORAGE_KEY_USER_CONFIG],
                                                  ['sessionConfig', CONFIG.STORAGE_KEY_SESSION_CONFIG]]) {
                    const raw = localStorage.getItem(this.getKey(storageKey));
                    if (!fromRemote) {
                        // Start: magazyn na wierzch wartości domyślnych, a to,
                        // co w nim leżało, staje się podstawą przyszłych scaleń.
                        let stored;
                        try { stored = JSON.parse(raw || 'null'); } catch { stored = null; }
                        if (Utils.isObject(stored)) Object.assign(store[name], Utils.deepMerge(store[name], stored));
                        this._synced[name] = Utils.isObject(stored) ? stored : {};
                        continue;
                    }
                    // Zdarzenie z sąsiedniej karty: jej stan, a na wierzch nasze
                    // niezapisane zmiany — autozapis dopisze je do magazynu.
                    const { stored, merged } = this._mergeShared(name, raw);
                    if (!stored) continue;
                    this._adoptShared(name, merged);
                    this._synced[name] = stored;
                }

                const allLocals = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS)) || "{}");
                if (store.currentTabInstanceId && allLocals[store.currentTabInstanceId]) {
                    Object.assign(store.localTabConfig, Utils.deepMerge(store.localTabConfig, allLocals[store.currentTabInstanceId]));
                }

                const prefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER);
                const soldPrefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD);
                const neutralPrefix = this.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL);
                const taskPrefix = this.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER);
                this.loadTasks();
                const taskCounters = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        const tabKey = key.substring(prefix.length);
                        store.tabCounters[tabKey] = this.parseCount(localStorage.getItem(key));
                    } else if (key && key.startsWith(soldPrefix)) {
                        const tabKey = key.substring(soldPrefix.length);
                        store.tabSold[tabKey] = this.parseCount(localStorage.getItem(key));
                    } else if (key && key.startsWith(neutralPrefix)) {
                        const tabKey = key.substring(neutralPrefix.length);
                        store.tabNeutral[tabKey] = this.parseCount(localStorage.getItem(key));
                    } else if (key && key.startsWith(taskPrefix)) {
                        const parsed = this.parseTaskCounterKey(key.substring(CONFIG.SCRIPT_ID_PREFIX.length));
                        if (!parsed) continue;
                        if (!taskCounters[parsed.taskId]) taskCounters[parsed.taskId] = {};
                        taskCounters[parsed.taskId][parsed.tabKey] =
                            this.parseTaskCounterValue(localStorage.getItem(key));
                    }
                }
                store.taskCounters = taskCounters;
            } catch (e) { Utils.error("Storage load failed", e); }

            if (fromRemote) this.suppressSaveUntil = Date.now() + CONFIG.REMOTE_APPLY_SUPPRESS_MS;
        },
        /**
         * Wczytanie listy zadań. Śmieciowy zapis (cudza wersja, ręczna edycja
         * magazynu) nie może zatrzymać startu — wtedy lista zostaje pusta,
         * a TaskManager.init() postawi zadanie domyślne.
         */
        loadTasks() {
            let parsed;
            try { parsed = JSON.parse(localStorage.getItem(this.getKey(CONFIG.STORAGE_KEY_TASKS)) || 'null'); }
            catch (e) { parsed = null; }
            const list = this.cleanTasks(parsed && Array.isArray(parsed.list) ? parsed.list : []);
            const activeId = parsed && typeof parsed.activeId === 'string' ? parsed.activeId : null;
            TaskManager.adopt({
                list,
                activeId: list.some(t => t.id === activeId) ? activeId : (list.length ? list[list.length - 1].id : null),
                activeAt: parsed && Number.isFinite(parsed.activeAt) ? parsed.activeAt : 0,
                removed: parsed && Utils.isObject(parsed.removed) ? parsed.removed : {},
            });
        },
        /** Zadania z magazynu: tylko poprawne pola, odcinki przez cleanSegments. */
        cleanTasks(raw) {
            return raw
                .filter(t => t && typeof t.id === 'string' && Array.isArray(t.segments) && t.segments.length)
                .map(t => ({
                    id: t.id,
                    name: String(t.name || CONFIG.DEFAULT_TASK_NAME).slice(0, CONFIG.TASK_MAX_NAME_LEN),
                    segments: this.cleanSegments(t.segments),
                    updated: Number.isFinite(t.updated) ? t.updated : 0,
                }));
        },
        /**
         * Odcinki zadania z magazynu. JSON przepuszcza `1e999` (nieskończoność),
         * a ręczna edycja — zero, liczby ujemne i daty z przyszłości.
         *
         * Odcinek poprawny: początek skończony, dodatni, nie w przyszłości;
         * koniec pusty albo nie wcześniej niż początek. Resztę się pomija.
         * Zadanie bez poprawnych odcinków nie znika, tylko dostaje zamknięty
         * odcinek zerowej długości — jego paczki leżą pod osobnymi kluczami
         * i bez zadania wypadłyby z sumy.
         */
        cleanSegments(raw) {
            const now = Date.now();
            const ok = (Array.isArray(raw) ? raw : [])
                .filter(seg => seg && Number.isFinite(seg.from) && seg.from > 0 && seg.from <= now)
                .map(seg => ({ from: seg.from, to: Number.isFinite(seg.to) ? seg.to : null }))
                .filter(seg => seg.to === null || seg.to >= seg.from);
            return ok.length ? ok : [{ from: now, to: now }];
        },
        listen() {
            // Referencja do obsługi jest zapamiętana — potrzebna w Main.teardown().
            this.onStorage = (e) => {
                if (!e.key || !e.key.startsWith(CONFIG.SCRIPT_ID_PREFIX)) return;
                // Klucz zmienił ktoś inny, więc notatka „ostatnio zapisane” nie
                // opisuje już magazynu — inaczej deduplikacja pominęłaby nasz
                // następny zapis tej samej wartości i zostawiła w kluczu cudzą.
                delete this._lastWritten[e.key];
                const localKey = e.key.substring(CONFIG.SCRIPT_ID_PREFIX.length);
                // Wartość z magazynu teraz, a nie `e.newValue`: zdarzenie niesie
                // wartość z chwili cudzego zapisu, a ta karta mogła od tamtej
                // pory zapisać nowszą.
                const current = localStorage.getItem(e.key);
                if (localKey === CONFIG.STORAGE_KEY_VALUE_LOG) {
                    // Dziennik wartości jest wspólny dla kart: sąsiednia karta
                    // dopisała przedmiot albo znak — scalamy, nie zamazujemy.
                    ValueLog.adoptRemote();
                    return;
                }
                if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_COUNTER)) {
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_COUNTER.length);
                    // Brak klucza (null) to reset liczników przez sąsiednią kartę
                    // na początku nowej zmiany — parseCount da zero.
                    const val = this.parseCount(current);
                    if (store.tabCounters[tabKey] !== val) store.tabCounters[tabKey] = val;
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_SOLD)) {
                    // Sprzedane sąsiedniej karty — linie 2 i 7 liczą procent
                    // po wszystkich kartach.
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_SOLD.length);
                    const val = this.parseCount(current);
                    if (store.tabSold[tabKey] !== val) store.tabSold[tabKey] = val;
                } else if (localKey === CONFIG.STORAGE_KEY_TASKS) {
                    // Zadanie należy do człowieka, nie do karty: przejście do
                    // innego procesu w jednej karcie obowiązuje we wszystkich.
                    this.loadTasks();
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TASK_COUNTER)) {
                    // Liczniki zadania z sąsiedniej karty — panel pokazuje
                    // podsumowanie zadania po wszystkich kartach.
                    const parsed = this.parseTaskCounterKey(localKey);
                    if (parsed) {
                        const byTab = { ...(store.taskCounters[parsed.taskId] || {}) };
                        byTab[parsed.tabKey] = this.parseTaskCounterValue(current);
                        store.taskCounters = { ...store.taskCounters, [parsed.taskId]: byTab };
                    }
                } else if (localKey.startsWith(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL)) {
                    // Przedmioty spoza mianownika sąsiedniej karty — bez nich
                    // linie 2 i 7 liczyłyby procent ze zbyt dużego mianownika.
                    const tabKey = localKey.substring(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL.length);
                    const val = this.parseCount(current);
                    if (store.tabNeutral[tabKey] !== val) store.tabNeutral[tabKey] = val;
                } else if (!store.uiFlags.isSettingsPanelVisible) {
                    this.debouncedLoad();
                }
            };
            window.addEventListener('storage', this.onStorage);
        },
        debouncedLoad: Utils.debounce(function() { Persistence.loadAll(true); }, 300)
    };

    // ─── src/07-session-shift.js ───
    // ==========================================
    // 5b. SESSION RESET (reset między zmianami)
    // ==========================================
    /**
     * Na części stanowisk (Windows, własne konto) sesja przeglądarki nie jest
     * resetowana między zmianami i localStorage wnosi do nowej zmiany liczniki
     * poprzedniej. Dane innej zmiany trzeba wyrzucić — inaczej tempo liczy się
     * od cudzego czasu startu. Ustawienia wyglądu zostają.
     */
    const SessionReset = {
        /**
         * Ostatni reset: {kind, reason}. Notifier pokazuje go, gdy UI jest
         * gotowy; `kind` decyduje o komunikacie (nowa zmiana, dane
         * przeterminowane, reset ręczny).
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

            // Wszystko, co opisuje jedną zmianę: liczniki paczek, sprzedanych
            // i spoza mianownika oraz zadania z ich licznikami.
            const prefixes = [
                Persistence.getKey(CONFIG.STORAGE_PREFIX_TAB_COUNTER),
                Persistence.getKey(CONFIG.STORAGE_PREFIX_TAB_SOLD),
                Persistence.getKey(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL),
                Persistence.getKey(CONFIG.STORAGE_PREFIX_TASK_COUNTER),
                Persistence.getKey(CONFIG.STORAGE_KEY_TASKS),
            ];
            Object.keys(localStorage)
                .filter(k => prefixes.some(p => k.startsWith(p)))
                .forEach(k => {
                    delete Persistence._lastWritten[k];
                    localStorage.removeItem(k);
                });

            Object.keys(store.tabCounters).forEach(k => { store.tabCounters[k] = 0; });
            Object.keys(store.tabSold).forEach(k => { store.tabSold[k] = 0; });
            Object.keys(store.tabNeutral).forEach(k => { store.tabNeutral[k] = 0; });
            // Lista zadań wstaje od zera: TaskManager.init() postawi zadanie
            // domyślne, zaczynające się razem z nową zmianą.
            store.tasks = [];
            store.activeTaskId = null;
            store.taskCounters = {};
            TaskManager.init();

            // Dziennik wartości to ta sama ewidencja w pieniądzach. Podsumowanie
            // odchodzącej zmiany trafia przed czyszczeniem do archiwum.
            ValueLog.reset(reason);

            this.pruneTabInstances(true);
            Persistence.saveState();
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

            const allLocalsKey = Persistence.getKey(CONFIG.STORAGE_KEY_ALL_LOCAL_TAB_CONFIGS);
            try {
                const allLocals = JSON.parse(localStorage.getItem(allLocalsKey) || "{}");
                let changed = false;
                Object.keys(allLocals).forEach(id => {
                    if (id === 'null' || isOrphan(id)) { delete allLocals[id]; changed = true; }
                });
                if (changed) Persistence.write(allLocalsKey, JSON.stringify(allLocals));
            } catch (e) { Utils.error('pruneTabInstances: nie udało się rozebrać allLocalTabConfigs', e); }
        },

        /**
         * Sprawdzenie przy starcie: zapisany początek zmiany starszy niż 12 h
         * znaczy dane z poprzedniej zmiany. Działa także w martwej strefie
         * (17:55–18:19 i 05:55–06:19), gdy bieżącej zmiany nie da się
         * rozpoznać i porównać.
         */
        checkStaleOnBoot() {
            const start = store.sessionConfig.shiftCalculatedStartTime;
            if (!start || Date.now() - start <= CONFIG.STALE_SESSION_MS) return false;

            // Zegar ścienny wskazuje wciąż tę samą zmianę — dane nie są
            // przeterminowane, choćby minęło ponad 12 h. Tak jest w październikową
            // noc zmiany czasu: 18:30 CEST → 05:55 CET to 12,42 h.
            const current = ShiftManager.currentShift();
            if (current && current.start === start) return false;

            const ageH = ((Date.now() - start) / 3600000).toFixed(1);
            store.sessionConfig.shiftType = null;
            store.sessionConfig.shiftCalculatedStartTime = null;
            store.sessionConfig.selectedLunchIndex = null;
            this.resetItemData(`dane zmiany są przeterminowane (${ageH} h temu)`, 'stale');
            return true;
        }
    };

    const ShiftManager = {
        /**
         * Zmiana, która trwa teraz według zegara ściennego: `{type, start}`,
         * albo null w martwej strefie (17:55–18:19 i 05:55–06:19).
         *
         * Wspólne dla update() i checkStaleOnBoot(), żeby oba odpowiadały na
         * pytanie „która zmiana trwa” tak samo.
         */
        currentShift() {
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

            return sType ? { type: sType, start: sTime.getTime() } : null;
        },

        update() {
            const current = this.currentShift();

            // W martwej strefie między zmianami zapisana zmiana zostaje: kto
            // pracuje po 05:55, nie traci statystyki, a sprawdzenie
            // przeterminowanych danych ma do czego się odnieść.
            if (!current) return;

            const sType = current.type;
            const sTime = new Date(current.start);
            const newStart = current.start;
            const oldStart = store.sessionConfig.shiftCalculatedStartTime;
            const oldType = store.sessionConfig.shiftType;

            const sameShift = oldType === sType
                && typeof oldStart === 'number'
                && Math.abs(newStart - oldStart) < CONFIG.SHIFT_IDENTITY_TOLERANCE_MS;

            // Ta sama zmiana — wychodzimy, nie ruszając wybranej przez
            // człowieka przerwy.
            if (sameShift) return;

            // Zmiana różni się od zapisanej, a zapisana istniała — na maszynie
            // zostały dane poprzedniej zmiany. Np. dzienna od 06:30, a o 18:21
            // siada nocna: to 11 h 51 min, próg 12 h tego nie złapie,
            // porównanie początku zmiany — tak.
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

            Persistence.saveState();
        },
        /**
         * Ile z odcinka [from, to] zajęła przerwa obiadowa. Wspólne dla czasu
         * zmiany i czasu zadań, żeby obie strony odejmowały to samo — kto nie
         * zatrzymał zadania na obiad, nie dostaje pół godziny pracy, której
         * nie było.
         */
        lunchOverlapMs(from, to) {
            const idx = store.sessionConfig.selectedLunchIndex;
            const opt = idx !== null && CONFIG.LUNCH_OPTIONS_BASE[idx];
            if (!opt || !(to > from)) return 0;

            const shiftDate = new Date(store.sessionConfig.shiftCalculatedStartTime || from);
            const lStartObj = Utils.timeStringToDate(opt.start, shiftDate, opt.type==='night' && parseInt(opt.start.substring(0,2)) < 12 && shiftDate.getHours() >= 12);
            const lEndObj = Utils.timeStringToDate(opt.end, shiftDate, opt.type==='night' && parseInt(opt.end.substring(0,2)) < 12 && shiftDate.getHours() >= 12);
            if (lEndObj < lStartObj) lEndObj.setDate(lEndObj.getDate() + 1);

            const aStart = Math.max(from, lStartObj.getTime());
            const aEnd = Math.min(to, lEndObj.getTime());
            return aEnd > aStart ? aEnd - aStart : 0;
        },
        getWorkTime() {
            if (!store.sessionConfig.shiftCalculatedStartTime) return { workedMs: 0, lunchMs: 0 };
            const now = Date.now();
            const start = store.sessionConfig.shiftCalculatedStartTime;
            const elapsed = Math.max(0, now - start);
            const lunchMs = this.lunchOverlapMs(start, now);
            return { workedMs: Math.max(0, elapsed - lunchMs), lunchMs };
        }
    };

    // ─── src/08-drag.js ───
    /**
     * Fabryka przeciągania — wspólna dla okna statystyk i karty ceny.
     *
     * Oba panele są normalnie przezroczyste dla myszy (pointer-events:none),
     * więc przeciąganie włącza się flagą z ustawień; dopiero wtedy element
     * przyjmuje zdarzenia. Po puszczeniu flaga gaśnie sama.
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
                Persistence.saveState();
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
            // Tylko wygląd karty: podmiana textContent w <style> unieważnia
            // style całego dokumentu, więc nie może iść przy każdej zmianie
            // stanu (np. flagach ustawianych na każdym przedmiocie).
            onStorePaths(['localTabConfig'], () => this.updateAll());
        },
        updateAll() {
            const lc = store.localTabConfig;
            // Każda liczba w tym łańcuchu przechodzi przez Utils.clampNum,
            // a każdy kolor przez Utils.hexToRgb. Oba zwracają same cyfry, więc
            // wartość z localStorage nie może zamknąć reguły i dopisać własnej.
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
                       'line7_compact', 'line8_taskInfo'];

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
                // Number(): input.value to łańcuch, a konfiguracja trzyma liczby.
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
        /**
         * Pole liczby nieujemnej. Pusty tekst nie jest zerem — jedno Backspace
         * i Enter w polu licznika działu skasowałoby paczki zmiany bez pytania.
         * Zero trzeba wpisać świadomie.
         */
        numberInput(val, onChange) {
            return h('input', { type: 'number', min: 0, value: val, onChange: (e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) onChange(Math.max(0, n));
            }, style: { width: '80px', padding: '4px', textAlign: 'right' }});
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
                Persistence.saveState();
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
                [{ value: 'native', text: I18n.get('priceCard_displayNative') }]
                    .concat(Object.entries(CONFIG.DISPLAY_CURRENCIES).map(([code, sign]) => ({
                        value: code, text: `${code} (${sign})`,
                    }))),
                FxRates.displayCurrency() || 'native',
                v => { store.userConfig.displayCurrency = v; PriceCard.render(); this.rerender(); })));
            secPrice.appendChild(UIBuilder.hint(I18n.get('priceCard_displayCurrencyHint')));

            // Źródło ceny — tryby z PriceSources, od zalecanego do zapasowych.
            secPrice.appendChild(UIBuilder.row(I18n.get('priceCard_source'), UIBuilder.select(
                PriceSources.modes.map(m => ({ value: m.value, text: I18n.get(m.labelKey) })),
                pc.source, v => { store.localTabConfig.priceCard.source = v; this.rerender(); })));

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
            secCode.appendChild(UIBuilder.row(I18n.get('configCode_yours'), codeBox));
            const link = ConfigCode.link();
            secCode.appendChild(link
                ? UIBuilder.row(I18n.get('configCode_link'), readOnlyBox(link))
                : UIBuilder.hint(I18n.get('configCode_linkMissing')));

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
        }
    };

    // ─── src/13-ui-visuals.js ───
    // Renderer przyciemnienia i wskaźnika
    const VisualsRenderer = {
        init() {
            // id jest obowiązkowe — po nim AutoTrigger odróżnia własne elementy
            // skryptu od zmian strony (AutoTrigger.isOwnNode).
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
     * Krótkie wyskakujące powiadomienie — głównie przy resecie liczników:
     * człowiek ma widzieć, że zerowanie było zamierzone, a nie że dane zgubiły
     * się same. Reset bywa przed postawieniem interfejsu, więc ostatni
     * komunikat czeka w SessionReset.lastReset.
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
            bus.on('storage:writeFailed', () => this.warnStorageFull());
            if (Persistence.writeFailed) this.warnStorageFull();
        },
        /**
         * Pełny magazyn — raz na stronę. Zapisów jest kilka na przedmiot, więc
         * bez tego znacznika powiadomienie wisiałoby na ekranie przez całą zmianę.
         */
        storageWarned: false,
        warnStorageFull() {
            if (this.storageWarned) return;
            this.storageWarned = true;
            this.show(I18n.get('notice_storageFull'), 12000);
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
     * Bieżący sklep Amazon — jedno miejsce prawdy dla linku, wykresu i waluty
     * ceny (CONFIG.MARKETPLACES). Nieznany klucz daje sklep domyślny.
     */
    function marketplaceKey() {
        const key = store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE;
        return CONFIG.MARKETPLACES[key] ? key : CONFIG.DEFAULT_MARKETPLACE;
    }
    /** @param {string} [key] - konkretny rynek; bez niego bierze się wybrany. */
    function marketplace(key) {
        return CONFIG.MARKETPLACES[key] || CONFIG.MARKETPLACES[marketplaceKey()];
    }
    /**
     * Link do karty produktu.
     *
     * @param {string} [key] - rynek, na którym znaleziono cenę; po przeglądzie
     *   sklepów link musi prowadzić tam, gdzie ta cena jest.
     *
     * Host pochodzi wyłącznie z CONFIG.MARKETPLACES, schemat jest wpisany na
     * sztywno, a ASIN idzie przez encodeURIComponent — do href nie da się
     * wstawić `javascript:` ani `data:`, nawet ze spreparowanym ASIN.
     */
    function productUrl(asin, key) {
        return `https://${marketplace(key).host}/dp/${encodeURIComponent(asin)}`;
    }

    // ─── src/15-price-sources.js ───
    // ==========================================
    // 6c. ŹRÓDŁA CEN I KURSÓW — JEDYNE MIEJSCE, KTÓRE ZNA SIEĆ ZEWNĘTRZNĄ
    // ==========================================
    /**
     * Wszystko, co wie, SKĄD przychodzi cena produktu i kurs waluty, stoi
     * w tym pliku. Karta ceny, dziennik wartości, kursy walut i panel znają
     * tylko kontrakt opisany niżej — nie znają ani hostów, ani formatów
     * odpowiedzi. Wymiana źródeł (np. na wewnętrzne API) to przepisanie tego
     * pliku według kontraktu; reszta skryptu tego nie zauważy.
     *
     * Zawartość:
     *   PriceNet     — jedyne wyjście do sieci modułu cen: zapytanie HTTP
     *                  i obrazek w tle, każde z twardym priceModuleOn();
     *   KeepaOCR     — odczyt ceny z pikseli wykresu Keepa;
     *   PriceSources — źródła ceny i kursów według kontraktu.
     *
     * KONTRAKT ŹRÓDŁA CENY — element PriceSources.list():
     *   name          nazwa w wierszu źródła karty i w logach;
     *   kind          'image' | 'text' — który licznik i limit zapytań się
     *                 liczy i która blokada CSP (img-src / connect-src)
     *                 wyłącza źródło;
     *   available     czy źródło jest w użyciu przy bieżących ustawieniach
     *                 karty; false — pomijane;
     *   marketSearch  czy nadaje się do przeglądu innych sklepów, gdy
     *                 w wybranym ceny nie ma;
     *   run(asin, signal, market) → Promise<PriceResult|null>
     *                 null — źródło odpowiedziało, ceny nie ma;
     *                 wyjątek — awaria (sieć, HTTP, format odpowiedzi);
     *                 `signal` przerywa zapytanie po limicie czasu, `market`
     *                 to klucz z CONFIG.MARKETPLACES (bez niego: wybrany).
     *
     *   PriceResult = { current: Money|null, rrp: Money|null, stale: boolean,
     *                   secondary?: { text }, series?: string, market?: string }
     *   Money       = { value: number, currency: string, text: string }
     *                 — waluta musi mieć kurs w CONFIG.FX_FALLBACK, inaczej
     *                 kwota nie wejdzie do sum w euro (PriceSources.money()).
     *
     * Pozostała część kontraktu (opisy przy polach): modes, chart, cspHosts,
     * coversMarket(), fxProviders, probes().
     *
     * Kolejność list jest kolejnością pytania. Limity, przerwy między
     * zapytaniami, limit czasu, przegląd sklepów i blokady CSP prowadzi karta
     * ceny (PriceCard) — źródło tylko pyta i rozbiera odpowiedź.
     */
    const PriceNet = {
        /**
         * Zapytanie HTTP. `init` idzie do fetch bez zmian — tędy wchodzą
         * `signal`, nagłówki, `cache` i `credentials` (np. 'include' dla
         * usługi, która rozpoznaje zalogowanego pracownika po ciasteczkach
         * przeglądarki).
         *
         * Najniższy poziom, na którym moduł cen dotyka sieci, więc stoi tu
         * twarde sprawdzenie modułu: nowa ścieżka wywołania bez sprawdzenia
         * wyżej i tak nie wyśle zapytania.
         */
        request(url, init) {
            if (!priceModuleOn()) {
                return Promise.reject(new Error('moduł cen wyłączony — zapytanie nie zostało wysłane'));
            }
            return fetch(url, init);
        },

        /**
         * Obrazek ładowany w tle, poza dokumentem.
         *   crossOrigin    — 'anonymous', gdy potrzebne są piksele: bez niego
         *                    canvas jest skażony i getImageData rzuca
         *                    SecurityError; null — sam fakt załadowania;
         *   referrerPolicy — Keepa oddaje obrazek tylko bez nagłówka Referer.
         * Po limicie czasu ładowanie jest przerywane (`src = ''`).
         *
         * Sprawdzenie modułu cen — jak w request().
         *
         * @param {string} url
         * @param {{timeoutMs?: number, crossOrigin?: string|null, referrerPolicy?: string}} [opts]
         * @returns {Promise<HTMLImageElement>}
         */
        image(url, { timeoutMs, crossOrigin = 'anonymous', referrerPolicy = 'no-referrer' } = {}) {
            if (!priceModuleOn()) {
                return Promise.reject(new Error('moduł cen wyłączony — zapytanie nie zostało wysłane'));
            }
            return new Promise((res, rej) => {
                const im = new Image();
                if (crossOrigin) im.crossOrigin = crossOrigin;
                im.referrerPolicy = referrerPolicy;
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true; im.src = '';
                    rej(new Error('przekroczony czas oczekiwania na obrazek'));
                }, timeoutMs || CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                im.onload = () => { if (done) return; done = true; clearTimeout(timer); res(im); };
                im.onerror = () => { if (done) return; done = true; clearTimeout(timer); rej(new Error('obrazek się nie załadował')); };
                im.src = url;
            });
        },
    };

    /**
     * ODCZYT CENY Z OBRAZKA KEEPA.
     *
     * Keepa drukuje aktualne ceny w legendzie wykresu. Obrazek wychodzi
     * z nagłówkami CORS, więc piksele są dostępne przez canvas i cenę da się
     * odczytać jako liczbę — bez klucza API i bez zapytań do Amazona.
     *
     * Własny odczyt zamiast biblioteki OCR: font legendy jest rastrowy
     * i niezmienny (166 glifów z 20 produktów to 16 kształtów zgodnych piksel
     * w piksel), więc to wyszukiwanie w tablicy, a nie rozpoznawanie.
     * Na 32 wierszach legendy: ten odczyt 32/32 w 0,14 ms, tesseract.js 13/20
     * w 140 ms plus kilka MB pobierania — i to z błędami zawyżającymi cenę
     * („5.99” -> „599”). Porównanie wzorców nie zgaduje: przy niezgodności
     * zwraca null.
     */
    const KeepaOCR = {
        // Znak ma 7 pikseli wysokości. '#' — atrament, '.' — tło.
        // Wzorce wyuczone z pikseli obrazków o znanych cenach.
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
         * Adres obrazka wykresu. ASIN pochodzi ze strony, więc musi mieć format
         * (dziesięć znaków A-Z0-9), a nie tylko być zakodowany: zakotwiczony
         * wzorzec odcina doklejenie parametrów, a przy niezgodności leci
         * wyjątek zamiast zapytania.
         */
        url(asin, market) {
            const clean = String(asin || '').toUpperCase();
            if (!/^[A-Z0-9]{10}$/.test(clean)) throw new Error('niedozwolony ASIN: ' + asin);
            return `https://graph.keepa.com/pricehistory.png?asin=${encodeURIComponent(clean)}`
                 + `&domain=${encodeURIComponent(marketplace(market).keepa)}&range=${Number(CONFIG.PRICE_KEEPA_RANGE) || 3}`;
        },

        /**
         * Obrazek do rozbioru — przez PriceNet.image(), z crossOrigin, bo
         * potrzebne są piksele. Widoczny <img> wykresu (tryb 'graph') idzie
         * bez crossOrigin — tam pikseli się nie czyta.
         *
         * Zły ASIN kończy się odrzuceniem obietnicy, a nie wyjątkiem.
         */
        loadImage(asin, timeoutMs, market) {
            let url;
            try { url = this.url(asin, market); } catch (e) { return Promise.reject(e); }
            return PriceNet.image(url, { timeoutMs });
        },

        pixels(im) {
            const c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(im, 0, 0);
            try {
                return ctx.getImageData(0, 0, c.width, c.height);
            } catch (e) {
                // cause zachowuje pierwotny SecurityError — widać, co dokładnie
                // zablokowała przeglądarka.
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
         * Czy w pasie jest podpis. Przy jednej serii drugi pas jest pusty poza
         * pionową osią wykresu — bez tego sprawdzenia oś brałaby się za tekst.
         */
        hasContent(cols) {
            let ink = 0;
            for (let i = 2; i < cols.length; i++) if (cols[i].includes('1')) ink++;
            return ink > 3;
        },

        /**
         * Separator dziesiętny rozpoznaje reguła, a nie bitmapa.
         *
         * Keepa rysuje wiersz z przesunięciem subpikselowym, więc wygładzona
         * kropka ma raz jedną, raz dwie kolumny — wzorzec by jej nie złapał.
         * Kropka to kolejne kolumny z atramentem wyłącznie w dolnym wierszu
         * znaku; cyfry zajmują pełną wysokość, więc reguła nie przechwyci
         * cudzego glifu. Najwyżej dwie kolumny — dłuższy ogon to podkreślenie
         * albo siatka.
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
         * Rozbiór wiersza oknem przesuwnym. Segmentacja po pustych kolumnach
         * nie działa, bo sąsiednie glify się sklejają („90” to jeden blok).
         *
         * Wygrywa najdłuższy pełny rozbiór ze wszystkich pozycji startowych:
         * podpis serii i „€” na lewo od ceny nie pasują do żadnej cyfry, więc
         * rozbiór od nich nie dochodzi do końca, a start od środka ceny
         * zgubiłby najstarszy rząd („15.51” jako „5.51”).
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
                // Długość surowego rozbioru, a nie liczby: odróżnia „2.991.39”
                // od jego kawałka „991.39”.
                if (d && t.length > bestRaw.length) { best = d; bestRaw = t; }
            }
            return best;
        },

        /**
         * Surowy rozbiór na liczbę dziesiętną, z separatorem tysięcy.
         *
         * Przecinek w pasie legendy wygląda jak kropka (jego ogon jest pod
         * pasem), więc „€ 2,991.39” przychodzi jako „2.991.39”. Rozstrzyga
         * pozycja: separator dziesiętny jest zawsze ostatni, wszystko na lewo
         * to grupowanie rzędów — tak samo dla „2,991.39” i „2.991,39”. Gdyby
         * forma z tysiącami była odrzucana, najdłuższym poprawnym rozbiorem
         * zostałby kawałek „991.39” — cena zaniżona o 2000 €, po cichu.
         *
         * Grupy sztywno po trzy cyfry: obcinki w rodzaju „.991.39” czy
         * „12.34.56” formy nie przechodzą.
         *
         * @param {string} text — surowy rozbiór, w którym każdy separator to '.'
         * @returns {string|null} łańcuch typu „2991.39” dla parseFloat
         */
        PRICE_SHAPE: /^\d{1,3}(?:\.\d{3})+\.\d{2}$|^\d{1,5}\.\d{2}$/,

        toDecimal(text) {
            if (!this.PRICE_SHAPE.test(text)) return null;
            const i = text.lastIndexOf('.');
            return text.slice(0, i).split('.').join('') + '.' + text.slice(i + 1);
        },

        /**
         * Nazwa serii po kolorze kółka na lewo od podpisu. Szukanie zaczyna się
         * od PRICE_OCR_SERIES_FROM_X, bo przy długiej cenie kółko wychodzi na
         * lewo od granicy tekstu. W szersze okno wchodzi kawałek pola wykresu,
         * stąd warunek nasycenia (wypełnienie jest blade, znacznik czysty).
         * Pomyłka jest tania: nazwa serii tylko się pokazuje, a cenę wybiera
         * pickHighest po liczbie.
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
         * Najwyższa cena z wierszy legendy. Do ewidencji liczy się cena
         * przedmiotu, a nie najtańsza oferta; wiersz Amazon jest zwykle wyżej
         * niż Neu. Wybór po liczbie, a nie po nazwie serii — działa także bez
         * wiersza Amazon i przy innej kolejności wierszy.
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
         * @param {string} [market] - rynek; bez niego bierze się wybrany.
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

    /**
     * ŹRÓDŁA CENY I KURSÓW według kontraktu z nagłówka pliku.
     *
     * Zapytanie do amazon.* ze strony T-REX jest niemożliwe (Same-Origin
     * Policy: zwykły fetch, XHR, no-cors, iframe, script src i widżety
     * partnerskie są blokowane; Tampermonkey obchodzi to tylko dlatego, że
     * GM_xmlhttpRequest działa w kontekście rozszerzenia). Dlatego źródła są
     * pośrednie:
     *   graph.keepa.com — obrazek wykresu; cena odczytana z pikseli;
     *   api.keepa.com   — oficjalne API, tylko z płatnym kluczem;
     *   r.jina.ai       — tekst strony produktu, oddaje nagłówki CORS.
     */
    const PriceSources = {
        /**
         * Wartości ustawienia `priceCard.source` w kolejności panelu, od
         * zalecanej. Wartość siedzi w zapisanych ustawieniach i w kodzie
         * ustawień, więc nowe źródło dostaje nową wartość, a istniejących się
         * nie przemianowuje. Nową wartość dopisuje się też NA KONIEC
         * ConfigCode.ENUMS.source — inaczej kod ustawień jej nie przeniesie.
         *   showsChart — w tym trybie karta pokazuje obrazek wykresu (chart);
         *   readsImage — cena pochodzi z obrazka, więc blokada img-src znaczy
         *                „nie ma skąd przeczytać ceny”, a nie „nie ma wykresu”.
         */
        modes: [
            { value: 'ocr',   labelKey: 'priceCard_src_ocr', readsImage: true },
            { value: 'graph', labelKey: 'priceCard_src_graph', showsChart: true },
            { value: 'jina',  labelKey: 'priceCard_src_jina' },
        ],

        /** Opis trybu po wartości ustawienia albo null. */
        mode(value) { return this.modes.find(m => m.value === value) || null; },

        /** Czy w tym trybie karta pokazuje obrazek wykresu. */
        showsChart(value) {
            const m = this.mode(value);
            return !!(this.chart && m && m.showsChart);
        },

        /**
         * Obrazek wykresu do pokazania na karcie albo null, gdy źródła nie
         * mają wykresu (karta chowa wtedy ramkę i opcje wykresu w panelu).
         *   url(asin, market) — adres obrazka;
         *   width, height     — natywny rozmiar obrazka w pikselach;
         *   legend            — prostokąt z samymi cenami {x, y, w, h}, do
         *                       trybu „tylko blok z cenami”.
         * Wartości czytane w chwili rysowania, więc zmiana CONFIG w locie
         * działa od razu.
         */
        chart: {
            url(asin, market) { return KeepaOCR.url(asin, market); },
            get width() { return CONFIG.PRICE_KEEPA_PNG_W; },
            get height() { return CONFIG.PRICE_KEEPA_PNG_H; },
            get legend() {
                return {
                    x: CONFIG.PRICE_KEEPA_LEGEND_X, y: CONFIG.PRICE_KEEPA_LEGEND_Y,
                    w: CONFIG.PRICE_KEEPA_LEGEND_W, h: CONFIG.PRICE_KEEPA_LEGEND_H,
                };
            },
        },

        /**
         * Hosty źródeł ceny z dyrektywą CSP, której potrzebują. Blokada na
         * którymś z nich wyłącza źródła tego rodzaju (PriceCard.csp), a raport
         * SH.cspReport() sprawdza je po kolei.
         */
        cspHosts: {
            'graph.keepa.com': 'img-src',
            'r.jina.ai': 'connect-src',
            'api.keepa.com': 'connect-src',
        },

        /**
         * Czy źródła mają dane dla rynku. Keepa dla Polski oddaje pusty wykres:
         * link działa, ceny nie będzie — panel ostrzega, a przegląd sklepów
         * takie rynki pomija.
         */
        coversMarket(key) {
            const m = CONFIG.MARKETPLACES[key];
            return !!(m && m.keepa_ok);
        },

        /** Kwota w postaci wspólnej dla wszystkich źródeł (Money). */
        money(value, currency) {
            return { value, currency, text: `${currency} ${value.toFixed(2)}` };
        },

        // ---------------- rozbiór odpowiedzi ----------------
        /**
         * Kwota w tekście strony. Waluta ze ścisłej listy, a nie [A-Z]{3}
         * (szeroki wzorzec łapie „UTF 8.00” z parametru ?ie=UTF8), grosze
         * obowiązkowe (Amazon drukuje zawsze dwa miejsca). Tekst pochodzi
         * z obcego serwisu, więc wzorzec przepuszcza wyłącznie to, co wygląda
         * jak kwota — i wyłącznie waluty, które da się przeliczyć (test pilnuje
         * zgodności z CONFIG.FX_FALLBACK).
         */
        MONEY: String.raw`(?:(EUR|USD|GBP|PLN|SEK|CAD)\s?|(€|\$|£|zł)\s?)(\d{1,3}(?:[., ]\d{3})*[.,]\d{2})`,

        /**
         * Symbol waluty → kod z tablicy kursów. Symbol przepuszczony dalej
         * jako „waluta” nie miałby kursu i kwota wypadłaby z sumy zmiany.
         * „$” zależy od rynku: na amazon.ca to dolar kanadyjski.
         */
        symbolCode(symbol) {
            if (symbol === '$') return store.userConfig.marketplace === 'ca' ? 'CAD' : 'USD';
            return { '€': 'EUR', '£': 'GBP', 'zł': 'PLN' }[symbol] || '';
        },

        normalize(currency, symbol, amount) {
            const cur = currency || this.symbolCode(symbol);
            let a = String(amount).replace(/[ \s]/g, '');
            const ld = a.lastIndexOf('.'), lc = a.lastIndexOf(',');
            if (ld >= 0 && lc >= 0) {
                a = lc > ld ? a.replace(/\./g, '').replace(',', '.') : a.replace(/,/g, '');
            } else if (lc >= 0) {
                a = (a.length - lc - 1) === 2 ? a.replace(',', '.') : a.replace(/,/g, '');
            }
            const n = parseFloat(a);
            return isNaN(n) ? null : this.money(n, cur);
        },

        /**
         * Rozbiór odpowiedzi r.jina.ai w dwóch trybach. Odpowiedź adresowana
         * (x-target-selector) to jeden blok ceny i pierwsza kwota jest ceną.
         * Cała strona (ok. 200 KB) zawiera kilkanaście kwot — tam cenę bierze
         * się tylko po kotwicy „… with N percent savings”.
         */
        parseJina(text, targeted) {
            const body = text.split('Markdown Content:').pop() || '';
            const stale = /cached snapshot/i.test(text);
            // O trybie mówi dostawca (`targeted`), a nie długość ciała — strona
            // zgody na ciasteczka też jest krótka, a ceny na niej nie ma.
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

        /**
         * Wynik rozbioru obrazka do wspólnej postaci. Waluta pochodzi z rynku,
         * z którego zdjęto cenę — przy przeglądzie sklepów to nie wybrany sklep.
         */
        ocrResult(d, market) {
            const key = market || marketplaceKey();
            return {
                current: this.money(d.top.value, marketplace(key).currency),
                rrp: null,
                secondary: d.second ? { text: d.second.text } : null,
                series: d.top.series,
                market: key,
                stale: false,
            };
        },

        // ---------------- źródła ceny ----------------
        /** Źródła ceny w kolejności pytania (kontrakt w nagłówku pliku). */
        list() {
            const self = this;
            const jinaUrl = (asin) => `https://r.jina.ai/https://${marketplace().host}/dp/${encodeURIComponent(asin)}`;
            return [
                {
                    /**
                     * Cena odczytana z obrazka wykresu — pierwsza i domyślna:
                     * nie wymaga klucza ani obcego proxy, tylko obrazka
                     * z graph.keepa.com. Działa też w trybie 'graph' (różnica
                     * to tylko to, czy obrazek się pokazuje), więc dziennik
                     * napełnia się niezależnie od widoku.
                     */
                    name: 'keepa-ocr',
                    kind: 'image',
                    get available() {
                        const pc = store.localTabConfig.priceCard;
                        return pc.source === 'ocr' || pc.source === 'graph' || !!pc.logValues;
                    },
                    // r.jina.ai rozbiera szablon konkretnej witryny — gonienie
                    // go po obcych rynkach nie ma sensu, więc w trybie 'jina'
                    // przeglądu sklepów nie ma.
                    get marketSearch() { return store.localTabConfig.priceCard.source !== 'jina'; },
                    // Obrazka nie przerywa się sygnałem: limit czasu ma sam
                    // PriceNet.image(), stąd `_signal` bez użycia.
                    async run(asin, _signal, market) {
                        const d = await KeepaOCR.read(asin, market);
                        return d ? self.ocrResult(d, market) : null;
                    },
                },
                {
                    // Oficjalne API Keepa: oddaje CORS, wymaga płatnego klucza.
                    // Z kluczem to najlepsze źródło — dokładna cena bez
                    // rozbierania szablonu strony.
                    name: 'keepa-api',
                    kind: 'text',
                    get available() { return !!CONFIG.PRICE_KEEPA_API_KEY; },
                    marketSearch: false,
                    async run(asin, signal) {
                        const u = `https://api.keepa.com/product?key=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_KEY)}`
                                + `&domain=${encodeURIComponent(CONFIG.PRICE_KEEPA_API_DOMAIN)}&asin=${encodeURIComponent(asin)}&stats=1&history=0`;
                        const r = await PriceNet.request(u, { signal });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        const j = await r.json();
                        const p = j.products && j.products[0];
                        if (!p) throw new Error('produktu nie znaleziono');
                        const cents = (v) => (typeof v === 'number' && v > 0) ? v / 100 : null;
                        const st = p.stats || {};
                        const cur = cents(st.current && st.current[1]) ?? cents(st.current && st.current[0]);
                        const rrp = cents(p.listPrice);
                        if (cur == null && rrp == null) throw new Error('w odpowiedzi nie ma cen');
                        const mk = (v) => v == null ? null : self.money(v, 'EUR');
                        return { current: mk(cur), rrp: mk(rrp), stale: false };
                    },
                },
                {
                    name: 'jina/blok',
                    kind: 'text',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    marketSearch: false,
                    async run(asin, signal) {
                        const r = await PriceNet.request(jinaUrl(asin), {
                            signal,
                            headers: {
                                'x-target-selector': CONFIG.PRICE_JINA_SELECTOR,
                                'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S),
                            },
                        });
                        // 422 = bloku na stronie nie ma (inny szablon, strona
                        // zgody na ciasteczka) — próbujemy następnego trybu.
                        if (r.status === 422) throw new Error('nie ma bloku z ceną');
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), true);
                    },
                },
                {
                    name: 'jina/strona',
                    kind: 'text',
                    get available() { return store.localTabConfig.priceCard.source === 'jina'; },
                    marketSearch: false,
                    async run(asin, signal) {
                        const r = await PriceNet.request(jinaUrl(asin), {
                            signal,
                            headers: { 'x-cache-tolerance': String(CONFIG.PRICE_JINA_CACHE_TOLERANCE_S) },
                        });
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return self.parseJina(await r.text(), false);
                    },
                },
            ];
        },

        // ---------------- kursy walut ----------------
        /**
         * ŹRÓDŁA KURSÓW WALUT, pytane po kolei do pierwszego sukcesu
         * (FxRates.init). Wszystkie oddają nagłówki CORS i nie wymagają klucza.
         *   url  — adres zapytania (odpowiedź JSON);
         *   pick — z odpowiedzi wyciąga { WALUTA: jednostek za 1 EUR };
         *          resztę sprawdza FxRates.normalize().
         * Dokładność co do grosza nie jest potrzebna: to szacunek wyniku
         * zmiany, a nie księgowość.
         */
        fxProviders: [
            { name: 'jsdelivr', url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
              pick: (j) => j && j.eur },
            { name: 'er-api',   url: 'https://open.er-api.com/v6/latest/EUR',
              pick: (j) => j && j.rates },
            // floatrates oddaje kurs łańcuchem („1.15514929”) — stąd Number().
            { name: 'floatrates', url: 'https://www.floatrates.com/daily/eur.json',
              pick: (j) => { if (!j) return null; const o = {}; for (const k in j) o[k] = j[k] && Number(j[k].rate); return o; } },
        ],

        // ---------------- diagnostyka ----------------
        /**
         * Sprawdzenia faktyczne do SH.cspReport(): czy obrazek i zapytanie
         * źródeł naprawdę przechodzą przez politykę strony. Wołane tylko przy
         * włączonym module cen (PriceNet i tak by odmówił).
         * @returns {Array<{label: string, run: () => Promise<string>}>}
         */
        probes() {
            return [
                {
                    label: 'obrazek Keepa',
                    // Sam fakt załadowania — piksele niepotrzebne, więc bez crossOrigin.
                    run: () => PriceNet.image(KeepaOCR.url('B0915C748N'), { timeoutMs: 8000, crossOrigin: null })
                        .then(im => (im.naturalWidth > 10 ? 'załadowany' : 'pusty'),
                              e => (/czas/.test(e.message) ? 'przekroczony czas' : 'ZABLOKOWANY')),
                },
                {
                    label: 'zapytanie r.jina.ai',
                    run: () => PriceNet.request('https://r.jina.ai/https://example.com', {
                        headers: { 'x-cache-tolerance': '259200' },
                    }).then(r => 'przeszedł, HTTP ' + r.status, e => 'ZABLOKOWANY (' + e.message + ')'),
                },
            ];
        },
    };

    // ─── src/16-value-log.js ───
    // ==========================================
    // 6e. DZIENNIK WARTOŚCI
    // ==========================================
    /**
     * Wartość przedmiotów przetworzonych w ciągu zmiany.
     *
     * Wpis powstaje tylko przy automatycznym zaliczeniu przedmiotu (wyzwalacz
     * końcowy przy podniesionej fladze). Skróty klawiszowe i ręczne poprawki
     * licznika do dziennika nie piszą — poprawia się zwykle to, czego program
     * nie widział, więc i ceny nie ma. Przedmiot przerwany się nie liczy.
     *
     * Dziennik żyje jedną zmianę i zeruje się razem z licznikami;
     * podsumowanie trafia do archiwum (klucz wspólny, niezależny od schematu).
     * Działa tylko z włączonym modułem cen (add()).
     */
    const ValueLog = {
        entries: [],
        shiftStart: null,
        _archiveTimer: null,
        _writeBackTimer: null,

        key() { return Persistence.getKey(CONFIG.STORAGE_KEY_VALUE_LOG); },
        archiveKey() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_VALUE_ARCHIVE; },

        // ---------------- wspólny dziennik na wszystkie karty ----------------
        /**
         * DZIENNIK JEST JEDEN NA WSZYSTKIE KARTY.
         *
         * Ewidencja idzie po przedmiocie, nie po karcie: ta sama rzecz jedzie
         * z CRET do WHD (znak minus, −150 €), a potem z karty WHD na sprzedaż
         * (plus, +150 €). Poprawny wynik — zero — wychodzi tylko wtedy, gdy oba
         * wpisy leżą w jednym dzienniku.
         *
         * Klucz localStorage jest źródłem prawdy, pamięć karty — kopią roboczą:
         *   1. każdy wpis ma niezmienne `id` i znacznik `updated`;
         *   2. save() czyta wspólny dziennik, scala z nim swoją kopię po id
         *      (wygrywa świeższy `updated`) i zapisuje scalenie — cudzych
         *      wpisów nie da się zamazać;
         *   3. zdarzenie `storage` z sąsiedniej karty woła adoptRemote():
         *      to samo scalanie w drugą stronę;
         *   4. gdy po scaleniu mamy coś, czego we wspólnym dzienniku nie ma,
         *      idzie jeden dopisujący save(); scalanie jest monotoniczne, więc
         *      wymiana się zbiega;
         *   5. usunięcie klucza przez sąsiada to reset zmiany — czyścimy kopię.
         *
         * Pozycje są uporządkowane po czasie (`ts`), nie po kolejności zapisu.
         */
        _migrate(e) {
            if (!e || typeof e !== 'object') return null;
            // Wpis bez id (starszy zapis) dostaje id wyprowadzone z samego
            // wpisu: dwa odczyty tego samego dziennika muszą dać to samo id,
            // inaczej scalanie rozmnoży pozycję.
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
         * Czy po scaleniu mamy coś, czego we wspólnym dzienniku nie ma —
         * nowy wpis albo świeższą wersję istniejącego.
         *
         * Porównanie po id i `updated` (ta sama miara co w _merge), a nie po
         * długości: przy wyścigu zapisów liczba pozycji się zgadza, a różni się
         * treść — wtedy we wspólnym kluczu zostałaby starsza wersja, np.
         * ostatniego przedmiotu zmiany bez kierunku.
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
                // Ten klucz pisze się z pominięciem Persistence.write —
                // notatka deduplikacji dla niego byłaby nieaktualna.
                delete Persistence._lastWritten[this.key()];
            } catch (e) {
                Utils.error('Dziennik wartości nie został zapisany', e);
                Persistence.reportWriteFailure();
            }
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
         * Przerwa tylko skleja paczkę zdarzeń `storage` — sam zapis jest
         * bezpieczny zawsze, bo save() scala.
         */
        _scheduleWriteBack() {
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = setTimeout(() => { this._writeBackTimer = null; this.save(); }, 400);
        },
        /** Czekające dopisanie wykonać od razu — przy wyjściu ze strony. */
        flushWriteBack() {
            if (!this._writeBackTimer) return;
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = null;
            this.save();
        },

        // ---------------- archiwum ----------------
        /**
         * Archiwum trzyma same podsumowania zmian — pełne listy nie
         * zmieściłyby się w localStorage dzielonym z T-REX. Zapis jest
         * odroczony: save() idzie dwa razy na przedmiot, a każdy zapis archiwum
         * to rozbiór i złożenie 60 zmian.
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
         * Zapisuje zrobiony przedmiot; price może być null — dopisze się później.
         * Bez modułu cen nic nie zapisuje: wszystkie pozycje byłyby bez ceny.
         *
         * @returns {string|null} id wpisu (nie indeks — scalanie z cudzymi
         *   wpisami zmienia kolejność w tablicy).
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
                 * Znak kierunku:
                 *    +1 — sprzedaż, wartość na plus;
                 *    -1 — utylizacja, wartość na minus;
                 *     0 — kierunek nieustalony (kod nie przyszedł przed
                 *         następnym przedmiotem albo audyt). Nie wchodzi do
                 *         sum, ale jest liczony osobno (`?N` w linii 6).
                 */
                sign: 0,
                route: null,      // sam kod sortowania, do analizy po fakcie
                updated: now,     // po nim rozstrzyga się konflikt kart
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
            // Trzeci kierunek (audyt) niesie znak 0: wpis zostaje w dzienniku
            // z kodem, ale do sumy pieniędzy nie wchodzi — tak samo, jak
            // przedmiot, przy którym kod się nie pojawił.
            Utils.log(`[DZIENNIK] ${e.asin || 'bez ASIN'} (${e.dept}): `
                    + `${direction === 'sell' ? 'SPRZEDAŻ +' : direction === 'unsell' ? 'NIESPRZEDAŻ -' : 'NIEROZSTRZYGALNY '}`
                    + (e.price != null ? `${e.price} ${e.currency}` : 'bez ceny')
                    + (code ? ` (${code})` : ''));
            return true;
        },

        /**
         * Dopisuje cenę przedmiotom, które skończyły się, zanim ona przyszła
         * (wolna sieć, przegląd sklepów).
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
         * Podsumowanie zmiany w euro, po wszystkich kartach. Każda cena
         * przechodzi przez FxRates.toEur — funtów i dolarów nie dodaje się
         * do euro.
         *
         *   sold   — wartość sprzedanego (znak +1);
         *   unsold — wartość utylizacji (znak -1), jako liczba dodatnia;
         *   net    — różnica, czyli wynik zmiany.
         *
         * Wpisy bez ceny i bez kursu nie wchodzą do sum i są liczone osobno,
         * żeby zaniżona suma miała widoczną przyczynę.
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
            delete Persistence._lastWritten[this.key()];
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
    // 6f. KURSY WALUT
    // ==========================================
    /**
     * Przeliczanie walut przez euro.
     *
     * Cena przychodzi w walucie rynku (funty z co.uk, dolary z com, korony
     * ze se); dodawać ich wprost nie wolno, więc wszystko sprowadza się do euro.
     * Kursy pobiera się raz i trzyma dobę we wspólnym magazynie — kurs przez
     * zmianę nie przesunie się na tyle, żeby było to widać w wyniku (w odróżnieniu
     * od ceny produktu, pytanej przy każdym przedmiocie).
     *
     * Przy wyłączonym module cen kursów się nie pobiera: bierze się te z
     * localStorage, a gdy ich nie ma — CONFIG.FX_FALLBACK. Do sieci wychodzi
     * tylko init() po ręcznym włączeniu modułu.
     */
    const FxRates = {
        rates: null,        // { USD: 1.156, GBP: 0.856, ... } — jednostek za 1 EUR
        source: null,       // nazwa źródła albo 'wbudowane'
        fetchedAt: null,
        offline: false,     // true = kursy wzięte bez dotykania sieci

        key() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_FX_RATES; },

        /**
         * Normalizuje odpowiedź dostawcy do { WALUTA: liczba }. Kurs może
         * przyjść łańcuchem („1.15514929” u floatrates).
         *
         * Granica zaufania do sieci: wchodzi dowolny JSON z cudzego serwera,
         * wychodzi wyłącznie płaska tablica dodatnich, skończonych liczb pod
         * kluczami wielkimi literami.
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
            // Sprawdzenie zdrowego rozsądku: dolar do euro nie jest ani trzy
            // razy droższy, ani trzy razy tańszy. Krzywą odpowiedź lepiej
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
         * Tryb bez sieci — wykonuje się przy starcie. Kursy z localStorage,
         * jeśli są świeże, inaczej tablica wbudowana; ani jednego zapytania.
         * Brak kursów nie jest błędem — przy wyłączonym module to stan normalny.
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
         * Pobranie kursów z sieci — tylko po ręcznym włączeniu modułu cen;
         * sprawdzenie na początku jest ostatnią linią obrony.
         */
        async init() {
            if (!priceModuleOn()) return this.initOffline();
            if (this.loadCached()) {
                this.offline = false;
                Utils.log(`Kursy walut z magazynu (${this.source}), wiek `
                        + `${Math.round((Date.now() - this.fetchedAt) / 3600000)} h`);
                return this.rates;
            }
            for (const p of PriceSources.fxProviders) {
                try {
                    const ctl = new AbortController();
                    const timer = setTimeout(() => ctl.abort(), CONFIG.FX_TIMEOUT_MS);
                    const r = await PriceNet.request(p.url, { signal: ctl.signal, cache: 'no-store' });
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

        /**
         * Euro na walutę wyświetlania — odwrotność toEur, ta sama tablica.
         *
         * @returns {number|null} kwota albo null, jeśli kursu nie ma (wtedy
         *   wywołujący zostaje przy euro, a nie pokazuje zera).
         */
        fromEur(eur, currency) {
            if (typeof eur !== 'number' || !isFinite(eur)) return null;
            const cur = String(currency || 'EUR').toUpperCase();
            if (cur === 'EUR') return eur;
            const table = this.rates || CONFIG.FX_FALLBACK;
            const rate = Object.prototype.hasOwnProperty.call(table, cur) ? table[cur] : null;
            if (!rate || !isFinite(rate) || rate <= 0) return null;
            return eur * rate;
        },

        /**
         * Waluta wyświetlania albo null, czyli „jak w sklepie”.
         *
         * Wartość przychodzi z localStorage, więc może być czymkolwiek:
         * `'__proto__'`, `'XYZ'`, liczbą. Przechodzi wyłącznie 'native' albo
         * klucz własny CONFIG.DISPLAY_CURRENCIES — wszystko inne to wartość
         * domyślna (euro), a nie ciche przejście na waluty sklepów.
         */
        displayCurrency() {
            const own = (c) => typeof c === 'string'
                && Object.prototype.hasOwnProperty.call(CONFIG.DISPLAY_CURRENCIES, c);
            const cur = store.userConfig && store.userConfig.displayCurrency;
            if (cur === 'native') return null;
            if (own(cur)) return cur;
            return own(DEFAULT_USER_CONFIG.displayCurrency) ? DEFAULT_USER_CONFIG.displayCurrency : null;
        },

        /**
         * Kwota w dowolnej walucie pokazana w walucie wyświetlania.
         *
         * `≈` stoi wtedy, gdy kwota została przeliczona: kurs jest dzienny,
         * a bez sieci — wbudowany, więc to szacunek, nie cena z Amazonu. Ta
         * sama waluta co w sklepie idzie bez znaku, bo niczego nie liczono.
         *
         * @returns {string|null} tekst albo null, gdy wybrano „jak w sklepie”
         *   lub nie ma kursu — wtedy wywołujący pokazuje cenę tak, jak przyszła.
         */
        display(value, currency) {
            const cur = this.displayCurrency();
            if (!cur) return null;
            const from = String(currency || 'EUR').toUpperCase();
            const v = from === cur ? value : this.fromEur(this.toEur(value, from), cur);
            if (typeof v !== 'number' || !isFinite(v)) return null;
            return (from === cur ? '' : '≈ ') + this.money(v, cur);
        },

        /** `12.50 zł` — znak po kwocie, jak w linii 6. */
        money(value, currency) {
            return `${value.toFixed(2)} ${CONFIG.DISPLAY_CURRENCIES[currency] || currency}`;
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
    // 6g. DOKĄD POJECHAŁ PRZEDMIOT
    // ==========================================
    /**
     * Ustala, czy przedmiot został sprzedany, czy wysłany do utylizacji,
     * po kodzie sortowania.
     *
     * Osobny automat, a nie sprawdzenie w chwili zakończenia: kod przychodzi
     * przed wyzwalaczem końcowym, razem z nim albo po nim — byle przed
     * następnym przedmiotem. „Kierunek znany” i „przedmiot zaliczony” to dwie
     * niezależne połowy stanu, a wpis do dziennika uzupełnia się wstecz.
     *
     * Scenariusze:
     *   1. kod przyszedł PO +1  -> dopisujemy znak istniejącemu już wpisowi;
     *   2. kod przyszedł PRZED +1 -> czekamy, znak stawiamy przy tworzeniu wpisu;
     *   3. kod i +1 w jednej klatce -> kolejność wewnątrz scan() gwarantuje, że
     *      kierunek czyta się wcześniej niż licznik;
     *   4. kodu nie było wcale -> wpis zostaje neutralny (sign 0), do sumy nie
     *      wchodzi, ale widać go w linii 6 jako „?N”.
     *
     * Liczy się wystąpienia kodów, a nie samo „jest w tekście”: na ekranie
     * wisi dziennik, w którym stary kod zostaje, i doczepiłby się do
     * następnego przedmiotu. Kod zadziałał, gdy liczba jego wystąpień wzrosła —
     * to działa także dla dwóch jednakowych kodów pod rząd.
     */
    const Routing = {
        state: null,        // { completed, entryId, code, direction, pending }
        _prev: null,        // liczniki poprzedniego skanu
        /**
         * Niezamknięty Secondary-Sorting: stan przedmiotu, który dostał kod
         * niejednoznaczny i czeka na uściślenie. Żyje oddzielnie od this.state
         * i przeżywa zmianę ASIN — linia uściślająca bywa spóźniona.
         */
        _ambiguous: null,

        codes() {
            return [...CONFIG.ROUTE_SELL_CODES, ...CONFIG.ROUTE_UNSELL_CODES,
                    ...CONFIG.ROUTE_NEUTRAL_CODES, ...CONFIG.ROUTE_AMBIGUOUS_CODES];
        },

        /**
         * Kierunek dla kodu, który już trafił w listę.
         *
         * Kolejność sprawdzeń jest kolejnością pewności: sprzedaż i niesprzedaż
         * rozstrzygają od razu, `neutral` nie rozstrzygnie się nigdy,
         * `ambiguous` rozstrzygnie się następną linią.
         *
         * @returns {'sell'|'unsell'|'neutral'|'ambiguous'|null}
         */
        kindOf(code) {
            if (CONFIG.ROUTE_SELL_CODES.includes(code)) return 'sell';
            if (CONFIG.ROUTE_UNSELL_CODES.includes(code)) return 'unsell';
            if (CONFIG.ROUTE_NEUTRAL_CODES.includes(code)) return 'neutral';
            if (CONFIG.ROUTE_AMBIGUOUS_CODES.includes(code)) return 'ambiguous';
            return null;
        },

        codeRegex() {
            if (this._re) return this._re;
            // Ucieczka znaków specjalnych: wzorzec powstaje z łańcucha, a kod
            // z kropką albo nawiasem zmieniłby znaczenie wyrażenia.
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
         * @param {{closeAmbiguous?: boolean}} [opts] - closeAmbiguous mówi, że
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
                           direction: null, pending: false, counted: false };
            if (reason) Utils.log(`[KIERUNEK] nowy przedmiot (${reason})`);
        },

        /**
         * Secondary-Sorting bez uściślenia to niesprzedaż. Reguła jest
         * niesymetryczna, bo taki jest system: potwierdzenie sprzedaży
         * (`Transfer - Sellable`) przychodzi zawsze, a niesprzedaży
         * (`FBATransfer`) — nie zawsze.
         */
        closeAmbiguous(reason) {
            const a = this._ambiguous;
            this._ambiguous = null;
            if (!a || !a.pending) return;
            a.pending = false;
            a.direction = 'unsell';
            Utils.log(`[KIERUNEK] ${a.code || 'kod niejednoznaczny'} bez uściślenia -> NIESPRZEDAŻ (${reason})`);
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
            const kind = this.kindOf(code);
            if (kind === 'ambiguous') {
                // Sam z siebie niczego nie rozstrzyga — czekamy na linię uściślającą.
                this.state.pending = true;
                this.state.direction = null;
                this._ambiguous = this.state;
                Utils.log(`[KIERUNEK] ${code} — czekam na uściślenie`);
                return;
            }
            this.state.pending = false;
            if (this._ambiguous === this.state) this._ambiguous = null;
            // `neutral` jest pełnoprawnym kierunkiem, a nie brakiem kierunku:
            // wiemy o przedmiocie wszystko, co da się wiedzieć, i właśnie
            // dlatego wypada on z mianownika procentu.
            this.state.direction = kind;
            Utils.log(`[KIERUNEK] ${code} -> ${this.directionName(kind)}`);
            this.apply();
        },

        /** Nazwa kierunku do dziennika w konsoli. */
        directionName(dir) {
            return dir === 'sell' ? 'SPRZEDAŻ'
                 : dir === 'unsell' ? 'NIESPRZEDAŻ'
                 : 'NIEROZSTRZYGALNY (poza procentem)';
        },

        onConfirm(dir) {
            // Uściślenie ma sens tylko po niejednoznacznym kodzie — linia
            // „Przedmiot wysłano do ...” występuje też sama z siebie. Celem
            // jest bieżący przedmiot, a gdy ten już się zmienił — wiszący
            // Secondary-Sorting poprzedniego.
            const target = (this.state && this.state.pending) ? this.state
                         : (this._ambiguous && this._ambiguous.pending) ? this._ambiguous
                         : null;
            if (!target) return;
            target.pending = false;
            target.direction = dir;
            if (this._ambiguous === target) this._ambiguous = null;
            Utils.log(`[KIERUNEK] uściślono: ${target.code || 'kod niejednoznaczny'} -> `
                    + this.directionName(dir));
            this.applyTo(target);
        },

        /**
         * Przedmiot zaliczony przez licznik: od tego momentu wolno zastosować sumę.
         * @param {string|null} entryId — id wpisu dziennika (nie indeks:
         *   scalanie zmienia kolejność). Bez modułu cen to `null` — kierunek
         *   i tak się zalicza, bo procent sprzedaży dziennika nie potrzebuje.
         */
        onCompleted(entryId) {
            if (!this.state) this.startItem('zakończenie bez początku');
            this.state.completed = true;
            this.state.entryId = entryId;
            this.apply();
        },

        /**
         * PROCENT SPRZEDAŻY — licznik sprzedanych i odjęcie z mianownika.
         *
         * Liczy się dokładnie raz na przedmiot, gdy znane są oba warunki:
         * przedmiot zaliczony i kierunek ustalony. Przychodzą w dowolnej
         * kolejności, a applyTo woła się po każdym — stąd znacznik `counted`.
         *
         * Mianownik = licznik przedmiotów minus przedmioty spoza mianownika
         * (`tabNeutral`). Różnica między audytem a brakiem kodu jest celowa:
         *   - audyt wypada z mianownika — decyzja zapadnie później i gdzie indziej;
         *   - brak kodu zostaje w mianowniku — przedmiot gdzieś pojechał, tylko
         *     skrypt tego nie zobaczył; wyrzucenie go podnosiłoby procent przy
         *     każdym przeoczeniu.
         *
         * Ręczne poprawki licznika tu nie wchodzą — kierunku takiego przedmiotu
         * nikt nie zna.
         */
        countDirection(st) {
            if (!st || st.counted || !st.completed || !st.direction) return;
            st.counted = true;
            const cid = store.currentTabInstanceId;
            // Kierunek trafia do liczników zmiany (linie 1, 2, 7) i do
            // bieżącego zadania (linia 8) w jednym wywołaniu, żeby suma zadań
            // nie rozjechała się z licznikiem karty. +1 od wartości
            // w magazynie — dwie karty działu dzielą klucz (freshCount).
            if (st.direction === 'sell') {
                Persistence.bump(CONFIG.STORAGE_PREFIX_TAB_SOLD, store.tabSold, cid);
                TaskManager.addSold(cid);
            } else if (st.direction === 'neutral') {
                Persistence.bump(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL, store.tabNeutral, cid);
                TaskManager.addNeutral(cid);
            }
        },

        /**
         * Zapisuje znak, gdy znane są oba warunki: przedmiot zaliczony i kierunek
         * ustalony, w dowolnej kolejności. Procent liczy się przed sprawdzeniem
         * wpisu dziennika — bez modułu cen wpisu nie ma, a procent ma działać.
         */
        applyTo(st) {
            this.countDirection(st);
            if (!st || !st.completed || !st.entryId || !st.direction) return;
            ValueLog.setDirection(st.entryId, st.direction, st.code);
        },
        apply() { this.applyTo(this.state); },

        info() {
            const st = this.state || {};
            const amb = this._ambiguous;
            return { kod: st.code || '—', kierunek: st.direction || 'nieokreślony',
                     'czeka na uściślenie': !!st.pending, 'przedmiot zaliczony': !!st.completed,
                     'wisi kod niejednoznaczny': amb ? (amb === st ? 'bieżący przedmiot' : 'poprzedni przedmiot') : 'nie' };
        },
    };

    // ─── src/19-price-module.js ───
    // ==========================================
    // 6h. WŁĄCZNIK MODUŁU CEN
    // ==========================================
    /**
     * Dwie operacje: „obudź sieć” i „uśpij sieć”. Woła je wyłącznie panel
     * ustawień oraz konsola (SH.priceOn() / SH.priceOff()).
     *
     * Pierwsze zapytanie do sieci zewnętrznej wychodzi stąd i znikąd indziej.
     * Dopóki enable() nie zostanie wywołane, FxRates i PriceCard nie
     * nawiązują połączeń, a PriceNet — jedyne wyjście do sieci modułu cen —
     * odmawia; każde z nich sprawdza to samodzielnie.
     */
    const PriceModule = {
        enable() {
            store.localTabConfig.priceCard.moduleEnabled = true;
            Persistence.saveState();
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
            Persistence.saveState();
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
     * Skąd przychodzi cena, karta nie wie: pyta źródła z PriceSources według
     * kontraktu (src/15-price-sources.js), a sama prowadzi to, co wspólne dla
     * każdego źródła — limity i przerwy między zapytaniami, limit czasu,
     * przegląd innych sklepów, blokady CSP i rysowanie.
     *
     * Jedno zapytanie na przedmiot, pytane przy nowym ASIN albo na początku
     * nowego przedmiotu. Nic nie wychodzi, dopóki moduł cen nie zostanie
     * włączony ręcznie.
     */
    const PriceCard = {
        // asin -> {status, current, rrp, source, ms}. To nie pamięć cen (cena
        // jest pytana przy każdym przedmiocie), tylko ostatni wynik do
        // rysowania, póki leci nowe zapytanie. Rozmiar ogranicza _remember().
        cache: new Map(),
        inFlight: new Set(),
        shownAsin: null,
        // ASIN, dla którego właśnie trwa przegląd sklepów.
        searchingOther: null,
        awaiting: false,         // zaczął się nowy przedmiot, czekamy na ASIN
        requestCount: 0,
        // Obrazki liczą się osobno od zapytań tekstowych — mają własny limit
        // (CONFIG.PRICE_MAX_IMAGE_REQUESTS).
        imageCount: 0,
        nextSlotAt: 0,
        el: null,

        /**
         * Blokady Content-Security-Policy — druga bariera, niezależna od CORS.
         * Wystawia ją serwer strony i z kodu strony obejść się jej nie da;
         * brakujące źródło przeglądarka tnie przed wyjściem w sieć.
         *
         * Blokadę zgłasza zdarzenie securitypolicyviolation — po nim karta
         * mówi, dlaczego ceny nie ma, zamiast zostawić pustą ramkę.
         */
        csp: { img: false, net: false, notified: false },

        // ---------------- źródła ----------------
        /**
         * Czy źródło można teraz pytać: włączone w ustawieniach i nie
         * zablokowane przez CSP. Blokada img-src wyłącza źródła obrazkowe;
         * blokadę connect-src sprawdza pętla w resolve() przy każdym obiegu.
         */
        usable(s) {
            if (s.available === false) return false;
            return !(s.kind === 'image' && this.csp.img);
        },

        /** Źródło do przeglądu innych sklepów albo null, gdy żadne się nie nadaje. */
        marketSearcher() {
            return PriceSources.list().find(s => s.marketSearch && this.usable(s)) || null;
        },

        /**
         * Liczniki i limity idą po rodzaju źródła: obrazki i zapytania
         * tekstowe mają osobne liczniki i osobne limity.
         */
        used(kind) { return kind === 'image' ? this.imageCount : this.requestCount; },
        cap(kind) {
            return kind === 'image' ? CONFIG.PRICE_MAX_IMAGE_REQUESTS : CONFIG.PRICE_MAX_REQUESTS_PER_SESSION;
        },
        count(kind) { if (kind === 'image') this.imageCount++; else this.requestCount++; },

        // ---------------- sieć ----------------
        /**
         * Przerwa między zapytaniami. Slot rezerwuje się synchronicznie, przed
         * pierwszym await — inaczej dwa równoległe resolve() odczytałyby tę
         * samą wartość i wyszły w sieć jednocześnie.
         */
        respectRateLimit() {
            const now = Date.now();
            const slot = Math.max(now, this.nextSlotAt || 0);
            this.nextSlotAt = slot + CONFIG.PRICE_MIN_REQUEST_GAP_MS;
            const wait = slot - now;
            return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve();
        },

        /**
         * Limit czasu zapytania: po przekroczeniu fetch jest przerywany
         * (AbortController), a timer zdejmowany w każdym przypadku.
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
         * Kolejność przeglądu sklepów: rynek z linku na stronie, potem Europa,
         * na końcu PRICE_FALLBACK_LAST — w obrębie grupy losowo. Bez wybranego
         * rynku (ten już odpowiedział „nie ma”) i bez rynków, dla których
         * źródła nie mają danych (PriceSources.coversMarket).
         *
         * @param {string} from       rynek już sprawdzony
         * @param {string|null} hint  rynek z linku do produktu na stronie
         * @param {function} [random] źródło losowości (testy podają własne)
         */
        fallbackOrder(from, hint, random = Math.random) {
            const shuffle = (list) => {
                for (let i = list.length - 1; i > 0; i--) {     // tasowanie Fishera-Yatesa
                    const j = Math.floor(random() * (i + 1));
                    [list[i], list[j]] = [list[j], list[i]];
                }
                return list;
            };
            const pool = Object.keys(CONFIG.MARKETPLACES)
                .filter(k => k !== from && k !== hint && PriceSources.coversMarket(k));
            const late = pool.filter(k => CONFIG.PRICE_FALLBACK_LAST.includes(k));
            const first = hint && hint !== from && PriceSources.coversMarket(hint) ? [hint] : [];
            return first
                .concat(shuffle(pool.filter(k => !late.includes(k))), shuffle(late))
                .slice(0, CONFIG.PRICE_FALLBACK_MAX_TRIES);
        },

        /**
         * PRZEGLĄD POZOSTAŁYCH SKLEPÓW, gdy wybrany rynek ceny nie dał
         * (zasady: CONFIG.PRICE_FALLBACK_*). Pyta źródło z marketSearcher()
         * rynek po rynku. Zwraca pierwszy sukces albo null. Wybrany sklep się
         * nie zmienia — następny przedmiot zaczyna od niego.
         */
        async tryOtherMarkets(asin) {
            const src = this.marketSearcher();
            if (!src) return null;
            const from = marketplaceKey();
            const hint = this.linkMarket && this.linkMarket.asin === asin ? this.linkMarket.key : null;
            const tries = this.fallbackOrder(from, hint);
            Utils.log(`[CENA] ${asin}: na ${from} ceny nie ma, próbuję ${tries.join(', ')}`);

            for (const key of tries) {
                // Moduł mógł zostać wyłączony w trakcie przeglądu — przerywamy
                // natychmiast, zamiast dosyłać resztę zapytań.
                if (!priceModuleOn()) break;
                // Blokada CSP mogła przyjść w trakcie przeglądu.
                if (!this.usable(src)) break;
                if (this.used(src.kind) >= this.cap(src.kind)) {
                    Utils.log('[CENA] przegląd zatrzymany: limit zapytań');
                    break;
                }
                await new Promise(r => setTimeout(r, CONFIG.PRICE_FALLBACK_DELAY_MS));
                // ASIN mógł się zmienić w trakcie przeglądu — wtedy przegląd jest zbędny.
                if (this.shownAsin !== asin) {
                    Utils.log(`[CENA] ${asin}: przegląd przerwany, na ekranie jest już inny przedmiot`);
                    return null;
                }
                this.count(src.kind);
                const t0 = Date.now();
                try {
                    const out = await this.withTimeout(
                        (signal) => src.run(asin, signal, key), CONFIG.PRICE_REQUEST_TIMEOUT_MS);
                    if (out && (out.current || out.rrp)) {
                        Utils.log(`[CENA] ${asin}: znalezione na ${marketplace(key).host} — ${(out.current || out.rrp).text}`);
                        return { status: 'ok', ...out, market: key, source: src.name, fallback: true, ms: Date.now() - t0 };
                    }
                    Utils.log(`[CENA] ${asin}: na ${key} ceny też nie ma`);
                } catch (e) {
                    Utils.log(`[CENA] ${asin}: ${key} — ${e.message}`);
                }
            }
            return null;
        },

        /**
         * Zapytać ponownie o cenę produktu na ekranie (po zmianie ustawień).
         * Gdy po tym ASIN już leci zapytanie, `inFlight` nowego nie przepuści
         * — wtedy zostaje flaga, a resolve() po zakończeniu sam ponawia
         * odświeżenie (inaczej po zmianie sklepu została cena starego rynku).
         */
        _refreshPending: null,
        refresh() {
            const asin = this.shownAsin;
            if (!asin) { this.render(); return; }
            if (this.inFlight.has(asin)) { this._refreshPending = asin; return; }
            this._refreshPending = null;
            this.resolve(asin);
        },

        /**
         * Pyta o cenę — na nowo przy każdym przedmiocie. Cena na Amazonie
         * zmienia się w ciągu dnia, więc trwałej pamięci cen nie ma; `cache`
         * to tylko ostatni wynik do rysowania.
         *
         * Przed lawiną chroni `inFlight` (drugie zapytanie po tym samym ASIN nie
         * wychodzi), a częstotliwość ogranicza cykl obsługi: check() woła
         * resolve() przy zmianie ASIN albo na początku przedmiotu, nie przy
         * każdej mutacji DOM. Pierwszy warunek to moduł cen — ta sama bariera
         * co w PriceNet, celowo na wejściu i na wyjściu.
         */
        async resolve(asin) {
            if (!asin) return null;
            if (!priceModuleOn()) return null;
            if (this.inFlight.has(asin)) return null;


            // Ani jednego włączonego źródła — do sieci nie idziemy wcale.
            // To normalny stan w trybie 'legend': cenę widać na obrazku.
            if (!PriceSources.list().some(p => this.usable(p))) {
                this._remember(asin, { status: 'off' });
                this.render();
                return null;
            }

            this.inFlight.add(asin);
            this.render();

            let result = { status: 'fail', reason: I18n.get('priceCard_noPrice') };
            try {
                let limitHit = false;
                for (const p of PriceSources.list()) {
                    if (!this.usable(p)) continue;
                    // securitypolicyviolation przychodzi asynchronicznie, po
                    // odmowie fetch — flagę sprawdzamy w każdym obiegu, żeby
                    // następny dostawca nie wchodził w zablokowaną sieć.
                    if (this.csp.net) break;

                    const isImg = p.kind === 'image';
                    const used = this.used(p.kind);
                    const cap = this.cap(p.kind);
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
                        this.count(p.kind);
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

                // Ceny na wybranym rynku nie ma — próbujemy pozostałych,
                // o ile któreś źródło nadaje się do przeglądu (marketSearch).
                const wantsFallback = CONFIG.PRICE_FALLBACK_ENABLED
                    && priceModuleOn()
                    && store.localTabConfig.priceCard.marketFallback !== false
                    && result.status !== 'ok'
                    && !limitHit
                    && !!this.marketSearcher();
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
         * Zapamiętać wynik po ASIN, przycinając pamięć karty do
         * PRICE_CACHE_MAX_ENTRIES. Mapa trzyma kolejność wstawiania, więc
         * „usuń i włóż od nowa” robi z niej LRU — bez przycinania rosłaby przez
         * całą zmianę.
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
        /**
         * Rynek z linku do produktu: `https://www.amazon.it/dp/…` → 'it'.
         *
         * Tylko hosty z CONFIG.MARKETPLACES, porównane w całości — link
         * względny, obcy host albo `amazon.it.evil.example` dają null. Wynik
         * decyduje wyłącznie o kolejności przeglądu rynków; adres zapytania
         * składa się z tablicy, a nie z tekstu strony.
         */
        marketFromHref(href) {
            const m = /^(?:https?:)?\/\/([^/?#:]+)/i.exec(String(href || ''));
            if (!m) return null;
            const host = m[1].toLowerCase().replace(/^www\./, '');
            return Object.keys(CONFIG.MARKETPLACES)
                .find(k => CONFIG.MARKETPLACES[k].host.replace(/^www\./, '') === host) || null;
        },

        /**
         * Rynek linku, z którego wzięto ostatni ASIN: { asin, key } albo null.
         * ASIN z samego tekstu strony rynku nie ma — wtedy przegląd idzie
         * zwykłą kolejnością.
         */
        linkMarket: null,

        detectAsin() {
            for (const a of document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')) {
                if (a.closest('#' + CONFIG.SCRIPT_ID_PREFIX + 'priceCard')) continue;
                const href = a.getAttribute('href') || '';
                const m = href.match(CONFIG.PRICE_ASIN_FROM_HREF);
                if (m) {
                    const key = this.marketFromHref(href);
                    this.linkMarket = key ? { asin: m[1], key } : null;
                    return m[1];
                }
            }
            this.linkMarket = null;
            // Rezerwa po tekście, gdy linku do produktu nie ma.
            //
            // ASIN tylko wtedy, gdy na stronie jest jeden: przy kilku kolejność
            // w dokumencie nie mówi, który jest bieżący (pierwszy to bywa stary
            // wpis dziennika, ostatni — cudzy panel stanu). Przy
            // niejednoznaczności karta zostaje przy ostatnim pewnym ASIN.
            //
            // Karta znika na czas odczytu, żeby nie podać własnego ASIN
            // (pokazuje poprzedni przedmiot). Przywrócenie w `finally` —
            // innerText rzuca przy rozbieranym drzewie, a karta nie może
            // zostać schowana na zawsze.
            const prev = this.el && this.el.style.display;
            let text;
            try {
                if (this.el) this.el.style.display = 'none';
                text = document.body.innerText || '';
            } finally {
                if (this.el) this.el.style.display = prev || '';
            }

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
         * CSP to imienna lista hostów, a nie wyłącznik: to, że skrypt się
         * załadował, znaczy tylko, że dozwolony jest host, z którego go
         * pobrano, a nie hosty źródeł ceny (PriceSources.cspHosts).
         *
         * Polityka częściej przychodzi nagłówkiem HTTP niż meta-tagiem, więc
         * nagłówek doczytuje się zapytaniem o własną stronę (własny origin,
         * przechodzi nawet przy `connect-src 'self'`). To jedyne zapytanie
         * niezależne od modułu cen: nie wychodzi poza własną domenę i leci tylko
         * po ręcznym SH.cspReport().
         */
        async readCsp() {
            const meta = /** @type {HTMLMetaElement|null} */ (
                document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
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

            // Rozbiór źródeł według gramatyki CSP: host (z maską *.),
            // sam schemat (`https:`), 'none' i 'self'.
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
         * przedmiotu: przy porzuconym przedmiocie flaga itemInProgress zostaje
         * podniesiona, armNewItem() nie zadziała, a karta i tak musi pokazać
         * nowy produkt.
         *
         * `awaiting` obsługuje przypadek odwrotny: ten sam ASIN pod rząd (pięć
         * jednakowych zwrotów) — ASIN się nie zmienia, więc o nowym zapytaniu
         * decyduje początek nowego przedmiotu.
         */
        check() {
            // Bez modułu cen ASIN nie jest potrzebny — służy tylko zapytaniu.
            if (!priceModuleOn()) return;
            const pc = store.localTabConfig.priceCard;
            // Karta może być schowana przy prowadzonym dzienniku (widać tylko
            // sumę w linii 6) — wychodzimy dopiero, gdy nie ma ani karty,
            // ani dziennika.
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
             * Kod produktu — jedyny element karty, który może łapać mysz.
             * Karta i jej dzieci mają `pointer-events:none`; link odzyskuje
             * zdarzenia własnym `pointer-events:auto`, gdy klikalność jest
             * włączona (applyStyle). Prowadzi do /dp/<ASIN> w sklepie, z którego
             * wzięto cenę.
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
            // Obrazek wykresu idzie bez nagłówka Referer — adres strony T-REX
            // nie wychodzi do serwisu wykresu (a Keepa bez tego obrazka nie oddaje).
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

            // Blokady CSP po hostach źródeł ceny. Referencja do obsługi jest
            // zapamiętana dla Main.teardown().
            this.onCspViolation = (e) => {
                const uri = String(e.blockedURI || '');
                if (!Object.keys(PriceSources.cspHosts).some(host => uri.includes(host))) return;

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

            // Zmieniło się źródło ceny — wpisy 'off' w pamięci przestały być prawdziwe.
            bus.on('store:changed:localTabConfig.priceCard.source', () => this.refresh());
            bus.on('store:changed:localTabConfig.priceCard.logValues', () => this.refresh());
            // Zmiana sklepu zmienia i wykres, i walutę — pytamy ponownie.
            bus.on('store:changed:userConfig.marketplace', () => { this.cache.clear(); this.refresh(); });

            // Nowy przedmiot — wznosimy pokaz (przypadek „pięć jednakowych pod rząd”).
            bus.on('store:changed:uiFlags.itemInProgress', (d) => { if (d.value === true) this.armNewItem(); });
            // Stronę skanuje AutoTrigger, osobnego obserwatora nie zakładamy.
            bus.on('page:scanned', () => this.check());
            // Karta zależy tylko od własnych ustawień i języka.
            onStorePaths(['localTabConfig.priceCard', 'userConfig.language'], () => this.applyStyle());

            this.check();
        },

        /**
         * Kolor wszystkich tekstów karty — jedna wartość na kartę, jak w liniach
         * okna. Liczony przy każdym applyStyle(), więc zmiana w panelu działa
         * od razu.
         */
        textColor() {
            const pc = store.localTabConfig.priceCard;
            const alpha = Utils.clampNum(pc.alpha, 0, 100, 50) / 100;
            return `rgba(${Utils.hexToRgb(pc.colorHex)}, ${alpha.toFixed(3)})`;
        },

        applyStyle() {
            if (!this.el) return;
            const pc = store.localTabConfig.priceCard;

            // Bez modułu cen karty nie ma na ekranie — sama „—” sugerowałaby,
            // że coś liczy się w tle.
            this.el.style.display = (pc.visible && priceModuleOn()) ? 'block' : 'none';
            this.el.style.width = `${Utils.clampNum(pc.width, 120, 1600, 280)}px`;
            this.el.style.left = pc.position.left || '14px';
            if (pc.position.top) { this.el.style.top = pc.position.top; this.el.style.bottom = 'auto'; }
            else { this.el.style.top = 'auto'; this.el.style.bottom = '14px'; }

            // Tło, ramka i cień idą razem: przy przezroczystym tle ramka i cień
            // zostawiłyby pustą obwódkę nad stroną. Nie ma tła — zostaje sam
            // tekst, jak w liniach okna.
            const bgAlpha = Utils.clampNum(pc.bgAlpha, 0, 100, 0);
            const rgb = Utils.hexToRgb(pc.bgColorHex);
            this.el.style.background = bgAlpha > 0 ? `rgba(${rgb}, ${bgAlpha / 100})` : 'transparent';
            this.el.style.border = bgAlpha > 0 ? '1px solid rgba(130,170,255,.40)' : 'none';
            this.el.style.boxShadow = bgAlpha > 0 ? '0 6px 26px rgba(0,0,0,.55)' : 'none';
            this.el.style.padding = bgAlpha > 0 ? '10px 14px' : '0';
            // Krój z tej samej listy, co okno statystyk: karta ma czytać się jak
            // reszta interfejsu, a nie jak osobny widżet.
            this.el.style.fontFamily =
                CONFIG.FONT_FAMILY_OPTIONS[pc.fontFamily] || CONFIG.FONT_FAMILY_OPTIONS.default;

            // Właściwości osobno, nie skrótem `font:` — skrót wymaga rodziny,
            // nie przyjmuje `inherit` i przeglądarka po cichu wyrzuca całą regułę.
            const fs = Utils.clampNum(pc.fontSize, 10, 96, 16);
            const px = (k) => Math.max(9, Math.round(fs * k)) + 'px';

            // Słaby cień tekstu, bo tło bywa przezroczyste: jasny tekst na
            // jasnym fragmencie strony przestałby być czytelny.
            const SHADOW = 'text-shadow:0 1px 3px rgba(0,0,0,.6)';
            const COLOR = 'color:' + this.textColor();

            // pointer-events:auto — ten jedyny wyjątek od przezroczystej karty.
            // Przy włączonym przeciąganiu jest zdejmowany: wtedy ciągnie się całą
            // kartę, a kliknięcie w link wyprowadziłoby ze strony w środku gestu.
            const dragging = store.uiFlags.isPriceCardDragging;
            // Klikalność kodu produktu (domyślnie wyłączona — to jedyne miejsce,
            // w którym karta mogłaby przykryć przycisk T-REX). Przy przeciąganiu
            // link jest zdejmowany niezależnie od ustawienia.
            const linkOn = pc.asinClickable === true && !dragging;
            this.asinEl.style.cssText = [
                'font-weight:400', 'font-size:' + px(0.8), 'line-height:1.3',
                COLOR, 'letter-spacing:.5px', 'text-transform:uppercase',
                'display:' + (pc.showAsin === false ? 'none' : 'inline-block'),
                'pointer-events:' + (linkOn ? 'auto' : 'none'),
                'cursor:' + (linkOn ? 'pointer' : 'inherit'),
                'text-decoration:' + (linkOn ? 'underline' : 'none'),
                'text-decoration-style:dotted', 'text-underline-offset:2px',
                SHADOW,
            ].join(';');

            // Cena tą samą grubością co linie okna — to podpowiedź, nie baner.
            this.priceEl.style.cssText = [
                'font-weight:400', 'font-size:' + px(1), 'line-height:1.25',
                'margin:' + (bgAlpha > 0 ? '4px 0 2px' : '1px 0 0'),
                COLOR, SHADOW, 'letter-spacing:.2px',
            ].join(';');

            this.rrpEl.style.cssText = [
                'font-weight:400', 'font-size:' + px(0.8), 'line-height:1.3',
                COLOR, SHADOW,
            ].join(';');

            this.srcEl.style.cssText = [
                'font-size:' + px(0.7), 'line-height:1.35',
                COLOR, 'margin-top:' + (bgAlpha > 0 ? '4px' : '1px'),
                SHADOW,
            ].join(';');

            // Tryby wykresu. Przycięcie: obrazek w natywnych 500x200 przesuwa
            // się w lewo, więc zwężenie karty odcina wykres z lewej, a legenda
            // (prawy górny róg) zostaje piksel w piksel. Bez przycięcia: cały
            // wykres wpisany w szerokość karty.
            const inner = Utils.clampNum(pc.width, 120, 1600, 280) - 28;
            const chart = PriceSources.chart;
            const W = chart ? chart.width : 0, H = chart ? chart.height : 0;
            const frame = (w, h) => `overflow:hidden;width:${w}px;height:${h}px;margin-top:8px;`
                + 'border-radius:5px;border:1px solid rgba(255,255,255,.18);background:#fff';

            if (!chart) {
                // Źródła bez wykresu — ramki nie ma czym wypełnić.
            } else if (pc.graphMode === 'legend') {
                // TYLKO BLOK Z CENAMI. Obrazek wychodzi w całości, ale okienko
                // pokazuje wyłącznie ramkę legendy, a ujemne marginesy podsuwają
                // potrzebny fragment pod to okienko.
                const { x: LX, y: LY, w: LW, h: LH } = chart.legend;
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
            // Ramka wykresu tylko w trybie, który go pokazuje (showsChart). Przy
            // odczycie ceny z obrazka ten żyje poza dokumentem (canvas) i na
            // ekran nie trafia. Przy blokadzie CSP pustej ramki nie pokazujemy.
            this.graphWrap.style.display =
                (PriceSources.showsChart(pc.source) && pc.showGraph && !this.csp.img && priceModuleOn()) ? 'block' : 'none';

            this.render();
        },

        /**
         * Tekst ceny na karcie: w walucie wyświetlania, jeśli ją wybrano,
         * inaczej tak, jak przyszła ze sklepu. Obiekt ceny się nie zmienia —
         * do dziennika idzie kwota i waluta sklepu, do sumy euro.
         */
        priceText(p) {
            return FxRates.display(p.value, p.currency) || p.text;
        },

        /**
         * Wpisuje tekst w wiersz karty; pusty tekst chowa wiersz, żeby nie
         * zostawała pusta linijka.
         *
         * Wiersz RRP i wiersz źródła niosą raz informację dodatkową (cena
         * katalogowa, dostawca, czas), a raz powód braku ceny (CSP, limit,
         * brak wyniku). Wyłączniki `showRrp` i `showSource` dotyczą tylko
         * pierwszej roli — powód awarii pokazuje się zawsze, bo karta z samą
         * kreską wygląda jak zepsuty skrypt. Stany przejściowe (zapytanie,
         * przegląd sklepów) idą pod wyłącznikami, żeby nie migać drugim
         * wierszem przy każdym przedmiocie. O roli decyduje wywołujący.
         *
         * @param {HTMLElement} el   wiersz do zapisania
         * @param {string} text      treść; pusta chowa wiersz
         */
        setLine(el, text) {
            el.textContent = text || '';
            el.style.display = text ? 'block' : 'none';
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
                this.rrpEl.textContent = ''; this.srcEl.textContent = '';
                this.graphWrap.style.display = 'none';
                return;
            }

            this.asinEl.textContent = `${asin}`;
            // Link prowadzi na rynek, z którego zdjęto cenę — po przeglądzie
            // sklepów to nie wybrany sklep.
            const found = this.cache.get(asin);
            if (pc.asinClickable === true) {
                const url = productUrl(asin, found && found.market);
                this.asinEl.setAttribute('href', url);
                this.asinEl.title = url;
            } else {
                // Bez klikalności kod jest zwykłym tekstem, bez href: element
                // z href zostaje w kolejności tabulacji i otwiera się środkowym
                // przyciskiem, nawet przy `pointer-events:none`.
                this.asinEl.removeAttribute('href');
                this.asinEl.title = '';
            }
            // !csp.img także tutaj — applyStyle() chowa ramkę, a render()
            // idzie później i przywróciłby ją.
            if (PriceSources.showsChart(pc.source) && pc.showGraph && !this.csp.img && priceModuleOn()) {
                this.graphWrap.style.display = 'block';
                const want = PriceSources.chart.url(asin, found && found.market);
                if (this.graphImg.getAttribute('src') !== want) this.graphImg.setAttribute('src', want);
            }

            if (this.inFlight.has(asin)) {
                // Póki trwa zapytanie, zostaje poprzedni wynik po tym ASIN —
                // „…” migałoby przy każdym przedmiocie.
                const prev = this.cache.get(asin);
                this.priceEl.style.display = 'block';
                this.priceEl.textContent =
                    (prev && prev.status === 'ok' && prev.current && pc.showPrice)
                        ? this.priceText(prev.current) : '…';
                this.rrpEl.style.textDecoration = 'none';
                // Stan przejściowy, nie awaria — idzie pod wyłącznikami.
                const hunting = this.searchingOther === asin;
                this.setLine(this.rrpEl, pc.showRrp
                    ? I18n.get(hunting ? 'priceCard_searchingOther' : 'priceCard_searching') : '');
                this.setLine(this.srcEl, pc.showSource && !hunting
                    ? I18n.get('priceCard_refreshing') : '');
                return;
            }

            const r = this.cache.get(asin);

            // Kolejność gałęzi jest ważna: najpierw „czy cena jest”, dopiero
            // potem „dlaczego jej nie ma”. Blokada samego obrazka (img-src) nie
            // może wyrzucić ceny otrzymanej zapytaniem tekstowym (connect-src).

            // 1. Cena jest — pokazujemy, cokolwiek blokowałaby polityka.
            if (r && r.status === 'ok') {
                const price = r.current || r.rrp;
                this.priceEl.textContent = pc.showPrice && price ? this.priceText(price) : '';
                this.priceEl.style.display = pc.showPrice ? 'block' : 'none';

                // Druga linia: RRP (ze źródeł tekstowych) albo druga seria
                // wykresu („Neu 11.49”). Przekreślenie tylko przy RRP —
                // przekreślona cena znaczy „stara”, nie żywa oferta.
                if (pc.showRrp && r.rrp) {
                    this.rrpEl.textContent = `${I18n.get('priceCard_rrp')} ${this.priceText(r.rrp)}`;
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

                // Adnotacja „z innego sklepu” nie podlega wyłącznikowi źródła —
                // przy dwóch rynkach w euro nie widać różnicy nawet po kwocie.
                const fromOther = (r.fallback && r.market)
                    ? I18n.get('priceCard_foundIn', { host: marketplace(r.market).host.replace(/^www\./, '') })
                    : '';
                const bits = [];
                if (pc.showSource) bits.push(r.source);
                // Przy przeliczeniu cena ze sklepu zostaje do wglądu w wierszu
                // źródła — dla kogoś, kto porównuje kartę ze stroną Amazonu.
                if (pc.showSource && price && this.priceText(price).startsWith('≈')) bits.push(price.text);
                if (fromOther) bits.push(fromOther);
                // Czas ma własny wyłącznik, niezależny od nazwy źródła.
                if (pc.showLatency) bits.push(`${r.ms}ms`);
                if (pc.showSource && r.stale) bits.push(I18n.get('priceCard_cached'));
                this.setLine(this.srcEl, bits.join(' · '));
                return;
            }

            // 2. Ceny nie ma i coś tnie CSP — to właśnie jest przyczyna.
            if (this.csp.img || this.csp.net || (r && r.status === 'csp')) {
                const both = this.csp.img && this.csp.net;
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                // Gdy cena pochodzi z obrazka, jego blokada znaczy nie „nie ma
                // wykresu”, tylko „nie ma skąd przeczytać ceny” — dla człowieka
                // to różne rzeczy.
                const mode = PriceSources.mode(pc.source);
                const ocrMode = !!(mode && mode.readsImage);
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
                this.srcEl.textContent = I18n.get('priceCard_textOff');
                return;
            }

            // 4. Odpowiedzi jeszcze nie ma.
            if (!r) {
                this.priceEl.style.display = 'block';
                this.priceEl.textContent = '—';
                this.rrpEl.style.display = 'block';
                this.rrpEl.style.textDecoration = 'none';
                this.rrpEl.textContent = '';
                this.srcEl.textContent = '';
                return;
            }

            // 5. Źródła odpracowały, ceny nie ma.
            this.priceEl.style.display = 'block';
            this.priceEl.textContent = '—';
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
                'obrazków': `${this.imageCount} / ${cap(CONFIG.PRICE_MAX_IMAGE_REQUESTS)}`,
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
        /**
         * Ostatnie naciśnięte znaki — łańcuch przycinany slice(), bez tablicy
         * pośredniej (kod chodzi na każdy klawisz przez całą zmianę).
         */
        seqBuffer: '',
        /** Najdłuższe hasło — tyle znaków trzeba pamiętać i ani znaku więcej. */
        _maxPasswordLen: 0,
        /**
         * Hasła pogrupowane po ostatnim znaku. Porównanie z buforem zaczyna się
         * tylko wtedy, gdy naciśnięty znak kończy któreś hasło — przy
         * 'GORDONPAULE' i 'BOMBA' tylko przy E i A. Mapa buduje się raz, w init().
         */
        _passwordsByLastChar: null,
        init() {
            // Obsługa nazwana — potrzebna do Main.teardown().
            this.onKeyDown = (e) => {
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

                // Autopowtarzanie pomijamy: przytrzymany klawisz daje dziesiątki
                // keydown na sekundę, a każde byłoby +1 do licznika (prawy Shift
                // łatwo przycisnąć przypadkiem) i śmieciem w buforze haseł.
                if (e.repeat) return;

                if (store.userConfig.keyboardShortcuts.INCREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.INCREMENT) {
                    this.modifyCounter(1, { manual: true }); e.preventDefault();
                } else if (store.userConfig.keyboardShortcuts.DECREMENT !== 'None' && e.code === store.userConfig.keyboardShortcuts.DECREMENT) {
                    this.modifyCounter(-1, { manual: true }); e.preventDefault();
                }

                /**
                 * Hasła dostępu (SETTINGS_ACCESS_PASSWORDS w nagłówku pliku).
                 *
                 * Bufor ma długość najdłuższego hasła i przesuwa się jak okno;
                 * hasło jest wpisane, gdy bufor się na nim kończy. Po trafieniu
                 * bufor jest czyszczony — inaczej hasło będące końcówką innego
                 * zadziałałoby dwa razy, a toggle() otworzyłby i zamknął panel.
                 *
                 * To nie jest zabezpieczenie kryptograficzne — chodzi tylko o to,
                 * żeby panel nie otwierał się przypadkiem przy pracy ze skanerem.
                 */
                if (this._maxPasswordLen > 0 && e.key.length === 1) {
                    const ch = e.key.toUpperCase();
                    this.seqBuffer = (this.seqBuffer + ch).slice(-this._maxPasswordLen);
                    const candidates = this._passwordsByLastChar.get(ch);
                    if (candidates) {
                        for (const password of candidates) {
                            if (!this.seqBuffer.endsWith(password)) continue;
                            SettingsPanel.toggle();
                            this.seqBuffer = '';
                            break;
                        }
                    }
                }
            };
            /**
             * Przygotowanie haseł — raz, przy starcie. Kolejność w grupie jak
             * w CONFIG (od najdłuższego), więc przy kilku trafieniach naraz
             * wygrywa dłuższe hasło.
             */
            const passwords = CONFIG.SETTINGS_PANEL_ACCESS_PASSWORDS || [];
            this._passwordsByLastChar = new Map();
            this._maxPasswordLen = 0;
            for (const password of passwords) {
                if (password.length > this._maxPasswordLen) this._maxPasswordLen = password.length;
                const last = password[password.length - 1];
                if (!this._passwordsByLastChar.has(last)) this._passwordsByLastChar.set(last, []);
                this._passwordsByLastChar.get(last).push(password);
            }

            document.addEventListener('keydown', this.onKeyDown, true);
        },
        /**
         * @param {number} delta
         * @param {{manual?: boolean}} [opts] - `manual` znaczy „człowiek poprawia
         *   to, czego program nie zobaczył”. Taka paczka wchodzi do zadania
         *   inaczej niż zaliczona automatycznie: razem z licznikiem „poza
         *   mianownikiem”, bo jej kierunku nikt nie zna (patrz TaskManager).
         */
        modifyCounter(delta, opts = {}) {
            const cid = store.currentTabInstanceId;
            const cur = store.tabCounters[cid] || 0;
            const next = Math.max(0, cur + delta);
            if (opts.manual) {
                // Liczniki zmiany (paczki, sprzedane, poza mianownikiem) idą
                // z zadań — odjęcie zmienia też sprzedane (patrz _shrink).
                TaskManager.adjustManual(cid, next - cur);
                TaskManager.syncShift(cid);
                return;
            }
            TaskManager.addItem(cid);
            Persistence.bump(CONFIG.STORAGE_PREFIX_TAB_COUNTER, store.tabCounters, cid);
            // Przerysowanie wywołuje sam zapis do stanu (onStorePaths po
            // 'tabCounters') — jawne renderContent() dałoby drugi render.
        }
    };

    const AutoTrigger = {
        observer: null,
        debouncedScan: null,
        debouncedAttach: null,

        /**
         * Czy węzeł należy do własnego interfejsu skryptu. Okno statystyk,
         * nakładka i panel leżą w obserwowanym document.body, a okno
         * przerysowuje się co sekundę — bez tego filtra każda taka mutacja
         * uruchamiałaby scan() z odczytem innerText (przeliczenie geometrii
         * całej strony).
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
            // Odtwarzanie observera z debounce — przeciąganie suwaka interwału
            // dawałoby dziesiątki disconnect/observe. Uchwyt na obiekcie, żeby
            // rozbiórka mogła go zgasić.
            this.debouncedAttach = Utils.debounce(() => this.attach(), 500);
            bus.on('store:changed:userConfig.triggerMutationDebounceMs', this.debouncedAttach);
        },

        scan() {
            const txt = document.body.innerText || '';
            // Kierunek czyta się przed licznikiem: kod sortowania i wyzwalacz
            // końcowy często przychodzą w jednej klatce, a wtedy znak staje od
            // razu przy tworzeniu wpisu.
            Routing.observe(txt);

            if (CONFIG.PRE_TRIGGER_REGEX.test(txt)) store.uiFlags.itemInProgress = true;
            if (CONFIG.AUTO_TRIGGER_REGEX.test(txt)) {
                if (store.uiFlags.itemInProgress && !store.uiFlags.autoTriggerFound) {
                    InputManager.modifyCounter(1);
                    store.uiFlags.autoTriggerFound = true;
                    store.uiFlags.itemInProgress = false;
                    // Przedmiot przeszedł pełną ścieżkę — zdarzenie dla dziennika
                    // idzie stąd, a nie z modifyCounter(), bo skróty i ręczne
                    // poprawki dziennika nie napełniają.
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
                const idKey = Persistence.getKey(CONFIG.SESSION_STORAGE_TAB_INSTANCE_ID_KEY);
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
            if (Persistence.onStorage) window.removeEventListener('storage', Persistence.onStorage);
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
            Persistence.scheduleSave.cancel();
            Persistence.debouncedLoad.cancel();
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
                Persistence.purgeLegacyKeys();
                Persistence.purgeLegacySharedKeys();

                // Kolejność jest ważna: loadAll() czyta ustawienia karty po
                // store.currentTabInstanceId, więc karta musi być rozpoznana
                // wcześniej.
                this.identifyTab();
                Persistence.loadAll();

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
                Persistence.saveState();

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
                Persistence.listen();

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
                        Persistence.scheduleSave.flush();
                        ValueLog.flushWriteBack();
                        ValueLog.flushArchive();
                    } catch (e) { /* strona już się zamyka — nie ma komu zgłosić błędu */ }
                };
                window.addEventListener('pagehide', this.onPageHide);

                // Autozapis tylko dla gałęzi, które saveState() naprawdę pisze:
                // uiFlags nie są trwałe, a liczniki mają własne klucze.
                onStorePaths(['userConfig', 'sessionConfig', 'localTabConfig'],
                             () => Persistence.scheduleSave());

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
                    Persistence, SettingsPanel, AutoTrigger, I18n,
                    KeepaOCR, PriceSources, PriceNet, ValueLog, FxRates, Routing,
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
                     *
                     * @param {{images?: number, text?: number}} [limits]
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
                     * Hosty i sprawdzenia faktyczne dają źródła ceny
                     * (PriceSources.cspHosts, PriceSources.probes). Sprawdzenia
                     * wychodzą w sieć, więc wymagają włączonego modułu cen.
                     * Rozbiór polityki działa zawsze — nie wychodzi poza
                     * własną domenę.
                     */
                    cspReport: async () => {
                        const parsed = await PriceCard.readCsp();
                        const HOSTS = { ...PriceSources.cspHosts };
                        // Host wydania — zakładka pobiera z niego skrypt.
                        // Tylko wtedy, gdy ta kompilacja ma adres wydania.
                        const release = /^https:\/\/([^/:]+)/.exec(CONFIG.RELEASE_URL);
                        if (release) HOSTS[release[1]] = 'connect-src';
                        const verdict = {};
                        for (const [host, dir] of Object.entries(HOSTS)) {
                            verdict[`${host} (${dir})`] = PriceCard.cspAllows(parsed, dir, host);
                        }

                        // Praktyczne sprawdzenie: polityka polityką, a ważne
                        // jest to, co naprawdę przechodzi.
                        const checks = {};
                        for (const probe of PriceSources.probes()) {
                            checks['sprawdzenie faktyczne: ' + probe.label] = priceModuleOn()
                                ? await probe.run()
                                : 'moduł cen wyłączony — sprawdzenie nie było wykonane';
                        }

                        return {
                            'polityka wzięta z': parsed.source || 'polityki nie znaleziono',
                            'pełny tekst': parsed.raw || '—',
                            'rozbiór po hostach': verdict,
                            ...checks,
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
                        return PriceCard.resolve(target);
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

    // ─── src/23-config-code.js ───
    // ==========================================
    // 10. KOD KONFIGURACJI
    // ==========================================
    /**
     * PRZENOSZENIE USTAWIEŃ JEDNYM CIĄGIEM SZESNASTKOWYM.
     *
     * Człowiek ustawia sobie wygląd i wyłączniki na jednej maszynie, kopiuje
     * z panelu jeden ciąg — `0x01...` — i na dowolnej innej maszynie dostaje
     * dokładnie to samo. Ciąg wkleja się albo do konsoli (`SH.config("0x…")`),
     * albo od razu w zakładce przeglądarki, doklejony za wywołaniem skryptu.
     *
     * =====================================================================
     * FORMAT: SAMOOPISUJĄCE SIĘ REKORDY, A NIE STAŁY UKŁAD BITÓW
     * =====================================================================
     *      [id: 2 bajty][długość: 1 bajt][wartość: tyle bajtów, ile podano]
     *
     *   - długość w rekordzie pozwala przeskoczyć rekord nieznany, więc kod
     *     z nowszego wydania wczyta się w starszym skrypcie;
     *   - stały, nigdy nieużywany ponownie numer `id` pozwala nowemu skryptowi
     *     rozpoznać stare rekordy bez pamiętania historycznych układów;
     *   - numer, ścieżka i typ stoją w jednej linii rejestru, więc nie ma
     *     ręcznego przydzielania offsetów, w którym pomyłka byłaby cicha.
     *
     * Ten sam pomysł co protobuf, w rozmiarze tego projektu. Na zewnątrz: ciąg
     * szesnastkowy, wielkość liter bez znaczenia.
     *
     * =====================================================================
     * KOD ZAWIERA TYLKO TO, CO RÓŻNI SIĘ OD WARTOŚCI DOMYŚLNYCH
     * =====================================================================
     * Kod jest łatką, a nie zdjęciem konfiguracji: kto zmienił trzy rzeczy,
     * ma trzy rekordy. Gdy w nowym wydaniu zmieni się wartość domyślna czegoś,
     * czego człowiek nie ruszał, dostanie on nową wartość — przy zdjęciu
     * całości zostałby na zawsze przy starej.
     *
     * =====================================================================
     * BEZPIECZEŃSTWO
     * =====================================================================
     * Kod przychodzi z zewnątrz: z czatu, z maila, z cudzej zakładki. Dlatego
     * dekodowanie NIE tworzy pól — zapisuje wyłącznie pod ścieżki wymienione
     * w rejestrze, i wyłącznie wartościami typu, który rejestr przewiduje.
     * Liczby przechodzą przez własne granice, kolory przez sprawdzenie formy.
     * Nieznany numer, zła długość, śmieciowa wartość — pomijane pojedynczo,
     * z adnotacją w sprawozdaniu, a nie wywracające całego kodu.
     */
    const ConfigCode = {
        /** Wersja FORMATU (nie skryptu). Zmienia się tylko przy zmianie ramki. */
        FORMAT: 0x01,

        /**
         * Nazwa zmiennej okna z kodem podstawionym przed uruchomieniem.
         *
         * Zakładka (link) najpierw wpisuje tu kod, a dopiero potem pobiera
         * i wykonuje plik — ustawienia wchodzą wewnątrz Main.init(), zaraz po
         * wczytaniu magazynu i przed pierwszym rysowaniem okna. Wywołanie
         * `SH.config` po pliku mogłoby trafić przed powstaniem `SH` (init czeka
         * na DOMContentLoaded), a okno mrugnęłoby wyglądem domyślnym.
         *
         * Nazwa długa, z przedrostkiem skryptu — to cudza strona.
         */
        BOOT_GLOBAL: CONFIG.SCRIPT_ID_PREFIX + 'CONFIG_CODE',

        /**
         * Listy wartości dopuszczalnych dla pól wyboru.
         *
         * KOLEJNOŚĆ JEST CZĘŚCIĄ FORMATU: w kodzie leci indeks, nie tekst.
         * Nowe pozycje wolno DOPISYWAĆ NA KOŃCU; przestawienie albo usunięcie
         * pozycji zmienia znaczenie już rozdanych kodów. Listy stoją tutaj,
         * a nie są czytane z CONFIG, właśnie po to: tam kolejność jest dowolna.
         */
        ENUMS: {
            font: ['default', 'monospace', 'sans_serif_thin'],
            source: ['ocr', 'graph', 'jina'],
            graphMode: ['legend', 'right', 'full'],
            language: ['pl', 'en', 'ru'],
            marketplace: ['de', 'co.uk', 'com', 'it', 'fr', 'es', 'nl', 'ca', 'se', 'com.be', 'pl'],
            displayCurrency: ['native', 'EUR', 'PLN', 'GBP', 'SEK', 'USD', 'CAD'],
        },

        /**
         * NUMERY WYCOFANE — spalone na zawsze, nigdy nie wracają do REGISTRY.
         *
         *   0x0200  priceCard.moduleEnabled — główny wyłącznik sieci
         *   0x0202  priceCard.source        — dokąd idą zapytania (np. r.jina.ai)
         *
         * Kod ustawień krąży po czatach i każdy może go złożyć ręcznie — suma
         * kontrolna niczego nie uwierzytelnia. Kod nie może więc decydować, czy
         * i dokąd skrypt wychodzi do sieci: z tymi numerami włączałby moduł cen
         * i wysyłał ASIN-y do obcego serwisu, w zakładce jeszcze przed
         * narysowaniem okna. Rozstrzyga się to tylko w panelu, ręką.
         *
         * Kody z tymi numerami nadal się wczytują — te rekordy są pomijane
         * i liczone w sprawozdaniu jako wycofane.
         */
        RETIRED_IDS: [0x0200, 0x0202],

        /**
         * REJESTR USTAWIEŃ — jedyne miejsce, które trzeba ruszyć, dodając
         * ustawienie do kodu.
         *
         * Numery przydzielone są blokami, żeby dopisywanie było oczywiste:
         *
         *      0x0001–0x00FF   okno statystyk i strona
         *      0x0100–0x01FF   linie 1–7, po 0x10 na linię
         *      0x0200–0x02FF   karta ceny
         *      0x0300–0x03FF   ustawienia wspólne dla wszystkich kart
         *
         * Numer raz wydany nie wraca do obiegu. Ustawienie usunięte ze skryptu
         * znika z rejestru, ale jego numer zostaje spalony (RETIRED_IDS), bo
         * u kogoś leży kod, w którym ten numer coś znaczy.
         *
         * `root` mówi, do której gałęzi stanu trafia wartość: 'local' to
         * ustawienia tej karty, 'user' — wspólne dla wszystkich.
         */
        REGISTRY: [
            // --- okno statystyk i strona ---
            { id: 0x0001, root: 'local', path: 'statsWindowFontFamily', type: 'enum', list: 'font' },
            { id: 0x0002, root: 'local', path: 'statsWindowBgColorHex', type: 'color' },
            { id: 0x0003, root: 'local', path: 'statsWindowBgAlpha', type: 'u8', min: 0, max: 100 },
            { id: 0x0004, root: 'local', path: 'statsWindowPosition.left', type: 'text' },
            { id: 0x0005, root: 'local', path: 'statsWindowPosition.top', type: 'text' },
            { id: 0x0006, root: 'local', path: 'statsWindowPosition.bottom', type: 'text' },
            { id: 0x0007, root: 'local', path: 'pageOverlayOpacity', type: 'u8', min: 0, max: 100 },
            { id: 0x0008, root: 'local', path: 'pageIndicatorTextVisible', type: 'bool' },

            // --- linie 1–8 ---
            ...['line1_currentTab', 'line2_globalSummary', 'line3_shiftInfo', 'line4_lunchInfo',
                'line5_realTimeClock', 'line6_valueSum', 'line7_compact',
                // Linia 8 — blok 0x0170, kolejny po linii 7.
                'line8_taskInfo'].flatMap((key, i) => {
                const base = 0x0100 + i * 0x10;
                return [
                    { id: base, root: 'local', path: `linesConfig.${key}.visible`, type: 'bool' },
                    { id: base + 1, root: 'local', path: `linesConfig.${key}.colorHex`, type: 'color' },
                    { id: base + 2, root: 'local', path: `linesConfig.${key}.alpha`, type: 'u8', min: 0, max: 100 },
                    { id: base + 3, root: 'local', path: `linesConfig.${key}.fontSize`, type: 'u8', min: 6, max: 96 },
                ];
            }),
            // Wielokolor i barwy działów ma tylko linia 2 — stąd osobno,
            // w jej własnym bloku (0x0110).
            { id: 0x0114, root: 'local', path: 'linesConfig.line2_globalSummary.multicolor', type: 'bool' },
            { id: 0x0115, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.CRET', type: 'color' },
            { id: 0x0116, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.REFURB', type: 'color' },
            { id: 0x0117, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.WHD', type: 'color' },
            // Dział ręczny OTHER — numery dotąd niewydane, więc starsze kody
            // nie zmieniają znaczenia.
            { id: 0x0118, root: 'local', path: 'linesConfig.line2_globalSummary.customColors.OTHER', type: 'color' },

            // --- karta ceny ---
            // 0x0200 i 0x0202 są wycofane — patrz RETIRED_IDS.
            { id: 0x0201, root: 'local', path: 'priceCard.visible', type: 'bool' },
            { id: 0x0203, root: 'local', path: 'priceCard.logValues', type: 'bool' },
            { id: 0x0204, root: 'local', path: 'priceCard.marketFallback', type: 'bool' },
            { id: 0x0205, root: 'local', path: 'priceCard.showPrice', type: 'bool' },
            { id: 0x0206, root: 'local', path: 'priceCard.showRrp', type: 'bool' },
            { id: 0x0207, root: 'local', path: 'priceCard.showGraph', type: 'bool' },
            { id: 0x0208, root: 'local', path: 'priceCard.showSource', type: 'bool' },
            { id: 0x0209, root: 'local', path: 'priceCard.showAsin', type: 'bool' },
            { id: 0x020a, root: 'local', path: 'priceCard.asinClickable', type: 'bool' },
            { id: 0x020b, root: 'local', path: 'priceCard.showLatency', type: 'bool' },
            { id: 0x020c, root: 'local', path: 'priceCard.fontFamily', type: 'enum', list: 'font' },
            { id: 0x020d, root: 'local', path: 'priceCard.graphMode', type: 'enum', list: 'graphMode' },
            { id: 0x020e, root: 'local', path: 'priceCard.width', type: 'u16', min: 120, max: 1600 },
            { id: 0x020f, root: 'local', path: 'priceCard.fontSize', type: 'u8', min: 6, max: 96 },
            { id: 0x0210, root: 'local', path: 'priceCard.colorHex', type: 'color' },
            { id: 0x0211, root: 'local', path: 'priceCard.alpha', type: 'u8', min: 0, max: 100 },
            { id: 0x0212, root: 'local', path: 'priceCard.bgColorHex', type: 'color' },
            { id: 0x0213, root: 'local', path: 'priceCard.bgAlpha', type: 'u8', min: 0, max: 100 },
            { id: 0x0214, root: 'local', path: 'priceCard.position.left', type: 'text' },
            { id: 0x0215, root: 'local', path: 'priceCard.position.top', type: 'text' },

            // --- wspólne dla wszystkich kart ---
            { id: 0x0300, root: 'user', path: 'language', type: 'enum', list: 'language' },
            { id: 0x0301, root: 'user', path: 'marketplace', type: 'enum', list: 'marketplace' },
            { id: 0x0302, root: 'user', path: 'triggerMutationDebounceMs', type: 'u16', min: 0, max: 5000 },
            { id: 0x0303, root: 'user', path: 'settingsPanelWidth', type: 'u16', min: 200, max: 2000 },
            { id: 0x0304, root: 'user', path: 'globalStatsContributionKnown.CRET', type: 'bool' },
            { id: 0x0305, root: 'user', path: 'globalStatsContributionKnown.REFURB', type: 'bool' },
            { id: 0x0306, root: 'user', path: 'globalStatsContributionKnown.WHD', type: 'bool' },
            { id: 0x0309, root: 'user', path: 'globalStatsContributionKnown.OTHER', type: 'bool' },
            { id: 0x0307, root: 'user', path: 'keyboardShortcuts.INCREMENT', type: 'text' },
            { id: 0x0308, root: 'user', path: 'keyboardShortcuts.DECREMENT', type: 'text' },
            { id: 0x030a, root: 'user', path: 'displayCurrency', type: 'enum', list: 'displayCurrency' },
        ],

        // ---------------- pomocnicze ----------------
        _root(name) {
            return name === 'user' ? store.userConfig : store.localTabConfig;
        },
        _defaults(name) {
            return name === 'user' ? DEFAULT_USER_CONFIG : DEFAULT_LOCAL_CONFIG;
        },
        /** Wartość spod ścieżki albo undefined, gdy którykolwiek człon nie istnieje. */
        _get(obj, path) {
            return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
        },
        /** Zapis pod ścieżkę BEZ tworzenia brakujących gałęzi — patrz bezpieczeństwo wyżej. */
        _set(obj, path, value) {
            const parts = path.split('.');
            const last = parts.pop();
            const target = parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
            if (!target || typeof target !== 'object') return false;
            target[last] = value;
            return true;
        },

        // ---------------- wartość <-> bajty ----------------
        /** @returns {number[]|null} bajty wartości albo null, gdy nie da się zakodować. */
        _toBytes(entry, value) {
            switch (entry.type) {
                case 'bool':
                    return typeof value === 'boolean' ? [value ? 1 : 0] : null;
                case 'u8': {
                    const n = Math.round(Number(value));
                    return isFinite(n) && n >= 0 && n <= 255 ? [n] : null;
                }
                case 'u16': {
                    const n = Math.round(Number(value));
                    return isFinite(n) && n >= 0 && n <= 65535 ? [(n >> 8) & 0xff, n & 0xff] : null;
                }
                case 'color': {
                    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(value));
                    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
                }
                case 'enum': {
                    const i = this.ENUMS[entry.list].indexOf(String(value));
                    return i >= 0 ? [i] : null;
                }
                case 'text': {
                    // Tylko drukowalne ASCII. Wszystkie wartości tego typu to
                    // miary CSS ('20px', '15%') i nazwy klawiszy ('ShiftRight'),
                    // więc pełny UTF-8 byłby kodem, którego nikt nigdy nie wykona.
                    const s = String(value);
                    const out = [];
                    for (let i = 0; i < s.length; i++) {
                        const c = s.charCodeAt(i);
                        if (c < 0x20 || c > 0x7e) return null;
                        out.push(c);
                    }
                    return out.length <= 255 ? out : null;
                }
                default:
                    return null;
            }
        },
        /** @returns {{ok: boolean, value?: *}} */
        _fromBytes(entry, bytes) {
            const bad = { ok: false };
            switch (entry.type) {
                case 'bool':
                    return bytes.length === 1 ? { ok: true, value: bytes[0] !== 0 } : bad;
                case 'u8':
                case 'u16': {
                    const width = entry.type === 'u8' ? 1 : 2;
                    if (bytes.length !== width) return bad;
                    const n = width === 1 ? bytes[0] : (bytes[0] << 8) | bytes[1];
                    // Granice z rejestru, a nie z kodu: kod przyszedł z zewnątrz.
                    const min = entry.min === undefined ? 0 : entry.min;
                    const max = entry.max === undefined ? 65535 : entry.max;
                    return { ok: true, value: Math.max(min, Math.min(max, n)) };
                }
                case 'color': {
                    if (bytes.length !== 3) return bad;
                    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
                    return { ok: true, value: '#' + hex };
                }
                case 'enum': {
                    if (bytes.length !== 1) return bad;
                    const list = this.ENUMS[entry.list];
                    return bytes[0] < list.length ? { ok: true, value: list[bytes[0]] } : bad;
                }
                case 'text': {
                    let s = '';
                    for (const b of bytes) {
                        if (b < 0x20 || b > 0x7e) return bad;
                        s += String.fromCharCode(b);
                    }
                    return { ok: true, value: s };
                }
                default:
                    return bad;
            }
        },

        // ---------------- kodowanie ----------------
        /**
         * Kod bieżących ustawień. Wchodzi tylko to, co różni się od domyślnych.
         * @returns {string} np. `0x0101000101...`
         */
        encode() {
            const bytes = [this.FORMAT];
            for (const entry of this.REGISTRY) {
                const current = this._get(this._root(entry.root), entry.path);
                if (current === undefined) continue;
                const fallback = this._get(this._defaults(entry.root), entry.path);
                if (current === fallback) continue;
                const value = this._toBytes(entry, current);
                if (!value) continue;
                bytes.push((entry.id >> 8) & 0xff, entry.id & 0xff, value.length, ...value);
            }
            bytes.push(bytes.reduce((a, b) => (a + b) & 0xff, 0));
            return '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
        },

        // ---------------- dekodowanie ----------------
        /**
         * Rozbiera kod na łatkę. NIE dotyka stanu — to robi apply().
         *
         * @returns {{ok: boolean, error?: string, patch?: object,
         *   stats?: {applied: number, unknown: number, invalid: number, retired: number}}}
         *   `stats.unknown` to rekordy o nieznanym numerze: kod z nowszego
         *   wydania wczyta się w starszym skrypcie, tracąc tylko to, czego ten
         *   skrypt i tak nie umie ustawić.
         */
        decode(text) {
            const clean = String(text == null ? '' : text).trim().replace(/^0x/i, '').replace(/[\s_-]/g, '');
            if (!clean) return { ok: false, error: 'kod jest pusty' };
            if (!/^[0-9a-f]+$/i.test(clean)) return { ok: false, error: 'kod zawiera znak spoza zapisu szesnastkowego' };
            if (clean.length % 2) return { ok: false, error: 'kod ma nieparzystą liczbę znaków' };

            const bytes = [];
            for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
            if (bytes.length < 2) return { ok: false, error: 'kod jest za krótki' };

            const given = bytes[bytes.length - 1];
            const counted = bytes.slice(0, -1).reduce((a, b) => (a + b) & 0xff, 0);
            if (given !== counted) return { ok: false, error: 'suma kontrolna się nie zgadza — kod jest niepełny albo przekłamany' };
            if (bytes[0] !== this.FORMAT) {
                return { ok: false, error: `nieznana wersja formatu (${bytes[0]}), ten skrypt rozumie ${this.FORMAT}` };
            }

            const byId = new Map(this.REGISTRY.map(e => [e.id, e]));
            const patch = { local: {}, user: {} };
            const stats = { applied: 0, unknown: 0, invalid: 0, retired: 0 };
            let i = 1;
            while (i < bytes.length - 1) {
                if (i + 3 > bytes.length - 1) { stats.invalid++; break; }
                const id = (bytes[i] << 8) | bytes[i + 1];
                const len = bytes[i + 2];
                const from = i + 3;
                if (from + len > bytes.length - 1) { stats.invalid++; break; }
                const value = bytes.slice(from, from + len);
                i = from + len;

                if (this.RETIRED_IDS.includes(id)) { stats.retired++; continue; }
                const entry = byId.get(id);
                if (!entry) { stats.unknown++; continue; }
                const parsed = this._fromBytes(entry, value);
                if (!parsed.ok) { stats.invalid++; continue; }
                patch[entry.root][entry.path] = parsed.value;
                stats.applied++;
            }
            return { ok: true, patch, stats };
        },

        /**
         * Rozbiera kod i nakłada go na bieżący stan.
         *
         * Zapis idzie POD ŚCIEŻKI Z REJESTRU, po jednej wartości — a nie
         * podmianą całych gałęzi. Dzięki temu każda zmiana przechodzi przez
         * magistralę stanu i interfejs odświeża się sam, bez osobnego wołania
         * renderów.
         *
         * @returns {object} sprawozdanie do konsoli albo do panelu.
         */
        apply(text) {
            const res = this.decode(text);
            if (!res.ok) {
                Utils.error(`[KOD] ${res.error}`);
                return { 'kod przyjęty': false, powód: res.error };
            }
            let written = 0;
            for (const root of ['local', 'user']) {
                for (const [path, value] of Object.entries(res.patch[root])) {
                    if (this._set(this._root(root), path, value)) written++;
                }
            }
            Persistence.saveState();
            Utils.log(`[KOD] wczytano ustawień: ${written}`);
            return {
                'kod przyjęty': true,
                'ustawień nałożonych': written,
                'rekordów nieznanych (nowszy skrypt je zrozumie)': res.stats.unknown,
                'rekordów wycofanych (sieć włącza się tylko w panelu)': res.stats.retired,
                'rekordów odrzuconych': res.stats.invalid,
            };
        },

        /**
         * Kod podstawiony przed uruchomieniem — wołane z `Main.init()`.
         *
         * Zmienna znika z okna niezależnie od tego, czy kod był poprawny:
         * zostawiona po sobie śmieciowa własność na cudzej stronie jest
         * dokładnie tym, czego skrypt ma nie robić.
         *
         * @returns {object|null} sprawozdanie albo null, gdy nic nie podstawiono.
         */
        applyBoot() {
            const code = this.takeBoot();
            return code ? this.apply(code) : null;
        },

        /**
         * Odczytuje i USUWA kod podstawiony przed uruchomieniem.
         *
         * Osobno od `applyBoot`, bo jest druga droga: gdy skrypt już stoi na
         * stronie, kod ma trafić do TAMTEGO egzemplarza (przez jego `SH.config`),
         * a nie do tego, który właśnie się nie uruchomi — patrz `Main.init`.
         *
         * @returns {string|null} kod albo null, gdy nic sensownego nie podstawiono.
         */
        takeBoot() {
            const name = this.BOOT_GLOBAL;
            const code = window[name];
            try { delete window[name]; } catch (e) { window[name] = undefined; }
            return typeof code === 'string' && code ? code : null;
        },

        /**
         * Gotowa zakładka: wywołanie skryptu z doklejonym kodem bieżących ustawień.
         *
         * To jest TEKST DO SKOPIOWANIA, a nie kod do wykonania: człowiek wkleja
         * go jako adres zakładki i uruchamia sam, klikając ją. Skrypt niczego
         * tutaj nie wywołuje — stąd wyłączona reguła lintera, która widzi samo
         * słowo `javascript:` w ciągu znaków. Test artefaktu pilnuje, że jest to
         * jedyne miejsce w całym pliku ze słowem `eval`.
         *
         * @returns {string|null} zakładka albo null, gdy w tej kompilacji nie
         *   ma adresu wydania (CONFIG.RELEASE_URL).
         */
        link() {
            // Bez adresu wydania zakładka nie miałaby czego pobrać — null
            // zamiast tekstu, który po kliknięciu kończy się błędem.
            if (!CONFIG.RELEASE_URL) return null;
            // Kolejność jest mechanizmem: najpierw kod trafia do okna, potem
            // rusza pobieranie pliku, który zastaje go gotowego (BOOT_VAR).
            // `r.ok` nie puszcza strony błędu 404/503 do wykonania, a `catch`
            // pokazuje przyczynę zamiast milczeć po kliknięciu.
            // eslint-disable-next-line no-script-url -- tekst zakładki, patrz wyżej
            return "javascript:(async()=>{try{window['" + this.BOOT_GLOBAL + "']='" + this.encode()
                + "';const r=await fetch('" + CONFIG.RELEASE_URL
                + "',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);eval(await r.text())}"
                + "catch(e){alert('StatsHelper nie wystartował: '+e.message)}})();void 0;";
        },
    };

    // ─── src/24-tasks.js ───
    // ==========================================
    // 11. MENEDŻER ZADAŃ
    // ==========================================
    /**
     * ZADANIA (TASKI): OSOBNY ZEGAR DLA KAŻDEGO PROCESU PRACY.
     *
     * =====================================================================
     * PO CO
     * =====================================================================
     * Tempo zmiany liczy się od jej początku (06:30 albo 18:30). Kto przyszedł
     * do procesu trzy godziny później i zrobił trzy paczki w sześć minut,
     * widziałby „1 na godzinę” zamiast „30 na godzinę” — liczba poprawna,
     * znaczenie fałszywe.
     *
     * Zadanie ma własny zegar: tempo zadania to jego paczki przez jego czas.
     * Opóźniony start, przerwa i przejście między procesami o różnych normach
     * nie mieszają się w jedną średnią.
     *
     * =====================================================================
     * WZNOWIENIE ZAMIAST DRUGIEGO ZADANIA O TEJ SAMEJ NAZWIE
     * =====================================================================
     * Zadanie ma listę odcinków, a nie jeden początek i koniec. Powrót do
     * procesu wznawia to samo zadanie, więc podsumowanie zmiany ma jedno
     * zadanie z sensownym tempem zamiast wpisów 30 / 100 / 30. Zamknięty
     * odcinek to pauza; pierwsza paczka po pauzie otwiera nowy odcinek — skoro
     * paczki idą, przerwa się skończyła.
     *
     * =====================================================================
     * RĘCZNIE WPISANE PACZKI NIE WCHODZĄ DO MIANOWNIKA PROCENTU
     * =====================================================================
     * Po awarii maszyny (sesja tymczasowa — pamięć przeglądarki znika)
     * człowiek pamięta tempo albo liczbę paczek, ale nie to, ile poszło na
     * sprzedaż. Wpisana liczba trafia do paczek oraz do licznika „poza
     * mianownikiem” (jak audyty), więc procent sprzedaży opisuje tylko to, co
     * skrypt naprawdę zobaczył, a nie spada po awarii do kilku procent.
     *
     * =====================================================================
     * NIENARUSZALNA RÓWNOŚĆ
     * =====================================================================
     * Suma paczek wszystkich zadań karty zawsze równa się licznikowi tej
     * karty. Liczniki zmiany są źródłem prawdy dla linii 1, 2 i 7, a zadania
     * ich rozbiciem w czasie. Obie strony ruszają się w metodach poniżej;
     * pilnują tego testy.
     *
     * =====================================================================
     * ZAPIS
     * =====================================================================
     *   `tasks`                — wspólny dla kart: lista zadań i aktywne.
     *                            Zadanie należy do człowieka, nie do karty.
     *   `taskcnt_<id>_<karta>` — liczniki, klucz na kartę: dwie karty
     *                            piszące jeden klucz zamazywałyby sobie liczby.
     */
    const TaskManager = {
        // ---------------- dostęp ----------------
        list() { return store.tasks; },
        byId(id) { return store.tasks.find(t => t.id === id) || null; },
        /** Aktywne zadanie albo null, gdy trwa pauza. */
        active() { return this.byId(store.activeTaskId); },
        /** Czy zegar zadania chodzi (ostatni odcinek jest otwarty). */
        isRunning(task) {
            const last = task && task.segments[task.segments.length - 1];
            return !!(last && last.to === null);
        },

        /**
         * Zadanie domyślne powstaje przy pierwszym uruchomieniu i zaczyna się
         * razem ze zmianą — dopóki człowiek nie powie inaczej, cała zmiana
         * jest jednym procesem, a tempo liczy się od jej początku.
         */
        init() {
            if (store.tasks.length) return this.active();
            return this.create(CONFIG.DEFAULT_TASK_NAME,
                               store.sessionConfig.shiftCalculatedStartTime || Date.now());
        },

        // ---------------- zmiany listy ----------------
        /**
         * Tablice nie są reaktywne (createReactive pomija tablice), więc każda
         * zmiana podmienia całą listę — inaczej linia 8 i panel nie
         * dowiedziałyby się o niej.
         */
        _commit(list) {
            this._stamp(list);
            store.tasks = list.slice();
            this.save();
        },

        /**
         * ZADANIA W DWÓCH KARTACH NARAZ.
         *
         * Lista leży w jednym kluczu na wszystkie karty. Zapis całej listy
         * z pamięci karty wymazywałby zadanie założone przed chwilą w sąsiedniej
         * karcie (a jego paczki zostałyby w liczniku). Dlatego zadanie niesie
         * `updated`, usunięte zostawia nagrobek w `_removed`, a przełączenie
         * aktywnego — `_activeAt`. Zapis scala z magazynem: wygrywa nowsza
         * wersja zadania, nagrobek wygrywa z wersją sprzed usunięcia, aktywne
         * jest ostatnio przełączone.
         */
        _sig: {},
        _removed: {},
        _activeAt: 0,
        _lastActive: null,
        _signature: (t) => JSON.stringify([t.name, t.segments]),
        _stamp(list) {
            const now = Date.now();
            const alive = new Set();
            for (const t of list) {
                alive.add(t.id);
                const sig = this._signature(t);
                if (this._sig[t.id] !== sig) { t.updated = now; this._sig[t.id] = sig; }
            }
            for (const id of Object.keys(this._sig)) {
                if (!alive.has(id)) { this._removed[id] = now; delete this._sig[id]; }
            }
            if (store.activeTaskId !== this._lastActive) { this._activeAt = now; this._lastActive = store.activeTaskId; }
        },

        /** Stan zadań tej karty scalony z tym, co leży w magazynie. */
        merge(stored) {
            const shiftStart = store.sessionConfig.shiftCalculatedStartTime || null;
            const mine = { shiftStart, activeId: store.activeTaskId, activeAt: this._activeAt,
                           list: store.tasks, removed: this._removed };
            if (!stored || !Array.isArray(stored.list)) return mine;
            // Inna zmiana w magazynie: nie scala się dwóch zmian — wygrywa nowsza.
            if (stored.shiftStart && shiftStart && stored.shiftStart !== shiftStart) {
                return stored.shiftStart > shiftStart ? stored : mine;
            }
            const removed = { ...(stored.removed || {}) };
            for (const [id, ts] of Object.entries(mine.removed)) removed[id] = Math.max(removed[id] || 0, ts);
            // Kolejność z magazynu, bo to kolejność zakładania we wszystkich
            // kartach; nowe zadania tej karty na koniec.
            const byId = new Map(stored.list.map(t => [t.id, t]));
            for (const t of mine.list) {
                const other = byId.get(t.id);
                if (!other || (t.updated || 0) >= (other.updated || 0)) byId.set(t.id, t);
            }
            const list = [...byId.values()].filter(t => !(removed[t.id] >= (t.updated || 0)));
            const ours = (mine.activeAt || 0) >= (stored.activeAt || 0);
            let activeId = ours ? mine.activeId : stored.activeId;
            if (!list.some(t => t.id === activeId)) activeId = list.length ? list[list.length - 1].id : null;
            return { shiftStart, activeId, activeAt: Math.max(mine.activeAt || 0, stored.activeAt || 0), list, removed };
        },

        /** Przyjęcie scalonego stanu do pamięci — bez znakowania go jako „naszej zmiany”. */
        adopt(state) {
            store.tasks = state.list;
            store.activeTaskId = state.activeId;
            this._removed = { ...(state.removed || {}) };
            this._activeAt = state.activeAt || 0;
            this._lastActive = state.activeId;
            this._sig = {};
            for (const t of state.list) this._sig[t.id] = this._signature(t);
        },

        /** Nazwa bez białych brzegów, przycięta do granicy z konfiguracji. */
        cleanName(raw, fallback) {
            const name = String(raw == null ? '' : raw).trim().slice(0, CONFIG.TASK_MAX_NAME_LEN);
            return name || fallback || CONFIG.DEFAULT_TASK_NAME;
        },

        /**
         * Początek odcinka: nie w przyszłości i nie wcześniej niż początek
         * odcinka, który właśnie zamykamy — inaczej „dwie minuty wstecz” tuż po
         * przełączeniu dałoby poprzedniemu zadaniu odcinek o ujemnej długości.
         */
        clampStart(ms) {
            const now = Date.now();
            const wanted = Number(ms);
            let value = isFinite(wanted) ? wanted : now;
            const current = this.active();
            if (current) {
                const last = current.segments[current.segments.length - 1];
                // Nie wcześniej niż początek ostatniego odcinka i nie wcześniej
                // niż jego koniec: wznowienie sprzed własnej pauzy dałoby dwa
                // odcinki nachodzące na siebie, czyli czas policzony dwa razy.
                value = Math.max(value, last.from, last.to === null ? last.from : last.to);
            }
            return Math.min(value, now);
        },

        /** Zamyka otwarty odcinek aktywnego zadania na podanej chwili. */
        closeActive(atMs) {
            const task = this.active();
            if (!task || !this.isRunning(task)) return;
            const last = task.segments[task.segments.length - 1];
            last.to = Math.max(last.from, atMs);
        },

        /** Nowe zadanie i od razu przejście do niego. */
        create(name, startMs) {
            const from = this.clampStart(startMs);
            this.closeActive(from);
            const task = {
                id: Utils.generateId('task_'),
                name: this.cleanName(name),
                segments: [{ from, to: null }],
            };
            const list = store.tasks.slice();
            list.push(task);
            store.activeTaskId = task.id;
            this._commit(list);
            Utils.log(`[ZADANIE] nowe: ${task.name}`);
            return task;
        },

        /**
         * Wznowienie zadania, które już było: nowy odcinek na tym samym
         * identyfikatorze. To jest cała różnica wobec `create` i cały powód,
         * dla którego zadanie ma listę odcinków.
         */
        resume(id, startMs) {
            const task = this.byId(id);
            if (!task) return null;
            if (task.id === store.activeTaskId && this.isRunning(task)) return task;
            const from = this.clampStart(startMs);
            this.closeActive(from);
            task.segments.push({ from, to: null });
            store.activeTaskId = task.id;
            this._commit(store.tasks);
            Utils.log(`[ZADANIE] wznowione: ${task.name}`);
            return task;
        },

        /** Pauza: zegar staje, ale zadanie zostaje aktywne. */
        pause(atMs) {
            const task = this.active();
            if (!task || !this.isRunning(task)) return;
            this.closeActive(Math.min(Number(atMs) || Date.now(), Date.now()));
            this._commit(store.tasks);
            Utils.log(`[ZADANIE] pauza: ${task.name}`);
        },

        /**
         * Paczka w trakcie pauzy znaczy, że pauza się skończyła. Zegar rusza od
         * TEJ paczki, a nie wstecz — czas, którego nie było, nie wraca.
         */
        ensureRunning() {
            let task = this.active();
            if (!task) task = this.init() || this.active();
            if (!task) return null;
            if (!this.isRunning(task)) {
                task.segments.push({ from: Date.now(), to: null });
                this._commit(store.tasks);
                Utils.log(`[ZADANIE] pauza przerwana paczką: ${task.name}`);
            }
            return task;
        },

        rename(id, name) {
            const task = this.byId(id);
            if (!task) return;
            task.name = this.cleanName(name, task.name);
            this._commit(store.tasks);
        },

        /**
         * POCZĄTEK CAŁEGO ZADANIA — „zacząłem dwie minuty temu”, „zacząłem
         * razem ze zmianą”.
         *
         * Przestawia się początek zadania, a nie ostatniego odcinka: czas
         * zadania to suma odcinków, więc rozciąganie ostatniego dokładałoby
         * godziny obok wcześniejszych przy każdym kliknięciu.
         *   - wstecz: pierwszy odcinek rozciąga się do nowego początku;
         *   - w przód: wszystko przed nowym początkiem jest obcinane — odcinki
         *     zamknięte wcześniej znikają, a ten, w którym wypada początek,
         *     zaczyna się od niego.
         *
         * Przerwy zostają. Niezmiennik (testy): przepracowany czas nigdy nie
         * przekracza odstępu od początku zadania do teraz.
         */
        setStart(id, ms) {
            const task = this.byId(id);
            const asked = Number(ms);
            // Tekst, zero i liczby ujemne nie są chwilą (0 to 1 stycznia 1970).
            if (!task || !Number.isFinite(asked) || asked <= 0) return;
            const wanted = Math.min(Math.max(asked, this.previousEnd(task)), Date.now());
            const first = task.segments[0];
            if (wanted <= first.from) {
                first.from = wanted;
            } else {
                const kept = task.segments
                    .filter(seg => seg.to === null || seg.to > wanted)
                    .map(seg => ({ from: Math.max(seg.from, wanted), to: seg.to }));
                // Zadanie zatrzymane zostaje zatrzymane — przestawienie
                // początku nie puszcza zegara.
                const running = this.isRunning(task);
                task.segments = kept.length ? kept : [{ from: wanted, to: running ? null : wanted }];
            }
            this._commit(store.tasks);
        },

        /**
         * Koniec ostatniego odcinka innych zadań przed początkiem tego zadania —
         * poniżej tej granicy początku cofnąć nie wolno. Inaczej „początek
         * zmiany” na drugim zadaniu nałożyłby je na pierwsze: te same godziny
         * liczone dwa razy, a obiad odjęty podwójnie.
         */
        previousEnd(task) {
            const own = task.segments[0].from;
            let end = 0;
            for (const other of store.tasks) {
                if (other.id === task.id) continue;
                for (const seg of other.segments) {
                    if (seg.to !== null && seg.to <= own && seg.to > end) end = seg.to;
                }
            }
            return end;
        },

        remove(id) {
            const task = this.byId(id);
            if (!task || store.tasks.length <= 1) return false;
            const list = store.tasks.filter(t => t.id !== id);
            // Liczniki znikają razem z zadaniem, a licznik zmiany schodzi
            // o tyle samo — suma zadań musi się zgadzać z licznikiem karty.
            // Liczniki czyta się z magazynu, nie z pamięci: sąsiednia karta
            // mogła dopisać paczki, o których ta jeszcze nie wie.
            const tabs = new Set([...Object.keys(store.taskCounters[id] || {}), ...Persistence.storedTaskTabs(id)]);
            for (const tabKey of tabs) {
                const c = Persistence.freshTaskCounter(id, tabKey, this.counters(id, tabKey));
                for (const [prefix, memory, value] of [
                    [CONFIG.STORAGE_PREFIX_TAB_COUNTER, store.tabCounters, c.done],
                    [CONFIG.STORAGE_PREFIX_TAB_SOLD, store.tabSold, c.sold],
                    [CONFIG.STORAGE_PREFIX_TAB_NEUTRAL, store.tabNeutral, c.neutral],
                ]) {
                    const key = Persistence.getKey(prefix + tabKey);
                    memory[tabKey] = Math.max(0, Persistence.freshCount(key, memory[tabKey] || 0) - value);
                    Persistence.write(key, String(memory[tabKey]));
                }
                Persistence.removeTaskCounter(id, tabKey);
            }
            const counters = { ...store.taskCounters };
            delete counters[id];
            store.taskCounters = counters;
            if (store.activeTaskId === id) store.activeTaskId = list[list.length - 1].id;
            this._commit(list);
            return true;
        },

        // ---------------- czas ----------------
        /**
         * Przepracowany czas zadania: suma odcinków minus obiad, który się z nimi
         * pokrywa.
         *
         * Obiad odejmuje się tym samym rachunkiem, co w linii 1 — inaczej
         * człowiek, który nie pamiętał o postawieniu pauzy na przerwę, miałby
         * w zadaniu pół godziny pracy, której nie było.
         */
        workedMs(task, nowMs) {
            if (!task) return 0;
            const now = Number(nowMs) || Date.now();
            const floor = this.countedFrom();
            let total = 0;
            for (const seg of task.segments) {
                const from = Math.max(seg.from, floor);
                const to = seg.to === null ? now : seg.to;
                if (to <= from) continue;
                total += (to - from) - ShiftManager.lunchOverlapMs(from, to);
            }
            return Math.max(0, total);
        },

        /**
         * Chwila, od której czas zadań się liczy: początek zmiany.
         *
         * Sesja startuje o 06:20 albo 18:20, zmiana o 06:30 albo 18:30 — te
         * dziesięć minut nie jest pracą, a skrypt uruchamia się właśnie wtedy.
         * Bez przycięcia linia 8 liczyłaby od 06:20, a linia 1 od 06:30.
         *
         * Przycięcie jest przy odczycie, bo odcinek sprzed zmiany powstaje
         * kilkoma drogami (zadanie domyślne, nowe zadanie o 06:25, paczka
         * w pauzie, skrypt wklejony w martwej strefie). Bez rozpoznanej zmiany
         * nie przycina niczego.
         */
        countedFrom() {
            const start = store.sessionConfig.shiftCalculatedStartTime;
            return typeof start === 'number' ? start : -Infinity;
        },

        /**
         * Początek pierwszego odcinka i koniec ostatniego — do podsumowania.
         * Początek widać w panelu, więc przycina się tak samo jak czas: inaczej
         * panel pokazywałby 06:20, a tempo liczyłoby się od 06:30.
         */
        span(task) {
            if (!task || !task.segments.length) return { from: null, to: null };
            const first = task.segments[0];
            const last = task.segments[task.segments.length - 1];
            const from = Math.max(first.from, this.countedFrom());
            return { from, to: last.to === null ? null : Math.max(last.to, from) };
        },

        // ---------------- liczniki ----------------
        /** Liczniki zadania na danej karcie; zawsze zwraca komplet pól. */
        counters(id, tabKey) {
            const byTab = store.taskCounters[id] || {};
            const c = byTab[tabKey] || {};
            return { done: c.done || 0, sold: c.sold || 0, neutral: c.neutral || 0 };
        },

        /** Suma liczników zadania po wszystkich kartach. */
        totals(task) {
            const out = { done: 0, sold: 0, neutral: 0 };
            const byTab = (task && store.taskCounters[task.id]) || {};
            for (const c of Object.values(byTab)) {
                out.done += c.done || 0;
                out.sold += c.sold || 0;
                out.neutral += c.neutral || 0;
            }
            return out;
        },

        /** Zapis liczników zadania dla jednej karty. Jedyne miejsce, które je rusza. */
        _write(id, tabKey, next) {
            const byTab = { ...(store.taskCounters[id] || {}) };
            byTab[tabKey] = {
                done: Math.max(0, next.done | 0),
                sold: Math.max(0, next.sold | 0),
                neutral: Math.max(0, next.neutral | 0),
            };
            store.taskCounters = { ...store.taskCounters, [id]: byTab };
            Persistence.saveTaskCounter(id, tabKey, byTab[tabKey]);
        },

        /**
         * Przedmiot zaliczony automatycznie: paczka zadania rośnie, kierunek
         * dopisze się osobno (Routing woła `addSold` albo `addNeutral`, gdy go
         * pozna — może to być dopiero za kilka skanów).
         */
        addItem(tabKey) {
            const task = this.ensureRunning();
            if (task) this._bump(task, tabKey, 'done');
        },

        addSold(tabKey) {
            const task = this.active();
            if (task) this._bump(task, tabKey, 'sold');
        },

        addNeutral(tabKey) {
            const task = this.active();
            if (task) this._bump(task, tabKey, 'neutral');
        },

        /**
         * +1 do jednego pola licznika zadania — od wartości w magazynie, bo dwie
         * karty tego samego działu dzielą klucz (Persistence.freshCount).
         */
        _bump(task, tabKey, field) {
            const c = Persistence.freshTaskCounter(task.id, tabKey, this.counters(task.id, tabKey));
            this._write(task.id, tabKey, { ...c, [field]: c[field] + 1 });
        },

        /**
         * RĘCZNA POPRAWKA LICZNIKA — skrót klawiszowy, przycisk, pole w panelu.
         *
         * Idzie do paczek I do licznika „poza mianownikiem”, bo kierunku takiego
         * przedmiotu nikt nie zna: poprawia się zwykle to, czego program nie
         * zobaczył. Dzięki temu ręczna poprawka nie rozcieńcza procentu
         * sprzedaży — ani w dół (gdyby liczyła się jak niesprzedaż), ani w górę.
         */
        adjustManual(tabKey, delta) {
            // Zero to nie poprawka: −1 przy pustym liczniku nie może zdjąć pauzy.
            if (!delta) return;
            // Odjęcie idzie drogą wpisania liczby wprost — od najnowszego
            // zadania wstecz, bo paczki mogą leżeć w poprzednim zadaniu.
            if (delta < 0) {
                this.applyManualTotal(tabKey, this.shiftTotal(tabKey, 'done') + delta);
                return;
            }
            // Przez ensureRunning, a nie przez active(): ręczna paczka też jest
            // paczką, więc kończy pauzę tak samo, jak zaliczona automatycznie.
            const task = this.ensureRunning();
            if (!task) return;
            const c = this.counters(task.id, tabKey);
            this._write(task.id, tabKey, { ...c, done: c.done + delta, neutral: c.neutral + delta });
        },

        /**
         * Liczniki po zmniejszeniu paczek do `done` — bez przesunięcia procentu.
         *
         * Zdejmowana paczka ma nieznany kierunek, więc procent (sprzedane przez
         * paczki z mianownika) nie ma prawa od tego drgnąć. Kolejność:
         *   1. najpierw paczki SPOZA mianownika (wpisane ręcznie, audyty) —
         *      procentu nie dotykają wcale, więc +1 i −1 to para odwracalna;
         *   2. potem paczki z mianownika, a sprzedane maleją proporcjonalnie.
         *
         * Paczki są całkowite, więc procent zostaje z dokładnością do jednej
         * paczki (np. −1 przy 10/5 daje dalej 50%, a nie 55%).
         */
        _shrink(c, done) {
            const drop = c.done - done;
            const neutral = Math.max(0, c.neutral - drop);
            const rated = c.done - c.neutral;
            const ratedLeft = rated - (drop - (c.neutral - neutral));
            const sold = rated > 0 ? Math.round(c.sold * ratedLeft / rated) : 0;
            return { done, sold: Math.min(sold, ratedLeft), neutral };
        },

        /**
         * Wpisanie licznika karty wprost („zrobiłem dziś 180”) — tak wraca się
         * do pracy po awarii maszyny.
         *
         * Różnicę bierze na siebie aktywne zadanie. Gdy liczba jest MNIEJSZA niż
         * to, co zadania mają razem, nadmiar zdejmuje się od najnowszego wstecz:
         * inaczej suma zadań rozjechałaby się z licznikiem karty, a to jedyna
         * równość, na której stoi całe rozliczenie.
         */
        applyManualTotal(tabKey, target) {
            const wanted = Math.max(0, Number(target) || 0);
            let diff = wanted - this.shiftTotal(tabKey, 'done');
            if (!diff) return;
            if (diff > 0) {
                this.adjustManual(tabKey, diff);
                return;
            }
            for (let i = store.tasks.length - 1; i >= 0 && diff < 0; i--) {
                const task = store.tasks[i];
                const c = this.counters(task.id, tabKey);
                if (!c.done) continue;
                const take = Math.min(c.done, -diff);
                this._write(task.id, tabKey, this._shrink(c, c.done - take));
                diff += take;
            }
        },

        /** Suma pola po wszystkich zadaniach dla jednej karty. */
        shiftTotal(tabKey, field) {
            let sum = 0;
            for (const task of store.tasks) sum += this.counters(task.id, tabKey)[field] || 0;
            return sum;
        },

        // ---------------- liczby dla człowieka ----------------
        /** Paczki na godzinę. Poniżej granicy z konfiguracji tempo nie istnieje. */
        rate(task, nowMs) {
            const worked = this.workedMs(task, nowMs);
            if (worked < CONFIG.RATE_MIN_WORKED_MS) return 0;
            return this.totals(task).done / (worked / 3600000);
        },

        /** Procent sprzedaży zadania: paczki bez tych, których kierunku nie da się znać. */
        percent(task) {
            const t = this.totals(task);
            return Utils.percentFloor(t.sold, t.done - t.neutral);
        },

        /**
         * Ile paczek odpowiada zadanemu tempu — dwukierunkowe pole w panelu.
         *
         * Zwraca liczbę CAŁKOWITĄ, bo paczek połówkowych nie ma. Panel po
         * wpisaniu tempa pokazuje tempo przeliczone z tej liczby z powrotem
         * (`rate`), więc człowiek widzi wartość OSIĄGALNĄ, a nie tę, którą
         * wpisał: przy 1:17 pracy tempo 118 daje 151 paczek, czyli naprawdę
         * 117,7 na godzinę.
         */
        doneForRate(task, rate, nowMs) {
            const worked = this.workedMs(task, nowMs);
            const wanted = Number(rate);
            // Ta sama granica, co w `rate`: przeliczanie tempa na paczki przy
            // trzech sekundach pracy dałoby liczbę wziętą z niczego, a wpisuje
            // się ona do liczników na stałe.
            if (!isFinite(wanted) || wanted < 0 || worked < CONFIG.RATE_MIN_WORKED_MS) return null;
            return Math.max(0, Math.round(wanted * worked / 3600000));
        },

        /**
         * Wpisanie liczby paczek WPROST dla jednego zadania.
         *
         * Liczby zadania sumują się po wszystkich kartach, więc różnica idzie do
         * tej karty, przy której człowiek siedzi. Paczki dopisane tą drogą są
         * jak każde inne wpisane ręcznie: poza mianownikiem procentu.
         */
        applyTaskTotal(task, tabKey, target) {
            if (!task) return;
            const wanted = Math.max(0, Number(target) || 0);
            const delta = wanted - this.totals(task).done;
            if (!delta) return;
            this._applyDelta(task, tabKey, delta);
        },

        /**
         * Zmiana paczek zadania na jednej karcie — wspólna dla pola paczek
         * i pola tempa. W górę: paczki poza mianownik, bo ich kierunku nikt nie
         * zna. W dół: przez _shrink, żeby procent nie drgnął.
         */
        _applyDelta(task, tabKey, delta) {
            const c = this.counters(task.id, tabKey);
            if (delta >= 0) {
                this._write(task.id, tabKey, { ...c, done: c.done + delta, neutral: c.neutral + delta });
            } else {
                this._write(task.id, tabKey, this._shrink(c, Math.max(0, c.done + delta)));
            }
        },

        /**
         * Liczniki zmiany karty (paczki, sprzedane, poza mianownikiem) dostają
         * sumy z zadań. Jedno miejsce dla panelu i skrótu klawiszowego, żeby
         * linia 1 nie rozjechała się z zadaniami.
         */
        syncShift(tabKey) {
            store.tabCounters[tabKey] = this.shiftTotal(tabKey, 'done');
            store.tabSold[tabKey] = this.shiftTotal(tabKey, 'sold');
            store.tabNeutral[tabKey] = this.shiftTotal(tabKey, 'neutral');
            Persistence.saveCounter(tabKey, store.tabCounters[tabKey]);
            Persistence.saveSold(tabKey, store.tabSold[tabKey]);
            Persistence.saveNeutral(tabKey, store.tabNeutral[tabKey]);
        },

        /**
         * Godzina wpisana ręcznie („18:32”) na znacznik czasu.
         *
         * Wynik to najbliższa taka godzina: dzisiejsza albo wczorajsza. Na
         * nocnej zmianie o 00:40 wpisane „23:30” to pięćdziesiąt minut temu.
         *   - „wczoraj” przez setDate(-1), nie odjęcie 24 h — doba zmiany czasu
         *     ma 23 albo 25 godzin;
         *   - wczoraj tylko wtedy, gdy jest bliżej niż dziś: „06:36” wpisane
         *     o 06:35:30 to dziś, a setStart przytnie je do teraz.
         *
         * @returns {number|null} null, gdy tekst nie jest godziną.
         */
        parseClock(text) {
            const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(String(text == null ? '' : text));
            if (!m) return null;
            const hours = parseInt(m[1], 10);
            const minutes = parseInt(m[2], 10);
            if (hours > 23 || minutes > 59) return null;
            const now = Date.now();
            const d = new Date(now);
            d.setHours(hours, minutes, 0, 0);
            const today = d.getTime();
            if (today <= now) return today;
            d.setDate(d.getDate() - 1);
            const yesterday = d.getTime();
            return today - now < now - yesterday ? today : yesterday;
        },

        /**
         * „Chcę mieć mniej więcej takie tempo” — wpisane tempo zamienia się na
         * paczki, a różnica idzie do bieżącej karty.
         *
         * Liczby zadania sumują się po WSZYSTKICH kartach, więc cel liczy się
         * z sumy, a dopisuje do tej karty, przy której człowiek siedzi. Paczki
         * dopisane tą drogą są jak każde inne wpisane ręcznie: idą poza
         * mianownik procentu, bo ich kierunku nikt nie zna.
         *
         * @returns {number|null} liczba paczek zadania po zmianie albo null,
         *   gdy tempa nie da się przeliczyć (za krótki czas pracy, zły tekst).
         */
        setRate(task, rate, tabKey, nowMs) {
            if (!task) return null;
            const target = this.doneForRate(task, rate, nowMs);
            if (target === null) return null;
            this._applyDelta(task, tabKey, target - this.totals(task).done);
            return this.totals(task).done;
        },

        // ---------------- zapis ----------------
        save() {
            Persistence.saveTasks();
        },

        /** Sprawozdanie do konsoli: SH.tasks() */
        info() {
            const now = Date.now();
            return store.tasks.map(t => {
                const tot = this.totals(t);
                const span = this.span(t);
                return {
                    nazwa: t.name + (t.id === store.activeTaskId ? ' (aktywne)' : ''),
                    paczki: tot.done,
                    'poza mianownikiem': tot.neutral,
                    tempo: this.rate(t, now).toFixed(1),
                    procent: this.percent(t) + '%',
                    czas: Utils.formatDuration(this.workedMs(t, now)),
                    odcinki: t.segments.length,
                    od: span.from ? new Date(span.from).toTimeString().substring(0, 5) : '—',
                };
            });
        },
    };

    // ─── src/25-presets.js ───
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
        Persistence.saveState();
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
      Wpisz na stronie hasło — domyślnie GORDONPAULE albo BOMBA — a panel
      się otworzy. Wszystko, co tam zmienisz, zapisze się w przeglądarce
      i przeżyje F5. Hasła zmienia się w JEDNEJ linii na samej górze pliku:
          const SETTINGS_ACCESS_PASSWORDS = ['GORDONPAULE', 'BOMBA'];
      Można dopisać kolejne; jedyne ograniczenie opisane jest tam w komentarzu.

   2. KONSOLA (na próbę, do najbliższego przeładowania strony).
      Po uruchomieniu skryptu dostępny jest obiekt SH, np.:
          SH.store.localTabConfig.linesConfig.line7_compact.fontSize = 16;
          SH.Persistence.saveState();      // żeby zapisać na stałe
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
   line7_compact         trzy liczby: tempo, sztuki, %   domyślnie: ON,  #808080, 50%, 13px
   line8_taskInfo        bieżące zadanie                 domyślnie: OFF, #808080, 60%, 13px

   Linia 2 ma dodatkowo:
       multicolor    — true/false, kolorowanie działów osobnymi kolorami
       customColors  — { CRET: '#0078D7', REFURB: '#FFA500', WHD: '#1EB41E', OTHER: '#9E9E9E' }

   Linia 6: picker koloru działa tylko na liczbę sztuk. Plus zawsze zielony,
   minus zawsze czerwony — po tym rozpoznaje się znak.

   Linia 7: pokazuje dokładnie trzy liczby oddzielone spacją, np. „17.4 28 14%”.
   Pierwsza to paczki na godzinę (suma ze wszystkich wliczanych kart), druga to
   liczba zrobionych sztuk, trzecia — procent sprzedaży. Nic więcej się tam nie
   da dodać bez zmiany kodu.

   Linia 8: nazwa bieżącego zadania i jego własne liczby — paczki, tempo,
   procent, przepracowany czas.

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
   showRrp    = false         pokazywać cenę katalogową / drugą serię
   showGraph  = true          pokazywać obrazek wykresu (tylko przy source 'graph')
   graphMode  = 'legend'      'legend' (same ceny) | 'right' | 'full'
   width      = 280           170..900 px
   fontSize   = 13            11..48 px (suwak w panelu)
   bgColorHex = '#0a0e18'     tło karty
   bgAlpha    = 0             0..100
   position   = { left: '14px', top: '' }   puste top = przy dole ekranu

   -----------------------------------------------------------------------------
   USTAWIENIA WSPÓLNE DLA WSZYSTKICH KART  (store.userConfig)
   -----------------------------------------------------------------------------
   language    = 'pl'         'pl' | 'en' | 'ru'
   marketplace = 'de'         'de' | 'co.uk' | 'com' | 'it' | 'fr' | 'es' | 'nl'
                              | 'ca' | 'se' | 'com.be' | 'pl'
                              (Keepa nie ma danych dla 'pl' — link zadziała, cena nie)
   displayCurrency = 'EUR'     'native' | 'EUR' | 'PLN' | 'GBP' | 'SEK' | 'USD' | 'CAD'
                              'native' = karta w walucie sklepu, linia 6 w euro;
                              sumy zawsze w euro, to tylko waluta pokazywania
   globalStatsContributionKnown = { CRET: true, REFURB: true, WHD: true, OTHER: true }
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
   SCRIPT_ID_PREFIX = 'statsHelper_v1_3_0_'
       Prefiks wszystkich kluczy w localStorage. Koduje SCHEMAT danych, a nie
       numer wydania: zostaje ten sam, dopóki układ zapisywanych pól się
       nie zmieni. Zmiana prefiksu = start od zera
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
   PRICE_FALLBACK_MAX_TRIES = Infinity  ile sklepów zapasowych sprawdzać (wszystkie)
   PRICE_FALLBACK_LAST = ['com', 'ca']  rynki spoza Europy — w przeglądzie na końcu
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
       SH.Persistence.saveState();

   PRZYKŁAD: „przenieść okno do prawego dolnego rogu”
       SH.store.localTabConfig.statsWindowPosition = { top: '', left: 'calc(100% - 200px)', bottom: '8px' };
       SH.StatsWindowRenderer.applyPosition();
       SH.Persistence.saveState();

   PRZYKŁAD: „włączyć ceny na jedną zmianę i potem wyłączyć”
       SH.priceOn();     // pobiera kursy i zaczyna pytać o ceny
       SH.priceOff();    // koniec zapytań, karta znika

   PRZYKŁAD: „coś nie działa, chcę zobaczyć, co skrypt robi”
       SH.logsOn();      // od tej chwili konsola pokazuje każdy krok
       SH.logsOff();     // z powrotem cisza

   ============================================================================= */
