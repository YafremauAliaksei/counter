# Zadanie dla następnej sesji

Ten plik jest napisany dla agenta, który przejmie pracę **na maszynie z działającym
`npm` i siecią**. Tu jest: co już zrobiono, co sprawdzić i co zrobić dalej.

Zacznij od przeczytania [`CLAUDE.md`](CLAUDE.md) — tam są zasady projektu.

> **Stan na 24.09.2026:** ostatnie wydanie to **1.4.1**, gałąź `release` wskazuje
> na nie. `main` i `release` mają ustawioną ochronę. Otwartych PR-ów i zgłoszeń
> nie ma, CI na `main` jest zielone, ESLint nie zgłasza ani jednego ostrzeżenia.

---

## 0. Kontekst w dwóch akapitach

Repozytorium to userscriptowy licznik dla wewnętrznego systemu T-REX. Ten katalog
jest **korzeniem repozytorium git**: wszystko, co potrzebne do pracy, leży tutaj,
niczego z zewnątrz podłączać nie trzeba.

Wszystkie bramki są przepuszczone lokalnie i zielone: budowanie, testy, ESLint
i Prettier. Pierwszą rzeczą w nowej sesji jest `npm run ci`. Jeśli coś jest
czerwone, najpierw wykluczyć środowisko (wersja Node, brak `npm ci`, końce
linii — rozdział 5), a potem traktować to jak błąd w kodzie. „Czerwone, więc
środowisko” to pułapka: do 1.3.2 zestaw był zielony tylko o części pór dnia
i właśnie tak by to wyjaśniono (CHANGELOG 1.3.3, audyt G1.1).

---

## 1. Co jest już gotowe

|                                                           | Stan                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `counter.js` w wersji z `package.json`                    | zbudowany ze `src/`, sprawdzony                                     |
| 25 modułów w `src/`                                       | pocięte z monolitu, zweryfikowane linia po linii                    |
| `build.js` + `build.manifest.json`                        | działają, zero zależności                                           |
| 33 pliki testów, 485 sprawdzeń                            | **wszystkie zielone**                                               |
| README, CHANGELOG, CONTRIBUTING, `src/README.md`          | napisane, **po polsku**                                             |
| `tests/10-language.test.js`                               | bramka językowa: cyrylica poza wyjątkami wywraca testy              |
| `.github/`: CI, wydanie, szablony, CODEOWNERS, Dependabot | napisane, CODEOWNERS wskazuje `@YafremauAliaksei`                   |
| ESLint, Prettier                                          | zielone, zero ostrzeżeń; `src/` i `tests/` poza zasięgiem Prettiera |
| `.gitignore`, `.editorconfig`, `.gitattributes`           | są                                                                  |
| `package-lock.json`, `.claude/settings.json`              | w repozytorium — patrz 2.0                                          |
| repozytorium git                                          | `github.com/YafremauAliaksei/counter`, `main` i `release` chronione |
| wydania                                                   | tag `vX.Y.Z` z interfejsu GitHuba, reszta automatycznie (README)    |

Sprawdzenie, że podstawa jest w porządku:

```bash
npm run verify
# oczekiwane: "counter.js zgadza się ze źródłami" + "Niezaliczone: 0"
```

---

## 2. Zadania — po kolei

### 2.0. Środowisko sesji

Świeża sesja (chmura, nowa maszyna, nowy czat) potrzebuje dokładnie dwóch rzeczy:

```bash
node --version      # potrzebny >= 20.19 (tyle wymaga ESLint 10)
npm ci              # instaluje linter i formatter z package-lock.json
```

Poza tym nic. `npm run build` i `npm test` działają bez żadnej instalacji —
projekt nie ma zależności produkcyjnych i nigdy mieć nie będzie.

Czego oczekiwać w repozytorium:

| Plik                          | Po co                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `package-lock.json`           | leży w repozytorium, więc `npm ci` daje wszędzie te same wersje                       |
| `.claude/settings.json`       | lista poleceń, o które agent nie musi dopytywać, plus bramka językowa po każdej turze |
| `.claude/settings.local.json` | osobiste nadpisania, ignorowane przez gita                                            |

**Bramka językowa jest wpięta jako hook `Stop`.** Po każdej turze uruchamia
`node tests/run.js 10-language` i milczy, dopóki jest zielona. Gdy w repozytorium
pojawi się cyrylica poza wyjątkami, wypisuje ostrzeżenie w tej samej chwili,
a nie dopiero w CI.

Narzędzia, które muszą być dostępne poza tym: `git` i `gh` (zalogowany:
`gh auth status`). Bez `gh` wszystko poza otwieraniem PR-ów nadal działa.

### 2.1. Sprawdzić spójność

```bash
npm run build:check       # artefakt == przebudowa src/
npm test                  # wszystkie sprawdzenia zielone
```

### 2.2. Linter i formatter — co już postanowiono

```bash
npm ci
npm run ci          # build:check + test + lint + format:check
```

To jest zrobione i zielone, ale warto wiedzieć, czemu wygląda tak, a nie inaczej.

**Prettier omija `src/` i `tests/`** (patrz `.prettierignore`). Moduły w `src/`
są fragmentami jednej IIFE z wcięciem 4 spacji; Prettier widzi je jako pliki
najwyższego poziomu i to wcięcie zdejmuje — na próbę wyszło 11 tysięcy zmienionych
linii. W `tests/` łamie wyrównane komentarze na końcach linii, po których czyta się,
którego przypadku dotyczy dany wiersz. Reszta repozytorium (`build.js`,
`eslint.config.js`, `*.md`, `*.json`, `*.yml`) jest sformatowana Prettierem
i tak ma zostać.

Gdyby kiedyś wciągać `src/` pod Prettiera, to osobnym commitem `style: prettier`
i przed jakąkolwiek zmianą merytoryczną — inaczej nie da się czytać diffów.

**ESLint** działa z twardą bramką: `npm run lint` pada przy pierwszym
ostrzeżeniu (`--max-warnings 0`). `no-unused-vars` jest podzielone na dwa
miejsca. Moduły w `src/` sprawdzają tylko nazwy lokalne, bo nazwę z najwyższego
poziomu modułu (`const ValueLog = …`) czyta dopiero inny plik po sklejeniu.
Nieużyte nazwy modułów sprawdza osobny blok konfiguracji na artefakcie
`counter.js`, gdzie widać całą IIFE.

### 2.3. Upewnić się, że CI jest zielone

Po pierwszym pushu powinny wykonać się trzy zadania z `.github/workflows/ci.yml`:

| Zadanie  | Co robi                                                            | Zależności               |
| -------- | ------------------------------------------------------------------ | ------------------------ |
| `verify` | `build:check` + `test` + kontrola, że przebudowa nie zmienia pliku | brak                     |
| `lint`   | ESLint + Prettier                                                  | `npm ci` z pliku blokady |
| `matrix` | budowanie i testy na Node 20/22/24 × Linux/Windows/macOS           | brak                     |

Jeśli `matrix` pada na Windowsie z powodu końców linii — sprawdzić, czy
`.gitattributes` się zastosował (`git add --renormalize .`).

### 2.4. Ustawić ochronę gałęzi

> **Stan na 24.09.2026 — zrobione** (sprawdzone przez
> `GET /repos/…/rules/branches/<gałąź>`): `main` — PR obowiązkowy (tylko
> squash), oba sprawdzenia wymagane, gałąź musi być aktualna, bez force-push
> i bez usuwania; `release` — bez force-push i bez usuwania. Listy Bypass to
> API bez uprawnień nie pokazuje — sprawdzić w ustawieniach, że jest pusta.
> Opis niżej zostaje na wypadek odtwarzania ustawień.

Settings → Rules → Rulesets → New branch ruleset, dwa zestawy:

**`main`** (Target branches: Include default branch):

- Require a pull request before merging
- Require status checks to pass: `Testy i spójność artefaktu` i `Lint i format`
- Require branches to be up to date before merging
- Block force pushes, Restrict deletions
- lista Bypass pusta

**`release`** (Target branches: Include by pattern → `release`):

- Block force pushes, Restrict deletions

Gałąź `release` przesuwa tylko `release.yml` i zawsze do przodu (tagi stoją na
`main`), więc blokada przepisywania historii mu nie przeszkadza, a chroni
zakładkę ludzi przed podmianą pliku pod tym samym adresem.

Nazwy sprawdzeń muszą zgadzać się z polem `name:` z `ci.yml` — są po polsku
i to nie jest literówka. Zadania `matrix` nie warto wymagać: jego nazwa zawiera
wersję Node i system, więc zmienia się przy każdej zmianie macierzy.

### 2.5. Zmiana i wydanie

Każda zmiana idzie przez PR (porządek pracy w `CLAUDE.md`, listy kontrolne
w `CONTRIBUTING.md`). Wydanie opisuje README, rozdział „Wydania”: commit
wydania w PR (`npm version X.Y.Z --no-git-tag-version` podnosi `package.json`
i `package-lock.json` oraz przebudowuje artefakt; w CHANGELOG `## Niewydane`
→ `## X.Y.Z — RRRR-MM-DD`; wersja w README), potem tag z interfejsu GitHuba.
Po wydaniu warto porównać `counter.js` z gałęzi `release`, spod tagu i z załącznika
wydania — trzy kopie mają mieć ten sam SHA-256.

### 2.6. Przeniesienie do wewnętrznego gita i na wewnętrzny serwer

Kod nie zna miejsca, w którym leży: w `src/`, `build.js` i w artefakcie nie ma
adresu repozytorium ani nazwy właściciela (pilnuje tego test w
`tests/09-artifact.test.js`). Z GitHubem związane jest wyłącznie otoczenie
repozytorium. Przy przeprowadzce:

1. **Adres pliku dla zakładki** — `config.releaseUrl` w `package.json`, potem
   `npm run build`. Adres `https`, bez apostrofów, spacji i parametrów (build
   odrzuci inny). Serwer musi odpowiadać nagłówkiem
   `Access-Control-Allow-Origin` — sprawdzić `curl -sI <adres>` — a polityka CSP
   strony T-REX musi dopuszczać jego host w `connect-src` (`await SH.cspReport()`
   pokazuje to po włączeniu adresu). Puste pole znaczy: panel pokazuje
   podpowiedź zamiast gotowej zakładki, reszta działa.
2. **CODEOWNERS** — wpisać zespół. Test bierze nazwy właścicieli właśnie stąd
   i sprawdza, że nie trafiły do kodu.
3. **CI** — `.github/workflows/ci.yml` to cztery polecenia: `npm run build:check`,
   `npm test`, `npm run lint`, `npm run format:check` (dwa ostatnie po `npm ci`).
   `release.yml`: tag `vX.Y.Z` → te same bramki → zgodność wersji → publikacja
   `counter.js` z sumą SHA-256. Odtworzyć w wewnętrznym CI; testy
   `29-supply-chain` i część `10-language` czytają pliki z `.github/` — przy
   zmianie ich miejsca poprawić ścieżki w testach.
4. **README** — „Szybki start” (adres zakładki i link do wydań) i „Wydania”
   opisują GitHuba; do przepisania pod nowe miejsce publikacji.
5. **`dependabot.yml`** — zastąpić tym, czym wewnętrznie aktualizuje się
   `devDependencies` i wersje narzędzi CI.

### 2.7. Wymiana źródeł ceny na wewnętrzne API

Wszystko, co zna sieć zewnętrzną, stoi w `src/15-price-sources.js`; kontrakt
źródła jest opisany w nagłówku tego pliku. Karta ceny, kursy, dziennik wartości
i panel znają tylko kontrakt, a test „poza adapterem źródeł kod nie zna sieci
zewnętrznej” (`tests/09-artifact.test.js`) pilnuje, żeby tak zostało. Wymiana to
więc praca w jednym pliku plus kilka wpisów wokół niego:

1. **Źródło według kontraktu** — w `PriceSources.list()`:

   ```js
   {
       name: 'intranet',
       kind: 'text',
       get available() { return store.localTabConfig.priceCard.source === 'intranet'; },
       marketSearch: true,             // czy pytać nim inne rynki, gdy w wybranym ceny nie ma
       async run(asin, signal, market) {
           const key = market || marketplaceKey();
           const r = await PriceNet.request(
               `https://<host>/price?asin=${encodeURIComponent(asin)}&market=${encodeURIComponent(key)}`,
               { signal, credentials: 'include' });
           if (!r.ok) throw new Error('HTTP ' + r.status);
           const j = await r.json();
           if (!j || typeof j.price !== 'number') return null;   // odpowiedź bez ceny
           return { current: PriceSources.money(j.price, j.currency), rrp: null, stale: false, market: key };
       },
   }
   ```

   Adres składa się z hosta wpisanego na stałe i z `encodeURIComponent` — nigdy
   z tekstu strony. Waluta musi mieć kurs w `CONFIG.FX_FALLBACK`.

2. **Uwierzytelnienie.** `credentials: 'include'` każe przeglądarce dołączyć
   ciasteczka hosta usługi — zalogowany pracownik jest rozpoznany bez żadnego
   tokenu w kodzie. Serwer musi wtedy odpowiadać
   `Access-Control-Allow-Origin: https://trex-prod-eu.aka.amazon.com` (dokładny
   origin, nie `*`) i `Access-Control-Allow-Credentials: true`. Jeśli usługa
   wydaje jednorazowy token osobnym zapytaniem, pobiera się go w tym samym
   `run()` przez `PriceNet.request` i dokłada jako nagłówek.
3. **Tryb w panelu** — `PriceSources.modes`: nowa wartość (`'intranet'`) z kluczem
   podpisu (tekst w trzech słownikach, `src/02-i18n-strings.js`) i ta sama
   wartość **na końcu** `ConfigCode.ENUMS.source` (test pilnuje zgodności).
   Wartość domyślna `priceCard.source` w `src/01-config.js` — z wpisem
   w README i CHANGELOG.
4. **CSP** — `PriceSources.cspHosts`: host usługi z `connect-src`. Polityka strony
   T-REX musi go dopuszczać; `await SH.cspReport()` pokaże to po włączeniu modułu.
   `PriceSources.probes()` — jedno sprawdzenie faktyczne do nowego hosta.
5. **Rynki** — `PriceSources.coversMarket(key)`: dla których rynków usługa ma
   dane (panel ostrzega o pozostałych, przegląd sklepów je pomija).
6. **Wykres** — `PriceSources.chart = null`, jeśli usługa nie daje obrazka: karta
   chowa ramkę, a panel opcje wykresu.
7. **Kursy walut** — `PriceSources.fxProviders`: adres i `pick` (z odpowiedzi
   `{ WALUTA: jednostek za 1 EUR }`). Resztę sprawdza `FxRates.normalize()`.
8. **Sprzątanie po Keepa i r.jina.ai**: stare źródła i `KeepaOCR` z pliku
   adaptera; `PRICE_KEEPA_*`, `PRICE_OCR_*`, `PRICE_JINA_*` i pola `keepa`,
   `keepa_ok` w `CONFIG.MARKETPLACES`; podpisy trybów w słownikach;
   `SH.readPrice` i `KeepaOCR` w konsolowym API (`src/22-bootstrap.js`); w testach
   rozbiór obrazka i r.jina.ai (`08`, `14`), testy `KeepaOCR` w `05` i `06`,
   podmiana `KeepaOCR.read` w `33` (zastąpić podmianą `run` źródła) oraz lista
   znanych hostów w `09-artifact`. Wartości trybów w `ConfigCode.ENUMS.source`
   **zostają** — kolejność to format rozdanych kodów.

Zasada „nowe domyślnie wyłączone” obowiązuje dalej: źródło pyta dopiero po
ręcznym włączeniu modułu cen, a `PriceNet` odmawia każdemu zapytaniu przy
wyłączonym module.

### 2.8. Przejście na TypeScript

**Stan:** `npm run typecheck` sprawdza wszystkie moduły `src/` kompilatorem
TypeScript bez kompilacji (`checkJs`, `tsconfig.json`) — **0 błędów**, w CI jako
krok zadania „Lint i format”. Artefakt dalej skleja `build.js`, bajt w bajt.
Z trybu `strict` włączone są już wszystkie flagi, które nie wymagają dopisywania
typów: `noImplicitThis`, `strictFunctionTypes`, `strictBindCallApply`,
`alwaysStrict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, a kod
nieosiągalny i nieużyte etykiety są błędem. Nazwy, które skrypt kładzie na
`window` (`SH`, `config`), opisuje `types/globals.d.ts`.

Moduły są skryptami bez `import`/`export`, więc kompilator widzi je tak jak
build: jeden wspólny zakres. Z tego powodu obiekt zapisu stanu nazywa się
`Persistence`, a nie `StorageManager` — ta nazwa należy do typu przeglądarki.

**Co zostało do pełnego `strict`** (`npm run typecheck:strict` pokazuje listę):

| Flaga                        | Błędów | Czego wymaga                                               |
| ---------------------------- | -----: | ---------------------------------------------------------- |
| `noImplicitAny`              |    776 | typów parametrów i obiektów (`CONFIG`, `store`, kontrakty) |
| `strictNullChecks`           |    154 | obsługi `null` z `querySelector`, `getItem` i map          |
| `useUnknownInCatchVariables` |      5 | sprawdzenia typu błędu przed `e.message` / `e.name`        |

Rozsądna kolejność: najpierw typy danych, od których zależy reszta (`CONFIG`,
stan `store`, `Money` i `PriceResult` z kontraktu źródeł, rekordy
`ConfigCode.REGISTRY`, klucze słowników), potem moduł po module — każdy
w osobnym PR, z `npm run ci` i `npm run test:e2e` na zielono. Dopiero na końcu
pliki `.ts` i kompilacja w `build.js`; wtedy `npm run build` przestaje działać bez
instalacji — to trzeba świadomie zapisać w CLAUDE.md.

**Czego przy przejściu nie robić:**

- **Nie usuwać sprawdzeń w czasie działania.** Typy znikają po kompilacji. Dane
  z `localStorage`, z DOM strony T-REX i z sieci są dalej niezaufane:
  `clampNum`, `UNSAFE_KEYS`, zakotwiczone wyrażenia, `FxRates.normalize` zostają,
  choćby typ mówił, że wartość „na pewno” jest liczbą.
- **Nie uciszać kompilatora** `any`, `as` i `!` bez komentarza, dlaczego wolno.
- **Nie zmieniać działania razem z typami.** Testy (`npm test`) sprawdzają
  zbudowany `counter.js`, więc zostają bez zmian przez całe przejście — o ile
  skan statyczny w `09-artifact` dalej rozpoznaje układ artefaktu.

---

## 3. Co warto zrobić potem

Malejąco według pożytku:

1. **Rozbudowywać testy stanowiska** (`tests/stand/specs/`, `npm run test:e2e`).
   Są już: cisza przy domyślnym starcie (także pod CSP), cykl przedmiotu z kodami
   sortowania, dwie karty i F5, granica zmiany na podstawionym zegarze, moduł
   cen z odczytem obrazka, wyłączenie modułu i blokada CSP. Warto dopisać: panel
   ustawień otwierany hasłem i kod ustawień z zakładki. Zadanie CI „Stanowisko
   w przeglądarce” warto dopisać do wymaganych sprawdzeń, gdy pokaże stabilność.
   Zasady — `CONTRIBUTING.md`, „Stanowisko i testy w przeglądarce”.

2. **Dodać plakietki do README** — status CI i wersję ostatniego wydania.

3. **Pokryć testami to, co zostało niepokryte.** Słabe miejsca:
   `SettingsPanel.render()` jest sprawdzany tylko pod kątem obecności sekcji;
   `PriceCard.render()` — tylko pośrednio.

4. **Pomyśleć o podziale `src/20-price-card.js`** — ok. 1040 linii, największy moduł.
   Uzasadnienie, dlaczego na razie nie jest podzielony, i rozsądny moment na to —
   w `src/README.md`, ostatni rozdział. Bez realnej potrzeby nie ruszać.

---

## 4. Czego robić nie trzeba

- **Nie przeformatowywać `src/**` bez rozmowy.** Patrz 2.2: wyrównanie
  w komentarzach niesie treść.
- **Nie zmieniać zachowania domyślnego.** Skrypt milczy i nie wchodzi do sieci —
  to jest utrwalone testami i obiecane w README.
- **Nie wciągać zależności do `dependencies`.** Artefakt musi być samowystarczalny:
  wkleja się go do konsoli, tam nie ma ani narzędzia budującego, ani modułów.
- **Nie pisać komentarzy ani dokumentacji po rosyjsku czy angielsku.** Cały projekt
  jest po polsku, pilnują tego testy 09 i 10.
- **Nie wyrzucać komentarzy z kodu.** Są w nich rozebrane błędy i powody decyzji;
  to nagromadzona wiedza projektu. Historia zmian do komentarzy nie wraca
  (zasada 7 w `CLAUDE.md`) — jej miejsce to CHANGELOG i git.

---

## 5. Jeśli coś się nie zgadza

| Objaw                                             | Gdzie patrzeć                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `build:check` pada                                | ktoś poprawiał `counter.js` ręcznie — `npm run build` i zacommitować        |
| test „w src/ nie ma plików spoza manifestu” pada  | nowy plik w `src/` nie jest wpisany do `build.manifest.json`                |
| test „w komentarzach nie ma cyrylicy” pada        | komentarz po rosyjsku — przetłumaczyć na polski                             |
| test „pliki .md są po polsku” pada                | dokumentacja po rosyjsku — przetłumaczyć, patrz `tests/10-language.test.js` |
| test „każde wejście do sieci jest osłonięte” pada | doszedł `fetch`/`new Image` bez sprawdzenia `priceModuleOn()`               |
| CI zielone lokalnie, czerwone na GitHubie         | prawie zawsze końce linii; `git add --renormalize .`                        |

---

## 6. Pytania do autora

Otwarte zostało jedno: czy repozytorium ma zostać publiczne, czy przejść na
prywatne (dziś jest publiczne). Uwaga: zakładka pobiera plik z
`raw.githubusercontent.com` bez logowania, więc przejście na prywatne wyłącza
ją wszystkim — najpierw trzeba by wybrać inne miejsce publikacji.
