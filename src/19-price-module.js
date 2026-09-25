    // ==========================================
    // 6h. WŁĄCZNIK MODUŁU CEN
    // ==========================================
    /**
     * Dwie operacje: „obudź sieć” i „uśpij sieć”. Woła je wyłącznie panel
     * ustawień oraz konsola (SH.priceOn() / SH.priceOff()).
     *
     * Pierwsze zapytanie do sieci zewnętrznej wychodzi stąd i znikąd indziej.
     * Dopóki enable() nie zostanie wywołane, FxRates i PriceCard nie
     * nawiązują połączeń, a PriceNet — jedyne wyjście do sieci modułu cen —
     * odmawia; każde z nich sprawdza to samodzielnie.
     */
    const PriceModule = {
        enable() {
            store.localTabConfig.priceCard.moduleEnabled = true;
            Persistence.saveState();
            Utils.log('[MODUŁ CEN] włączony ręcznie — od tej chwili zapytania sieciowe są dozwolone.');
            // Kursy walut: jedno zapytanie, dalej z pamięci przez dobę.
            FxRates.init().then(() => bus.emit('valueLog:changed'));
            // Karta mogła być schowana — pokazujemy i pytamy o cenę tego, co na ekranie.
            if (PriceCard.el) PriceCard.applyStyle();
            PriceCard.check();
            PriceCard.refresh();
        },
        disable() {
            store.localTabConfig.priceCard.moduleEnabled = false;
            Persistence.saveState();
            // Zapytania, które już lecą, dokończą się same — przerwać ich nie
            // ma czym, a nowe już nie wyjdą, bo wszystkie wejścia sprawdzają
            // priceModuleOn(). Pamięć wyników czyścimy, żeby po ponownym
            // włączeniu nie pokazać ceny sprzed godziny jako świeżej.
            PriceCard.cache.clear();
            if (PriceCard.el) PriceCard.applyStyle();
            Utils.log('[MODUŁ CEN] wyłączony — zapytania sieciowe wstrzymane.');
        },
    };
