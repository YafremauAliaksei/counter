## Co się zmienia i po co

<!-- Jedno-dwa zdania. „Dlaczego”, a nie „co” — „co” widać w diffie. -->

## Rodzaj zmiany

- [ ] `fix` — naprawa, nowych pól w danych nie ma (PATCH)
- [ ] `feat` — nowa możliwość, dane zgodne wstecz (MINOR)
- [ ] `feat!` / `BREAKING` — zmienia się `SCRIPT_ID_PREFIX`, liczniki nie przenoszą się (MAJOR)
- [ ] `docs` / `refactor` / `test` / `chore` — wersja nie drgnie

## Lista kontrolna

- [ ] poprawiałem **wyłącznie** `src/`, `counter.js` nie ruszany ręcznie
- [ ] `npm run build` wykonany, artefakt jest w commicie
- [ ] `npm test` na zielono
- [ ] nowe zachowanie ma własny test
- [ ] README zaktualizowany, jeśli zmieniło się cokolwiek widocznego dla użytkownika
- [ ] wpis w CHANGELOG
- [ ] nowy moduł wpisany do `build.manifest.json` z opisem w jednym zdaniu
- [ ] komentarze i logi nowego kodu są po polsku (`npm test` to sprawdza)

## Wpływ na zachowanie domyślne

<!-- Najważniejsze pole. Skrypt po wklejeniu ma milczeć i nie wchodzić do sieci. -->

- [ ] po wklejeniu pliku nadal **zero** zapytań sieciowych
- [ ] po wklejeniu pliku nadal **zero** linii w konsoli
- [ ] nowe ustawienia są domyślnie wyłączone

Jeśli choć jeden punkt nie jest odhaczony — wyjaśnij dlaczego:

## Jak to sprawdzano

<!-- Testy automatyczne + co było przeklikane ręcznie w przeglądarce. -->
