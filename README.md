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
- [Kod ustawień](#kod-ustawień)
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

### Zakładka w przeglądarce (zalecane)

Tam, gdzie konsola jest zamknięta, a i tak wygodniej. Nowa zakładka, dowolna
nazwa, a jako adres:

```
javascript:(async()=>{const r=await fetch('https://github.com/YafremauAliaksei/counter/releases/latest/download/counter.js',{cache:'no-store'});eval(await r.text());})();void 0;
```

Kliknięcie na stronie T-REX pobiera i uruchamia **ostatnie wydanie**.

Trzy szczegóły w tym adresie nie są przypadkowe:

- **`releases/latest/download`, a nie `raw.githubusercontent`.** Wskazuje na
  wydanie, a nie na bieżący stan gałęzi: to, co ludzie uruchamiają, zmienia się
  wtedy i tylko wtedy, gdy ktoś świadomie wyda nową wersję. Do tego `raw.` bywa
  podawany z pamięci podręcznej, przez co połowa zespołu pracuje na starym pliku
  i nikt nie wie dlaczego;
- **`cache:'no-store'`** — z tego samego powodu, tylko po stronie przeglądarki;
- **`void 0` na końcu** — bez tego zakładka, której wyrażenie zwraca tekst,
  potrafi zastąpić nim całą stronę.

Żeby przypiąć się do konkretnej wersji i nie dostawać następnych automatycznie,
zamienić `latest/download` na `download/v1.1.0`.

### Wklejenie do konsoli

1. Otworzyć roboczą stronę T-REX.
2. `F12` → zakładka Console.
3. Wkleić całą zawartość [ostatniego wydania](https://github.com/YafremauAliaksei/counter/releases/latest),
   nacisnąć Enter.

W obu przypadkach w lewym dolnym rogu pojawią się dwie liczby i procent. Nic
więcej robić nie trzeba.

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
`poniżej` (albo `Transparency`) podnosi flagę „zaczął się przedmiot”; pojawienie
się `Przypisz nowy` przy podniesionej fladze daje `+1`. Przerwany przedmiot,
przy którym nie doszło do finalnej linii, nie jest zaliczany — dokładnie tak
samo, jak nie zalicza go sam system.

---

## Linie okna statystyk

W oknie jest siedem niezależnych linii. Każda włącza się osobno, każda ma własny
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

- **mianownikiem jest licznik przedmiotów**, a nie suma sprzedanych
  i niesprzedanych. Przedmiot, dla którego kod sortowania nie przyszedł, obniża
  więc procent, zamiast po cichu wypaść z rachunku;
- **część ułamkowa jest odrzucana, a nie zaokrąglana**: 1 z 17 to `5%`
  (5,88…%), a nie `6%`. Procent ma nie obiecywać więcej, niż zrobiono;
- trzy niesprzedaże na początku zmiany dają `0%` — i tak ma być;
- linia 1 liczy **bieżącą kartę**, linie 2 i 7 — wszystkie karty wliczane
  do sumy globalnej;
- **działa przy wyłączonym module cen**: kierunek ustala się z tekstu strony,
  tak samo jak kod sortowania w linii 6, i nie wymaga ani jednego zapytania;
- ręczna poprawka licznika (skróty klawiszowe, przyciski) zmienia tylko
  mianownik — poprawia się zwykle to, czego program nie zobaczył, a kierunku
  takiego przedmiotu nikt nie zna;
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

Przypadek szczególny to `Secondary-Sorting`: sam z siebie niczego nie rozstrzyga
i czeka na linię uściślającą. Jeśli uściślenie nie przyszło do początku następnego
przedmiotu, przedmiot liczy się jako niesprzedaż. Zasada jest niesymetryczna
celowo: potwierdzenie sprzedaży przychodzi zawsze, niesprzedaży — nie zawsze.

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

| Sekcja              | Co się ustawia                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Ogólne              | język (pl/en/ru), pełny reset danych, reset samych liczników                                                       |
| Pomoce wizualne     | kolorowa nakładka na stronę, duży napis z nazwą działu                                                             |
| Stylizacja okna     | tło okna, czcionka, **wszystkie siedem linii** (kolor, alfa, rozmiar), przeciąganie, reset pozycji                 |
| Statystyki globalne | które działy wchodzą do sumy, ręczna poprawka liczników                                                            |
| Skróty klawiszowe   | klawisze `+1` i `−1`                                                                                               |
| Auto-inkrementacja  | odstęp skanowania strony (50–200 ms)                                                                               |
| **Moduł cen**       | **główny wyłącznik sieci**                                                                                         |
| Karta ceny          | sklep, źródło ceny, co pokazać, klikalność kodu, kolor tekstu, krój, rozmiary, tło — _tylko przy włączonym module_ |
| Dziennik wartości   | czy prowadzić dziennik, podsumowania, kursy, eksport, czyszczenie — _tylko przy włączonym module_                  |
| Wybór przerwy       | który obiad jest wybrany (wpływa na liczenie godzin)                                                               |
| Kod ustawień        | kod bieżących ustawień, gotowa zakładka z nim i pole na cudzy kod — patrz niżej                                    |

Język interfejsu domyślnie polski, są też angielski i rosyjski.

---

## Kod ustawień

Ustawienia da się przenieść na inną maszynę jednym ciągiem: sekcja **Kod
ustawień** na dole panelu pokazuje coś w rodzaju

```
0x0101000101010103ff8800020e0201a4030001014c
```

Ten ciąg wystarczy podać komuś na czacie albo przepisać sobie na drugi komputer.
Wkleja się go w to samo miejsce w panelu („Wklej tu kod” → „Nałóż kod”) albo
w konsoli:

```js
SH.config('0x0101000101010103ff8800...'); // wielkość liter bez znaczenia
SH.configCode(); // kod bieżących ustawień
SH.configLink(); // gotowa zakładka z tym kodem w środku
```

### Zakładka, która sama stawia ustawienia

`SH.configLink()` (albo pole „Gotowa zakładka” w panelu) daje gotowy adres:
nowy człowiek wkleja go raz do zakładek i od pierwszego kliknięcia ma cudzy
wygląd, bez przeklikiwania panelu.

```
javascript:(async()=>{window['statsHelper_v1_0_0_CONFIG_CODE']='0x0101…';const r=await fetch('…/releases/latest/download/counter.js',{cache:'no-store'});eval(await r.text());})();void 0;
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

Kod obejmuje **wszystko, co daje się ustawić**: położenie okna, siedem linii
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
  z adnotacją w sprawozdaniu, zamiast wywracać cały kod.

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

// Kod ustawień
SH.configCode(); // kod bieżących ustawień
SH.configLink(); // gotowa zakładka z tym kodem
SH.config('0x01…'); // nałożyć kod i zapisać

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
| Kod ustawień zapisuje tylko pod ścieżki z rejestru, z przycięciem     | `ConfigCode.decode`      |
| Ochrona przed prototype pollution (`__proto__`, `constructor`)        | `Utils.deepMerge`        |
| Liczby z konfiguracji są zaciskane do zakresu, zanim trafią do CSS    | `Utils.clampNum`         |
| Kolory sprawdzane zakotwiczonym wyrażeniem, inaczej — szary           | `Utils.hexToRgb`         |
| ASIN sprawdzany po `^[A-Z0-9]{10}$` przed wyjściem do sieci           | `KeepaOCR.url`           |
| Host linku wyłącznie z białej listy, schemat wszyty na stałe          | `productUrl`             |
| Kody sortowania są ekranowane przed złożeniem wyrażenia               | `Routing.codeRegex`      |
| Kursy walut sprawdzane pod kątem sensu, także przy odczycie z pamięci | `FxRates.normalize`      |
| Skrypt rusza wyłącznie własne klucze `localStorage`                   | `StorageManager.ownKeys` |
| Pięć niezależnych sprawdzeń przed każdym wyjściem do sieci            | `priceModuleOn()`        |

> Słowo `eval` pada w pliku dokładnie raz: wewnątrz **tekstu** gotowej zakładki,
> którą zwraca `SH.configLink()`. Skrypt tego nie wykonuje — wypisuje adres do
> skopiowania, a wykonuje go przeglądarka, gdy człowiek sam kliknie swoją
> zakładkę. Test pilnuje, że wystąpienie jest jedno i że siedzi właśnie tam.

Wszystkie punkty są pokryte testami automatycznymi. `npm test` — 246 sprawdzeń,
z czego jedna trzecia dotyczy bezpieczeństwa.

---

## Budowa repozytorium

```
production/
├── counter.js              ← ARTEFAKT: to, co wkleja się do konsoli
├── src/                    ← ŹRÓDŁO: 25 modułów, tu poprawia się kod
│   ├── 00-banner.js
│   ├── 01-config.js  …  24-presets.js
│   ├── 99-footer.js
│   └── README.md           ← mapa modułów i zasady zależności
├── build.js                ← narzędzie budujące: src/ → counter.js
├── build.manifest.json     ← kolejność modułów = mapa projektu
├── tests/                  ← 20 plików, 246 sprawdzeń
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
npm test             # 246 sprawdzeń
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
