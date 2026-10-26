# Historia zmian

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

Dla tego projektu SemVer czyta się tak:

- **MAJOR** i **MINOR** — zmienia się `SCRIPT_ID_PREFIX` (`statsHelper_v<MAJOR>_<MINOR>_0_`, od 1.6.0): liczniki i ustawienia nie przenoszą się, aktualizować można **wyłącznie między zmianami**;
- **PATCH** — naprawa bez nowych pól w danych, prefiks zostaje, aktualizacja w trakcie zmiany jest bezpieczna.

---

## 1.7.7 — 2026-10-26

> **Wydanie PATCH — można aktualizować w trakcie zmiany.** Prefiks magazynu zostaje `statsHelper_v1_7_0_`.

### Naprawiono — wzorzec LPN

- **LPN to `LPN` i jedenaście liter albo cyfr**, a nie dwie litery i dziewięć cyfr. Numery LPN muszą być unikalne, więc po wyczerpaniu cyfr litery wchodzą dalej — np. `LPNRRHT5017105`. Wzorzec z 1.7.6 takiej etykiety nie uznawał: Auto-LPN czekał na „resztę LPN”, która nie nadchodziła, i przycisk nie szedł; most GRAVIS jej nie wysyłał. Wielkość liter dalej bez znaczenia, Auto-LPN dalej czeka do ostatniego (czternastego) znaku i połyka Enter skanera.
- Testy: `LPNRRHT5017105`, same cyfry po `LPN`, 13 i 15 znaków, znak spoza liter i cyfr.

---

## 1.7.6 — 2026-10-26

> Zmiana tylko w repozytorium, skrypt bez zmian: CI sprawdza build i testy wyłącznie na Node 24 (Linux, Windows, macOS), `engines` w `package.json` to `>=24`. Node 20 jest po końcu wsparcia, a skrypt działa w przeglądarce — Node służy tylko narzędziom repozytorium.

> **Wydanie PATCH — można aktualizować w trakcie zmiany.** Prefiks magazynu zostaje `statsHelper_v1_7_0_`.

### Naprawiono — Auto-LPN

- **Auto-LPN czeka, aż LPN wpisze się do końca.** Przycisk „Przypisz ponownie LPN” szedł już po pierwszej literze skanu; fokus przechodził na nowe pole LPN, a reszta cyfr ze skanera i jego Enter trafiały tam — system odrzucał ten urywek i trzeba było skanować drugi raz. Teraz przycisk idzie po ostatniej cyfrze, a Enter, którym skaner kończy kod, jest połykany (przez sekundę od wciśnięcia), więc nie trafia w puste nowe pole. Etykieta, która nie jest ani pojemnikiem, ani początkiem LPN — przycisk od razu, jak dotąd.
- **Wzorzec LPN:** `LPN` + dwie litery + dziewięć cyfr (`LPNAA123456789`), bez rozróżniania wielkości liter — `LPNAa…` to inna, prawidłowa etykieta. Ten sam wzorzec sprawdza most GRAVIS. Wpis pojemnika wielką literą (`TS…`) też jest pojemnikiem.
- Testy w `tests/37-workstation.test.js`: znak po znaku (nic do 13. znaku, przycisk po 14.), wielkość liter, granice wzorca (13 i 15 znaków, cyfra w miejscu litery), połknięcie Entera raz i tylko po LPN, inna etykieta, pojemnik wielką literą.
- Stanowisko `07-long-shift` przy rozjeździe liczby paczek podaje zdarzenia przedmiotów z obu kart.

---

## 1.7.5 — 2026-10-26

> **Wydanie PATCH — można aktualizować w trakcie zmiany.** Prefiks magazynu zostaje `statsHelper_v1_7_0_`: liczniki, zadania i ustawienia zostają.

### Naprawiono — ekran dotykowy

- **Okno statystyk i kartę ceny da się przeciągnąć palcem.** Na stanowiskach bez myszy, z ekranem dotykowym (Linux + Firefox), przeciąganie nie działało: skrypt słuchał tylko zdarzeń myszy, a przeglądarka zamienia dotyk na „mysz” jedynie przy stuknięciu — ruch palcem przewijał stronę. Teraz przeciąganie idzie przez zdarzenia wskaźnika (`pointerdown/move/up/cancel`) — jedną drogą dla myszy, palca i pióra — z `touch-action: none` na elemencie i przechwyceniem wskaźnika, więc palec zjeżdżający z okna dalej je ciągnie. Drugi palec nie przejmuje okna, a przerwany dotyk kończy przeciąganie jak puszczenie i zapisuje pozycję. Sposób użycia bez zmian: tryb przeciągania w panelu, ruch, puszczenie.
- **Panel zamyka się stuknięciem obok** — zamknięcie słucha `pointerdown`, a nie `mousedown`, które przy dotyku przychodzi dopiero po puszczeniu palca albo wcale.
- Rozbiórka skryptu (ponowne wklejenie) w trakcie przeciągania zdejmuje słuchaczy z dokumentu.
- Testy: `tests/19-drag-button.test.js` — palec, drugi palec, obcy wskaźnik, `pointercancel`, prawy przycisk, rozbiórka w trakcie ruchu; sprawdzone też w Chromium z emulowanym dotykiem. Razem 675 sprawdzeń.

---

## 1.7.4 — 2026-10-21

> **Wydanie PATCH — można aktualizować w trakcie zmiany.** Prefiks magazynu zostaje `statsHelper_v1_7_0_`: liczniki, zadania i ustawienia zostają. 1.7.2 i 1.7.3 nie zostały wydane — wszystko, co przygotowano pod te numery, wychodzi w tym wydaniu.

### Dodano — zakładka z kodu Data Matrix

- **Zakładka czysto ASCII.** Komunikat błędu brzmiał `StatsHelper nie wystartował`, a litera `ł` wywracała generatory kodów („Invalid code page or invalid characters”) i skanery. Teraz `StatsHelper: …` — w README, w gotowej zakładce z panelu i w przykładach.
- **Generator Data Matrix w repozytorium:** `npm run datamatrix > zakladka.svg` daje kod zakładki z README, `node tools/datamatrix.js "tekst"` — dowolnego tekstu. Koder (`src/30-datamatrix.js`, ECC200, kodowanie ASCII) jest bez zależności i bez sieci, sprawdzony dekoderem zxing dla rozmiarów od 10×10 do 132×132; zakładka z README mieści się w 72×72. Znak spoza ASCII daje czytelny błąd z podpowiedzią zamiany, zamiast kodu, którego skaner nie odczyta.
- **Przycisk „Pokaż kod Data Matrix” w panelu** przy gotowej zakładce — obrazek do zeskanowania albo sfotografowania, rysowany dopiero po kliknięciu. Pokazuje się w kompilacji z adresem wydania (`config.releaseUrl`); artefakt z repozytorium celowo nie niesie adresu repozytorium, więc tam przycisku nie ma — wtedy kod daje `npm run datamatrix`.
- **Gotowa zakładka przy ustawieniach domyślnych nie niesie pustego kodu ustawień** i drugim kliknięciem otwiera panel, jak zakładka z README — jest krótsza, a kod obrazkowy mniejszy.
- **Kod Data Matrix zakładki w samym README**, pod adresem zakładki, z instrukcją krok po kroku dla osób, które nie znają konsoli: zeskanować telefonem, wysłać sobie tekst, wkleić jako adres zakładki. Test pilnuje, że obrazek jest w README i zgadza się z zakładką.
- README: zasady dla kodów (tylko ASCII, bez nowych linii, wyłączone „Evaluate escape sequences”, długość) i jak poprawić tekst, który generator odrzuca.

### Zmieniono — każda kwota w jednej walucie, domyślnie w euro (przygotowane jako 1.7.3)

Po co: cena w funtach, koronach czy dolarach nic nie mówi, a przedmiot za 3000 € trzeba zauważyć od razu, żeby starannie puścić go na sprzedaż. Kilka centów różnicy z kursu dziennego nie ma znaczenia — to statystyka.

- **Waluta wyświetlania obejmuje teraz każdą kwotę:** cenę na karcie, cenę katalogową, drugą serię wykresu keepa, linię 6 i sumę dziennika w panelu. Domyślnie euro; w panelu („Karta ceny” → „Kwoty pokazywać w”) można wybrać `PLN`, `GBP`, `SEK`, `USD` albo `CAD` — wtedy w tej walucie są i ceny, i suma dnia.
- **Opcja „waluta sklepu (bez przeliczania)” zniknęła z panelu.** Zapisane wcześniej to ustawienie (także w starym kodzie ustawień) czyta się jako euro.
- **Waluta, której brakuje w kursach z sieci, nie wypada już z sumy.** Kursy z sieci gwarantują tylko dolara; gdy brakowało w nich np. funta, cena z co.uk zostawała na karcie w funtach, a w linii 6 trafiała do `?N`, poza sumę. Teraz brakujący kurs bierze się z tablicy wbudowanej w plik (`CONFIG.FX_FALLBACK`) — każda cena z obsługiwanego sklepu jest przeliczona na euro i doliczona.
- **Druga seria wykresu keepa** (np. „Neu”) pokazywała gołą liczbę w walucie sklepu obok ceny w euro — teraz jest przeliczona jak cena główna: `Neu ≈ 15.63 €`.
- **Suma dziennika w panelu** była zawsze w euro, nawet przy innej walucie wyświetlania — teraz w tej samej walucie co linia 6.
- Gdy do wybranej waluty nie ma żadnego kursu, wszystko pokazuje się w euro (wcześniej karta wracała do waluty sklepu). Cena w walucie bez żadnego kursu zostaje taka, jak przyszła, i trafia do `?N` — nigdy zero ani `NaN`.

### Naprawiono — z lokalnego audytu kodu (przygotowane jako 1.7.2)

Interfejs się nie zmienia, nowych ustawień nie ma — poprawione jest to, co działo się na stykach modułów: gdy zdarzenia jednego przedmiotu nachodzą na następny przedmiot, reset zmiany, inne zadanie albo drugą kartę.

Wszystkie poprawki pochodzą z lokalnego audytu kodu. Każda ma test, który bez niej pada (`tests/42-release-172.test.js`), a nowa macierz stanów (`tests/43-state-matrix.test.js`) przechodzi dwanaście przebiegów po 312 przedmiotów: karty CRET/UG/REFURB/WHD po 1, 2 i 4, jedno albo trzy zadania z przełączaniem i odcinkami przez północ, moduł cen włączony i wyłączony, naklejka, fraza, sprzedaż przed pojemnikiem i po nim, `tsREP…`, brak pojemnika, przerwane przedmioty, otwarty panel i okno diagnostyki, obiad, północ, reset w trakcie przedmiotu. We wszystkich liczba zaliczeń zgadza się z tym, co zrobił człowiek, a koszt ostatnich 20 przedmiotów nie jest większy niż pierwszych 20.

#### Liczenie

- **UG: naklejka z poprzedniego przedmiotu dawała następnemu +2 i dwie sprzedaże.** Gdy następny krok przychodził, zanim strona zdjęła `#sticker-back-hide`, nowy przedmiot widział starą naklejkę w tym samym skanie, w którym się zaczynał. Teraz naklejka widoczna już w chwili startu przedmiotu należy do poprzedniego; nowy dostaje +2 dopiero, gdy naklejka zniknie i pojawi się znowu. Okno diagnostyki zapisuje to jako „naklejka z poprzedniego przedmiotu — pominięta”. Przykład z testu: dwa przedmioty, naklejka tylko przy pierwszym — było 4 paczki i 4 sprzedane, jest 3 i 2.
- **Reset zmiany między pojemnikiem a kodem sortowania dopisywał sprzedaż do nowej zmiany.** Spóźniony kod (UG z frazą o odsprzedaży) dawał świeżej zmianie `1` paczkę i `2` sprzedane — procent ponad 100. Przedmiot zakończony przed resetem należy teraz do starej zmiany: jego kod, premia za sprzedaż i pojemnik do nowej nie przechodzą.
- **Reset zmiany, gdy pojemnik czekał na zniknięcie pola, dawał +1 nowej zmianie** i stawiał jej czas od pojemnika. Ten sam powód i ta sama poprawka. Przedmiot dopiero zaczęty w chwili resetu nadal liczy się w nowej zmianie, gdy się skończy — tak liczy macierz stanów.
- **Linia 9 po resecie liczyła bezczynność od pojemnika poprzedniej zmiany** (przykład z testu: nowa zmiana startowała z czerwonym `+7m`). Reset zeruje czas ostatniego pojemnika.
- **Pojemnik poprzedniego przedmiotu przechodził na następny**, gdy pole pojemnika znikało w tej samej klatce, w której pojawiał się nowy początek. Zwykły pojemnik zaliczał wtedy następny przedmiot już przy jego końcu, bez własnego pojemnika, a `tsREP…` przerywał następny zamiast eskalowanego. Pojemnik sprawdza się teraz przed nowym początkiem, a pojemnik wpisany, którego pole jeszcze nie zniknęło, przepada razem z przedmiotem, do którego należał.
- **Ręczne +1 na jednej z dwóch kart tego samego działu gubiło paczki drugiej karty.** Skrót liczył od liczników zadań w pamięci, a potem nadpisywał wspólny klucz ich sumą; gdy zdarzenie z drugiej karty jeszcze nie doszło, trzy jej paczki znikały (`1` zamiast `4`). Ręczna poprawka, w górę i w dół, liczy się teraz od magazynu, tak jak zaliczenie automatyczne.
- **Kod sortowania po przełączeniu zadania dopisywał sprzedaż nowemu zadaniu** — miało ono sprzedane bez paczek. Kierunek i premia za frazę idą teraz do zadania, w którym przedmiot został zaliczony.
- **Drugi kod sortowania dla rozliczonego już przedmiotu** (ponowne skanowanie) przestawiał znak w dzienniku, a liczniki zostawały przy pierwszym — dziennik i linia 2 mówiły co innego. Drugi kod jest teraz pomijany.

#### Magazyn, karty, okno

- **Jedna nieudana próba zapisu odcinała kartę od sąsiadów do końca strony.** Po pierwszej odmowie (pełny magazyn) wszystkie liczniki liczyły się już tylko z pamięci, także gdy magazyn znów działał — dwie karty jednego działu przestawały się sumować. Teraz z pamięci liczy się tylko klucz, którego ostatni zapis się nie udał, do pierwszego udanego. Powiadomienie o pełnym magazynie zostaje jak było.
- **Zamknięcie karty tuż po wczytaniu stanu sąsiedniej karty gubiło ostatnią zmianę ustawień.** Autozapis przesunięty za 2,5 s ciszy szedł osobnym timerem, którego wyjście ze strony nie dokańczało, a rozbiórka (ponowne wklejenie) nie gasiła. Oba przypadki są teraz obsłużone.
- **Pojemnik przybity w jednej karcie kosztował każdą sąsiednią kartę 10 przerysowań okna.** Wczytanie stanu sąsiada podmienia kilka gałęzi naraz, a każda budziła osobne przerysowanie. Teraz jest jedno, po całości.
- **Sumy dziennika (linia 6) przeliczały cały dziennik co sekundę** — koszt rósł z każdym przedmiotem zmiany. Sumy liczą się teraz raz po zmianie dziennika albo kursów. Dotyczy tylko włączonego modułu cen.
- **Panel ustawień zamknięty i otwarty w ciągu 200 ms zostawał niewidoczny**, choć skrypt uważał go za otwarty (pierwszy klik obok tylko „zamykał” niewidoczny panel).

#### Źródła zewnętrzne (moduł cen i GRAVIS)

- **GRAVIS: zablokowane wyskakujące okno zrywało działające połączenie,** a LPN zeskanowany przed następnym sygnałem GRAVIS (do 10 s) przepadał. Teraz `window.open` zwracające `null` niczego nie zmienia, a LPN zeskanowany bez okna — także po przeładowaniu T-REX — czeka na sygnał gotowości i idzie do GRAVIS.
- **GRAVIS: ponowne kliknięcie zakładki w karcie bez okna-rodzica dokładało drugi znaczek** w rogu.
- **keepa-api podpisywało każdą cenę jako euro,** także dla domeny `co.uk` albo `com` — funty i dolary wchodziły do sum bez przeliczenia. Waluta idzie teraz z domeny (`CONFIG.KEEPA_DOMAIN_CURRENCY`), a domena spoza listy nie daje ceny wcale.
- **Kursy walut:** sprawdzenie zdrowego rozsądku obejmowało tylko dolara — odwrócony kurs złotego (`0,0045` zamiast `4,33`) przechodził i zmieniał sumy tysiąckrotnie. Teraz każda waluta z listy zapasowej musi być w granicach trzech razy od kursu zapasowego. Zapisane kursy ze znacznikiem z przyszłości (cofnięty zegar) już nie są ważne bez końca.
- **Kod ustawień przyjmował odstęp skanu 0–5000 ms**, a suwak w panelu ma 50–200 ms. Kod spoza zakresu jest teraz przycinany do zakresu suwaka.

### Testy

- **Wynik testów nie zależy już od pory dnia.** Kilka plików (`03-line7`, `04-multitab`, `17-sales-rate`) budowało dzienną zmianę „sprzed dwóch godzin” na prawdziwym zegarze — po 18:30 wykrywanie zmiany nocnej wchodziło im w drogę i 11 testów padało. Runner stawia teraz stały zegar (16.09.2026, 15:00), który płynie dalej; `REAL_CLOCK=1 npm test` przywraca prawdziwy czas.
- **Pliki testów idą jeden po drugim**, także z testami asynchronicznymi: ciężki plik synchroniczny (macierz stanów, ok. 20 s) nie przekracza już cudzych granic czasu (`33-market-fallback`).
- `tests/42-release-172.test.js` — 19 testów styków, `tests/43-state-matrix.test.js` — 26 sprawdzeń macierzy, a `tests/32-display-currency.test.js` dostał przypadki brakującego kursu, dawnego „jak w sklepie”, drugiej serii wykresu i sumy w panelu. Razem 670 sprawdzeń (z `tests/44-datamatrix.test.js`), 18 testów stanowiska w Chromium bez zmian zielonych.

### Bez zmian, z pomiarem

- Zapis dziennika wartości serializuje cały dziennik — dwa razy na przedmiot przy włączonym module cen. Zmierzone: 0,3 ms na zapis przy 600 wpisach (pełna zmiana), 2,7 ms przy górnej granicy 6000. Zmiana formatu zapisu nie jest tego warta.

---

## 1.7.1 — 2026-10-21

> **Kto przechodzi z 1.6.x — aktualizować tylko między zmianami.** To pierwsze wydanie z nowościami 1.7.0, a 1.7.0 zmieniło prefiks magazynu na `statsHelper_v1_7_0_`: liczniki, zadania i ustawienia startują od zera (zakładki z kodem ustawień działają dalej). 1.7.1 to PATCH — prefiks zostaje.

### Zmieniono

- **Paczki zmiany w linii 7 przy starcie w połowie zmiany.** Po obiedzie na innym stanowisku (czysta przeglądarka) z zadaniem cofniętym na 23:50 linia pokazywała `4 z 300`, choć od 18:30 przepracowano prawie pięć godzin. Czas zmiany sprzed pierwszego zadania — bez obiadu — dolicza się teraz według celu działu, a liczba dostaje `≈`: REFURB (30/h), zadanie od 23:50, 4 paczki o 23:58 → `30.0 z 30 · ≈149 z 300`. Przerwy między zadaniami są pauzami i nie są doliczane; bez celu działu albo bez rozpoznanej zmiany nic się nie dolicza.
- **Wybór języka na samej górze panelu**, przed zadaniami.

### Nowości 1.7.0 (wydane razem z tym wydaniem)

- **Przedmiot zalicza się w chwili przybicia pojemnika.** Początek (wyzwalacz POJAWIA SIĘ na stronie) → koniec (wyzwalacz końcowy) → pojemnik; pojemnik przed końcem zalicza przedmiot w chwili końca. Bez pojemnika przedmiot z końcem zalicza się przy następnym początku albo po 60 s.
- **Nowy początek bez końca przerywa poprzedni przedmiot** — nic za niego nie przychodzi, jego naklejka i fraza nie przechodzą dalej.
- **Pojemnik eskalacji `tsREP…`** przerywa przedmiot na każdym etapie, także po wyzwalaczu końcowym.
- **Przedmiot podwójny (+2) w UG:** widoczna naklejka albo fraza „Teraz oceniasz produkt, który można odsprzedać jako używany…” ze sprzedażą (także gdy kod sprzedaży przyjdzie po pojemniku). Oba sygnały naraz to dalej +2.
- **Naprawa naklejki w UG:** liczyła się tylko z niezerowymi wymiarami, a `#sticker-back-hide` bywa pustym znacznikiem — teraz liczy się element, który nie jest schowany.
- **Okno diagnostyki** dla stanowisk bez F12 (przycisk „Diagnostyka” w panelu albo `SH.debug()`): zdarzenia cyklu przedmiotu, stan bieżącego przedmiotu, dopasowania wyzwalaczy, naklejka, pola formularzy widziane przez skrypt; „Kopiuj” daje JSON do schowka.
- Doświadczalne „liczenie po pojemniku” zniknęło z panelu — stało się zwykłym sposobem liczenia.

Pełny opis 1.7.0 — sekcja niżej w CHANGELOG.md.

---

## 1.7.0 — 2026-10-21

> **Aktualizować tylko między zmianami.** Wydanie MINOR: prefiks magazynu zmienia się na `statsHelper_v1_7_0_`, więc liczniki, zadania i ustawienia startują od zera; klucze `statsHelper_v1_6_0_` są sprzątane przy starcie. Zakładki z kodem ustawień działają dalej.

### Zmieniono

- **Przedmiot zalicza się w chwili przybicia pojemnika.** Cykl: początek (wyzwalacz POJAWIA SIĘ na stronie) → koniec (wyzwalacz końcowy) → pojemnik; pojemnik przed końcem zalicza przedmiot w chwili końca. Gdy pojemnika nie było, przedmiot z końcem zalicza się przy następnym początku albo po 60 s — pole pojemnika bywa poza zasięgiem skryptu, a przedmiot nie może przepaść. Ten sam moment zeruje czas od pojemnika, więc tempo i czas mówią o tym samym zdarzeniu.
- **Nowy początek bez końca przerywa poprzedni przedmiot.** Nic za niego nie przychodzi, a jego naklejka i fraza nie przechodzą na następny — anulowany przedmiot nie może dostać +2 cudzego przedmiotu.
- **Przedmiot podwójny (+2) w UG ma dwa niezależne sygnały:** widoczną naklejkę albo frazę „Teraz oceniasz produkt, który można odsprzedać jako używany…” w trakcie przedmiotu razem ze sprzedażą. Kod sprzedaży przychodzący po pojemniku też daje +1. Oba sygnały naraz to dalej +2. Działy z przedmiotem podwójnym: `CONFIG.DOUBLE_TAB_TYPES` (UG).
- **Doświadczalne „liczenie po pojemniku” zniknęło z panelu** — stało się zwykłym sposobem liczenia. Numer ustawienia w kodzie ustawień jest wycofany, stare kody dalej się nakładają.

### Dodano

- **Pojemnik eskalacji `tsREP…`** przerywa przedmiot na każdym etapie, także po wyzwalaczu końcowym — przedmiot nie jest zaliczany (jak `PROBLEM-SOLVE` w linii końcowej).
- **Okno diagnostyki** dla stanowisk bez F12: przycisk w panelu albo `SH.debug()`. Zdarzenia cyklu przedmiotu, stan bieżącego przedmiotu, wyniki wyzwalaczy na bieżącej stronie, naklejka (czy jest, czy widoczna) i pola formularzy, które widzi skrypt (podpis, `data-testid`, widoczność, czy to pole pojemnika). „Kopiuj” kładzie całość jako JSON do schowka. Dziennik zdarzeń ma stałą długość (60), do sieci i konsoli nic nie idzie, a tekst okna jest rozbrojony, żeby nie udawał wyzwalacza.
- `tests/40-item-flow.test.js` — 24 kombinacje sygnałów (początek, koniec, pojemnik zwykły i `tsREP`, naklejka, fraza, sprzedaż teraz i później, czas, PROBLEM-SOLVE, przerwany przedmiot, działy) i okno diagnostyki. Stanowisko w przeglądarce przybija pojemnik na kroku końcowym jak skaner.

### Naprawiono

- **Naklejka w UG nie była zauważana.** Skrypt liczył ją tylko wtedy, gdy element miał niezerowe wymiary, a `#sticker-back-hide` bywa pustym znacznikiem bez wymiarów. Teraz liczy się element, który nie jest schowany (`offsetParent`), bez względu na rozmiar.

---

## 1.6.2 — 2026-10-19

Wydanie PATCH: prefiks magazynu zostaje `statsHelper_v1_6_0_`, więc z 1.6.0 i 1.6.1 można przejść w trakcie zmiany — liczniki, zadania i ustawienia zostają. Kto przechodzi z 1.5.0, aktualizuje między zmianami (prefiks 1.6.0 zeruje dane, opis w sekcji 1.6.0 w CHANGELOG.md).

### Zmieniono

- **Linia 7 pokazuje wszystko w jednym miejscu:** `34.3 z 47 · 236 z 470 · 14% · 2m 41s` — tempo **bieżącego zadania** z celu działu, paczki zmiany z celu zmiany, procent sprzedaży i czas od ostatniego pojemnika (czerwony po podwójnym czasie przedmiotu). Tempo zadania zamiast tempa zmiany: zadania są po to, żeby procesy o różnych normach nie mieszały się w jedną średnią; tempo zmiany zostaje w linii 1 i w panelu. Spójnik („z”, „of” i odpowiedniki) idzie ze słownika.
- **Linia 9 domyślnie wyłączona** — jej treść jest teraz na końcu linii 7. Domyślnie widać znowu tylko linię 7.
- **Panel ustawień otwiera się przy każdym uruchomieniu** (decyzja autora, wyjątek od zasady „nowe domyślnie wyłączone”). Zamyka go pierwszy klik obok.
- **Most GRAVIS domyślnie włączony** (decyzja autora). Włączony tylko słucha: karty rozmawiają przez `postMessage` w przeglądarce, bez sieci, a wygląd T-REX zmienia się dopiero wtedy, gdy odezwie się skrypt uruchomiony na karcie GRAVIS.
- **ASIN z GRAVIS wyśrodkowany pod polem skanu** — pola T-REX stoją na środku ekranu i są wąskie. Brak ASIN albo brak odpowiedzi nie pokazuje niczego.

### Dodano

- **Wyzwalacze początku z prawdziwego T-REX**: „Czy produkt jest zgodny” i „W przypadku tego produktu można pominąć ocenę” — `poniżej` nie pojawia się już przy każdym przedmiocie.
- **Odcinki zadania wpisane ręcznie** w panelu: `06:30-08:00, 09:00-10:00, 23:30-02:00, 02:30-`. Kilka powrotów do procesu w jednej zmianie, odcinek przez północ, obiad się nie liczy, pusty koniec — zegar chodzi. Zapis błędny, w przyszłości albo nachodzący na inne zadanie jest odrzucany i niczego nie zmienia.
- **GRAVIS po przeładowaniu karty**: skrypt w GRAVIS co 10 s daje znać, że żyje. Gdy przeglądarka uśpi i przeładuje kartę GRAVIS, po 30 s ciszy w miejscu ASIN pojawia się cicha podpowiedź, żeby kliknąć tam zakładkę jeszcze raz. T-REX przeładowany w trakcie pracy odnajduje okno GRAVIS sam, z pierwszego sygnału.
- **Znaczek na karcie GRAVIS** w lewym górnym rogu, półprzezroczysty i przezroczysty dla kliknięć. W GRAVIS nie ma licznika ani ustawień.
- **Kilka kart naraz** sprawdzone testem: wszystkie cztery działy, trzy (UG+WHD+REFURB, CRET+WHD+REFURB) i pary — każda karta liczy swoje, suma paczek i czas od pojemnika są wspólne.

### Naprawiono

- **Otwarty panel zatrzymywał liczenie.** Panel jest częścią tekstu strony, a trzy napisy w słownikach zawierały słowa wyzwalaczy: polskie „Przypisz ponownie” (Auto-LPN) i „poniżej” (moduł cen), angielskie „transparency” (kod ustawień). Przy otwartym panelu flaga przedmiotu zostawała podniesiona i licznik stawał. Słowa są rozerwane znakiem U+200B, a test sprawdza każdy napis we wszystkich czterech językach.
- **Liczenie po pojemniku: jeden pojemnik na przedmiot.** Kolejne skany w to samo pole nic nie dodają, dopóki nie przyjdzie następny wyzwalacz początku.
- Opis wydania 1.6.1 odsyłał do „sekcji 1.6.0 niżej”, której na stronie wydania nie ma — odsyła teraz do CHANGELOG.md.

---

## 1.6.1 — 2026-10-19

Wydanie PATCH: prefiks magazynu zostaje `statsHelper_v1_6_0_`. Dla kogoś, kto przechodzi z 1.5.0, to pierwsze wydanie z nowościami 1.6.0 — **aktualizować między zmianami**, bo prefiks 1.6.0 zeruje liczniki i ustawienia (sekcja 1.6.0 w CHANGELOG.md). Z 1.6.0 na 1.6.1 można przejść w trakcie zmiany.

Nowości z 1.6.0 w skrócie (szczegóły w sekcji 1.6.0 w CHANGELOG.md): drugie kliknięcie zakładki otwiera panel ustawień; linia 9 — czas od ostatniego pojemnika, czerwona po podwójnym czasie przedmiotu (bez obiadu); cele tempa na górze pliku (CRET 47, FAST 80, UG 47, REFURB 30, WHD 25) i linia 10 z procentem celu; dział UG z naklejką liczoną +2 i jako sprzedaż; ukraińskie wyzwalacze T-REX; wyłączone domyślnie Auto-LPN, liczenie po pojemniku i ASIN z GRAVIS; nowa zasada wersjonowania — MINOR zmienia prefiks magazynu.

### Dodano

- **Interfejs po ukraińsku.** Czwarty słownik, pełny — te same klucze i parametry co polski (pilnuje tego nowy `tests/38-languages.test.js`). Kolejność na liście wyboru: polski (domyślny), ukraiński, rosyjski, angielski. W kodzie ustawień ukraiński dostał następny wolny indeks, więc rozdane kody nie zmieniają znaczenia.
- **Ukraińskie odpowiedniki „Przypisz nowy” i „Przypisz ponownie” w wyzwalaczu końcowym** — tak jak działa to dla polskiego interfejsu T-REX.

### Naprawiono

- **Kod ustawień nie przenosił ustawień z 1.6.0**: linii 9 i 10, koloru i udziału działu UG, skrótu „ukryj okno”, celu karty CRET (CRET/FAST), liczenia po pojemniku, Auto-LPN i mostu GRAVIS. Zakładka z kodem odtwarzała wygląd bez nich. Teraz mają własne numery w rejestrze; test przenosi je na drugą maszynę.
- Kolor działu UG w linii 2 ma wpis domyślny jak pozostałe działy.

### Zmieniono

- **Sprawdzenie cyrylicy obejmuje cały blok z uzupełnieniem** (U+0400–U+052F), czyli wszystkie litery alfabetu ukraińskiego, także cztery spoza rosyjskiego. Test sprawdza każdą literę, wielką i małą. Ukraińskie napisy T-REX w wyzwalaczach i nazwa `Українська` są wymienionymi wyjątkami, jak rosyjskie.
- **Dokumentacja dogoniła kod**: dziesięć linii okna, cztery języki, nowa zasada wersjonowania w szablonie PR, liczby testów i modułów, stan wydania w HANDOFF, prefiks w diagramach `docs/`.

---

## 1.6.0 — 2026-10-19

> **Aktualizować tylko między zmianami.** Prefiks magazynu zmienia się na `statsHelper_v1_6_0_`: liczniki kart, zadania, dziennik bieżącej zmiany i ustawienia startują od zera, klucze `statsHelper_v1_5_0_` są sprzątane przy starcie. Zakładki z kodem ustawień działają dalej.

### Zmieniono

- **Nowa zasada wersjonowania (decyzja autora):** prefiks magazynu niesie MAJOR i MINOR wersji — zmienia się przy każdym wydaniu MINOR i MAJOR, a PATCH (np. 1.6.1) go nie rusza. Zgodność prefiksu z `package.json` sprawdza test.

### Dodano

- **Drugie kliknięcie zakładki otwiera i zamyka panel ustawień.** Zakładka sprawdza najpierw, czy skrypt już działa (`window.SH.settings`) — jeśli tak, przełącza panel bez pobierania pliku. Wklejony drugi raz plik robi to samo. Hasła działają jak dotąd. Nowa zakładka w README; stara dalej działa, tylko drugie kliknięcie pobiera plik od nowa.
- **Klik poza otwartym panelem go zamyka** — z wyjątkiem trybu przeciągania okna albo karty ceny.
- **Otwarty panel przejmuje klawiaturę.** T-REX łapie cyfry na całej stronie (wybór przycisków kroku), więc w polach panelu nie dało się wpisać liczby. Klawisze z wnętrza panelu są zatrzymywane przed stroną; po zamknięciu strona dostaje je jak wcześniej.
- **Dział UG** (`gradingMode=CRETURN_PRIMARY_GRADING`) jako czwarty rozpoznawany. Rozpoznawanie sprawdzone dla wszystkich czterech adresów, także z parametrem za hashem.
- **Cele tempa w osobnym pliku `src/00-targets.js`**, wklejanym w artefakt tuż pod hasłami: `RATE_TARGETS = { CRET: 47, FAST: 80, UG: 47, REFURB: 30, WHD: 25 }` i `PAID_SHIFT_HOURS = 10` (obiad niepłatny: cel 30 to 300 sztuk na zmianę). FAST pracuje na karcie CRET, więc cel karty CRET wybiera się w panelu.
- **Linia 9 — czas od ostatniego przybitego pojemnika**, **widoczna domyślnie**: świadomy wyjątek od zasady „nowe domyślnie wyłączone”, decyzja autora. Nie dotyka sieci, a do pierwszego pojemnika zmiany jest pusta. Po podwójnym czasie przedmiotu (2 × 60 / cel minut; REFURB: 4 min) robi się czerwona i dopisuje narosłą bezczynność: po 7 min w REFURB `7m 00s +3m 00s`. Niczego nie wpisuje w T-REX.
- **Linia 10 — cel działu** (wyłączona): cel, procent bieżącego tempa od celu i sztuki wobec celu zmiany, np. `47/h 85% 236/470`.
- **Rozpoznawanie pojemnika**: Enter w polu pojemnika (podpis polski, ukraiński albo rosyjski, albo `data-testid`) z nazwą `[twc]s…` do 15 znaków, a potem zniknięcie pola. Bez limitu czasu — odejście od stanowiska z otwartym krokiem niczego nie zalicza.
- **Liczenie po pojemniku (doświadczalne, wyłączone)** zamiast wyzwalacza z tekstu. Porównanie obu sposobów w konsoli: `SH.tote()`.
- **Naklejka w UG**: element `#sticker-back-hide` przy przedmiocie w UG daje +2 i dwie sprzedaże, zanim przyjdzie kod sortowania. W WHD ten sam element stoi przy każdej sprzedaży, więc tam nic się nie zmienia.
- **Wyzwalacze ukraińskiego interfejsu T-REX** (`зображенню нижче`, `канування LPN:`). Bez nich przy ukraińskim interfejsie licznik nie liczył.
- **Auto-LPN** (wyłączone): gdy w pole pojemnika trafi etykieta zamiast pojemnika, wciska „Przypisz ponownie LPN”.
- **Most GRAVIS** (wyłączony, tylko CRET i UG): po włączeniu panel pokazuje instrukcję i przycisk otwarcia GRAVIS; skrypt kliknięty na karcie GRAVIS odbiera LPN i odsyła ASIN przez `postMessage` (bez zapytań sieciowych skryptu). ASIN pojawia się pod polem skanu jako niebieski link — kliknięcie wstawia go do pola, Enter naciska człowiek. Wiadomości tylko od znanego okna i adresu, ASIN sprawdzany wzorcem.
- **Skrót „ukryj okno”** (domyślnie brak klawisza).
- **Obiad nie nalicza bezczynności** w linii 9: wybrana przerwa odpada z czasu od pojemnika, także obiad nocny przez północ.
- **Ukryte elementy nic nie liczą:** naklejka i pole pojemnika liczą się tylko widoczne — strona potrafi przysłać następny krok z wyprzedzeniem, ukryty. Schowane pole pojemnika po Enterze znaczy przybicie, jak zdjęte.
- **Stanowisko w trybie elastycznym** (`tests/stand/specs/08-flex-ug.spec.js`): ekran składany z kawałków przysyłanych na każdy krok, następny krok przychodzi ukryty. Sprawdza w Chromium UG z ukrytą i widoczną naklejką, błędny i poprawny pojemnik, WHD z naklejką.
- `tests/37-workstation.test.js` — 23 sprawdzenia: granice nazwy pojemnika (2, 15 i 16 znaków), pole, które nie znika, spreparowany cel i czas w magazynie, sekunda po granicy bezczynności, UG kontra WHD, obce okno i zły ASIN w moście GRAVIS.

### Zmieniono

- Kolejność linii okna: 10, 9, 7, 8 na dole — czas od pojemnika stoi tuż nad linią 7.

---

## 1.5.0 — 2026-10-05

> **Aktualizować tylko między zmianami.** Prefiks magazynu zmienia się na `statsHelper_v1_5_0_` (decyzja autora, bez podnoszenia MAJOR — tak jak w 1.3.1). Przy pierwszym uruchomieniu 1.5.0 klucze `statsHelper_v1_3_0_` są usuwane: liczniki kart, zadania, dziennik wartości bieżącej zmiany i ustawienia startują od zera. Archiwum podsumowań zmian (klucz wspólny) zostaje. Zakładki z kodem ustawień działają dalej i nakładają swoje ustawienia — wystarczy kliknąć zakładkę zamiast ustawiać panel od nowa. Jeśli na stronie działa jeszcze poprzednia wersja, najpierw F5, potem nowa.

Poza tym liczenie, dziennik i moduł cen działają jak w 1.4.3. Nowe: `SH.perf()` w konsoli odpowiada, czy zwalnia skrypt, czy komputer.

### Zmieniono

- **Prefiks magazynu `statsHelper_v1_5_0_`.** Poprzedni trafia do `LEGACY_ID_PREFIXES` i jest sprzątany przy starcie. Kod ustawień podstawiony przez zakładkę jest czytany także spod nazw ze starych prefiksów (`statsHelper_v1_3_0_CONFIG_CODE` i starszych): zakładki zawierają nazwę z dnia, w którym je zrobiono, a bez tego ich ustawienia przepadałyby po cichu. Wygrywa nazwa bieżąca, wszystkie nazwy znikają z okna. Testy w `tests/20-config-code.test.js`.

### Dodano

- **`SH.perf()` — to skrypt czy komputer?** Polecenie w konsoli porównuje koszt przedmiotu z początku zmiany (pierwsze 20 przedmiotów) z ostatnimi 20: skany strony i ich czas, przerysowania okna, zdarzenia, zapisy do magazynu. Ocena rozróżnia trzy przypadki: koszt stały; koszt rośnie (usterka skryptu); operacje stałe przy dłuższym skanie (urosła strona T-REX). Liczniki zbierają się zawsze i nic nie wypisują — po wklejeniu skrypt dalej milczy. Pamięć stała: najwyżej 42 migawki liczników, niezależnie od długości zmiany. Nowy `tests/36-perf.test.js`.
- **Długa zmiana na stanowisku w Chromium** (`tests/stand/specs/07-long-shift.spec.js`): dwie karty, trzy zadania, dziennik wartości, 48 przedmiotów z prawdziwym MutationObserver, zdarzeniami `storage` i układem strony. Ostatni cykl ma kosztować tyle co drugi; przedmiot czterokrotnie droższy od pierwszych przerywa test od razu. Na kodzie z zagnieżdżaniem Proxy test pada przy jedenastym przedmiocie (104 przerysowania zamiast najwyżej 25), wcześniej przeglądarka wisiała do limitu czasu.

---

## 1.4.3 — 2026-10-05

Wydanie bez zmian w danych: prefiks magazynu zostaje `statsHelper_v1_3_0_`, więc aktualizacja niczego nie zeruje i można ją przyjąć w trakcie zmiany. Liczenie, dziennik i moduł cen działają jak w 1.4.2. Człowiek przy stanowisku zobaczy jedną rzecz: komputer nie zwalnia już po założeniu drugiego zadania — każda paczka kosztuje tyle samo od początku do końca zmiany, także po kilku godzinach pracy i przełączaniu zadań. Z włączonym modułem cen skan strony jest dwa razy lżejszy.

### Naprawiono

- **Skrypt zwalniał komputer z każdą paczką po założeniu drugiego zadania.** Zapis liczników zadania (`store.taskCounters = { ...store.taskCounters, [id]: … }`) kopiował do nowego obiektu dzieci, które już były obiektami reaktywnymi, a `createReactive` owijał je w kolejne Proxy. Każda paczka dokładała warstwę licznikom wszystkich pozostałych zadań, a każda warstwa rozsyłała własne `store:changed` (przerysowanie okna, autozapis). Przy jednym zadaniu nic nie było widać; od drugiego koszt paczki rósł wykładniczo — na stanowisku 2,7 ms przy pierwszej paczce, 204 ms przy dwudziestej drugiej, a przy trzystu pętla nie kończyła się w 200 s. Na zmianie objawiało się to po kilku godzinach jako zacinanie przy każdym wyzwalaczu. `createReactive` rozpakowuje teraz obiekt reaktywny do surowego przed owinięciem; koszt paczki jest stały (0,3 ms). Tę samą ścieżkę szły liczniki zadań z sąsiedniej karty (zdarzenie `storage`).

### Zmieniono

- **Jeden odczyt tekstu strony na skan także z modułem cen.** Karta ceny szukała ASIN we własnym odczycie `document.body.innerText`, chowając się na ten czas — przy każdej mutacji strony przeglądarka liczyła układ całej strony dwa razy. Karta dostaje teraz tekst z tego samego skanu, który szuka wyzwalaczy, i odejmuje od niego swój ASIN (tylko gdy widać kartę i sam kod — ustawienie „pokaż ASIN”).
- **Zapis dziennika wartości bez ponownego rozbioru własnego zapisu.** Dziennik pamięta tekst klucza, który sam zapisał albo scalił; póki klucz go zawiera, zapis pomija rozbiór, scalenie i sortowanie całej listy, a zdarzenie z własną treścią jest pomijane. Przy 3000 wpisów zapis trwa 4,3 ms zamiast 9,5 ms, a idzie dwa razy na przedmiot.
- **Kody sortowania**: pisownia kodu ze słownika budowanego raz razem ze wzorcem zamiast przebudowy listy kodów przy każdym trafieniu w każdym skanie.

### Dodano

- **Test kosztu zmiany** (`tests/35-shift-cost.test.js`): dwie karty na wspólnym magazynie, trzy zadania z przełączaniem, dziennik wartości, 360 przedmiotów. Każdy przedmiot ma kosztować dokładnie tyle, co ten sam przedmiot cykl wcześniej — w odczytach `innerText`, przerysowaniach, zapisach, zdarzeniach `storage` i rozbiorach dziennika. Na kodzie sprzed naprawy pada przy pierwszej paczce po założeniu drugiego zadania. Do tego `tests/34-reactive-nesting.test.js` (zapis do stanu reaktywnego) i test w przeglądarce dla ASIN z samego tekstu (`tests/stand/specs/05-price.spec.js`) — jedyne miejsce, gdzie `innerText` naprawdę pomija schowane elementy.

---

## 1.4.2 — 2026-09-25

Wydanie bez zmian w danych: prefiks magazynu zostaje `statsHelper_v1_3_0_`, więc aktualizacja niczego nie zeruje i można ją przyjąć w trakcie zmiany. Liczenie, dziennik i moduł cen działają jak w 1.4.1. Człowiek przy stanowisku zobaczy dwie rzeczy:

- przycisk „Zastosuj i zamknij” jest zawsze widoczny u dołu panelu ustawień;
- plik nie ma wpisanego adresu wydania (`config.releaseUrl` jest pusty), więc w panelu, w sekcji kodu ustawień, zamiast pola „Gotowa zakładka” stoi podpowiedź. Zakładki, które ludzie już mają, działają dalej — adres pliku siedzi w samej zakładce; kod ustawień też działa bez zmian.

W konsoli `SH.StorageManager` nazywa się teraz `SH.Persistence`.

### Dodano

- **Stanowisko T-REX z testami w prawdziwej przeglądarce.** `tests/stand/` zastępuje stanowisko ręczne: ta sama strona służy człowiekowi (przyciski, `?autoload=1`, dwie karty, `?csp=strict`) i testom Playwright (`npm run test:e2e`, 14 testów w Chromium, osobne zadanie CI). Sprawdzają: domyślny start bez żadnego zapytania i bez linii w konsoli przez całą pracę, także pod CSP; kody sortowania przed, razem i po finalnym wyzwalaczu; przedmiot przerwany i powtórzony; dwie karty i F5; granicę zmiany na podstawionym zegarze (zatrzymanym — czas przesuwa sam test, bo płynący zegar Playwright potrafi cofnąć świeży przeskok, a wtedy przedmiot stanowiska wisi do limitu czasu testu); moduł cen z odczytem ceny z obrazka aż do dziennika wartości, wyłączenie modułu i blokadę CSP. Do prawdziwej sieci testy nie wychodzą. Wyzwalacze stanowisko pokazuje tylko na ekranie kroku; stały tekst strony sprawdza `Stand.leaks()` — zasada 8 w CLAUDE.md.

### Zmieniono

- **Przycisk „Zastosuj i zamknij” zawsze widoczny.** Stoi przyklejony do dolnej krawędzi panelu ustawień (`position: sticky`), więc nie trzeba przewijać do końca listy sekcji, ile by ich nie przybyło; treść przewijana pod paskiem jest rozmyta. Ustawienia zapisują się jak dotąd od razu przy zmianie — przycisk tylko zamyka panel. Pilnują tego test w `23-task-panel` i test układu w przeglądarce (`tests/stand/specs/06-panel.spec.js`).

- **Testy haseł nie znają ich brzmienia.** Sprawdzenia haseł panelu biorą listę z nagłówka pliku i idą po każdym haśle z niej: otwarcie i zamknięcie panelu, wielkość liter, śmieci w buforze, przerwane hasło, pole tekstowe, autopowtarzanie, długość bufora, mapa ostatnich znaków. Zmiana haseł to jedna linia w `src/00-banner.js` i dwa miejsca w dokumentacji (README, ściąga w stopce), których zgodność pilnuje nowy test — bez ruszania testów. Sprawdzone: sześć innych haseł w nagłówku przechodzi wszystkie testy poza zgodnością dokumentacji; para `BOM`/`BOMBA` dalej pada. Nazwy w `normalizeAccessPasswords` po angielsku.

- **Gotowość do TypeScript.** `npm run typecheck` sprawdza wszystkie moduły `src/` kompilatorem TypeScript bez zmiany artefaktu (`checkJs`, `tsconfig.json`, `types/globals.d.ts`) — 0 błędów, z włączonymi flagami trybu `strict`, które nie wymagają dopisywania typów; krok w CI. Obiekt zapisu stanu nazywa się teraz `Persistence` (także w konsoli: `SH.Persistence`), bo `StorageManager` to nazwa typu przeglądarki, z którą kolidował. Zapis klucza symbolicznego do stanu reaktywnego nie rzuca już wyjątku; z `PriceCard.resolve()` zniknęła nieużywana opcja `manual`. Plan przejścia na pełny `strict` i pliki `.ts`: `HANDOFF.md`, rozdział 2.8.

- **Kod bez danych repozytorium i właściciela.** Adres, spod którego gotowa zakładka z panelu pobiera skrypt, nie jest już wpisany w kod: podstawia go `npm run build` z pola `config.releaseUrl` w `package.json`, domyślnie pustego. Przy pustym adresie panel zamiast pola „Gotowa zakładka” pokazuje podpowiedź, `SH.configLink()` zwraca `null`, a kod ustawień działa bez zmian. Zakładki, które ludzie już mają, działają dalej — adres pliku siedzi w samej zakładce. Build odrzuca adres inny niż `https` bez znaków specjalnych, bo trafia on bez kodowania do literału i do tekstu zakładki. Nagłówek `@namespace` jest neutralny (`statshelper.counter`), a z komentarzy zniknęły odwołania do konkretnego hostingu. Nowy test w `tests/09-artifact.test.js` nie przepuści w `src/`, `build.js`, manifeście ani artefakcie słowa „github” ani nazwy z CODEOWNERS. Hasła panelu zostają bez zmian.

- **Źródła ceny i kursów za jednym kontraktem.** Wszystko, co zna sieć zewnętrzną — adresy Keepa i r.jina.ai, odczyt ceny z wykresu, rozbiór odpowiedzi, źródła kursów walut, hosty dla CSP i sprawdzenia do `SH.cspReport()` — stoi w jednym pliku, `src/15-price-sources.js` (dawniej `15-price-ocr.js`). Każde zapytanie i każdy obrazek modułu cen idą przez `PriceNet`, który sam sprawdza wyłącznik modułu — także kursy i diagnostyka. Karta ceny, kursy i panel znają tylko kontrakt źródła (`run`, `kind`, `available`, `marketSearch`), a nowy test w `tests/09-artifact.test.js` nie przepuści poza adapter nazwy serwisu, adresu hosta, `fetch` ani `new Image`. Działanie się nie zmienia; w `SH.priceStats()` licznik nazywa się teraz „obrazków” zamiast „obrazków Keepa”. Wymiana źródeł na wewnętrzne API sprowadza się do przepisania tego pliku — lista kroków w `HANDOFF.md`.

---

## 1.4.1 — 2026-09-24

Wydanie porządkowe: działanie skryptu jest identyczne z 1.4.0 — kod artefaktu nie zmienił się ani o jeden token, zmieniły się tylko komentarze. Plik jest mniejszy o ok. 15% (8847 → 7694 linii, 486 → 412 KB). Prefiks magazynu zostaje `statsHelper_v1_3_0_`, więc aktualizacja niczego nie zeruje i można ją przyjąć w trakcie zmiany.

### Zmieniono

- **Komentarze w kodzie opisują kod, a nie jego historię.** Wszystkie moduły `src/` i `build.js` przepisane: komentarz mówi w czasie teraźniejszym, co robi fragment i dlaczego tak — powody decyzji i pułapki zostały, kronika wersji („w 8.3.0 było…”, „1.3.3, audyt D7”) i spis zmian 8.x–9.x w nagłówku pliku zniknęły. Kod nie zmienił się ani o jeden token (sprawdzone porównaniem tokenów artefaktu przed i po); artefakt jest krótszy o ok. 1100 linii. Nowy test w `tests/09-artifact.test.js` nie przepuści numeru wersji ani odsyłacza do audytu w komentarzu, a zasada jest zapisana w CLAUDE.md i CONTRIBUTING.md.

- **To samo w całym repozytorium.** Komentarze w testach, w `tests/dom-stub.js`, `tests/harness.js`, `tests/run.js` i w workflow CI i wydania opisują teraz, czego pilnują i dlaczego, bez numerów wersji i odsyłaczy do audytu; nazwy testów też. Nowa zasada 7 w CLAUDE.md: komentarz w kodzie jest neutralny wobec wersji — historia żyje wyłącznie w dokumentacji i w gicie. Pilnuje tego nowy strażnik w `tests/10-language.test.js` dla każdego pliku kodu (źródła, testy, narzędzia, workflow), sprawdzony na próbce z trzema postaciami komentarza.

- **Linter bez szumu i z twardą bramką.** `npm run lint` dawał 43 ostrzeżenia, z czego żadne nie było prawdziwe w skali całości: nazwy z najwyższego poziomu modułu wyglądały na nieużywane, bo czyta je inny moduł. Moduły w `src/` sprawdzają teraz tylko nazwy lokalne, a nieużywane nazwy modułów — nowy blok konfiguracji na sklejonym artefakcie, gdzie widać całość. Nieużyty parametr `catch (e)` nie jest już zgłaszany. `npm run lint` pada przy pierwszym ostrzeżeniu (`--max-warnings 0`), więc w CI ostrzeżenie przestaje być ignorowalne. Z `build.js` zniknęły dwie nieużywane stałe.

---

## 1.4.0 — 2026-09-24

### Dodano

- **Waluta wyświetlania, domyślnie euro.** Panel → „Karta ceny” → „Kwoty pokazywać w”: EUR (domyślnie), PLN, GBP, SEK, USD, CAD albo waluta sklepu bez przeliczania. Karta ceny i linia 6 pokazują kwoty w tej walucie; cena przeliczona ma znak `≈`, a kwota oryginalna zostaje w wierszu źródła. Euro domyślnie to świadomy wyjątek od zasady „nowe domyślnie wyłączone” (decyzja autora): nie dotyka sieci ani liczb, a kartę widać dopiero po ręcznym włączeniu modułu cen — cena z `co.uk` wygląda teraz `≈ 15.63 €` zamiast `GBP 12.50`, a śmieci w magazynie też dają euro. Liczy się zawsze w euro: dziennik trzyma cenę sklepu, suma idzie w euro, a waluta wyświetlania to ostatnie mnożenie przy rysowaniu — dlatego zmiana waluty w trakcie zmiany niczego nie gubi. Ustawienie jest wspólne dla wszystkich kart i przechodzi przez kod ustawień (numer `0x030a`). Bez kursu do wybranej waluty karta pokazuje cenę sklepu, a linia 6 euro. Nowy `tests/32-display-currency.test.js`.

### Zmieniono

- **Przegląd sklepów idzie przez wszystkie rynki, a pierwszy jest rynek z linku na stronie.** Do 1.3.x po porażce na wybranym rynku (domyślnie `amazon.de`) skrypt losował pięć z dziewięciu pozostałych — cena, która była tylko na jednym rynku, wypadała z prawdopodobieństwem 4/9 przy każdym przedmiocie. Teraz: najpierw rynek z linku do produktu na stronie T-REX (`amazon.it/dp/…` → `it`), bo tam produkt na pewno był wystawiony i zwykle wystarcza jedno zapytanie; potem pozostałe rynki europejskie losowo; na końcu `com` i `ca`. Host z linku decyduje tylko o kolejności — adres zapytania dalej pochodzi z listy rynków, a obcy albo podrobiony host (`amazon.it.evil.example`) jest ignorowany. Nowy `tests/33-market-fallback.test.js`.

---

## 1.3.3 — 2026-09-23

### Dodano

- **Narzędzie testów widzi granice, których projekt wymaga** (audyt G1.1–G1.3, G2.1–G2.4, G4, A7, J6). `eq` porównuje strukturalnie — `NaN`, `Infinity`, `null` i `undefined` są różne (dawne `eq(NaN, null)` przechodziło); `throws` sprawdza, który wyjątek poleciał; test asynchroniczny ma granicę czasu, a zgubiona asercja w odrzuconej obietnicy liczy się jako porażka. Strażnicy sprawdzeni mutacjami: test zatruwania prototypu atakuje teraz wynik scalania i pada bez strażnika (wcześniej przechodził, a jego wersja z magazynu pisała pod prefiksem, którego 1.3.x nie czyta); test włączenia logów sprawdza `Utils.log`, a nie potwierdzenie `logsOn()`; licznik słów „`priceModuleOn()` vs `fetch(`” zastąpił inwentarz wyjść do sieci, w którym każde wyjście ma udowodnioną ochronę (strażnik zdjęty z `KeepaOCR.loadImage` i zastąpiony komentarzem zapala go od razu); strażnik diagramów sprawdza pary `Obiekt.metoda`, a nie człony osobno — i od razu znalazł `state.counted` w diagramie 1 (w kodzie to `Routing.state`). Nowy `tests/31-time-and-triggers.test.js`: wyzwalacze liczenia (flaga `i`, wyłączenie `PROBLEM-SOLVE`), czas na ekranie na granicach jednostek, `clone()`.

- **`makeTabNetwork` w `tests/dom-stub.js` — kilka kart na jednym magazynie z przeglądarkową semantyką zdarzenia `storage`**: zapis widać od razu, zdarzenie dostają wszystkie karty oprócz piszącej, a doręczenie czeka na `flush()`. Dotychczasowe testy wielu kart były ściśle po kolei i okna wyścigu nie było w nich ani razu (audyt D8). Na niej stoi `tests/30-multitab-races.test.js`.

- **`docs/przeplyw.md` — cztery diagramy przepływu.** Dla kogoś, kto ma w tym kodzie znaleźć błąd albo zaproponować zmianę: życie przedmiotu od mutacji DOM do wpisu w dzienniku, pięć źródeł zmian w licznikach z niezmiennikiem, który je spina, wszystkie bramki na drodze do sieci oraz kolejność kroków przy uruchomieniu wraz z tym, kto pisze do magazynu. Pod każdym diagramem stoją dwa rozdziały ważniejsze od obrazka: **gdzie to się psuje** (z nazwami usterek, które już się zdarzyły) i **co tego pilnuje** (pliki testów). Diagramy są w Mermaid, więc GitHub rysuje je bez żadnego zewnętrznego serwisu, a w diffie widać, co dokładnie się zmieniło.

- **`tests/25-flow-docs.test.js` — strażnik diagramów.** Dokumentacja tego rodzaju psuje się w jeden sposób: ktoś zmienia nazwę metody albo stałej, a obrazek zostaje z poprzednią. Test wymusza, żeby każda nazwa `Obiekt.metoda`, każda stała konfiguracji i każdy wskazany plik testów naprawdę istniały, żeby etykiety w diagramach były cytowane (niecytowany nawias psuje rysowanie CAŁEGO diagramu) i żeby README prowadziło do pliku — dokument, do którego nic nie prowadzi, przestaje być czytany, a potem przestaje być prawdziwy.

### Bezpieczeństwo

- **Kod ustawień nie włącza już sieci.** Kod krąży po czatach, a jego suma kontrolna niczego nie uwierzytelnia — każdy może go złożyć ręcznie. Numery `0x0200` (wyłącznik modułu cen) i `0x0202` (źródło ceny, np. `r.jina.ai`) włączały moduł cen i wysyłały ASIN każdego przedmiotu do obcego serwisu, a w zakładce — przed pierwszym narysowaniem okna, bez śladu. Oba numery są wycofane na zawsze (`ConfigCode.RETIRED_IDS`); stare kody wczytują się normalnie, te rekordy są pomijane i liczone w sprawozdaniu. Czy i dokąd skrypt wychodzi do sieci, rozstrzyga się tylko ręką, w panelu.

- **Zakładka z `r.ok` i `catch`.** Odpowiedź 404/503 szła do wykonania jako skrypt, a każdy błąd kończył się ciszą — kliknięcie nic nie robiło. Teraz pokazuje się komunikat „StatsHelper nie wystartował” z powodem. Dotyczy zakładki z README i tej, którą daje `SH.configLink()`. W README ostrzeżenie: zakładkę bierze się wyłącznie z README, przysłanej na czacie nie instaluje się nigdy; innej osobie wysyła się kod ustawień, który niczego nie wykonuje.

- **Akcje CI i wydania przypięte do commitów (SHA), a nie do ruchomych tagów**, a checkout nie zostawia tokenu w `.git/config`. Jedyny krok, który go potrzebuje (przesunięcie gałęzi `release`), dostaje go jawnie i maskuje w logach. `attest-build-provenance` podniesiony z v2 na v4. Pilnuje tego nowy test `29-supply-chain`.

### Naprawiono

- **`formatDuration(Infinity)` wypisywało „Infinityg NaNm”** — `isNaN` przepuszcza nieskończoność. Teraz każda wartość, która nie jest skończoną liczbą dodatnią, to „brak danych”.

- **Dwie karty zapisujące coś naraz gubiły dane** (audyt D1, D2, D4, D5, D7, D13). Przeglądarka doręcza zdarzenie `storage` z opóźnieniem, a karty pisały całe obiekty ze swojej pamięci. Pauza w jednej karcie wymazywała zadanie założone właśnie w drugiej (z paczkami w liczniku); zmiana skrótu w jednej karcie znikała przy zapisie drugiej; świeża zmiana cofała się po zapisie sąsiada; dwie karty CRET naraz gubiły paczkę; usunięcie zadania zostawiało paczki, które sąsiad dopisał przed chwilą; wpis usunięty w jednej karcie wracał z pamięci drugiej. Teraz: ustawienia wspólne scalają się trójstronnie (tylko własne zmiany na wierzch magazynu, z usunięciami), lista zadań scala się po zadaniach (znacznik zmiany, nagrobki usuniętych, ostatnie przełączenie aktywnego), liczniki rosną od wartości w magazynie, a zdarzenie `storage` czyta wartość z magazynu zamiast przestarzałego `newValue`. Zapis wyciszony po wczytaniu stanu sąsiada nie przepada, tylko czeka na koniec ciszy.

- **Cena podana symbolem waluty wypadała z sumy zmiany.** „€ 12,50” szło dalej z walutą „€”, której w tablicy kursów nie ma, więc przeliczenie na euro dawało pustkę — ta sama klasa błędu co 2 991,39 € liczone jako 991,39 w 9.1.1. Symbole zamieniają się teraz na kody (`$` na rynku kanadyjskim to CAD), a wzorzec kwoty rozpoznaje wyłącznie waluty, które da się przeliczyć. Działa tylko przy włączonym module cen.

- **Ręczne odjęcie przesuwało procent sprzedaży.** Zdjęta paczka ma nieznany kierunek, a zdejmowała się z mianownika przy nietkniętej sprzedaży: `−1` przy 10 paczkach i 5 sprzedażach dawało 55%, a `50` wpisane w pole działu przy 100 i 60 — 100%. Teraz odjęcie zdejmuje najpierw paczki spoza mianownika (wpisane ręcznie, audyty), a potem z mianownika, proporcjonalnie zmniejszając sprzedane. Dotyczy skrótu `−1`, pola działu, pola paczek i pola tempa zadania.

- **Skrót `−1` łamał równość „suma zadań = licznik karty”**, gdy paczki leżały w poprzednim zadaniu, a aktywne było puste. Odjęcie idzie teraz od najnowszego zadania wstecz, a liczniki zmiany (także sprzedane) przepisują się z zadań — wcześniej skrót przepisywał tylko licznik spoza mianownika.

- **Początek zadania.** „Początek zmiany” na drugim zadaniu cofał je przed koniec pierwszego: dwa zadania liczyły te same godziny, a obiad odejmował się dwa razy. Tekst, który liczbą nie jest, ustawiał początek na 1970 rok. Przestawienie początku zatrzymanego zadania po cichu puszczało zegar.

- **Śmieci w magazynie.** Liczniki czytają się teraz jako liczba całkowita od 0 do 1 000 000 (`'9'.repeat(21)` dawało 1e21); odcinki zadań bez nieskończoności, bez 1970 i bez przyszłości (na ekranie wychodziło „Infinityg NaNm”). Zadanie z samymi złymi odcinkami zostaje — z odcinkiem zerowej długości — żeby jego paczki nie wypadły z sumy.

- **Wyczyszczone pole licznika działu zerowało zmianę bez pytania** — pusty tekst czytał się jako 0. Zero trzeba teraz wpisać świadomie. Karta z licznikiem spoza mianownika większym od paczek nie może już zawyżyć procentu całości.

- **Karta nierozpoznana gubiła paczki zadań po F5.** Jej identyfikator (`unknownTabInstance_abc_def`) sam ma podkreślenia, a klucz licznika zadania dzielił się po ostatnim. Po przeładowaniu paczki trafiały do nieistniejącego zadania, a pierwsza poprawka w panelu zerowała licznik karty. Format klucza się nie zmienia, stare zapisy czytają się poprawnie.

- **Skrypt nie wstawał na karcie nierozpoznanej, gdy `sessionStorage` odmawiał zapisu** — bez okna, bez `SH`, z linią FATAL w konsoli. To samo dla sprzątania kluczy poprzednich wersji przy magazynie, który odmawia usuwania: to sprzątanie nie jest potrzebne do liczenia i teraz nie może zatrzymać startu.

- **Pełny magazyn był niewidoczny.** Odmowa zapisu szła tylko do wyciszonego logu: ekran pokazywał poprawne liczby, a rozjazd wychodził dopiero po F5. Teraz przy pierwszej odmowie pokazuje się raz powiadomienie „Pamięć przeglądarki jest pełna”. To świadomy wyjątek od reguły „skrypt milczy” — cicha utrata liczników jest gorsza.

- **Ostatnia zmiana ustawień ginęła przy F5**, bo autozapis czeka sekundę, a przy wyjściu ze strony dopisywało się tylko archiwum. Teraz `pagehide` dopisuje też czekający autozapis i czekające dopisanie do wspólnego dziennika.

- **Zdjęty egzemplarz pisał jeszcze sekundę po rozbiórce.** `SH.Main.teardown()` nie mógł zgasić odłożonych wywołań `debounce`: autozapis nadpisywał magazyn starym stanem, a skan dopisywał paczkę do licznika prowadzonego już przez nowy egzemplarz. `Utils.debounce` ma teraz `cancel()` i `flush()`, rozbiórka gasi wszystkie cztery.

- **Klucze schematu 1.0–1.2 (`statsHelper_v1_0_0_`) nie były sprzątane** — przy przejściu na `v1_3_0_` nikt nie dopisał starego prefiksu do listy. Test w `02-defaults` trzyma teraz pełną historię prefiksów i nie przepuści następnego takiego przeoczenia.

- **Karta otwarta przez noc liczyła piątkowe paczki do czwartkowego licznika.** Na stanowisku bez resetu sesji skrypt sprawdzał zmianę tylko do pierwszego rozpoznania, a ponowne kliknięcie zakładki na działającej stronie jest ignorowane (ochrona przed podwójnym uruchomieniem). Teraz sprawdza ją co 30 sekund przez cały czas działania: o 06:19 następnego dnia liczniki i zadania wracają do zera, ustawienia zostają. W trakcie tej samej zmiany — także po północy i w martwej strefie — sprawdzenie niczego nie zeruje.

- **Październikowa noc zmiany czasu kasowała zmianę 20 minut przed końcem.** 18:30 CEST → 05:55 CET to 12,42 h zegara, a próg przeterminowania to 12 h, więc F5 po 05:30 zerował całą noc. Teraz dane nie są przeterminowane, dopóki zegar ścienny wskazuje tę samą zmianę.

- **Godzina wpisana ręcznie w polu początku zadania.** W noc zmiany czasu „23:30” lądowało o 22:30 albo o 00:30 (odejmowanie 24 h zamiast cofnięcia o dzień kalendarza). Do tego każda godzina choćby minutę późniejsza niż teraz szła na wczoraj — „06:36” wpisane o 06:35:30 cofało zadanie o dobę. Teraz wynikiem jest najbliższa taka godzina, dzisiejsza albo wczorajsza.

- **Zadanie liczyło czas od 06:20, a zmiana od 06:30 — na każdej zmianie.** Sesja wirtualna startuje o 06:20 albo 18:20 i wtedy właśnie uruchamia się skrypt. Zadanie domyślne miało zaczynać się razem ze zmianą, ale początku w przyszłości zapisać się nie da, więc 06:30 przycinało się do chwili uruchomienia. Linia 1 liczyła tempo od 06:30, linia 8 od 06:20: przy tych samych paczkach dwa różne tempa, a panel pokazywał początek zadania o 06:20. Teraz czas zadań liczy się od początku zmiany bez względu na to, którą drogą powstał odcinek — zadanie domyślne, nowe zadanie założone o 06:25, skrypt wklejony w martwej strefie o 18:10. Nowy plik `tests/26-shift-boundaries.test.js` sprawdza to na zegarze ustawionym na konkretne godziny, razem ze stanowiskiem bez resetu sesji: czwartek 06:20, potem piątek 06:20 — liczniki i zadania od zera, początek zmiany z piątku, a położenie okna, kolory i włączone linie zostają.

- **Testy zadań były zielone tylko o niektórych porach dnia.** Pliki `22-tasks`, `23-task-panel` i `24-departments` budowały odcinki od prawdziwego „teraz”, a skrypt odejmuje od czasu pracy obiad leżący o stałej godzinie ściennej. Czy odcinek trafiał w obiad, zależało od godziny uruchomienia: zestaw był zielony mniej więcej 7 godzin na dobę, a CI zawsze trafiał w zielone okno, bo pushe szły wieczorem — o 09:40 ten sam commit był czerwony. Teraz te pliki chodzą na **zegarze stanowiska** (`makeClock`, `bootOnStand` w `tests/dom-stub.js`): środa 15:00, zmiana dzienna od 06:30, obiad wyłączony poza testami obiadu, które sprzątają po sobie w `finally`. Sprawdzone we wszystkich 24 strefach czasowych: 346 z 346. Nowy test pilnuje, żeby te pliki nie wróciły do zegara procesu testów, a CI puszcza cały zestaw dodatkowo w strefach UTC+14 i UTC−11 — każdy przebieg sprawdza więc trzy różne pory dnia naraz. Kod skryptu nietknięty.

- **Podpowiedź linii 7 mówiła „dwie liczby”**, choć od 1.1.0 linia pokazuje trzy (tempo, sztuki, procent), a podpowiedź linii 8 leżała w słownikach i nigdzie się nie wyświetlała (audyt H4). Ściąga na końcu pliku podawała wartości domyślne sprzed kilku wersji (`showRrp`, rozmiar i tło karty, prefiks magazynu) i nie znała linii 8 ani działu `OTHER`. Teraz test porównuje ściągę z prawdziwymi wartościami domyślnymi, a przykład linii 8 w README — z tym, co rysuje ekran.

### Zmieniono

- **`npm run build` odmawia, gdy w `src/` leży plik spoza manifestu** (audyt I3). Taki plik nie trafia do artefaktu, a build zgłaszał sukces — łapał to tylko `npm test`.

- **Node w CI: 24 dla bramek i wydania, macierz 20/22/24** (audyt K7). Node 18 wypadł: od kwietnia 2025 nie dostaje poprawek bezpieczeństwa, a ESLint 10 i tak go nie obsługuje. `engines` w `package.json` mówi teraz `>=20.19`, czyli tyle, ile naprawdę trzeba do lintera.

- **Dokumentacja dogoniła kod** (audyt J2–J26). Opis ochrony gałęzi podaje prawdziwe nazwy wymaganych sprawdzeń (`Testy i spójność artefaktu`, `Lint i format`) i mówi wprost, że ochrona nie jest jeszcze ustawiona — do tego czasu czerwone CI nie blokuje scalenia. README opisuje pełną listę wyzwalaczy liczenia, usuwanie zadania (zabiera jego paczki z licznika zmiany), skrót `config('0x…')` i podaje przykład kodu ustawień, który da się skopiować. Wypadły twierdzenia, których nic nie potwierdzało („jedna trzecia testów to bezpieczeństwo”, „pięć niezależnych sprawdzeń przed siecią”). Mapa modułów w `src/README.md` ma aktualne rozmiary i test, który pilnuje, żeby się nie rozjechały o więcej niż ćwierć.

- **Wersje 1.0.0, 1.1.0 i 1.3.1 nie mają tagów** i tak zostanie — tag dodany po czasie udawałby wydanie, którego nikt nie pobierał. CHANGELOG mówi to przy każdej z nich (audyt J8).

---

## 1.3.2 — 2026-09-20

### Naprawiono

- **Przestawianie początku zadania dokładało godziny zamiast je przestawiać.** Kontrolka „Początek” ruszała początek OSTATNIEGO odcinka, a czas zadania jest sumą WSZYSTKICH. Wystarczyło raz zatrzymać zegar i kliknąć „początek zmiany”, żeby ostatni odcinek rozciągnął się na całą zmianę obok odcinków wcześniejszych — po niespełna pięciu godzinach pracy dało się naklikać czternaście. Teraz kontrolka opisuje początek CAŁEGO zadania: przesunięcie wstecz rozciąga pierwszy odcinek, przesunięcie w przód obcina wszystko, co przed nim, a przerwy zostają nietknięte. Pilnuje tego niezmiennik w testach: przepracowany czas nigdy nie przekracza odstępu od początku zadania do teraz.

- **Wznowienie nie może zacząć się przed własną pauzą.** Dwa odcinki nachodzące na siebie liczyły ten sam czas dwa razy.

### Dodano

- **Czwarty dział: `Inne` — ręczny.** Nie ma swojej karty T-REX, więc licznik nie zwiększy go nigdy sam; liczby wpisuje się w panelu. Jest workiem na paczki robione poza trzema znanymi procesami: wcześniej nie było ich gdzie zapisać, więc wpisywano je do cudzego działu albo przepadały, a tempo zmiany kłamało w dół. W linii 2 pokazuje się dopiero wtedy, gdy ma paczki; w kodzie ustawień dostał własne, nowe numery (`0x0118`, `0x0309`).

- **Dopisanie kolejnego działu to jedna linia** w `KNOWN_TAB_TYPES` plus nazwa w trzech słownikach — panel, linia 2 i menedżer zadań chodzą po tej mapie. Dział bez pola `urlKeyword` jest ręczny. Rozpoznawanie karty pomija takie działy, inaczej pierwszy z nich wywaliłby uruchomienie na `undefined.toUpperCase()`.

### Zmieniono

- **Dokumentacja doprowadzona do stanu faktycznego.** Nagłówek README mówił o „dwóch szarych liczbach”, choć trzecia — procent sprzedaży — stoi tam od 1.1.0. Do tego: osiem linii zamiast siedmiu (doszła linia 8), wiersz linii 8 w tabeli, sekcje „Zadania” i „Statystyki globalne” na górze listy sekcji panelu, aktualny prefiks magazynu w rozdziale o wersjonowaniu, nowy rozdział „Działy a zadania”, ręczna poprawka licznika opisana zgodnie z 1.3.1 (nie rusza procentu wcale, zamiast „zmienia tylko mianownik”), `SH.tasks()` i `SH.TaskManager` w konsolowym API oraz liczby sprawdzeń w czterech plikach.

---

## 1.3.1 — 2026-09-20

> **Bez tagu.** Tagu `v1.3.1` w repozytorium nie ma — ta wersja nie ma wydania na GitHubie ani pliku do pobrania spod `…/v1.3.1/counter.js`. Nie tworzy się go wstecz: tag dodany po czasie udawałby wydanie, którego nikt nie pobierał. Opis zostaje jako historia zmian.

### Dodano

- **Nowe kierunki sortowania i przedrostek `NS-`.** Na listach kodów doszły: `External` (z dowolnym ogonem, np. `External-Repair`) jako niesprzedaż, `PL-Sellable` i `NS-PL-Sellable` jako sprzedaż, `NS-Secondary-Sorting` jako kod czekający na uściślenie. Do tego każda rodzina niesprzedażowa ma teraz wariant z przedrostkiem `NS-`: przedrostek opisuje gabaryt („nie-sort”), a nie kierunek, więc `NS-Stow-Unsellable` jedzie tam samo, co `Stow-Unsellable`. Wyjątkiem są kody magazynowe — zamiast czterech `NS-CRITS-*` jest jeden wspólny `NS-PL-Sellable`, i pilnuje tego osobne sprawdzenie. Linie uściślające zostają bez przedrostka: `Transfer - Sellable` i `FBATransfer` to status przedmiotu, a status jest ten sam dla sortu i dla nie-sortu.

- **Trzeci kierunek: nierozstrzygalny (`AUDIT`, `NS-AUDIT`).** Audyt to nie kierunek, tylko oddanie przedmiotu w cudze ręce: o tym, czy pojedzie na sprzedaż, zdecyduje audytor w ciągu swojej zmiany, godziny po tym, jak przedmiot zniknął z ekranu. Odpowiedź nie wróci na ten ekran nigdy, więc taki przedmiot **wypada z mianownika procentu sprzedaży** — zrobionych paczek bywa przez to więcej niż paczek, z których liczy się procent, i to jest poprawne, a nie błąd rachunku. Liczy je nowy klucz w magazynie (`neutral_`), osobny na kartę, bo linie 2 i 7 sumują po wszystkich kartach naraz. W dzienniku wartości taki wpis zostaje ze znakiem zerowym i kodem — do sumy pieniędzy nie wchodzi.

  Różnica wobec „kodu nie było wcale” jest celowa: przedmiot bez kodu **zostaje** w mianowniku, bo to zwykle przedmiot, który gdzieś pojechał — tylko skrypt tego nie zobaczył. Wyrzucanie go podnosiłoby procent za każde przeoczenie programu, czyli nagradzało własne błędy.

- **Zadania: własny zegar dla każdego procesu pracy.** Tempo liczyło się od początku zmiany — godziny wpisanej na stałe (6:30 albo 18:30). Kto przyszedł do procesu trzy godziny później i zrobił trzy paczki w sześć minut, widział `1.0/h` zamiast `30/h`: liczba policzona poprawnie, znaczenie fałszywe. Teraz zadanie ma własny zegar, a po uruchomieniu skryptu istnieje jedno zadanie `Default`, zaczynające się razem ze zmianą — dopóki nikt go nie przełączy, wszystko działa jak dotąd.

  Zadanie ma **listę odcinków**, a nie jeden początek i koniec. Kto wrócił do procesu sprzed pięciu godzin, **wznawia** to samo zadanie zamiast zakładać drugie o tej samej nazwie — w podsumowaniu zmiany stoi wtedy jedno zadanie z sensownym tempem, a nie wpisy 30 / 100 / 30, z których nic nie widać. Odcinek jest też miejscem na pauzę: zamknięty zatrzymuje zegar, a pierwsza paczka po pauzie otwiera nowy, bo skoro paczki idą, to przerwa się skończyła. Przerwa obiadowa odejmuje się od czasu zadania tym samym rachunkiem, co od czasu zmiany.

- **Linia 8 — bieżące zadanie.** Nazwa procesu i jego własne liczby: `fast_process 12 34.3/h 58% 0:21`. Linie 1, 2 i 7 opisują całą zmianę i tak zostaje; linia 8 mówi o procesie, przy którym człowiek siedzi teraz. Domyślnie wyłączona, jak każda nowa linia. Zatrzymany zegar dokleja `(pauza)`, inaczej stojące tempo wygląda jak zepsuty licznik.

- **Sekcja „Zadania” w panelu — na samej górze, razem z licznikami działów.** To jedyne miejsce otwierane w trakcie pracy: przełączenie procesu, poprawka jego początku i wpisanie liczb po awarii maszyny mieszczą się w dwóch–trzech kliknięciach. Początek ustawia się skrótami (`teraz`, `-2 min`, `-5`, `-15`, `-30`, `początek zmiany`) albo godziną wprost w polu `HH:MM`; godzina późniejsza niż bieżąca znaczy „wczoraj”, bo na nocnej zmianie o 00:40 wpisane `23:30` to pół godziny temu. Historia zmiany pokazuje każde zadanie dwiema liniami — kiedy i ile — z przyciskiem wznowienia przy zadaniach nieaktywnych.

- **Paczki i tempo jako dwa pola opisujące to samo.** Kto pamięta „zrobiłem 259 paczek”, wpisuje paczki; kto pamięta „miałem jakieś 29,5”, wpisuje tempo — drugie pole przelicza się samo. Po wpisaniu tempa panel pokazuje wartość osiągalną przy CAŁYCH paczkach, a nie wpisaną: przy 1:17 pracy „118” to 151 paczek, czyli 117,7 na godzinę. Obiecywanie 118 byłoby kłamstwem o jedną paczkę.

- **`SH.tasks()` i `SH.TaskManager`** — podsumowanie zadań i przełączanie z konsoli.

### Zmieniono

- Stanowisko ręczne (`tests/manual/test_page.html`) zna wszystkie nowe kody, razem z wariantami z ogonem (`External-Repair`, `Audit-Damage`) i grupą „poza procentem”.

- **Ręcznie wpisane paczki nie wchodzą do mianownika procentu sprzedaży.** Komputer stoi na sesji tymczasowej, więc po awaryjnym restarcie pamięć przeglądarki znika w całości: człowiek pamięta swoje tempo albo liczbę paczek, ale nie pamięta, ile z nich poszło na sprzedaż. Liczba wpisana w pole licznika (albo skrótem klawiszowym) trafia więc do paczek **oraz** do licznika „poza mianownikiem” — tego samego, którym liczą się audyty. Skutek: procent liczy się od przedmiotu, przy którym człowiek wrócił do pracy. Gdyby wpisane paczki wchodziły do mianownika, procent po każdej awarii spadałby do kilku procent i przestałby cokolwiek znaczyć.

- **Granica „tempo jeszcze nie istnieje” stoi w jednym miejscu** (`RATE_MIN_WORKED_MS`, dziesięć sekund) i obowiązuje linię 1, linię 8 oraz przeliczanie tempa na paczki. Wcześniej była wpisana liczbą w jednym miejscu, a przy zadaniach musiałaby powstać drugi raz — i dwie linie mówiłyby co innego o tej samej pierwszej minucie pracy.

- Obliczenie przerwy obiadowej wydzielone z `ShiftManager.getWorkTime()` do `lunchOverlapMs(from, to)`: ten sam rachunek jest potrzebny zadaniom.

- **Liczniki działów przeniesione na górę panelu**, pod sekcję zadań. Wpisanie liczby wprost to sposób na powrót do pracy po awarii maszyny, więc stoi tam, gdzie się go szuka, a nie na końcu panelu pod ustawieniami kolorów.

### Uwaga o zgodności danych

- **`SCRIPT_ID_PREFIX` zmienia się z `statsHelper_v1_0_0_` na `statsHelper_v1_3_0_`.** Zgodnie z zasadą 4 z CLAUDE.md jest to zmiana MAJOR: liczniki, dziennik wartości i ustawienia z poprzednich wersji nie przenoszą się. Numer wersji mimo to idzie na 1.3.1 — to świadoma, jednorazowa decyzja autora: wydanie stabilne żyje pod osobnym adresem, a tej gałęzi nie używa jeszcze nikt, więc nie ma czyich danych stracić. Dzięki temu menedżer zadań startuje na czystym schemacie, bez warstwy przenoszenia starych kluczy, która byłaby najniebezpieczniejszym fragmentem całej zmiany.

---

## 1.2.1 — 2026-09-19

### Zmieniono

- **CHANGELOG nie jest już zawijany ręcznie.** Akapity stoją w jednej linii (Prettier, `proseWrap: "never"` tylko dla tego pliku). Powód jest w renderowaniu: sekcja stąd jedzie żywcem do opisu wydania, a GitHub pokazuje w opisach wydań każde przejście do nowej linii — tekst zawinięty na 80 znakach wyglądał tam na poszarpany, z urwanymi wierszami w połowie zdania. Pliki repozytorium renderują się inaczej i tam zawijanie zostaje.

### Naprawiono

- **Układ opisu wydania na stronie GitHuba.** Dwie rzeczy, obie w szablonie z `release.yml`, a nie w samym CHANGELOG-u. Po pierwsze wyciągnięta sekcja niosła na końcu separator `---` sprzed poprzedniej wersji, a szablon dokładał drugi — w wydaniu stały dwie kreski jedna pod drugą. Po drugie adres zakładki ma ponad 200 znaków w jednej linii i w bloku kodu wychodził poza szerokość strony, więc trzeba go było przewijać w bok. Adres został tam, gdzie i tak jest jego miejsce — w README — a opis wydania wskazuje na ten rozdział i na plik przypięty do tej konkretnej wersji.

- **Zakładka nie mogła pobrać skryptu.** Adres wydania na `github.com` (`releases/latest/download/…`) odpowiada przekierowaniem **bez** nagłówka `Access-Control-Allow-Origin`, więc przeglądarka zrywała zapytanie: „blocked by CORS policy”, a w konsoli zostawało `net::ERR_FAILED 302`. Kliknięcie tego adresu działa — plik się pobiera — ale `fetch` z zakładki, czyli z cudzej strony, już nie. Różnicy nie widać z kodu i wyszła dopiero w pracy z wydaniem 1.2.0.

  Zakładka pobiera teraz plik spod `raw.githubusercontent.com`, który wystawia `access-control-allow-origin: *`, z gałęzi **`release`**. Gałąź jest wskaźnikiem „ostatnie wydanie”: przesuwa ją workflow wydania po opublikowaniu tagu i tylko wtedy, gdy wydawany tag jest najnowszy — więc uruchamia się wyłącznie kod, który ktoś świadomie wydał, a powtórzenie przebiegu dla starego tagu nie cofa ludziom skryptu. Przypięcie do wersji: ta sama ścieżka z tagiem zamiast `release`.

  Adres stoi w jednym miejscu (`CONFIG.RELEASE_URL`), więc zakładka z kodem ustawień z `SH.configLink()` naprawia się razem z nim. Pilnuje tego nowe sprawdzenie: host adresu wydania musi być na liście tych, o których wiadomo, że nagłówek CORS wystawiają.

---

## 1.2.0 — 2026-09-19

### Dodano

- **Kod ustawień — jeden ciąg szesnastkowy zamiast przeklikiwania panelu.** Sekcja „Kod ustawień” na dole panelu pokazuje kod bieżących ustawień (`0x0101000101010103ff8800…`) i gotową zakładkę z tym kodem w środku; obok stoi pole na cudzy kod. To samo z konsoli: `SH.configCode()`, `SH.configLink()` i `SH.config('0x…')` — wielkość liter bez znaczenia. Kod obejmuje wszystko, co daje się ustawić: położenie okna, siedem linii, kolory działów, nakładkę, całą kartę ceny, język, sklep, skróty klawiszowe i udział działów w sumie. Danych — liczników, dziennika, stanu zmiany — nie obejmuje.

  Format to zbiór samoopisujących się rekordów `[numer: 2 B][długość: 1 B][wartość]` z sumą kontrolną na końcu, a nie stała mapa bitów. Dzięki długości w rekordzie nieznany numer daje się przeskoczyć, więc **kody zachowują ważność w obie strony przez wydania**: starszy skrypt wczyta kod z nowszego (pomijając to, czego i tak nie umie ustawić), nowszy wczyta stary. Numer raz wydany nie wraca do obiegu. Kod jest łatką, a nie zdjęciem konfiguracji — wchodzi do niego tylko to, co różni się od domyślnych, więc zmiana wartości domyślnej w kolejnym wydaniu dociera do ludzi, którzy danej rzeczy nie ruszali.

  Kod przychodzi z zewnątrz, więc dekodowanie nie tworzy pól: zapis idzie wyłącznie pod ścieżki z rejestru, liczby są przycinane do granic z rejestru, kolory sprawdzane co do formy, pola wyboru po indeksie z listy, teksty tylko w drukowalnym ASCII. Nieznany numer, zła długość i śmieciowa wartość są pomijane pojedynczo, z adnotacją w sprawozdaniu.

- **Zakładka niesie ustawienia i nakłada je w trakcie uruchamiania.** Adres z `SH.configLink()` najpierw wpisuje kod do okna przeglądarki, a dopiero potem pobiera plik; skrypt czyta go w `Main.init()` — po wczytaniu magazynu, przed pierwszym rysowaniem okna. Wcześniejszy pomysł (wykonać plik, a zaraz za nim `SH.config('0x…')`) nie działał na stronie, która jeszcze się wczytuje, bo `SH` w tym momencie nie istnieje, a na gotowej stronie dawał mrugnięcie wyglądem domyślnym. Kliknięcie zakładki na stronie z już działającym skryptem nie stawia drugiego egzemplarza, ale ustawienia nakłada — na ten działający.

### Zmieniono

- **Wydanie da się zrobić bez konsoli.** README ma rozdział „Wydania”: commit wydania w PR, a potem tag wyklikany w **Releases → Draft a new release**. Workflow wydania przyjmuje teraz także ręczne uruchomienie z podanym tagiem (**Actions → Release → Run workflow**), więc przebieg, który padł po utworzeniu tagu, powtarza się bez wydawania nowej wersji. Wcześniej to pole istniało, ale nie mogło zadziałać: bez tagu sprawdzenie wersji porównywało `main` z numerem z `package.json`.

- **Zasady numerowania wersji zapisane w `build.manifest.json`** — razem z rozróżnieniem trzech numerów, które łatwo pomylić: wersji skryptu, `SCRIPT_ID_PREFIX` (schemat danych) i `ConfigCode.FORMAT` (ramka kodu ustawień).

- Kolejność modułów: `23-config-code.js` stoi teraz przed `24-presets.js`. Presety wołają `Main.init()`, a init używa kodu ustawień w czasie działania, więc musi mieć go zadeklarowanego wyżej.

- `README.md` opisuje mechanizm kodu wraz z rozbiorem przykładowego ciągu; liczba sprawdzeń w dokumentacji doprowadzona do stanu faktycznego (254).

---

## 1.1.0 — 2026-09-19

> **Bez tagu.** Tagu `v1.1.0` w repozytorium nie ma — ta wersja nie ma wydania na GitHubie ani pliku do pobrania spod `…/v1.1.0/counter.js`. Nie tworzy się go wstecz: tag dodany po czasie udawałby wydanie, którego nikt nie pobierał. Opis zostaje jako historia zmian.

### Dodano

- **Wyłączniki zawartości karty ceny** — te same klocki, co przy liniach okna statystyk: kod produktu, jego klikalność i czas zdobycia ceny w milisekundach. Do tego wybór kroju pisma z listy okna statystyk.

- **Procent sprzedaży na końcu linii 1, 2 i 7.** Liczba od 0 do 100 ze znakiem procentu: ile ze zrobionych przedmiotów pojechało na sprzedaż. Mianownikiem jest licznik przedmiotów, więc przedmiot o nieustalonym kierunku obniża procent zamiast wypadać z rachunku, a same niesprzedaże na początku zmiany dają uczciwe `0%`. Część ułamkowa jest odrzucana, a nie zaokrąglana — 1 z 17 to `5%`, nie `6%`. Linia 1 liczy bieżącą kartę, linie 2 i 7 wszystkie wliczane do sumy. Kierunek bierze się z tekstu strony, więc procent działa przy **wyłączonym** module cen i nie kosztuje ani jednego zapytania. Żyje jedną zmianę i zeruje się razem z licznikami.

- **Lista haseł dostępu zamiast jednego hasła.** Na górze pliku stoi teraz `SETTINGS_ACCESS_PASSWORDS = ['GORDONPAULE', 'BOMBA']`; wszystkie pozycje działają tak samo i można dopisywać kolejne. Wielkość liter bez znaczenia, białe znaki z brzegów obcinane, powtórzenia i pozycje, które hasłem nie są, pomijane. Jedno ograniczenie wynika z mechanizmu i jest pilnowane testem: hasło nie może być początkiem innego hasła, bo krótsze zadziałałoby wcześniej i wyczyściło bufor.

- **Kolor tekstu karty ceny** — jedna para (kolor + przezroczystość) na wszystkie wiersze karty, zmieniana pickerem w panelu, tak samo jak przy liniach okna statystyk.
- **Wyłącznik wiersza źródła** (`showSource`). Czas zdobycia ceny ma własny wyłącznik i działa niezależnie od niego.

### Zmieniono

- **Wyłączone linie nie są składane.** Widocznością linii steruje CSS, więc render szedł bezwarunkowo: raz na sekundę powstawał komplet węzłów linii, których nikt nie ogląda, a linia 6 przy okazji przechodziła po całym dzienniku wartości i przeliczała każdą pozycję po kursie. Przy ustawieniach domyślnych widoczna jest jedna linia z siedmiu. Pomiar w atrapie DOM (500 przebiegów): 12,0 → 0,0 utworzonych węzłów na render, 0,069 → 0,024 ms na render, a przy dzienniku na 1000 pozycji 0,229 → 0,024 ms — koszt przestał zależeć od długości zmiany. Liczby na ekranie się nie zmieniają: pętla po kartach chodzi jak dotąd, bo `gTotal` potrzebny jest także linii 7.

- **Karta ceny wygląda teraz jak linie, a nie jak okno aplikacji.** Domyślnie: tło przezroczyste (`bgAlpha` 88 → 0), cena cienka w rozmiarze 16 px zamiast tłustych 30 px, bez ramki i cienia — ramka i cień wracają razem z tłem, gdy ktoś podniesie suwak. Dolna granica suwaka rozmiaru zeszła z 14 na 11 px, żeby kartę dało się zrównać z liniami.

- **Kod produktu domyślnie nie jest linkiem** (`asinClickable: false`). `pointer-events:auto` na linku było jedynym wyjątkiem od przezroczystej dla myszy karty, czyli jedynym miejscem, w którym karta mogła przykryć przycisk T-REX. Link włącza się w panelu ustawień; przy wyłączonym kod produktu nie ma `href`, więc nie otworzy go ani tabulator, ani środkowy przycisk myszy.

- **Czas zdobycia ceny nie jest już dopisywany zawsze** (`showLatency: false`). To liczba dla kogoś, kto dobiera źródło ceny, a nie dla kogoś, kto pracuje.

- **Format linii 7: z dwóch członów na trzy** — `17.4 28` stało się `17.4 28 14%`. Reszta formatu nienaruszona: bez jednostek, nawiasów i przecinków.

- `Routing.onCompleted()` wywołuje się teraz zawsze, a nie tylko wtedy, gdy dziennik wartości wydał id wpisu. Dopóki jedynym odbiorcą kierunku był dziennik, warunek był poprawny; procent sprzedaży jest drugim odbiorcą i przy ustawieniach domyślnych jedynym.

- **`SETTINGS_ACCESS_PASSWORD` (pojedyncze) zniknęło** — zastąpione tablicą `SETTINGS_ACCESS_PASSWORDS`. Kto miał własne hasło w swojej kopii pliku, przenosi je do tablicy.

- Bufor klawiatury jest łańcuchem zamiast tablicy sklejanej przez `join('')` przy każdym naciśnięciu, a porównanie z hasłami startuje dopiero wtedy, gdy naciśnięty znak jest ostatnim znakiem któregoś z nich. Przy dwóch domyślnych hasłach pracę uruchamiają wyłącznie litery `E` i `A` — każdy inny klawisz kosztuje jedno nieudane zajrzenie do mapy.

- **Karta ceny to domyślnie jedna szara linijka z kwotą.** Ten sam kolor (`#808080`), ta sama przezroczystość (50%) i ten sam rozmiar (13 px), co linia 7, na przezroczystym tle. Domyślnie wyłączone: kod produktu, cena katalogowa, wiersz źródła, czas zdobycia ceny.

- **Kolory przestały nieść stan.** Zielona cena i pomarańczowa kreska zniknęły: kolor jest teraz ustawieniem wyglądu, a stan mówi TEKST — i ten tekst pokazuje się zawsze, niezależnie od wyłączników. Dotyczy to powodu braku ceny (blokada CSP, limit, brak wyniku) oraz adnotacji, że cenę zdjęto z innego sklepu niż wybrany.

Zachowanie po wklejeniu pliku się nie zmienia: karta pojawia się dopiero po ręcznym włączeniu modułu cen, więc na starcie nadal widać samą linię 7, bez zapytań sieciowych i bez linii w konsoli.

### Naprawiono

- **Przycisk przeciągania okna nie nadążał za stanem.** Jego wygląd wyliczany jest przy rysowaniu panelu z flagi `uiFlags.*Dragging`, ale przerysowanie wołała wyłącznie obsługa kliknięcia w ten przycisk — a flagę zdejmuje też dragger po puszczeniu myszy i przycisk resetu pozycji. Człowiek przeciągał okno, puszczał, tryb się wyłączał, a przycisk dalej świecił pomarańczowym i pisał „kliknij, by przypiąć”; kliknięcie w niego WŁĄCZAŁO przeciąganie z powrotem. Panel nasłuchuje teraz obu flag, więc kontrolka pokazuje stan niezależnie od tego, kto go zmienił.

- **Pełny magazyn nie zabija skryptu.** `localStorage` tej domeny dzielimy z samym TREX, więc kwota potrafi się skończyć nie z naszej winy. Wyjątek z `setItem` szedł ze `StorageManager.write()` nieprzechwycony aż do `Main.init()` i skrypt nie wstawał wcale — zamiast stracić przeniesienie liczników przez F5, człowiek tracił licznik. Teraz nieudany zapis wraca `false`, praca idzie dalej na stanie w pamięci, a notatka „już zapisane” stawia się dopiero po udanym zapisie, więc po zwolnieniu kwoty ta sama wartość da się zapisać.

- **Wspólny dziennik: dopisanie po wyścigu dwóch kart.** O tym, czy scalony dziennik wraca do wspólnego klucza, decydowała długość listy. Gdy sąsiednia karta nadpisała naszą pozycję swoją, starszą wersją (długość bez zmian), dopisanie się nie planowało i w magazynie zostawała wersja starsza. Naprawiało się to przy następnym przedmiocie, więc realnie ginął kierunek OSTATNIEGO przedmiotu zmiany — akurat na podsumowaniu. Teraz porównanie idzie po `id` i `updated`, czyli tą samą miarą, którą rozstrzyga scalanie.

- **Karta ceny znikała na stałe po wyjątku.** Rezerwowe szukanie ASIN chowa kartę na czas odczytu `document.body.innerText` (inaczej podałaby nam własny, poprzedni ASIN). Przywrócenie stało PO odczycie, więc wyjątek w trakcie — rozbierane drzewo, cudzy skrypt — zostawiał kartę schowaną do końca zmiany. Z zewnątrz wygląda to jak zepsuty skrypt. Przywracanie przeniesione do `finally`.

---

## 1.0.0 — 2026-09-16

> **Bez tagu.** Tagu `v1.0.0` w repozytorium nie ma — ta wersja nie ma wydania na GitHubie ani pliku do pobrania spod `…/v1.0.0/counter.js`. Nie tworzy się go wstecz: tag dodany po czasie udawałby wydanie, którego nikt nie pobierał. Opis zostaje jako historia zmian.

Pierwsze oficjalne wydanie. Kod ten sam, co w poprzedniej numeracji 9.2.0; zmieniła się numeracja i sposób prowadzenia samego projektu.

### Dodano

- **Struktura modułowa.** Plik pocięty na 25 modułów w `src/`. Budowanie `npm run build` skleja je w jeden `counter.js`. W artefakcie przed każdym fragmentem stoi znacznik `// ─── src/xx-nazwa.js ───`, żeby przy czytaniu było widać, skąd pochodzi.
- **Manifest budowania** `build.manifest.json` — kolejność modułów i opis każdego w jednym zdaniu. On też jest mapą projektu.
- **Kontrola spójności artefaktu.** `npm run build:check` przebudowuje plik w pamięci i porównuje z tym, co leży w repozytorium. Ręczna poprawka `counter.js` przestaje przechodzić niezauważona.
- **Testy rozdzielone na pliki** — dziewięć sztuk w `tests/`, 106 sprawdzeń, własny runner i atrapa DOM. Doszły sprawdzenia wielu kart, których wcześniej nie było.
- **Oprzyrządowanie repozytorium:** CI (testy, budowanie, macierz Node 18/20/22 na trzech systemach), workflow wydania po tagu, szablony PR i zgłoszeń, CODEOWNERS, Dependabot, ESLint, Prettier, `.editorconfig`, `.gitattributes`.
- **Dokumentacja:** nowy README z pełnym opisem możliwości, CONTRIBUTING z zasadami modułów i przepływu gałęzi, mapa modułów w `src/README.md`.

### Zmieniono

- **Prefiks magazynu** `statsHelper_v9_2_0_` → `statsHelper_v1_0_0_`. Liczniki poprzedniej wersji nie przenoszą się — aktualizować między zmianami. Archiwum podsumowań zmian zostaje: leży pod wspólnym prefiksem `statsHelper_shared_` i nie jest wersjonowane.
- **Wersja podstawiana przy budowaniu** z `package.json` zamiast literału w kodzie. W źródłach stoi `__VERSION__`.

### Nie zmieniono

Zachowanie skryptu nie zostało ruszone w żadnym miejscu. Sprawdzone bajt po bajcie: bez komentarzy obie wersje dają 3091 linii kodu, różnic jest dokładnie trzy — numer wersji, prefiks magazynu i dopisany do listy starych prefiksów `statsHelper_v9_2_0_`.

---

## Prehistoria (numeracja 8.x — 9.x)

Przed 1.0.0 projekt żył bez repozytorium, w plikach `a.js`, `k.js`, `d.js` i osobnych changelogach. Poniżej krótko, co skąd się wzięło.

### 9.2.0 — tryb cichy

- **Moduł cen domyślnie wyłączony.** Po uruchomieniu skrypt nie wysyła ani jednego zapytania do internetu. Sieć budzi się dopiero po ręcznym włączeniu. Zabezpieczenie w pięciu niezależnych miejscach.
- **Logi domyślnie wyłączone.** Trzy poziomy: `log` i `error` podlegają wyłącznikowi, `fatal` wypisuje się zawsze — cicha awaria na starcie wygląda jak „nic się nie stało”.
- **Linia 7** — kompaktowy licznik `17.4 28`, jedyne, co widać domyślnie.
- Linie 2 i 6 wyłączone domyślnie.
- Okno przeniosło się do lewego dolnego rogu i nauczyło się dociągać do dołu.
- Wszystkie komentarze i wszystkie komunikaty logów przetłumaczone na polski.
- Pojawił się zestaw testów bezpieczeństwa.

### 9.1.1 — separator tysięcy

Cena droższa niż 999 € trafiała do dziennika z utraconą najstarszą cyfrą: Keepa drukuje `€ 2,991.39`, a rozbiór zwracał `991.39`. Przyczyna — przecinek rozdzielający w pasku legendy wygląda jak kropka, łańcuch nie przechodził sprawdzenia formy i wygrywał jego własny obcinek. Forma została rozszerzona, doszedł normalizator `toDecimal()`.

### 9.1.0 — wspólny dziennik dla wszystkich kart

Dziennik wartości czytany był z `localStorage` raz na starcie, a zapisywany w całości — dwie karty zamazywały się nawzajem. Przerobione na scalanie po `id` z rozstrzyganiem konfliktów po `updated`. Do tego zasada „`Secondary-Sorting` bez uściślenia = niesprzedaż” oraz kolor i przezroczystość linii 6.

### 9.0.0 — pieniądze w euro i kierunek przedmiotu

Kursy walut z otwartego źródła, sprowadzenie wszystkich cen do euro, rozdzielenie sprzedaż/utylizacja po kodzie sortowania, bilans zmiany w linii 6.

### 8.6.0 — przeglądanie sklepów

Jeśli na wybranym rynku ceny nie ma, próbowane są pozostałe rynki Keepa w losowej kolejności. Do tego limity zapytań na sesję.

### 8.5.0 — link do towaru i wybór sklepu

Jedno ustawienie sklepu na link, wykres i walutę. Kartę można ukryć bez wyłączania silnika. Trwały cache cen usunięty: cena zmienia się w ciągu dnia.

### 8.4.0 / 8.4.1 — cena tekstem i dziennik wartości

Rozpoznawanie ceny z pikseli legendy Keepa zamiast pokazywania obrazka. Dziennik wartości obsłużonych przedmiotów. W 8.4.1 — zasada dla kropki szerokiej na dwa piksele.

### 8.3.0 — rozbiór błędów z przeglądu 8.2.0

Subskrypcja zmian stanu po gałęziach zamiast jednego wspólnego zdarzenia, głębokie kopiowanie w `deepMerge`, rozbiór CSP według gramatyki, poprawna rozbiórka skryptu podniesionego do połowy.

### 8.2.0 — karta ceny

Pierwsza wersja karty ceny po ASIN.

### 8.1.0 — cykl życia zmiany

Autozapis ustawień, reset danych między zmianami, odfiltrowanie własnych mutacji w `MutationObserver`.
