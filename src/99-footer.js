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
