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

### Dodano

- **Wyłączniki zawartości karty ceny** — te same klocki, co przy liniach okna
  statystyk: kod produktu, jego klikalność i czas zdobycia ceny w milisekundach.
  Do tego wybór kroju pisma z listy okna statystyk.

### Zmieniono

- **Wyłączone linie nie są składane.** Widocznością linii steruje CSS, więc
  render szedł bezwarunkowo: raz na sekundę powstawał komplet węzłów linii,
  których nikt nie ogląda, a linia 6 przy okazji przechodziła po całym dzienniku
  wartości i przeliczała każdą pozycję po kursie. Przy ustawieniach domyślnych
  widoczna jest jedna linia z siedmiu. Pomiar w atrapie DOM (500 przebiegów):
  12,0 → 0,0 utworzonych węzłów na render, 0,069 → 0,024 ms na render, a przy
  dzienniku na 1000 pozycji 0,229 → 0,024 ms — koszt przestał zależeć od długości
  zmiany. Liczby na ekranie się nie zmieniają: pętla po kartach chodzi jak
  dotąd, bo `gTotal` potrzebny jest także linii 7.

- **Karta ceny wygląda teraz jak linie, a nie jak okno aplikacji.** Domyślnie:
  tło przezroczyste (`bgAlpha` 88 → 0), cena cienka w rozmiarze 16 px zamiast
  tłustych 30 px, bez ramki i cienia — ramka i cień wracają razem z tłem, gdy
  ktoś podniesie suwak. Dolna granica suwaka rozmiaru zeszła z 14 na 11 px,
  żeby kartę dało się zrównać z liniami.
- **Kod produktu domyślnie nie jest linkiem** (`asinClickable: false`).
  `pointer-events:auto` na linku było jedynym wyjątkiem od przezroczystej dla
  myszy karty, czyli jedynym miejscem, w którym karta mogła przykryć przycisk
  T-REX. Link włącza się w panelu ustawień; przy wyłączonym kod produktu nie ma
  `href`, więc nie otworzy go ani tabulator, ani środkowy przycisk myszy.
- **Czas zdobycia ceny nie jest już dopisywany zawsze** (`showLatency: false`).
  To liczba dla kogoś, kto dobiera źródło ceny, a nie dla kogoś, kto pracuje.

### Naprawiono

- **Pełny magazyn nie zabija skryptu.** `localStorage` tej domeny dzielimy
  z samym TREX, więc kwota potrafi się skończyć nie z naszej winy. Wyjątek
  z `setItem` szedł ze `StorageManager.write()` nieprzechwycony aż do `Main.init()`
  i skrypt nie wstawał wcale — zamiast stracić przeniesienie liczników przez F5,
  człowiek tracił licznik. Teraz nieudany zapis wraca `false`, praca idzie dalej
  na stanie w pamięci, a notatka „już zapisane” stawia się dopiero po udanym
  zapisie, więc po zwolnieniu kwoty ta sama wartość da się zapisać.

- **Wspólny dziennik: dopisanie po wyścigu dwóch kart.** O tym, czy scalony
  dziennik wraca do wspólnego klucza, decydowała długość listy. Gdy sąsiednia
  karta nadpisała naszą pozycję swoją, starszą wersją (długość bez zmian),
  dopisanie się nie planowało i w magazynie zostawała wersja starsza. Naprawiało
  się to przy następnym przedmiocie, więc realnie ginął kierunek OSTATNIEGO
  przedmiotu zmiany — akurat na podsumowaniu. Teraz porównanie idzie po `id`
  i `updated`, czyli tą samą miarą, którą rozstrzyga scalanie.

- **Karta ceny znikała na stałe po wyjątku.** Rezerwowe szukanie ASIN chowa
  kartę na czas odczytu `document.body.innerText` (inaczej podałaby nam własny,
  poprzedni ASIN). Przywrócenie stało PO odczycie, więc wyjątek w trakcie —
  rozbierane drzewo, cudzy skrypt — zostawiał kartę schowaną do końca zmiany.
  Z zewnątrz wygląda to jak zepsuty skrypt. Przywracanie przeniesione do
  `finally`.

---

## Niewydane

### Dodano

- **Procent sprzedaży na końcu linii 1, 2 i 7.** Liczba od 0 do 100 ze znakiem
  procentu: ile ze zrobionych przedmiotów pojechało na sprzedaż. Mianownikiem
  jest licznik przedmiotów, więc przedmiot o nieustalonym kierunku obniża procent
  zamiast wypadać z rachunku, a same niesprzedaże na początku zmiany dają uczciwe
  `0%`. Część ułamkowa jest odrzucana, a nie zaokrąglana — 1 z 17 to `5%`, nie
  `6%`. Linia 1 liczy bieżącą kartę, linie 2 i 7 wszystkie wliczane do sumy.
  Kierunek bierze się z tekstu strony, więc procent działa przy **wyłączonym**
  module cen i nie kosztuje ani jednego zapytania. Żyje jedną zmianę i zeruje się
  razem z licznikami.

### Zmieniono

- **Format linii 7: z dwóch członów na trzy** — `17.4 28` stało się
  `17.4 28 14%`. Reszta formatu nienaruszona: bez jednostek, nawiasów
  i przecinków.
- `Routing.onCompleted()` wywołuje się teraz zawsze, a nie tylko wtedy, gdy
  dziennik wartości wydał id wpisu. Dopóki jedynym odbiorcą kierunku był
  dziennik, warunek był poprawny; procent sprzedaży jest drugim odbiorcą i przy
  ustawieniach domyślnych jedynym.

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
