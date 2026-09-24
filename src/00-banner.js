// ==UserScript==
// @name         StatsHelper (Reactive Architecture Edition)
// @namespace    statshelper.counter
// @version      __VERSION__
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
