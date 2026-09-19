# Mapa modułów

Wszystko z tego katalogu skleja się w jeden plik `../counter.js` w kolejności
zadeklarowanej w [`../build.manifest.json`](../build.manifest.json).

**Poprawka tutaj → `npm run build` → commit obu plików.** Artefaktu nie rusza się ręcznie.

---

## Kolejność i przeznaczenie

| # | Moduł | Odpowiada za | Linii |
|---|---|---|---|
| — | `00-banner.js` | nagłówek `==UserScript==`, hasło, wyłącznik logów | ~105 |
| 01 | `01-config.js` | wszystkie stałe, wartości domyślne linii i karty | ~510 |
| 02 | `02-i18n-strings.js` | trzy słowniki tłumaczeń (pl, en, ru) | ~270 |
| 03 | `03-utils.js` | `deepMerge`, `clampNum`, `hexToRgb`, generator DOM `h()` | ~165 |
| 04 | `04-core-state.js` | `EventBus`, reaktywny `store`, `priceModuleOn()` | ~135 |
| 05 | `05-i18n-runtime.js` | odczyt tłumaczeń i nazw zakładek | ~30 |
| 06 | `06-storage.js` | odczyt i zapis stanu w `localStorage` | ~145 |
| 07 | `07-session-shift.js` | cykl życia zmiany, reset danych między zmianami | ~200 |
| 08 | `08-drag.js` | przeciąganie okna i karty | ~80 |
| 09 | `09-ui-css.js` | generowanie zmiennych CSS z konfiguracji, `LINE_KEYS` | ~55 |
| 10 | `10-ui-window.js` | okno statystyk: linie 1–7 | ~260 |
| 11 | `11-ui-builder.js` | klocki panelu ustawień | ~55 |
| 12 | `12-ui-settings.js` | panel ustawień | ~410 |
| 13 | `13-ui-visuals.js` | przyciemnienie strony, wskaźnik działu, powiadomienia | ~75 |
| 14 | `14-marketplace.js` | wybrany sklep i budowa linku do towaru | ~30 |
| 15 | `15-price-ocr.js` | odczyt ceny z pikseli wykresu Keepa | ~365 |
| 16 | `16-value-log.js` | dziennik wartości, wspólny dla wszystkich zakładek | ~400 |
| 17 | `17-fx-rates.js` | kursy walut i przeliczanie na euro | ~185 |
| 18 | `18-routing.js` | ustalenie, dokąd pojechał przedmiot | ~215 |
| 19 | `19-price-module.js` | główny wyłącznik sieci: `enable` / `disable` | ~35 |
| 20 | `20-price-card.js` | karta ceny i warstwa sieciowa | ~1045 |
| 21 | `21-input.js` | klawiatura i `MutationObserver` | ~140 |
| 22 | `22-bootstrap.js` | `Main.init`, rozbiórka, konsolowe API `SH` | ~370 |
| 23 | `23-config-code.js` | kod ustawień: jeden ciąg szesnastkowy zamiast panelu | ~300 |
| 24 | `24-presets.js` | blok ustawień osobistych i start | ~80 |
| — | `99-footer.js` | zakomentowana ściąga po wszystkich ustawieniach | ~185 |

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
      15-price-ocr ── 16-value-log ── 17-fx-rates ── 18-routing
                  │
            19-price-module ── 20-price-card
                  │
      21-input ── 22-bootstrap ── 23-config-code ── 24-presets
```

Strzałki znaczą „zadeklarowany wcześniej”, a nie „wywołuje”. Prawdziwe wywołania
w czasie działania idą we wszystkie strony: `10-ui-window` rysuje podsumowania
z `16-value-log`, a `22-bootstrap` szarpie wszystkich.

---

## Co warto kiedyś rozdzielić

`20-price-card.js` — 1045 linii i jest to jedyny moduł, który wyraźnie odstaje.
Mieszkają w nim trzy różne rzeczy:

1. lista źródeł ceny i pętla sieciowa (`providers`, `resolve`, `tryOtherMarkets`);
2. rozbiór odpowiedzi (`parseJina`, `normalize`, `MONEY`);
3. interfejs karty (`init`, `applyStyle`, `render`).

Na razie nie dzielono: to wszystko metody jednego obiektu `PriceCard`, a rozrzucenie
literału obiektowego po plikach czyta się gorzej niż jeden długi plik. Rozsądny moment
na podział nadejdzie, gdy pojawi się drugie źródło ceny z własnym układem karty;
wtedy punkt 2 naturalnie przeniesie się do `price-parsers.js`.
