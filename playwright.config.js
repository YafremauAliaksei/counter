/**
 * playwright.config.js — testy stanowiska w prawdziwej przeglądarce
 * (`npm run test:e2e`).
 *
 * Testy jednostkowe (`npm test`) gonią skrypt w atrapie DOM i działają bez
 * instalacji. Te tutaj sprawdzają to, czego atrapa nie pokazuje: prawdziwy
 * MutationObserver, zdarzenia `storage` między kartami, canvas, CSP, zegar.
 * Wymagają `npm ci` i przeglądarki (`npx playwright install chromium`).
 *
 * Do prawdziwej sieci nic nie wychodzi: każde zapytanie poza stanowisko
 * jest przechwytywane (tests/stand/specs/helpers.js).
 */

'use strict';

const { defineConfig } = require('@playwright/test');

const PORT = 8741;

module.exports = defineConfig({
    testDir: 'tests/stand/specs',
    timeout: 60000,
    // Powtórka ukrywa błąd zamiast go pokazać — test, który pada raz na
    // kilka przebiegów, jest do naprawy, a nie do ponawiania.
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        // Granice zmian liczy się w czasie lokalnym stanowiska pracy.
        timezoneId: 'Europe/Warsaw',
        locale: 'pl-PL',
        serviceWorkers: 'block',
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
    webServer: {
        command: 'node tests/stand/serve.js',
        env: { PORT: String(PORT) },
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: !process.env.CI,
    },
});
