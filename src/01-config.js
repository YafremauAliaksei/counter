    // ==========================================
    // 1. STAŁE PODSTAWOWE I KONFIGURACJA
    // ==========================================
    /**
     * Sprowadza listę haseł z góry pliku do postaci, na której da się pracować
     * bez niespodzianek. Człowiek edytuje tam zwykłą tablicę i ma prawo wpisać
     * do niej cokolwiek — a od tego, co stąd wyjdzie, zależy jedyne wejście do
     * panelu ustawień.
     *
     * Co robimy i dlaczego:
     *   - pojedynczy łańcuch zamiast tablicy jest przyjmowany (typowa pomyłka
     *     przy edycji, a skutkiem byłby rozpad na pojedyncze litery);
     *   - białe znaki z brzegów obcinamy, bo w klawiaturę i tak nie wejdą tak,
     *     jak wyglądają w pliku;
     *   - wielkość liter znika, bo bufor klawiatury jest podnoszony do wielkich;
     *   - puste pozycje wylatują. W dzisiejszym InputManagerze same by nie
     *     zadziałały (mapa po ostatnim znaku nie ma dla nich klucza), ale to
     *     przypadek układu wyszukiwania, a nie decyzja. Napisane wprost tutaj
     *     przeżyje uproszczenie tamtej mapy do zwykłej pętli po `endsWith`,
     *     po którym `''` pasowałoby do KAŻDEGO bufora i otwierało panel na
     *     pierwszym klawiszu;
     *   - powtórzenia znikają, żeby nie porównywać dwa razy tego samego;
     *   - kolejność: od najdłuższego. Gdy w jednym naciśnięciu pasuje kilka
     *     haseł (jedno jest końcówką drugiego), wygrywa dłuższe — deterministycznie,
     *     a nie zależnie od kolejności wpisanej w pliku.
     *
     * Funkcja stoi tutaj, a nie w Utils, bo moduł 01 jest pierwszy w sklejeniu
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
        SCRIPT_ID_PREFIX: 'statsHelper_v1_3_0_',
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
        /**
         * Adres, spod którego ludzie uruchamiają skrypt zakładką w przeglądarce.
         * Stąd bierze go ConfigCode.link(), składając gotową zakładkę z kodem
         * ustawień — żeby adres stał w JEDNYM miejscu, a nie w dokumentacji
         * i w kodzie osobno.
         *
         * =============================================================
         * DLACZEGO `raw.`, A NIE ADRES WYDANIA NA github.com
         * =============================================================
         * Bo zakładka pobiera plik przez `fetch` z CUDZEJ strony, czyli
         * zapytaniem międzydomenowym — a takie przechodzi tylko wtedy, gdy
         * serwer odpowie nagłówkiem `Access-Control-Allow-Origin`.
         *
         *   github.com/…/releases/latest/download/counter.js
         *       -> 302 BEZ tego nagłówka, przeglądarka zrywa zapytanie:
         *          „has been blocked by CORS policy”. Adres działa przy
         *          KLIKNIĘCIU (zwykłe pobranie pliku), ale nie przez fetch —
         *          i na tym się przejechaliśmy w 1.2.0.
         *   raw.githubusercontent.com/…
         *       -> 200 z `access-control-allow-origin: *`.
         *
         * Gałąź `release` to wskaźnik „ostatnie wydanie”: przesuwa ją workflow
         * wydania po opublikowaniu tagu, więc uruchamia się wyłącznie kod,
         * który ktoś świadomie wydał — a nie bieżący stan `main`.
         *
         * Przypięcie do konkretnej wersji: ta sama ścieżka z tagiem zamiast
         * `release` (…/counter/v1.2.0/counter.js).
         */
        RELEASE_URL: 'https://raw.githubusercontent.com/YafremauAliaksei/counter/release/counter.js',
        /**
         * Hasła z góry pliku, sprowadzone do jednej postaci (patrz
         * normalizeAccessPasswords). Porównanie z buforem klawiatury robi
         * InputManager.
         *
         * Pusta lista jest dozwolonym stanem i znaczy „panelu nie otwiera żadne
         * hasło” — wtedy zostaje konsola (SH.SettingsPanel.toggle()).
         */
        SETTINGS_PANEL_ACCESS_PASSWORDS: normalizeAccessPasswords(SETTINGS_ACCESS_PASSWORDS),
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
        /**
         * Licznik przedmiotów, które pojechały NA SPRZEDAŻ — osobny klucz na każdą
         * kartę, dokładnie jak licznik ogólny obok.
         *
         * Dlaczego osobno, a nie z dziennika wartości: dziennik napełnia się
         * wyłącznie przy włączonym module cen, a procent sprzedaży ma działać
         * w trybie domyślnym, czyli bez ani jednego zapytania do sieci. Kierunek
         * ustala się z samego tekstu strony (patrz Routing) i sieci nie wymaga.
         */
        STORAGE_PREFIX_TAB_SOLD: 'sold_',
        /**
         * Licznik przedmiotów, które WYPADAJĄ Z MIANOWNIKA procentu sprzedaży —
         * osobny klucz na kartę, dokładnie jak dwa liczniki obok.
         *
         * Trzyma się go osobno, a nie odejmuje na oko przy rysowaniu, bo linie
         * 2 i 7 sumują po wszystkich kartach naraz: bez własnego klucza karta
         * sąsiednia nie miałaby skąd wziąć swojej liczby audytów.
         */
        STORAGE_PREFIX_TAB_NEUTRAL: 'neutral_',
        /**
         * ZADANIA (1.3.0).
         *
         * Lista zadań i identyfikator aktywnego leżą pod JEDNYM kluczem
         * wspólnym dla wszystkich kart: zadanie jest własnością człowieka, a nie
         * karty — kto przechodzi do innego procesu, przechodzi w nim z każdą
         * otwartą kartą naraz.
         *
         * Liczniki są odwrotnie: klucz na parę zadanie+karta, dokładnie jak
         * liczniki zmiany i z tego samego powodu — dwie karty piszące jeden
         * klucz zamazywałyby sobie liczby nawzajem.
         */
        STORAGE_KEY_TASKS: 'tasks',
        STORAGE_PREFIX_TASK_COUNTER: 'taskcnt_',
        /** Nazwa pierwszego zadania: cała zmiana jest jednym procesem, dopóki człowiek nie powie inaczej. */
        DEFAULT_TASK_NAME: 'Default',
        /**
         * Poniżej tylu milisekund pracy tempo NIE ISTNIEJE i pokazuje się zero.
         *
         * Dziesięć sekund to granica, poniżej której dzielenie daje liczby
         * w rodzaju „3600 paczek na godzinę” — pierwsza paczka tuż po starcie
         * zadania. Ta sama granica obowiązuje przy przeliczaniu tempa wpisanego
         * ręcznie na paczki, bo tam pomyłka jest jeszcze droższa: wpisana liczba
         * trafia do liczników na stałe.
         */
        RATE_MIN_WORKED_MS: 10000,
        /** Granica nazwy — panel ma wąską kolumnę, a nazwa stoi też w linii 8. */
        TASK_MAX_NAME_LEN: 24,
        /**
         * Skróty do ustawiania początku zadania, w minutach wstecz.
         *
         * Wartości wzięte z tego, jak to wygląda na hali: o nowym procesie
         * człowiek dowiaduje się z wyprzedzeniem, zbiera narzędzia i dopiero
         * potem siada do skryptu — od faktycznego startu mijają wtedy dwie,
         * pięć, czasem kilkanaście minut. Stąd krótkie odstępy na początku
         * listy, a nie równe ćwiartki godziny.
         */
        TASK_QUICK_OFFSETS_MIN: [0, 2, 5, 15, 30],
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
        /**
         * TRZY LISTY KODÓW I JEDNA ZASADA WSPÓLNA DLA WSZYSTKICH (1.3.0).
         *
         * Dopasowanie NIE jest dokładne: wzorzec zaczepia się o słowo
         * `Zeskanuj` i o początek kodu, a ogona nie domyka. Dzięki temu jedna
         * pozycja na liście obsługuje całą rodzinę: `External` łapie też
         * `External-Repair`, `AUDIT` łapie `Audit-cokolwiek`. Wielkość liter
         * nie ma znaczenia (wzorzec ma flagę `i`, a Routing.canon sprowadza
         * trafienie do zapisu z listy).
         *
         * PRZEDROSTEK `NS-` znaczy „nie-sort” i opisuje GABARYT, a nie kierunek:
         * `NS-Stow-Unsellable` jedzie tam samo, co `Stow-Unsellable`. Dlatego
         * każda rodzina niesprzedażowa ma na liście oba warianty. Wyjątkiem są
         * kody sprzedażowe magazynów (`CRITS-*`) — tam odpowiednikiem dla
         * nie-sortu jest jeden wspólny `NS-PL-Sellable`, a nie `NS-CRITS-*`.
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
         * KODY, KTÓRYCH NIE DA SIĘ ROZSTRZYGNĄĆ — NIGDY (1.3.0).
         *
         * Audyt to nie kierunek, tylko oddanie przedmiotu w cudze ręce:
         * o tym, czy pojedzie na sprzedaż, zadecyduje audytor w ciągu swojej
         * zmiany, czyli godziny po tym, jak przedmiot zniknął z ekranu. Czekanie
         * na tę odpowiedź nie ma sensu, bo nie przyjdzie.
         *
         * Skutek dla procentu sprzedaży: taki przedmiot WYPADA Z MIANOWNIKA.
         * Zrobionych paczek bywa więc więcej niż paczek, z których liczy się
         * procent — i to jest poprawne, a nie błąd rachunku. Różnica między
         * audytem a „kodu nie było wcale” jest celowa: brak kodu zostaje
         * w mianowniku (patrz komentarz przy Routing.countDirection).
         *
         * `NS-AUDIT` na dzień dodania listy nie był widziany w pracy ani razu.
         * Stoi tu, bo przedrostek `NS-` może wyjść przy każdym kodzie, a linia
         * na liście kosztuje mniej niż zgadywanie po roku, czemu procent
         * odskoczył.
         */
        ROUTE_NEUTRAL_CODES: ['AUDIT', 'NS-AUDIT'],
        /**
         * Kody, które same z siebie niczego nie rozstrzygają: przedmiot może
         * pojechać i na sprzedaż, i do utylizacji. Kierunek staje się znany
         * z następnej linii — ROUTE_CONFIRM_SELL albo ROUTE_CONFIRM_UNSELL.
         * Do tego czasu przedmiot wisi nieokreślony.
         */
        ROUTE_AMBIGUOUS_CODES: ['Secondary-Sorting', 'NS-Secondary-Sorting'],
        // Linie uściślające zostają BEZ przedrostka `NS-` i to nie jest
        // przeoczenie: `Transfer - Sellable` i `FBATransfer` to STATUS
        // przedmiotu, a status jest ten sam dla sortu i dla nie-sortu.
        // Przedrostek opisuje gabaryt, więc pojawia się przy kodzie kierunku
        // (NS-Secondary-Sorting), a nie przy potwierdzeniu.
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
    /**
     * Wartości domyślne ustawień WSPÓLNYCH dla wszystkich kart.
     *
     * Wydzielone z baseState (1.2.0), bo kod konfiguracji musi mieć z czym
     * porównywać: do ciągu wchodzi tylko to, co różni się od domyślnego.
     * Bez osobnego obiektu „domyślne” trzeba by je odgadywać z pustego stanu.
     */
    const DEFAULT_USER_CONFIG = {
        language: CONFIG.DEFAULT_LANGUAGE,
        // Sklep Amazon: link z ASIN, rynek wykresu Keepa i waluta dziennika.
        marketplace: CONFIG.DEFAULT_MARKETPLACE,
        globalStatsContributionKnown: Object.keys(CONFIG.KNOWN_TAB_TYPES)
            .reduce((acc, key) => ({ ...acc, [key]: true }), {}),
        keyboardShortcuts: { INCREMENT: 'None', DECREMENT: 'None' },
        triggerMutationDebounceMs: CONFIG.DEFAULT_TRIGGER_MUTATION_DEBOUNCE_MS,
        settingsPanelWidth: CONFIG.SETTINGS_PANEL_INITIAL_WIDTH_PX,
        customTabSettings: {},
    };

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
        line7_compact: { visible: true, colorHex: '#808080', alpha: 50, fontSize: 13 },
        /**
         * LINIA 8 — BIEŻĄCE ZADANIE (1.3.0).
         *
         * Nazwa procesu i JEGO własne liczby: paczki, tempo, procent sprzedaży,
         * przepracowany czas. Linie 1, 2 i 7 pokazują całą zmianę i tak zostaje
         * — tu stoi to, co dzieje się teraz, w procesie, przy którym człowiek
         * siedzi w tej chwili.
         *
         * Domyślnie wyłączona, jak każda nowa linia (zasada 3 z CLAUDE.md).
         */
        line8_taskInfo: { visible: false, colorHex: '#808080', alpha: 60, fontSize: 13 }
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
            /**
             * Cena katalogowa (RRP) albo druga seria wykresu — DRUGI wiersz ceny.
             *
             * 1.1.0: domyślnie wyłączona. Karta ma po włączeniu modułu pokazywać
             * jedną linijkę z ceną i nic więcej; kto potrzebuje odniesienia,
             * włącza to w panelu.
             *
             * Wyłącznik dotyczy WYŁĄCZNIE cen. Komunikat o tym, dlaczego ceny nie
             * ma (blokada CSP, wyczerpany limit), idzie tym samym wierszem
             * i wyłączyć się go nie da — cicha awaria wygląda jak zepsuty skrypt.
             */
            showRrp: false,
            showGraph: true,
            /**
             * Wiersz źródła: „keepa-ocr · 96ms”. Domyślnie wyłączony — to
             * informacja dla kogoś, kto dobiera źródło ceny, a nie dla kogoś,
             * kto pracuje.
             *
             * Jeden wyjątek zostaje widoczny zawsze: adnotacja, że cenę zdjęto
             * z INNEGO sklepu niż wybrany. Bez niej suma zmiany niepostrzeżenie
             * zmieszałaby waluty i witryny, a przy dwóch rynkach w euro nie
             * widać tego nawet po samej kwocie.
             */
            showSource: false,
            /**
             * CO POKAZAĆ W SAMEJ KARCIE — te same klocki, co przy liniach okna
             * statystyk: wyłącznik na każdy element osobno.
             *
             * showAsin       — wiersz z kodem produktu (od 1.1.0 domyślnie
             *                  wyłączony: to identyfikator, a nie cena);
             * asinClickable  — czy ten kod jest linkiem do sklepu;
             * showLatency    — ile milisekund zajęło zdobycie ceny.
             */
            showAsin: false,
            /**
             * DOMYŚLNIE WYŁĄCZONY, I TO JEST ŚWIADOMA ZMIANA WYGLĄDU (patrz
             * CHANGELOG).
             *
             * Karta jest przezroczysta dla myszy — `pointer-events:none` — żeby
             * kliknięcia dochodziły do interfejsu T-REX. Link z kodem produktu był
             * JEDYNYM wyjątkiem od tej zasady, czyli jedynym miejscem, w którym
             * karta przykrywała cudzy przycisk. Skoro karta ma nie przeszkadzać,
             * ten wyjątek włącza się ręcznie.
             *
             * Przy `false` kod produktu jest zwykłym tekstem: bez `href`, bez
             * podkreślenia, bez kursora i bez `pointer-events`. Nie ma czego
             * kliknąć ani przypadkiem, ani celowo.
             */
            asinClickable: false,
            /**
             * Czas zdobycia ceny (np. „keepa-ocr · 96ms”). Do 1.0.0 dopisywał się
             * ZAWSZE. To liczba dla kogoś, kto dobiera źródło ceny, a nie dla
             * kogoś, kto pracuje — w zwykłej zmianie jest wyłącznie hałasem.
             */
            showLatency: false,
            /**
             * Krój pisma karty — ta sama lista, co w oknie statystyk
             * (CONFIG.FONT_FAMILY_OPTIONS). Domyślnie ten sam, co w liniach:
             * karta ma wyglądać jak reszta interfejsu, a nie jak osobny widżet.
             */
            fontFamily: 'default',
            // top puste = karta przyklejona do dołu; po przeciągnięciu trafia
            // tam współrzędna i przyklejenie znika.
            position: { left: '14px', top: '' },
            // Szerokość karty przycina wykres OD LEWEJ, nie ściskając go: przy
            // 280px widać prawą część w naturalnej wielkości, a tam jest legenda
            // z cenami.
            width: 280,
            /**
             * ROZMIAR CENY (1.0.0: 30 -> 16, 1.1.0: 16 -> 13).
             *
             * Trzydzieści pikseli tłustą czcionką na nieprzezroczystym tle robiło
             * z karty najbardziej krzykliwy element ekranu — a jest to element
             * pomocniczy. Trzynaście to dokładnie tyle, ile ma linia 7, bo karta
             * ma teraz wyglądać jak ona: jedna szara linijka, nic więcej.
             */
            fontSize: 13,
            /**
             * KOLOR I PRZEZROCZYSTOŚĆ WSZYSTKICH TEKSTÓW KARTY.
             *
             * Jedna para wartości na całą kartę — cenę, kod produktu, drugi wiersz
             * i wiersz źródła. Domyślnie to samo, co w linii 7: szary, alfa 50%.
             *
             * Do 1.1.0 kolory były wpisane na sztywno i NIOSŁY STAN: zielona cena
             * znaczyła „jest”, pomarańczowa kreska „tnie CSP”. Zostało to zdjęte
             * świadomie i jest to wymiana, a nie strata: stan mówi teraz TEKST,
             * który przy awarii pokazuje się zawsze, niezależnie od wyłączników.
             * Zdanie czyta się jednoznacznie i nie wymaga od nikogo pamiętania,
             * co znaczy pomarańczowy — a kolor stał się tym, czym jest w liniach
             * okna statystyk: ustawieniem wyglądu.
             */
            colorHex: '#808080',
            alpha: 50,
            // Tryb wyświetlania wykresu Keepa:
            //   'legend' — tylko blok z cenami (domyślnie)
            //   'right'  — prawa część wykresu w naturalnej wielkości
            //   'full'   — cały wykres wpisany w szerokość karty
            graphMode: 'legend',
            bgColorHex: '#0a0e18',
            /**
             * TŁO KARTY (1.0.0: 88 -> 0, czyli przezroczyste).
             *
             * Nieprzezroczysty prostokąt z ramką i cieniem zasłaniał kawałek
             * strony i wyglądał jak okno cudzej aplikacji. Przy zerowej
             * przezroczystości znikają razem z nim ramka i cień (patrz
             * applyStyle) — zostaje sam tekst, dokładnie jak w liniach 1-7.
             * Komu potrzebne tło, podnosi ten suwak i wszystko wraca.
             */
            bgAlpha: 0,
        },
    };
