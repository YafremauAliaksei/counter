    // ==========================================
    // 6e. DZIENNIK WARTOŚCI
    // ==========================================
    /**
     * Wartość przedmiotów przetworzonych w ciągu zmiany.
     *
     * Wpis powstaje tylko przy automatycznym zaliczeniu przedmiotu (wyzwalacz
     * końcowy przy podniesionej fladze). Skróty klawiszowe i ręczne poprawki
     * licznika do dziennika nie piszą — poprawia się zwykle to, czego program
     * nie widział, więc i ceny nie ma. Przedmiot przerwany się nie liczy.
     *
     * Dziennik żyje jedną zmianę i zeruje się razem z licznikami;
     * podsumowanie trafia do archiwum (klucz wspólny, niezależny od schematu).
     * Działa tylko z włączonym modułem cen (add()).
     */
    const ValueLog = {
        entries: [],
        shiftStart: null,
        _archiveTimer: null,
        _writeBackTimer: null,

        key() { return StorageManager.getKey(CONFIG.STORAGE_KEY_VALUE_LOG); },
        archiveKey() { return CONFIG.SHARED_ID_PREFIX + CONFIG.STORAGE_KEY_VALUE_ARCHIVE; },

        // ---------------- wspólny dziennik na wszystkie karty ----------------
        /**
         * DZIENNIK JEST JEDEN NA WSZYSTKIE KARTY.
         *
         * Ewidencja idzie po przedmiocie, nie po karcie: ta sama rzecz jedzie
         * z CRET do WHD (znak minus, −150 €), a potem z karty WHD na sprzedaż
         * (plus, +150 €). Poprawny wynik — zero — wychodzi tylko wtedy, gdy oba
         * wpisy leżą w jednym dzienniku.
         *
         * Klucz localStorage jest źródłem prawdy, pamięć karty — kopią roboczą:
         *   1. każdy wpis ma niezmienne `id` i znacznik `updated`;
         *   2. save() czyta wspólny dziennik, scala z nim swoją kopię po id
         *      (wygrywa świeższy `updated`) i zapisuje scalenie — cudzych
         *      wpisów nie da się zamazać;
         *   3. zdarzenie `storage` z sąsiedniej karty woła adoptRemote():
         *      to samo scalanie w drugą stronę;
         *   4. gdy po scaleniu mamy coś, czego we wspólnym dzienniku nie ma,
         *      idzie jeden dopisujący save(); scalanie jest monotoniczne, więc
         *      wymiana się zbiega;
         *   5. usunięcie klucza przez sąsiada to reset zmiany — czyścimy kopię.
         *
         * Pozycje są uporządkowane po czasie (`ts`), nie po kolejności zapisu.
         */
        _migrate(e) {
            if (!e || typeof e !== 'object') return null;
            // Wpis bez id (starszy zapis) dostaje id wyprowadzone z samego
            // wpisu: dwa odczyty tego samego dziennika muszą dać to samo id,
            // inaczej scalanie rozmnoży pozycję.
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
         * Czy po scaleniu mamy coś, czego we wspólnym dzienniku nie ma —
         * nowy wpis albo świeższą wersję istniejącego.
         *
         * Porównanie po id i `updated` (ta sama miara co w _merge), a nie po
         * długości: przy wyścigu zapisów liczba pozycji się zgadza, a różni się
         * treść — wtedy we wspólnym kluczu zostałaby starsza wersja, np.
         * ostatniego przedmiotu zmiany bez kierunku.
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
                // Ten klucz pisze się z pominięciem StorageManager.write —
                // notatka deduplikacji dla niego byłaby nieaktualna.
                delete StorageManager._lastWritten[this.key()];
            } catch (e) {
                Utils.error('Dziennik wartości nie został zapisany', e);
                StorageManager.reportWriteFailure();
            }
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
         * Przerwa tylko skleja paczkę zdarzeń `storage` — sam zapis jest
         * bezpieczny zawsze, bo save() scala.
         */
        _scheduleWriteBack() {
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = setTimeout(() => { this._writeBackTimer = null; this.save(); }, 400);
        },
        /** Czekające dopisanie wykonać od razu — przy wyjściu ze strony. */
        flushWriteBack() {
            if (!this._writeBackTimer) return;
            clearTimeout(this._writeBackTimer);
            this._writeBackTimer = null;
            this.save();
        },

        // ---------------- archiwum ----------------
        /**
         * Archiwum trzyma same podsumowania zmian — pełne listy nie
         * zmieściłyby się w localStorage dzielonym z T-REX. Zapis jest
         * odroczony: save() idzie dwa razy na przedmiot, a każdy zapis archiwum
         * to rozbiór i złożenie 60 zmian.
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
         * Zapisuje zrobiony przedmiot; price może być null — dopisze się później.
         * Bez modułu cen nic nie zapisuje: wszystkie pozycje byłyby bez ceny.
         *
         * @returns {string|null} id wpisu (nie indeks — scalanie z cudzymi
         *   wpisami zmienia kolejność w tablicy).
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
                 * Znak kierunku:
                 *    +1 — sprzedaż, wartość na plus;
                 *    -1 — utylizacja, wartość na minus;
                 *     0 — kierunek nieustalony (kod nie przyszedł przed
                 *         następnym przedmiotem albo audyt). Nie wchodzi do
                 *         sum, ale jest liczony osobno (`?N` w linii 6).
                 */
                sign: 0,
                route: null,      // sam kod sortowania, do analizy po fakcie
                updated: now,     // po nim rozstrzyga się konflikt kart
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
            // Trzeci kierunek (audyt) niesie znak 0: wpis zostaje w dzienniku
            // z kodem, ale do sumy pieniędzy nie wchodzi — tak samo, jak
            // przedmiot, przy którym kod się nie pojawił.
            Utils.log(`[DZIENNIK] ${e.asin || 'bez ASIN'} (${e.dept}): `
                    + `${direction === 'sell' ? 'SPRZEDAŻ +' : direction === 'unsell' ? 'NIESPRZEDAŻ -' : 'NIEROZSTRZYGALNY '}`
                    + (e.price != null ? `${e.price} ${e.currency}` : 'bez ceny')
                    + (code ? ` (${code})` : ''));
            return true;
        },

        /**
         * Dopisuje cenę przedmiotom, które skończyły się, zanim ona przyszła
         * (wolna sieć, przegląd sklepów).
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
         * Podsumowanie zmiany w euro, po wszystkich kartach. Każda cena
         * przechodzi przez FxRates.toEur — funtów i dolarów nie dodaje się
         * do euro.
         *
         *   sold   — wartość sprzedanego (znak +1);
         *   unsold — wartość utylizacji (znak -1), jako liczba dodatnia;
         *   net    — różnica, czyli wynik zmiany.
         *
         * Wpisy bez ceny i bez kursu nie wchodzą do sum i są liczone osobno,
         * żeby zaniżona suma miała widoczną przyczynę.
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
