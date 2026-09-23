# StatsHelper Counter

Licznik obsłużonych przedmiotów dla T-REX. Siedzi cicho w rogu ekranu przez całą
zmianę, liczy sztuki ze wszystkich otwartych kart i domyślnie nie robi nic poza
tym: ani jednego zapytania do internetu, ani jednej linii w konsoli.

**Wersja 1.3.2** · [Co nowego](CHANGELOG.md) · [Jak wprowadzać zmiany](CONTRIBUTING.md)

```
17.4 28 14%
```

To cały domyślny interfejs — trzy szare liczby w lewym dolnym rogu.
Pierwsza: przedmiotów na godzinę, łącznie ze wszystkich kart. Druga: ile zrobiono.
Trzecia: ile z nich pojechało na sprzedaż. Cała reszta — linia z podsumowaniem
działów, bieżące zadanie, bilans pieniężny zmiany, karta ceny towaru — istnieje,
ale włącza się ręcznie.

---

## Spis treści

- [Szybki start](#szybki-start)
- [Co robi domyślnie](#co-robi-domyślnie)
- [Linie okna statystyk](#linie-okna-statystyk)
- [Zadania](#zadania)
- [Moduł cen](#moduł-cen)
- [Panel ustawień](#panel-ustawień)
- [Kod ustawień](#kod-ustawień)
- [Konsolowe API](#konsolowe-api)
- [Kilka kart naraz](#kilka-kart-naraz)
- [Zmiany i przerwy](#zmiany-i-przerwy)
- [Bezpieczeństwo](#bezpieczeństwo)
- [Budowa repozytorium](#budowa-repozytorium)
- [Praca nad kodem](#praca-nad-kodem)
- [Wersjonowanie](#wersjonowanie)
- [Wydania](#wydania)
- [Diagnostyka](#diagnostyka)

---

## Szybki start

### Zakładka w przeglądarce (zalecane)

Tam, gdzie konsola jest zamknięta, a i tak wygodniej. Nowa zakładka, dowolna
nazwa, a jako adres:

```
javascript:(async()=>{try{const r=await fetch('https://raw.githubusercontent.com/YafremauAliaksei/counter/release/counter.js',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);eval(await r.text())}catch(e){alert('StatsHelper nie wystartował: '+e.message)}})();void 0;
```

Kliknięcie na stronie T-REX pobiera i uruchamia **ostatnie wydanie**.

> **Zakładkę bierze się wyłącznie stąd — z tego README.** Zakładki przysłanej
> na czacie nie instaluje się nigdy, nawet jeśli wygląda znajomo. Adres
> zakładki to program, który wykonuje się na stronie T-REX z uprawnieniami
> zalogowanej osoby; wystarczy jeden zmieniony adres pliku w środku, żeby
> uruchomić cudzy kod — a na oko tego nie widać. Ustawienia wymienia się
> **kodem** (`0x…`, patrz „Kod ustawień”), który niczego nie wykonuje.

Szczegóły w tym adresie nie są przypadkowe:

- **`raw.githubusercontent.com`, a nie adres pliku wydania na `github.com`.**
  Zakładka pobiera plik z **cudzej strony**, czyli zapytaniem międzydomenowym,
  a takie przechodzi tylko wtedy, gdy serwer odpowie nagłówkiem
  `Access-Control-Allow-Origin`. Adres `github.com/…/releases/latest/download/…`
  odpowiada przekierowaniem **bez** tego nagłówka, więc przeglądarka zrywa
  zapytanie („blocked by CORS policy”). Kliknięcie takiego adresu działa — plik
  się pobiera — ale `fetch` z zakładki już nie, i tak wyszło wydanie 1.2.0;
- **gałąź `release`, a nie `main`.** To wskaźnik „ostatnie wydanie”: przesuwa go
  workflow wydania po opublikowaniu tagu. Uruchamia się więc tylko kod, który
  ktoś świadomie wydał, a nie bieżący stan gałęzi roboczej;
- **`cache:'no-store'`** — żeby przeglądarka nie podała starego pliku z pamięci
  podręcznej. Sam `raw.` trzyma odpowiedź 5 minut po swojej stronie, więc świeże
  wydanie dojeżdża do wszystkich najdalej po tylu;
- **`r.ok` i `catch`** (od 1.3.3) — gdy plik się nie pobierze (brak sieci,
  odpowiedź 404/503), pokazuje się komunikat „StatsHelper nie wystartował”
  z powodem. Wcześniej treść odpowiedzi błędu szła do wykonania, a każdy błąd
  kończył się ciszą: kliknięcie po prostu nic nie robiło;
- **`void 0` na końcu** — bez tego zakładka, której wyrażenie zwraca tekst,
  potrafi zastąpić nim całą stronę.

Żeby przypiąć się do konkretnej wersji i nie dostawać następnych automatycznie,
zamienić `release` na numer wersji z literą `v`:
`…/counter/v1.3.2/counter.js`.

### Wklejenie do konsoli

1. Otworzyć roboczą stronę T-REX.
2. `F12` → zakładka Console.
3. Wkleić całą zawartość [ostatniego wydania](https://github.com/YafremauAliaksei/counter/releases/latest),
   nacisnąć Enter.

W obu przypadkach w lewym dolnym rogu pojawią się trzy liczby: tempo, sztuki
i procent sprzedaży. Nic więcej robić nie trzeba.

> **Skąd brać plik.** Z **wydania**, nie z `counter.js` w gałęzi `main`. Plik
> w repozytorium jest artefaktem budowania i zmienia się przy każdym scaleniu;
> wydanie jest stanem, który przeszedł bramki i został oznaczony tagiem.
> Do każdego wydania dołączona jest suma SHA-256 oraz poświadczenie pochodzenia,
> sprawdzalne przez `gh attestation verify counter.js --repo YafremauAliaksei/counter`.

> **Nagłówek `==UserScript==`** został w pliku jako dokumentacja. Menedżer
> skryptów (Tampermonkey i podobne) nie jest potrzebny, a jego API (`GM_*`)
> nigdzie nie jest używane — wszystko zapisuje się przez `localStorage`.

**Otwarcie ustawień:** wpisać na stronie `GORDONPAULE` albo `BOMBA` (poza polem tekstowym).
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
`poniżej` (albo `Transparency`, albo rosyjskiej wersji tego napisu z interfejsu
T-REX) podnosi flagę „zaczął się przedmiot”. Przy podniesionej fladze `+1` daje
pierwsza finalna linia z listy:

- `Przypisz nowy` albo `Przypisz ponownie`;
- `Przedmiot wysłano do …` — z wyjątkiem `PROBLEM-SOLVE`, bo taki przedmiot
  wraca do obsługi i zostałby policzony dwa razy;
- rosyjski napis skanowania numeru LP z interfejsu T-REX.

Pełne wyrażenia stoją w `CONFIG.PRE_TRIGGER_REGEX` i `CONFIG.AUTO_TRIGGER_REGEX`.
Przerwany przedmiot, przy którym nie doszło do finalnej linii, nie jest
zaliczany — dokładnie tak samo, jak nie zalicza go sam system.

---

## Linie okna statystyk

W oknie jest osiem niezależnych linii. Każda włącza się osobno, każda ma własny
kolor, przezroczystość i rozmiar czcionki.

| Linia | Co pokazuje                                                           | Domyślnie |
| ----- | --------------------------------------------------------------------- | --------- |
| **1** | statystyka bieżącej karty: `CRET 8.8/h (7 zrobione w 2g 15m) 14%`     | wył.      |
| **2** | podsumowanie działów: `CRET 8.8/h(7) WHD 5.0/h(4) = ~13.9/h (11) 14%` | wył.      |
| **3** | rodzaj i początek zmiany: `DZIENNA zmiana (06:30)`                    | wył.      |
| **4** | wybrana przerwa: `Przerwa #4 (12:50 - 13:20)`                         | wył.      |
| **5** | zegar: `[ 14:32:07 ]`                                                 | wył.      |
| **6** | bilans pieniężny zmiany: `+6000.00 -1500.00 = 4500.00 € 113 szt ?1`   | wył.      |
| **7** | **kompaktowy licznik: `17.4 28 14%`**                                 | **wł.**   |
| **8** | bieżące zadanie: `fast_process 12 34.3/h 58% 21m 00s`                 | wył.      |

### Linia 7 dokładniej

Trzy człony oddzielone spacjami, bez jednostek, bez nawiasów, bez nazw działów:

- **pierwszy** — przedmiotów na godzinę, suma ze wszystkich liczonych kart;
- **drugi** — ile łącznie zrobiono, też ze wszystkich kart;
- **trzeci** — procent sprzedaży.

To dokładnie te same liczby, które linia 2 pokazuje po `=`, w ostatnim nawiasie
i na swoim końcu. Odświeżanie raz na sekundę.

Linia liczona jest w tym samym przebiegu co linia 2 — celowo. Dwa niezależne
liczenia tego samego prędzej czy później się rozjadą.

### Procent sprzedaży

Stoi na końcu linii 1, 2 i 7, zawsze jako liczba od 0 do 100 ze znakiem procentu.
Mówi, ile ze zrobionych przedmiotów pojechało na sprzedaż.

- **mianownikiem jest licznik przedmiotów pomniejszony o audyty**, a nie suma
  sprzedanych i niesprzedanych. Przedmiot, dla którego kod sortowania nie
  przyszedł, obniża więc procent, zamiast po cichu wypaść z rachunku —
  ale przedmiot oddany do audytu z rachunku **wypada** (patrz niżej);
- **liczba zrobionych paczek bywa większa niż mianownik procentu** i to jest
  poprawne, a nie błąd rachunku: audyty są w liczniku sztuk, ale nie
  w mianowniku procentu;
- **część ułamkowa jest odrzucana, a nie zaokrąglana**: 1 z 17 to `5%`
  (5,88…%), a nie `6%`. Procent ma nie obiecywać więcej, niż zrobiono;
- trzy niesprzedaże na początku zmiany dają `0%` — i tak ma być;
- linia 1 liczy **bieżącą kartę**, linie 2 i 7 — wszystkie karty wliczane
  do sumy globalnej;
- **działa przy wyłączonym module cen**: kierunek ustala się z tekstu strony,
  tak samo jak kod sortowania w linii 6, i nie wymaga ani jednego zapytania;
- **ręczna poprawka licznika** (skróty klawiszowe, pola w panelu) **nie
  przesuwa procentu**, bo kierunku takiej paczki nikt nie zna:
  - **dodanie** (od 1.3.1) wchodzi do liczby sztuk i równocześnie poza
    mianownik — procent nie drgnie wcale;
  - **odjęcie** (od 1.3.3) zdejmuje najpierw paczki spoza mianownika (wpisane
    ręcznie, audyty), a dopiero potem te z mianownika, zmniejszając sprzedane
    proporcjonalnie. `+1` i `−1` to para odwracalna co do sztuki; przy większym
    odjęciu procent zostaje z dokładnością do jednej paczki. Wcześniej `50`
    wpisane przy 100 paczkach i 60 sprzedażach dawało `100%`;
- żyje jedną zmianę i zeruje się razem z licznikami.

### Linia 6 dokładniej

Działa tylko przy włączonym module cen. Pokazuje trzy liczby w euro: ile
zarobiono na sprzedaży, ile poszło do utylizacji, różnicę. Kolory niosą treść:
plus zielony, minus czerwony, wynik pokolorowany według własnego znaku. `?N`
na końcu to przedmioty, dla których kod sortowania tak i nie przyszedł; nie idą
ani na plus, ani na minus.

Wybierak koloru dla linii 6 steruje wyłącznie częścią neutralną (liczbą sztuk).
Zieleń i czerwień nie są oddane do ustawień: po nich czyta się znak.

---

## Zadania

**Problem.** Tempo liczyło się od początku zmiany — godziny wpisanej na stałe
(6:30 albo 18:30). Kto przyszedł do procesu trzy godziny później i zrobił trzy
paczki w sześć minut, widział `1.0/h` zamiast `30/h`. Liczba policzona
poprawnie, znaczenie fałszywe — a to gorsze niż brak liczby, bo liczbie się
wierzy.

**Zadanie ma własny zegar.** Tempo zadania to jego paczki przez jego czas, więc
opóźniony start, przejście z procesu o normie 30/h do procesu o normie 100/h
i przerwa na rozmowę z kierownikiem przestają mieszać się w jedną średnią.

Po uruchomieniu skryptu istnieje jedno zadanie — `Default` — zaczynające się
razem ze zmianą. Dopóki nikt go nie przełączy, wszystko działa dokładnie tak,
jak przed 1.3.1.

**Czas przed startem zmiany nie liczy się nigdzie.** Skrypt zwykle uruchamia się
o 06:20 albo 18:20, a zmiana zaczyna się o 06:30 albo 18:30 — te dziesięć minut
nie wchodzi ani do tempa zmiany, ani do tempa żadnego zadania. Przedmiot
zrobiony w tym czasie liczy się normalnie jako paczka; nie liczy się tylko czas.

### Linia 8

Nazwa bieżącego zadania i **jego własne** liczby:

```
fast_process 12 34.3/h 58% 21m 00s
```

Nazwa, paczki, tempo, procent sprzedaży, przepracowany czas. Linie 1, 2 i 7
opisują całą zmianę i tak zostaje; linia 8 mówi o procesie, przy którym
człowiek siedzi w tej chwili. Domyślnie wyłączona, jak każda nowa linia.
Zatrzymany zegar dokleja na końcu `(pauza)` — inaczej stojące tempo wygląda jak
zepsuty licznik.

### Wznowienie zamiast drugiego zadania o tej samej nazwie

Zadanie ma **listę odcinków**, a nie jeden początek i koniec. Kto pracował trzy
godziny w procesie zwykłym, poszedł na pięć godzin do szybkiego i wrócił do
zwykłego — **wznawia** to pierwsze zadanie, z tym samym identyfikatorem.
W podsumowaniu zmiany stoi wtedy jedno zadanie z sensownym tempem, a nie trzy
wpisy 30 / 100 / 30, z których nic nie widać.

Odcinek jest też miejscem na pauzę: zamknięty odcinek zatrzymuje zegar,
a pierwsza paczka po pauzie otwiera nowy — skoro paczki idą, przerwa się
skończyła, niezależnie od tego, czy ktoś o tym pamiętał. Czas, którego nie było,
nie wraca: nowy odcinek zaczyna się od tej paczki, a nie wstecz.

Przerwa obiadowa odejmuje się od czasu zadania tym samym rachunkiem, co od czasu
zmiany — kto nie pamiętał o pauzie na obiad, nie dostaje pół godziny pracy,
której nie było.

### Powrót do pracy po awarii maszyny

Komputer stoi na sesji tymczasowej, więc po awaryjnym restarcie pamięć
przeglądarki znika w całości. Człowiek pamięta wtedy swoje tempo albo liczbę
paczek, ale **nie pamięta, ile z nich poszło na sprzedaż**.

Wpisana ręcznie liczba (pole licznika w panelu, skrót klawiszowy) trafia więc do
paczek **oraz** do licznika „poza mianownikiem” — tego samego, którym liczą się
audyty. Skutek: procent sprzedaży pokazuje wyłącznie to, co skrypt naprawdę
zobaczył, czyli liczy się **od przedmiotu, przy którym człowiek wrócił do
pracy**. Gdyby wpisane paczki wchodziły do mianownika, procent po każdej awarii
spadałby do kilku procent i przestałby cokolwiek znaczyć.

### Zasada, na której to stoi

**Suma paczek wszystkich zadań danej karty zawsze równa się licznikowi tej
karty.** Liczniki zmiany zostają jedynym źródłem prawdy dla linii 1, 2 i 7,
a zadania są ich rozbiciem w czasie. Rozjazd tych dwóch stron byłby cichy — obie
liczby wyglądałyby sensownie, tylko nie opisywałyby tego samego — więc pilnuje
go osobne sprawdzenie w testach.

### Działy a zadania

Dział to **karta T-REX**: skrypt rozpoznaje ją po adresie i pod jej kluczem
trzyma wszystkie liczniki. Zadanie **nie jest przypisane do działu** — trzyma
liczniki osobno dla każdego z nich, bo jeden proces pracy potrafi iść w dwóch
kartach naraz. Paczka trafia więc zawsze do pary _zadanie + dział_.

Działów jest cztery:

| Dział                   | Skąd się biorą paczki                |
| ----------------------- | ------------------------------------ |
| `CRET`, `REFURB`, `WHD` | z własnej karty T-REX, automatycznie |
| **`Inne`**              | **wyłącznie ręcznie, z panelu**      |

**`Inne`** (od 1.3.2) nie ma swojej karty, więc licznik nie zwiększy go nigdy
sam. Jest workiem na paczki robione poza trzema znanymi procesami: wcześniej nie
było ich gdzie zapisać, więc wpisywano je do cudzego działu albo przepadały,
a tempo zmiany kłamało w dół. W linii 2 pokazuje się dopiero wtedy, gdy ma
paczki.

**Dopisanie kolejnego działu** to jedna linia w `KNOWN_TAB_TYPES`
(`src/01-config.js`) plus nazwa w trzech słownikach — panel, linia 2 i menedżer
zadań chodzą po tej mapie, a nie po wpisanej gdzieś liście trzech kluczy.
Dział bez pola `urlKeyword` jest ręczny; kolejność w mapie jest kolejnością na
ekranie.

**Zmniejszanie liczby paczek** działa w obie strony: gdy przedmioty zostaną
wykluczone z dziennych wskaźników, wystarczy wpisać mniejszą liczbę w polu
działu albo zadania. Nadmiar schodzi od najnowszego zadania wstecz, a tempo
spada zgodnie z rachunkiem — pięć paczek przy dziesięciogodzinnej zmianie to
pół paczki na godzinę.

### W panelu ustawień

Sekcja **Zadania** stoi na samej górze panelu, razem z licznikami działów — to
jedyne miejsce otwierane _w trakcie_ pracy, reszta panelu to ustawienia, do
których przez całą zmianę się nie wraca.

| Co                       | Jak                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| przełączyć proces        | wpisać nazwę, „Nowe zadanie”                                                                          |
| wrócić do wcześniejszego | „Wznów” przy nim w historii zmiany                                                                    |
| poprawić początek        | `teraz` / `-2 min` / `-5 min` / `-15` / `-30` / `początek zmiany`, albo godzina wprost w polu `HH:MM` |
| zatrzymać zegar          | „Zatrzymaj zegar” (pierwsza paczka i tak go uruchomi)                                                 |
| wpisać liczby po awarii  | pole **Paczki** albo pole **Tempo**                                                                   |
| usunąć zadanie           | „Usuń” przy nim w historii, po potwierdzeniu; ostatniego zadania usunąć się nie da                    |

Skróty w minutach wstecz, a nie listy godzin i minut, biorą się z tego, jak to
wygląda na hali: o nowym procesie człowiek wie z wyprzedzeniem, zbiera narzędzia
i siada do skryptu kilka minut po faktycznym starcie. Godzina późniejsza niż
bieżąca znaczy „wczoraj” — na nocnej zmianie o 00:40 wpisane `23:30` to pół
godziny temu.

**Paczki i tempo to dwa pola opisujące to samo.** Kto pamięta „zrobiłem 259
paczek”, wpisuje paczki; kto pamięta „miałem jakieś 29,5”, wpisuje tempo —
drugie pole przelicza się samo. Po wpisaniu tempa panel pokazuje wartość
**osiągalną przy całych paczkach**, a nie wpisaną: przy 1:17 pracy „118” to 151
paczek, czyli naprawdę `117.7/h`. Obiecywanie `118` byłoby kłamstwem o jedną
paczkę.

**Usunięcie zadania zabiera jego paczki z licznika zmiany** — na wszystkich
kartach, także tych, które dopisały do niego coś przed chwilą. Tak musi być, bo
suma zadań ma się zgadzać z licznikiem zmiany; kto chce tylko przestać liczyć
proces, przełącza się na inne zadanie, a nie usuwa bieżące.

Historia zmiany to dwie linie na zadanie:

```
nocny · 18:32–20:30 (1g 58m)
80 · 40.5/h · 62%
```

### Z konsoli

```js
SH.tasks(); // podsumowanie wszystkich zadań zmiany
SH.TaskManager.create('fast_process', Date.now() - 2 * 60000); // nowe, zaczęte 2 minuty temu
SH.TaskManager.resume(id); // wznowienie wcześniejszego
SH.TaskManager.setStart(id, ms); // przestawienie początku CAŁEGO zadania
SH.TaskManager.pause(); // zatrzymanie zegara
SH.TaskManager.remove(id); // usunięcie razem z paczkami (patrz wyżej)
```

---

## Moduł cen

Wyłączony domyślnie. Dopóki jest wyłączony, skrypt **w ogóle nie wchodzi do sieci**.

Włącza się w panelu ustawień (sekcja „Moduł cen”) albo poleceniem `SH.priceOn()`.
Stan jest zapisywany i przeżywa przeładowanie strony.

### Co pojawia się po włączeniu

**Karta ceny** — cena towaru, który jest właśnie obsługiwany. Domyślnie to
**jedna szara, półprzezroczysta linijka z kwotą i nic więcej**: ten sam kolor,
ta sama przezroczystość i ten sam rozmiar, co linia 7, na przezroczystym tle,
bez ramki i bez cienia.

Wyłączone są więc na start: kod produktu, cena katalogowa, wiersz źródła i czas
zdobycia ceny. Każde z nich włącza się osobnym przełącznikiem w panelu.

Karta jest **w całości przezroczysta dla myszy** — kliknięcia dochodzą do
interfejsu T-REX. Kod produktu można zamienić w link do sklepu (prowadzi na ten
rynek, z którego wzięto cenę), ale domyślnie jest wyłączony: link to jedyne
miejsce karty, które łapie mysz i potrafi przykryć cudzy przycisk.

**Kolor tekstu jest jeden na całą kartę** i zmienia się pickerem razem
z przezroczystością, tak samo jak przy liniach okna statystyk. Krój pisma bierze
się z tej samej listy, co w oknie, a tło podnosi się suwakiem: przy wartości
powyżej zera wracają razem z nim ramka i cień.

Dwie rzeczy pokazują się **zawsze**, niezależnie od przełączników, bo ich brak
byłby cichym kłamstwem:

- **powód, dla którego ceny nie ma** — blokada CSP, wyczerpany limit, źródła bez
  wyniku. Karta z samą kreską jest nie do odróżnienia od zepsutego skryptu;
- **adnotacja, że cenę zdjęto z innego sklepu** niż wybrany. Bez niej suma zmiany
  niepostrzeżenie zmieszałaby waluty i witryny, a przy dwóch rynkach w euro nie
  widać tego nawet po samej kwocie.

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

Kody dzielą się na cztery rodziny:

| Rodzina                 | Kody                                                                                                               | Co znaczy dla procentu     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **sprzedaż**            | `CRITS-PRG2`, `CRITS-MXP6`, `CRITS-POZ1`, `CRITS-LEJ5`, `PL-Sellable`, `NS-PL-Sellable`                            | licznik ułamka i mianownik |
| **niesprzedaż**         | `Liquidation`, `FBA-DE-Unsellable`, `Remove`, `WHD`, `Stow-Unsellable`, `Refurb`, `External` — każdy także z `NS-` | tylko mianownik            |
| **nierozstrzygalne**    | `AUDIT`, `NS-AUDIT`                                                                                                | **poza procentem**         |
| **czeka na uściślenie** | `Secondary-Sorting`, `NS-Secondary-Sorting`                                                                        | zależnie od uściślenia     |

Trzy zasady wspólne dla wszystkich:

- **ogon kodu jest dowolny.** Na liście stoi początek, więc `External` łapie
  też `External-Repair`, a `AUDIT` — `Audit-cokolwiek`. Tak samo od dawna działa
  `FBATransfer-...`;
- **wielkość liter nie ma znaczenia** (`AUDIT`, `Audit-`, `audit` to jedno
  i to samo);
- **przedrostek `NS-` opisuje gabaryt („nie-sort”), a nie kierunek.**
  `NS-Stow-Unsellable` jedzie tam samo, co `Stow-Unsellable`. Wyjątkiem są kody
  magazynowe: zamiast czterech `NS-CRITS-*` jest jeden wspólny `NS-PL-Sellable`.

**Audyt nie jest kierunkiem.** Przedmiot idzie do audytora, a ten zdecyduje
w ciągu swojej zmiany — godziny po tym, jak przedmiot zniknął z ekranu.
Odpowiedź nie wróci na ten ekran nigdy, więc taki przedmiot wypada z mianownika
procentu: zrobionych paczek bywa przez to więcej niż paczek, z których liczy się
procent. Przedmiot, przy którym kod **w ogóle się nie pojawił**, w mianowniku
zostaje — bo to zwykle przedmiot, który gdzieś pojechał, tylko skrypt tego nie
zobaczył, a wyrzucanie takich podnosiłoby procent za każde przeoczenie programu.

`Secondary-Sorting` (i `NS-Secondary-Sorting`) sam z siebie niczego nie
rozstrzyga i czeka na linię uściślającą. Jeśli uściślenie nie przyszło do
początku następnego przedmiotu, przedmiot liczy się jako niesprzedaż. Zasada
jest niesymetryczna celowo: potwierdzenie sprzedaży przychodzi zawsze,
niesprzedaży — nie zawsze. Same linie uściślające są **bez** przedrostka `NS-`:
`Transfer - Sellable` i `FBATransfer` to status przedmiotu, a status jest ten
sam dla sortu i dla nie-sortu.

---

## Panel ustawień

Otwiera się po wpisaniu na stronie któregokolwiek z haseł — domyślnie
`GORDONPAULE` albo `BOMBA`. Lista jest jedna (nie ma hasła głównego i zapasowego)
i leży w pierwszych liniach pliku:

```js
const SETTINGS_ACCESS_PASSWORDS = ['GORDONPAULE', 'BOMBA'];
```

Można dopisywać kolejne. Wielkość liter nie ma znaczenia, białe znaki z brzegów
są obcinane, powtórzenia pomijane. Jedno ograniczenie: **hasło nie może być
początkiem innego hasła** — przy parze `BOM` i `BOMBA` krótsze zadziałałoby
wcześniej i wyczyściło bufor, więc dłuższego nie dałoby się wpisać nigdy. Pilnuje
tego test, więc taka lista zapali CI na czerwono.

| Sekcja                  | Co się ustawia                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Zadania**             | **bieżący proces pracy: nazwa, początek, paczki, tempo, pauza, historia zmiany — patrz rozdział „Zadania”**        |
| **Statystyki globalne** | **które działy wchodzą do sumy i ręczne wpisanie licznika każdego z nich**                                         |
| Ogólne                  | język (pl/en/ru), pełny reset danych, reset samych liczników                                                       |
| Pomoce wizualne         | kolorowa nakładka na stronę, duży napis z nazwą działu                                                             |
| Stylizacja okna         | tło okna, czcionka, **wszystkie osiem linii** (kolor, alfa, rozmiar), przeciąganie, reset pozycji                  |
| Skróty klawiszowe       | klawisze `+1` i `−1`                                                                                               |
| Auto-inkrementacja      | odstęp skanowania strony (50–200 ms)                                                                               |
| **Moduł cen**           | **główny wyłącznik sieci**                                                                                         |
| Karta ceny              | sklep, źródło ceny, co pokazać, klikalność kodu, kolor tekstu, krój, rozmiary, tło — _tylko przy włączonym module_ |
| Dziennik wartości       | czy prowadzić dziennik, podsumowania, kursy, eksport, czyszczenie — _tylko przy włączonym module_                  |
| Wybór przerwy           | który obiad jest wybrany (wpływa na liczenie godzin)                                                               |
| Kod ustawień            | kod bieżących ustawień, gotowa zakładka z nim i pole na cudzy kod — patrz niżej                                    |

Język interfejsu domyślnie polski, są też angielski i rosyjski.

---

## Kod ustawień

Ustawienia da się przenieść na inną maszynę jednym ciągiem: sekcja **Kod
ustawień** na dole panelu pokazuje coś w rodzaju

```
0x0101000101010103ff8800020e0201a4030001014c
```

Ten ciąg wystarczy podać komuś na czacie albo przepisać sobie na drugi komputer.
Kod niczego nie wykonuje i od 1.3.3 **nie włącza sieci**: numery, które
decydowały o tym, czy i dokąd skrypt wychodzi do internetu (wyłącznik modułu cen
i źródło ceny), są wycofane. Stary kod z nimi wczyta się normalnie, a te dwa
rekordy zostaną pominięte — moduł cen włącza się tylko ręką, w panelu.
Wkleja się go w to samo miejsce w panelu („Wklej tu kod” → „Nałóż kod”) albo
w konsoli:

```js
SH.config('0x0101000101010103ff8800020e0201a4030001014c'); // wielkość liter bez znaczenia
SH.configCode(); // kod bieżących ustawień
SH.configLink(); // gotowa zakładka z tym kodem w środku
```

Dla wygody działa też krótkie `config('0x…')`, bez `SH.` — ale tylko wtedy, gdy
strona nie ma własnego `window.config`: skrypt zajmuje tę nazwę wyłącznie, jeśli
jest wolna, i zwalnia ją przy rozbiórce. To jedyna nazwa poza `SH`, którą skrypt
kładzie na `window`; `SH.config(...)` działa zawsze.

### Zakładka, która sama stawia ustawienia

`SH.configLink()` (albo pole „Gotowa zakładka” w panelu) daje gotowy adres
dla **siebie** — na drugi komputer albo po wyczyszczeniu przeglądarki — który
od pierwszego kliknięcia stawia własny wygląd, bez przeklikiwania panelu.
Innej osobie wysyła się kod, a nie zakładkę (patrz ostrzeżenie w „Szybkim
starcie”).

```
javascript:(async()=>{try{window['statsHelper_v1_3_0_CONFIG_CODE']='0x0101…';const r=await fetch('https://raw.githubusercontent.com/…/counter/release/counter.js',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);eval(await r.text())}catch(e){alert('StatsHelper nie wystartował: '+e.message)}})();void 0;
```

Kolejność w tym adresie jest całym mechanizmem: **najpierw kod trafia do okna
przeglądarki, dopiero potem pobiera się plik.** Skrypt czyta tę zmienną
w `Main.init()`, zaraz po wczytaniu magazynu i przed pierwszym rysowaniem okna,
nakłada ustawienia i zmienną kasuje.

Prostsze „pobierz plik, a zaraz za nim wywołaj `SH.config('0x…')`” wygląda na to
samo i ma dwie dziury:

- na stronie, która jeszcze się wczytuje, `SH` w tym momencie **nie istnieje** —
  skrypt czeka na `DOMContentLoaded`, więc ustawienia przepadały w całości;
- nawet na gotowej stronie okno zdążyło się narysować wyglądem domyślnym
  i dopiero potem przeskakiwało na swój — widoczne mrugnięcie.

Kliknięcie zakładki na stronie, na której skrypt **już stoi**, nie stawia drugiego
egzemplarza (to byłby ten sam licznik liczony dwa razy), ale sam kod wchodzi —
do tego działającego egzemplarza. Czyli zmiana wyglądu bez przeładowania strony
i bez zerowania liczników.

Kod obejmuje **wszystko, co daje się ustawić**: położenie okna, osiem linii
(widoczność, kolor, przezroczystość, rozmiar pisma), kolory działów w linii 2,
nakładkę na stronę, całą kartę ceny razem z jej wyłącznikami i położeniem, język,
sklep, szerokość panelu, skróty klawiszowe i to, które działy wchodzą do sumy.
Nie obejmuje **danych**: liczników, dziennika wartości ani stanu zmiany. Kod
opisuje wygląd i zachowanie, a nie przepracowany dzień.

### Jak to jest zbudowane

Ciąg to zbiór **samoopisujących się rekordów**, jeden na ustawienie:

```
0x 01 | 0100 01 01 | 0101 03 ff8800 | 020e 02 01a4 | 0300 01 01 | 4c
   │    │    │  │                                                 │
   │    │    │  └ wartość: prawda (linia 1 widoczna)              │
   │    │    └ długość wartości w bajtach                         │
   │    └ numer ustawienia: widoczność linii 1                    │
   └ wersja formatu                              suma kontrolna ──┘
```

Pozostałe trzy rekordy tego przykładu czyta się tak samo: `0101 03 ff8800` to
kolor linii 1, `020e 02 01a4` — szerokość karty ceny (`0x01a4` = 420 pikseli),
`0300 01 01` — język (pozycja 1 na liście `pl / en / ru`, czyli angielski).

Trzy decyzje, na których to stoi:

1. **Rekord niesie własną długość.** Dzięki temu skrypt, który danego numeru
   jeszcze nie zna, potrafi go **przeskoczyć** i wczytać resztę. Stały układ
   bitów („ustawienie X siedzi na bicie 37”) tego nie umie: żeby wiedzieć, gdzie
   kończy się nieznane pole, trzeba by już je znać. To jest powód, dla którego
   dopisanie ustawienia w następnym wydaniu **nie unieważnia kodów**, które
   ludzie mają w kieszeniach — w obie strony: starszy skrypt zrozumie nowszy kod
   (pomijając to, czego i tak nie umie ustawić), a nowszy skrypt zrozumie stary.
2. **Numer jest przydzielany raz i nie wraca do obiegu.** Ustawienie usunięte ze
   skryptu znika z rejestru, ale jego numer zostaje spalony na zawsze. Inaczej
   kod sprzed roku ustawiłby dziś coś zupełnie innego — po cichu.
3. **Kod jest łatką, a nie zdjęciem konfiguracji.** Wchodzi do niego wyłącznie
   to, co różni się od wartości domyślnych, więc kto zmienił trzy rzeczy, ma trzy
   rekordy. Ważniejszy od długości ciągu jest jednak skutek: gdy w następnym
   wydaniu zmieni się domyślna wartość czegoś, czego ten człowiek nigdy nie
   ruszał, on tę nową wartość **dostanie**. Przy zdjęciu całej konfiguracji
   zostałby na zawsze przy starych domyślnych i nie miałby o tym pojęcia.

Rejestr numerów leży w jednym miejscu — `src/23-config-code.js`, tablica
`REGISTRY`. Dodanie ustawienia do kodu to jedna linia: numer, ścieżka w stanie
i typ. Numery są rozdane blokami (`0x0001` okno, `0x0100+` linie po `0x10` na
linię, `0x0200+` karta ceny, `0x0300+` ustawienia wspólne), żeby dopisywanie nie
wymagało szukania wolnego miejsca.

### Co robi kod przyjęty z zewnątrz

Kod przychodzi z czatu albo z cudzej zakładki, więc jest traktowany jak dane
z zewnątrz, a nie jak polecenie:

- zapis idzie **wyłącznie pod ścieżki z rejestru** — kodem nie da się utworzyć
  nowego pola ani nadpisać czegoś, czego w rejestrze nie ma;
- liczby są przycinane do granic z rejestru, kolory muszą mieć formę `#rrggbb`,
  pola wyboru przyjmują tylko indeks istniejący na liście, teksty tylko
  drukowalne ASCII;
- suma kontrolna na końcu łapie ciąg urwany przy kopiowaniu albo przekłamany;
- nieznany numer, zła długość i śmieciowa wartość są pomijane **pojedynczo**,
  z adnotacją w sprawozdaniu, zamiast wywracać cały kod;
- **w rejestrze nie ma nic, co włącza sieć** (od 1.3.3): wyłącznik modułu cen
  i źródło ceny są wycofane, bo kod krąży po czatach, a jego suma kontrolna
  niczego nie uwierzytelnia — każdy może go złożyć ręcznie.

Sprawozdanie wraca z `SH.config(...)`:

```js
{
  'kod przyjęty': true,
  'ustawień nałożonych': 4,
  'rekordów nieznanych (nowszy skrypt je zrozumie)': 0,
  'rekordów odrzuconych': 0
}
```

Nałożenie kodu od razu zapisuje stan, więc przeżywa `F5`. Kod **nie** jest
wykonywany ani interpretowany jako kod JavaScriptu — to ciąg cyfr, który
przechodzi przez ten sam rejestr, co panel ustawień.

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

// Zadania
SH.tasks(); // podsumowanie wszystkich zadań zmiany
SH.TaskManager.create('fast', Date.now() - 2 * 60000); // nowe, zaczęte 2 minuty temu
SH.TaskManager.resume(id); // wznowienie wcześniejszego
SH.TaskManager.setStart(id, ms); // przestawienie początku CAŁEGO zadania
SH.TaskManager.pause(); // zatrzymanie zegara
SH.TaskManager.remove(id); // usunięcie razem z paczkami (patrz wyżej)

// Kod ustawień
SH.configCode(); // kod bieżących ustawień
SH.configLink(); // gotowa zakładka z tym kodem
SH.config('0x01…'); // nałożyć kod i zapisać

// Wnętrzności
SH.store; // cały stan
SH.CONFIG; // wszystkie stałe
SH.Main.teardown(); // poprawnie zdjąć skrypt ze strony
```

Zmiany w `SH.store` działają od razu. Ustawienia (`userConfig`, `sessionConfig`,
`localTabConfig`) zapisują się same po sekundzie — tak samo jak z panelu.
Liczniki (`tabCounters`, `tabSold`, `tabNeutral`, `taskCounters`) wpisane
z konsoli **nie** zapisują się same: do poprawiania liczb służą pola w panelu
i skróty klawiszowe, które pilnują też zgodności z zadaniami.

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

**Dwie karty zmieniające coś naraz** (od 1.3.3). Przeglądarka doręcza zdarzenie
`storage` z opóźnieniem, więc dwie karty potrafią zapisać coś, zanim dowiedzą
się o sobie nawzajem. Dlatego:

- **ustawienia wspólne** (język, rynek, skróty, stan zmiany) zapisują się jako
  zmiany od ostatniej synchronizacji, na wierzchu tego, co leży w magazynie —
  zmiany dwóch różnych ustawień w dwóch kartach obie zostają, a świeża zmiana
  nie cofa się sama po zapisie sąsiedniej karty;
- **lista zadań** scala się po zadaniach: nowsza wersja zadania wygrywa, zadanie
  usunięte nie wraca, przełączenie aktywnego zadania — ostatnie wygrywa;
- **liczniki** rosną od wartości w magazynie, a nie w pamięci karty — dwie karty
  tego samego działu mogą pracować naraz i żadna paczka nie ginie;
- **usunięcie zadania** zdejmuje z liczników kart także paczki, które sąsiednia
  karta zapisała przed chwilą.

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

**Dane żyją jedną zmianę.** Na zdecydowanej większości stanowisk to działa
samo: sesja wirtualna znika razem z `localStorage`. Na maszynach, gdzie sesja
przeglądarki nie jest resetowana między zmianami, skrypt rozpoznaje to na dwa
sposoby: po wieku zapisanego startu (starszy niż 12 h — dane są cudze) i po
niezgodności czasu startu (dzienna zaczęła się o 06:30, a o 18:21 do tego samego
komputera usiadła nocna — różnica 11 h 51 min, próg 12 h jej nie złapie,
a porównanie startów tak).

Następna zmiana zaczyna się od zera tak, jakby skrypt uruchamiano pierwszy raz:
liczniki, zadania i początek zmiany znikają, **własne ustawienia zostają**
(położenie okna, kolory, włączone linie).

- **Karta otwarta przez noc** zauważa nową zmianę sama: skrypt sprawdza zmianę
  co 30 sekund przez cały czas działania, a nie tylko do pierwszego
  rozpoznania. W trakcie tej samej zmiany (także po północy) i w martwej strefie
  to sprawdzenie niczego nie zeruje.
- **Październikowa noc zmiany czasu** trwa 12,42 h zegara (18:30 CEST → 05:55
  CET). Dane nie są uznawane za przeterminowane, dopóki zegar ścienny wskazuje
  tę samą zmianę — F5 o 05:35 nie kasuje nocy.

Przy resecie pokazuje się powiadomienie: człowiek musi widzieć, że wyzerowanie
nastąpiło celowo.

---

## Bezpieczeństwo

Skrypt działa na cudzej stronie i czyta dane z trzech źródeł, których nie
kontroluje: `localStorage` domeny (wspólny z samym T-REX), tekst i DOM strony,
odpowiedzi zewnętrznych serwisów. Dlatego:

| Zabezpieczenie                                                               | Gdzie                    |
| ---------------------------------------------------------------------------- | ------------------------ |
| Żadnego parsowania HTML: cały tekst przez `createTextNode`                   | generator DOM `h()`      |
| `innerHTML` tylko do czyszczenia (`= ''`), nigdy z treścią                   | sprawdzane testem        |
| Ani `eval`, ani `new Function`, ani `document.write`                         | sprawdzane testem        |
| Kod ustawień zapisuje tylko pod ścieżki z rejestru, z przycięciem            | `ConfigCode.decode`      |
| Kod ustawień nie włącza sieci — takie numery są wycofane                     | `ConfigCode.RETIRED_IDS` |
| Ochrona przed prototype pollution (`__proto__`, `constructor`)               | `Utils.deepMerge`        |
| Liczby z konfiguracji są zaciskane do zakresu, zanim trafią do CSS           | `Utils.clampNum`         |
| Kolory sprawdzane zakotwiczonym wyrażeniem, inaczej — szary                  | `Utils.hexToRgb`         |
| ASIN sprawdzany po `^[A-Z0-9]{10}$` przed wyjściem do sieci                  | `KeepaOCR.url`           |
| Host linku wyłącznie z białej listy, schemat wszyty na stałe                 | `productUrl`             |
| Kody sortowania są ekranowane przed złożeniem wyrażenia                      | `Routing.codeRegex`      |
| Kursy walut sprawdzane pod kątem sensu, także przy odczycie z pamięci        | `FxRates.normalize`      |
| Skrypt rusza wyłącznie własne klucze `localStorage`                          | `StorageManager.ownKeys` |
| Każde wyjście do sieci spisane w teście: za `priceModuleOn()` albo z powodem | `priceModuleOn()`        |

> Poza komentarzami słowo `eval` pada w pliku dokładnie raz: wewnątrz **tekstu** gotowej zakładki,
> którą zwraca `SH.configLink()`. Skrypt tego nie wykonuje — wypisuje adres do
> skopiowania, a wykonuje go przeglądarka, gdy człowiek sam kliknie swoją
> zakładkę. Test pilnuje, że wystąpienie jest jedno i że siedzi właśnie tam.

Wszystkie punkty są pokryte testami automatycznymi (`npm test`, pliki
`01-silence`, `06-injection`, `07-pollution`, `09-artifact`,
`18-passwords` i `29-supply-chain`).

---

## Budowa repozytorium

```
counter/                    ← korzeń repozytorium
├── counter.js              ← ARTEFAKT: to, co wkleja się do konsoli
├── src/                    ← ŹRÓDŁO: 25 modułów plus nagłówek i stopka
│   ├── 00-banner.js
│   ├── 01-config.js  …  25-presets.js
│   ├── 99-footer.js
│   └── README.md           ← mapa modułów i zasady zależności
├── docs/przeplyw.md        ← cztery diagramy: co się dzieje i w jakiej kolejności
├── build.js                ← narzędzie budujące: src/ → counter.js
├── build.manifest.json     ← kolejność modułów = mapa projektu
├── tests/                  ← 31 plików, 432 sprawdzenia
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
npm test             # 432 sprawdzenia
npm run verify       # build:check + test  (to, co goni CI)
npm run lint         # ESLint (potrzebny npm ci)
npm run format       # Prettier (potrzebny npm ci)
```

`npm test` i `npm run build` działają **bez żadnej instalacji** — nie ma ani jednej
zależności produkcyjnej. Linter i formatter wymagają `npm ci` (plik blokady leży
w repozytorium) oraz Node 20.19+, ale bez nich nic się nie psuje.

Szczegółowo o tym, jak dodać moduł, jakie są zasady i jak wygląda przepływ gałęzi
oraz PR — w [CONTRIBUTING.md](CONTRIBUTING.md).

**Co się dzieje i w jakiej kolejności** — cztery diagramy w
[docs/przeplyw.md](docs/przeplyw.md): życie przedmiotu od mutacji DOM do wpisu
w dzienniku, pięć źródeł zmian w licznikach, wszystkie bramki na drodze do sieci
oraz kolejność kroków przy uruchomieniu. Pod każdym diagramem stoi lista miejsc,
w których to się psuje, i testów, które tego pilnują.

---

## Wersjonowanie

[SemVer](https://semver.org/lang/pl/), a dla tego projektu czyta się go tak:

|           | Kiedy podnosić                     | Co to znaczy dla człowieka                                                      |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| **MAJOR** | zmienia się `SCRIPT_ID_PREFIX`     | liczniki i ustawienia **nie przenoszą się**, aktualizować tylko między zmianami |
| **MINOR** | nowa możliwość, dane zgodne wstecz | można aktualizować w dowolnej chwili                                            |
| **PATCH** | naprawa bez nowych pól             | można aktualizować w dowolnej chwili                                            |

Prefiks magazynu koduje **schemat danych**, a nie numer buildu: kolejne wydania
zostają przy tym samym prefiksie, dopóki nie zmieni się skład zapisywanych pól.
Obecnie jest to `statsHelper_v1_3_0_` — podniesiony w 1.3.1 razem z menedżerem
zadań, bo doszły nowe klucze, a starego schematu nie używał jeszcze nikt poza
wydaniem stabilnym pod osobnym adresem. Była to świadoma, jednorazowa decyzja
autora zamiast zmiany MAJOR: szczegóły w CHANGELOG, w sekcji 1.3.1.

---

## Wydania

Ludzie uruchamiają skrypt z **wydania**, a nie z gałęzi `main`, więc dopóki nie
ma wydania, zakładka nie ma czego pobrać. Wydanie powstaje z **tagu** — i tylko
z tagu.

Cały przebieg da się wyklikać w przeglądarce; konsola nie jest do niczego
potrzebna.

### 1. Commit wydania (w PR, jak każda inna zmiana)

Podnosi `package.json`, przebudowuje artefakt i zamyka sekcję w CHANGELOG:
`## Niewydane` → `## X.Y.Z — RRRR-MM-DD`. Trzy rzeczy muszą się zgadzać, bo
sprawdza je workflow: wersja w `package.json`, `SCRIPT_VERSION` w artefakcie
i nagłówek `@version` w bloku `==UserScript==`. Artefakt składa się poleceniem
`npm run build`, które bierze numer prosto z `package.json` — ręcznie nie wpisuje
się go nigdzie.

### 2. Tag i wydanie — z interfejsu GitHuba

**Releases** (prawa kolumna strony repozytorium) → **Draft a new release**:

| Pole          | Co wpisać                                                         |
| ------------- | ----------------------------------------------------------------- |
| Choose a tag  | `vX.Y.Z` — dokładnie ta wersja, co w `package.json`, z literą `v` |
|               | poniżej pojawi się **Create new tag: vX.Y.Z on publish** — wybrać |
| Target        | `main`                                                            |
| Release title | `vX.Y.Z` (i tak zostanie nadpisany przez workflow)                |
| Opis          | zostawić pusty — wjedzie sekcja z CHANGELOG                       |

**Publish release**. Tag powstaje w chwili publikacji i to on uruchamia resztę.

### 3. Co robi się samo

Workflow [`release.yml`](.github/workflows/release.yml) po pojawieniu się tagu
`v*.*.*`:

1. przepuszcza te same bramki, co przy PR (`build:check`, `npm test`) — wydanie
   z czerwonych testów nie powstanie;
2. sprawdza, że tag, `package.json` i artefakt mówią o tej samej wersji;
3. liczy `SHA-256` artefaktu i dokłada go jako plik i jako fragment opisu;
4. wyciąga z CHANGELOG sekcję tej wersji i robi z niej treść wydania;
5. podpisuje **poświadczenie pochodzenia** (`attest-build-provenance`): sprawdzalne
   stwierdzenie „ten plik powstał w tym przebiegu, z tego commita”;
6. dołącza `counter.js` i `counter.js.sha256` do wydania;
7. przesuwa gałąź **`release`** na commit tego tagu — to spod niej pobiera
   zakładka (patrz „Szybki start”). Gałąź przesuwa się tylko wtedy, gdy wydawany
   tag jest najnowszy, więc powtórzenie przebiegu dla starego tagu nie cofnie
   ludziom skryptu.

Po minucie–dwóch zakładki wszystkich ludzi (te bez przypięcia do wersji) pobierają
nowy plik przy następnym kliknięciu — `raw.` trzyma odpowiedź 5 minut, więc tyle
wynosi opóźnienie w najgorszym razie. Przebieg widać w zakładce **Actions**.

### Gdy przebieg padnie

Wydanie zostaje, ale bez pliku. Poprawić przyczynę, a potem **Actions** →
workflow **Release** → **Run workflow** → w polu `tag` wpisać `vX.Y.Z`. Przebieg
powtórzy się dla istniejącego tagu i uzupełni wydanie. Tego samego tagu nie
przestawia się na inny commit: kto zdążył pobrać plik, ma wtedy co innego niż
ten, kto pobierze go za chwilę. Wersja jest tania — lepiej wydać `X.Y.Z+1`.

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

**Na górze ekranu: „Pamięć przeglądarki jest pełna”.**
`localStorage` tej domeny dzielimy z samym T-REX i jego kwota potrafi się
skończyć. Licznik liczy dalej w pamięci i liczby na ekranie są poprawne, ale
przeładowanie strony (F5) cofnie je do ostatniego udanego zapisu. Powiadomienie
pokazuje się raz na stronę, przy pierwszej odmowie zapisu. To jedyny przypadek,
w którym skrypt odzywa się sam: cicha utrata liczników byłaby gorsza.

**Trzeba wrócić do ustawień fabrycznych.**
Panel ustawień → „Zresetuj Wszystkie Dane”. Usuwane są wyłącznie klucze skryptu,
danych samego T-REX to nie rusza.

---

## Licencja

[MIT](LICENSE)
