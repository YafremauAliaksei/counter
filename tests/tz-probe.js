/**
 * tz-probe.js — scenariusze, które trzeba uruchomić w konkretnej strefie czasowej.
 *
 * PO CO OSOBNY PROCES. Zmiana czasu (29.03 i 25.10) istnieje tylko w strefie,
 * która ją ma — a zestaw testów chodzi w strefie maszyny (w CI: UTC, UTC+14,
 * UTC−11, żadna z nich nie przestawia zegarków). Przestawienie `process.env.TZ`
 * w trakcie zestawu zmieniłoby strefę WSZYSTKIM plikom naraz, łącznie z testami
 * asynchronicznymi, które jeszcze nie skończyły. Dlatego test uruchamia ten plik
 * jako osobny proces z `TZ=Europe/Warsaw` i czyta wynik jako JSON.
 *
 * Nazwa bez `.test.js` celowo: runner nie ma go wykonywać sam z siebie.
 *
 * Użycie: node tests/tz-probe.js <scenariusz>
 */

'use strict';

const { boot, makeClock, makeEnv } = require('./dom-stub');

/** Chwila czasu ściennego w strefie procesu. */
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

/** Początek zmiany i licznik karty po uruchomieniu w chwili `when` na wspólnym magazynie. */
function restartAt(shared, clock, when) {
    clock.set(when);
    const env = boot({ storage: shared, clock });
    const S = env.SH.store;
    const out = {
        counter: S.tabCounters[S.currentTabInstanceId] || 0,
        shiftStart: new Date(S.sessionConfig.shiftCalculatedStartTime).toString(),
    };
    env.SH.Main.teardown();
    return out;
}

const scenarios = {
    /**
     * Noc 24→25.10.2026: 18:30 CEST → 05:55 CET to 12,42 h zegara, a nie 11,42.
     * F5 o 05:35 jest jeszcze TĄ SAMĄ zmianą; o 06:20 zaczyna się następna.
     */
    octoberNight() {
        const { makeStorage } = makeEnv();
        const shared = makeStorage();
        const clock = makeClock(at(2026, 10, 24, 18, 20));
        const first = boot({ storage: shared, clock });
        const cid = first.SH.store.currentTabInstanceId;
        first.SH.store.tabCounters[cid] = 150;
        first.SH.StorageManager.saveCounter(cid, 150);
        first.SH.Main.teardown();
        return {
            reloadAt0535: restartAt(shared, clock, at(2026, 10, 25, 5, 35)),
            reloadAt0620: restartAt(shared, clock, at(2026, 10, 25, 6, 20)),
        };
    },

    /** Godzina wpisana ręcznie w obie noce zmiany czasu. */
    parseClockDst() {
        const clock = makeClock(at(2026, 3, 29, 4, 30));
        const env = boot({ clock });
        const march = new Date(env.SH.TaskManager.parseClock('23:30')).toString();
        clock.set(at(2026, 10, 25, 3, 30));
        const october = new Date(env.SH.TaskManager.parseClock('23:30')).toString();
        env.SH.Main.teardown();
        return { march, october };
    },
};

const name = process.argv[2];
if (!scenarios[name]) {
    process.stdout.write(JSON.stringify({ error: 'nieznany scenariusz: ' + name }));
    process.exit(2);
}
process.stdout.write(JSON.stringify(scenarios[name]()));
// Skrypt zostawia timery (okno, obserwatory) — bez tego proces nie skończyłby się sam.
process.exit(0);
