# Historia zmian

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

Dla tego projektu SemVer czyta się tak:

- **MAJOR** — zmienia się `SCRIPT_ID_PREFIX`: liczniki i ustawienia nie przenoszą się, aktualizować można **wyłącznie między zmianami**;
- **MINOR** — nowa możliwość, dane zgodne wstecz;
- **PATCH** — naprawa bez nowych pól w danych.

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
