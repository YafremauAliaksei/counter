# Audyt — plan i uruchomienie

Ten katalog przygotowuje pełny audyt kodu wieloma agentami tak, żeby każdy
agent płacił tylko za swoją część: mapę kodu liczy skrypt, agenci dostają
wąskie listy plików, model dobrany do zadania i twardy limit wywołań.

## Dlaczego tak

Każdy agent startuje z własnym kontekstem: prompt systemowy, schematy
dozwolonych narzędzi i CLAUDE.md. Tego nie da się uniknąć, da się to
zmniejszyć i nie mnożyć:

- **mapa ze skryptu** (`node tests/audit/map.js` → `map.md`) zamiast agenta,
  który przegląda repozytorium — zero tokenów;
- **wąskie narzędzia** w `.claude/agents/*.md` (`tools:`) — mniej schematów
  w kontekście startowym; uruchamiać lokalnie, bez podłączonych serwerów MCP;
- **model do zadania**: sonnet do modułów, opus tylko do styków
  i weryfikacji;
- **zakaz czytania** `counter.js` (pół megabajta sklejki), `node_modules`,
  `package-lock.json`, CHANGELOG;
- **krótki wynik** w stałym formacie, bez streszczania kodu;
- **dowód zamiast prozy**: znalezisko styku istnieje tylko z padającym testem.

## Etapy

| Etap           | Kto                       | Model  | Wynik                                     |
| -------------- | ------------------------- | ------ | ----------------------------------------- |
| 0. Mapa        | `node tests/audit/map.js` | —      | `docs/audit/map.md`                       |
| 1. Moduły      | 4 × `audit-module`        | sonnet | ≤ 15 wierszy na grupę                     |
| 2. Styki       | 2 × `audit-interaction`   | opus   | padające testy `tests/9N-audit-*.test.js` |
| 3. Weryfikacja | 1 × `audit-verify`        | opus   | POTWIERDZONE / ODRZUCONE                  |
| 4. Raport      | orkiestrator              | —      | `docs/audit/report.md`                    |

Grupy etapu 1:

- **A** — `03-utils`, `04-core-state`, `06-storage`, `07-session-shift`
  (reaktywność, magazyn, zmiany);
- **B** — `18-routing`, `21-input`, `24-tasks`, `26-tote-watch`
  (cykl przedmiotu, kierunek, zadania, pojemnik);
- **C** — `10-ui-window`, `12-ui-settings`, `22-bootstrap`, `23-config-code`,
  `29-diagnostics` (interfejs, start, kod ustawień);
- **D** — `15-price-sources`, `16-value-log`, `17-fx-rates`, `20-price-card`,
  `27-gravis`, `28-auto-lpn` (sieć, dziennik, mosty).

Etap 2 — macierz stanów, pokrycie parami (~12 przebiegów po 300
przedmiotów), koszt ostatnich 20 przedmiotów nie większy niż pierwszych 20:

- karty: 1 / 2 / 4 (CRET, UG, REFURB, WHD);
- zadania: 1 / 3 z przełączaniem i odcinkami przez północ;
- moduł cen: wyłączony / włączony (sieć zaślepiona);
- UG: naklejka, fraza o odsprzedaży, sprzedaż teraz i po pojemniku;
- pojemnik zwykły, `tsREP…`, brak pojemnika (60 s), przedmiot przerwany;
- panel ustawień i okno diagnostyki otwarte w trakcie pracy;
- GRAVIS: okno zaślepione, sygnały co 10 s, przeładowanie karty;
- obiad, północ, reset zmiany w trakcie przedmiotu.

Znane podejrzenia do sprawdzenia w etapie 2:

- `lastToteAt` we wspólnym `sessionConfig` przy dwóch kartach — łańcuch
  zapis → storage → przerysowanie → autozapis;
- naklejka widoczna jeszcze po zaliczeniu, gdy następny przedmiot zaczyna
  się wcześniej;
- kod ustawień z `language: uk` otwarty w starszej wersji;
- reset zmiany, gdy pojemnik czeka na zniknięcie pola;
- `window.open` zwraca `null` (blokada wyskakujących okien) w moście GRAVIS.

## Zasady wyniku

- Raport i testy po polsku, bez cyrylicy (CLAUDE.md §2); nazwy w kodzie
  po angielsku.
- Nic w `src/` nie zmienia się w trakcie audytu. Poprawki idą potem osobnymi
  PR, każdy z testem ze znaleziska (PATCH, bez zmiany prefiksu).
- Raport: tabela `waga | plik:linia | scenariusz | test | propozycja poprawki
w 1–2 zdaniach`, posortowana od najcięższych.

## Uruchomienie

Lokalnie, w katalogu repozytorium, w świeżej sesji Claude Code (najlepiej
bez podłączonych serwerów MCP):

```bash
git switch main && git pull
git switch -c audit/v1.7.1
node tests/audit/map.js
```

Potem w sesji — słowa „use a workflow” uruchamiają orkiestrację wieloma
agentami:

```text
Audyt według docs/audit/README.md. Use a workflow, najwyżej 7 agentów:
4× audit-module (grupy A–D), 2× audit-interaction (macierz i znane
podejrzenia z README), 1× audit-verify na wszystkich znaleziskach.
Mapa już jest w docs/audit/map.md — nie generuj jej agentem.
Wynik: docs/audit/report.md i padające testy tests/9N-audit-*.test.js, commit do
gałęzi audit/v1.7.1, bez zmian w src/. Odpowiedź do mnie po rosyjsku:
10 najważniejszych znalezisk i ścieżka do raportu.
```
