# Historia zmian

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie: [SemVer](https://semver.org/lang/pl/).

Dla tego projektu SemVer czyta się tak:

- **MAJOR** — zmienia się `SCRIPT_ID_PREFIX`: liczniki i ustawienia nie przenoszą się,
  aktualizować można **wyłącznie między zmianami**;
- **MINOR** — nowa możliwość, dane zgodne wstecz;
- **PATCH** — naprawa bez nowych pól w danych.

---

## 1.2.0 — 2026-09-19

### Dodano

- **Kod ustawień — jeden ciąg szesnastkowy zamiast przeklikiwania panelu.**
  Sekcja „Kod ustawień” na dole panelu pokazuje kod bieżących ustawień
  (`0x0101000101010103ff8800…`) i gotową zakładkę z tym kodem w środku; obok
  stoi pole na cudzy kod. To samo z konsoli: `SH.configCode()`, `SH.configLink()`
  i `SH.config('0x…')` — wielkość liter bez znaczenia. Kod obejmuje wszystko,
  co daje się ustawić: położenie okna, siedem linii, kolory działów, nakładkę,
  całą kartę ceny, język, sklep, skróty klawiszowe i udział działów w sumie.
  Danych — liczników, dziennika, stanu zmiany — nie obejmuje.

  Format to zbiór samoopisujących się rekordów `[numer: 2 B][długość: 1 B]
[wartość]` z sumą kontrolną na końcu, a nie stała mapa bitów. Dzięki długości
  w rekordzie nieznany numer daje się przeskoczyć, więc **kody zachowują
  ważność w obie strony przez wydania**: starszy skrypt wczyta kod z nowszego
  (pomijając to, czego i tak nie umie ustawić), nowszy wczyta stary. Numer raz
  wydany nie wraca do obiegu. Kod jest łatką, a nie zdjęciem konfiguracji —
  wchodzi do niego tylko to, co różni się od domyślnych, więc zmiana wartości
  domyślnej w kolejnym wydaniu dociera do ludzi, którzy danej rzeczy nie ruszali.

  Kod przychodzi z zewnątrz, więc dekodowanie nie tworzy pól: zapis idzie
  wyłącznie pod ścieżki z rejestru, liczby są przycinane do granic z rejestru,
  kolory sprawdzane co do formy, pola wyboru po indeksie z listy, teksty tylko
  w drukowalnym ASCII. Nieznany numer, zła długość i śmieciowa wartość są
  pomijane pojedynczo, z adnotacją w sprawozdaniu.

- **Zakładka niesie ustawienia i nakłada je w trakcie uruchamiania.** Adres
  z `SH.configLink()` najpierw wpisuje kod do okna przeglądarki, a dopiero potem
  pobiera plik; skrypt czyta go w `Main.init()` — po wczytaniu magazynu, przed
  pierwszym rysowaniem okna. Wcześniejszy pomysł (wykonać plik, a zaraz za nim
  `SH.config('0x…')`) nie działał na stronie, która jeszcze się wczytuje, bo `SH`
  w tym momencie nie istnieje, a na gotowej stronie dawał mrugnięcie wyglądem
  domyślnym. Kliknięcie zakładki na stronie z już działającym skryptem nie stawia
  drugiego egzemplarza, ale ustawienia nakłada — na ten działający.

### Zmieniono

- **Wydanie da się zrobić bez konsoli.** README ma rozdział „Wydania”: commit
  wydania w PR, a potem tag wyklikany w **Releases → Draft a new release**.
  Workflow wydania przyjmuje teraz także ręczne uruchomienie z podanym tagiem
  (**Actions → Release → Run workflow**), więc przebieg, który padł po utworzeniu
  tagu, powtarza się bez wydawania nowej wersji. Wcześniej to pole istniało, ale
  nie mogło zadziałać: bez tagu sprawdzenie wersji porównywało `main` z numerem
  z `package.json`.

- **Zasady numerowania wersji zapisane w `build.manifest.json`** — razem
  z rozróżnieniem trzech numerów, które łatwo pomylić: wersji skryptu,
  `SCRIPT_ID_PREFIX` (schemat danych) i `ConfigCode.FORMAT` (ramka kodu ustawień).

- Kolejność modułów: `23-config-code.js` stoi teraz przed `24-presets.js`.
  Presety wołają `Main.init()`, a init używa kodu ustawień w czasie działania,
  więc musi mieć go zadeklarowanego wyżej.

- `README.md` opisuje mechanizm kodu wraz z rozbiorem przykładowego ciągu;
  liczba sprawdzeń w dokumentacji doprowadzona do stanu faktycznego (246).

---

## 1.1.0 — 2026-09-19

### Dodano

- **Wyłączniki zawartości karty ceny** — te same klocki, co przy liniach okna
  statystyk: kod produktu, jego klikalność i czas zdobycia ceny w milisekundach.
  Do tego wybór kroju pisma z listy okna statystyk.

- **Procent sprzedaży na końcu linii 1, 2 i 7.** Liczba od 0 do 100 ze znakiem
  procentu: ile ze zrobionych przedmiotów pojechało na sprzedaż. Mianownikiem
  jest licznik przedmiotów, więc przedmiot o nieustalonym kierunku obniża procent
  zamiast wypadać z rachunku, a same niesprzedaże na początku zmiany dają uczciwe
  `0%`. Część ułamkowa jest odrzucana, a nie zaokrąglana — 1 z 17 to `5%`, nie
  `6%`. Linia 1 liczy bieżącą kartę, linie 2 i 7 wszystkie wliczane do sumy.
  Kierunek bierze się z tekstu strony, więc procent działa przy **wyłączonym**
  module cen i nie kosztuje ani jednego zapytania. Żyje jedną zmianę i zeruje się
  razem z licznikami.

- **Lista haseł dostępu zamiast jednego hasła.** Na górze pliku stoi teraz
  `SETTINGS_ACCESS_PASSWORDS = ['GORDONPAULE', 'BOMBA']`; wszystkie pozycje
  działają tak samo i można dopisywać kolejne. Wielkość liter bez znaczenia,
  białe znaki z brzegów obcinane, powtórzenia i pozycje, które hasłem nie są,
  pomijane. Jedno ograniczenie wynika z mechanizmu i jest pilnowane testem:
  hasło nie może być początkiem innego hasła, bo krótsze zadziałałoby wcześniej
  i wyczyściło bufor.

- **Kolor tekstu karty ceny** — jedna para (kolor + przezroczystość) na
  wszystkie wiersze karty, zmieniana pickerem w panelu, tak samo jak przy liniach
  okna statystyk.
- **Wyłącznik wiersza źródła** (`showSource`). Czas zdobycia ceny ma własny
  wyłącznik i działa niezależnie od niego.

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

- **Format linii 7: z dwóch członów na trzy** — `17.4 28` stało się
  `17.4 28 14%`. Reszta formatu nienaruszona: bez jednostek, nawiasów
  i przecinków.

- `Routing.onCompleted()` wywołuje się teraz zawsze, a nie tylko wtedy, gdy
  dziennik wartości wydał id wpisu. Dopóki jedynym odbiorcą kierunku był
  dziennik, warunek był poprawny; procent sprzedaży jest drugim odbiorcą i przy
  ustawieniach domyślnych jedynym.

- **`SETTINGS_ACCESS_PASSWORD` (pojedyncze) zniknęło** — zastąpione tablicą
  `SETTINGS_ACCESS_PASSWORDS`. Kto miał własne hasło w swojej kopii pliku,
  przenosi je do tablicy.

- Bufor klawiatury jest łańcuchem zamiast tablicy sklejanej przez `join('')`
  przy każdym naciśnięciu, a porównanie z hasłami startuje dopiero wtedy, gdy
  naciśnięty znak jest ostatnim znakiem któregoś z nich. Przy dwóch domyślnych
  hasłach pracę uruchamiają wyłącznie litery `E` i `A` — każdy inny klawisz
  kosztuje jedno nieudane zajrzenie do mapy.

- **Karta ceny to domyślnie jedna szara linijka z kwotą.** Ten sam kolor
  (`#808080`), ta sama przezroczystość (50%) i ten sam rozmiar (13 px), co
  linia 7, na przezroczystym tle. Domyślnie wyłączone: kod produktu, cena
  katalogowa, wiersz źródła, czas zdobycia ceny.

- **Kolory przestały nieść stan.** Zielona cena i pomarańczowa kreska zniknęły:
  kolor jest teraz ustawieniem wyglądu, a stan mówi TEKST — i ten tekst pokazuje
  się zawsze, niezależnie od wyłączników. Dotyczy to powodu braku ceny (blokada
  CSP, limit, brak wyniku) oraz adnotacji, że cenę zdjęto z innego sklepu niż
  wybrany.

Zachowanie po wklejeniu pliku się nie zmienia: karta pojawia się dopiero po
ręcznym włączeniu modułu cen, więc na starcie nadal widać samą linię 7, bez
zapytań sieciowych i bez linii w konsoli.

Zachowanie po wklejeniu pliku się nie zmienia: karta pojawia się dopiero po
ręcznym włączeniu modułu cen, więc na starcie nadal widać samą linię 7, bez
zapytań sieciowych i bez linii w konsoli.

### Naprawiono

- **Przycisk przeciągania okna nie nadążał za stanem.** Jego wygląd wyliczany
  jest przy rysowaniu panelu z flagi `uiFlags.*Dragging`, ale przerysowanie
  wołała wyłącznie obsługa kliknięcia w ten przycisk — a flagę zdejmuje też
  dragger po puszczeniu myszy i przycisk resetu pozycji. Człowiek przeciągał
  okno, puszczał, tryb się wyłączał, a przycisk dalej świecił pomarańczowym
  i pisał „kliknij, by przypiąć”; kliknięcie w niego WŁĄCZAŁO przeciąganie
  z powrotem. Panel nasłuchuje teraz obu flag, więc kontrolka pokazuje stan
  niezależnie od tego, kto go zmienił.

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
