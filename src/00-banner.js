// ==UserScript==
// @name         StatsHelper (Reactive Architecture Edition)
// @namespace    bomba.stats.helper
// @version      __VERSION__
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
