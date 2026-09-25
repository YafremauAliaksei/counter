/**
 * 04-shift.spec.js — granica zmiany na podstawionym zegarze przeglądarki.
 *
 * Na części stanowisk przeglądarka nie jest zamykana między zmianami. Kiedy
 * o 18:19 zaczyna się zmiana nocna, liczniki dziennej muszą zniknąć same —
 * inaczej nocna zaczyna od cudzego wyniku, a tempo liczy się od 06:30.
 * Zegar strony (Date, setTimeout, setInterval) podstawia Playwright; strefa
 * czasowa to Europe/Warsaw z playwright.config.js.
 *
 * Zegar stoi od pierwszej chwili, a czas przesuwa wyłącznie test. Na zegarze
 * płynącym samym z siebie Playwright prowadzi równolegle własny krok czasu
 * rzeczywistego, który po skończeniu ustawia zegar na swój cel — potrafi więc
 * cofnąć świeży fastForward. Timery ustawione po przeskoku lądują wtedy
 * minuty w przyszłości i przedmiot stanowiska nie kończy się nigdy.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { STEP_MS, openStand, paste, count, item } = require('./helpers');

const shift = (page) => page.evaluate(() => window.SH.store.sessionConfig.shiftType);

/** Zatrzymany zegar od `iso`, zanim strona w ogóle powstanie. */
async function frozenAt(page, iso) {
    const t = new Date(iso);
    await page.clock.install({ time: t });
    await page.clock.pauseAt(t);
}

/**
 * Przedmiot na zatrzymanym zegarze: stanowisko czeka między krokami na
 * setTimeout strony, więc test przesuwa czas krokami stanowiska, aż przedmiot
 * się skończy. Każde przesunięcie czeka na poprzednie, więc nic nie biegnie
 * równolegle.
 */
async function tickedItem(page) {
    let done = false;
    const run = item(page).then((n) => { done = true; return n; });
    while (!done) await page.clock.runFor(STEP_MS);
    return run;
}

test('17:40 dzienna, po 18:19 nocna: liczniki dziennej znikają same', async ({ page }) => {
    await frozenAt(page, '2026-09-24T17:40:00+02:00');
    await openStand(page);
    await paste(page);
    expect(await shift(page)).toBe('day');
    await tickedItem(page);
    await tickedItem(page);
    expect(await count(page)).toBe(2);

    // 45 minut później — bez przeładowania i bez ruchu człowieka. Przeskok
    // odpala zaległe timery strony, także strażnika zmiany.
    await page.clock.fastForward('45:00');
    expect(await shift(page)).toBe('night');
    expect(await count(page), 'nocna zaczyna od zera').toBe(0);

    await tickedItem(page);
    expect(await count(page)).toBe(1);
});

test('martwa strefa 17:55–18:19: zmiana dzienna trwa, nic się nie zeruje', async ({ page }) => {
    await frozenAt(page, '2026-09-24T17:50:00+02:00');
    await openStand(page);
    await paste(page);
    await tickedItem(page);
    await page.clock.fastForward('10:00');     // 18:00 — między zmianami
    await tickedItem(page);
    expect(await shift(page)).toBe('day');
    expect(await count(page)).toBe(2);
});
