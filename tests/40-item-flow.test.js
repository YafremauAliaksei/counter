/**
 * 40-item-flow.test.js — cykl przedmiotu: wszystkie kombinacje sygnałów.
 *
 * Sygnały: początek (zbocze wyzwalacza początku), koniec (wyzwalacz końcowy),
 * pojemnik (zwykły albo `tsREP…`), naklejka, fraza o odsprzedaży, kierunek
 * (sprzedaż, niesprzedaż, nieznany i przychodzący później), czas.
 *
 * Reguły pod test:
 *   - zaliczenie wymaga końca; +1 w chwili pojemnika (w dowolnej kolejności
 *     względem końca), bez pojemnika — przy następnym początku albo po
 *     ITEM_FINISH_GRACE_MS;
 *   - nowy początek bez końca: poprzedni przedmiot przerwany, nic nie dostaje,
 *     a jego naklejka i fraza nie przechodzą na następny;
 *   - `tsREP…` przerywa na każdym etapie, także po końcu;
 *   - +2 tylko w DOUBLE_TAB_TYPES: naklejka albo fraza + sprzedaż; obie naraz
 *     to dalej +2.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { bootOnStand, scanTote } = require('./dom-stub');

const URL_OF = (mode) => `https://trex-prod-eu.aka.amazon.com/?gradingMode=${mode}`;
const PHRASE = 'Teraz oceniasz produkt, który można odsprzedać jako używany w serwisie Amazon Okazje z drugiej ręki.';

/** Stanowisko i krótki język kroków: p — początek, f — koniec, t — pojemnik… */
function bench(mode = 'CRETURN_PRIMARY_GRADING') {
    const env = bootOnStand({ href: URL_OF(mode) });
    const S = env.SH.store;
    const cid = S.currentTabInstanceId;
    let sticker = null;
    const show = (text) => {
        Object.defineProperty(env.sandbox.document.body, 'innerText', { configurable: true, get: () => text });
        env.SH.AutoTrigger.scan();
    };
    const steps = {
        p: () => { show('poniżej'); show(''); },
        f: () => { show('Przypisz nowy'); show(''); },
        fSell: () => { show('Zeskanuj CRITS-PRG2\nPrzypisz nowy'); show(''); },
        fUnsell: () => { show('Zeskanuj WHD\nPrzypisz nowy'); show(''); },
        sellLater: () => { show('Zeskanuj CRITS-PRG2'); show(''); },
        phrase: () => { show(PHRASE); show(''); },
        sticker: () => {
            sticker = env.sandbox.document.createElement('div');
            sticker.id = 'sticker-back-hide';
            env.sandbox.document.body.appendChild(sticker);
            show('');
            sticker.remove();
        },
        t: () => { scanTote(env, 'tsA1'); show(''); },
        rep: () => { scanTote(env, 'tsREP77'); show(''); },
        repLower: () => { scanTote(env, 'tsrep77'); show(''); },
        wait: () => { env.clock.set(env.clock.now() + env.SH.CONFIG.ITEM_FINISH_GRACE_MS + 1000); env.SH.AutoTrigger.tick(); },
        ps: () => { show('Przedmiot wysłano do PROBLEM-SOLVE'); show(''); },
    };
    const run = (seq) => { show(''); seq.split(' ').forEach(k => steps[k]()); };
    const got = () => [S.tabCounters[cid] || 0, S.tabSold[cid] || 0];
    return { env, run, got };
}

const CASES = [
    // [opis, dział, kroki, [paczki, sprzedane]]
    ['koniec, potem pojemnik: +1', 'CRETURN', 'p f t', [1, 0]],
    ['pojemnik przed końcem: +1 dopiero przy końcu', 'CRETURN', 'p t f', [1, 0]],
    ['koniec bez pojemnika: nic, dopóki trwa', 'CRETURN', 'p f', [0, 0]],
    ['koniec bez pojemnika, nowy początek: +1 za poprzedni', 'CRETURN', 'p f p', [1, 0]],
    ['koniec bez pojemnika po czasie: +1', 'CRETURN', 'p f wait', [1, 0]],
    ['przerwany (nowy początek bez końca): 0, następny normalnie', 'CRETURN', 'p p f t', [1, 0]],
    ['tsREP po końcu: przedmiot przerwany', 'CRETURN', 'p f rep', [0, 0]],
    ['tsREP przed końcem: przerwany, późniejszy koniec niczego nie daje', 'CRETURN', 'p rep f t', [0, 0]],
    ['tsREP małymi literami też', 'CRETURN', 'p f repLower', [0, 0]],
    ['tsREP, potem normalny przedmiot', 'CRETURN', 'p f rep p f t', [1, 0]],
    ['PROBLEM-SOLVE nie kończy; nowy początek przerywa', 'CRETURN', 'p ps p f t', [1, 0]],
    ['dziesięć pojemników to jedno zaliczenie', 'CRETURN', 'p f t t t t t t t t t t', [1, 0]],
    ['pojemnik bez przedmiotu: tylko czas od pojemnika', 'CRETURN', 't t', [0, 0]],
    ['UG naklejka: +2 i dwie sprzedaże', 'CRETURN_PRIMARY_GRADING', 'p sticker f t', [2, 2]],
    ['UG fraza + sprzedaż: +2', 'CRETURN_PRIMARY_GRADING', 'p phrase fSell t', [2, 2]],
    ['UG fraza + niesprzedaż: +1', 'CRETURN_PRIMARY_GRADING', 'p phrase fUnsell t', [1, 0]],
    ['UG fraza bez kodu: +1', 'CRETURN_PRIMARY_GRADING', 'p phrase f t', [1, 0]],
    ['UG fraza, sprzedaż przychodzi po zaliczeniu: +2', 'CRETURN_PRIMARY_GRADING', 'p phrase f t sellLater', [2, 2]],
    ['UG naklejka + fraza + sprzedaż: +2, nie +3', 'CRETURN_PRIMARY_GRADING', 'p sticker phrase fSell t', [2, 2]],
    ['UG fraza w przerwanym przedmiocie nie przechodzi na następny', 'CRETURN_PRIMARY_GRADING', 'p phrase p fSell t', [1, 1]],
    ['UG naklejka w przerwanym przedmiocie nie przechodzi na następny', 'CRETURN_PRIMARY_GRADING', 'p sticker p f t', [1, 0]],
    ['UG naklejka, potem tsREP: 0', 'CRETURN_PRIMARY_GRADING', 'p sticker f rep', [0, 0]],
    ['WHD fraza + sprzedaż: +1 (poza DOUBLE_TAB_TYPES)', 'WAREHOUSE_DEALS', 'p phrase fSell t', [1, 1]],
    ['WHD naklejka: +1', 'WAREHOUSE_DEALS', 'p sticker f t', [1, 0]],
];

describe('Kombinacje sygnałów cyklu przedmiotu');

for (const [name, mode, seq, expected] of CASES) {
    test(`${name} [${seq}]`, () => {
        const b = bench(mode);
        b.run(seq);
        eq(b.got(), expected);
    });
}

describe('Okno diagnostyki');

test('pierścień zdarzeń ma stałą długość przez całą zmianę', () => {
    const b = bench('CRETURN');
    for (let i = 0; i < 100; i++) b.run('p f t');
    eq(b.env.SH.Diag.events.length, b.env.SH.CONFIG.DIAG_MAX_EVENTS);
    eq(b.got()[0], 100);
});

test('okno otwiera się i zamyka, nie wychodzi do sieci ani do konsoli, a jego tekst nie jest wyzwalaczem', () => {
    const b = bench('CRETURN_PRIMARY_GRADING');
    const SH = b.env.SH;
    b.run('p phrase f');
    SH.Diag.toggle();
    ok(SH.Diag.el, 'okno otwarte');
    const text = String(SH.Diag.el.textContent);
    ok(text.includes('zdarzenia'), 'stan i zdarzenia w oknie');
    ok(!SH.CONFIG.PRE_TRIGGER_REGEX.test(text) && !SH.CONFIG.AUTO_TRIGGER_REGEX.test(text)
       && !SH.CONFIG.RESALE_PHRASE_REGEX.test(text), 'tekst okna rozbrojony');
    SH.Diag.toggle();
    eq(SH.Diag.el, null, 'zamknięte');
    eq(b.env.net.fetches, [], 'sieć');
    eq(b.env.net.consoleLog, [], 'konsola');
});

test('kod ustawień z wycofanym numerem liczenia po pojemniku przechodzi bez błędu', () => {
    const b = bench('CRETURN');
    ok(b.env.SH.ConfigCode.RETIRED_IDS.includes(0x030e));
});
