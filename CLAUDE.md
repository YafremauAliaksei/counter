# Instrukcje dla agenta

Ten plik jest czytany automatycznie przy starcie sesji w katalogu repozytorium.
Tu jest to, co trzeba wiedzieć przed pierwszą poprawką.

---

## Co to za projekt

Userscriptowy licznik obsłużonych przedmiotów dla wewnętrznego systemu T-REX.
Człowiek wkleja `counter.js` do konsoli DevTools i pracuje przez zmianę.

**Główna właściwość produktu:** po wklejeniu plik milczy. Zero zapytań
sieciowych, zero linii w konsoli, jedna szara linia w rogu ekranu i otwarty
panel ustawień (zamyka go klik obok). Cała reszta włącza się ręcznie.

To nie jest życzenie, tylko właściwość utrwalona testami. Każda poprawka, po
której skrypt robi coś sam z siebie, jest regresją.

---

## Zasady, których nie wolno łamać

### 1. `counter.js` jest artefaktem, a nie źródłem

Poprawiamy **wyłącznie** `src/`, potem `npm run build`, potem commitujemy oba
pliki. Jest kontrola `npm run build:check`, która pada, gdy artefakt rozjedzie
się ze źródłami. Stoi też w CI.

Jeśli padnie prośba „popraw linię N w counter.js” — znaleźć odpowiedni moduł
w `src/` (znaczniki `// ─── src/xx-nazwa.js ───` wprost w artefakcie pokazują,
skąd pochodzi fragment) i poprawiać tam.

### 2. Język

Cały projekt jest prowadzony po polsku: zespół jest polskojęzyczny, więc kod
i dokumentacja muszą być czytelne bez tłumacza.

| Co                                                                                           | Język                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------- |
| Komentarze w `src/**`, `tests/**`, `build.js`                                                | **polski**                            |
| Komunikaty `Utils.log/error/fatal`, teksty `new Error(...)`, klucze obiektów diagnostycznych | **polski**                            |
| README, CHANGELOG, CONTRIBUTING, HANDOFF, `src/README.md`, szablony `.github/**`             | **polski**                            |
| `LANG_STRINGS.ru`, `Русский` na liście języków                                               | rosyjski — **nie ruszać**             |
| `видите ниже`, `канирование номера LP:` w wyrażeniach wyzwalaczy                             | **nie ruszać**, to tekst samego T-REX |
| `зображенню нижче`, `канування LPN:`, podpisy pola pojemnika (`TOTE_INPUT_LABELS`)           | **nie ruszać**, to tekst samego T-REX |
| **Nazwy w kodzie** (zmienne, funkcje, pola, klucze), także w testach                         | **angielski**                         |
| Nazwy plików, commity, nazwy gałęzi                                                          | angielski                             |
| Rozmowa z autorem projektu                                                                   | **rosyjski**                          |

Cyrylica w komentarzach, w wywołaniach logów albo w dokumentacji wywraca testy:
pilnują tego `tests/09-artifact.test.js` (artefakt) i `tests/10-language.test.js`
(reszta repozytorium). Wyjątki są tam wymienione z nazwy.

Podział ról: **nazwa jest częścią mechanizmu**, więc czyta ją każdy, kto otworzy
plik, także ktoś bez polskiego — stąd angielski. **Komentarz jest wyjaśnieniem**
dla zespołu, a zespół jest polskojęzyczny. Po lewej stronie `=`, po `function`
albo w kluczu obiektu — angielski; zdanie dla człowieka — polski. Szerzej:
`CONTRIBUTING.md`, rozdział 2, „Język”.

**To jest bramka przed wysłaniem kodu, a nie sugestia.** Nowy komentarz, nowy
log, nowy plik dokumentacji — po polsku. Angielski może kiedyś dojść jako drugi
język, ale tylko świadomą decyzją autora, osobnym commitem i razem ze zmianą
`tests/10-language.test.js`.

### 3. Nowe jest zawsze domyślnie wyłączone

Nowa linia — `visible: false`. Nowe źródło danych — za wyłącznikiem. Człowiek
po wklejeniu pliku nie może dostać niczego, o co nie prosił.

Świadomy wyjątek: waluta wyświetlania ma domyślnie `EUR` (1.4.0, decyzja
autora). Nie dotyka sieci ani liczb, zmienia tylko wygląd ceny na karcie,
którą widać dopiero po ręcznym włączeniu modułu cen. Od 1.6.2, też decyzją
autora: panel ustawień otwiera się przy starcie, a most GRAVIS słucha od razu
(bez sieci; wygląd T-REX zmienia dopiero odpowiedź skryptu z GRAVIS). Następny
wyjątek — tylko decyzją autora i z wpisem w CHANGELOG.

**Tekst interfejsu nie może zawierać wyzwalacza.** Otwarty panel jest częścią
`document.body.innerText`; napis z `poniżej` albo `Przypisz ponownie`
w słowniku zatrzymałby liczenie. Takie słowa rozrywa się znakiem U+200B;
pilnuje tego `tests/39-release-162.test.js`.

### 4. `SCRIPT_ID_PREFIX` niesie MAJOR i MINOR

Prefiks to `statsHelper_v<MAJOR>_<MINOR>_0_` (decyzja autora od 1.6.0). Każde
wydanie MINOR i MAJOR zmienia prefiks — ludziom zerują się liczniki, więc takie
wydanie aktualizuje się tylko między zmianami. PATCH (`1.6.1`) prefiksu nie
rusza i można go przyjąć w trakcie zmiany. Zgodność prefiksu z `package.json`
sprawdza `tests/02-defaults.test.js`.

Przy każdej zmianie prefiksu poprzedni trafia do `LEGACY_ID_PREFIXES`, a nowy na
koniec `PREFIX_HISTORY` w `tests/02-defaults.test.js` — test nie przepuści jednego
bez drugiego.

### 5. Zakazane konstrukcje

`eval`, `new Function`, `document.write`, `insertAdjacentHTML`, przypisanie do
`innerHTML` czegokolwiek poza `''`. Sprawdza to `tests/09-artifact.test.js`.
Cały tekst trafia do DOM przez `createTextNode` (generator `h()`).

### 6. Testów ma być więcej, a każda linia ma być obowiązkowa

Nowa funkcja bez testu nie wchodzi. Test na wartości typowej nie liczy się za
test: obowiązkowe są wartości graniczne — zero, jeden, przekroczenie rzędu
(`999` / `1000`), `null`, `NaN`, przepełniony magazyn, spreparowana wartość
z `localStorage`, przejście przez północ. Wzorzec kosztował wydanie: cena
`2 991,39 €` szła do dziennika jako `991,39`, bo nikt nie sprawdził przedmiotu
droższego niż tysiąc euro (CHANGELOG 9.1.1).

Każdy test ma mieć powód zapisany w nagłówku albo w komentarzu, a każda linia
kodu ma być obowiązkowa: jeśli po jej usunięciu nic się nie psuje, ma zniknąć.
Poprawka podana jako „szybsza” przychodzi z pomiarem, nie z przekonaniem.

Pełna lista granic i uzasadnienie — `CONTRIBUTING.md`, rozdział 6.

### 7. Komentarz w kodzie jest neutralny wobec wersji

Działa zawsze tylko bieżąca wersja, więc komentarz w kodzie — w `src/`,
`tests/`, `build.js`, workflow `.github/` — opisuje kod taki, jaki jest teraz:
co robi fragment i dlaczego tak. Bez numerów wersji, bez „wcześniej było…”, bez
odsyłaczy do audytów i bez kroniki poprawek. Pułapka, przed którą chroni
warunek, to dobry komentarz; opis tego, jak kiedyś było źle, — zły.

Historia zmian żyje **wyłącznie poza kodem**: CHANGELOG, README, HANDOFF,
dokumentacja w `docs/` i historia gita. Reguły językowe z punktu 2 obowiązują
bez zmian: komentarz po polsku, bez cyrylicy poza wymienionymi wyjątkami.

Pilnują tego `tests/09-artifact.test.js` (artefakt) i
`tests/10-language.test.js` (każdy plik kodu repozytorium). Jedyne dozwolone
numery wersji w komentarzach: `@version` w nagłówku userscriptu i komentarz
wersji przy akcji przypiętej do SHA w workflow.

### 8. Stanowisko naśladuje pracę, a nie ją psuje

Skrypt przy każdej mutacji czyta cały `document.body.innerText`. Wyzwalacze
(`poniżej`, `Przypisz nowy`, `Przedmiot wysłano do …`), kody sortowania i ASIN
pokazuje więc wyłącznie ekran kroku stanowiska (`#trex`) i tylko na czas kroku.
W stałym tekście strony i w dzienniku stanowiska takie słowa są rozerwane
znakiem U+200B — inaczej flaga przedmiotu zostaje podniesiona na zawsze
i licznik przestaje liczyć. Pilnuje tego `Stand.leaks()` i test
`tests/stand/specs/01-silence.spec.js`.

Testy stanowiska nie wychodzą do prawdziwej sieci: każde zapytanie poza
stanowisko jest przechwytywane i dostaje odpowiedź z testu albo odmowę.
Stanowisko nie trafia do artefaktu.

### 9. Koszt przedmiotu nie rośnie w ciągu zmiany

Skrypt pracuje osiem godzin bez przeładowania; usterka kosztu przechodzi przez
testy funkcjonalne i wychodzi po godzinach jako zacinanie komputera. Pilnuje
tego `tests/35-shift-cost.test.js`: przedmiot i kosztuje tyle co przedmiot
i − cykl, mierzone licznikami operacji (`innerText`, przerysowania, zapisy,
zdarzenia `storage`, rozbiory dziennika), nie czasem. Złapane ręcznie:

- `store.x = { ...store.x, k: v }` kopiuje dzieci-Proxy — bez rozpakowania
  (`RAW` w `createReactive`) każdy zapis dokładał warstwę; od drugiego zadania
  koszt paczki rósł wykładniczo;
- chowanie elementu na czas odczytu `innerText` to drugi układ strony na
  mutację — odejmować jego tekst, nie chować;
- atrapa DOM nie zna `display:none`; widoczność sprawdzać na stanowisku
  (tak wyszła sprawa ukrytego ASIN karty, `showAsin`);
- test wzrostu wychodzi przy pierwszym rozjeździe, inaczej regresja
  wykładnicza wiesza CI zamiast go wywracać.

To samo w prawdziwej przeglądarce: `tests/stand/specs/07-long-shift.spec.js`.
Na stanowisku pracy: `SH.perf()` porównuje koszt przedmiotu z początku zmiany
z ostatnimi przedmiotami. Szablon PR pyta, co rośnie w ciągu zmiany — odpowiedź
„nic” przychodzi z liczbą. Agent piszący kod i agent przeglądający go mają te
same ślepe plamy: dowodem jest pomiar, nie przegląd.

Szerzej: `CONTRIBUTING.md`, rozdział 6, „Koszt przedmiotu jest stały”.

---

## Polecenia

```bash
npm run build        # src/ → counter.js
npm run build:check  # porównać artefakt z przebudową (nie pisze na dysk)
npm test             # 669 sprawdzeń
npm test line7       # tylko pliki z "line7" w nazwie
npm run verify       # build:check + test — to samo, co w CI
npm run test:e2e     # stanowisko w Chromium (npm ci + npx playwright install chromium)
npm run lint         # ESLint (potrzebny npm ci)
npm run typecheck    # TypeScript na JavaScripcie, 0 błędów (potrzebny npm ci)
npm run format       # Prettier (potrzebny npm ci)
npm run ci           # wszystko naraz
```

`npm test` i `npm run build` działają **bez instalacji** — zależności produkcyjnych
nie ma. Linter i formatter wymagają `npm ci` (plik blokady leży w repozytorium)
oraz Node 20.19+, bo tyle wymaga ESLint 10.

W `.claude/settings.json` leży lista poleceń, o które nie trzeba dopytywać,
i hook `Stop`, który po każdej turze sprawdza bramkę językową.

Stanowisko w przeglądarce (ręcznie; `?autoload=1` ładuje skrypt sam):

```bash
node tests/stand/serve.js
# http://localhost:8731/
```

---

## Jak zbudowany jest kod

30 modułów w `src/` (plus nagłówek `00`, cele tempa `00-targets` i stopka `99`), sklejanych w kolejności
z `build.manifest.json` w **jeden wspólny scope** (jedna IIFE).

Konsekwencja: w momencie deklaracji moduł widzi tylko to, co zadeklarowano
wyżej; w momencie wykonania — wszystko. Czyli `const x = ValueLog.totals()`
na najwyższym poziomie modułu 10 wywali się, a to samo wywołanie wewnątrz
metody — nie.

Mapa modułów z opisem każdego: `src/README.md`.

Najważniejsze miejsca:

| Plik                      | Dlaczego ważny                                                      |
| ------------------------- | ------------------------------------------------------------------- |
| `src/01-config.js`        | wszystkie wartości domyślne; zmieniać świadomie                     |
| `src/04-core-state.js`    | `priceModuleOn()` — od niego zależą wszystkie bezpieczniki sieciowe |
| `src/19-price-module.js`  | jedyne miejsce, z którego wychodzi pierwsze zapytanie do sieci      |
| `src/15-price-sources.js` | jedyne miejsce, które zna sieć zewnętrzną: `PriceNet`, źródła ceny  |
| `src/03-utils.js`         | `deepMerge`, `clampNum`, `hexToRgb` — ochrona przed wstrzyknięciami |

---

## Porządek pracy

1. Gałąź od `main`: `git switch -c feat/short-name`. Do `main` nie commitować wprost.
2. Poprawka w `src/` + test na nowe zachowanie.
3. `npm run verify`.
4. Commit z nagłówkiem w stylu Conventional Commits (`feat:`, `fix:`, `docs:`…).
5. Push, Pull Request, doczekać zielonego CI.

Szczegóły i listy kontrolne — w `CONTRIBUTING.md`.

---

## Audyty

Audyt kodu (agenci, reguły audytu, mapy, raporty) prowadzi się **wyłącznie
lokalnie**, w sesji, na gałęzi, która nigdy nie idzie na GitHub. Reguły
i instrukcje audytu nie trafiają do repozytorium ani do PR. Do repozytorium
trafiają tylko poprawki znalezisk: każda z testem, który bez niej pada,
zwykłym wydaniem (PATCH, gdy nie zmienia danych ani interfejsu) i z opisem
w CHANGELOG.

---

## Czego nie robić

- Nie uruchamiać sprawdzeń sieciowych „na wszelki wypadek”: włączenie modułu cen
  odpytuje `graph.keepa.com` i serwisy kursów walut. To normalne, gdy trzeba
  sprawdzić właśnie tę funkcję, i zbędne w pozostałych przypadkach.
- Nie zmieniać wartości domyślnych bez aktualizacji README i CHANGELOG: dublują
  się celowo, a test się o to upomina.
- Nie pisać w komentarzach historii zmian — patrz zasada 7. Powody decyzji
  i pułapki zostają, kronika idzie do CHANGELOG i historii gita.
- Nie dodawać zależności do `dependencies`. Artefakt musi być samowystarczalny.
  `devDependencies` (linter, formatter) — można.
