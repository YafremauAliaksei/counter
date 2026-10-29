/**
 * playground/session-probe.js — sonda przycisku sesji T-REX.
 *
 * NARZĘDZIE BADAWCZE, NIE CZĘŚĆ LICZNIKA. Nie wchodzi do counter.js, nie ma
 * testów produktu i nie obowiązuje go zasada „po wklejeniu milczy”: po to
 * jest, żeby patrzeć i zapisywać. Uruchamia się drugą zakładką, obok
 * licznika, i działa niezależnie od niego.
 *
 * CO ZBIERA (wszystko w localStorage pod kluczem PROBE_KEY, przeżywa F5):
 *   - stan przycisku sesji (button[data-testid="clear-session-icon"], ten sam
 *     wybór co w liczniku — nie po tekście): jest / zablokowany / schowany /
 *     brak, z chwilą zmiany, działem z adresu i polami widocznymi na ekranie;
 *   - przy każdej zmianie stanu: opis przycisku (atrybuty, klasy, położenie,
 *     styl wyliczony, łańcuch rodziców, ikona) i stos elementów w miejscu,
 *     gdzie stał (elementsFromPoint) — z kursorem każdego, żeby znaleźć
 *     „zaślepkę” z kursorem not-allowed, gdy przycisku nie ma;
 *   - obsługę kliknięcia, jaką widać z poziomu strony: właściwości Reacta
 *     (__reactProps$…, __reactFiber$… z nazwami komponentów i kodem
 *     funkcji onClick), ślady Angulara i Vue;
 *   - ŚLAD po każdym kliknięciu przycisku sesji, „Kontynuuj” albo klona
 *     (TRACE_MS): zapytania sieciowe (fetch, XHR, WebSocket — adres, metoda,
 *     status, początek treści), zmiany adresu (history), elementy, które się
 *     pojawiły i zniknęły (data-testid, role, przyciski, pola).
 *
 * KLON. Przeciągany przycisk w kolorze sondy, domyślnie na lewo od
 * oryginału. Gdy oryginał jest aktywny, klon klika oryginał. Gdy oryginału
 * nie ma albo jest zablokowany, klon otwiera trzy próby w panelu sondy —
 * każda za potwierdzeniem i każda z własnym śladem:
 *   1. kliknięcie elementu-zaślepki w miejscu przycisku;
 *   2. wywołanie obsługi onClick z Reacta mimo blokady;
 *   3. powtórzenie zapytań sieciowych zapisanych przy ostatnim udanym
 *      resecie wykonanym ręcznie.
 *
 * NAGRYWANIE RĘCZNE. „Nagraj reset” zaczyna ślad bez limitu czasu, „Stop”
 * go kończy. W tym czasie zapisuje się wszystko, z pełnymi treściami
 * zapytań i odpowiedzi: przycisk sesji, okno potwierdzenia, skan stacji.
 * Każde zapytanie jest rozbite na pola (JSON, formularz, parametry adresu),
 * a przy każdej wartości stoi, gdzie na stronie leży ta sama wartość: adres,
 * pole formularza, localStorage, sessionStorage, ciasteczko, meta, tekst
 * strony, odpowiedź wcześniejszego zapytania. Raport porównuje nagrania
 * między sobą: pole stałe da się wpisać na sztywno, zmienne trzeba skądś
 * wziąć, a zmienne bez źródła na stronie (jednorazowy token) — nie da się.
 *
 * POLA STACJI I LPN. Enter w polu z wartością `ws…` albo `LPN…` zapisuje
 * opis pola (data-testid, aria-label, placeholder, name) dla działu z adresu
 * — skąd skrót „u, s” licznika ma wziąć pole stacji w REFURB i WHD.
 *
 * RAPORT. „Kopiuj raport” kładzie JSON do schowka (albo pokazuje pole do
 * zaznaczenia), „Zapisz plik” pobiera go jako plik. Wartości nagłówków, które
 * wyglądają na tajne (authorization, cookie, csrf, token), są w raporcie
 * zakryte; pełne zostają tylko w tej przeglądarce, na potrzeby próby 3.
 *
 * Tekst panelu jest częścią document.body.innerText, który czyta licznik:
 * panel nie pokazuje więc żadnych zapisanych danych (LPN, napisy T-REX),
 * tylko stan i liczby, a przerysowuje się wyłącznie przy zmianie stanu.
 */
(function () {
    'use strict';

    const PROBE_KEY = 'sessionProbe';
    const BUTTON_TESTID = 'clear-session-icon';
    const CONTINUE_TESTID = 'button-clear-session-continue-socrates';
    const TRACE_MS = 15000;
    const POLL_MS = 500;
    const MAX_EVENTS = 300;
    const MAX_SNAPSHOTS = 40;
    const MAX_TRACES = 12;
    const MAX_TRACE_ITEMS = 200;
    const MAX_REQUESTS = 60;
    const MAX_TEXT = 2000;
    const MAX_TEXT_MANUAL = 20000;
    const MAX_FIELDS = 60;
    // Pola treści zapytania, których wartości raport nie pokazuje — tylko
    // odcisk i długość, żeby było widać, czy zmieniają się między nagraniami.
    const SECRET_FIELD = /token|nonce|csrf|xsrf|signature|secret|password|passwd|auth/i;
    const MAX_STORE_CHARS = 2500000;
    const SECRET_HEADER = /authorization|cookie|csrf|xsrf|token|secret|session/i;
    const COUNTER_ID = /^statsHelper_/;

    // Drugie kliknięcie zakładki chowa albo pokazuje panel, zamiast
    // uruchamiać drugą sondę obok pierwszej.
    if (window.__sessionProbe) {
        window.__sessionProbe.toggle();
        return;
    }

    // ---------------- magazyn ----------------
    const blank = () => ({
        startedAt: Date.now(),
        events: [],
        snapshots: {},
        snapshotOrder: [],
        traces: [],
        requests: [],
        replay: null,
        ui: { panel: { left: 12, top: 12 }, clone: null, collapsed: false },
        manual: null,
        stationFields: {},
        lpnFields: {},
    });
    let data = blank();
    try {
        const raw = localStorage.getItem(PROBE_KEY);
        if (raw) data = Object.assign(blank(), JSON.parse(raw));
    } catch (e) {
        data = blank();
    }

    let saveTimer = null;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 1000);
    }
    function saveNow() {
        clearTimeout(saveTimer);
        let text = JSON.stringify(data);
        // Magazyn ma kilka MB na domenę i dzieli go z T-REX i licznikiem:
        // przy przepełnieniu odpadają najstarsze ślady, potem zdarzenia.
        while (
            text.length > MAX_STORE_CHARS &&
            (data.traces.length > 1 || data.events.length > 50)
        ) {
            if (data.traces.length > 1) data.traces.shift();
            else data.events.splice(0, 50);
            text = JSON.stringify(data);
        }
        try {
            localStorage.setItem(PROBE_KEY, text);
        } catch (e) {
            note('magazyn', 'zapis odrzucony: ' + String(e && e.name));
        }
    }
    window.addEventListener('pagehide', saveNow);

    const cut = (s, n = MAX_TEXT) => {
        const t = String(s == null ? '' : s);
        return t.length > n ? t.slice(0, n) + '…[' + t.length + ']' : t;
    };
    const push = (arr, item, max) => {
        arr.push(item);
        if (arr.length > max) arr.splice(0, arr.length - max);
    };

    // ---------------- kontekst strony ----------------
    function department() {
        const m = /gradingMode=([A-Z_]+)/i.exec(location.search || '');
        return m ? m[1] : '?';
    }
    function isOurs(el) {
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            if (n.id && (n.id.startsWith('sessionProbe') || COUNTER_ID.test(n.id))) return true;
        }
        return false;
    }
    function visible(el) {
        if (!el || !el.isConnected) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
    }
    /** Pola i przyciski z data-testid widoczne teraz — „który to krok”. */
    function screenFields() {
        const out = [];
        document.querySelectorAll('[data-testid]').forEach((el) => {
            if (out.length >= 30 || isOurs(el) || !visible(el)) return;
            const tag = el.tagName.toLowerCase();
            if (!['input', 'button', 'select', 'textarea'].includes(tag)) return;
            out.push(tag + ':' + el.getAttribute('data-testid') + (el.disabled ? '(off)' : ''));
        });
        return out;
    }
    function selectorOf(el) {
        if (!el || el.nodeType !== 1) return String(el);
        let s = el.tagName.toLowerCase();
        if (el.id) s += '#' + el.id;
        const tid = el.getAttribute('data-testid');
        if (tid) s += '[data-testid="' + tid + '"]';
        const cls = typeof el.className === 'string' ? el.className.trim() : '';
        if (cls) s += '.' + cls.split(/\s+/).slice(0, 4).join('.');
        return s;
    }
    function attrs(el) {
        const out = {};
        for (const a of Array.from(el.attributes || [])) out[a.name] = cut(a.value, 300);
        return out;
    }
    const STYLE_KEYS = [
        'display',
        'visibility',
        'opacity',
        'cursor',
        'pointerEvents',
        'position',
        'zIndex',
        'width',
        'height',
        'backgroundColor',
        'color',
        'borderRadius',
        'filter',
    ];
    function style(el) {
        const cs = getComputedStyle(el);
        const out = {};
        STYLE_KEYS.forEach((k) => {
            out[k] = cs[k];
        });
        return out;
    }
    function rect(el) {
        const r = el.getBoundingClientRect();
        return {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
        };
    }

    // ---------------- obsługa kliknięcia widoczna ze strony ----------------
    /** Właściwości frameworka na węźle: React, Angular, Vue. */
    function frameworkInfo(el) {
        const info = {};
        for (const key of Object.keys(el)) {
            if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$')) {
                const props = el[key] || {};
                info.reactProps = {};
                for (const [k, v] of Object.entries(props)) {
                    if (k === 'children') continue;
                    info.reactProps[k] =
                        typeof v === 'function'
                            ? {
                                  fn: v.name || '(anonim)',
                                  args: v.length,
                                  code: cut(v.toString(), 1500),
                              }
                            : cut(typeof v === 'object' ? JSON.stringify(safeJson(v)) : v, 300);
                }
            } else if (
                key.startsWith('__reactFiber$') ||
                key.startsWith('__reactInternalInstance$')
            ) {
                info.reactComponents = fiberChain(el[key]);
            } else if (key === '__ngContext__') {
                info.angular = true;
            } else if (key === '__vue__' || key === '__vueParentComponent') {
                info.vue = true;
            }
        }
        if (el.attributes && el.attributes.length) {
            const ng = Array.from(el.attributes).filter(
                (a) => a.name.startsWith('_ngcontent') || a.name.startsWith('ng-')
            );
            if (ng.length) info.angularAttrs = ng.map((a) => a.name);
        }
        return info;
    }
    function safeJson(v) {
        try {
            return JSON.parse(JSON.stringify(v));
        } catch (e) {
            return '[nieserializowalne]';
        }
    }
    /** Nazwy komponentów w górę drzewa Reacta i to, który z nich ma onClick. */
    function fiberChain(fiber) {
        const out = [];
        for (let f = fiber, i = 0; f && i < 25; f = f.return, i++) {
            const t = f.type;
            const name = typeof t === 'string' ? t : t && (t.displayName || t.name);
            if (!name) continue;
            const p = f.memoizedProps || {};
            const handlers = Object.keys(p).filter(
                (k) => /^on[A-Z]/.test(k) && typeof p[k] === 'function'
            );
            out.push(handlers.length ? name + ' {' + handlers.join(',') + '}' : name);
        }
        return out;
    }
    function reactProps(el) {
        for (const key of Object.keys(el)) {
            if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$'))
                return el[key];
        }
        return null;
    }

    // ---------------- opis przycisku i miejsca po nim ----------------
    function describe(el) {
        const chain = [];
        for (let n = el.parentElement, i = 0; n && i < 8; n = n.parentElement, i++)
            chain.push(selectorOf(n));
        const icon = el.querySelector('svg, img, i, span');
        return {
            selector: selectorOf(el),
            tag: el.tagName.toLowerCase(),
            attrs: attrs(el),
            disabled: !!el.disabled,
            text: cut((el.innerText || '').trim(), 120),
            title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
            rect: rect(el),
            style: style(el),
            parents: chain,
            icon: icon ? { selector: selectorOf(icon), outer: cut(icon.outerHTML, 1200) } : null,
            outer: cut(el.outerHTML, 2500),
            framework: frameworkInfo(el),
        };
    }
    /** Stos elementów w punkcie, gdzie stał przycisk — kursor każdego z nich. */
    function stackAt(r) {
        if (!r) return [];
        const x = r.x + r.w / 2;
        const y = r.y + r.h / 2;
        return document
            .elementsFromPoint(x, y)
            .filter((el) => !isOurs(el))
            .slice(0, 8)
            .map((el) => ({
                selector: selectorOf(el),
                cursor: getComputedStyle(el).cursor,
                pointerEvents: getComputedStyle(el).pointerEvents,
                disabled: !!el.disabled,
                ariaDisabled: el.getAttribute('aria-disabled'),
                title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
                rect: rect(el),
                framework: Object.keys(frameworkInfo(el)),
            }));
    }
    /** Element-zaślepka: pierwszy w stosie z kursorem not-allowed. */
    function placeholder() {
        const r = data.lastRect;
        if (!r) return null;
        const els = document
            .elementsFromPoint(r.x + r.w / 2, r.y + r.h / 2)
            .filter((el) => !isOurs(el));
        return els.find((el) => getComputedStyle(el).cursor === 'not-allowed') || null;
    }
    function snapshot(kind, el) {
        const d = describe(el);
        const key = kind + ':' + hash(d.outer + JSON.stringify(d.style));
        if (!data.snapshots[key]) {
            data.snapshots[key] = Object.assign(
                { firstAt: Date.now(), department: department() },
                d
            );
            push(data.snapshotOrder, key, MAX_SNAPSHOTS);
            for (const k of Object.keys(data.snapshots))
                if (!data.snapshotOrder.includes(k)) delete data.snapshots[k];
        }
        return key;
    }
    function hash(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }

    // ---------------- zdarzenia ----------------
    function note(type, detail, extra) {
        push(
            data.events,
            Object.assign({ at: Date.now(), type, detail, department: department() }, extra || {}),
            MAX_EVENTS
        );
        save();
    }

    let lastState = null;
    function buttonState() {
        const el = document.querySelector('button[data-testid="' + BUTTON_TESTID + '"]');
        if (!el) return { state: placeholder() ? 'zaslepka' : 'brak', el: null };
        if (!visible(el)) return { state: 'schowany', el };
        return {
            state:
                el.disabled || el.getAttribute('aria-disabled') === 'true'
                    ? 'zablokowany'
                    : 'aktywny',
            el,
        };
    }
    function check() {
        const { state, el } = buttonState();
        if (el && visible(el)) data.lastRect = rect(el);
        if (state === lastState) return;
        const prev = lastState;
        lastState = state;
        const extra = { fields: screenFields(), stack: stackAt(data.lastRect) };
        if (el) extra.snapshot = snapshot('button', el);
        const ph = state === 'zaslepka' ? placeholder() : null;
        if (ph) extra.placeholder = snapshot('placeholder', ph);
        note('stan', (prev || 'start') + ' -> ' + state, extra);
        render();
        placeClone();
    }

    // ---------------- ślad po kliknięciu ----------------
    let trace = null;
    function startTrace(reason, isTrusted, manual) {
        if (trace) finishTrace();
        trace = {
            reason,
            trusted: !!isTrusted,
            manual: !!manual,
            at: Date.now(),
            department: department(),
            url: location.pathname + location.search,
            before: screenFields(),
            items: [],
            requests: [],
        };
        data.traces.push(trace);
        if (data.traces.length > MAX_TRACES) data.traces.shift();
        // Nagranie ręczne trwa do „Stop”; ślad po kliknięciu — TRACE_MS.
        if (!manual) trace.timer = setTimeout(finishTrace, TRACE_MS);
        render();
    }
    function startManual() {
        data.manual = { at: Date.now(), department: department() };
        startTrace('reczny', true, true);
        note('reczny', 'start');
        saveNow();
    }
    function stopManual() {
        note('reczny', 'stop');
        data.manual = null;
        finishTrace();
        saveNow();
        flash('nagranie zapisane — „Kopiuj raport” albo „Zapisz plik”');
    }
    function finishTrace() {
        if (!trace) return;
        clearTimeout(trace.timer);
        delete trace.timer;
        trace.after = screenFields();
        trace = null;
        save();
        render();
    }
    function traceItem(item) {
        if (!trace || trace.items.length >= (trace.manual ? MAX_TRACE_ITEMS * 5 : MAX_TRACE_ITEMS))
            return;
        trace.items.push(Object.assign({ t: Date.now() - trace.at }, item));
    }
    /** Element wart zapisania w śladzie: ma data-testid, rolę albo jest polem lub przyciskiem. */
    function notable(el) {
        if (!el || el.nodeType !== 1 || isOurs(el)) return null;
        const tag = el.tagName.toLowerCase();
        if (
            el.getAttribute('data-testid') ||
            el.getAttribute('role') ||
            ['button', 'input', 'dialog', 'form'].includes(tag)
        ) {
            return selectorOf(el);
        }
        const inner =
            el.querySelector && el.querySelector('[data-testid], [role="dialog"], button, input');
        return inner && !isOurs(inner) ? selectorOf(el) + ' > ' + selectorOf(inner) : null;
    }

    const observer = new MutationObserver((records) => {
        let relevant = false;
        for (const r of records) {
            if (isOurs(r.target)) continue;
            relevant = true;
            if (!trace) continue;
            r.addedNodes.forEach((n) => {
                const s = notable(n);
                if (s) traceItem({ dom: '+', el: s });
            });
            r.removedNodes.forEach((n) => {
                const s = notable(n);
                if (s) traceItem({ dom: '-', el: s });
            });
            if (
                r.type === 'attributes' &&
                ['disabled', 'aria-disabled', 'class', 'style'].includes(r.attributeName)
            ) {
                const tid = r.target.getAttribute && r.target.getAttribute('data-testid');
                if (tid)
                    traceItem({ dom: 'attr', el: selectorOf(r.target), attr: r.attributeName });
            }
        }
        if (relevant) scheduleCheck();
    });
    let checkTimer = null;
    function scheduleCheck() {
        if (checkTimer) return;
        checkTimer = setTimeout(() => {
            checkTimer = null;
            check();
        }, 150);
    }

    // Kliknięcia przycisku sesji i „Kontynuuj” — prawdziwe (isTrusted) i ze skryptów.
    document.addEventListener(
        'click',
        (e) => {
            const any =
                e.target && e.target.closest && e.target.closest('button, [role="button"], a');
            if (!any || isOurs(any)) return;
            // W nagraniu ręcznym liczy się każde kliknięcie, także przycisków
            // bez data-testid — okno potwierdzenia bywa zbudowane inaczej.
            if (trace && trace.manual) {
                traceItem({
                    click: selectorOf(any),
                    text: cut((any.innerText || '').trim(), 80),
                    trusted: e.isTrusted,
                    framework: frameworkInfo(any),
                });
                if (any.getAttribute('data-testid') === CONTINUE_TESTID) snapshot('continue', any);
                return;
            }
            const t = any.closest('button[data-testid]');
            if (!t) return;
            const tid = t.getAttribute('data-testid');
            if (tid !== BUTTON_TESTID && tid !== CONTINUE_TESTID) return;
            if (tid === CONTINUE_TESTID) snapshot('continue', t);
            note('klik', tid, { trusted: e.isTrusted, fields: screenFields() });
            startTrace('klik ' + tid, e.isTrusted);
        },
        true
    );

    /** Opis pola tak, żeby dało się je znaleźć bez tekstu: data-testid, aria, placeholder, name. */
    function fieldInfo(el) {
        return {
            selector: selectorOf(el),
            testid: el.getAttribute('data-testid'),
            ariaLabel: el.getAttribute('aria-label'),
            placeholder: el.getAttribute('placeholder'),
            name: el.getAttribute('name'),
            type: el.getAttribute('type'),
        };
    }
    function rememberField(map, info) {
        const dept = department();
        const list = map[dept] || (map[dept] = []);
        if (!list.some((f) => f.selector === info.selector)) list.push(info);
        if (list.length > 6) list.shift();
    }
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Enter') return;
            const el = e.target;
            if (!el || el.tagName !== 'INPUT' || isOurs(el)) return;
            const value = String(el.value || '').trim();
            const info = fieldInfo(el);
            if (/^ws[_-]/i.test(value)) rememberField(data.stationFields, info);
            else if (/^lpn/i.test(value)) rememberField(data.lpnFields, info);
            if (trace) traceItem(Object.assign({ enter: true, value: cut(value, 80) }, info));
            save();
        },
        true
    );

    // ---------------- pola zapytania i ich źródła ----------------
    /** Treść zapytania rozbita na pola: JSON, formularz albo tekst; do tego parametry adresu. */
    function requestFields(url, body) {
        const out = {};
        const add = (k, v) => {
            if (Object.keys(out).length < MAX_FIELDS) out[k] = v;
        };
        const walk = (v, path) => {
            if (v && typeof v === 'object') {
                for (const [k, x] of Object.entries(v)) walk(x, path ? path + '.' + k : k);
            } else add(path || '(wartosc)', v);
        };
        try {
            const u = new URL(url, location.href);
            u.searchParams.forEach((v, k) => add('query.' + k, v));
        } catch (e) {
            /* adres względny bez bazy — pomijamy parametry */
        }
        const text = typeof body === 'string' ? body : '';
        if (!text) return out;
        try {
            walk(JSON.parse(text), 'body');
            return out;
        } catch (e) {
            /* nie JSON */
        }
        if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(text)) {
            new URLSearchParams(text).forEach((v, k) => add('form.' + k, v));
        } else add('body(tekst)', cut(text, 300));
        return out;
    }
    /** Gdzie na stronie leży ta sama wartość — skąd emulacja może ją wziąć. */
    function sourcesOf(value) {
        const v = String(value == null ? '' : value);
        if (v.length < 3 || /^(true|false|null)$/.test(v)) return [];
        const out = [];
        const has = (t) => typeof t === 'string' && t.includes(v);
        if (has(location.href)) out.push('adres strony');
        document.querySelectorAll('input, textarea, select').forEach((el) => {
            if (!isOurs(el) && has(el.value)) out.push('pole ' + selectorOf(el));
        });
        for (const [name, store] of [
            ['localStorage', window.localStorage],
            ['sessionStorage', window.sessionStorage],
        ]) {
            try {
                for (let i = 0; i < store.length; i++) {
                    const k = store.key(i);
                    if (k !== PROBE_KEY && has(store.getItem(k))) out.push(name + ' ' + k);
                }
            } catch (e) {
                /* magazyn zablokowany */
            }
        }
        if (has(document.cookie)) out.push('ciasteczko (bez HttpOnly)');
        document.querySelectorAll('meta[content]').forEach((m) => {
            if (has(m.getAttribute('content')))
                out.push('meta ' + (m.getAttribute('name') || m.getAttribute('property') || ''));
        });
        if (trace) {
            for (const r of trace.requests) {
                if (has(r.response)) out.push('odpowiedz ' + r.method + ' ' + pathOf(r.url));
            }
        }
        if (has(document.body.innerText)) out.push('tekst strony');
        return out.slice(0, 12);
    }
    function pathOf(url) {
        try {
            const u = new URL(url, location.href);
            return u.origin + u.pathname;
        } catch (e) {
            return String(url).split('?')[0];
        }
    }

    // ---------------- sieć ----------------
    function logRequest(entry) {
        push(
            data.requests,
            {
                at: entry.at,
                method: entry.method,
                url: cut(entry.url, 300),
                status: entry.status,
                ms: entry.ms,
                kind: entry.kind,
            },
            MAX_REQUESTS
        );
        // Zapis do magazynu tylko w trakcie śladu: T-REX potrafi odpytywać
        // serwer co chwilę, a każdy zapis to serializacja całej sondy.
        if (trace && trace.manual) {
            entry.fields = requestFields(entry.url, entry.fullBody);
            entry.sources = {};
            for (const [k, v] of Object.entries(entry.fields)) {
                const src = sourcesOf(v);
                if (src.length) entry.sources[k] = src;
            }
            entry.headerSources = {};
            for (const [k, v] of Object.entries(entry.headers || {})) {
                const src = sourcesOf(v);
                if (src.length) entry.headerSources[k] = src;
            }
        }
        delete entry.fullBody;
        if (trace) {
            trace.requests.push(entry);
            if (trace.requests.length > 60) trace.requests.shift();
            save();
        }
    }
    function headersOf(h) {
        const out = {};
        if (!h) return out;
        if (typeof h.forEach === 'function' && !Array.isArray(h))
            h.forEach((v, k) => {
                out[k] = v;
            });
        else if (Array.isArray(h))
            h.forEach(([k, v]) => {
                out[k] = v;
            });
        else Object.assign(out, h);
        return out;
    }
    const origFetch = window.fetch;
    if (origFetch) {
        window.fetch = function (input, init) {
            const started = Date.now();
            const url = typeof input === 'string' ? input : input && input.url;
            const method = (init && init.method) || (input && input.method) || 'GET';
            const body =
                init && typeof init.body === 'string'
                    ? init.body
                    : init && init.body
                      ? '[' + typeof init.body + ']'
                      : '';
            const headers = headersOf((init && init.headers) || (input && input.headers));
            const p = origFetch.apply(this, arguments);
            const traced = !!trace;
            const cap = trace && trace.manual ? MAX_TEXT_MANUAL : MAX_TEXT;
            p.then(
                (res) => {
                    const entry = {
                        kind: 'fetch',
                        at: started,
                        method,
                        url: String(url),
                        status: res.status,
                        ms: Date.now() - started,
                        body: cut(body, cap),
                        fullBody: body,
                        headers,
                        responseHeaders: headersOf(res.headers),
                    };
                    if (traced) {
                        res.clone()
                            .text()
                            .then(
                                (t) => {
                                    entry.response = cut(t, cap);
                                    logRequest(entry);
                                },
                                () => logRequest(entry)
                            );
                    } else logRequest(entry);
                },
                (err) =>
                    logRequest({
                        kind: 'fetch',
                        at: started,
                        method,
                        url: String(url),
                        status: 'blad: ' + String(err && err.message),
                        ms: Date.now() - started,
                        body: cut(body),
                        headers,
                    })
            );
            return p;
        };
    }
    const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (XHR) {
        const open = XHR.open;
        const send = XHR.send;
        const setHeader = XHR.setRequestHeader;
        XHR.open = function (method, url) {
            this.__probe = { kind: 'xhr', method, url: String(url), headers: {} };
            return open.apply(this, arguments);
        };
        XHR.setRequestHeader = function (k, v) {
            if (this.__probe) this.__probe.headers[k] = v;
            return setHeader.apply(this, arguments);
        };
        XHR.send = function (body) {
            const info = this.__probe;
            if (info) {
                info.at = Date.now();
                const cap = trace && trace.manual ? MAX_TEXT_MANUAL : MAX_TEXT;
                info.fullBody = typeof body === 'string' ? body : '';
                info.body = cut(
                    typeof body === 'string' ? body : body ? '[' + typeof body + ']' : '',
                    cap
                );
                const traced = !!trace;
                this.addEventListener('loadend', () => {
                    info.status = this.status;
                    info.ms = Date.now() - info.at;
                    if (traced) {
                        info.responseHeaders = this.getAllResponseHeaders();
                        try {
                            info.response = cut(this.responseText, cap);
                        } catch (e) {
                            info.response = '[' + this.responseType + ']';
                        }
                    }
                    logRequest(info);
                });
            }
            return send.apply(this, arguments);
        };
    }
    const WS = window.WebSocket && window.WebSocket.prototype;
    if (WS) {
        const wsSend = WS.send;
        WS.send = function (msg) {
            if (trace)
                logRequest({
                    kind: 'ws',
                    at: Date.now(),
                    method: 'SEND',
                    url: String(this.url),
                    status: '',
                    ms: 0,
                    body: cut(
                        typeof msg === 'string' ? msg : '[' + typeof msg + ']',
                        MAX_TEXT_MANUAL
                    ),
                    fullBody: typeof msg === 'string' ? msg : '',
                });
            return wsSend.apply(this, arguments);
        };
    }
    ['pushState', 'replaceState'].forEach((m) => {
        const orig = history[m];
        history[m] = function (state, title, url) {
            if (trace) traceItem({ route: m, url: cut(url, 300) });
            return orig.apply(this, arguments);
        };
    });
    window.addEventListener('popstate', () =>
        traceItem({ route: 'popstate', url: location.pathname + location.search })
    );

    // ---------------- raport ----------------
    /** Wartość zakryta: odcisk i długość — widać, czy się zmienia, a nie co to jest. */
    function hidden(v) {
        const t = String(v == null ? '' : v);
        return '[ukryte #' + hash(t) + ' dl. ' + t.length + ']';
    }
    /**
     * Porównanie nagrań ręcznych: zapytania zapisujące (nie GET) pogrupowane
     * po metodzie i ścieżce; dla każdego pola — wartości ze wszystkich
     * nagrań, czy jest stałe i gdzie jego wartość leżała na stronie.
     */
    function analysis() {
        const groups = {};
        data.traces
            .filter((t) => t.manual)
            .forEach((t, n) => {
                t.requests
                    .filter((r) => String(r.method).toUpperCase() !== 'GET')
                    .forEach((r) => {
                        const key = r.method + ' ' + pathOf(r.url);
                        const g =
                            groups[key] ||
                            (groups[key] = { departments: [], count: 0, fields: {}, headers: {} });
                        g.count++;
                        if (!g.departments.includes(t.department)) g.departments.push(t.department);
                        for (const [k, v] of Object.entries(r.fields || {})) {
                            const f = g.fields[k] || (g.fields[k] = { values: [], sources: [] });
                            f.values.push(
                                (SECRET_FIELD.test(k) ? hidden(v) : cut(v, 120)) +
                                    ' (nagranie ' +
                                    (n + 1) +
                                    ')'
                            );
                            for (const s of (r.sources || {})[k] || [])
                                if (!f.sources.includes(s)) f.sources.push(s);
                        }
                        for (const [k, v] of Object.entries(r.headers || {})) {
                            const h =
                                g.headers[k] ||
                                (g.headers[k] = { values: [], seen: 0, sources: [] });
                            const shown = SECRET_HEADER.test(k) ? hidden(v) : cut(v, 120);
                            h.seen++;
                            if (!h.values.includes(shown)) h.values.push(shown);
                            for (const src of (r.headerSources || {})[k] || [])
                                if (!h.sources.includes(src)) h.sources.push(src);
                        }
                    });
            });
        for (const g of Object.values(groups)) {
            for (const f of Object.values(g.fields)) {
                const bare = new Set(f.values.map((x) => x.replace(/ \(nagranie \d+\)$/, '')));
                f.constant = bare.size === 1 && f.values.length > 1;
                // Liczba blisko „teraz” (sekundy albo milisekundy) to znacznik
                // czasu — emulacja wstawi własny, to nie jest token.
                const looksLikeTime = [...bare].every((x) => {
                    const n = Number(x);
                    const now = Date.now();
                    return (
                        Number.isFinite(n) &&
                        (Math.abs(n - now) < 864e5 * 30 || Math.abs(n * 1000 - now) < 864e5 * 30)
                    );
                });
                f.verdict =
                    f.values.length < 2
                        ? 'jedno nagranie — nagraj jeszcze raz, żeby porównać'
                        : f.constant
                          ? 'stałe — można wpisać na sztywno'
                          : f.sources.length
                            ? 'zmienne — do wzięcia ze strony: ' + f.sources.join(', ')
                            : looksLikeTime
                              ? 'zmienne — znacznik czasu, emulacja wstawi bieżący'
                              : 'zmienne bez źródła na stronie — możliwy jednorazowy token';
            }
            for (const h of Object.values(g.headers)) {
                h.verdict =
                    h.seen < 2
                        ? 'jedno nagranie — nagraj jeszcze raz, żeby porównać'
                        : h.values.length === 1
                          ? 'stały'
                          : h.sources.length
                            ? 'zmienny — do wzięcia ze strony: ' + h.sources.join(', ')
                            : 'zmienny bez źródła na stronie (' + h.values.length + ' różnych)';
            }
        }
        return groups;
    }
    function report() {
        const redact = (h) => {
            const out = {};
            for (const [k, v] of Object.entries(h || {}))
                out[k] = SECRET_HEADER.test(k) ? hidden(v) : v;
            return out;
        };
        const traces = data.traces.map((t) =>
            Object.assign({}, t, {
                requests: t.requests.map((r) =>
                    Object.assign({}, r, { headers: redact(r.headers) })
                ),
            })
        );
        return JSON.stringify(
            {
                probe: 'session-probe',
                createdAt: new Date().toISOString(),
                page: location.origin + location.pathname,
                department: department(),
                userAgent: navigator.userAgent,
                buttonNow: lastState,
                lastRect: data.lastRect || null,
                events: data.events,
                snapshots: data.snapshotOrder.map((k) =>
                    Object.assign({ key: k }, data.snapshots[k])
                ),
                manualAnalysis: analysis(),
                stationFields: data.stationFields,
                lpnFields: data.lpnFields,
                traces,
                recentRequests: data.requests,
            },
            null,
            1
        );
    }
    function copyReport() {
        const text = report();
        const fallback = () => showText(text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(
                    () => flash('skopiowano: ' + Math.round(text.length / 1024) + ' KB'),
                    fallback
                );
        } else fallback();
    }
    function downloadReport() {
        const blob = new Blob([report()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download =
            'sonda-sesji-' +
            department() +
            '-' +
            new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') +
            '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    // ---------------- próby przy zablokowanym przycisku ----------------
    function tryPlaceholder() {
        const ph = placeholder();
        if (!ph) return flash('brak zaślepki w miejscu przycisku');
        if (!confirm('Próba 1: kliknąć element w miejscu przycisku (' + selectorOf(ph) + ')?'))
            return;
        startTrace('proba 1: zaslepka', false);
        note('proba', '1 zaslepka', { el: selectorOf(ph) });
        ph.click();
    }
    function tryReactHandler() {
        const el =
            document.querySelector('button[data-testid="' + BUTTON_TESTID + '"]') || placeholder();
        let target = null;
        let handler = null;
        for (let n = el, i = 0; n && i < 6 && !handler; n = n.parentElement, i++) {
            const p = reactProps(n);
            if (p && typeof p.onClick === 'function') {
                handler = p.onClick;
                target = n;
            }
        }
        if (!handler) return flash('nie znaleziono onClick Reacta przy przycisku');
        if (
            !confirm(
                'Próba 2: wywołać obsługę kliknięcia (' +
                    (handler.name || 'anonim') +
                    ') mimo blokady?'
            )
        )
            return;
        startTrace('proba 2: onClick Reacta', false);
        note('proba', '2 onClick', { el: selectorOf(target) });
        const native = new MouseEvent('click', { bubbles: true });
        try {
            handler({
                type: 'click',
                target,
                currentTarget: target,
                nativeEvent: native,
                isTrusted: false,
                preventDefault() {},
                stopPropagation() {},
                persist() {},
                isDefaultPrevented: () => false,
            });
        } catch (e) {
            note('proba', '2 wyjatek: ' + cut(e && e.message, 300));
        }
    }
    /**
     * Zapytania z ostatniego śladu zaczętego prawdziwym kliknięciem człowieka:
     * „Kontynuuj” albo sam przycisk sesji — w części działów sesja znika od
     * razu, bez okna potwierdzenia.
     */
    function lastRealReset() {
        const writes = (t) =>
            t.requests.filter((r) => r.kind !== 'ws' && String(r.method).toUpperCase() !== 'GET');
        const isTrace = (t, testId) => t && t.trusted && t.reason === 'klik ' + testId;
        for (let i = data.traces.length - 1; i >= 0; i--) {
            const t = data.traces[i];
            if (t.manual && writes(t).length) return { trace: t, reqs: writes(t) };
            // „Kontynuuj” kończy reset zaczęty przyciskiem sesji chwilę
            // wcześniej — oba ślady to jeden reset, w tej kolejności.
            if (isTrace(t, CONTINUE_TESTID)) {
                const prev = data.traces[i - 1];
                const first =
                    isTrace(prev, BUTTON_TESTID) && t.at - prev.at < 60000 ? writes(prev) : [];
                const reqs = first.concat(writes(t));
                if (reqs.length) return { trace: t, reqs };
            } else if (isTrace(t, BUTTON_TESTID) && writes(t).length) {
                return { trace: t, reqs: writes(t) };
            }
        }
        return null;
    }
    async function tryReplay() {
        const found = lastRealReset();
        if (!found)
            return flash('najpierw zrób jeden reset ręcznie, w dziale, gdzie przycisk działa');
        const list = found.reqs.map((r) => r.method + ' ' + cut(r.url, 120)).join('\n');
        if (
            !confirm(
                'Próba 3: wysłać ponownie ' +
                    found.reqs.length +
                    ' zapytań z resetu ' +
                    new Date(found.trace.at).toLocaleTimeString() +
                    ' (dział ' +
                    found.trace.department +
                    ')?\n\n' +
                    list
            )
        )
            return;
        startTrace('proba 3: powtorzenie zapytan', false);
        note('proba', '3 powtorzenie', { count: found.reqs.length });
        for (const r of found.reqs) {
            const headers = Object.assign({}, r.headers);
            const body =
                r.body && !/^\[/.test(r.body) && !/…\[\d+\]$/.test(r.body) ? r.body : undefined;
            try {
                await window.fetch(r.url, {
                    method: r.method,
                    headers,
                    body,
                    credentials: 'include',
                });
            } catch (e) {
                note('proba', '3 blad: ' + cut(e && e.message, 300));
            }
        }
    }

    // ---------------- panel ----------------
    const root = document.createElement('div');
    root.id = 'sessionProbe';
    Object.assign(root.style, {
        position: 'fixed',
        zIndex: '2147483647',
        left: data.ui.panel.left + 'px',
        top: data.ui.panel.top + 'px',
        background: 'rgba(32, 33, 36, 0.92)',
        color: '#fff',
        font: '13px system-ui, sans-serif',
        borderRadius: '8px',
        padding: '8px 10px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        minWidth: '220px',
        touchAction: 'none',
        userSelect: 'none',
    });
    const head = document.createElement('div');
    Object.assign(head.style, {
        fontWeight: '600',
        cursor: 'move',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
    });
    const dot = document.createElement('span');
    Object.assign(dot.style, {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: '#888',
        display: 'inline-block',
    });
    const title = document.createElement('span');
    title.textContent = 'Sonda sesji';
    head.append(dot, title);
    const body = document.createElement('div');
    const status = document.createElement('div');
    status.style.margin = '6px 0';
    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', flexWrap: 'wrap', gap: '6px' });
    const trials = document.createElement('div');
    Object.assign(trials.style, {
        display: 'none',
        flexDirection: 'column',
        gap: '6px',
        marginTop: '8px',
        borderTop: '1px solid #555',
        paddingTop: '8px',
    });
    const msg = document.createElement('div');
    Object.assign(msg.style, { marginTop: '6px', color: '#fbbc04', minHeight: '1em' });
    body.append(status, buttons, trials, msg);
    root.append(head, body);

    function btn(text, onClick, parent) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        Object.assign(b.style, {
            minHeight: '34px',
            padding: '4px 10px',
            border: 'none',
            borderRadius: '6px',
            background: '#3c4043',
            color: '#fff',
            cursor: 'pointer',
            font: 'inherit',
        });
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        (parent || buttons).appendChild(b);
        return b;
    }
    const recBtn = btn('Nagraj reset', () => {
        if (trace && trace.manual) stopManual();
        else startManual();
        render();
    });
    btn('Kopiuj raport', copyReport);
    btn('Zapisz plik', downloadReport);
    btn('Klon', () => {
        data.ui.cloneHidden = !data.ui.cloneHidden;
        placeClone();
        save();
    });
    btn('Próby', () => {
        trials.style.display = trials.style.display === 'none' ? 'flex' : 'none';
    });
    btn('Wyczyść', () => {
        if (!confirm('Usunąć wszystko, co sonda zebrała?')) return;
        const ui = data.ui;
        data = blank();
        data.ui = ui;
        lastState = null;
        saveNow();
        check();
        render();
    });
    btn('Zwiń', () => {
        data.ui.collapsed = !data.ui.collapsed;
        render();
        save();
    });
    btn('1. Klik w zaślepkę', tryPlaceholder, trials);
    btn('2. onClick mimo blokady', tryReactHandler, trials);
    btn('3. Powtórz zapytania resetu', tryReplay, trials);

    const STATE_COLOR = {
        aktywny: '#34a853',
        zablokowany: '#fbbc04',
        zaslepka: '#fbbc04',
        schowany: '#9aa0a6',
        brak: '#ea4335',
    };
    let flashTimer = null;
    function flash(text) {
        msg.textContent = text;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
            msg.textContent = '';
        }, 6000);
    }
    let shownText = null;
    function showText(text) {
        if (shownText) shownText.remove();
        shownText = document.createElement('textarea');
        // Raport idzie do pola przez .value — nie staje się tekstem strony,
        // który czyta licznik.
        shownText.value = text;
        Object.assign(shownText.style, {
            width: '320px',
            height: '160px',
            marginTop: '6px',
            font: '11px monospace',
        });
        body.appendChild(shownText);
        shownText.focus();
        shownText.select();
        flash('zaznaczone — Ctrl+C, potem wklej autorowi');
    }
    function render() {
        body.style.display = data.ui.collapsed ? 'none' : '';
        dot.style.background = STATE_COLOR[lastState] || '#888';
        const parts = [
            'przycisk: ' + (lastState || '?'),
            'zdarzenia ' + data.events.length,
            'ślady ' + data.traces.length,
        ];
        if (trace) parts.push(trace.manual ? 'NAGRYWAM RĘCZNIE' : 'nagrywam ślad…');
        const text = parts.join(' · ');
        if (status.textContent !== text) status.textContent = text;
        const rec = trace && trace.manual;
        const label = rec ? '■ Stop nagrywania' : 'Nagraj reset';
        if (recBtn.textContent !== label) recBtn.textContent = label;
        recBtn.style.background = rec ? '#d93025' : '#1a73e8';
    }

    // ---------------- klon ----------------
    const clone = document.createElement('button');
    clone.id = 'sessionProbeClone';
    clone.type = 'button';
    clone.title = 'Klon przycisku sesji (sonda)';
    Object.assign(clone.style, {
        position: 'fixed',
        zIndex: '2147483646',
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        border: '2px dashed #fa7b17',
        background: 'rgba(250, 123, 23, 0.15)',
        cursor: 'pointer',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0',
        touchAction: 'none',
    });
    function cloneIcon(original) {
        if (clone.childNodes.length || !original) return;
        const icon = original.querySelector('svg, img');
        if (icon) clone.appendChild(icon.cloneNode(true));
        else clone.textContent = 'S';
    }
    function placeClone() {
        const { state, el } = buttonState();
        if (data.ui.cloneHidden) {
            clone.style.display = 'none';
            return;
        }
        cloneIcon(el);
        if (!clone.childNodes.length) clone.textContent = 'S';
        if (data.ui.clone) {
            clone.style.left = data.ui.clone.left + 'px';
            clone.style.top = data.ui.clone.top + 'px';
        } else if (data.lastRect) {
            clone.style.left = Math.max(0, data.lastRect.x - data.lastRect.w - 12) + 'px';
            clone.style.top = data.lastRect.y + 'px';
        } else {
            clone.style.left = '12px';
            clone.style.top = '120px';
        }
        if (data.lastRect) {
            clone.style.width = Math.max(32, data.lastRect.w) + 'px';
            clone.style.height = Math.max(32, data.lastRect.h) + 'px';
        }
        clone.style.display = 'flex';
        clone.style.opacity = state === 'aktywny' ? '1' : '0.55';
        clone.style.cursor = state === 'aktywny' ? 'pointer' : 'help';
    }
    function onCloneClick() {
        const { state, el } = buttonState();
        if (state === 'aktywny' && el) {
            note('klon', 'klik oryginalu');
            el.click();
            return;
        }
        data.ui.collapsed = false;
        trials.style.display = 'flex';
        render();
        flash('oryginał: ' + state + ' — wybierz próbę w panelu');
    }

    // ---------------- przeciąganie (panel i klon) ----------------
    function draggable(handle, el, onEnd, onClick) {
        let start = null;
        handle.addEventListener('pointerdown', (e) => {
            if (
                e.button !== 0 ||
                (e.target !== handle && e.target.closest('button') && handle !== el)
            )
                return;
            const r = el.getBoundingClientRect();
            start = {
                x: e.clientX,
                y: e.clientY,
                left: r.left,
                top: r.top,
                moved: false,
                id: e.pointerId,
            };
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', (e) => {
            if (!start || e.pointerId !== start.id) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (!start.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
            start.moved = true;
            el.style.left = Math.max(0, start.left + dx) + 'px';
            el.style.top = Math.max(0, start.top + dy) + 'px';
        });
        const end = (e) => {
            if (!start || e.pointerId !== start.id) return;
            const moved = start.moved;
            start = null;
            if (moved) onEnd(parseInt(el.style.left, 10), parseInt(el.style.top, 10));
            else if (onClick && e.type === 'pointerup') onClick();
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }
    draggable(head, root, (left, top) => {
        data.ui.panel = { left, top };
        save();
    });
    draggable(
        clone,
        clone,
        (left, top) => {
            data.ui.clone = { left, top };
            save();
        },
        onCloneClick
    );

    // ---------------- start ----------------
    document.body.appendChild(root);
    document.body.appendChild(clone);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'],
    });
    const poll = setInterval(check, POLL_MS);
    note('start', location.pathname + location.search);
    // Nagranie ręczne przerwane przeładowaniem strony trwa dalej, w nowym śladzie.
    if (data.manual) startTrace('reczny (po przeladowaniu)', true, true);
    check();
    render();

    window.__sessionProbe = {
        toggle() {
            root.style.display = root.style.display === 'none' ? '' : 'none';
        },
        report,
        stop() {
            clearInterval(poll);
            observer.disconnect();
            finishTrace();
            saveNow();
            root.remove();
            clone.remove();
            delete window.__sessionProbe;
        },
    };
})();
