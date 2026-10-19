/**
 * 38-languages.test.js — cztery języki interfejsu i ich kolejność.
 *
 * Brakujący klucz w słowniku nie wywala skryptu: I18n bierze wtedy tekst
 * polski, więc w interfejsie ukraińskim albo rosyjskim nagle pojawia się
 * polskie zdanie i nikt tego nie widzi w testach funkcjonalnych. Dlatego
 * każdy słownik ma mieć dokładnie te same klucze co polski, a teksty
 * z parametrami — te same parametry.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { bootOnStand } = require('./dom-stub');

const env = bootOnStand();
const SH = env.SH;
const L = SH.LANG_STRINGS;

describe('Lista języków');

test('kolejność: polski (domyślny), ukraiński, rosyjski, angielski', () => {
    eq(SH.CONFIG.AVAILABLE_LANGUAGES.map(l => l.code), ['pl', 'uk', 'ru', 'en']);
    eq(SH.CONFIG.DEFAULT_LANGUAGE, 'pl');
    eq(SH.store.userConfig.language, 'pl', 'świeży start po polsku');
});

test('kod ustawień zna ukraiński, a starsze indeksy nie zmieniły znaczenia', () => {
    // W kodzie ustawień leci indeks z listy — dopisuje się tylko na końcu.
    eq(SH.ConfigCode.ENUMS.language, ['pl', 'en', 'ru', 'uk']);
});

describe('Słowniki są kompletne');

const params = (s) => (String(s).match(/\$\{\w+\}/g) || []).sort();

for (const lang of ['uk', 'ru', 'en']) {
    test(`${lang}: te same klucze i te same parametry co pl`, () => {
        const pl = Object.keys(L.pl).sort();
        eq(Object.keys(L[lang]).sort(), pl, 'klucze');
        const wrong = pl.filter(k => params(L[lang][k]).join() !== params(L.pl[k]).join());
        eq(wrong, [], 'teksty z innymi parametrami');
    });
}

test('ukraiński jest naprawdę ukraiński: litery, których nie ma w rosyjskim', () => {
    const text = Object.values(L.uk).join(' ');
    // Cztery litery spoza alfabetu rosyjskiego zapisane kodami — testy są po polsku, bez cyrylicy w źródle.
    ok(/[\u0456\u0457\u0454\u0491]/i.test(text), 'brak liter ukraińskich');
    SH.store.userConfig.language = 'uk';
    eq(SH.I18n.get('section_tasks'), L.uk.section_tasks);
    ok(SH.I18n.get('section_tasks') !== L.ru.section_tasks, 'tekst ze słownika uk, nie ru');
    SH.store.userConfig.language = 'pl';
});
