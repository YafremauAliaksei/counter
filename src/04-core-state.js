    // ==========================================
    // 4. ARCHITEKTURA: EventBus i stan reaktywny
    // ==========================================
    class EventBus {
        constructor() { this.listeners = {}; }
        on(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
            return () => this.off(event, callback);
        }
        off(event, callback) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
        emit(event, payload) {
            if (!this.listeners[event]) return;
            // Kopia listy: obsługa ma prawo wypisać się w trakcie rozsyłki.
            this.listeners[event].slice().forEach(cb => {
                try { cb(payload); } catch (e) { Utils.error(`Event handler error for ${event}`, e); }
            });
        }
        /** Zdejmuje wszystkie subskrypcje — przy rozbiórce egzemplarza (Main.teardown). */
        clear() { this.listeners = {}; }
    }

    const bus = new EventBus();

    /**
     * Subskrypcja zmian stanu ograniczona do gałęzi (`prefixes`).
     *
     * Obsługa na gołym `store:changed` reagowałaby na każdą zmianę, także na
     * flagi uiFlags przestawiane przy każdym przedmiocie — a przebudowa CSS
     * unieważnia style całego dokumentu. Każdy odbiorca słucha więc tylko
     * swoich ścieżek.
     */
    function onStorePaths(prefixes, handler) {
        return bus.on('store:changed', ({ path }) => {
            const p = String(path);
            if (prefixes.some(pref => p === pref || p.startsWith(pref + '.'))) handler();
        });
    }

    function createReactive(target, path = "") {
        if (Utils.isObject(target)) {
            for (const key of Object.keys(target)) {
                if (Utils.isObject(target[key])) {
                    target[key] = createReactive(target[key], path ? `${path}.${key}` : key);
                }
            }
        }

        return new Proxy(target, {
            get(obj, prop) {
                return obj[prop];
            },
            set(obj, prop, value) {
                // Klucz symboliczny (np. Symbol.toStringTag dopisany przez
                // bibliotekę) nie jest ścieżką stanu: zapis bez zdarzeń.
                // Wstawiony do napisu ścieżki rzuciłby TypeError.
                if (typeof prop === 'symbol') { obj[prop] = value; return true; }
                const fullPath = path ? `${path}.${prop}` : prop;
                const oldValue = obj[prop];

                if (oldValue !== value) {
                    if (Utils.isObject(value)) {
                        obj[prop] = createReactive(value, fullPath);
                    } else {
                        obj[prop] = value;
                    }

                    bus.emit(`store:changed`, { path: fullPath, value: obj[prop], oldValue });
                    bus.emit(`store:changed:${fullPath}`, { value: obj[prop], oldValue });
                }
                return true;
            },
            // Usunięcie klucza też jest reaktywne — na nim stoi sprzątanie
            // wpisów po kartach (SessionReset.pruneTabInstances).
            deleteProperty(obj, prop) {
                if (typeof prop === 'symbol') return delete obj[prop];
                if (!(prop in obj)) return true;
                const fullPath = path ? `${path}.${prop}` : prop;
                const oldValue = obj[prop];
                delete obj[prop];
                bus.emit(`store:changed`, { path: fullPath, value: undefined, oldValue });
                bus.emit(`store:changed:${fullPath}`, { value: undefined, oldValue });
                return true;
            }
        });
    }

    /**
     * Stan zmiany — wspólny dla wszystkich kart. Osobny obiekt, bo scalanie
     * ustawień między kartami uzupełnia nim pola, których brakuje w magazynie
     * (Persistence._adoptShared).
     */
    const DEFAULT_SESSION_CONFIG = {
        shiftType: null, shiftCalculatedStartTime: null, selectedLunchIndex: null, activeTabInstances: {},
    };

    const baseState = {
        initialized: false,
        currentTabType: CONFIG.UNKNOWN_TAB_TYPE_KEY,
        currentTabInstanceId: null,
        tabCounters: {},
        // Ile z policzonych przedmiotów pojechało na sprzedaż — na kartę,
        // jak tabCounters. Mianownikiem procentu jest tabCounters.
        tabSold: {},
        // Przedmioty wyjęte z mianownika procentu (audyt, ręczne wpisy) — patrz
        // Routing i TaskManager.
        tabNeutral: {},
        /**
         * Zadania. Tablica nie jest reaktywna po elementach — TaskManager
         * podmienia ją w całości przy każdej zmianie i dzięki temu linia 8
         * oraz panel dowiadują się o niej.
         */
        tasks: [],
        activeTaskId: null,
        taskCounters: {},
        userConfig: Utils.deepMerge({}, DEFAULT_USER_CONFIG),
        localTabConfig: Utils.deepMerge({}, DEFAULT_LOCAL_CONFIG),
        sessionConfig: Utils.deepMerge({}, DEFAULT_SESSION_CONFIG),
        // itemInProgress: trwa przedmiot (między wyzwalaczem wstępnym a końcowym).
        uiFlags: { isSettingsPanelVisible: false, isStatsWindowDragging: false, isPriceCardDragging: false,
                   autoTriggerFound: false, itemInProgress: false }
    };

    const store = createReactive(baseState);

    /**
     * Czy moduł cen jest włączony — jedno miejsce prawdy dla wszystkich
     * bezpieczników sieciowych. Porównanie do `true`, a nie prawdziwość:
     * wartość przychodzi z localStorage i wszystko inne niż jawne `true`
     * (brak pola, `null`, łańcuch, liczba) znaczy „wyłączony”.
     */
    function priceModuleOn() {
        return store.localTabConfig
            && store.localTabConfig.priceCard
            && store.localTabConfig.priceCard.moduleEnabled === true;
    }
