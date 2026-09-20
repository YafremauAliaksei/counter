    // ==========================================
    // 6g. DOKĄD POJECHAŁ PRZEDMIOT (9.0.0)
    // ==========================================
    /**
     * Ustala, czy przedmiot został sprzedany, czy wysłany do utylizacji,
     * po kodzie sortowania.
     *
     * DLACZEGO TO OSOBNY AUTOMAT, A NIE SPRAWDZENIE W MOMENCIE ZAKOŃCZENIA.
     * Kod pojawia się na ekranie kiedy chce: przed wyzwalaczem końcowym, razem
     * z nim albo już po — byle przed początkiem następnego przedmiotu. Znaczy to,
     * że moment „poznaliśmy kierunek” i moment „przedmiot zaliczony” są
     * niezależne, a ich kolejność dowolna. Stąd dwie połowy stanu — zakończenie
     * i kierunek — oraz wpis do dziennika dopisywany wstecz.
     *
     * CZTERY SCENARIUSZE, KTÓRE TO POKRYWA:
     *   1. kod przyszedł PO +1  -> dopisujemy znak istniejącemu już wpisowi;
     *   2. kod przyszedł PRZED +1 -> czekamy, znak stawiamy przy tworzeniu wpisu;
     *   3. kod i +1 w jednej klatce -> kolejność wewnątrz scan() gwarantuje, że
     *      kierunek czyta się wcześniej niż licznik;
     *   4. kodu nie było wcale -> wpis zostaje neutralny (sign 0), do sumy nie
     *      wchodzi, ale widać go w linii 6 jako „?N”.
     *
     * DLACZEGO LICZY SIĘ WYSTĄPIENIA, A NIE ZWYKŁE `test()`.
     * Na ekranie jest dziennik, w którym kod wisi dalej po tym, jak zadziałał.
     * Proste sprawdzenie „czy kod jest w tekście” doczepiałoby stary kod do
     * następnego przedmiotu. Dlatego zapamiętuje się LICZBĘ wystąpień każdego
     * kodu, a zadziałanie liczy się dopiero wtedy, gdy ona WZROSŁA — czyli kod
     * pojawił się na nowo. Ta sama sztuczka przeżywa dwa jednakowe kody pod rząd,
     * czego nie wytrzymałoby proste „było/nie było”.
     */
    const Routing = {
        state: null,        // { completed, entryId, code, direction, pending }
        _prev: null,        // liczniki poprzedniego skanu
        /**
         * Niezamknięty Secondary-Sorting (9.1.0).
         *
         * Odwołanie do stanu przedmiotu, który dostał niejednoznaczny kod i nie
         * doczekał się jeszcze uściślenia. Żyje ODDZIELNIE od this.state
         * i przeżywa początek następnego przedmiotu: linia uściślająca czasem
         * przychodzi już po tym, jak na ekranie zmienił się ASIN, i tracić jej
         * nie wolno.
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
            // Ucieczka znaków specjalnych jest tu obowiązkowa, a nie ozdobna:
            // kody trafiają do wzorca jako tekst, a wzorzec powstaje z łańcucha.
            // Bez tego kod z kropką albo nawiasem zmieniłby znaczenie wyrażenia.
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
         * @param {{closeAmbiguous?: boolean}} [opts] — closeAmbiguous mówi, że
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
         * SECONDARY-SORTING BEZ UŚCIŚLENIA = NIESPRZEDAŻ (9.1.0).
         *
         * Reguła jest niesymetryczna i nie jest to uproszczenie, tylko własność
         * samego systemu: potwierdzenie sprzedażowe `Przedmiot wysłano do
         * Transfer - Sellable` przychodzi ZAWSZE, a niesprzedażowe `Przedmiot
         * wysłano do FBATransfer` pojawia się nie za każdym razem. Znaczy to, że
         * „uściślenia nie było” może znaczyć dokładnie jedno — przedmiot pojechał
         * nie na sprzedaż.
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
            // Uściślenie ma sens TYLKO po niejednoznacznym kodzie: linia
            // „Przedmiot wysłano do ...” występuje też sama z siebie.
            //
            // 9.1.0: cel wybiera się jawnie. Zwykle jest to bieżący przedmiot,
            // ale jeśli już się zmienił, a wisi niezamknięty Secondary-Sorting,
            // uściślenie dotyczy jego — inaczej linia, która przyszła o pół
            // sekundy po zmianie ASIN, przepadałaby na darmo.
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
         * @param {string|null} entryId — id wpisu dziennika (nie indeks: dziennik
         *   jest wspólny na wszystkie karty i po scaleniu kolejność się zmienia).
         *   Przy wyłączonym module cen wpisu nie ma i przychodzi tu `null` —
         *   kierunek i tak trzeba zaliczyć, bo procent sprzedaży dziennika nie
         *   potrzebuje.
         */
        onCompleted(entryId) {
            if (!this.state) this.startItem('zakończenie bez początku');
            this.state.completed = true;
            this.state.entryId = entryId;
            this.apply();
        },

        /**
         * PROCENT SPRZEDAŻY — dwa liczniki, licznik ułamka i odjęcie z mianownika.
         *
         * Liczy się DOKŁADNIE RAZ na przedmiot i dokładnie wtedy, gdy znane są oba
         * warunki: przedmiot zaliczony przez licznik i kierunek ustalony. Oba
         * przychodzą niezależnie i w dowolnej kolejności, a `applyTo` woła się po
         * każdym z nich — bez znacznika `counted` ten sam przedmiot policzyłby
         * się dwa razy.
         *
         * MIANOWNIK = zwykły licznik przedmiotów MINUS przedmioty nierozstrzygalne
         * (1.3.0). Stąd drugi klucz: `tabNeutral`. Skutek widoczny gołym okiem —
         * zrobionych paczek bywa więcej niż paczek, z których liczy się procent.
         *
         * RÓŻNICA MIĘDZY AUDYTEM A BRAKIEM KODU JEST CELOWA:
         *   - audyt (`ROUTE_NEUTRAL_CODES`) wypada z mianownika, bo odpowiedź
         *     „sprzedaż czy nie” zapadnie godziny później, u kogoś innego, i nie
         *     wróci na ten ekran nigdy;
         *   - kod, który się nie pojawił, ZOSTAJE w mianowniku, bo to zwykle
         *     przedmiot, który jednak gdzieś pojechał — tylko my tego nie
         *     zobaczyliśmy. Wyrzucenie go podnosiłoby procent za każdym razem,
         *     gdy skrypt coś przeoczy, czyli nagradzałoby własne błędy.
         *
         * Dzięki temu „trzy pierwsze przedmioty na niesprzedaż” nadal daje
         * uczciwe 0%, a nie brak liczby.
         *
         * Ręczna poprawka licznika (skróty klawiszowe, przyciski) tu nie wchodzi
         * — tak samo, jak nie wchodzi do dziennika wartości. Poprawia się zwykle
         * to, czego program nie zobaczył, a kierunku takiego przedmiotu nikt nie
         * zna.
         */
        countDirection(st) {
            if (!st || st.counted || !st.completed || !st.direction) return;
            st.counted = true;
            const cid = store.currentTabInstanceId;
            if (st.direction === 'sell') {
                const next = (store.tabSold[cid] || 0) + 1;
                store.tabSold[cid] = next;
                StorageManager.saveSold(cid, next);
            } else if (st.direction === 'neutral') {
                const next = (store.tabNeutral[cid] || 0) + 1;
                store.tabNeutral[cid] = next;
                StorageManager.saveNeutral(cid, next);
            }
        },

        /**
         * Zapisuje znak, gdy znane są OBA warunki: przedmiot zaliczony i kierunek
         * ustalony. Kolejność ich wystąpienia nie ma znaczenia.
         *
         * Procent sprzedaży liczy się PRZED sprawdzeniem wpisu dziennika i to
         * jest sedno: przy wyłączonym module cen wpisu nie ma wcale, a procent
         * ma działać i wtedy.
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
