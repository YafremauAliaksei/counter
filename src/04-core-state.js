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
        /** Zdejmuje wszystkie subskrypcje. Potrzebne przy awaryjnym rozbiórce (Main.teardown). */
        clear() { this.listeners = {}; }
    }

    const bus = new EventBus();

    /**
     * Subskrypcja zmian stanu PO GAŁĘZIACH (8.3.0).
     *
     * W 8.2.0 na gołym `store:changed` wisiało pięć procedur: przebudowa CSS,
     * render okna statystyk, nakładka, przerysowanie karty ceny i autozapis.
     * Żadna nie patrzyła na ścieżkę, więc każdy drobiazg ciągnął za sobą
     * wszystko naraz. Najbardziej biło to po uiFlags: AutoTrigger.scan() rusza
     * itemInProgress i autoTriggerFound na każdym przedmiocie, a każda taka
     * flaga wywoływała pełną przebudowę łańcucha CSS z podmianą textContent
     * w <style> — czyli unieważnienie stylów całego dokumentu — plus pełny
     * re-render statystyk i karty ceny.
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
            // 8.1.0: usunięcie klucza też jest reaktywne. Potrzebne do zbierania
            // śmieci po kartach (SessionReset.pruneTabInstances) — wcześniej
            // delete przechodził obok magistrali i UI się nie przerysowywał.
            deleteProperty(obj, prop) {
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

    // Definicja podstawowej struktury stanu
    /**
     * Stan zmiany — wspólny dla wszystkich kart. Wydzielony (1.3.3), bo
     * scalanie ustawień między kartami uzupełnia nim pola, których brakuje
     * w magazynie (StorageManager._adoptShared).
     */
    const DEFAULT_SESSION_CONFIG = {
        // 8.3.0: usunięte sessionLastActivityTimestamp — zadeklarowane
        // w 8.0.0, nigdzie nieczytane i niezapisywane.
        shiftType: null, shiftCalculatedStartTime: null, selectedLunchIndex: null, activeTabInstances: {},
    };

    const baseState = {
        initialized: false,
        currentTabType: CONFIG.UNKNOWN_TAB_TYPE_KEY,
        currentTabInstanceId: null,
        tabCounters: {},
        // Ile z policzonych przedmiotów pojechało na sprzedaż — na każdą kartę
        // osobno, tak samo jak tabCounters. Mianownikiem procentu jest tabCounters.
        tabSold: {},
        // Przedmioty wyjęte z mianownika procentu (audyt, ręczne wpisy) — patrz
        // Routing i TaskManager.
        tabNeutral: {},
        /**
         * ZADANIA (1.3.0). Lista jest zwykłą tablicą, więc NIE jest reaktywna
         * po elementach — TaskManager podmienia ją w całości przy każdej
         * zmianie i tylko dzięki temu linia 8 oraz panel dowiadują się o niej.
         */
        tasks: [],
        activeTaskId: null,
        taskCounters: {},
        // 8.3.0: usunięte pole defaultLocalTabConfig — nikt go nigdy nie czytał,
        // a w całości dublowało się w localStorage przy każdym zapisie.
        // 1.2.0: wartości przeniesione do DEFAULT_USER_CONFIG, bo kod konfiguracji
        // musi mieć z czym porównywać bieżący stan.
        userConfig: Utils.deepMerge({}, DEFAULT_USER_CONFIG),
        localTabConfig: Utils.deepMerge({}, DEFAULT_LOCAL_CONFIG),
        sessionConfig: Utils.deepMerge({}, DEFAULT_SESSION_CONFIG),
        // itemInProgress zadeklarowany jawnie (w 8.0.0 powstawał w locie z AutoTrigger.scan)
        uiFlags: { isSettingsPanelVisible: false, isStatsWindowDragging: false, isPriceCardDragging: false,
                   autoTriggerFound: false, itemInProgress: false }
    };

    const store = createReactive(baseState);

    /**
     * CZY MODUŁ CEN JEST WŁĄCZONY (9.2.0).
     *
     * Jedno miejsce prawdy dla wszystkich bezpieczników sieciowych. Świadomie
     * porównanie do `true`, a nie zwykła prawdziwość: wartość przychodzi
     * z localStorage, a wszystko, co nie jest jawnym `true` (brak pola, `null`,
     * łańcuch, liczba), ma znaczyć WYŁĄCZONE.
     */
    function priceModuleOn() {
        return store.localTabConfig
            && store.localTabConfig.priceCard
            && store.localTabConfig.priceCard.moduleEnabled === true;
    }
