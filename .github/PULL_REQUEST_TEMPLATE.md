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

## Koszt w ciągu zmiany

<!-- Skrypt pracuje osiem godzin bez przeładowania. Usterka kosztu przechodzi
     przez testy funkcjonalne i wychodzi po godzinach jako zacinanie komputera
     (CLAUDE.md, zasada 9). Odpowiedź „nic nie rośnie” bez liczby się nie liczy. -->

Co w tej zmianie rośnie z liczbą przedmiotów, zadań, kart albo wpisów dziennika?

- [ ] nic — `tests/35-shift-cost.test.js` i `07-long-shift.spec.js` zielone, a nowa praca na przedmiot jest w nich objęta pomiarem
- [ ] rośnie świadomie (np. jeden przebieg po dzienniku) — granica i pomiar poniżej

Liczby przed/po (przerysowania, zapisy, odczyty `innerText`, czas na N przedmiotów):

## Jak to sprawdzano

<!-- Testy automatyczne + co było przeklikane ręcznie w przeglądarce. -->
