# StatsHelper Counter

Licznik obsłużonych przedmiotów dla T-REX. Siedzi cicho w rogu ekranu przez całą
zmianę, liczy sztuki ze wszystkich otwartych kart i domyślnie nie robi nic poza
tym: ani jednego zapytania do internetu, ani jednej linii w konsoli.

**Wersja 1.0.0** · [Co nowego](CHANGELOG.md) · [Jak wprowadzać zmiany](CONTRIBUTING.md)

```
17.4 28
```

To cały domyślny interfejs — dwie szare liczby w lewym dolnym rogu.
Pierwsza: przedmiotów na godzinę, łącznie ze wszystkich kart. Druga: ile zrobiono.
Cała reszta — linia z podsumowaniem działów, bilans pieniężny zmiany, karta ceny
towaru — istnieje, ale włącza się ręcznie.

---

## Spis treści

- [Szybki start](#szybki-start)
- [Co robi domyślnie](#co-robi-domyślnie)
- [Linie okna statystyk](#linie-okna-statystyk)
- [Moduł cen](#moduł-cen)
- [Panel ustawień](#panel-ustawień)
- [Konsolowe API](#konsolowe-api)
- [Kilka kart naraz](#kilka-kart-naraz)
- [Zmiany i przerwy](#zmiany-i-przerwy)
- [Bezpieczeństwo](#bezpieczeństwo)
- [Budowa repozytorium](#budowa-repozytorium)
- [Praca nad kodem](#praca-nad-kodem)
- [Wersjonowanie](#wersjonowanie)
- [Diagnostyka](#diagnostyka)

---

## Szybki start

1. Otworzyć roboczą stronę T-REX.
2. `F12` → zakładka Console.
3. Wkleić całą zawartość [`counter.js`](counter.js), nacisnąć Enter.

W lewym dolnym rogu pojawią się dwie liczby. Nic więcej robić nie trzeba.

> **Nagłówek `==UserScript==`** został w pliku jako dokumentacja. Menedżer
> skryptów (Tampermonkey i podobne) nie jest potrzebny, a jego API (`GM_*`)
> nigdzie nie jest używane — wszystko zapisuje się przez `localStorage`.

**Otwarcie ustawień:** wpisać na stronie `GORDONPAULE` (poza polem tekstowym).
Hasło stoi w jednej linii na początku pliku i można je zmienić dowolnie.

---

## Co robi domyślnie

|                                    |                                                   |
| ---------------------------------- | ------------------------------------------------- |
| Zapytań sieciowych po uruchomieniu | **0**                                             |
| Linii w konsoli po uruchomieniu    | **0**                                             |
| Widocznych elementów na ekranie    | jedna linia, 13 px, szara, alfa 50 %              |
| Położenie                          | lewy dolny róg, 20 px od lewej, 8 px od dołu      |
| Co jest liczone                    | przedmioty ze **wszystkich** otwartych kart T-REX |

To nie jest przypadkowy zestaw, tylko jawny cel tej wersji: skrypt ma przeżyć
dziesięciogodzinną zmianę, niczego nie zużywając i nie przeszkadzając.

**Jak liczony jest przedmiot.** Skrypt śledzi tekst strony. Pojawienie się
`poniżej` (albo `Transparency`) podnosi flagę „zaczął się przedmiot”; pojawienie
się `Przypisz nowy` przy podniesionej fladze daje `+1`. Przerwany przedmiot,
przy którym nie doszło do finalnej linii, nie jest zaliczany — dokładnie tak
samo, jak nie zalicza go sam system.

---

## Linie okna statystyk

W oknie jest siedem niezależnych linii. Każda włącza się osobno, każda ma własny
kolor, przezroczystość i rozmiar czcionki.

| Linia | Co pokazuje                                                         | Domyślnie |
| ----- | ------------------------------------------------------------------- | --------- |
| **1** | statystyka bieżącej karty: `CRET 8.8/h (7 zrobione w 2g 15m)`       | wył.      |
| **2** | podsumowanie działów: `CRET 8.8/h(7) WHD 5.0/h(4) = ~13.9/h (11)`   | wył.      |
| **3** | rodzaj i początek zmiany: `DZIENNA zmiana (06:30)`                  | wył.      |
| **4** | wybrana przerwa: `Przerwa #4 (12:50 - 13:20)`                       | wył.      |
| **5** | zegar: `[ 14:32:07 ]`                                               | wył.      |
| **6** | bilans pieniężny zmiany: `+6000.00 -1500.00 = 4500.00 € 113 szt ?1` | wył.      |
| **7** | **kompaktowy licznik: `17.4 28`**                                   | **wł.**   |

### Linia 7 dokładniej

Dwie liczby oddzielone jedną spacją, bez jednostek, bez nawiasów, bez nazw działów:

- **pierwsza** — przedmiotów na godzinę, suma ze wszystkich liczonych kart;
- **druga** — ile łącznie zrobiono, też ze wszystkich kart.

To dokładnie te same liczby, które linia 2 pokazuje po `=` i w ostatnim nawiasie.
Odświeżanie raz na sekundę.

Linia liczona jest w tym samym przebiegu co linia 2 — celowo. Dwa niezależne
liczenia tego samego prędzej czy później się rozjadą.

### Linia 6 dokładniej

Działa tylko przy włączonym module cen. Pokazuje trzy liczby w euro: ile
zarobiono na sprzedaży, ile poszło do utylizacji, różnicę. Kolory niosą treść:
plus zielony, minus czerwony, wynik pokolorowany według własnego znaku. `?N`
na końcu to przedmioty, dla których kod sortowania tak i nie przyszedł; nie idą
ani na plus, ani na minus.

Wybierak koloru dla linii 6 steruje wyłącznie częścią neutralną (liczbą sztuk).
Zieleń i czerwień nie są oddane do ustawień: po nich czyta się znak.

---

## Moduł cen

Wyłączony domyślnie. Dopóki jest wyłączony, skrypt **w ogóle nie wchodzi do sieci**.

Włącza się w panelu ustawień (sekcja „Moduł cen”) albo poleceniem `SH.priceOn()`.
Stan jest zapisywany i przeżywa przeładowanie strony.

### Co pojawia się po włączeniu

**Karta ceny** — pływający blok z ceną towaru, który jest właśnie obsługiwany.
ASIN na karcie jest klikalny i prowadzi na stronę towaru w tym sklepie, z którego
wzięto cenę. Sama karta jest przezroczysta dla myszy, klika się wyłącznie link.

**Dziennik wartości** — każdy zakończony przedmiot zapisuje się z ceną, walutą,
działem i kierunkiem (sprzedaż/utylizacja). Dziennik jest wspólny dla wszystkich
kart i przeżywa `F5`. Podsumowania zmiany trafiają do archiwum, którego
aktualizacja skryptu nie kasuje.

**Kursy walut** — jedno zapytanie przy włączeniu, potem dobę z pamięci. Potrzebne,
żeby dodać do siebie ceny z różnych rynków: funty z `co.uk`, dolary z `com`,
korony ze `se` sprowadza się do euro.

### Skąd bierze się cena

Bezpośrednie zapytanie na `amazon.*` ze strony T-REX jest niemożliwe — Same-Origin
Policy. Sprawdzone: blokowane jest wszystko, łącznie z `no-cors`, `iframe`,
`script src` i widżetami partnerskimi. Działają dokładnie dwa źródła:

| Źródło            | Co to jest                                                        | Kiedy używane                     |
| ----------------- | ----------------------------------------------------------------- | --------------------------------- |
| `graph.keepa.com` | PNG z wykresem ceny; cena jest **rozpoznawana z pikseli legendy** | domyślnie                         |
| `r.jina.ai`       | tekst strony towaru przez proxy z CORS                            | tryb `jina`                       |
| `api.keepa.com`   | oficjalne API                                                     | tylko po wpisaniu płatnego klucza |

Rozpoznawanie ceny z obrazka nie jest OCR-em w zwykłym sensie: czcionka legendy
Keepa jest rastrowa i niezmienna, więc glify porównuje się z tablicą wzorców bit
po bicie. Na 20 prawdziwych towarach: 32 linie z 32, 0,14 ms, zero zależności.
Dla porównania `tesseract.js` na tych samych danych dał 13 z 20, 140 ms i, co
gorsza, mylił się **w stronę zawyżenia** (gubił kropkę dziesiętną).

### Przeglądanie sklepów

Jeśli na wybranym rynku ceny nie ma, skrypt próbuje pozostałych rynków Keepa
w losowej kolejności, z sekundową przerwą, najwyżej pięć sztuk. Ustawienie sklepu
przy tym się nie zmienia — to jednorazowa próba dla jednego przedmiotu. Cena
znaleziona na obcym rynku jest oznaczona na karcie, a link prowadzi właśnie tam.

### Kodowanie kierunku

Dokąd pojechał przedmiot, ustala się po kodzie sortowania na ekranie (`Zeskanuj
CRITS-POZ1`, `Zeskanuj Liquidation` itd.). Kod może pojawić się przed finalnym
wyzwalaczem, razem z nim albo po nim — dlatego pilnuje go osobny automat,
a wpis w dzienniku jest uzupełniany wstecz.

Przypadek szczególny to `Secondary-Sorting`: sam z siebie niczego nie rozstrzyga
i czeka na linię uściślającą. Jeśli uściślenie nie przyszło do początku następnego
przedmiotu, przedmiot liczy się jako niesprzedaż. Zasada jest niesymetryczna
celowo: potwierdzenie sprzedaży przychodzi zawsze, niesprzedaży — nie zawsze.

---

## Panel ustawień

Otwiera się po wpisaniu hasła `GORDONPAULE` na stronie.

| Sekcja              | Co się ustawia                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Ogólne              | język (pl/en/ru), pełny reset danych, reset samych liczników                                       |
| Pomoce wizualne     | kolorowa nakładka na stronę, duży napis z nazwą działu                                             |
| Stylizacja okna     | tło okna, czcionka, **wszystkie siedem linii** (kolor, alfa, rozmiar), przeciąganie, reset pozycji |
| Statystyki globalne | które działy wchodzą do sumy, ręczna poprawka liczników                                            |
| Skróty klawiszowe   | klawisze `+1` i `−1`                                                                               |
| Auto-inkrementacja  | odstęp skanowania strony (50–200 ms)                                                               |
| **Moduł cen**       | **główny wyłącznik sieci**                                                                         |
| Karta ceny          | sklep, źródło ceny, wygląd, rozmiary, tło — _tylko przy włączonym module_                          |
| Dziennik wartości   | czy prowadzić dziennik, podsumowania, kursy, eksport, czyszczenie — _tylko przy włączonym module_  |
| Wybór przerwy       | który obiad jest wybrany (wpływa na liczenie godzin)                                               |

Język interfejsu domyślnie polski, są też angielski i rosyjski.

---

## Konsolowe API

Po uruchomieniu dostępny jest obiekt `SH`:

```js
// Moduł cen
SH.priceOn(); // włączyć (pierwsze i jedyne wejście do sieci)
SH.priceOff(); // wyłączyć
SH.priceStats(); // ile zapytań poszło, co siedzi w pamięci

// Logi
SH.logsOn(); // włączyć wypisywanie do konsoli
SH.logsOff(); // wyłączyć
SH.logs(); // sprawdzić stan

// Dane
SH.valueReport(); // tabela dziennika wartości do konsoli
SH.valueArchive(); // archiwum podsumowań zmian
SH.fxStatus(); // skąd wzięto kursy walut
SH.routeInfo(); // co obecnie wiadomo o kierunku przedmiotu

// Diagnostyka
SH.cspReport(); // co dopuszcza polityka strony (async)
SH.forcePrice(asin); // odpytać o cenę ręcznie
SH.readPrice(asin); // odczytać cenę z wykresu z pominięciem cache
SH.setLimits({ images: 3000 }); // podnieść limity zapytań w locie

// Wnętrzności
SH.store; // cały stan
SH.CONFIG; // wszystkie stałe
SH.Main.teardown(); // poprawnie zdjąć skrypt ze strony
```

Zmiany w `SH.store` działają od razu, ale żeby przeżyły `F5`, trzeba wywołać
`SH.StorageManager.saveState()`.

---

## Kilka kart naraz

Normalny tryb pracy to dwie–trzy otwarte karty (CRET, WHD, REFURB). Dzielą jeden
`localStorage` i synchronizują się przez zdarzenie `storage`:

- **liczniki** widać we wszystkich kartach od razu, bez przeładowania;
- **linie 2 i 7** pokazują sumę ze wszystkich kart, a nie z własnej;
- **dziennik wartości** jest jeden dla wszystkich kart — i to jest zasadnicze,
  bo jeden fizyczny przedmiot może dać dwa wpisy (pojechał z CRET do WHD ze
  znakiem minus, wrócił sprzedażą z karty WHD ze znakiem plus; poprawny wynik
  to zero);
- **ustawienia wyglądu** każda karta ma własne.

Karta otwarta w połowie zmiany od razu widzi cudze liczniki.

---

## Zmiany i przerwy

Zmianę ustala się po lokalnym czasie przeglądarki:

|         | Okno zmiany   | Początek odliczania |
| ------- | ------------- | ------------------- |
| Dzienna | 06:19 – 17:55 | 06:30               |
| Nocna   | 18:19 – 05:55 | 18:30               |

Między zmianami jest „martwa strefa” (17:55–18:19 i 05:55–06:19) — w niej
zapisana zmiana **nie jest resetowana**, żeby komuś, kto został dłużej,
statystyka się nie wyzerowała.

**Dane żyją jedną zmianę.** Na maszynach, gdzie sesja przeglądarki nie jest
resetowana między zmianami, skrypt rozpoznaje to na dwa sposoby: po wieku
zapisanego startu (starszy niż 12 h — dane są cudze) i po niezgodności czasu
startu (dzienna zaczęła się o 06:30, a o 18:21 do tego samego komputera usiadła
nocna — różnica 11 h 51 min, próg 12 h jej nie złapie, a porównanie startów tak).

Przy resecie pokazuje się powiadomienie: człowiek musi widzieć, że wyzerowanie
nastąpiło celowo.

---

## Bezpieczeństwo

Skrypt działa na cudzej stronie i czyta dane z trzech źródeł, których nie
kontroluje: `localStorage` domeny (wspólny z samym T-REX), tekst i DOM strony,
odpowiedzi zewnętrznych serwisów. Dlatego:

| Zabezpieczenie                                                        | Gdzie                    |
| --------------------------------------------------------------------- | ------------------------ |
| Żadnego parsowania HTML: cały tekst przez `createTextNode`            | generator DOM `h()`      |
| `innerHTML` tylko do czyszczenia (`= ''`), nigdy z treścią            | sprawdzane testem        |
| Ani `eval`, ani `new Function`, ani `document.write`                  | sprawdzane testem        |
| Ochrona przed prototype pollution (`__proto__`, `constructor`)        | `Utils.deepMerge`        |
| Liczby z konfiguracji są zaciskane do zakresu, zanim trafią do CSS    | `Utils.clampNum`         |
| Kolory sprawdzane zakotwiczonym wyrażeniem, inaczej — szary           | `Utils.hexToRgb`         |
| ASIN sprawdzany po `^[A-Z0-9]{10}$` przed wyjściem do sieci           | `KeepaOCR.url`           |
| Host linku wyłącznie z białej listy, schemat wszyty na stałe          | `productUrl`             |
| Kody sortowania są ekranowane przed złożeniem wyrażenia               | `Routing.codeRegex`      |
| Kursy walut sprawdzane pod kątem sensu, także przy odczycie z pamięci | `FxRates.normalize`      |
| Skrypt rusza wyłącznie własne klucze `localStorage`                   | `StorageManager.ownKeys` |
| Pięć niezależnych sprawdzeń przed każdym wyjściem do sieci            | `priceModuleOn()`        |

Wszystkie punkty są pokryte testami automatycznymi. `npm test` — 113 sprawdzeń,
z czego jedna trzecia dotyczy bezpieczeństwa.

---

## Budowa repozytorium

```
production/
├── counter.js              ← ARTEFAKT: to, co wkleja się do konsoli
├── src/                    ← ŹRÓDŁO: 25 modułów, tu poprawia się kod
│   ├── 00-banner.js
│   ├── 01-config.js  …  23-presets.js
│   ├── 99-footer.js
│   └── README.md           ← mapa modułów i zasady zależności
├── build.js                ← narzędzie budujące: src/ → counter.js
├── build.manifest.json     ← kolejność modułów = mapa projektu
├── tests/                  ← 10 plików, 113 sprawdzeń
│   ├── run.js              ← runner
│   ├── harness.js          ← describe/test/eq/ok
│   ├── dom-stub.js         ← atrapa DOM, localStorage i sieci
│   ├── *.test.js
│   └── manual/             ← stanowisko przeglądarkowe do ręcznej próby
└── .github/workflows/      ← CI: testy, budowanie, kontrola artefaktu
```

**Kluczowa zasada: `counter.js` nie jest poprawiany ręcznie.** Powstaje ze `src/`
poleceniem `npm run build`, a CI to sprawdza — jeśli artefakt w repozytorium różni
się od przebudowy, bramka pada.

---

## Praca nad kodem

```bash
npm run build        # src/ → counter.js
npm run build:check  # zbudować w pamięci i porównać z counter.js
npm test             # 113 sprawdzeń
npm run verify       # build:check + test  (to, co goni CI)
npm run lint         # ESLint (potrzebny npm ci)
npm run format       # Prettier (potrzebny npm ci)
```

`npm test` i `npm run build` działają **bez żadnej instalacji** — nie ma ani jednej
zależności produkcyjnej. Linter i formatter wymagają `npm ci` (plik blokady leży
w repozytorium) oraz Node 20.19+, ale bez nich nic się nie psuje.

Szczegółowo o tym, jak dodać moduł, jakie są zasady i jak wygląda przepływ gałęzi
oraz PR — w [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Wersjonowanie

[SemVer](https://semver.org/lang/pl/), a dla tego projektu czyta się go tak:

|           | Kiedy podnosić                     | Co to znaczy dla człowieka                                                      |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| **MAJOR** | zmienia się `SCRIPT_ID_PREFIX`     | liczniki i ustawienia **nie przenoszą się**, aktualizować tylko między zmianami |
| **MINOR** | nowa możliwość, dane zgodne wstecz | można aktualizować w dowolnej chwili                                            |
| **PATCH** | naprawa bez nowych pól             | można aktualizować w dowolnej chwili                                            |

Prefiks magazynu koduje **schemat danych**, a nie numer buildu: `1.1.0` i `1.2.0`
zostaną przy `statsHelper_v1_0_0_`, dopóki nie zmieni się skład zapisywanych pól.
Jedna zasada zapisana w dwóch miejscach, więc zapomnieć o niej nie sposób.

---

## Diagnostyka

**Skrypt nie wystartował, w konsoli pusto.**
Logi są domyślnie wyłączone, ale błędy krytyczne przechodzą zawsze i są oznaczone
`[Helper (Reactive) FATAL]`. Jeśli i ich nie ma — plik wkleił się niecały.

**Licznik nie rośnie.**
`SH.logsOn()`, potem obsłużyć przedmiot. Jeśli w konsoli nie ma
`[KIERUNEK] nowy przedmiot`, to znaczy, że wyzwalacze nie trafiły w tekst strony —
patrzeć na `CONFIG.PRE_TRIGGER_REGEX` i `CONFIG.AUTO_TRIGGER_REGEX`.

**Ceny nie przychodzą.**
Sprawdzić, czy moduł jest włączony: `SH.priceStats()`. Jeśli jest — `SH.cspReport()`
pokaże, czy polityka bezpieczeństwa strony nie tnie odwołań do `graph.keepa.com`.
CSP to imienna lista hostów i obejść jej z kodu strony się nie da.

**Skrypt już działa, ponowne wklejenie jest ignorowane.**
Tak ma być: dwa egzemplarze na jednej stronie psują liczniki.
`SH.Main.teardown()` zdejmuje bieżący, po czym można wkleić od nowa.

**Trzeba wrócić do ustawień fabrycznych.**
Panel ustawień → „Zresetuj Wszystkie Dane”. Usuwane są wyłącznie klucze skryptu,
danych samego T-REX to nie rusza.

---

## Licencja

[MIT](LICENSE)
