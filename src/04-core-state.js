    // ==========================================
    // 4. ARCHITEKTURA: EventBus i stan reaktywny
    // ==========================================
    /**
     * KOSZT PRACY SKRYPTU — odpowiedź na pytanie „to skrypt czy komputer?”.
     *
     * Liczniki zbierają się zawsze, ale nic nie wypisują: odczyt tylko na
     * żądanie, `SH.perf()` w konsoli. Liczy się to, co kosztuje w przeglądarce:
     * skany strony (każdy to odczyt innerText, czyli układ całej strony) i ich
     * czas, przerysowania okna, zdarzenia magistrali i zapisy do magazynu.
     *
     * Przy każdym zaliczonym przedmiocie odkłada się migawka liczników. Koszt
     * przedmiotu z pierwszych WINDOW przedmiotów zmiany porównany z kosztem
     * ostatnich WINDOW mówi, czy koszt rośnie z czasem pracy. Rosnąca liczba
     * operacji to usterka skryptu; stała liczba przy dłuższym skanie to strona
     * T-REX, która urosła (dłuższy dziennik na ekranie).
     *
     * Na górze modułu, bo liczą się w nim już zdarzenia magistrali, a obiekt
     * musi istnieć, zanim cokolwiek zacznie pracować.
     */
    const Perf = {
        WINDOW: 20,
        startedAt: Date.now(),
        items: 0,
        counts: { scans: 0, scanMs: 0, renders: 0, events: 0, writes: 0 },
        maxScanMs: 0,
        /** Migawki przy przedmiotach 0..WINDOW — początek zmiany. */
        first: [],
        /** Ostatnie WINDOW + 1 migawek. */
        last: [],

        scan(ms) {
            this.counts.scans++;
            this.counts.scanMs += ms;
            if (ms > this.maxScanMs) this.maxScanMs = ms;
        },

        item() {
            this.items++;
            const snap = { ...this.counts };
            if (this.first.length <= this.WINDOW) this.first.push(snap);
            this.last.push(snap);
            if (this.last.length > this.WINDOW + 1) this.last.shift();
        },

        /** Średni koszt przedmiotu między pierwszą a ostatnią migawką okna. */
        perItem(snaps) {
            const a = snaps[0];
            const b = snaps[snaps.length - 1];
            const n = snaps.length - 1;
            const avg = (k) => +((b[k] - a[k]) / n).toFixed(2);
            return {
                skany: avg('scans'), 'czas skanów [ms]': avg('scanMs'),
                przerysowania: avg('renders'), zdarzenia: avg('events'), zapisy: avg('writes'),
            };
        },

        /**
         * Ocena wzrostu. Próg dwukrotny z zapasem 2: koszt przedmiotu waha się
         * z rodzajem kodu sortowania i z tym, czy pracuje druga karta, a usterka
         * kosztu rośnie z każdym przedmiotem i przekracza go szybko.
         */
        verdict(early, late) {
            const grows = (k) => late[k] > early[k] * 2 + 2;
            if (['przerysowania', 'zdarzenia', 'zapisy', 'skany'].some(grows)) {
                return 'KOSZT ROŚNIE: przedmiot wymaga coraz więcej operacji — usterka skryptu';
            }
            if (grows('czas skanów [ms]')) {
                return 'operacje stałe, skan dłuższy: urosła strona T-REX, nie praca skryptu';
            }
            return 'koszt stały';
        },

        report() {
            const minutes = (Date.now() - this.startedAt) / 60000;
            const c = this.counts;
            const out = {
                'czas pracy skryptu [min]': +minutes.toFixed(1),
                przedmioty: this.items,
                'skany strony': c.scans,
                'skany na minutę': minutes > 0 ? +(c.scans / minutes).toFixed(1) : 0,
                'średni skan [ms]': c.scans ? +(c.scanMs / c.scans).toFixed(2) : 0,
                'najdłuższy skan [ms]': +this.maxScanMs.toFixed(2),
                przerysowania: c.renders,
                zdarzenia: c.events,
                zapisy: c.writes,
            };
            // Okna rozłączne: pierwsze WINDOW przedmiotów i ostatnie WINDOW.
            if (this.items < 2 * this.WINDOW + 1) {
                out.ocena = `za mało przedmiotów do porównania (jest ${this.items}, potrzeba ${2 * this.WINDOW + 1})`;
                return out;
            }
            const early = this.perItem(this.first);
            const late = this.perItem(this.last);
            out['koszt przedmiotu: początek zmiany'] = early;
            out['koszt przedmiotu: ostatnio'] = late;
            out.ocena = this.verdict(early, late);
            return out;
        },
    };

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
            Perf.counts.events++;
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

    /**
     * Klucz, pod którym obiekt reaktywny oddaje swój surowy obiekt. Symbol nie
     * trafia do Object.keys ani do JSON.stringify, więc nie przecieka do magazynu.
     */
    const RAW = Symbol('raw');

    /**
     * Obiekt reaktywny nad `target`, rekurencyjnie dla zagnieżdżonych obiektów.
     *
     * Wejście bywa już obiektem reaktywnym: zapis `store.x = { ...store.x, k: v }`
     * kopiuje do nowego obiektu dzieci, które są Proxy. Dlatego najpierw
     * rozpakowanie do surowego obiektu. Owinięcie Proxy w kolejne Proxy
     * dokładałoby warstwę przy każdym zapisie: odczyt przechodziłby przez
     * wszystkie warstwy, a owijanie dzieci szłoby przez pułapkę `set` starej
     * warstwy i rozsyłało `store:changed` dla każdej z nich. Przy dwóch
     * zadaniach koszt jednej paczki rósłby z każdą paczką, aż do zadławienia
     * przeglądarki.
     */
    function createReactive(target, path = "") {
        if (target && target[RAW]) target = target[RAW];
        if (Utils.isObject(target)) {
            for (const key of Object.keys(target)) {
                if (Utils.isObject(target[key])) {
                    target[key] = createReactive(target[key], path ? `${path}.${key}` : key);
                }
            }
        }

        return new Proxy(target, {
            get(obj, prop) {
                if (prop === RAW) return obj;
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
