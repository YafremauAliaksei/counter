# Zadanie dla następnej sesji

Ten plik jest napisany dla agenta, który przejmie pracę **na maszynie z działającym
`npm` i siecią**. Tu jest: co już zrobiono, co sprawdzić i co zrobić dalej.

Zacznij od przeczytania [`CLAUDE.md`](CLAUDE.md) — tam są zasady projektu.

---

## 0. Kontekst w dwóch akapitach

Repozytorium to userscriptowy licznik dla wewnętrznego systemu T-REX. Ten katalog
jest **korzeniem repozytorium git**: wszystko, co potrzebne do pracy, leży tutaj,
niczego z zewnątrz podłączać nie trzeba.

Wszystkie bramki są przepuszczone lokalnie i zielone: budowanie, testy, ESLint
i Prettier. Pierwszą rzeczą w nowej sesji jest `npm run ci` — jeśli coś jest
czerwone, znaczy że różni się środowisko, a nie kod.

---

## 1. Co jest już gotowe

|                                                           | Stan                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `counter.js` w wersji 1.0.0                               | zbudowany ze `src/`, sprawdzony                                          |
| 25 modułów w `src/`                                       | pocięte z monolitu, zweryfikowane linia po linii                         |
| `build.js` + `build.manifest.json`                        | działają, zero zależności                                                |
| 22 pliki testów, 303 sprawdzenia                          | **wszystkie zielone**                                                    |
| README, CHANGELOG, CONTRIBUTING, `src/README.md`          | napisane, **po polsku**                                                  |
| `tests/10-language.test.js`                               | bramka językowa: cyrylica poza wyjątkami wywraca testy                   |
| `.github/`: CI, wydanie, szablony, CODEOWNERS, Dependabot | napisane, CODEOWNERS wskazuje `@YafremauAliaksei`                        |
| ESLint, Prettier                                          | uruchomione, zielone; `src/` i `tests/` poza zasięgiem Prettiera         |
| `.gitignore`, `.editorconfig`, `.gitattributes`           | są                                                                       |
| `package-lock.json`, `.claude/settings.json`              | w repozytorium — patrz 2.0                                               |
| repozytorium git                                          | zainicjowane, `main` wypchnięty na `github.com/YafremauAliaksei/counter` |

Sprawdzenie, że podstawa jest w porządku:

```bash
npm run verify
# oczekiwane: "counter.js zgadza się ze źródłami" + "Zaliczone: 113, Niezaliczone: 0"
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
npm test                  # 113/113
```

Dodatkowo warto upewnić się, że cięcie na moduły niczego nie zgubiło.
Oryginalny monolit 9.2.0 leży **poza** tym katalogiem i do repozytorium nie trafi;
jeśli jest dostępny, porównanie linii kodu bez komentarzy powinno dać dokładnie
trzy różnice: numer wersji, `SCRIPT_ID_PREFIX` oraz dopisany element
w `LEGACY_ID_PREFIXES`.

Jeśli monolitu nie ma — wystarczą zielone testy, pokrywają zachowanie.

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

**ESLint**: 11 błędów naprawiono u źródła (`prefer-const` w pięciu miejscach,
komentarze w pustych blokach `catch`, kolizja nazwy `StorageManager` z globalnym
typem przeglądarki — wyciszona w `eslint.config.js` z uzasadnieniem).
Zostało ~40 ostrzeżeń `no-unused-vars` na obiektach modułów (`const ValueLog = …`
używany dopiero w innym pliku po sklejeniu) — to wynika z budowy projektu i nie
jest błędem. Reguły nie wyciszać: gdyby zniknęła, prawdziwa pozostałość po
refaktorze przestałaby być widoczna.

### 2.3. Upewnić się, że CI jest zielone

Po pierwszym pushu powinny wykonać się trzy zadania z `.github/workflows/ci.yml`:

| Zadanie  | Co robi                                                            | Zależności               |
| -------- | ------------------------------------------------------------------ | ------------------------ |
| `verify` | `build:check` + `test` + kontrola, że przebudowa nie zmienia pliku | brak                     |
| `lint`   | ESLint + Prettier                                                  | `npm ci` z pliku blokady |
| `matrix` | budowanie i testy na Node 18/20/22 × Linux/Windows/macOS           | brak                     |

Jeśli `matrix` pada na Windowsie z powodu końców linii — sprawdzić, czy
`.gitattributes` się zastosował (`git add --renormalize .`).

### 2.4. Ustawić ochronę gałęzi

Settings → Branches → Add branch protection rule dla `main`:

- Require a pull request before merging
- Require status checks to pass: wybrać `verify` i `lint`
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

Przez API robi się to tak (potrzebny token z prawami do repozytorium):

```bash
gh api -X PUT repos/YafremauAliaksei/counter/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=Testy i spójność artefaktu' \
  -f 'required_status_checks[contexts][]=Lint i format' \
  -F 'enforce_admins=true' \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -F 'restrictions=null'
```

Nazwy sprawdzeń muszą zgadzać się z polem `name:` z `ci.yml` — są po polsku
i to nie jest literówka.

### 2.5. Przeprowadzić jeden prawdziwy cykl przez PR

Pokazowy przebieg, żeby autor zobaczył cały przepływ. Weź dowolne małe, pożyteczne
zadanie — na przykład to opisane w rozdziale 3 niżej — i przeprowadź je:

```bash
git switch -c feat/example
# poprawka w src/
npm run verify
git add -A && git commit -m "feat: ..."
git push -u origin feat/example
gh pr create --fill
```

Doczekać zielonego CI, pokazać autorowi, scalić squash-mergem.

### 2.6. Wydać wersję 1.0.0

> **Stan na 1.2.0.** Poniższy opis jest już historyczny: aktualny przebieg
> wydania — razem z drogą przez interfejs GitHuba, bez konsoli — stoi
> w README, w rozdziale „Wydania”.

```bash
git switch main && git pull
git tag v1.0.0
git push --follow-tags
```

Workflow `release.yml` sprawdzi, że wersja w tagu, w `package.json` i w artefakcie
są zgodne, wyciągnie sekcję `## 1.0.0` z CHANGELOG i utworzy GitHub Release
z dołączonym `counter.js`.

Potem bezpośredni link do pliku wygląda tak:

```
https://raw.githubusercontent.com/YafremauAliaksei/counter/release/counter.js
```

Warto dodać go do README, do rozdziału „Szybki start”.

---

## 3. Co warto zrobić potem

Malejąco według pożytku:

1. **Przepuścić stanowisko w żywej przeglądarce.** Testy automatyczne działają
   w atrapie DOM; stanowisko (`tests/manual/`) sprawdza to, czego atrapa nie
   pokrywa: prawdziwy `MutationObserver`, autentyczne zdarzenia `storage` między
   kartami, realne pobranie obrazka Keepa. Scenariusz sprawdzenia jest
   w `CONTRIBUTING.md`, rozdział „Ręczne sprawdzenie w przeglądarce”.

2. **Dodać plakietki do README** — status CI i wersję ostatniego wydania.

3. **Pokryć testami to, co zostało niepokryte.** Słabe miejsca:
   `SettingsPanel.render()` jest sprawdzany tylko pod kątem obecności sekcji;
   `ShiftManager.update()` nie jest testowany wcale (potrzebna podmiana `Date`);
   `PriceCard.render()` — tylko pośrednio.

4. **Pomyśleć o podziale `src/20-price-card.js`** — 1045 linii, największy moduł.
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
  to nagromadzona wiedza projektu.

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

Warto zadać je na początku sesji, bo odpowiedzi wpływają na resztę:

1. Czy repozytorium ma zostać publiczne, czy przejść na prywatne? (dziś jest publiczne)
2. Czy wydawać tag `v1.0.0` od razu, czy najpierw przepuścić pokazowy PR?
3. Czy ruszać ~40 ostrzeżeń `no-unused-vars`, czy zostawić je jako świadomy szum
   wynikający z budowy projektu (patrz 2.2)?
