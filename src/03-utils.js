    // ==========================================
    // 3. NARZĘDZIA I GENERATOR DOM
    // ==========================================
    const Utils = {
        /**
         * TRZY POZIOMY WYPISYWANIA (9.2.0) — i to nie jest ozdoba.
         *
         *   log()   — dziennik pracy. Idzie kilka linii NA KAŻDY przedmiot,
         *             więc przez zmianę to tysiące wpisów. Domyślnie wyłączony.
         *   error() — sytuacje nienormalne, ale takie, po których skrypt działa
         *             dalej (kursy nie przyszły, dziennik przepełniony, CSP
         *             tnie źródło). Też podlega wyłącznikowi: to informacja dla
         *             kogoś, kto akurat patrzy w konsolę, a nie dla nikogo.
         *   fatal() — skrypt NIE WSTAŁ albo się rozsypał. Wypisuje się ZAWSZE,
         *             bo cicha awaria startu wygląda jak „nic się nie stało”.
         *
         * Sprawdzenie idzie przez CONFIG.DEBUG_MODE, a nie przez stałą z góry
         * pliku, bo SH.logsOn() musi działać w locie — inaczej trzeba by
         * przewklejać skrypt w środku zmiany i zerować liczniki.
         */
        log(...args) { if (CONFIG.DEBUG_MODE) console.log(`[${CONFIG.SCRIPT_NAME} v${CONFIG.SCRIPT_VERSION}]`, ...args); },
        error(...args) { if (CONFIG.DEBUG_MODE) console.error(`[${CONFIG.SCRIPT_NAME} ERROR]`, ...args); },
        fatal(...args) { console.error(`[${CONFIG.SCRIPT_NAME} FATAL]`, ...args); },
        generateId(prefix = '') { return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`; },
        isObject(item) { return (item && typeof item === 'object' && !Array.isArray(item)); },
        /**
         * Scalanie z GŁĘBOKIM kopiowaniem zagnieżdżonych obiektów.
         *
         * 8.3.0 — kluczowa poprawka. Wcześniej gałąź „klucza nie ma w target”
         * robiła `Object.assign(output, { [key]: source[key] })`, czyli kładła
         * do stanu REFERENCJĘ do obiektu źródła. Przy `deepMerge({}, DEFAULT_LOCAL_CONFIG)`
         * target jest pusty, więc WSZYSTKIE zagnieżdżone bloki — linesConfig,
         * statsWindowPosition, priceCard — były jednym i tym samym obiektem
         * naraz w trzech miejscach.
         *
         * Skutek łapany ręcznie: przeciągnięto kartę ceny — nowa pozycja
         * zapisała się do wspólnego obiektu, czyli do SAMEGO DEFAULT_LOCAL_CONFIG,
         * — a przycisk „Zresetuj pozycję karty”, który robi
         * `{ ...DEFAULT_LOCAL_CONFIG.priceCard.position }`, posłusznie
         * przywracał już zepsutą wartość. Przycisk nie działał.
         *
         * Łapało się to tylko przy PIERWSZYM uruchomieniu na czystej
         * przeglądarce: za drugim razem loadAll() znajdował zapisaną
         * konfigurację, klucz był już w target, szła druga gałąź — i alias
         * rwał się sam.
         *
         * BEZPIECZEŃSTWO (9.2.0): klucze `__proto__`, `constructor`
         * i `prototype` są tu jawnie pomijane. Do scalania trafia JSON
         * z localStorage, a localStorage tej domeny dzielimy z samą aplikacją
         * TREX — spreparowana wartość mogłaby inaczej dopisać pole do
         * Object.prototype i zatruć każdy obiekt na stronie.
         */
        UNSAFE_KEYS: ['__proto__', 'constructor', 'prototype'],
        deepMerge(target, source) {
            const output = Utils.isObject(target) ? { ...target } : {};
            if (Utils.isObject(source)) {
                Object.keys(source).forEach(key => {
                    if (Utils.UNSAFE_KEYS.includes(key)) return;
                    if (Utils.isObject(source[key])) {
                        // Kopiujemy ZAWSZE — także wtedy, gdy klucza w target jeszcze nie ma.
                        output[key] = Utils.deepMerge(output[key], source[key]);
                    } else { output[key] = source[key]; }
                });
            }
            return output;
        },
        /** Głęboka kopia bloku ustawień. */
        clone(value) { return Utils.isObject(value) ? Utils.deepMerge({}, value) : value; },
        debounce(func, delay) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), delay);
            };
        },
        /**
         * Kolor HEX na trójkę „R, G, B” gotową do wstawienia w rgba().
         *
         * Regexp jest KOTWICZONY z obu stron celowo i to jest zabezpieczenie,
         * a nie kosmetyka: wynik trafia prosto do łańcucha CSS budowanego
         * w CSSManager. Gdyby wzorzec dopuszczał cokolwiek poza sześcioma
         * cyframi szesnastkowymi, wartość z zapisanej konfiguracji mogłaby
         * zamknąć regułę i dopisać własne — czyli wstrzyknąć CSS. Przy
         * niedopasowaniu wracamy do neutralnej szarości.
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
            if (isNaN(ms) || ms <= 0) return I18n.get('notApplicable');
            let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); const h = Math.floor(m / 60);
            s %= 60; m %= 60;
            const hS = I18n.get('hoursShort'), mS = I18n.get('minutesShort'), sS = I18n.get('secondsShort');
            if (h > 0) return `${h}${hS} ${String(m).padStart(2, '0')}${mS}`;
            else if (m > 0) return `${m}${mS} ${String(s).padStart(2, '0')}${sS}`;
            return `${s}${sS}`;
        },
        /**
         * Liczba z konfiguracji sprowadzona do bezpiecznego zakresu (9.2.0).
         *
         * Konfiguracja przychodzi z localStorage, czyli z miejsca, którego nie
         * kontrolujemy w całości. Rozmiar czcionki albo alfa wzięte stamtąd
         * wprost lądują w łańcuchu CSS; NaN albo `10px; position:fixed`
         * rozjechałyby regułę. Dlatego każda liczba idąca do stylu przechodzi
         * tędy.
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
     * Znaczników NIE składa się z łańcuchów: atrybuty i właściwości ustawia się
     * przez przypisanie, tekst — wyłącznie przez document.createTextNode. Tekst
     * z zewnątrz nigdy więc nie trafia do parsera HTML, czyli XSS jest wykluczony
     * konstrukcyjnie. To jest główna gwarancja bezpieczeństwa całego interfejsu
     * i dlatego w całym pliku nie ma ani jednego przypisania do innerHTML poza
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
