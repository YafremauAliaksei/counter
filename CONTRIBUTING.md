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
  23-presets.js      blok ustawień osobistych i start
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
| Nazwy plików, commity, nazwy gałęzi                                | angielski                                  |
| Rozmowa z autorem projektu                                         | rosyjski                                   |

Sprawdzane testami: cyrylica w komentarzach, w `Utils.log/error/fatal`
i w `new Error(...)` wywraca budowanie. Osobny test pilnuje, żeby cyrylica
nie wróciła do plików dokumentacji.

Angielski może kiedyś dojść jako drugi język kodu — ale dopiero świadomą
decyzją i razem ze zmianą testu, nie przypadkiem w pojedynczym PR.

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
7. Wydanie: podnieść wersję, tag, GitHub Release.

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

---

## 4. Bramki, które muszą być zielone

| Bramka    | Polecenie              | Co łapie                                                  |
| --------- | ---------------------- | --------------------------------------------------------- |
| Budowanie | `npm run build:check`  | artefakt rozjechał się ze źródłami                        |
| Testy     | `npm test`             | 113 sprawdzeń: zachowanie, bezpieczeństwo, skan statyczny |
| Linter    | `npm run lint`         | literówki, martwy kod, nieużywane zmienne                 |
| Format    | `npm run format:check` | rozjazdy w stylu                                          |

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

## 6. Wymiana narzędzi

Na dziś narzędzie budujące jest własne, zależności nie ma. Gdyby potrzebna była
minifikacja albo kilka formatów wyjścia — zmienia się **wyłącznie `build.js`**,
a kontrakt `npm run build → counter.js` zostaje. Reszta repozytorium tego nie
zauważy.

Tak samo z testami: `tests/harness.js` realizuje cztery funkcje
(`describe`, `test`, `eq`, `ok`). Przejście na `node:test` albo `vitest`
to przepisanie jednego pliku.
