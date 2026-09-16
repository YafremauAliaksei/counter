/**
 * eslint.config.js — nowy „flat config" (ESLint 9+).
 *
 * Reguły dobrane pod ten projekt, a nie skopiowane z gotowego presetu.
 * Uzasadnienie przy każdej nieoczywistej.
 *
 * UWAGA co do src/: moduły NIE są modułami ESM. To fragmenty jednego wielkiego
 * IIFE, sklejane przez build.js, więc każdy z osobna jest niepoprawnym plikiem
 * (odwołuje się do rzeczy zadeklarowanych w innych plikach). Dlatego linter
 * sprawdza je z wyłączonym `no-undef` — od pilnowania całości jest budowanie
 * i test „artefakt się parsuje".
 */

'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        // Artefakt jest generowany — nie ma sensu go linterować.
        ignores: ['counter.js', 'node_modules/**', 'tests/manual/**'],
    },

    // --- Moduły źródłowe: fragmenty jednej IIFE ---
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            ...js.configs.recommended.rules,

            // Nazwy z sąsiednich modułów są "niezdefiniowane" w obrębie
            // pojedynczego pliku — to normalne, patrz komentarz na górze.
            'no-undef': 'off',

            // Nieużywana zmienna to prawie zawsze pozostałość po refaktorze.
            // Argumenty pomijamy: obsługi zdarzeń często ich nie używają.
            'no-unused-vars': ['warn', {
                args: 'none',
                varsIgnorePattern: '^_',
            }],

            // Te dwie klasy błędów projekt traktuje wyjątkowo poważnie —
            // wszystkie dotyczą wykonywania tekstu jako kodu.
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-script-url': 'error',

            // Ciche pomyłki przy porównaniach i przypisaniach.
            eqeqeq: ['error', 'smart'],
            'no-cond-assign': ['error', 'except-parens'],
            'no-fallthrough': 'error',

            // Pusty catch bywa uzasadniony (localStorage może rzucić), ale
            // musi być opisany komentarzem — inaczej nie wiadomo, czy to
            // decyzja, czy przeoczenie.
            'no-empty': ['error', { allowEmptyCatch: false }],

            // Styl: tylko to, czego nie pilnuje Prettier.
            'prefer-const': 'error',
            'no-var': 'error',
            'no-console': 'off',        // konsola to interfejs tego skryptu
        },
    },

    // --- Narzędzia i testy: zwykły Node ---
    {
        files: ['build.js', 'tests/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { args: 'none' }],
            'no-console': 'off',
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },
];
