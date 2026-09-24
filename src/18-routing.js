    // ==========================================
    // 6g. DOKĄD POJECHAŁ PRZEDMIOT
    // ==========================================
    /**
     * Ustala, czy przedmiot został sprzedany, czy wysłany do utylizacji,
     * po kodzie sortowania.
     *
     * Osobny automat, a nie sprawdzenie w chwili zakończenia: kod przychodzi
     * przed wyzwalaczem końcowym, razem z nim albo po nim — byle przed
     * następnym przedmiotem. „Kierunek znany” i „przedmiot zaliczony” to dwie
     * niezależne połowy stanu, a wpis do dziennika uzupełnia się wstecz.
     *
     * Scenariusze:
     *   1. kod przyszedł PO +1  -> dopisujemy znak istniejącemu już wpisowi;
     *   2. kod przyszedł PRZED +1 -> czekamy, znak stawiamy przy tworzeniu wpisu;
     *   3. kod i +1 w jednej klatce -> kolejność wewnątrz scan() gwarantuje, że
     *      kierunek czyta się wcześniej niż licznik;
     *   4. kodu nie było wcale -> wpis zostaje neutralny (sign 0), do sumy nie
     *      wchodzi, ale widać go w linii 6 jako „?N”.
     *
     * Liczy się wystąpienia kodów, a nie samo „jest w tekście”: na ekranie
     * wisi dziennik, w którym stary kod zostaje, i doczepiłby się do
     * następnego przedmiotu. Kod zadziałał, gdy liczba jego wystąpień wzrosła —
     * to działa także dla dwóch jednakowych kodów pod rząd.
     */
    const Routing = {
        state: null,        // { completed, entryId, code, direction, pending }
        _prev: null,        // liczniki poprzedniego skanu
        /**
         * Niezamknięty Secondary-Sorting: stan przedmiotu, który dostał kod
         * niejednoznaczny i czeka na uściślenie. Żyje oddzielnie od this.state
         * i przeżywa zmianę ASIN — linia uściślająca bywa spóźniona.
         */
        _ambiguous: null,

        codes() {
            return [...CONFIG.ROUTE_SELL_CODES, ...CONFIG.ROUTE_UNSELL_CODES,
                    ...CONFIG.ROUTE_NEUTRAL_CODES, ...CONFIG.ROUTE_AMBIGUOUS_CODES];
        },

        /**
         * Kierunek dla kodu, który już trafił w listę.
         *
         * Kolejność sprawdzeń jest kolejnością pewności: sprzedaż i niesprzedaż
         * rozstrzygają od razu, `neutral` nie rozstrzygnie się nigdy,
         * `ambiguous` rozstrzygnie się następną linią.
         *
         * @returns {'sell'|'unsell'|'neutral'|'ambiguous'|null}
         */
        kindOf(code) {
            if (CONFIG.ROUTE_SELL_CODES.includes(code)) return 'sell';
            if (CONFIG.ROUTE_UNSELL_CODES.includes(code)) return 'unsell';
            if (CONFIG.ROUTE_NEUTRAL_CODES.includes(code)) return 'neutral';
            if (CONFIG.ROUTE_AMBIGUOUS_CODES.includes(code)) return 'ambiguous';
            return null;
        },

        codeRegex() {
            if (this._re) return this._re;
            // Ucieczka znaków specjalnych: wzorzec powstaje z łańcucha, a kod
            // z kropką albo nawiasem zmieniłby znaczenie wyrażenia.
            const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Malejąco po długości: inaczej krótki kod przechwyciłby dłuższy,
            // którego jest początkiem.
            const all = this.codes().slice().sort((a, b) => b.length - a.length).map(esc);
            this._re = new RegExp('Zeskanuj\\s*[-–—]?\\s*(' + all.join('|') + ')', 'gi');
            return this._re;
        },

        canon(raw) {
            const low = String(raw).toLowerCase();
            return this.codes().find(c => c.toLowerCase() === low) || raw;
        },

        countAll(text) {
            const m = new Map();
            const re = this.codeRegex(); re.lastIndex = 0;
            let x;
            while ((x = re.exec(text)) !== null) {
                const c = this.canon(x[1]);
                m.set(c, (m.get(c) || 0) + 1);
            }
            return m;
        },

        countRe(text, re) {
            re.lastIndex = 0;
            let k = 0;
            while (re.exec(text) !== null) k++;
            return k;
        },

        /**
         * Nowy przedmiot: zapominamy wszystko, co wiedzieliśmy o poprzednim.
         *
         * @param {string} reason — do konsoli.
         * @param {{closeAmbiguous?: boolean}} [opts] - closeAmbiguous mówi, że
         *   granica przedmiotu jest PRAWDZIWA (pojawiło się `poniżej`) i wiszący
         *   Secondary-Sorting pora zamknąć domyślnie. Zmiana ASIN taką granicą
         *   NIE jest: linia uściślająca może przyjść i po niej.
         */
        startItem(reason, opts = {}) {
            if (opts.closeAmbiguous) this.closeAmbiguous('do nowego przedmiotu nie było uściślenia');
            const prev = this.state;
            if (prev && prev.completed && !prev.direction && prev !== this._ambiguous) {
                Utils.log('[KIERUNEK] poprzedni przedmiot pozostał nieokreślony '
                        + '(kod sortowania tak i się nie pojawił)');
            }
            this.state = { completed: false, entryId: null, code: null,
                           direction: null, pending: false, counted: false };
            if (reason) Utils.log(`[KIERUNEK] nowy przedmiot (${reason})`);
        },

        /**
         * Secondary-Sorting bez uściślenia to niesprzedaż. Reguła jest
         * niesymetryczna, bo taki jest system: potwierdzenie sprzedaży
         * (`Transfer - Sellable`) przychodzi zawsze, a niesprzedaży
         * (`FBATransfer`) — nie zawsze.
         */
        closeAmbiguous(reason) {
            const a = this._ambiguous;
            this._ambiguous = null;
            if (!a || !a.pending) return;
            a.pending = false;
            a.direction = 'unsell';
            Utils.log(`[KIERUNEK] ${a.code || 'kod niejednoznaczny'} bez uściślenia -> NIESPRZEDAŻ (${reason})`);
            this.applyTo(a);
        },

        /** Czyta tekst strony i aktualizuje kierunek. Wołane przy każdym skanie. */
        observe(text) {
            const counts = this.countAll(text);
            const sellC = this.countRe(text, CONFIG.ROUTE_CONFIRM_SELL);
            const unsellC = this.countRe(text, CONFIG.ROUTE_CONFIRM_UNSELL);

            // Pierwszy skan tylko fotografuje stronę: wszystko, co już na niej
            // leży, jest przeszłością, a nie zdarzeniem.
            if (!this._prev) { this._prev = { counts, sellC, unsellC }; return; }

            for (const [code, k] of counts) {
                if (k > (this._prev.counts.get(code) || 0)) this.onCode(code);
            }
            if (sellC > this._prev.sellC) this.onConfirm('sell');
            if (unsellC > this._prev.unsellC) this.onConfirm('unsell');

            this._prev = { counts, sellC, unsellC };
        },

        onCode(code) {
            if (!this.state) this.startItem('kod przyszedł przed początkiem');
            this.state.code = code;
            const kind = this.kindOf(code);
            if (kind === 'ambiguous') {
                // Sam z siebie niczego nie rozstrzyga — czekamy na linię uściślającą.
                this.state.pending = true;
                this.state.direction = null;
                this._ambiguous = this.state;
                Utils.log(`[KIERUNEK] ${code} — czekam na uściślenie`);
                return;
            }
            this.state.pending = false;
            if (this._ambiguous === this.state) this._ambiguous = null;
            // `neutral` jest pełnoprawnym kierunkiem, a nie brakiem kierunku:
            // wiemy o przedmiocie wszystko, co da się wiedzieć, i właśnie
            // dlatego wypada on z mianownika procentu.
            this.state.direction = kind;
            Utils.log(`[KIERUNEK] ${code} -> ${this.directionName(kind)}`);
            this.apply();
        },

        /** Nazwa kierunku do dziennika w konsoli. */
        directionName(dir) {
            return dir === 'sell' ? 'SPRZEDAŻ'
                 : dir === 'unsell' ? 'NIESPRZEDAŻ'
                 : 'NIEROZSTRZYGALNY (poza procentem)';
        },

        onConfirm(dir) {
            // Uściślenie ma sens tylko po niejednoznacznym kodzie — linia
            // „Przedmiot wysłano do ...” występuje też sama z siebie. Celem
            // jest bieżący przedmiot, a gdy ten już się zmienił — wiszący
            // Secondary-Sorting poprzedniego.
            const target = (this.state && this.state.pending) ? this.state
                         : (this._ambiguous && this._ambiguous.pending) ? this._ambiguous
                         : null;
            if (!target) return;
            target.pending = false;
            target.direction = dir;
            if (this._ambiguous === target) this._ambiguous = null;
            Utils.log(`[KIERUNEK] uściślono: ${target.code || 'kod niejednoznaczny'} -> `
                    + this.directionName(dir));
            this.applyTo(target);
        },

        /**
         * Przedmiot zaliczony przez licznik: od tego momentu wolno zastosować sumę.
         * @param {string|null} entryId — id wpisu dziennika (nie indeks:
         *   scalanie zmienia kolejność). Bez modułu cen to `null` — kierunek
         *   i tak się zalicza, bo procent sprzedaży dziennika nie potrzebuje.
         */
        onCompleted(entryId) {
            if (!this.state) this.startItem('zakończenie bez początku');
            this.state.completed = true;
            this.state.entryId = entryId;
            this.apply();
        },

        /**
         * PROCENT SPRZEDAŻY — licznik sprzedanych i odjęcie z mianownika.
         *
         * Liczy się dokładnie raz na przedmiot, gdy znane są oba warunki:
         * przedmiot zaliczony i kierunek ustalony. Przychodzą w dowolnej
         * kolejności, a applyTo woła się po każdym — stąd znacznik `counted`.
         *
         * Mianownik = licznik przedmiotów minus przedmioty spoza mianownika
         * (`tabNeutral`). Różnica między audytem a brakiem kodu jest celowa:
         *   - audyt wypada z mianownika — decyzja zapadnie później i gdzie indziej;
         *   - brak kodu zostaje w mianowniku — przedmiot gdzieś pojechał, tylko
         *     skrypt tego nie zobaczył; wyrzucenie go podnosiłoby procent przy
         *     każdym przeoczeniu.
         *
         * Ręczne poprawki licznika tu nie wchodzą — kierunku takiego przedmiotu
         * nikt nie zna.
         */
        countDirection(st) {
            if (!st || st.counted || !st.completed || !st.direction) return;
            st.counted = true;
            const cid = store.currentTabInstanceId;
            // Kierunek trafia do liczników zmiany (linie 1, 2, 7) i do
            // bieżącego zadania (linia 8) w jednym wywołaniu, żeby suma zadań
            // nie rozjechała się z licznikiem karty. +1 od wartości
            // w magazynie — dwie karty działu dzielą klucz (freshCount).
            if (st.direction === 'sell') {
                Persistence.bump(CONFIG.STORAGE_PREFIX_TAB_SOLD, store.tabSold, cid);
                TaskManager.addSold(cid);
            } else if (st.direction === 'neutral') {
                Persistence.bump(CONFIG.STORAGE_PREFIX_TAB_NEUTRAL, store.tabNeutral, cid);
                TaskManager.addNeutral(cid);
            }
        },

        /**
         * Zapisuje znak, gdy znane są oba warunki: przedmiot zaliczony i kierunek
         * ustalony, w dowolnej kolejności. Procent liczy się przed sprawdzeniem
         * wpisu dziennika — bez modułu cen wpisu nie ma, a procent ma działać.
         */
        applyTo(st) {
            this.countDirection(st);
            if (!st || !st.completed || !st.entryId || !st.direction) return;
            ValueLog.setDirection(st.entryId, st.direction, st.code);
        },
        apply() { this.applyTo(this.state); },

        info() {
            const st = this.state || {};
            const amb = this._ambiguous;
            return { kod: st.code || '—', kierunek: st.direction || 'nieokreślony',
                     'czeka na uściślenie': !!st.pending, 'przedmiot zaliczony': !!st.completed,
                     'wisi kod niejednoznaczny': amb ? (amb === st ? 'bieżący przedmiot' : 'poprzedni przedmiot') : 'nie' };
        },
    };
