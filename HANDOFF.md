# Zadanie dla następnej sesji

Ten plik jest napisany dla agenta, który przejmie pracę **na maszynie z działającym
`npm` i siecią**. Tu jest: co już zrobiono, co sprawdzić i co zrobić dalej.

Zacznij od przeczytania [`CLAUDE.md`](CLAUDE.md) — tam są zasady projektu.

---

## 0. Kontekst w dwóch akapitach

Repozytorium to userscriptowy licznik dla wewnętrznego systemu T-REX. Ten katalog
jest **korzeniem repozytorium git**: wszystko, co potrzebne do pracy, leży tutaj,
niczego z zewnątrz podłączać nie trzeba.

Część przygotowawcza powstała na maszynie bez działającego `npm`, więc wszystko,
co wymaga instalacji pakietów (ESLint, Prettier), jest **opisane i skonfigurowane,
ale ani razu nie uruchomione**. To pierwsza rzecz do sprawdzenia.

---

## 1. Co jest już gotowe

| | Stan |
|---|---|
| `counter.js` w wersji 1.0.0 | zbudowany ze `src/`, sprawdzony |
| 25 modułów w `src/` | pocięte z monolitu, zweryfikowane linia po linii |
| `build.js` + `build.manifest.json` | działają, zero zależności |
| 10 plików testów, 113 sprawdzeń | **wszystkie zielone** |
| README, CHANGELOG, CONTRIBUTING, `src/README.md` | napisane, **po polsku** |
| `tests/10-language.test.js` | bramka językowa: cyrylica poza wyjątkami wywraca testy |
| `.github/`: CI, wydanie, szablony, CODEOWNERS, Dependabot | napisane, CODEOWNERS wskazuje `@YafremauAliaksei` |
| ESLint, Prettier | skonfigurowane, **ani razu nie uruchomione** |
| `.gitignore`, `.editorconfig`, `.gitattributes` | są |
| repozytorium git | zainicjowane, `main` wypchnięty na `github.com/YafremauAliaksei/counter` |

Sprawdzenie, że podstawa jest w porządku:

```bash
npm run verify
# oczekiwane: "counter.js zgadza się ze źródłami" + "Zaliczone: 113, Niezaliczone: 0"
```

---

## 2. Zadania — po kolei

### 2.1. Sprawdzić spójność (najpierw to)

```bash
node --version            # potrzebny >= 18
npm run build:check       # artefakt == przebudowa src/
npm test                  # 113/113
```

Dodatkowo warto upewnić się, że cięcie na moduły niczego nie zgubiło.
Oryginalny monolit 9.2.0 leży **poza** tym katalogiem i do repozytorium nie trafi;
jeśli jest dostępny, porównanie linii kodu bez komentarzy powinno dać dokładnie
trzy różnice: numer wersji, `SCRIPT_ID_PREFIX` oraz dopisany element
w `LEGACY_ID_PREFIXES`.

Jeśli monolitu nie ma — wystarczą zielone testy, pokrywają zachowanie.

### 2.2. Uruchomić linter i formatter (pierwszy raz)

```bash
npm install
npm run lint
npm run format:check
```

**Czego się spodziewać.** Kod był pisany pod Prettiera, ale ani razu przez niego
nie przeszedł, więc `format:check` niemal na pewno znajdzie rozjazdy. Decyzję
podjąć świadomie, a nie automatycznie:

- wariant A — przepuścić `npm run format` po `src/**` i zacommitować jednym
  commitem `style: prettier` **przed** pierwszymi zmianami merytorycznymi;
- wariant B — dopisać `src/**` do `.prettierignore`, jeśli przeformatowanie
  za mocno psuje wyrównanie komentarzy (w tym projekcie ono niesie treść:
  tabele, schematy, wyrównane kolumny).

Rekomendacja: **wariant B dla `src/`, wariant A dla reszty**. Komentarze w `src/`
zawierają tabele ASCII i wyrównane bloki, które Prettier połamie. Ale decyduj
po fakcie — najpierw obejrzyj diff.

ESLint najprawdopodobniej znajdzie nieużywane zmienne. Naprawiać je, a nie
wyciszać regułę.

### 2.3. Upewnić się, że CI jest zielone

Po pierwszym pushu powinny wykonać się trzy zadania z `.github/workflows/ci.yml`:

| Zadanie | Co robi | Zależności |
|---|---|---|
| `verify` | `build:check` + `test` + kontrola, że przebudowa nie zmienia pliku | brak |
| `lint` | ESLint + Prettier | `npm install` |
| `matrix` | budowanie i testy na Node 18/20/22 × Linux/Windows/macOS | brak |

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
https://github.com/YafremauAliaksei/counter/releases/latest/download/counter.js
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

| Objaw | Gdzie patrzeć |
|---|---|
| `build:check` pada | ktoś poprawiał `counter.js` ręcznie — `npm run build` i zacommitować |
| test „w src/ nie ma plików spoza manifestu” pada | nowy plik w `src/` nie jest wpisany do `build.manifest.json` |
| test „w komentarzach nie ma cyrylicy” pada | komentarz po rosyjsku — przetłumaczyć na polski |
| test „pliki .md są po polsku” pada | dokumentacja po rosyjsku — przetłumaczyć, patrz `tests/10-language.test.js` |
| test „każde wejście do sieci jest osłonięte” pada | doszedł `fetch`/`new Image` bez sprawdzenia `priceModuleOn()` |
| CI zielone lokalnie, czerwone na GitHubie | prawie zawsze końce linii; `git add --renormalize .` |

---

## 6. Pytania do autora

Warto zadać je na początku sesji, bo odpowiedzi wpływają na resztę:

1. Przeformatować `src/**` Prettierem, czy zostawić ręczne wyrównanie (patrz 2.2)?
2. Czy repozytorium ma zostać publiczne, czy przejść na prywatne?
3. Czy wydawać tag `v1.0.0` od razu, czy najpierw przepuścić pokazowy PR?
