/**
 * dom-stub.js — atrapa przeglądarki, w której uruchamia się counter.js.
 *
 * ============================================================================
 * PO CO TO JEST
 * ============================================================================
 * counter.js to jedna wielka funkcja IIFE, która przy wczytaniu SAMA stawia
 * interfejs i wystawia `window.SH`. Nie da się zaimportować z niej pojedynczej
 * funkcji — i dobrze, bo dokładnie tak działa w produkcji: ktoś wkleja plik
 * do konsoli i skrypt się uruchamia.
 *
 * Testujemy więc to samo, co jest w produkcji: budujemy najmniejszą atrapę
 * DOM / localStorage / sieci, wykonujemy w niej PLIK ARTEFAKTU (nie źródła!)
 * przez `vm`, a potem sprawdzamy, co skrypt z tym środowiskiem zrobił.
 *
 * Testowanie artefaktu, a nie src/, jest świadome: sprawdzamy dokładnie ten
 * plik, który dostanie człowiek. Gdyby build coś gubił, testy to zobaczą.
 *
 * ============================================================================
 * CO ATRAPA ZLICZA
 * ============================================================================
 * `env.net` to protokół wszystkiego, co skrypt próbował zrobić na zewnątrz:
 *   fetches[]       adresy przekazane do fetch()
 *   images[]        adresy przypisane do <img>.src plus ślad po new Image()
 *   xhr             licznik prób XMLHttpRequest
 *   consoleLog[]    linie wypisane przez console.log
 *   consoleError[]  linie wypisane przez console.error / warn
 *
 * Na tym opierają się dwa najważniejsze testy projektu: „po starcie sieć jest
 * nietknięta” i „po starcie konsola jest pusta”.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ARTIFACT_PATH = path.join(ROOT, 'counter.js');
const ARTIFACT = fs.readFileSync(ARTIFACT_PATH, 'utf8');

/**
 * @param {{storage?: object, href?: string}} [opts]
 *   `storage` pozwala uruchomić DWIE karty na jednym localStorage, czyli
 *   odtworzyć normalny tryb pracy: otwarte naraz CRET i WHD.
 */
function makeEnv(opts = {}) {
    const net = { fetches: [], images: [], xhr: 0, consoleLog: [], consoleError: [] };

    class ClassList {
        constructor() { this._s = new Set(); }
        add(c) { this._s.add(c); }
        remove(c) { this._s.delete(c); }
        contains(c) { return this._s.has(c); }
    }

    // `Node` musi być prawdziwą klasą, a nie obiektem ze stałymi: counter.js
    // sprawdza `child instanceof Node` w generatorze DOM h(). Zwykły obiekt
    // wywala się tam na „Right-hand side of 'instanceof' is not callable”.
    class Node {}
    Node.ELEMENT_NODE = 1;
    Node.TEXT_NODE = 3;

    class El extends Node {
        constructor(tag) {
            super();
            this.tagName = String(tag).toUpperCase();
            this.children = [];
            this.childNodes = this.children;
            this.parentElement = null;
            this.nodeType = 1;
            this.attributes = {};
            this.dataset = {};
            this.classList = new ClassList();
            this.className = '';
            this.id = '';
            this._text = '';
            this._listeners = {};
            this.offsetWidth = 100;
            this.offsetHeight = 20;
            this.style = new Proxy({ cssText: '' }, {
                set(o, k, v) { o[k] = v; return true; },
                get(o, k) { return o[k] === undefined ? '' : o[k]; },
            });
        }
        get textContent() {
            if (this.children.length) return this.children.map(c => c.textContent).join('');
            return this._text;
        }
        set textContent(v) { this.children.length = 0; this._text = String(v); }
        get innerText() { return this.textContent; }
        set innerHTML(v) {
            // Atrapa celowo NIE parsuje HTML. counter.js używa innerHTML wyłącznie
            // do czyszczenia (= ''); próba wstawienia treści to błąd w kodzie,
            // więc atrapa od razu rzuca — a skan statyczny łapie to samo w źródle.
            if (String(v) !== '') throw new Error('innerHTML z treścią — zakazane w counter.js');
            this.children.length = 0;
            this._text = '';
        }
        get innerHTML() { return ''; }
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
        append(...cs) { cs.forEach(c => this.appendChild(c)); }
        removeChild(c) {
            const i = this.children.indexOf(c);
            if (i >= 0) this.children.splice(i, 1);
        }
        remove() { if (this.parentElement) this.parentElement.removeChild(this); }
        addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
        removeEventListener(t, f) {
            if (!this._listeners[t]) return;
            this._listeners[t] = this._listeners[t].filter(x => x !== f);
        }
        dispatch(t, ev) { (this._listeners[t] || []).forEach(f => f(ev)); }
        setAttribute(k, v) {
            this.attributes[k] = String(v);
            if (k === 'src' && this.tagName === 'IMG' && v) net.images.push(String(v));
        }
        getAttribute(k) {
            return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
        }
        removeAttribute(k) { delete this.attributes[k]; }
        closest(sel) {
            let cur = this;
            while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentElement; }
            return null;
        }
        querySelectorAll(sel) { return collect(this, sel); }
        querySelector(sel) { return collect(this, sel)[0] || null; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; }
        getContext() {
            return {
                drawImage() {},
                getImageData() { return { width: 1, height: 1, data: new Uint8ClampedArray(4) }; },
            };
        }
    }

    // Bardzo uproszczone dopasowanie selektorów — tylko te wzorce, których
    // counter.js naprawdę używa. Gdy w kodzie pojawi się nowy selektor,
    // trzeba go tu dopisać, inaczej test po cichu nic nie znajdzie.
    function matches(el, sel) {
        sel = String(sel).trim();
        if (sel === 'body') return el.tagName === 'BODY';
        if (sel === 'head') return el.tagName === 'HEAD';
        const idPrefix = sel.match(/^\[id\^="(.*)"\]$/);
        if (idPrefix) return el.id && el.id.startsWith(idPrefix[1]);
        if (sel.startsWith('#')) return el.id === sel.slice(1);
        const href = sel.match(/^a\[href\*="(.*)"\]$/);
        if (href) return el.tagName === 'A' && (el.getAttribute('href') || '').includes(href[1]);
        if (sel.startsWith('meta[')) return el.tagName === 'META';
        return false;
    }

    function collect(root, selList) {
        const sels = String(selList).split(',').map(s => s.trim());
        const out = [];
        (function walk(n) {
            if (n !== root && sels.some(s => matches(n, s))) out.push(n);
            n.children.forEach(walk);
        })(root);
        return out;
    }

    function makeStorage() {
        const map = new Map();
        const api = {
            getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
            setItem: (k, v) => { map.set(String(k), String(v)); sync(); },
            removeItem: (k) => { map.delete(String(k)); sync(); },
            clear: () => { map.clear(); sync(); },
            key: (i) => [...map.keys()][i],
            _map: map,
        };
        // counter.js robi Object.keys(localStorage) — w przeglądarce klucze są
        // własnymi właściwościami obiektu, więc atrapa musi to odtworzyć.
        function sync() {
            for (const k of Object.keys(api)) {
                if (!k.startsWith('_') && typeof api[k] !== 'function') delete api[k];
            }
            for (const k of map.keys()) {
                Object.defineProperty(api, k, {
                    configurable: true,
                    enumerable: true,
                    get: () => map.get(k),
                });
            }
            api.length = map.size;
        }
        Object.defineProperty(api, 'length', {
            value: 0, writable: true, enumerable: false, configurable: true,
        });
        return api;
    }

    const document = new El('document');
    document.documentElement = new El('html');
    document.head = new El('head');
    document.body = new El('body');
    document.children.push(document.head, document.body);
    document.head.parentElement = document;
    document.body.parentElement = document;
    document.readyState = 'complete';
    document.createElement = (t) => new El(t);
    document.createTextNode = (t) => {
        const n = new El('#text');
        n.nodeType = 3;
        n.textContent = String(t);
        return n;
    };
    document.getElementById = (id) => {
        let found = null;
        (function walk(n) {
            if (found) return;
            if (n.id === id) { found = n; return; }
            n.children.forEach(walk);
        })(document);
        return found;
    };

    const listeners = {};
    const href = opts.href || 'https://trex-prod-eu.aka.amazon.com/?gradingMode=CRETURN';
    const window = {
        location: { href, hostname: 'trex-prod-eu.aka.amazon.com' },
        innerWidth: 1920,
        innerHeight: 1080,
        addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
        removeEventListener: (t, f) => {
            if (listeners[t]) listeners[t] = listeners[t].filter(x => x !== f);
        },
        // Wystawione, żeby dało się ręcznie wstrzyknąć zdarzenie 'storage' —
        // tak jak robi to przeglądarka, gdy sąsiednia karta coś zapisze.
        _listeners: listeners,
        _emit: (type, ev) => (listeners[type] || []).forEach(f => f(ev)),
        localStorage: opts.storage || makeStorage(),
        sessionStorage: makeStorage(),
    };

    class MutationObserver {
        constructor(cb) { this.cb = cb; }
        observe() {}
        disconnect() {}
    }

    class ImageStub {
        constructor() {
            this._src = '';
            net.images.push('<constructed>');
        }
        set src(v) { this._src = v; if (v) net.images.push(String(v)); }
        get src() { return this._src; }
    }

    const sandbox = {
        window, document,
        location: window.location,
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
        MutationObserver,
        Image: ImageStub,
        Node,
        AbortController: typeof AbortController !== 'undefined'
            ? AbortController
            : class { constructor() { this.signal = {}; } abort() {} },
        setTimeout, clearTimeout, setInterval, clearInterval,
        console: {
            log(...a) { net.consoleLog.push(a.map(String).join(' ')); },
            error(...a) { net.consoleError.push(a.map(String).join(' ')); },
            warn(...a) { net.consoleError.push(a.map(String).join(' ')); },
            table() { net.consoleLog.push('<table>'); },
        },
        confirm: () => true,
        alert: () => {},
        fetch: (url) => {
            net.fetches.push(String(url));
            return Promise.reject(new Error('sieć wyłączona w teście'));
        },
        JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Map, Set,
        Promise, Error, isNaN, isFinite, parseInt, parseFloat, encodeURIComponent,
        decodeURIComponent, Proxy, Reflect, Symbol, Uint8ClampedArray,
        XMLHttpRequest: function () { net.xhr++; },
    };
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;

    vm.createContext(sandbox);
    return { sandbox, net, window, document, El, Node, makeStorage };
}

/**
 * Uruchamia artefakt w świeżej atrapie i zwraca środowisko wraz z `SH`.
 *
 * `opts.beforeRun(env)` wykonuje się, gdy okno już stoi, ale skryptu jeszcze
 * w nim nie ma. Tak właśnie działa zakładka z kodem ustawień: podstawia
 * zmienną do okna, a dopiero potem podaje plik do wykonania — i tylko w tej
 * kolejności da się sprawdzić, że ustawienia wchodzą przed pierwszym rysowaniem.
 */
function boot(opts = {}) {
    const env = makeEnv(opts);
    if (typeof opts.beforeRun === 'function') opts.beforeRun(env);
    vm.runInContext(ARTIFACT, env.sandbox, { filename: 'counter.js' });
    env.SH = env.sandbox.window.SH;
    if (!env.SH) throw new Error('counter.js nie wystawił window.SH — inicjalizacja padła');
    // Prefiks czytamy z samego skryptu, a nie wpisujemy na sztywno: dzięki temu
    // podniesienie MAJOR (i zmiana prefiksu) nie wymaga ruszania testów.
    env.prefix = env.SH.CONFIG.SCRIPT_ID_PREFIX;
    env.el = (localId) => env.sandbox.document.getElementById(env.prefix + localId);
    return env;
}

/** Ustawia zmianę tak, żeby wyliczenia „na godzinę” były przewidywalne. */
function setShift(env, hoursAgo, activeTabs) {
    const S = env.SH.store;
    S.sessionConfig.shiftType = 'day';
    S.sessionConfig.shiftCalculatedStartTime = Date.now() - hoursAgo * 3600 * 1000;
    S.sessionConfig.selectedLunchIndex = null;
    S.sessionConfig.activeTabInstances = activeTabs || { CRET: Date.now(), WHD: Date.now() };
}

module.exports = { makeEnv, boot, setShift, ARTIFACT, ARTIFACT_PATH, ROOT };
