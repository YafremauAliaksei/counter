    // ==========================================
    // 3. NARZĘDZIA I GENERATOR DOM
    // ==========================================
    const Utils = {
        /**
         * Trzy poziomy wypisywania:
         *   log()   — dziennik pracy, kilka linii na przedmiot; pod wyłącznikiem.
         *   error() — sytuacja nienormalna, po której skrypt działa dalej
         *             (brak kursów, pełny dziennik, CSP); pod wyłącznikiem.
         *   fatal() — skrypt nie wstał albo się rozsypał; zawsze, bo cicha
         *             awaria startu wygląda jak „nic się nie stało”.
         *
         * Wyłącznikiem jest CONFIG.DEBUG_MODE, a nie stała z nagłówka, żeby
         * SH.logsOn() działało w locie, bez ponownego wklejania skryptu.
         */
        log(...args) { if (CONFIG.DEBUG_MODE) console.log(`[${CONFIG.SCRIPT_NAME} v${CONFIG.SCRIPT_VERSION}]`, ...args); },
        error(...args) { if (CONFIG.DEBUG_MODE) console.error(`[${CONFIG.SCRIPT_NAME} ERROR]`, ...args); },
        fatal(...args) { console.error(`[${CONFIG.SCRIPT_NAME} FATAL]`, ...args); },
        generateId(prefix = '') { return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`; },
        isObject(item) { return (item && typeof item === 'object' && !Array.isArray(item)); },
        /**
         * Scalanie z głębokim kopiowaniem. Zagnieżdżone obiekty źródła są
         * zawsze kopiowane, także gdy klucza w target nie ma — referencja
         * oznaczałaby, że stan w pamięci i DEFAULT_LOCAL_CONFIG dzielą jeden
         * obiekt, a zmiana stanu psuje wartości domyślne (np. reset pozycji
         * karty przywraca już zmienioną pozycję).
         *
         * Klucze `__proto__`, `constructor` i `prototype` są pomijane: do
         * scalania trafia JSON z localStorage, który dzielimy z T-REX,
         * a spreparowana wartość mogłaby dopisać pole do Object.prototype.
         */
        UNSAFE_KEYS: ['__proto__', 'constructor', 'prototype'],
        deepMerge(target, source) {
            const output = Utils.isObject(target) ? { ...target } : {};
            if (Utils.isObject(source)) {
                Object.keys(source).forEach(key => {
                    if (Utils.UNSAFE_KEYS.includes(key)) return;
                    if (Utils.isObject(source[key])) {
                        // Kopia zawsze — także wtedy, gdy klucza w target jeszcze nie ma.
                        output[key] = Utils.deepMerge(output[key], source[key]);
                    } else { output[key] = source[key]; }
                });
            }
            return output;
        },
        /**
         * Różnice między dwoma stanami ustawień: lista [ścieżka, nowa wartość]
         * dla każdego zmienionego liścia (undefined = klucz zniknął). Tablice
         * i wartości proste są liśćmi.
         *
         * Podstawa scalania ustawień wspólnych: karta nakłada na magazyn tylko
         * to, co sama zmieniła od ostatniej synchronizacji, zamiast pisać cały
         * obiekt z pamięci i wymazywać zmiany sąsiedniej karty.
         */
        diffPaths(base, current, prefix = [], out = []) {
            if (Utils.isObject(base) && Utils.isObject(current)) {
                const keys = new Set([...Object.keys(base), ...Object.keys(current)]);
                for (const key of keys) {
                    if (Utils.UNSAFE_KEYS.includes(key)) continue;
                    Utils.diffPaths(base[key], current[key], prefix.concat(key), out);
                }
            } else if (JSON.stringify(base) !== JSON.stringify(current)) {
                out.push([prefix, current]);
            }
            return out;
        },
        /** Nałożenie różnic z diffPaths na obiekt — w miejscu; zwraca ten obiekt. */
        applyPaths(target, changes) {
            for (const [path, value] of changes) {
                if (!path.length || path.some(k => Utils.UNSAFE_KEYS.includes(k))) continue;
                let node = target;
                for (const key of path.slice(0, -1)) {
                    if (!Utils.isObject(node[key])) node[key] = {};
                    node = node[key];
                }
                const last = path[path.length - 1];
                if (value === undefined) delete node[last];
                // Kopia, a nie referencja: stan w pamięci nie może dzielić
                // obiektów z tym, co idzie do magazynu.
                else node[last] = value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
            }
            return target;
        },
        /** Głęboka kopia bloku ustawień. */
        clone(value) { return Utils.isObject(value) ? Utils.deepMerge({}, value) : value; },
        /**
         * Odłożenie wywołania do chwili, gdy przez `delay` ms nic się nie działo.
         *
         * `.cancel()` gasi czekające wywołanie (rozbiórka egzemplarza nie może
         * po sekundzie nadpisać magazynu starym stanem), `.flush()` wykonuje je
         * od razu (zamknięcie karty nie może zgubić ostatniej zmiany).
         */
        debounce(func, delay) {
            let timeout = null;
            let pending = null;
            const run = () => {
                const call = pending;
                timeout = pending = null;
                if (call) func.apply(call.self, call.args);
            };
            const debounced = function(...args) {
                clearTimeout(timeout);
                pending = { self: this, args };
                timeout = setTimeout(run, delay);
            };
            debounced.cancel = () => { clearTimeout(timeout); timeout = pending = null; };
            debounced.flush = () => { clearTimeout(timeout); run(); };
            return debounced;
        },
        /**
         * Kolor HEX na „R, G, B” do wstawienia w rgba().
         *
         * Wyrażenie jest zakotwiczone z obu stron, bo wynik trafia wprost do
         * łańcucha CSS (CSSManager): cokolwiek poza sześcioma cyframi
         * szesnastkowymi mogłoby zamknąć regułę i dopisać własną. Przy
         * niedopasowaniu — neutralna szarość.
         */
        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '128, 128, 128';
        },
        formatTime(dateObject, showSeconds = true, separator = '') {
            if (!(dateObject instanceof Date) || isNaN(dateObject.getTime())) return showSeconds ? `00${separator}00${separator}00` : `00${separator}00`;
            const h = String(dateObject.getHours()).padStart(2, '0');
            const m = String(dateObject.getMinutes()).padStart(2, '0');
            if (!showSeconds) return `${h}${separator}${m}`;
            const s = String(dateObject.getSeconds()).padStart(2, '0');
            return `${h}${separator}${m}${separator}${s}`;
        },
        timeStringToDate(timeStr, baseDate = new Date(), crossesMidnight = false) {
            const h = parseInt(timeStr.substring(0, 2), 10);
            const m = parseInt(timeStr.substring(2, 4), 10);
            const d = new Date(baseDate);
            d.setHours(h, m, 0, 0);
            if (crossesMidnight) d.setDate(d.getDate() + 1);
            return d;
        },
        formatDuration(ms) {
            // Number.isFinite, a nie isNaN: nieskończoność przechodzi przez
            // isNaN i dałaby na ekranie „Infinityg NaNm”.
            if (!Number.isFinite(ms) || ms <= 0) return I18n.get('notApplicable');
            let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); const h = Math.floor(m / 60);
            s %= 60; m %= 60;
            const hS = I18n.get('hoursShort'), mS = I18n.get('minutesShort'), sS = I18n.get('secondsShort');
            if (h > 0) return `${h}${hS} ${String(m).padStart(2, '0')}${mS}`;
            else if (m > 0) return `${m}${mS} ${String(s).padStart(2, '0')}${sS}`;
            return `${s}${sS}`;
        },
        /**
         * Godzina i minuta ze znacznika czasu — `18:32`. Bez daty: zadanie
         * mieści się w jednej zmianie, a kolumna panelu jest wąska.
         */
        formatClock(ms) {
            const d = new Date(Number(ms));
            if (isNaN(d.getTime())) return '—';
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
        /**
         * Udział w procentach, z odrzuceniem części ułamkowej.
         *
         * Odrzucenie, a nie zaokrąglenie: procent sprzedaży nie może obiecywać
         * więcej, niż zrobiono (1 z 17 to 5,88% — na ekranie 5%, nie 6%).
         * Mnożenie idzie przed dzieleniem, bo `(29/100)*100` daje
         * 28.999999999999996. Wynik zamknięty w 0-100 także przy danych
         * niespójnych (licznik poprawiony ręcznie w dół, sprzedane nie).
         */
        percentFloor(part, whole) {
            const p = Number(part), w = Number(whole);
            if (!isFinite(p) || !isFinite(w) || w <= 0 || p <= 0) return 0;
            return Math.max(0, Math.min(100, Math.floor(p * 100 / w)));
        },
        /**
         * Liczba z konfiguracji sprowadzona do zakresu; NaN i śmieci dają
         * `fallback`. Każda liczba idąca do stylu przechodzi tędy — wartość
         * z localStorage w rodzaju `10px; position:fixed` rozjechałaby regułę CSS.
         */
        clampNum(value, min, max, fallback) {
            const n = Number(value);
            if (!isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, n));
        }
    };

    /**
     * Generator DOM w stylu hyperscript.
     *
     * Znaczniki nie powstają z łańcuchów: atrybuty i właściwości ustawia się
     * przypisaniem, tekst wyłącznie przez document.createTextNode. Tekst
     * z zewnątrz nigdy nie trafia do parsera HTML, więc XSS jest wykluczony
     * konstrukcyjnie — dlatego w pliku nie ma przypisania do innerHTML poza
     * czyszczeniem (`= ''`).
     */
    function h(tag, props = {}, ...children) {
        const el = document.createElement(tag);
        for (const[k, v] of Object.entries(props)) {
            if (k.startsWith('on') && typeof v === 'function') {
                el.addEventListener(k.substring(2).toLowerCase(), v);
            } else if (k === 'style' && typeof v === 'object') {
                Object.assign(el.style, v);
            } else if (k === 'dataset' && typeof v === 'object') {
                for (const[dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
            } else if (k === 'className') {
                el.className = v;
            } else if (k === 'id') {
                el.id = v.startsWith(CONFIG.SCRIPT_ID_PREFIX) ? v : CONFIG.SCRIPT_ID_PREFIX + v;
            } else {
                el[k] = v;
            }
        }
        const append = (child) => {
            if (Array.isArray(child)) child.forEach(append);
            else if (child instanceof Node) el.appendChild(child);
            else if (child !== null && child !== undefined) el.appendChild(document.createTextNode(String(child)));
        };
        children.forEach(append);
        return el;
    }
