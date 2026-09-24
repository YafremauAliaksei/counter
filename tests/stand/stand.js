/**
 * stand.js — silnik stanowiska: naśladuje ekran T-REX krok po kroku.
 *
 * Jeden kod dla człowieka (przyciski na stronie) i dla testów (window.Stand,
 * wołane z Playwright), więc automat sprawdza dokładnie to, co widać ręcznie.
 *
 * NAJWAŻNIEJSZA ZASADA STANOWISKA: skrypt przy każdej mutacji czyta CAŁY
 * document.body.innerText i szuka w nim wyzwalaczy (CONFIG.PRE_TRIGGER_REGEX,
 * CONFIG.AUTO_TRIGGER_REGEX), kodów sortowania i ASIN. Tekst wyzwalacza
 * zostawiony na stronie na stałe trzyma flagę przedmiotu podniesioną na zawsze
 * i licznik przestaje liczyć — to nie naśladuje pracy, tylko ją psuje. Dlatego:
 *   - wyzwalacze, kody i link do towaru pojawiają się WYŁĄCZNIE na ekranie
 *     kroku (#trex) i znikają razem z krokiem, jak w T-REX;
 *   - w stałym tekście strony i w dzienniku każde takie słowo jest rozerwane
 *     niewidocznym znakiem U+200B (w kodzie: ZW i breakWord);
 *   - Stand.leaks() sprawdza stały tekst wyrażeniami wziętymi z samego
 *     skryptu (SH.CONFIG), więc stanowisko nie rozjedzie się z kodem.
 */
(function () {
    'use strict';

    /**
     * Prawdziwe towary z amazon.de. Zawartość <script> nie trafia do
     * document.body.innerText, więc skrypt nie widzi tych ASIN, dopóki krok
     * nie wstawi linku do ekranu.
     */
    const CATALOG = [
        ['B07FJ78GBC', 'adidas Adilette Aqua Badelatschen'],
        ['B0F5B9SC2D', 'adidas Cushioned Crew Socken, 6 Paar'],
        ['B001BEAWZM', 'Calvin Klein Herren Boxershorts Trunks'],
        ['B08P4YPB8Q', 'Maybelline New York Mascara Schwarz'],
        ['B0B2RM68G2', 'Biodance Bio-Collagen Maske, 4 Stück'],
        ['B0CS68SFRB', 'Handseife Nachfüllpack 2x1000 ml'],
        ['B01BYTG0WM', 'Jacobson Jersey Spannbettlaken 180x200'],
        ['B008YETL18', "De'Longhi EcoDecalk DLSC500 Entkalker"],
        ['B0BF9W3WC4', 'Jura Claris Smart+ Wasserfilter, 3er-Pack'],
        ['B0C3M5MS3N', 'Auvon Nachtlicht mit Bewegungsmelder'],
        ['B0F1C56SR1', 'Gritin 26 cm Unterbauleuchte Küche'],
        ['B0C3BC4QG2', 'Gritin Leselampe Buchklemme USB'],
        ['B01KHILJ5O', 'Philips LEDclassic GU10, 50 W Ersatz'],
        ['B0BLYQGD2Z', 'Jsdoin LED Mini-Lichterkette, 6x20'],
        ['B0DCBHQPH7', 'slochi LED-Deckenleuchte flach 30 cm'],
        ['B093SWH4D8', 'ARNOMED Einweghandschuhe Nitril, 100er'],
        ['B099S5JM9R', 'Shadowhawk LED Taschenlampe, sehr hell'],
        ['B019ETZ2ZU', 'fischer DuoPower 6x30 Universaldübel'],
        ['B00569J8CQ', 'tesa Fliegengitter für Fenster'],
        ['B00006JCUB', 'Hama 3-fach Steckdosenleiste 1,4 m'],
    ];

    /**
     * Kroki cyklu. Między wyzwalaczem początku („poniżej”) a końca („Przypisz
     * nowy”) są dwa kroki pośrednie, jak w prawdziwym przebiegu. Teksty stoją
     * tu dosłownie — trafiają wyłącznie na ekran kroku.
     */
    const STEPS = [
        { name: 'krok 0 / bezczynność', text: 'Zeskanuj LP przedmiotu', link: false },
        { name: 'krok 1 / szczegóły', text: 'Sprawdź szczegóły przedmiotu poniżej i potwierdź zgodność', link: true },
        { name: 'krok 2 / stan', text: 'Oceń stan fizyczny przedmiotu', link: true },
        { name: 'krok 3 / kategoria', text: 'Wybierz kategorię i powód zwrotu', link: true },
        { name: 'krok 4 / LPN', text: 'Przypisz nowy kod LPN do przedmiotu', link: false },
    ];
    const FINAL_STEP = STEPS.length - 1;

    // Rozerwanie słowa niewidocznym znakiem: czytelne dla człowieka, obojętne
    // dla wyrażeń skryptu.
    const ZW = '\u200b';
    const breakWord = (s) => (s.length > 2 ? s.slice(0, 2) + ZW + s.slice(2) : s);

    const $ = (id) => document.getElementById(id);

    const state = {
        step: 0,
        item: null,             // { asin, title, route }
        items: 0,
        routeLines: [],         // tekst wiszący w oknie trasy
        confirmPending: null,
        routeAfterArmed: false, // kod „po finale” czeka na ekran bezczynności
        lastRoute: null,
        lastAsin: null,
        stepMs: 1400,
        autoTimer: null,
    };

    // ---------------- dziennik ----------------
    /** Wpis dziennika. Tekst przechodzi przez safeText — dziennik jest stały. */
    function log(msg, cls) {
        const box = $('log');
        if (!box) return;
        const d = document.createElement('div');
        d.className = cls || 't-sys';
        d.textContent = new Date().toLocaleTimeString('pl-PL') + '  ' + safeText(msg);
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
    }

    /**
     * Tekst bezpieczny dla stałej części strony: rozrywa ASIN i słowa, które
     * skrypt rozpoznaje. Działa także bez załadowanego skryptu.
     */
    function safeText(msg) {
        return String(msg)
            .replace(/\b(B[01])([A-Z0-9]{8})\b/g, '$1' + ZW + '$2')
            .replace(/(poni)(żej)/gi, '$1' + ZW + '$2')
            .replace(/(Przypisz)( )/gi, '$1' + ZW + '$2')
            .replace(/(Przed)(miot wysłano)/gi, '$1' + ZW + '$2')
            .replace(/(Transpa)(rency)/gi, '$1' + ZW + '$2')
            .replace(/(Zeska)(nuj)/gi, '$1' + ZW + '$2');
    }

    // ---------------- trasa (kod sortowania) ----------------
    function paintRoute() { $('routeBox').textContent = state.routeLines.join('   '); }

    function routeEmit(route) {
        if (!route || !route.code) return;
        const sep = route.dash === 'dash' ? ' - ' : ' ';
        state.routeLines.push('Zeskanuj' + sep + route.code);
        log('KOD SORTOWANIA: ' + breakWord(route.code), 't-asin');
        if (route.code.indexOf('Secondary-Sorting') >= 0 && route.confirm) {
            // Po finale kolejnej klatki wewnątrz przedmiotu już nie będzie,
            // więc uściślenie idzie od razu.
            if (route.when === 'after') confirmEmit(route.confirm);
            else state.confirmPending = route.confirm;
        }
        paintRoute();
    }

    function confirmEmit(kind) {
        const txt = kind === 'sell'
            ? 'Przedmiot wysłano do Transfer - Sellable'
            : 'Przedmiot wysłano do FBATransfer-EU';
        state.routeLines.push(txt);
        log('UŚCIŚLENIE: ' + txt, 't-post');
        paintRoute();
    }

    // ---------------- ekran kroku ----------------
    function render() {
        const s = STEPS[state.step];
        const route = state.item && state.item.route;
        $('stepName').textContent = s.name;
        $('stepText').textContent = s.text;

        // Moment pokazania kodu względem finalnego wyzwalacza.
        const when = route && route.when;
        if (state.step === FINAL_STEP - 1 && when === 'before') routeEmit(route);
        else if (state.step === FINAL_STEP && when === 'at') routeEmit(route);
        else if (state.step === 0 && state.routeAfterArmed) {
            state.routeAfterArmed = false;
            routeEmit(state.lastRoute);
        } else if (state.confirmPending) {
            const c = state.confirmPending;
            state.confirmPending = null;
            confirmEmit(c);
        }

        const box = $('itemBox');
        box.textContent = '';
        if (s.link && state.item) {
            // Dokładnie jak w T-REX: zwykły <a> w body.
            const a = document.createElement('a');
            a.href = 'https://www.amazon.de/dp/' + state.item.asin;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = state.item.title;
            box.appendChild(a);
        }
        if (state.step === 1) log('WYZWALACZ poniżej → początek przedmiotu', 't-pre');
        if (state.step === FINAL_STEP) log('WYZWALACZ Przypisz nowy → koniec przedmiotu', 't-post');
        paintStats();
    }

    /** Nowy przedmiot wchodzi na ekran od razu na kroku 1. */
    function begin(opts) {
        const o = opts || {};
        const found = o.asin ? CATALOG.find(c => c[0] === o.asin) : null;
        const pick = found || (o.asin ? [o.asin, 'Towar ' + o.asin] : CATALOG[Math.floor(Math.random() * CATALOG.length)]);
        state.routeLines = [];
        state.confirmPending = null;
        state.routeAfterArmed = false;
        paintRoute();
        state.item = { asin: pick[0], title: pick[1], route: o.route || null };
        state.lastAsin = pick[0];
        state.items++;
        log(`przedmiot #${state.items}: ${pick[0]} — ${pick[1]}`, 't-asin');
        state.step = 1;
        render();
    }

    /** Następny krok; po kroku końcowym ekran wraca do bezczynności. */
    function step() {
        if (state.step === 0) return begin();
        if (state.step === FINAL_STEP) {
            state.lastRoute = state.item && state.item.route;
            state.routeAfterArmed = !!(state.lastRoute && state.lastRoute.when === 'after');
            state.item = null;
            state.step = 0;
        } else {
            state.step++;
        }
        render();
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    /**
     * Pełny przedmiot od kroku 1 do bezczynności, z przerwą stepMs między
     * krokami. Gdy poprzedni przedmiot został przerwany w połowie, nowy
     * wchodzi prosto na jego miejsce — bez ekranu bezczynności, jak w T-REX.
     *
     * @param {object} [opts]
     *   asin    — konkretny towar (domyślnie losowy z katalogu);
     *   route   — { code, when: 'before'|'at'|'after', dash: 'plain'|'dash',
     *             confirm: 'sell'|'unsell' };
     *   abortAt — przerwać na tym kroku (1..3): przedmiot bez wyzwalacza końca.
     */
    async function item(opts) {
        const o = opts || {};
        begin(o);
        while (true) {
            await wait(state.stepMs);
            if (o.abortAt && state.step === o.abortAt) {
                log('PRZERWANE na kroku ' + state.step, 't-pre');
                return state.items;
            }
            step();
            if (state.step === 0) break;
        }
        await wait(state.stepMs);
        return state.items;
    }

    function reset() {
        stopAuto();
        Object.assign(state, {
            step: 0, item: null, items: 0, routeLines: [], confirmPending: null,
            routeAfterArmed: false, lastRoute: null,
        });
        $('log').textContent = '';
        paintRoute();
        render();
        log('stanowisko zresetowane');
    }

    /**
     * Stały tekst strony, w którym skrypt znalazłby coś dla siebie: wyzwalacz,
     * kod sortowania albo ASIN. Sprawdza wszystko poza ekranem kroku.
     * Wyrażenia z samego skryptu — bez niego sprawdzenie nie ma sensu.
     *
     * @returns {string[]|null} lista znalezisk albo null bez skryptu.
     */
    function leaks() {
        const C = window.SH && window.SH.CONFIG;
        if (!C) return null;
        const codes = [].concat(C.ROUTE_SELL_CODES, C.ROUTE_UNSELL_CODES,
                                C.ROUTE_NEUTRAL_CODES, C.ROUTE_AMBIGUOUS_CODES);
        const out = [];
        for (const el of document.querySelectorAll('[data-static]')) {
            const text = el.innerText || '';
            if (C.PRE_TRIGGER_REGEX.test(text)) out.push(el.id + ': wyzwalacz początku');
            if (C.AUTO_TRIGGER_REGEX.test(text)) out.push(el.id + ': wyzwalacz końca');
            if (new RegExp(C.PRICE_ASIN_FROM_TEXT.source).test(text)) out.push(el.id + ': ASIN');
            for (const code of codes) {
                const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp('(^|[^A-Za-z0-9-])' + esc + '($|[^A-Za-z0-9-])').test(text)) {
                    out.push(el.id + ': kod ' + breakWord(code));
                }
            }
        }
        return out;
    }

    // ---------------- panel stanu ----------------
    function paintStats() {
        $('sItems').textContent = state.items;
        $('sAsin').textContent = state.item ? breakWord(state.item.asin) : '—';
        $('sLink').textContent = document.querySelector('#itemBox a') ? 'tak' : 'nie';
        const SH = window.SH;
        $('sScript').textContent = SH ? 'załadowany' : 'nie';
        if (SH) {
            const cid = SH.store.currentTabInstanceId;
            $('sCount').textContent = String(SH.store.tabCounters[cid] || 0);
        }
    }

    // ---------------- sterowanie ręczne ----------------
    function routeFromControls() {
        const code = $('routeCode').value;
        if (!code) return null;
        const dash = $('routeDash').value;
        return {
            code,
            when: $('routeWhen').value,
            dash: dash === 'rand' ? (Math.random() < 0.5 ? 'dash' : 'plain') : dash,
            confirm: $('routeConfirm').value || null,
        };
    }

    function stopAuto() {
        clearInterval(state.autoTimer);
        state.autoTimer = null;
        $('bAuto').textContent = '▶ Autocykl';
    }

    function bindControls() {
        $('bNew').onclick = () => begin({ route: routeFromControls() });
        // Ten sam towar jeszcze raz: klient zwrócił kilka jednakowych rzeczy.
        $('bSame').onclick = () => begin({ asin: state.lastAsin, route: routeFromControls() });
        $('bStep').onclick = step;
        $('bAbort').onclick = () => {
            log('PRZERWANE na kroku ' + state.step, 't-pre');
            begin({ route: routeFromControls() });
        };
        $('bReset').onclick = reset;
        $('bAuto').onclick = () => {
            if (state.autoTimer) return stopAuto();
            $('bAuto').textContent = '■ Stop';
            state.autoTimer = setInterval(() => {
                if (state.step === 0) begin({ route: routeFromControls() });
                else step();
            }, state.stepMs);
        };
        $('speed').oninput = (e) => {
            state.stepMs = Number(e.target.value);
            $('speedVal').textContent = e.target.value + ' ms';
            if (state.autoTimer) { stopAuto(); $('bAuto').click(); }
        };
        $('bLeaks').onclick = () => {
            const found = leaks();
            log(found === null ? 'sprawdzenie wymaga załadowanego skryptu'
                : found.length ? 'STAŁY TEKST Z WYZWALACZEM: ' + found.join('; ')
                : 'stały tekst czysty', found && found.length ? 't-pre' : 't-sys');
        };
        document.querySelectorAll('#themeBar button').forEach(b => {
            b.onclick = () => setTheme(b.dataset.themeSet);
        });
    }

    /**
     * Wygląd strony: karta ceny i okno są półprzezroczyste, więc ich
     * czytelność trzeba zobaczyć na ciemnym, jasnym i kolorowym tle.
     */
    function setTheme(name) {
        const root = document.documentElement;
        if (name === 'dark') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', name);
        if (name === 'dim') {
            const hue = Math.floor(Math.random() * 360);
            const set = (k, l) => root.style.setProperty(k, `hsl(${hue} 18% ${l}%)`);
            set('--rnd-bg', 15); set('--rnd-panel', 20); set('--rnd-line', 31);
            set('--rnd-screen', 17); set('--rnd-log', 11);
        }
        document.querySelectorAll('#themeBar button').forEach(b =>
            b.setAttribute('aria-pressed', String(b.dataset.themeSet === name)));
    }

    /**
     * `?autoload=1` — skrypt ładuje się sam, bez wklejania do konsoli.
     * Wygoda dla człowieka; testy wklejają skrypt tak jak człowiek (evaluate).
     */
    function autoload() {
        if (!/[?&]autoload=1\b/.test(location.search)) return;
        const s = document.createElement('script');
        s.src = '/counter.js';
        document.head.appendChild(s);
    }

    window.Stand = {
        catalog: CATALOG.map(c => c[0]),
        item, step, reset, leaks,
        configure(o) { if (o && typeof o.stepMs === 'number') state.stepMs = o.stepMs; },
        state: () => ({
            step: state.step, items: state.items,
            asin: state.item ? state.item.asin : null,
            routeLines: state.routeLines.slice(),
        }),
    };

    bindControls();
    setTheme('dark');
    render();
    setInterval(paintStats, 1000);
    log('stanowisko gotowe: wklej counter.js do konsoli albo otwórz stronę z ?autoload=1');
    autoload();
})();
