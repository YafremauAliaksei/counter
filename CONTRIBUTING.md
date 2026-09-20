# Jak wprowadzać zmiany

Dokument opisuje trzy rzeczy: budowę źródeł, zasady pracy z gałęziami oraz to,
które bramki muszą być zielone przed scaleniem.

---

## 1. Złota zasada

**`counter.js` to artefakt. Ręcznie się go nie poprawia.**

Powstaje ze `src/` poleceniem `npm run build`. Jeśli poprawić go wprost,
następne budowanie po cichu zamaże poprawkę, a CI odrzuci PR jeszcze wcześniej —
jest osobne sprawdzenie „artefakt równa się przebudowie”.

Poprawiasz `src/`, potem `npm run build`, potem commitujesz **i źródło,
i artefakt**.

> Dlaczego artefakt w ogóle leży w gicie: skrypt wkleja się do konsoli, kopiując
> plik z bezpośredniego linku z GitHuba. Gdyby `counter.js` powstawał wyłącznie
> przy wydaniu, człowiek musiałby albo instalować Node, albo czekać na wydanie
> dla jednolinijkowej poprawki. Tak robią wszystkie projekty userscriptowe.

---

## 2. Budowa źródeł

### Jak robią to duże biblioteki

Rozdział „źródło ≠ artefakt” nie jest naszym wymysłem:

| Projekt    | Źródło                            | Narzędzie budujące         | Artefakt                        |
| ---------- | --------------------------------- | -------------------------- | ------------------------------- |
| lodash     | ~300 plików, po funkcji na plik   | rollup                     | `lodash.js`                     |
| React      | `packages/*/src/`                 | rollup                     | `react.production.min.js`       |
| TypeScript | `src/compiler/*.ts`, setki plików | sam `tsc`                  | `lib/typescript.js`, jeden plik |
| Node.js    | `lib/*.js` + C++                  | `js2c` wszywa JS w binarkę | `node`                          |

U nas jest tak samo, tylko narzędzie budujące jest własne i ma sto linii —
bo potrzebujemy dokładnie jednego formatu wyjścia i zera zależności.

### Nasza struktura

```
src/
  00-banner.js       nagłówek ==UserScript==, hasło, wyłącznik logów
  01-config.js       stałe i wartości domyślne
  ...
  23-config-code.js  kod ustawień: ciąg szesnastkowy zamiast panelu
  24-tasks.js        menedżer zadań: zegar i liczniki procesu pracy
  25-presets.js      blok ustawień osobistych i start
  99-footer.js       zakomentowana ściąga po ustawieniach
```

Wszystko skleja się **w jeden wspólny scope** (jedna IIFE), w kolejności
zadeklarowanej w [`build.manifest.json`](build.manifest.json). Manifest jest
zarazem mapą projektu: każdy moduł ma tam opis w jednym zdaniu.

### Zasady modułów

**Zasada jednego zdania.** Opis modułu w manifeście nie powinien zawierać
spójnika „i”. Jeśli zawiera — moduł robi dwie rzeczy i trzeba go rozdzielić.

**Zależności idą w dół.** Moduł może korzystać _w momencie deklaracji_ tylko
z tego, co zadeklarowano wyżej na liście. Wywołania w momencie **wykonania**
(metody, procedury obsługi) mogą iść w dowolną stronę — do chwili uruchomienia
zadeklarowane jest już wszystko. Praktycznie:

```js
// WOLNO: moduł 10 woła ValueLog z modułu 16 wewnątrz metody
renderContent() { const vt = ValueLog.totals(); }

// NIE WOLNO: moduł 10 czyta ValueLog w momencie deklaracji
const cached = ValueLog.totals();   // ReferenceError przy ładowaniu
```

**Nazwy są globalne.** Wspólny scope oznacza, że dwa moduły nie mogą
zadeklarować `const` o tej samej nazwie. To cena za jeden plik na wyjściu;
w praktyce wystarczy nie wymyślać drugiego `Utils`.

**Nowy moduł:**

1. utworzyć `src/NN-nazwa.js` (numer = miejsce w kolejności budowania);
2. wpisać do `build.manifest.json` wraz z opisem;
3. `npm run build`;
4. `npm test` — jest sprawdzenie, że w `src/` nie ma plików spoza manifestu,
   więc zapomnieć o kroku 2 się nie da.

### Język

| Co                                                                 | Język                                      |
| ------------------------------------------------------------------ | ------------------------------------------ |
| Komentarze w kodzie                                                | **polski**                                 |
| Komunikaty logów, teksty wyjątków, klucze obiektów diagnostycznych | **polski**                                 |
| README, CHANGELOG, ten plik, pozostała dokumentacja                | **polski**                                 |
| Lokalizacja `LANG_STRINGS.ru` i `Русский` na liście języków        | rosyjski, nie ruszać                       |
| Wyzwalacze z cyrylicą (`видите ниже`, `канирование номера LP`)     | nie ruszać — to tekst, który drukuje T-REX |
| **Nazwy w kodzie**: zmienne, funkcje, pola, klucze                 | **angielski**                              |
| Nazwy plików, commity, nazwy gałęzi                                | angielski                                  |
| Rozmowa z autorem projektu                                         | rosyjski                                   |

Sprawdzane testami: cyrylica w komentarzach, w `Utils.log/error/fatal`
i w `new Error(...)` wywraca budowanie. Osobny test pilnuje, żeby cyrylica
nie wróciła do plików dokumentacji.

Angielski może kiedyś dojść jako drugi język dokumentacji — ale dopiero świadomą
decyzją i razem ze zmianą testu, nie przypadkiem w pojedynczym PR.

### Dlaczego nazwy w kodzie są angielskie, a komentarze polskie

To nie jest niekonsekwencja, tylko podział ról.

**Nazwa jest częścią mechanizmu.** Czyta ją każdy, kto kiedykolwiek otworzy ten
plik — także ktoś, kto polskiego nie zna. `_passwordsByLastChar` mówi, co robi,
w dowolnym kraju; `_hasłaPoOstatnim` wymaga tłumacza, a do tego wnosi znaki
diakrytyczne do identyfikatorów, na których potrafią się wyłożyć narzędzia.

**Komentarz jest wyjaśnieniem.** Czyta go zespół, a zespół jest polskojęzyczny.
Tu polski jest szybszy i dokładniejszy — i to w komentarzach siedzi najcenniejsza
część tego repozytorium: powody decyzji i rozebrane błędy.

Praktycznie: jeśli to stoi po lewej stronie znaku `=`, po słowie `function` albo
w kluczu obiektu — angielski. Jeśli to zdanie dla człowieka — polski. Dotyczy to
także **testów**: `type()` i `closePanel()`, a nie `wpisz()` i `zamknijPanel()`.
Nagłówki testów i teksty asercji zostają polskie, bo to są zdania dla człowieka.

---

## 3. Przepływ pracy

```
main ─────●────────────────●──── tag v1.1.0
           \              /
            ●──●──●──────●   feat/short-name
```

1. `git switch -c feat/short-name` — od `main`, nigdy nie commitować prosto do `main`.
2. Poprawki w `src/`, obowiązkowo test na nowe zachowanie.
3. `npm run verify` lokalnie.
4. `git push -u origin feat/short-name` → Pull Request.
5. CI przepuszcza bramki; dopóki są czerwone, scalanie jest zablokowane.
6. Squash merge do `main`.
7. Wydanie: osobny commit `chore(release): X.Y.Z` (podniesiony `package.json`
   i przebudowany artefakt), a potem tag `vX.Y.Z` — z konsoli albo wprost
   z interfejsu GitHuba. Krok po kroku: rozdział **Wydania** w README.

### Nagłówki commitów

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat: linia 8 z procentem braków
fix: cena od 1000 czytana z utratą najstarszej cyfry
docs: opis modułu cen w README
refactor: wynieść generowanie CSS do osobnego modułu
test: pokryć przeglądanie sklepów
chore: zaktualizować eslint
```

Treść commita mówi **dlaczego**, a nie „co”. „Co” widać w diffie.

### Nazwy gałęzi: JEDEN PROBLEM — JEDNA GAŁĄŹ

Gałąź nazywa się od problemu, który rozwiązuje, a nie od tego, kto albo co ją
założyło. Nazwa `claude/intelligent-bardeen-j4wmrf` nie mówi nic — po pół roku
nikt nie odtworzy z niej, czego dotyczyła poprawka.

```
<typ>/<problem-po-angielsku-przez-myslniki>

fix/storage-write-survives-failure
perf/skip-hidden-stats-lines
test/price-boundary-values
docs/testing-and-branch-rules
```

Typ jest ten sam, co w nagłówku commita (`feat`, `fix`, `perf`, `docs`, `test`,
`refactor`, `chore`).

**Jeden problem — jedna gałąź i jeden PR.** Dwie niezwiązane poprawki w jednej
gałęzi znaczą, że nie da się wycofać jednej z nich, nie ruszając drugiej,
a historia `main` przestaje odpowiadać na pytanie „kiedy to się zepsuło”.
Jeśli w trakcie pracy znajdzie się drugi problem — notatka i osobna gałąź,
a nie „skoro już tu jestem”.

Konsekwencja techniczna, o której trzeba pamiętać: każda gałąź niosąca zmianę
w `src/` przebudowuje `counter.js`, więc dwie równoległe gałęzie **zawsze**
konfliktują na artefakcie. Po scaleniu pierwszej w drugiej robi się merge `main`,
`npm run build` i dopiero potem push — bramka `build:check` i tak tego pilnuje.

### Przebieg sprawdzeń zapisuje się w PR

Do opisu każdego PR wkleja się wynik `npm run verify` (linia podsumowania
wystarczy), a przy poprawkach wydajnościowych — pomiar sprzed i po zmianie.
Po to, żeby z samej historii było widać, że gałąź była sprawdzona, i czym
dokładnie.

---

## 4. Bramki, które muszą być zielone

| Bramka    | Polecenie              | Co łapie                                                    |
| --------- | ---------------------- | ----------------------------------------------------------- |
| Budowanie | `npm run build:check`  | artefakt rozjechał się ze źródłami                          |
| Testy     | `npm test`             | 303 sprawdzenia: zachowanie, bezpieczeństwo, skan statyczny |
| Linter    | `npm run lint`         | literówki, martwy kod, nieużywane zmienne                   |
| Format    | `npm run format:check` | rozjazdy w stylu                                            |

`npm run ci` uruchamia wszystko naraz — dokładnie to samo robi GitHub Actions.

Linter i formatter wymagają `npm ci` (plik blokady `package-lock.json` leży
w repozytorium) oraz Node 20.19+, bo tyle wymaga ESLint 10. Same `npm run build`
i `npm test` nadal działają bez żadnej instalacji.

Prettier świadomie omija `src/` i `tests/` (patrz `.prettierignore`): moduły
w `src/` są fragmentami jednej IIFE i mają wcięcie, którego formatter nie rozumie,
a w obu katalogach wyrównane komentarze niosą treść. Reszta repozytorium jest pod
Prettierem i ma taka zostać.

### Ustawienie ochrony gałęzi na GitHubie

Settings → Branches → Add branch protection rule dla `main`:

- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - obowiązkowe: `verify` (budowanie + testy), `lint`
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

Ostatni punkt jest ważny: zasada, którą można ominąć samemu sobie, nie jest
zasadą, tylko przypomnieniem.

---

## 5. Jak dodawać nową możliwość

Lista kontrolna sprawdzona na linii 7:

1. **Zdecydować, czy to MINOR, czy MAJOR.** Pojawiło się nowe pole w zapisywanych
   ustawieniach, które u istniejących użytkowników musi mieć wartość domyślną?
   Jeśli tak i stara zapisana konfiguracja je przykryje — to MAJOR ze zmianą
   `SCRIPT_ID_PREFIX`.
2. **Wartość domyślna ma być najcichsza z możliwych.** Nowa linia wyłączona,
   nowe źródło sieciowe wyłączone. To zasada tego projektu: po wklejeniu pliku
   człowiek nie może dostać niczego, o co nie prosił.
3. **Napisać test przed kodem** — choćby na format wyjścia.
4. **Zaktualizować README**, jeśli zmienia się cokolwiek widocznego.
5. **Wpis w CHANGELOG** — nie „co się zmieniło”, tylko „dlaczego tak, a nie inaczej”.
   Akapity pisze się tam w JEDNEJ linii, bez ręcznego zawijania — Prettier
   pilnuje tego ustawieniem `proseWrap: "never"` tylko dla tego pliku. Powód:
   sekcja z CHANGELOG jedzie żywcem do opisu wydania, a GitHub renderuje opisy
   wydań tak, że **każde przejście do nowej linii jest widoczne**. Tekst zawinięty
   na 80 znakach wygląda tam na poszarpany. W README i tym pliku zawijanie
   zostaje, bo pliki repozytorium renderują się normalnie.
6. `npm run verify`, potem PR.

### Ręczne sprawdzenie w przeglądarce

Testy automatyczne gonią skrypt w atrapie DOM. Przed wydaniem warto przepuścić go
w żywej przeglądarce na stanowisku testowym:

```bash
node tests/manual/serve.js          # podnosi http://localhost:8731
```

Otworzyć `http://localhost:8731/tests/manual/test_page.html`, w konsoli wkleić
`counter.js`, przepuścić kilka przedmiotów. Stanowisko naśladuje pełny cykl
obsługi i potrafi wstawiać kody sortowania przed / razem z / po finalnym
wyzwalaczu.

Żeby sprawdzić kilka kart naraz, otworzyć stanowisko dwa razy z różnymi
parametrami: `?gradingMode=CRETURN` i `?gradingMode=WAREHOUSE_DEALS`.

---

## 6. Testy: ile, jakie i po co

### Zasada: testów ma być WIĘCEJ, niż wydaje się potrzebne

Ten skrypt prowadzi ewidencję pracy człowieka. Błąd nie objawia się tu wyjątkiem
w konsoli, tylko liczbą, która wygląda normalnie i jest nieprawdziwa — a poznać
tego po samej liczbie nie sposób. Dlatego każda funkcja, która coś liczy, rozbiera
albo zapisuje, ma mieć własny test, nawet jeśli wygląda na oczywistą.

Wzorzec jest jeden i kosztował wydanie: forma kwoty przepuszczała tylko trzy
cyfry przed przecinkiem, więc cena `2 991,39 €` szła do dziennika jako `991,39`
(patrz CHANGELOG, 9.1.1). Kod działał. Testy przechodziły. Nikomu nie przyszło do
głowy sprawdzić przedmiot droższy niż tysiąc euro, bo „przecież ceny są
dwucyfrowe”. Suma zmiany po cichu zaniżała się o dwa tysiące.

### Wartości graniczne są obowiązkowe

Test na wartości typowej nie jest testem — sprawdza to, co i tak było widać
z kodu. Dla każdej nowej funkcji trzeba świadomie przejść listę:

- **zero i pustka**: pusta lista, `0`, `''`, brak wpisów w dzienniku;
- **jeden**: jedna pozycja, jedna karta, jeden znak;
- **przekroczenie rzędu**: `999` i `1000`, `9999` i `10000` — dokładnie tam
  psują się wzorce z ograniczoną liczbą cyfr i formaty z separatorem tysięcy;
- **liczby ujemne i ułamkowe** tam, gdzie mogą się pojawić;
- **`null`, `undefined`, `NaN`, `Infinity`** — wszystko to przychodzi
  z `localStorage`, którego nie kontrolujemy w całości;
- **przepełnienie**: limit wpisów dziennika, limit zapytań, pełny magazyn
  (`setItem` rzucający wyjątek — to stan realny, bo `localStorage` tej domeny
  dzielimy z samym TREX);
- **wartość spreparowana**: tekst zamiast liczby, cudzy klucz, `__proto__`;
- **granice czasu**: przejście przez północ, zmiana trwająca zero minut,
  znacznik z przyszłości.

Jeśli którejś z tych granic nie da się osiągnąć — to też jest wynik i warto
zapisać go w komentarzu do testu.

### Każdy test musi być uzasadniony

Test bez powodu jest gorszy niż brak testu: utrwala przypadkowy szczegół
wykonania i przy pierwszej poprawce zaczyna przeszkadzać. Dlatego:

1. Nagłówek testu mówi, **jakie zachowanie widoczne dla człowieka** jest
   sprawdzane, a nie jaka metoda jest wywoływana.
2. Jeśli test sprawdza coś, co kiedyś było zepsute — w komentarzu ma być jedno
   zdanie o tym, jak to się objawiało na stanowisku.
3. Test sprawdzający wewnętrzny szczegół, który wolno zmienić bez zmiany
   zachowania, nie powinien powstać w ogóle.

### Każda linia kodu ma być obowiązkowa

Ta sama miara dotyczy samego kodu. Przed wysłaniem poprawki trzeba przejść własny
diff i dla każdej linii umieć odpowiedzieć, co się stanie, jeśli ją usunąć. Jeśli
odpowiedź brzmi „nic” — linia ma zniknąć. To dotyczy również pól stanu, wpisów
w konfiguracji i gałęzi `if`, które „na wszelki wypadek” obsługują sytuację
niemożliwą do osiągnięcia: takie gałęzie nie są sprawdzane przez nikogo i przy
następnej poprawce zaczynają kłamać.

Wyjątek jest jeden i jest świadomy: **bezpieczniki postawione dwa razy**
(sprawdzenie `priceModuleOn()` na wejściu i na wyjściu ścieżki sieciowej).
Powielenie jest tam opisane komentarzem i wynika z tego, że koszt pominięcia jest
nieporównanie większy niż koszt zbędnego sprawdzenia.

### Mierzyć, a nie zgadywać

Poprawka podana jako „szybsza” albo „lżejsza” ma przyjść z liczbą. Wystarczy
najprostszy pomiar w atrapie DOM (liczba przerysowań, liczba odczytów
`innerText`, czas przebiegu) sprzed i po zmianie, wpisany do opisu PR. Bez tego
nie da się odróżnić przyspieszenia od przestawienia kodu.

---

## 7. Wymiana narzędzi

Na dziś narzędzie budujące jest własne, zależności nie ma. Gdyby potrzebna była
minifikacja albo kilka formatów wyjścia — zmienia się **wyłącznie `build.js`**,
a kontrakt `npm run build → counter.js` zostaje. Reszta repozytorium tego nie
zauważy.

Tak samo z testami: `tests/harness.js` realizuje cztery funkcje
(`describe`, `test`, `eq`, `ok`). Przejście na `node:test` albo `vitest`
to przepisanie jednego pliku.
