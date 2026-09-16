    /**
     * Bieżący sklep Amazon (8.5.0). Jedno miejsce prawdy dla linku, wykresu
     * i waluty dziennika — patrz CONFIG.MARKETPLACES.
     */
    function marketplaceKey() {
        const key = store.userConfig.marketplace || CONFIG.DEFAULT_MARKETPLACE;
        return CONFIG.MARKETPLACES[key] ? key : CONFIG.DEFAULT_MARKETPLACE;
    }
    /** @param {string} [key] — konkretny rynek; bez niego bierze się wybrany. */
    function marketplace(key) {
        return CONFIG.MARKETPLACES[key] || CONFIG.MARKETPLACES[marketplaceKey()];
    }
    /**
     * Link do karty produktu.
     *
     * @param {string} [key] — rynek, NA KTÓRYM ZNALEZIONO CENĘ. Trzeba go
     *   podawać jawnie: jeśli ceny trzeba było szukać przeglądem sklepów, link
     *   musi prowadzić właśnie tam, inaczej człowiek otworzy amazon.de i nie
     *   znajdzie tam ceny, którą widzi na karcie.
     *
     * BEZPIECZEŃSTWO: host pochodzi WYŁĄCZNIE z tablicy CONFIG.MARKETPLACES
     * (marketplace() przy nieznanym kluczu wraca do domyślnego), a ASIN idzie
     * przez encodeURIComponent. Schemat jest wpisany na sztywno, więc do
     * atrybutu href nie da się wstawić `javascript:` ani `data:` — nawet gdyby
     * ASIN przyszedł ze strony w spreparowanej postaci.
     */
    function productUrl(asin, key) {
        return `https://${marketplace(key).host}/dp/${encodeURIComponent(asin)}`;
    }
