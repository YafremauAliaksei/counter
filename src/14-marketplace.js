    /**
     * Bieżący sklep Amazon — jedno miejsce prawdy dla linku, wykresu i waluty
     * ceny (CONFIG.MARKETPLACES). Nieznany klucz daje sklep domyślny.
     */
    function marketplaceKey() {
        const key = store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE;
        return CONFIG.MARKETPLACES[key] ? key : CONFIG.DEFAULT_MARKETPLACE;
    }
    /** @param {string} [key] - konkretny rynek; bez niego bierze się wybrany. */
    function marketplace(key) {
        return CONFIG.MARKETPLACES[key] || CONFIG.MARKETPLACES[marketplaceKey()];
    }
    /**
     * Link do karty produktu.
     *
     * @param {string} [key] - rynek, na którym znaleziono cenę; po przeglądzie
     *   sklepów link musi prowadzić tam, gdzie ta cena jest.
     *
     * Host pochodzi wyłącznie z CONFIG.MARKETPLACES, schemat jest wpisany na
     * sztywno, a ASIN idzie przez encodeURIComponent — do href nie da się
     * wstawić `javascript:` ani `data:`, nawet ze spreparowanym ASIN.
     */
    function productUrl(asin, key) {
        return `https://${marketplace(key).host}/dp/${encodeURIComponent(asin)}`;
    }
