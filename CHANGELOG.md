# Historia zmian

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie: [SemVer](https://semver.org/lang/pl/).

Dla tego projektu SemVer czyta się tak:

- **MAJOR** — zmienia się `SCRIPT_ID_PREFIX`: liczniki i ustawienia nie przenoszą się,
  aktualizować można **wyłącznie między zmianami**;
- **MINOR** — nowa możliwość, dane zgodne wstecz;
- **PATCH** — naprawa bez nowych pól w danych.

---

## Niewydane

### Naprawiono

- **Wspólny dziennik: dopisanie po wyścigu dwóch kart.** O tym, czy scalony
  dziennik wraca do wspólnego klucza, decydowała długość listy. Gdy sąsiednia
  karta nadpisała naszą pozycję swoją, starszą wersją (długość bez zmian),
  dopisanie się nie planowało i w magazynie zostawała wersja starsza. Naprawiało
  się to przy następnym przedmiocie, więc realnie ginął kierunek OSTATNIEGO
  przedmiotu zmiany — akurat na podsumowaniu. Teraz porównanie idzie po `id`
  i `updated`, czyli tą samą miarą, którą rozstrzyga scalanie.

---

## 1.0.0 — 2026-09-16

Pierwsze oficjalne wydanie. Kod ten sam, co w poprzedniej numeracji 9.2.0;
zmieniła się numeracja i sposób prowadzenia samego projektu.

### Dodano

- **Struktura modułowa.** Plik pocięty na 25 modułów w `src/`. Budowanie
  `npm run build` skleja je w jeden `counter.js`. W artefakcie przed każdym
  fragmentem stoi znacznik `// ─── src/xx-nazwa.js ───`, żeby przy czytaniu
  było widać, skąd pochodzi.
- **Manifest budowania** `build.manifest.json` — kolejność modułów i opis
  każdego w jednym zdaniu. On też jest mapą projektu.
- **Kontrola spójności artefaktu.** `npm run build:check` przebudowuje plik
  w pamięci i porównuje z tym, co leży w repozytorium. Ręczna poprawka
  `counter.js` przestaje przechodzić niezauważona.
- **Testy rozdzielone na pliki** — dziewięć sztuk w `tests/`, 106 sprawdzeń,
  własny runner i atrapa DOM. Doszły sprawdzenia wielu kart, których wcześniej
  nie było.
- **Oprzyrządowanie repozytorium:** CI (testy, budowanie, macierz Node 18/20/22
  na trzech systemach), workflow wydania po tagu, szablony PR i zgłoszeń,
  CODEOWNERS, Dependabot, ESLint, Prettier, `.editorconfig`, `.gitattributes`.
- **Dokumentacja:** nowy README z pełnym opisem możliwości, CONTRIBUTING
  z zasadami modułów i przepływu gałęzi, mapa modułów w `src/README.md`.

### Zmieniono

- **Prefiks magazynu** `statsHelper_v9_2_0_` → `statsHelper_v1_0_0_`.
  Liczniki poprzedniej wersji nie przenoszą się — aktualizować między zmianami.
  Archiwum podsumowań zmian zostaje: leży pod wspólnym prefiksem
  `statsHelper_shared_` i nie jest wersjonowane.
- **Wersja podstawiana przy budowaniu** z `package.json` zamiast literału
  w kodzie. W źródłach stoi `__VERSION__`.

### Nie zmieniono

Zachowanie skryptu nie zostało ruszone w żadnym miejscu. Sprawdzone bajt po
bajcie: bez komentarzy obie wersje dają 3091 linii kodu, różnic jest dokładnie
trzy — numer wersji, prefiks magazynu i dopisany do listy starych prefiksów
`statsHelper_v9_2_0_`.

---

## Prehistoria (numeracja 8.x — 9.x)

Przed 1.0.0 projekt żył bez repozytorium, w plikach `a.js`, `k.js`, `d.js`
i osobnych changelogach. Poniżej krótko, co skąd się wzięło.

### 9.2.0 — tryb cichy

- **Moduł cen domyślnie wyłączony.** Po uruchomieniu skrypt nie wysyła ani
  jednego zapytania do internetu. Sieć budzi się dopiero po ręcznym włączeniu.
  Zabezpieczenie w pięciu niezależnych miejscach.
- **Logi domyślnie wyłączone.** Trzy poziomy: `log` i `error` podlegają
  wyłącznikowi, `fatal` wypisuje się zawsze — cicha awaria na starcie wygląda
  jak „nic się nie stało”.
- **Linia 7** — kompaktowy licznik `17.4 28`, jedyne, co widać domyślnie.
- Linie 2 i 6 wyłączone domyślnie.
- Okno przeniosło się do lewego dolnego rogu i nauczyło się dociągać do dołu.
- Wszystkie komentarze i wszystkie komunikaty logów przetłumaczone na polski.
- Pojawił się zestaw testów bezpieczeństwa.

### 9.1.1 — separator tysięcy

Cena droższa niż 999 € trafiała do dziennika z utraconą najstarszą cyfrą: Keepa
drukuje `€ 2,991.39`, a rozbiór zwracał `991.39`. Przyczyna — przecinek
rozdzielający w pasku legendy wygląda jak kropka, łańcuch nie przechodził
sprawdzenia formy i wygrywał jego własny obcinek. Forma została rozszerzona,
doszedł normalizator `toDecimal()`.

### 9.1.0 — wspólny dziennik dla wszystkich kart

Dziennik wartości czytany był z `localStorage` raz na starcie, a zapisywany
w całości — dwie karty zamazywały się nawzajem. Przerobione na scalanie po `id`
z rozstrzyganiem konfliktów po `updated`. Do tego zasada „`Secondary-Sorting`
bez uściślenia = niesprzedaż” oraz kolor i przezroczystość linii 6.

### 9.0.0 — pieniądze w euro i kierunek przedmiotu

Kursy walut z otwartego źródła, sprowadzenie wszystkich cen do euro, rozdzielenie
sprzedaż/utylizacja po kodzie sortowania, bilans zmiany w linii 6.

### 8.6.0 — przeglądanie sklepów

Jeśli na wybranym rynku ceny nie ma, próbowane są pozostałe rynki Keepa
w losowej kolejności. Do tego limity zapytań na sesję.

### 8.5.0 — link do towaru i wybór sklepu

Jedno ustawienie sklepu na link, wykres i walutę. Kartę można ukryć bez
wyłączania silnika. Trwały cache cen usunięty: cena zmienia się w ciągu dnia.

### 8.4.0 / 8.4.1 — cena tekstem i dziennik wartości

Rozpoznawanie ceny z pikseli legendy Keepa zamiast pokazywania obrazka. Dziennik
wartości obsłużonych przedmiotów. W 8.4.1 — zasada dla kropki szerokiej na dwa
piksele.

### 8.3.0 — rozbiór błędów z przeglądu 8.2.0

Subskrypcja zmian stanu po gałęziach zamiast jednego wspólnego zdarzenia, głębokie
kopiowanie w `deepMerge`, rozbiór CSP według gramatyki, poprawna rozbiórka skryptu
podniesionego do połowy.

### 8.2.0 — karta ceny

Pierwsza wersja karty ceny po ASIN.

### 8.1.0 — cykl życia zmiany

Autozapis ustawień, reset danych między zmianami, odfiltrowanie własnych mutacji
w `MutationObserver`.
