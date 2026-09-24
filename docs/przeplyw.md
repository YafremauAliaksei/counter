# Przepływy: co się dzieje i w jakiej kolejności

Cztery diagramy dla kogoś, kto ma w tym kodzie **znaleźć błąd albo zaproponować
zmianę**. Każdy odpowiada na jedno pytanie i kończy się dwoma rozdziałami, które
są tu ważniejsze niż sam obrazek: **gdzie to się psuje** (z nazwami usterek,
które już się zdarzyły) i **co tego pilnuje** (pliki testów).

| Diagram                                                | Pytanie                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [1. Życie przedmiotu](#1-życie-przedmiotu)             | od mutacji DOM do wpisu w dzienniku — gdzie przedmiot może się zgubić          |
| [2. Kto pisze do liczników](#2-kto-pisze-do-liczników) | pięć źródeł zmian i jeden niezmiennik, który je spina                          |
| [3. Droga do sieci](#3-droga-do-sieci)                 | wszystkie bramki między „chcę cenę” a `fetch`                                  |
| [4. Uruchomienie i magazyn](#4-uruchomienie-i-magazyn) | dlaczego `Main.init()` ma dokładnie taką kolejność i kto pisze do localStorage |

**Zasada utrzymania:** diagram, który kłamie, jest gorszy niż jego brak. Jeśli
zmiana w kodzie rozjeżdża się z obrazkiem, poprawia się jedno albo drugie —
w tym samym PR. Pilnuje tego `tests/25-flow-docs.test.js`: sprawdza, że każdy
moduł, każda stała konfiguracji i każda funkcja wymieniona w tym pliku naprawdę
istnieje w artefakcie.

Diagramy są w Mermaid, więc GitHub rysuje je sam, bez żadnego zewnętrznego
serwisu — a w diffie widać, co dokładnie się zmieniło.

---

## 1. Życie przedmiotu

Od zmiany tekstu na stronie T-REX do wpisu w dzienniku wartości. Jedna klatka
skanu, dwie niezależne połowy stanu: **zaliczenie** i **kierunek**.

```mermaid
flowchart TD
    MUT["MutationObserver na body<br/>AutoTrigger.observer"] --> OWN{"węzeł należy<br/>do skryptu?<br/>isOwnNode"}
    OWN -->|"tak"| IGN["pomijamy<br/>inaczej własny render budzi skan"]
    OWN -->|"nie"| DEB["debounce<br/>userConfig.triggerMutationDebounceMs<br/>50-200 ms"]
    DEB --> SCAN["AutoTrigger.scan<br/>txt = document.body.innerText"]

    SCAN --> ROUTE["Routing.observe txt<br/>PIERWSZY, przed wyzwalaczami"]
    ROUTE --> COUNTS["countAll: ile razy każdy kod<br/>wystąpił w tekście"]
    COUNTS --> GROWN{"liczba wystąpień<br/>WZROSŁA<br/>wobec poprzedniego skanu?"}
    GROWN -->|"nie"| PRE{"PRE_TRIGGER_REGEX<br/>poniżej / Transparency"}
    GROWN -->|"tak"| KIND{"Routing.kindOf kod"}

    KIND -->|"sell"| DIR["state.direction = sell"]
    KIND -->|"unsell"| DIR2["state.direction = unsell"]
    KIND -->|"neutral"| DIR3["state.direction = neutral<br/>AUDIT: poza mianownikiem"]
    KIND -->|"ambiguous"| PEND["state.pending = true<br/>_ambiguous = state<br/>czeka na linię uściślającą"]
    KIND -->|"kod spoza rejestru"| PRE

    PEND --> CONF{"w tekście przybyło<br/>ROUTE_CONFIRM_SELL<br/>albo ROUTE_CONFIRM_UNSELL?"}
    CONF -->|"tak"| RESOLVED["Routing.onConfirm<br/>kierunek ustalony"]
    CONF -->|"nie, a pojawiło się poniżej"| CLOSE["closeAmbiguous<br/>brak uściślenia = NIESPRZEDAŻ"]

    DIR --> PRE
    DIR2 --> PRE
    DIR3 --> PRE
    RESOLVED --> APPLY
    CLOSE --> APPLY

    PRE -->|"pasuje"| FLAG["uiFlags.itemInProgress = true<br/>Routing.startItem zamyka wiszący kod"]
    PRE -->|"nie"| AUTO{"AUTO_TRIGGER_REGEX<br/>Przypisz nowy / wysłano do ..."}
    FLAG --> AUTO
    AUTO -->|"nie pasuje"| RESET["uiFlags.autoTriggerFound = false<br/>gotowi na następny przedmiot"]
    AUTO -->|"pasuje"| GUARD{"itemInProgress<br/>ORAZ NIE autoTriggerFound?"}
    GUARD -->|"nie"| RESET2["ta sama linia wisi dalej<br/>drugi raz nie liczymy"]
    GUARD -->|"tak"| INC["InputManager.modifyCounter 1<br/>manual: false"]

    INC --> TASK["TaskManager.addItem karta<br/>paczka zadania + 1"]
    INC --> CNT["store.tabCounters karta + 1<br/>zapis: counter_KARTA"]
    INC --> EMIT["bus.emit item:completed"]

    EMIT --> LOG{"moduł cen włączony<br/>ORAZ logValues?"}
    LOG -->|"nie"| NOENTRY["entryId = null<br/>dziennika nie ma, procent i tak działa"]
    LOG -->|"tak"| ENTRY["ValueLog.add asin, cena, dział<br/>zapis: valueLog"]

    NOENTRY --> DONE["Routing.onCompleted entryId<br/>state.completed = true"]
    ENTRY --> DONE
    DONE --> APPLY

    APPLY["Routing.applyTo state"]
    APPLY --> BOTH{"completed ORAZ direction<br/>oba znane?"}
    BOTH -->|"nie"| WAIT["czekamy — druga połowa<br/>przyjdzie w którymś ze skanów"]
    BOTH -->|"tak"| ONCE{"Routing.state, pole counted<br/>już policzony?"}
    ONCE -->|"tak"| SKIP["nic; applyTo woła się<br/>po KAŻDYM z dwóch zdarzeń"]
    ONCE -->|"nie"| COUNT["countDirection<br/>sell: sold+1 → sold_KARTA<br/>neutral: neutral+1 → neutral_KARTA<br/>unsell: tylko mianownik"]
    COUNT --> SIGN{"entryId istnieje?"}
    SIGN -->|"tak"| MARK["ValueLog.setDirection<br/>znak +1 / -1 / 0 przy wpisie"]
    SIGN -->|"nie"| END["koniec: liczniki zaktualizowane"]
    MARK --> END
```

### Co tu widać

**Kolejność w `scan()` jest częścią mechanizmu.** `Routing.observe()` idzie
**przed** sprawdzeniem wyzwalaczy, żeby w klatce, w której kod sortowania
pojawia się razem z `Przypisz nowy`, kierunek był już znany w chwili tworzenia
wpisu w dzienniku. Odwrotna kolejność nie psuje liczb — znak dopisałby się
następnym skanem — ale robi z prostego przypadku ścieżkę wsteczną.

**Dwie połowy stanu są niezależne.** Kod sortowania potrafi pojawić się przed
wyzwalaczem końcowym, razem z nim albo po nim. Dlatego `applyTo()` woła się po
**każdym** z dwóch zdarzeń i sprawdza oba warunki, a znacznik `counted` pilnuje,
żeby przedmiot nie policzył się dwa razy.

**Liczy się WZROST liczby wystąpień, a nie sama obecność kodu.** Na ekranie jest
dziennik, w którym kod wisi dalej po tym, jak zadziałał. Zwykłe „czy kod jest
w tekście” doczepiałoby stary kod do następnego przedmiotu; licznik wystąpień
przeżywa też dwa jednakowe kody pod rząd.

**Brak kodu to nie to samo, co audyt.** Przedmiot bez kodu zostaje
w mianowniku procentu (znaczy „nie zobaczyliśmy”), audyt z mianownika wypada
(znaczy „nie da się wiedzieć”).

### Gdzie to się psuje

| Pułapka                                     | Objaw                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| własne węzły w obserwatorze                 | okno statystyk przerysowuje się co sekundę, każdy render budzi `scan()` z odczytem `innerText` — najdroższa operacja |
| `autoTriggerFound` bez zerowania            | linia wyzwalacza wisi na ekranie i liczy się w każdym skanie                                                         |
| kierunek liczony w momencie zakończenia     | kody, które przyszły po wyzwalaczu, przepadają                                                                       |
| `Routing.onCompleted` wołane tylko z wpisem | przy wyłączonym module cen procent stoi na zerze całą zmianę (usterka sprzed 1.1.0)                                  |
| kod z ogonem (`External-Repair`)            | wzorzec zaczepia się o POCZĄTEK kodu; dokładne dopasowanie gubiłoby całe rodziny                                     |

### Co tego pilnuje

`tests/08-parsers.test.js` (wyzwalacze i liczenie wystąpień),
`tests/17-sales-rate.test.js` (procent przy wyłączonym module cen),
`tests/21-route-codes.test.js` (rodziny kodów, przedrostek `NS-`, audyt),
`tests/22-tasks.test.js` (paczka trafia do zadania w tej samej chwili).

---

## 2. Kto pisze do liczników

Pięć źródeł zmian i jedna równość, która musi trzymać zawsze.

```mermaid
flowchart LR
    subgraph ZRODLA["Źródła zmian"]
        A1["AutoTrigger<br/>przedmiot zaliczony sam"]
        A2["Skrót klawiszowy +1 / -1<br/>InputManager"]
        A3["Panel: licznik działu<br/>Ustaw licznik"]
        A4["Panel: paczki albo tempo zadania"]
        A5["Routing: kierunek przedmiotu"]
    end

    A1 --> M1["modifyCounter delta, manual: false"]
    A2 --> M2["modifyCounter delta, manual: true"]
    A3 --> M3["TaskManager.applyManualTotal"]
    A4 --> M4["TaskManager.applyTaskTotal<br/>albo setRate"]
    A5 --> M5["TaskManager.addSold<br/>albo addNeutral"]

    M1 --> T1["TaskManager.addItem<br/>done + 1"]
    M2 --> T2["TaskManager.adjustManual<br/>done ± 1 ORAZ neutral ± 1"]
    M3 --> T3["różnicę bierze AKTYWNE zadanie<br/>gdy mniej: zdejmujemy od najnowszego wstecz"]
    M4 --> T4["różnica idzie do BIEŻĄCEJ karty<br/>razem z neutral"]
    M5 --> T5["sold + 1 albo neutral + 1"]

    T1 --> W["TaskManager._write<br/>jedyne miejsce, które rusza liczniki zadania"]
    T2 --> W
    T3 --> W
    T4 --> W
    T5 --> W

    W --> KEY["zapis: taskcnt_IDZADANIA_KARTA<br/>jako done,sold,neutral"]
    M1 --> S1["store.tabCounters<br/>zapis: counter_KARTA"]
    M2 --> S1
    M2 --> S3
    M3 --> SYNC["SettingsPanel.syncTabCounters<br/>liczniki karty nadążają za sumą zadań"]
    M4 --> SYNC
    M5 --> S2["store.tabSold → sold_KARTA<br/>store.tabNeutral → neutral_KARTA"]
    SYNC --> S1
    SYNC --> S2
    S3["store.tabNeutral → neutral_KARTA"]

    S1 --> INV
    S2 --> INV
    KEY --> INV
    INV["NIEZMIENNIK<br/>suma paczek zadań danej karty<br/>= licznik tej karty"]

    INV --> UI1["linie 1, 2, 7<br/>czytają liczniki karty"]
    INV --> UI2["linia 8 i panel<br/>czytają liczniki zadania"]
```

### Co tu widać

**Liczniki karty są źródłem prawdy dla linii 1, 2 i 7; zadania są ich rozbiciem
w czasie.** Obie strony ruszają się w jednym miejscu — w metodach menedżera
zadań — i dlatego mogą się nie rozjechać. Rozjazd byłby cichy: obie liczby
wyglądałyby sensownie, tylko nie opisywałyby tego samego.

**Ręcznie wpisana paczka idzie do `done` I do `neutral`.** Kierunku takiego
przedmiotu nikt nie zna, więc nie ma prawa ruszyć procentu ani w górę, ani
w dół. To jest powód, dla którego po awarii maszyny procent liczy się od
przedmiotu, przy którym człowiek wrócił do pracy.

**Zmniejszenie liczby paczek jest przewidywalne.** Przy wpisaniu liczby
mniejszej niż suma zadań nadmiar schodzi **od najnowszego zadania wstecz**, a nie
proporcjonalnie — praca sprzed kilku godzin zostaje nietknięta.

**Zadanie nie jest przypisane do działu.** Trzyma liczniki osobno dla każdego,
bo jeden proces pracy potrafi iść w dwóch kartach naraz. Paczka trafia zawsze do
pary _zadanie + dział_.

### Gdzie to się psuje

| Pułapka                                                   | Objaw                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| nowa droga zapisu z pominięciem `_write`                  | suma zadań rozjeżdża się z licznikiem karty; linia 1 i linia 8 mówią co innego           |
| ręczny wpis bez `neutral`                                 | procent sprzedaży spada do kilku procent po każdym powrocie do pracy                     |
| zapis liczników zadania jednym kluczem na wszystkie karty | dwie karty zamazują sobie liczby nawzajem (dlatego klucz ma w nazwie i zadanie, i kartę) |
| `tabCounters` ustawiane wprost w panelu                   | zadania zostają ze starą liczbą, niezmiennik pada                                        |

### Co tego pilnuje

`tests/22-tasks.test.js` — funkcja `drift()` sprawdza niezmiennik po **każdym**
istotnym scenariuszu; `tests/23-task-panel.test.js` — oba pola panelu;
`tests/24-departments.test.js` — dział ręczny i zmniejszanie liczby paczek.

---

## 3. Droga do sieci

Główna właściwość produktu: po wklejeniu pliku **zero zapytań**. Wszystko poniżej
zaczyna się dopiero po świadomym włączeniu modułu cen.

```mermaid
flowchart TD
    START["PriceCard.resolve asin"] --> G0{"asin niepusty?"}
    G0 -->|"nie"| STOP0["koniec"]
    G0 -->|"tak"| G1{"priceModuleOn<br/>localTabConfig.priceCard.moduleEnabled"}
    G1 -->|"WYŁĄCZONY"| STOP1["koniec — to jest stan domyślny"]
    G1 -->|"włączony"| G2{"inFlight ma ten asin?"}
    G2 -->|"tak"| STOP2["koniec: pytanie już leci"]
    G2 -->|"nie"| G3{"jakiekolwiek źródło usable?<br/>włączone i nie zablokowane przez CSP"}
    G3 -->|"nie"| STOP3["status off<br/>tryb legend: cenę widać na obrazku"]
    G3 -->|"tak"| LOOP["pętla po PriceSources.list<br/>keepa-ocr, keepa-api, jina/blok, jina/strona"]

    LOOP --> C1{"csp.net<br/>polityka strony już odmówiła?"}
    C1 -->|"tak"| BREAK1["przerywamy całą pętlę"]
    C1 -->|"nie"| C2{"limit dla RODZAJU źródła<br/>obrazki: PRICE_MAX_IMAGE_REQUESTS<br/>tekst: PRICE_MAX_REQUESTS_PER_SESSION"}
    C2 -->|"osiągnięty"| NEXT["następne źródło<br/>limitHit = true"]
    C2 -->|"jest zapas"| C3["respectRateLimit<br/>odstęp między zapytaniami"]
    C3 --> C4{"priceModuleOn PONOWNIE<br/>moduł mógł zgasnąć, póki czekaliśmy"}
    C4 -->|"WYŁĄCZONY"| BREAK2["przerywamy"]
    C4 -->|"włączony"| BUMP["licznik zapytań + 1"]
    BUMP --> RUN["p.run asin, signal<br/>withTimeout PRICE_REQUEST_TIMEOUT_MS"]

    RUN --> SRC["źródło składa adres i pyta przez PriceNet<br/>keepa-ocr: KeepaOCR.read → loadImage → PriceNet.image<br/>keepa-api, jina: PriceNet.request"]
    SRC --> O2{"adres z danych strony?<br/>ASIN pasuje do ^A-Z0-9 dokładnie 10"}
    O2 -->|"nie"| THROW["wyjątek: niedozwolony ASIN<br/>host i schemat wszyte na stałe"]
    O2 -->|"tak"| O1{"priceModuleOn<br/>TRZECI raz, najniżej: w PriceNet"}
    O1 -->|"WYŁĄCZONY"| REJ["odrzucone: zapytanie nie wyszło"]
    O1 -->|"włączony"| NET["fetch albo obrazek w tle"]

    NET --> RES["wynik albo błąd"]
    RES --> OK{"jest cena?"}
    OK -->|"tak"| SAVE["_remember: zapamiętujemy wynik<br/>render karty"]
    OK -->|"nie"| FB{"warto sprawdzić inne rynki?<br/>PRICE_FALLBACK_ENABLED ORAZ priceModuleOn<br/>ORAZ marketFallback ORAZ nie limitHit<br/>ORAZ jest źródło z marketSearch"}
    FB -->|"nie"| SAVE
    FB -->|"tak"| TRY["tryOtherMarkets<br/>rynek z linku, Europa, na końcu com i ca<br/>z przerwą PRICE_FALLBACK_DELAY_MS"]
    TRY --> T1{"w każdym obiegu:<br/>priceModuleOn, źródło usable, limit jego rodzaju,<br/>czy shownAsin to nadal ten przedmiot"}
    T1 -->|"któreś nie"| SAVE
    T1 -->|"wszystkie tak"| NET2["źródło pyta kolejny rynek"]
    NET2 --> SAVE
```

### Co tu widać

**Bramka modułu cen stoi na trzech poziomach:** na wejściu do `resolve()`,
w pętli po oczekiwaniu na slot i na samym dole, w `PriceNet` — przez niego idzie
każde zapytanie i każdy obrazek modułu cen, także kursy i diagnostyka. To nie
jest nadmiarowość przez przeoczenie — dolna bariera istnieje po to, żeby nowa
ścieżka wywołania, dopisana kiedyś przez kogoś, kto zapomni o sprawdzeniu wyżej,
też nie wypuściła zapytania.

**Limit liczy się osobno dla obrazków i dla zapytań tekstowych** (`kind` źródła).
Wspólny licznik sprawiałby, że obrazkowe źródło zjada limit tekstowy.

**Karta nie wie, skąd jest cena.** Hosty, adresy i rozbiór odpowiedzi żyją
w `src/15-price-sources.js`; karta zna tylko kontrakt źródła (`run`, `kind`,
`available`, `marketSearch`).

**Adres nigdy nie powstaje z danych strony.** Host i schemat są wszyte na stałe,
ASIN przechodzi przez zakotwiczone wyrażenie `^[A-Z0-9]{10}$`, reszta idzie przez
`encodeURIComponent`.

**Dwa zdarzenia, które przychodzą z opóźnieniem:** `securitypolicyviolation`
(stąd flagi `csp.net` i `csp.img` sprawdzane w KAŻDYM obiegu pętli) oraz zmiana
przedmiotu na ekranie (stąd sprawdzenie `shownAsin` w przeglądzie rynków).

Poza tą ścieżką do sieci wychodzą jeszcze dwa miejsca, oba przez `PriceNet`
i oba po świadomym kliknięciu: `FxRates.refresh()` przy włączaniu modułu cen
i `SH.cspReport()` wywołany ręcznie z konsoli.

### Gdzie to się psuje

| Pułapka                             | Objaw                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| sprawdzenie modułu tylko na wejściu | wyłączenie modułu w trakcie zapytania nie zatrzymuje reszty serii                                |
| limit sprawdzany przed pętlą        | jeden typ dostawcy zjada cudzy limit                                                             |
| brak sprawdzenia `shownAsin`        | przegląd rynków dosyła zapytania o przedmiot, którego dawno nie ma na ekranie                    |
| adres sklejany z tekstu strony      | dziura na wstrzyknięcie; dlatego host pochodzi z białej listy, a ASIN z wyrażenia zakotwiczonego |

### Co tego pilnuje

`tests/01-silence.test.js` (zero zapytań po starcie),
`tests/05-price-module.test.js` (bramka modułu na każdym poziomie),
`tests/06-injection.test.js` (adresy i ucieczka znaków),
`tests/09-artifact.test.js` (biała lista hostów w całym pliku),
`tests/14-price-boundaries.test.js` (granice kwot).

---

## 4. Uruchomienie i magazyn

`Main.init()` ma kolejność, która wygląda na dowolną, a dowolna nie jest —
każdy krok czegoś potrzebuje od poprzedniego.

```mermaid
flowchart TD
    BOOT["wklejenie pliku albo kliknięcie zakładki"] --> CODE{"window.statsHelper_v1_3_0_CONFIG_CODE<br/>podstawiony kod ustawień?"}
    CODE -->|"tak"| READY{"skrypt już działa<br/>na tej stronie?"}
    READY -->|"tak"| APPLYOLD["kod nakłada DZIAŁAJĄCY egzemplarz<br/>przez swoje SH.config; ten się nie uruchamia"]
    READY -->|"nie"| INIT
    CODE -->|"nie"| INIT

    INIT["Main.init"] --> P1["purgeLegacyKeys<br/>sprzątanie po starych prefiksach"]
    P1 --> P2["identifyTab<br/>gradingMode z adresu → CRET / REFURB / WHD<br/>dział bez urlKeyword nie bierze udziału"]
    P2 --> P3["Persistence.loadAll<br/>czyta: userConfig, sessionConfig,<br/>allLocalTabConfigs, counter_*, sold_*,<br/>neutral_*, tasks, taskcnt_*"]
    P3 --> P4["ConfigCode.applyBoot<br/>kod z zakładki, PRZED pierwszym rysowaniem"]
    P4 --> P5["ValueLog.load → valueLog"]
    P5 --> P6["FxRates.initOffline<br/>kursy TYLKO z magazynu, zero sieci"]
    P6 --> P7["SessionReset.checkStaleOnBoot<br/>dane z poprzedniej zmiany?"]
    P7 --> P8["ShiftManager.update<br/>ustala shiftCalculatedStartTime"]
    P8 --> P9["TaskManager.init<br/>PO zmianie, bo zadanie domyślne<br/>zaczyna się razem z nią"]
    P9 --> P10["store.initialized = true<br/>saveState — dopiero teraz zapis ma sens"]
    P10 --> P11["CSSManager, StatsWindowRenderer,<br/>SettingsPanel, PriceCard, Notifier"]
    P11 --> P12["InputManager.init<br/>klawiatura i bufor haseł"]
    P12 --> P13["AutoTrigger.init<br/>PO zadaniach: paczka musi mieć<br/>gdzie się zapisać"]
    P13 --> P14["Persistence.listen<br/>zdarzenie storage z sąsiednich kart"]
    P14 --> P15["window.SH = API konsolowe"]
    P15 --> RUN["skrypt działa: jedna szara linia,<br/>zero zapytań, zero linii w konsoli"]

    RUN --> SYNC{"zdarzenie storage<br/>z sąsiedniej karty"}
    SYNC -->|"counter_ / sold_ / neutral_"| SY1["liczniki sąsiada do pamięci<br/>linie 2 i 7 liczą po wszystkich kartach"]
    SYNC -->|"tasks"| SY2["loadTasks: zadanie jest własnością<br/>człowieka, nie karty"]
    SYNC -->|"taskcnt_"| SY3["liczniki zadania z sąsiedniej karty"]
    SYNC -->|"valueLog"| SY4["ValueLog.adoptRemote<br/>scalanie, nie zamazywanie"]

    RUN --> TD["SH.Main.teardown"]
    TD --> TD1["observer, interwały, timery<br/>nasłuchy klawiatury i storage"]
    TD1 --> TD2["elementy z prefiksem skryptu<br/>znikają z DOM"]
    TD2 --> TD3["window.SH i skrót config<br/>tylko jeśli to MY go postawiliśmy"]
    TD3 --> TD4["flaga INIT zdjęta<br/>można wkleić plik od nowa"]
```

### Co tu widać

**`identifyTab()` przed `loadAll()`.** Ustawienia karty czytają się po kluczu
`currentTabInstanceId`; przy odwrotnej kolejności wygląd okna nie przywracałby się
po `F5`, a do magazynu trafiałby śmieciowy klucz `null`.

**Kod ustawień z zakładki wchodzi przed pierwszym rysowaniem.** Dzięki temu okno
od razu jest takie, jakiego człowiek chce — bez mrugnięcia wyglądem domyślnym.

**`TaskManager.init()` po `ShiftManager.update()`, a przed `AutoTrigger.init()`.**
Po — bo zadanie domyślne zaczyna się razem ze zmianą, a godzina startu liczy się
linijkę wyżej. Przed — bo licznik nie ma prawa zaliczyć paczki, dla której nie ma
gdzie jej zapisać.

**`saveState()` sprawdza `store.initialized`.** Wszystko, co dzieje się wcześniej,
jest odczytem; zapis przed tą flagą zapisałby stan w połowie wczytany.

**Sieci nie ma w tej ścieżce ani jednej.** `FxRates.initOffline()` czyta wyłącznie
magazyn — pobranie kursów na żywo robi dopiero `PriceModule.enable()`.

### Gdzie to się psuje

| Pułapka                                         | Objaw                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| zapis przed `initialized`                       | do magazynu trafia stan w połowie wczytany                                                       |
| brak `listen()` albo zły filtr klucza           | dwie karty nie widzą się nawzajem, linia 2 pokazuje tylko swoją                                  |
| `teardown` bez czyszczenia timerów              | zdjęty egzemplarz dalej rysuje i sypie wyjątkami dokładnie wtedy, gdy wkleja się poprawiony plik |
| skrót `config` zdejmowany bezwarunkowo          | rozbiórka zabiera stronie jej własną funkcję o tej samej nazwie                                  |
| czyszczenie całego magazynu zamiast `ownKeys()` | kasowanie danych roboczych samego T-REX                                                          |

### Co tego pilnuje

`tests/01-silence.test.js` (cisza po starcie),
`tests/04-multitab.test.js` (dwie karty na jednym magazynie),
`tests/11-storage-failure.test.js` (pełny albo zepsuty magazyn),
`tests/20-config-code.test.js` (kod z zakładki przed pierwszym rysowaniem),
`tests/22-tasks.test.js` (zadanie domyślne zaczyna się razem ze zmianą).

---

## Jak dopisać diagram

1. Jeden diagram = jedno pytanie. Jeśli nie da się go streścić w jednym zdaniu,
   to są dwa diagramy.
2. Pod każdym: **gdzie to się psuje** i **co tego pilnuje**. Sam obrazek pokazuje
   szczęśliwą ścieżkę, a szukającemu błędu potrzebne są te dwie rzeczy.
3. Nazwy modułów, stałych i funkcji pisz dokładnie tak, jak w kodzie — test
   `tests/25-flow-docs.test.js` sprawdza, że każda z nich istnieje, i zapali się,
   gdy któraś zniknie albo zmieni nazwę.
