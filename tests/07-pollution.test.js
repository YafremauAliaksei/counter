/**
 * 07-pollution.test.js — zatruwanie prototypu.
 *
 * Do skryptu wchodzi JSON z dwóch miejsc, których nie kontrolujemy:
 * z localStorage tej domeny (dzielonego z aplikacją T-REX) i z odpowiedzi
 * obcego serwera z kursami walut. Oba idą przez scalanie z obiektami
 * konfiguracji, a scalanie to klasyczne miejsce na `__proto__`.
 *
 * Dwie rzeczy do sprawdzenia, i obie trzeba sprawdzać W PIASKOWNICY skryptu
 * (osobny realm `vm`), a nie w procesie testów:
 *   1. globalny Object.prototype zostaje czysty;
 *   2. WYNIK scalania nie dostaje cudzego prototypu. Przypisanie
 *      `out['__proto__'] = v` nie zatruwa Object.prototype — podmienia
 *      prototyp jednego obiektu, a wtedy każde pole, którego w nim nie ma,
 *      czyta się z danych napastnika. Sam punkt 1 przechodzi także przy
 *      zdjętym strażniku; punkt 2 bez strażnika pada — to jest cały sens.
 */

'use strict';

const { describe, test, eq, ok } = require('./harness');
const { boot, makeEnv } = require('./dom-stub');
const vm = require('vm');
const { ARTIFACT } = require('./dom-stub');

const env = boot();
const U = env.SH.Utils;

describe('deepMerge');

/**
 * Object.prototype piaskownicy skryptu — ten, który skrypt mógłby zatruć.
 * Przez literał, a nie przez `Object`: atrapa podstawia do piaskownicy
 * `Object` procesu testów, a literały `{}` mają prototyp własnego realmu.
 */
const sandboxProto = () => vm.runInContext('Object.getPrototypeOf({})', env.sandbox);

test('nie przepuszcza __proto__ — ani do Object.prototype, ani do wyniku', () => {
    const evil = JSON.parse('{"__proto__": {"pwned": "yes"}}');
    const out = U.deepMerge({}, evil);
    eq(sandboxProto().pwned, undefined, 'Object.prototype piaskownicy czysty');
    ok(Object.getPrototypeOf(out) === sandboxProto(), 'wynik ma zwykły prototyp');
    eq(out.pwned, undefined, 'pole napastnika nie czyta się z wyniku');
});

test('nie przepuszcza __proto__ głębiej niż na pierwszym poziomie', () => {
    const out = U.deepMerge({ a: { x: 1 } }, JSON.parse('{"a": {"__proto__": {"pwned": 1}}}'));
    ok(Object.getPrototypeOf(out.a) === sandboxProto(), 'zagnieżdżony obiekt ma zwykły prototyp');
    eq(out.a.pwned, undefined);
    eq(out.a.x, 1, 'reszta scala się normalnie');
});

test('nie przepuszcza constructor ani prototype', () => {
    const out = U.deepMerge({}, JSON.parse('{"constructor": {"prototype": {"pwned2": 1}}, "prototype": {"pwned3": 1}}'));
    eq(sandboxProto().pwned2, undefined);
    ok(!Object.prototype.hasOwnProperty.call(out, 'constructor'), 'constructor nie trafia do wyniku');
    ok(!Object.prototype.hasOwnProperty.call(out, 'prototype'), 'prototype nie trafia do wyniku');
});

test('diffPaths i applyPaths też pomijają te klucze', () => {
    // Scalanie ustawień między kartami chodzi po ścieżkach — to druga
    // droga, którą dane z magazynu trafiają do obiektów konfiguracji.
    const evil = JSON.parse('{"__proto__": {"pwned4": 1}, "a": {"constructor": {"x": 1}}}');
    const changes = U.diffPaths({}, evil);
    ok(changes.every(([path]) => !path.some(k => U.UNSAFE_KEYS.includes(k))), 'żadnej ścieżki przez niebezpieczny klucz');
    // Cel tworzony w piaskownicy — tak jak stan skryptu.
    const target = U.applyPaths(vm.runInContext('({})', env.sandbox), [[['__proto__', 'pwned5'], 1], [['a', 'constructor'], 1]]);
    ok(Object.getPrototypeOf(target) === sandboxProto(), 'prototyp nietknięty');
    eq(sandboxProto().pwned5, undefined);
    ok(!Object.prototype.hasOwnProperty.call(target, 'a'), 'ścieżka z niebezpiecznym kluczem pominięta w całości');
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
    // Klucze pod bieżącym prefiksem — zapis pod prefiksem, którego skrypt nie
    // czyta, nigdy by do niego nie trafił i test niczego by nie dowodził.
    const P = env.prefix;
    const e = makeEnv();
    e.sandbox.localStorage.setItem(P + 'userConfig', '{"__proto__":{"pwnedCfg":1},"language":"en"}');
    e.sandbox.localStorage.setItem(P + 'allLocalTabConfigs',
        '{"CRET":{"__proto__":{"pwnedLocal":1},"statsWindowBgAlpha":7}}');
    vm.runInContext(ARTIFACT, e.sandbox, { filename: 'counter.js' });
    const S = e.sandbox.window.SH.store;

    eq(S.userConfig.language, 'en', 'zapis naprawdę został wczytany');
    eq(S.localTabConfig.statsWindowBgAlpha, 7, 'ustawienia karty też');
    eq(S.userConfig.pwnedCfg, undefined, 'pole napastnika nie czyta się z konfiguracji');
    eq(S.localTabConfig.pwnedLocal, undefined);
    eq(vm.runInContext('({}).pwnedCfg', e.sandbox), undefined);
    eq(e.net.fetches, [], 'i nadal bez sieci');
});

test('uszkodzony JSON w magazynie nie wywala startu', () => {
    const P = env.prefix;
    const e = makeEnv();
    e.sandbox.localStorage.setItem(P + 'userConfig', '{ to nie jest json');
    e.sandbox.localStorage.setItem(P + 'valueLog', 'null');
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
