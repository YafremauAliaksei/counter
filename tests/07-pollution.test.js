/**
 * 07-pollution.test.js — zatruwanie prototypu.
 *
 * Do skryptu wchodzi JSON z dwóch miejsc, których nie kontrolujemy:
 * z localStorage tej domeny (dzielonego z aplikacją T-REX) i z odpowiedzi
 * obcego serwera z kursami walut. Oba idą przez scalanie z obiektami
 * konfiguracji, a scalanie to klasyczne miejsce na `__proto__`.
 *
 * Wszystkie te testy patrzą na `{}.coś` — czyli sprawdzają, czy globalny
 * Object.prototype pozostał czysty po przetworzeniu spreparowanych danych.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, makeEnv } = require('./dom-stub');
const vm = require('vm');
const { ARTIFACT } = require('./dom-stub');

const env = boot();
const U = env.SH.Utils;

describe('deepMerge');

test('nie przepuszcza __proto__', () => {
    const evil = JSON.parse('{"__proto__": {"pwned": "yes"}}');
    U.deepMerge({}, evil);
    eq({}.pwned, undefined, 'Object.prototype musi zostać czysty');
    eq(Object.prototype.pwned, undefined);
});

test('nie przepuszcza constructor.prototype', () => {
    const evil = JSON.parse('{"constructor": {"prototype": {"pwned2": 1}}}');
    U.deepMerge({}, evil);
    eq({}.pwned2, undefined);
});

test('zwykłe zagnieżdżone obiekty nadal scalają się poprawnie', () => {
    const out = U.deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 }, b: 5 });
    eq(out, { a: { x: 1, y: 3, z: 4 }, b: 5 });
});

test('scalanie kopiuje w głąb, nie zostawia wspólnych referencji', () => {
    const source = { blok: { v: 1 } };
    const out = U.deepMerge({}, source);
    out.blok.v = 99;
    eq(source.blok.v, 1, 'zmiana w kopii nie może dotknąć źródła');
});

describe('Dane z localStorage');

test('zatruta konfiguracja nie psuje obiektów', () => {
    const e = makeEnv();
    e.sandbox.localStorage.setItem(
        'statsHelper_v1_0_0_userConfig',
        '{"__proto__":{"pwnedCfg":1},"language":"pl"}');
    e.sandbox.localStorage.setItem(
        'statsHelper_v1_0_0_allLocalTabConfigs',
        '{"CRET":{"__proto__":{"pwnedLocal":1},"priceCard":{"moduleEnabled":false}}}');
    vm.runInContext(ARTIFACT, e.sandbox, { filename: 'counter.js' });

    eq({}.pwnedCfg, undefined);
    eq({}.pwnedLocal, undefined);
    ok(e.sandbox.window.SH, 'skrypt musi wstać mimo zatrutej konfiguracji');
    eq(e.net.fetches, [], 'i nadal bez sieci');
});

test('uszkodzony JSON w magazynie nie wywala startu', () => {
    const e = makeEnv();
    e.sandbox.localStorage.setItem('statsHelper_v1_0_0_userConfig', '{ to nie jest json');
    e.sandbox.localStorage.setItem('statsHelper_v1_0_0_valueLog', 'null');
    e.sandbox.localStorage.setItem('statsHelper_shared_fxRates', '???');
    vm.runInContext(ARTIFACT, e.sandbox, { filename: 'counter.js' });

    ok(e.sandbox.window.SH, 'skrypt musi wstać');
    eq(e.net.fetches, [], 'i nadal bez sieci');
});

describe('Dane z obcego serwera (kursy walut)');

test('normalize odrzuca zatrutą i bezsensowną odpowiedź', () => {
    const F = env.SH.FxRates;
    ok(F.normalize(JSON.parse('{"__proto__":{"pwnedFx":1},"usd":1.1}')) !== null,
       'poprawna część odpowiedzi musi przejść');
    eq({}.pwnedFx, undefined, 'prototyp musi zostać czysty');

    eq(F.normalize({ usd: 99 }), null, 'kurs USD 99 za 1 EUR jest niemożliwy');
    eq(F.normalize({ usd: 0.01 }), null, 'kurs USD 0.01 jest niemożliwy');
    eq(F.normalize({ gbp: 0.85 }), null, 'bez USD nie ma jak sprawdzić sensu');
    eq(F.normalize(null), null);
    eq(F.normalize('1.15'), null, 'łańcuch nie jest tablicą kursów');
});

test('kursy z magazynu są walidowane przy odczycie, nie tylko przy zapisie', () => {
    const e = makeEnv();
    e.sandbox.localStorage.setItem('statsHelper_shared_fxRates', JSON.stringify({
        rates: { USD: 9999, EUR: 1 }, source: 'podrobione', ts: Date.now(),
    }));
    vm.runInContext(ARTIFACT, e.sandbox, { filename: 'counter.js' });

    const F = e.sandbox.window.SH.FxRates;
    eq(F.rates.USD, 1.156, 'bzdurny kurs z magazynu musi zostać odrzucony');
});
