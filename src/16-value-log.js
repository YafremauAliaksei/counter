    // ==========================================
    // 6e. DZIENNIK WARTOŚCI (8.4.0)
    // ==========================================
    /**
     * Łączna wartość przedmiotów przetworzonych przez zmianę.
     *
     * CO SIĘ LICZY. Wyłącznie przedmiot, który przeszedł PEŁNĄ ścieżkę: ten,
     * na którym zadziałał automatyczny przyrost licznika (pojawiło się
     * `Przypisz nowy` przy wzniesionej fladze początku). Ani skróty klawiszowe,
     * ani ręczna poprawka licznika do dziennika nie piszą — ręcznie poprawia się
     * zwykle właśnie to, czego program nie zobaczył, a ceny do tego i tak nie ma.
     *
     * Przedmioty przerwane nie liczą się z tego samego powodu, co w liczniku:
     * `Przypisz nowy` nie zadziałał, nie ma czego liczyć.
     *
     * CYKL ŻYCIA — jak u liczników: dziennik żyje jedną zmianę i zeruje się
     * razem z nimi przy przejściu na nową. Podsumowania idą przy tym do
     * archiwum (wspólny, nieversjonowany klucz), więc historia nie ginie.
     *
     * 9.2.0: dziennik napełnia się TYLKO przy włączonym module cen — patrz add().
     */
    const ValueLog = {
        entries: [],
        shiftStart: null,
        _archiveTimer: null,
        _writeBackTimer: null,

        key() { return StorageManager.getKey(CONFIG.STORAGE_KEY_VALUE_LOG); },
        archiveKey() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_VALUE_ARCHIVE; },

        // ---------------- wspólny dziennik na wszystkie karty (9.1.0) ----------------
        /**
         * DZIENNIK JEST JEDEN NA WSZYSTKIE KARTY I TO GŁÓWNA WŁASNOŚĆ WERSJI 9.1.0.
         *
         * Co było zepsute wcześniej. Dziennik czytało się z localStorage DOKŁADNIE
         * RAZ, przy starcie, a save() pisała do wspólnego klucza CAŁĄ swoją
         * tablicę. Dwie otwarte karty (CRET i WHD — normalny tryb pracy) trzymały
         * dwie niezależne kopie i zamazywały się nawzajem: w kluczu zostawały
         * wpisy tej karty, która zapisała ostatnia.
         *
         * Dlaczego to ważne właśnie tutaj. Ewidencja jest przekrojowa po
         * przedmiocie, a nie po karcie: ta sama rzecz jedzie z CRET do WHD (kod
         * `WHD`, znak minus, −150 €), a potem jest obsługiwana na karcie WHD
         * i idzie na sprzedaż (znak plus, +150 €). Poprawny wynik to zero i widać
         * go TYLKO wtedy, gdy oba wpisy leżą w jednym dzienniku.
         *
         * Jak to zrobiono. Klucz localStorage jest jedynym źródłem prawdy,
         * a pamięć karty jego kopią roboczą:
         *
         *   1. każdy wpis ma NIEZMIENNE `id` i znacznik `updated`;
         *   2. save() PRZECZYTUJE wspólny dziennik, scala z nim swoją kopię po id
         *      (przy konflikcie wygrywa świeższy `updated`) i pisze scalenie —
         *      czyli cudzych wpisów nie da się fizycznie zamazać;
         *   3. zdarzenie `storage` z sąsiedniej karty wywołuje adoptRemote():
         *      to samo scalanie, tylko w drugą stronę;
         *   4. jeśli po scaleniu mamy wpisy, których we wspólnym dzienniku nie ma,
         *      robi się jeden dopisujący save(). Scalanie jest monotoniczne, więc
         *      wymiana zbiega się i nie zapętla;
         *   5. usunięcie klucza przez sąsiada traktuje się jako reset zmiany
         *      i czyści naszą kopię — nie ma czego wskrzeszać.
         *
         * Kolejność pozycji w scaleniu — po czasie (`ts`), a nie po tym, kto
         * zdążył zapisać: dziennik czyta się oczami.
         */
        _migrate(e) {
            if (!e || typeof e !== 'object') return null;
            // Wpisy sprzed 9.1.0 nie mają id. Nadajemy stabilne, wyprowadzone
            // z samego wpisu: dwa odczyty tego samego starego dziennika muszą dać
            // to samo id, inaczej scalanie rozmnoży pozycję.
            if (!e.id) e.id = `v90_${e.ts || 0}_${e.asin || 'noasin'}_${e.dept || '?'}`;
            if (typeof e.updated !== 'number') e.updated = e.ts || 0;
            return e;
        },

        /** Wspólny dziennik w postaci, w jakiej leży teraz w localStorage. */
        _readShared() {
            try {
                const raw = JSON.parse(localStorage.getItem(this.key()) || 'null');
                if (raw && Array.isArray(raw.entries)) {
                    return {
                        shiftStart: raw.shiftStart || null,
                        entries: raw.entries.map(e => this._migrate(e)).filter(Boolean),
                    };
                }
            } catch (e) { Utils.error('Dziennik wartości nie został odczytany', e); }
            return null;
        },

        /**
         * Czy po scaleniu mamy coś, czego we wspólnym dzienniku nie ma.
         *
         * Wcześniej rozstrzygała o tym sama DŁUGOŚĆ: `merged.length >
         * shared.entries.length`. Gubiło to przypadek, w którym liczba pozycji
         * się zgadza, a różni się ich TREŚĆ — czyli dokładnie skutek wyścigu
         * przy odczycie i zapisie wspólnego klucza (localStorage nie daje tu
         * żadnej atomowości):
         *
         *   1. stawiamy kierunek przedmiotu, save() czyta wspólny dziennik;
         *   2. sąsiednia karta zdążyła w tej szparze zapisać swoją, starszą
         *      wersję tej samej pozycji;
         *   3. dostajemy zdarzenie `storage`, scalamy — nasza wersja wygrywa
         *      po `updated`, ale długość się zgadza, więc dopisanie się nie
         *      planowało i we wspólnym kluczu zostawała wersja starsza.
         *
         * Naprawiało się to samo przy następnym przedmiocie (save() scala),
         * więc realnie zagrożony był wyłącznie OSTATNI przedmiot zmiany — ten,
         * po którym nic już nie zapisywało. Cicho i akurat na podsumowaniu.
         *
         * Teraz porównanie idzie po id i po `updated`: to ta sama miara, którą
         * rozstrzyga _merge(), więc obie strony wymiany widzą tak samo.
         */
        _aheadOfShared(merged, sharedEntries) {
            const theirs = new Map();
            for (const e of sharedEntries) if (e && e.id) theirs.set(e.id, e.updated || 0);
            return merged.some(e => {
                if (!e || !e.id) return false;
                if (!theirs.has(e.id)) return true;
                return (e.updated || 0) > theirs.get(e.id);
            });
        },

        /** Scalenie dwóch list po id; przy konflikcie wygrywa świeższy updated. */
        _merge(base, mine) {
            const map = new Map();
            for (const e of base) if (e && e.id) map.set(e.id, e);
            for (const e of mine) {
                if (!e || !e.id) continue;
                const cur = map.get(e.id);
                if (!cur || (e.updated || 0) >= (cur.updated || 0)) map.set(e.id, e);
            }
            return [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        },

        load() {
            const shared = this._readShared();
            this.entries = shared ? shared.entries : [];
            this.shiftStart = shared ? shared.shiftStart : null;
            if (this.entries.length) Utils.log(`[DZIENNIK] wczytano wpisów: ${this.entries.length}`);
        },

        save() {
            const shared = this._readShared();
            const merged = shared ? this._merge(shared.entries, this.entries) : this.entries.slice();
            this.entries = merged;
            if (!this.shiftStart && shared && shared.shiftStart) this.shiftStart = shared.shiftStart;
            try {
                localStorage.setItem(this.key(), JSON.stringify({
                    shiftStart: this.shiftStart, entries: merged,
                }));
                // Pamięć „nie pisz tego samego” żyje w StorageManager i o tym
                // kluczu nic nie wie — zdejmujemy notatkę, żeby nie przeszkodziła
                // sąsiedniej karcie przy następnym zapisie.
                delete StorageManager._lastWritten[this.key()];
            } catch (e) { Utils.error('Dziennik wartości nie został zapisany', e); }
            this.scheduleArchive();
            bus.emit('valueLog:changed');
        },

        /** Sąsiednia karta zmieniła wspólny dziennik. */
        adoptRemote() {
            const shared = this._readShared();
            if (!shared) {
                // Klucza już nie ma — sąsiednia karta zresetowała zmianę.
                if (this.entries.length) {
                    Utils.log('[DZIENNIK] sąsiednia karta wyczyściła dziennik — zdejmujemy swoją kopię');
                }
                clearTimeout(this._writeBackTimer);
                this.entries = [];
                this.shiftStart = store.sessionConfig.shiftCalculatedStartTime || null;
                bus.emit('valueLog:changed');
                return;
            }
            const before = this.entries.length;
            const merged = this._merge(shared.entries, this.entries);
            const haveOurOwn = this._aheadOfShared(merged, shared.entries);
            this.entries = merged;
            if (shared.shiftStart) this.shiftStart = shared.shiftStart;
            bus.emit('valueLog:changed');
            if (before !== merged.length || haveOurOwn) {
                Utils.log(`[DZIENNIK] synchronizacja: u nas było ${before}, w magazynie `
                        + `${shared.entries.length}, jest ${merged.length}`);
            }
            if (haveOurOwn) this._scheduleWriteBack();
        },

        /**
         * Dopisać do wspólnego dziennika nasze wpisy, których sąsiad nie widział.
         * Przerwa jest potrzebna tylko po to, żeby skleić paczkę zdarzeń
         * `storage`; sam zapis jest bezpieczny w dowolnym momencie, bo save()
         * scala.
         */
        _scheduleWriteBack() {
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = setTimeout(() => { this._writeBackTimer = null; this.save(); }, 400);
        },

        // ---------------- archiwum ----------------
        /**
         * Archiwum trzyma tylko PODSUMOWANIA zmian, nie pozycje: pełna lista
         * z dziesiątek zmian nie zmieściłaby się w localStorage dzielonym
         * z samą aplikacją TREX. Dla bieżącej zmiany pozycje są w entries.
         *
         * 9.1.0: zapis jest odroczony. Wcześniej writeArchive() szła przy KAŻDYM
         * wywołaniu save(), czyli dwa razy na przedmiot (utworzenie wpisu
         * i postawienie znaku), a za każdym razem był to rozbiór i złożenie
         * całego archiwum na 60 zmian.
         */
        scheduleArchive() {
            clearTimeout(this._archiveTimer);
            this._archiveTimer = setTimeout(() => {
                this._archiveTimer = null;
                this.writeArchive();
            }, CONFIG.VALUE_ARCHIVE_WRITE_DEBOUNCE_MS);
        },
        /** Zapisać archiwum natychmiast (reset zmiany, wyjście ze strony). */
        flushArchive() {
            clearTimeout(this._archiveTimer);
            this._archiveTimer = null;
            this.writeArchive();
        },

        writeArchive() {
            const start = this.shiftStart || store.sessionConfig.shiftCalculatedStartTime;
            if (!start) return;
            let arc = {};
            try { arc = JSON.parse(localStorage.getItem(this.archiveKey()) || '{}') || {}; } catch (e) { arc = {}; }
            const t = this.totals();
            const byDept = {};
            for (const e of this.entries) {
                const d = e.dept || '?';
                if (!byDept[d]) byDept[d] = { count: 0, sold: 0, unsold: 0 };
                byDept[d].count++;
                const eur = FxRates.toEur(e.price, e.currency);
                if (eur == null) continue;
                if (e.sign > 0) byDept[d].sold += eur;
                else if (e.sign < 0) byDept[d].unsold += eur;
            }
            for (const d of Object.keys(byDept)) {
                byDept[d].sold = +byDept[d].sold.toFixed(2);
                byDept[d].unsold = +byDept[d].unsold.toFixed(2);
            }
            arc[String(start)] = {
                start,
                shiftType: store.sessionConfig.shiftType || null,
                count: t.count,
                sold: +t.sold.toFixed(2), unsold: +t.unsold.toFixed(2), net: +t.net.toFixed(2),
                soldN: t.soldN, unsoldN: t.unsoldN,
                undetermined: t.undetermined, unpriced: t.unpriced,
                currency: 'EUR', byDept,
                updated: Date.now(),
            };
            const keys = Object.keys(arc).sort((a, b) => Number(a) - Number(b));
            if (keys.length > CONFIG.VALUE_ARCHIVE_MAX_SHIFTS) {
                keys.slice(0, keys.length - CONFIG.VALUE_ARCHIVE_MAX_SHIFTS).forEach(k => delete arc[k]);
            }
            try { localStorage.setItem(this.archiveKey(), JSON.stringify(arc)); } catch (e) { /* magazyn pełny albo zablokowany — archiwum jest wygodą, nie danymi krytycznymi */ }
        },

        // ---------------- wpisy ----------------
        /**
         * Zapisuje zrobiony przedmiot. price może być null — dopisze się później.
         *
         * 9.2.0: pierwszy warunek to moduł cen. Przy wyłączonym module wszystkie
         * pozycje i tak byłyby bez ceny, a dziennik pełen pustych wpisów tylko
         * zaśmiecałby localStorage i mylił w podsumowaniu.
         *
         * @returns {string|null} id wpisu (nie indeks: po scaleniu z cudzymi
         *   wpisami kolejność w tablicy się zmienia i indeks przestaje być adresem).
         */
        add(asin, priceObj, dept) {
            if (!priceModuleOn()) return null;
            if (!store.localTabConfig.priceCard.logValues) return null;
            if (this.entries.length >= CONFIG.VALUE_LOG_MAX_ENTRIES) {
                Utils.error('Dziennik wartości przepełniony, wpis pominięty');
                return null;
            }
            if (!this.shiftStart) this.shiftStart = store.sessionConfig.shiftCalculatedStartTime || Date.now();
            const now = Date.now();
            const entry = {
                // id jest unikalne po karcie i po czasie: dwie karty, które
                // zapisały przedmiot w tej samej milisekundzie, nie zleją się
                // w jedną pozycję.
                id: Utils.generateId(`${dept || store.currentTabInstanceId || 'x'}_`),
                asin: asin || null,
                price: priceObj && typeof priceObj.value === 'number' ? priceObj.value : null,
                currency: priceObj && priceObj.currency ? priceObj.currency : null,
                dept: dept || store.currentTabInstanceId || '?',
                ts: now,
                /**
                 * ZNAK KIERUNKU (9.0.0):
                 *    +1 — przedmiot poszedł na sprzedaż, wartość idzie na plus;
                 *    -1 — poszedł do utylizacji, wartość idzie na minus;
                 *     0 — kierunek TAK I NIE ZOSTAŁ USTALONY.
                 *
                 * Zero nie jest błędem ani „jeszcze nie policzyliśmy”: to uczciwe
                 * „kod sortowania nie pojawił się do początku następnego
                 * przedmiotu”. Taki wpis nie idzie ani na plus, ani na minus, ale
                 * widać go osobnym licznikiem, żeby było jasne, że ustalono 112
                 * ze 113, a nie że suma jest zaniżona nie wiadomo czemu.
                 */
                sign: 0,
                route: null,      // sam kod sortowania, do analizy po fakcie
                updated: now,     // 9.1.0: po nim rozstrzyga się konflikt kart
            };
            this.entries.push(entry);
            this.save();
            Utils.log(`[DZIENNIK] przedmiot ${entry.asin || 'bez ASIN'} (${entry.dept}), razem ${this.entries.length}: `
                    + (entry.price != null ? `${entry.price} ${entry.currency}` : 'cena na razie nieznana'));
            return entry.id;
        },

        /**
         * Stawia kierunek wpisu. Woła go moduł Routing — albo od razu przy
         * tworzeniu wpisu, albo później, gdy kod sortowania wreszcie przyszedł.
         * @param {string} id — identyfikator wpisu wydany przez add().
         */
        setDirection(id, direction, code) {
            const e = id ? this.entries.find(x => x.id === id) : null;
            if (!e) return false;
            const sign = direction === 'sell' ? 1 : direction === 'unsell' ? -1 : 0;
            if (e.sign === sign && e.route === (code || null)) return false;
            e.sign = sign;
            e.route = code || null;
            e.updated = Date.now();
            this.save();
            Utils.log(`[DZIENNIK] ${e.asin || 'bez ASIN'} (${e.dept}): `
                    + `${direction === 'sell' ? 'SPRZEDAŻ +' : 'NIESPRZEDAŻ -'}`
                    + (e.price != null ? `${e.price} ${e.currency}` : 'bez ceny')
                    + (code ? ` (${code})` : ''));
            return true;
        },

        /**
         * Dopisuje cenę przedmiotowi, który skończył się wcześniej, niż ona
         * przyjechała. W praktyce rzadkość — obrazek Keepa odpowiada w dziesiątki
         * milisekund, a przedmiot obsługuje się minutami — ale jeśli sieć zwalnia,
         * pozycji tracić nie wolno.
         */
        fillPending(asin, priceObj) {
            if (!asin || !priceObj || typeof priceObj.value !== 'number') return 0;
            let n = 0;
            const now = Date.now();
            for (let i = this.entries.length - 1; i >= 0; i--) {
                const e = this.entries[i];
                if (e.asin === asin && e.price == null) {
                    e.price = priceObj.value;
                    e.currency = priceObj.currency || 'EUR';
                    e.updated = now;
                    n++;
                }
            }
            if (n) { this.save(); Utils.log(`[DZIENNIK] dopisano cenę ${asin}: ${priceObj.value} (pozycji: ${n})`); }
            return n;
        },

        /**
         * Podsumowanie zmiany — trzy liczby w EURO, po WSZYSTKICH kartach naraz.
         *
         * Wszystko sprowadza się do euro (FxRates): funtów z co.uk i dolarów
         * z com nie wolno dodawać do euro, a trzymać wyniku w pięciu walutach dla
         * wskaźnika „ile wyrobiłem na zmianie” nie ma sensu.
         *
         * Liczy się oddzielnie:
         *   sold   — wartość sprzedanego (znak +1);
         *   unsold — wartość tego, co poszło do utylizacji (znak -1), jako liczba
         *            DODATNIA: znak dopisuje się przy pokazywaniu, tak wygodniej
         *            liczyć;
         *   net    — różnica, i to jest wynik zmiany.
         *
         * Wpisy bez ceny i bez kursu do sum nie wchodzą i liczone są osobno:
         * po cichu zaniżać wyniku nie wolno, to to samo kłamstwo, tylko w drugą
         * stronę.
         */
        totals() {
            let sold = 0, unsold = 0, soldN = 0, unsoldN = 0;
            let undetermined = 0, unpriced = 0, noRate = 0;
            for (const e of this.entries) {
                if (typeof e.price !== 'number') { unpriced++; continue; }
                const eur = FxRates.toEur(e.price, e.currency);
                if (eur == null) { noRate++; continue; }
                if (e.sign > 0) { sold += eur; soldN++; }
                else if (e.sign < 0) { unsold += eur; unsoldN++; }
                else undetermined++;
            }
            return {
                count: this.entries.length,
                sold, unsold, net: sold - unsold,
                soldN, unsoldN, undetermined, unpriced, noRate,
                currency: 'EUR',
            };
        },

        reset(reason) {
            this.flushArchive();               // podsumowań odchodzącej zmiany nie tracimy
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = null;
            this.entries = [];
            this.shiftStart = store.sessionConfig.shiftCalculatedStartTime || null;
            try { localStorage.removeItem(this.key()); } catch (e) { /* nie ma czego usuwać albo magazyn niedostępny — i tak czyścimy stan w pamięci */ }
            delete StorageManager._lastWritten[this.key()];
            Utils.log(`[DZIENNIK] wyczyszczony: ${reason}`);
            bus.emit('valueLog:changed');
        },

        /** Szczegółowy wydruk do konsoli — do przeniesienia do sprawozdania. */
        report() {
            const t = this.totals();
            const rows = this.entries.map((e, i) => {
                const eur = FxRates.toEur(e.price, e.currency);
                return {
                    '#': i + 1,
                    czas: Utils.formatTime(new Date(e.ts), true, ':'),
                    ASIN: e.asin || '—',
                    cena: e.price != null ? e.price.toFixed(2) : '—',
                    waluta: e.currency || '—',
                    'w euro': eur != null ? eur.toFixed(2) : '—',
                    kierunek: e.sign > 0 ? 'sprzedaż' : e.sign < 0 ? 'niesprzedaż' : 'NIEOKREŚLONY',
                    kod: e.route || '—',
                    dział: e.dept,
                };
            });
            if (console.table) console.table(rows); else Utils.log(rows);
            Utils.log('RAZEM:', t);
            return { totals: t, entries: this.entries };
        },

        archive() {
            try { return JSON.parse(localStorage.getItem(this.archiveKey()) || '{}'); }
            catch (e) { return {}; }
        },
    };
