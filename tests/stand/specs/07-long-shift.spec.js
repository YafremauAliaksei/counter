/**
 * 07-long-shift.spec.js — długa zmiana w prawdziwej przeglądarce: koszt
 * przedmiotu na końcu jest taki sam jak na początku.
 *
 * tests/35-shift-cost.test.js mierzy to samo w atrapie DOM, gdzie wszystko
 * dzieje się synchronicznie. Tutaj działa prawdziwy MutationObserver,
 * prawdziwe zdarzenia `storage` między kartami i prawdziwy układ strony przy
 * każdym odczycie innerText — a to tu człowiek widział zacinanie.
 *
 * Przebieg: dwie karty, trzy zadania (drugie już po kilku przedmiotach — od
 * niego zaczynał się wzrost kosztu przy zagnieżdżaniu Proxy), dziennik
 * wartości, wszystkie rodzaje kodów sortowania. Cykl to 12 przedmiotów
 * (4 kody × 3 pozycje kart); porównuje się drugi cykl z ostatnim.
 *
 * Takt zegara okna jest zatrzymany: przerysowania z niego zależą od czasu
 * ściennego, a nie od przedmiotu. Zapisy odroczone (autozapis, dopisanie
 * dziennika) wpadają do sąsiednich przedmiotów zależnie od rytmu przeglądarki,
 * dlatego liczniki porównuje się sumą cyklu z małym zapasem — wzrost
 * z prawdziwej usterki był wykładniczy i przekracza go od razu. Czas skanu
 * porównuje się medianą i z szerokim zapasem: CI ma swój rytm.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { openStand, paste, item } = require('./helpers');

/** Krok stanowiska: dłuższy niż przerwa skanu (50 ms), krótszy niż w innych testach. */
const STEP = 100;
const CYCLE = 12;
const CYCLES = 4;
const CODES = ['CRITS-PRG2', 'WHD', 'AUDIT', 'Secondary-Sorting'];

/** Liczniki kosztu w karcie. Wołane po wklejeniu skryptu. */
function instrument() {
    const SH = window.SH;
    const c = { renders: 0, writes: 0, parses: 0, scans: 0, reads: 0, scanMs: [] };
    window.costProbe = c;
    clearInterval(SH.StatsWindowRenderer.tickTimer);
    const wrap = (obj, name, before) => {
        const orig = obj[name].bind(obj);
        obj[name] = (...args) => { before(); return orig(...args); };
    };
    wrap(SH.StatsWindowRenderer, 'renderContent', () => c.renders++);
    wrap(SH.Persistence, 'write', () => c.writes++);
    wrap(SH.ValueLog, '_readShared', () => c.parses++);
    const scan = SH.AutoTrigger.scan.bind(SH.AutoTrigger);
    SH.AutoTrigger.scan = () => {
        const t0 = performance.now();
        scan();
        c.scans++;
        c.scanMs.push(performance.now() - t0);
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
    Object.defineProperty(document.body, 'innerText', {
        configurable: true,
        get() { c.reads++; return desc.get.call(this); },
    });
    const pc = SH.store.localTabConfig.priceCard;
    pc.moduleEnabled = true;
    pc.logValues = true;
    const lines = SH.store.localTabConfig.linesConfig;
    for (const k of ['line2_globalSummary', 'line6_valueSum', 'line8_taskInfo']) lines[k].visible = true;
}

/** Liczniki od ostatniego odczytu, wyzerowane po odczycie. */
const take = (page) => page.evaluate(() => {
    const c = window.costProbe;
    const out = { ...c, scanMs: c.scanMs.slice() };
    Object.assign(c, { renders: 0, writes: 0, parses: 0, scans: 0, reads: 0, scanMs: [] });
    return out;
});

const median = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
};

test('dwie karty, trzy zadania: ostatni cykl kosztuje tyle co drugi', async ({ context }) => {
    test.setTimeout(180000);
    const cret = await context.newPage();
    const whd = await context.newPage();
    // Bez modułu cen włączonego z panelu zapytania o cenę dostają odmowę
    // stanowiska — dziennik prowadzi się dalej, wpisy są bez ceny.
    await openStand(cret, { query: 'gradingMode=CRETURN' });
    await openStand(whd, { query: 'gradingMode=WAREHOUSE_DEALS' });
    for (const p of [cret, whd]) {
        await p.evaluate((ms) => window.Stand.configure({ stepMs: ms }), STEP);
        await paste(p);
        await p.evaluate(instrument);
    }

    const cycles = [];
    // Najdroższy z pierwszych sześciu przedmiotów (przed drugim zadaniem).
    // Przedmiot droższy czterokrotnie to wzrost, a nie szum — test pada od
    // razu, bo przy koszcie wykładniczym przeglądarka zawiesza się na długo
    // przed końcem pętli.
    let firstMax = 0;
    for (let n = 0; n < CYCLES; n++) {
        const sum = { renders: 0, writes: 0, parses: 0, scans: 0, reads: 0, scanMs: [] };
        for (let k = 0; k < CYCLE; k++) {
            const i = n * CYCLE + k;
            if (i === 6) await cret.evaluate(() => window.SH.TaskManager.create('Second', Date.now()));
            if (i === 18) await cret.evaluate(() => window.SH.TaskManager.create('Third', Date.now()));
            if (i === 30) {
                await cret.evaluate(() => window.SH.TaskManager.resume(window.SH.store.tasks[0].id, Date.now()));
            }
            const page = i % 3 === 2 ? whd : cret;
            const code = CODES[i % 4];
            const route = code === 'Secondary-Sorting'
                ? { code, when: 'at', confirm: 'sell' }
                : { code, when: 'at' };
            await item(page, { route });
            let renders = 0;
            for (const p of [cret, whd]) {
                const c = await take(p);
                for (const key of ['renders', 'writes', 'parses', 'scans', 'reads']) sum[key] += c[key];
                sum.scanMs.push(...c.scanMs);
                renders += c.renders;
            }
            if (i < 6) firstMax = Math.max(firstMax, renders);
            else expect(renders, `przerysowania przedmiotu ${i}`).toBeLessThanOrEqual(firstMax * 4);
        }
        cycles.push(sum);
    }

    const total = await cret.evaluate(() => window.SH.store.tabCounters);
    expect(total.CRET + total.WHD, 'paczki po obu kartach').toBe(CYCLE * CYCLES);

    // Jeden odczyt tekstu strony na skan, przez całą zmianę.
    for (const c of cycles) expect(c.reads, 'odczyty innerText = skany').toBe(c.scans);

    const early = cycles[1];
    const late = cycles[CYCLES - 1];
    const report = JSON.stringify(cycles.map((c) => ({
        renders: c.renders, writes: c.writes, parses: c.parses, scans: c.scans,
        medianScanMs: +median(c.scanMs).toFixed(2),
    })));
    test.info().annotations.push({ type: 'koszt cykli', description: report });
    for (const key of ['renders', 'writes', 'parses']) {
        expect(late[key], `${key}: ${report}`).toBeLessThanOrEqual(Math.ceil(early[key] * 1.15) + 3);
    }
    expect(median(late.scanMs), `mediana skanu: ${report}`)
        .toBeLessThanOrEqual(median(early.scanMs) * 3 + 3);
});
