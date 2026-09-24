# Mapa modułów

Wszystko z tego katalogu skleja się w jeden plik `../counter.js` w kolejności
zadeklarowanej w [`../build.manifest.json`](../build.manifest.json).

**Poprawka tutaj → `npm run build` → commit obu plików.** Artefaktu nie rusza się ręcznie.

---

## Kolejność i przeznaczenie

| # | Moduł | Odpowiada za | Linii |
|---|---|---|---|
| — | `00-banner.js` | nagłówek `==UserScript==`, hasło, wyłącznik logów | ~55 |
| 01 | `01-config.js` | wszystkie stałe, wartości domyślne linii i karty | ~585 |
| 02 | `02-i18n-strings.js` | trzy słowniki tłumaczeń (pl, en, ru) | ~390 |
| 03 | `03-utils.js` | `deepMerge`, `clampNum`, `hexToRgb`, generator DOM `h()` | ~215 |
| 04 | `04-core-state.js` | `EventBus`, reaktywny `store`, `priceModuleOn()` | ~135 |
| 05 | `05-i18n-runtime.js` | odczyt tłumaczeń i nazw zakładek | ~25 |
| 06 | `06-storage.js` | odczyt i zapis stanu w `localStorage` | ~455 |
| 07 | `07-session-shift.js` | cykl życia zmiany, reset danych między zmianami | ~235 |
| 08 | `08-drag.js` | przeciąganie okna i karty | ~75 |
| 09 | `09-ui-css.js` | generowanie zmiennych CSS z konfiguracji, `LINE_KEYS` | ~50 |
| 10 | `10-ui-window.js` | okno statystyk: linie 1–8 | ~310 |
| 11 | `11-ui-builder.js` | klocki panelu ustawień | ~60 |
| 12 | `12-ui-settings.js` | panel ustawień | ~680 |
| 13 | `13-ui-visuals.js` | przyciemnienie strony, wskaźnik działu, powiadomienia | ~85 |
| 14 | `14-marketplace.js` | wybrany sklep i budowa linku do towaru | ~25 |
| 15 | `15-price-sources.js` | **adapter źródeł**: jedyne wyjście do sieci (`PriceNet`), odczyt z wykresu Keepa, źródła ceny i kursów (`PriceSources`) | ~680 |
| 16 | `16-value-log.js` | dziennik wartości, wspólny dla wszystkich zakładek | ~390 |
| 17 | `17-fx-rates.js` | kursy walut i przeliczanie na euro | ~225 |
| 18 | `18-routing.js` | ustalenie, dokąd pojechał przedmiot | ~260 |
| 19 | `19-price-module.js` | główny wyłącznik sieci: `enable` / `disable` | ~35 |
| 20 | `20-price-card.js` | karta ceny: pytanie źródeł, limity, przegląd sklepów, CSP, rysowanie | ~900 |
| 21 | `21-input.js` | klawiatura i `MutationObserver` | ~170 |
| 22 | `22-bootstrap.js` | `Main.init`, rozbiórka, konsolowe API `SH` | ~410 |
| 23 | `23-config-code.js` | kod ustawień: jeden ciąg szesnastkowy zamiast panelu | ~435 |
| 24 | `24-tasks.js` | menedżer zadań: własny zegar i liczniki procesu pracy | ~680 |
| 25 | `25-presets.js` | blok ustawień osobistych i start | ~80 |
| — | `99-footer.js` | zakomentowana ściąga po wszystkich ustawieniach | ~190 |

---

## Zasady zależności

Wszystkie moduły żyją w **jednym scope** (jedna IIFE), więc:

**W momencie deklaracji** moduł widzi tylko to, co zadeklarowano wyżej na liście.

```js
// src/10-ui-window.js
const cached = ValueLog.totals();   // ← ReferenceError: ValueLog jest z modułu 16
```

**W momencie wykonania** — widzi wszystko, kolejność nie ma znaczenia.

```js
// src/10-ui-window.js
renderContent() {
    const vt = ValueLog.totals();   // ← w porządku: render idzie po załadowaniu
}
```

Stąd prosta heurystyka: `const X = ...` na najwyższym poziomie modułu może
odwoływać się tylko „w górę”, ciała funkcji — dokądkolwiek.

**Nazwy są globalne.** Dwa moduły nie mogą zadeklarować `const` o tej samej nazwie.

---

## Schemat powiązań

```
        01-config ──────────────────────────────────┐
             │                                      │
        02-i18n-strings                             │
             │                                      │
        03-utils ── h(), deepMerge, clampNum        │
             │                                      │
        04-core-state ── bus, store, priceModuleOn ─┤
             │                                      │
   ┌─────────┼──────────┬───────────┬───────────┐   │
   │         │          │           │           │   │
 05-i18n  06-storage  08-drag   09-ui-css   14-market
   │         │                      │           │
   │    07-session-shift        10-ui-window    │
   │                                │           │
   │                           11-ui-builder    │
   │                                │           │
   │                           12-ui-settings   │
   │                                            │
   └──────────────┬─────────────────────────────┘
                  │
   15-price-sources ── 16-value-log ── 17-fx-rates ── 18-routing
                  │
            19-price-module ── 20-price-card
                  │
  21-input ── 22-bootstrap ── 23-config-code ── 24-tasks ── 25-presets
```

Strzałki znaczą „zadeklarowany wcześniej”, a nie „wywołuje”. Prawdziwe wywołania
w czasie działania idą we wszystkie strony: `10-ui-window` rysuje podsumowania
z `16-value-log`, a `22-bootstrap` szarpie wszystkich.

---

## Granica źródeł ceny

Wszystko, co wie, **skąd** przychodzi cena produktu i kurs waluty, stoi
w `15-price-sources.js`:

- `PriceNet` — jedyne wyjście do sieci modułu cen: `request(url, init)` (fetch)
  i `image(url, opts)` (obrazek w tle), każde z twardym `priceModuleOn()`;
- `KeepaOCR` — odczyt ceny z pikseli wykresu Keepa;
- `PriceSources` — źródła ceny (`list()`), tryby w panelu (`modes`), wykres
  (`chart`), hosty dla CSP (`cspHosts`), rynki z danymi (`coversMarket()`),
  źródła kursów (`fxProviders`) i sprawdzenia do `SH.cspReport()` (`probes()`).

Kontrakt źródła jest opisany w nagłówku tego pliku. `20-price-card.js`,
`17-fx-rates.js`, panel i `22-bootstrap.js` znają tylko kontrakt: nie wymieniają
hostów, nie sięgają po nastawy Keepa ani r.jina.ai i nie wołają `fetch` ani
`new Image` poza `PriceNet`. Pilnuje tego test „poza adapterem źródeł kod nie zna
sieci zewnętrznej” w `tests/09-artifact.test.js`.

Wymiana źródeł (np. na wewnętrzne API) to więc przepisanie jednego pliku według
kontraktu — limity, przerwy, limit czasu, przegląd sklepów, blokady CSP, dziennik
wartości i przeliczanie walut zostają bez zmian. Lista kroków: `HANDOFF.md`.
