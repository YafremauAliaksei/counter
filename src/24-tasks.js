    // ==========================================
    // 11. MENEDŻER ZADAŃ
    // ==========================================
    /**
     * ZADANIA (TASKI): OSOBNY ZEGAR DLA KAŻDEGO PROCESU PRACY.
     *
     * =====================================================================
     * PO CO
     * =====================================================================
     * Tempo zmiany liczy się od jej początku (06:30 albo 18:30). Kto przyszedł
     * do procesu trzy godziny później i zrobił trzy paczki w sześć minut,
     * widziałby „1 na godzinę” zamiast „30 na godzinę” — liczba poprawna,
     * znaczenie fałszywe.
     *
     * Zadanie ma własny zegar: tempo zadania to jego paczki przez jego czas.
     * Opóźniony start, przerwa i przejście między procesami o różnych normach
     * nie mieszają się w jedną średnią.
     *
     * =====================================================================
     * WZNOWIENIE ZAMIAST DRUGIEGO ZADANIA O TEJ SAMEJ NAZWIE
     * =====================================================================
     * Zadanie ma listę odcinków, a nie jeden początek i koniec. Powrót do
     * procesu wznawia to samo zadanie, więc podsumowanie zmiany ma jedno
     * zadanie z sensownym tempem zamiast wpisów 30 / 100 / 30. Zamknięty
     * odcinek to pauza; pierwsza paczka po pauzie otwiera nowy odcinek — skoro
     * paczki idą, przerwa się skończyła.
     *
     * =====================================================================
     * RĘCZNIE WPISANE PACZKI NIE WCHODZĄ DO MIANOWNIKA PROCENTU
     * =====================================================================
     * Po awarii maszyny (sesja tymczasowa — pamięć przeglądarki znika)
     * człowiek pamięta tempo albo liczbę paczek, ale nie to, ile poszło na
     * sprzedaż. Wpisana liczba trafia do paczek oraz do licznika „poza
     * mianownikiem” (jak audyty), więc procent sprzedaży opisuje tylko to, co
     * skrypt naprawdę zobaczył, a nie spada po awarii do kilku procent.
     *
     * =====================================================================
     * NIENARUSZALNA RÓWNOŚĆ
     * =====================================================================
     * Suma paczek wszystkich zadań karty zawsze równa się licznikowi tej
     * karty. Liczniki zmiany są źródłem prawdy dla linii 1, 2 i 7, a zadania
     * ich rozbiciem w czasie. Obie strony ruszają się w metodach poniżej;
     * pilnują tego testy.
     *
     * =====================================================================
     * ZAPIS
     * =====================================================================
     *   `tasks`                — wspólny dla kart: lista zadań i aktywne.
     *                            Zadanie należy do człowieka, nie do karty.
     *   `taskcnt_<id>_<karta>` — liczniki, klucz na kartę: dwie karty
     *                            piszące jeden klucz zamazywałyby sobie liczby.
     */
    const TaskManager = {
        // ---------------- dostęp ----------------
        list() { return store.tasks; },
        byId(id) { return store.tasks.find(t => t.id === id) || null; },
        /** Aktywne zadanie albo null, gdy trwa pauza. */
        active() { return this.byId(store.activeTaskId); },
        /** Czy zegar zadania chodzi (ostatni odcinek jest otwarty). */
        isRunning(task) {
            const last = task && task.segments[task.segments.length - 1];
            return !!(last && last.to === null);
        },

        /**
         * Zadanie domyślne powstaje przy pierwszym uruchomieniu i zaczyna się
         * razem ze zmianą — dopóki człowiek nie powie inaczej, cała zmiana
         * jest jednym procesem, a tempo liczy się od jej początku.
         */
        init() {
            if (store.tasks.length) return this.active();
            return this.create(CONFIG.DEFAULT_TASK_NAME,
                               store.sessionConfig.shiftCalculatedStartTime || Date.now());
        },

        // ---------------- zmiany listy ----------------
        /**
         * Tablice nie są reaktywne (createReactive pomija tablice), więc każda
         * zmiana podmienia całą listę — inaczej linia 8 i panel nie
         * dowiedziałyby się o niej.
         */
        _commit(list) {
            this._stamp(list);
            store.tasks = list.slice();
            this.save();
        },

        /**
         * ZADANIA W DWÓCH KARTACH NARAZ.
         *
         * Lista leży w jednym kluczu na wszystkie karty. Zapis całej listy
         * z pamięci karty wymazywałby zadanie założone przed chwilą w sąsiedniej
         * karcie (a jego paczki zostałyby w liczniku). Dlatego zadanie niesie
         * `updated`, usunięte zostawia nagrobek w `_removed`, a przełączenie
         * aktywnego — `_activeAt`. Zapis scala z magazynem: wygrywa nowsza
         * wersja zadania, nagrobek wygrywa z wersją sprzed usunięcia, aktywne
         * jest ostatnio przełączone.
         */
        _sig: {},
        _removed: {},
        _activeAt: 0,
        _lastActive: null,
        _signature: (t) => JSON.stringify([t.name, t.segments]),
        _stamp(list) {
            const now = Date.now();
            const alive = new Set();
            for (const t of list) {
                alive.add(t.id);
                const sig = this._signature(t);
                if (this._sig[t.id] !== sig) { t.updated = now; this._sig[t.id] = sig; }
            }
            for (const id of Object.keys(this._sig)) {
                if (!alive.has(id)) { this._removed[id] = now; delete this._sig[id]; }
            }
            if (store.activeTaskId !== this._lastActive) { this._activeAt = now; this._lastActive = store.activeTaskId; }
        },

        /** Stan zadań tej karty scalony z tym, co leży w magazynie. */
        merge(stored) {
            const shiftStart = store.sessionConfig.shiftCalculatedStartTime || null;
            const mine = { shiftStart, activeId: store.activeTaskId, activeAt: this._activeAt,
                           list: store.tasks, removed: this._removed };
            if (!stored || !Array.isArray(stored.list)) return mine;
            // Inna zmiana w magazynie: nie scala się dwóch zmian — wygrywa nowsza.
            if (stored.shiftStart && shiftStart && stored.shiftStart !== shiftStart) {
                return stored.shiftStart > shiftStart ? stored : mine;
            }
            const removed = { ...(stored.removed || {}) };
            for (const [id, ts] of Object.entries(mine.removed)) removed[id] = Math.max(removed[id] || 0, ts);
            // Kolejność z magazynu, bo to kolejność zakładania we wszystkich
            // kartach; nowe zadania tej karty na koniec.
            const byId = new Map(stored.list.map(t => [t.id, t]));
            for (const t of mine.list) {
                const other = byId.get(t.id);
                if (!other || (t.updated || 0) >= (other.updated || 0)) byId.set(t.id, t);
            }
            const list = [...byId.values()].filter(t => !(removed[t.id] >= (t.updated || 0)));
            const ours = (mine.activeAt || 0) >= (stored.activeAt || 0);
            let activeId = ours ? mine.activeId : stored.activeId;
            if (!list.some(t => t.id === activeId)) activeId = list.length ? list[list.length - 1].id : null;
            return { shiftStart, activeId, activeAt: Math.max(mine.activeAt || 0, stored.activeAt || 0), list, removed };
        },

        /** Przyjęcie scalonego stanu do pamięci — bez znakowania go jako „naszej zmiany”. */
        adopt(state) {
            store.tasks = state.list;
            store.activeTaskId = state.activeId;
            this._removed = { ...(state.removed || {}) };
            this._activeAt = state.activeAt || 0;
            this._lastActive = state.activeId;
            this._sig = {};
            for (const t of state.list) this._sig[t.id] = this._signature(t);
        },

        /** Nazwa bez białych brzegów, przycięta do granicy z konfiguracji. */
        cleanName(raw, fallback) {
            const name = String(raw == null ? '' : raw).trim().slice(0, CONFIG.TASK_MAX_NAME_LEN);
            return name || fallback || CONFIG.DEFAULT_TASK_NAME;
        },

        /**
         * Początek odcinka: nie w przyszłości i nie wcześniej niż początek
         * odcinka, który właśnie zamykamy — inaczej „dwie minuty wstecz” tuż po
         * przełączeniu dałoby poprzedniemu zadaniu odcinek o ujemnej długości.
         */
        clampStart(ms) {
            const now = Date.now();
            const wanted = Number(ms);
            let value = isFinite(wanted) ? wanted : now;
            const current = this.active();
            if (current) {
                const last = current.segments[current.segments.length - 1];
                // Nie wcześniej niż początek ostatniego odcinka i nie wcześniej
                // niż jego koniec: wznowienie sprzed własnej pauzy dałoby dwa
                // odcinki nachodzące na siebie, czyli czas policzony dwa razy.
                value = Math.max(value, last.from, last.to === null ? last.from : last.to);
            }
            return Math.min(value, now);
        },

        /** Zamyka otwarty odcinek aktywnego zadania na podanej chwili. */
        closeActive(atMs) {
            const task = this.active();
            if (!task || !this.isRunning(task)) return;
            const last = task.segments[task.segments.length - 1];
            last.to = Math.max(last.from, atMs);
        },

        /** Nowe zadanie i od razu przejście do niego. */
        create(name, startMs) {
            const from = this.clampStart(startMs);
            this.closeActive(from);
            const task = {
                id: Utils.generateId('task_'),
                name: this.cleanName(name),
                segments: [{ from, to: null }],
            };
            const list = store.tasks.slice();
            list.push(task);
            store.activeTaskId = task.id;
            this._commit(list);
            Utils.log(`[ZADANIE] nowe: ${task.name}`);
            return task;
        },

        /**
         * Wznowienie zadania, które już było: nowy odcinek na tym samym
         * identyfikatorze. To jest cała różnica wobec `create` i cały powód,
         * dla którego zadanie ma listę odcinków.
         */
        resume(id, startMs) {
            const task = this.byId(id);
            if (!task) return null;
            if (task.id === store.activeTaskId && this.isRunning(task)) return task;
            const from = this.clampStart(startMs);
            this.closeActive(from);
            task.segments.push({ from, to: null });
            store.activeTaskId = task.id;
            this._commit(store.tasks);
            Utils.log(`[ZADANIE] wznowione: ${task.name}`);
            return task;
        },

        /** Pauza: zegar staje, ale zadanie zostaje aktywne. */
        pause(atMs) {
            const task = this.active();
            if (!task || !this.isRunning(task)) return;
            this.closeActive(Math.min(Number(atMs) || Date.now(), Date.now()));
            this._commit(store.tasks);
            Utils.log(`[ZADANIE] pauza: ${task.name}`);
        },

        /**
         * Paczka w trakcie pauzy znaczy, że pauza się skończyła. Zegar rusza od
         * TEJ paczki, a nie wstecz — czas, którego nie było, nie wraca.
         */
        ensureRunning() {
            let task = this.active();
            if (!task) task = this.init() || this.active();
            if (!task) return null;
            if (!this.isRunning(task)) {
                task.segments.push({ from: Date.now(), to: null });
                this._commit(store.tasks);
                Utils.log(`[ZADANIE] pauza przerwana paczką: ${task.name}`);
            }
            return task;
        },

        rename(id, name) {
            const task = this.byId(id);
            if (!task) return;
            task.name = this.cleanName(name, task.name);
            this._commit(store.tasks);
        },

        /**
         * POCZĄTEK CAŁEGO ZADANIA — „zacząłem dwie minuty temu”, „zacząłem
         * razem ze zmianą”.
         *
         * Przestawia się początek zadania, a nie ostatniego odcinka: czas
         * zadania to suma odcinków, więc rozciąganie ostatniego dokładałoby
         * godziny obok wcześniejszych przy każdym kliknięciu.
         *   - wstecz: pierwszy odcinek rozciąga się do nowego początku;
         *   - w przód: wszystko przed nowym początkiem jest obcinane — odcinki
         *     zamknięte wcześniej znikają, a ten, w którym wypada początek,
         *     zaczyna się od niego.
         *
         * Przerwy zostają. Niezmiennik (testy): przepracowany czas nigdy nie
         * przekracza odstępu od początku zadania do teraz.
         */
        setStart(id, ms) {
            const task = this.byId(id);
            const asked = Number(ms);
            // Tekst, zero i liczby ujemne nie są chwilą (0 to 1 stycznia 1970).
            if (!task || !Number.isFinite(asked) || asked <= 0) return;
            const wanted = Math.min(Math.max(asked, this.previousEnd(task)), Date.now());
            const first = task.segments[0];
            if (wanted <= first.from) {
                first.from = wanted;
            } else {
                const kept = task.segments
                    .filter(seg => seg.to === null || seg.to > wanted)
                    .map(seg => ({ from: Math.max(seg.from, wanted), to: seg.to }));
                // Zadanie zatrzymane zostaje zatrzymane — przestawienie
                // początku nie puszcza zegara.
                const running = this.isRunning(task);
                task.segments = kept.length ? kept : [{ from: wanted, to: running ? null : wanted }];
            }
            this._commit(store.tasks);
        },

        /**
         * Koniec ostatniego odcinka innych zadań przed początkiem tego zadania —
         * poniżej tej granicy początku cofnąć nie wolno. Inaczej „początek
         * zmiany” na drugim zadaniu nałożyłby je na pierwsze: te same godziny
         * liczone dwa razy, a obiad odjęty podwójnie.
         */
        previousEnd(task) {
            const own = task.segments[0].from;
            let end = 0;
            for (const other of store.tasks) {
                if (other.id === task.id) continue;
                for (const seg of other.segments) {
                    if (seg.to !== null && seg.to <= own && seg.to > end) end = seg.to;
                }
            }
            return end;
        },

        remove(id) {
            const task = this.byId(id);
            if (!task || store.tasks.length <= 1) return false;
            const list = store.tasks.filter(t => t.id !== id);
            // Liczniki znikają razem z zadaniem, a licznik zmiany schodzi
            // o tyle samo — suma zadań musi się zgadzać z licznikiem karty.
            // Liczniki czyta się z magazynu, nie z pamięci: sąsiednia karta
            // mogła dopisać paczki, o których ta jeszcze nie wie.
            const tabs = new Set([...Object.keys(store.taskCounters[id] || {}), ...StorageManager.storedTaskTabs(id)]);
            for (const tabKey of tabs) {
                const c = StorageManager.freshTaskCounter(id, tabKey, this.counters(id, tabKey));
                for (const [prefix, memory, value] of [
                    [CONFIG.STORAGE_PREFIX_TAB_COUNTER, store.tabCounters, c.done],
                    [CONFIG.STORAGE_PREFIX_TAB_SOLD, store.tabSold, c.sold],
                    [CONFIG.STORAGE_PREFIX_TAB_NEUTRAL, store.tabNeutral, c.neutral],
                ]) {
                    const key = StorageManager.getKey(prefix + tabKey);
                    memory[tabKey] = Math.max(0, StorageManager.freshCount(key, memory[tabKey] || 0) - value);
                    StorageManager.write(key, String(memory[tabKey]));
                }
                StorageManager.removeTaskCounter(id, tabKey);
            }
            const counters = { ...store.taskCounters };
            delete counters[id];
            store.taskCounters = counters;
            if (store.activeTaskId === id) store.activeTaskId = list[list.length - 1].id;
            this._commit(list);
            return true;
        },

        // ---------------- czas ----------------
        /**
         * Przepracowany czas zadania: suma odcinków minus obiad, który się z nimi
         * pokrywa.
         *
         * Obiad odejmuje się tym samym rachunkiem, co w linii 1 — inaczej
         * człowiek, który nie pamiętał o postawieniu pauzy na przerwę, miałby
         * w zadaniu pół godziny pracy, której nie było.
         */
        workedMs(task, nowMs) {
            if (!task) return 0;
            const now = Number(nowMs) || Date.now();
            const floor = this.countedFrom();
            let total = 0;
            for (const seg of task.segments) {
                const from = Math.max(seg.from, floor);
                const to = seg.to === null ? now : seg.to;
                if (to <= from) continue;
                total += (to - from) - ShiftManager.lunchOverlapMs(from, to);
            }
            return Math.max(0, total);
        },

        /**
         * Chwila, od której czas zadań się liczy: początek zmiany.
         *
         * Sesja startuje o 06:20 albo 18:20, zmiana o 06:30 albo 18:30 — te
         * dziesięć minut nie jest pracą, a skrypt uruchamia się właśnie wtedy.
         * Bez przycięcia linia 8 liczyłaby od 06:20, a linia 1 od 06:30.
         *
         * Przycięcie jest przy odczycie, bo odcinek sprzed zmiany powstaje
         * kilkoma drogami (zadanie domyślne, nowe zadanie o 06:25, paczka
         * w pauzie, skrypt wklejony w martwej strefie). Bez rozpoznanej zmiany
         * nie przycina niczego.
         */
        countedFrom() {
            const start = store.sessionConfig.shiftCalculatedStartTime;
            return typeof start === 'number' ? start : -Infinity;
        },

        /**
         * Początek pierwszego odcinka i koniec ostatniego — do podsumowania.
         * Początek widać w panelu, więc przycina się tak samo jak czas: inaczej
         * panel pokazywałby 06:20, a tempo liczyłoby się od 06:30.
         */
        span(task) {
            if (!task || !task.segments.length) return { from: null, to: null };
            const first = task.segments[0];
            const last = task.segments[task.segments.length - 1];
            const from = Math.max(first.from, this.countedFrom());
            return { from, to: last.to === null ? null : Math.max(last.to, from) };
        },

        // ---------------- liczniki ----------------
        /** Liczniki zadania na danej karcie; zawsze zwraca komplet pól. */
        counters(id, tabKey) {
            const byTab = store.taskCounters[id] || {};
            const c = byTab[tabKey] || {};
            return { done: c.done || 0, sold: c.sold || 0, neutral: c.neutral || 0 };
        },

        /** Suma liczników zadania po wszystkich kartach. */
        totals(task) {
            const out = { done: 0, sold: 0, neutral: 0 };
            const byTab = (task && store.taskCounters[task.id]) || {};
            for (const c of Object.values(byTab)) {
                out.done += c.done || 0;
                out.sold += c.sold || 0;
                out.neutral += c.neutral || 0;
            }
            return out;
        },

        /** Zapis liczników zadania dla jednej karty. Jedyne miejsce, które je rusza. */
        _write(id, tabKey, next) {
            const byTab = { ...(store.taskCounters[id] || {}) };
            byTab[tabKey] = {
                done: Math.max(0, next.done | 0),
                sold: Math.max(0, next.sold | 0),
                neutral: Math.max(0, next.neutral | 0),
            };
            store.taskCounters = { ...store.taskCounters, [id]: byTab };
            StorageManager.saveTaskCounter(id, tabKey, byTab[tabKey]);
        },

        /**
         * Przedmiot zaliczony automatycznie: paczka zadania rośnie, kierunek
         * dopisze się osobno (Routing woła `addSold` albo `addNeutral`, gdy go
         * pozna — może to być dopiero za kilka skanów).
         */
        addItem(tabKey) {
            const task = this.ensureRunning();
            if (task) this._bump(task, tabKey, 'done');
        },

        addSold(tabKey) {
            const task = this.active();
            if (task) this._bump(task, tabKey, 'sold');
        },

        addNeutral(tabKey) {
            const task = this.active();
            if (task) this._bump(task, tabKey, 'neutral');
        },

        /**
         * +1 do jednego pola licznika zadania — od wartości w magazynie, bo dwie
         * karty tego samego działu dzielą klucz (StorageManager.freshCount).
         */
        _bump(task, tabKey, field) {
            const c = StorageManager.freshTaskCounter(task.id, tabKey, this.counters(task.id, tabKey));
            this._write(task.id, tabKey, { ...c, [field]: c[field] + 1 });
        },

        /**
         * RĘCZNA POPRAWKA LICZNIKA — skrót klawiszowy, przycisk, pole w panelu.
         *
         * Idzie do paczek I do licznika „poza mianownikiem”, bo kierunku takiego
         * przedmiotu nikt nie zna: poprawia się zwykle to, czego program nie
         * zobaczył. Dzięki temu ręczna poprawka nie rozcieńcza procentu
         * sprzedaży — ani w dół (gdyby liczyła się jak niesprzedaż), ani w górę.
         */
        adjustManual(tabKey, delta) {
            // Zero to nie poprawka: −1 przy pustym liczniku nie może zdjąć pauzy.
            if (!delta) return;
            // Odjęcie idzie drogą wpisania liczby wprost — od najnowszego
            // zadania wstecz, bo paczki mogą leżeć w poprzednim zadaniu.
            if (delta < 0) {
                this.applyManualTotal(tabKey, this.shiftTotal(tabKey, 'done') + delta);
                return;
            }
            // Przez ensureRunning, a nie przez active(): ręczna paczka też jest
            // paczką, więc kończy pauzę tak samo, jak zaliczona automatycznie.
            const task = this.ensureRunning();
            if (!task) return;
            const c = this.counters(task.id, tabKey);
            this._write(task.id, tabKey, { ...c, done: c.done + delta, neutral: c.neutral + delta });
        },

        /**
         * Liczniki po zmniejszeniu paczek do `done` — bez przesunięcia procentu.
         *
         * Zdejmowana paczka ma nieznany kierunek, więc procent (sprzedane przez
         * paczki z mianownika) nie ma prawa od tego drgnąć. Kolejność:
         *   1. najpierw paczki SPOZA mianownika (wpisane ręcznie, audyty) —
         *      procentu nie dotykają wcale, więc +1 i −1 to para odwracalna;
         *   2. potem paczki z mianownika, a sprzedane maleją proporcjonalnie.
         *
         * Paczki są całkowite, więc procent zostaje z dokładnością do jednej
         * paczki (np. −1 przy 10/5 daje dalej 50%, a nie 55%).
         */
        _shrink(c, done) {
            const drop = c.done - done;
            const neutral = Math.max(0, c.neutral - drop);
            const rated = c.done - c.neutral;
            const ratedLeft = rated - (drop - (c.neutral - neutral));
            const sold = rated > 0 ? Math.round(c.sold * ratedLeft / rated) : 0;
            return { done, sold: Math.min(sold, ratedLeft), neutral };
        },

        /**
         * Wpisanie licznika karty wprost („zrobiłem dziś 180”) — tak wraca się
         * do pracy po awarii maszyny.
         *
         * Różnicę bierze na siebie aktywne zadanie. Gdy liczba jest MNIEJSZA niż
         * to, co zadania mają razem, nadmiar zdejmuje się od najnowszego wstecz:
         * inaczej suma zadań rozjechałaby się z licznikiem karty, a to jedyna
         * równość, na której stoi całe rozliczenie.
         */
        applyManualTotal(tabKey, target) {
            const wanted = Math.max(0, Number(target) || 0);
            let diff = wanted - this.shiftTotal(tabKey, 'done');
            if (!diff) return;
            if (diff > 0) {
                this.adjustManual(tabKey, diff);
                return;
            }
            for (let i = store.tasks.length - 1; i >= 0 && diff < 0; i--) {
                const task = store.tasks[i];
                const c = this.counters(task.id, tabKey);
                if (!c.done) continue;
                const take = Math.min(c.done, -diff);
                this._write(task.id, tabKey, this._shrink(c, c.done - take));
                diff += take;
            }
        },

        /** Suma pola po wszystkich zadaniach dla jednej karty. */
        shiftTotal(tabKey, field) {
            let sum = 0;
            for (const task of store.tasks) sum += this.counters(task.id, tabKey)[field] || 0;
            return sum;
        },

        // ---------------- liczby dla człowieka ----------------
        /** Paczki na godzinę. Poniżej granicy z konfiguracji tempo nie istnieje. */
        rate(task, nowMs) {
            const worked = this.workedMs(task, nowMs);
            if (worked < CONFIG.RATE_MIN_WORKED_MS) return 0;
            return this.totals(task).done / (worked / 3600000);
        },

        /** Procent sprzedaży zadania: paczki bez tych, których kierunku nie da się znać. */
        percent(task) {
            const t = this.totals(task);
            return Utils.percentFloor(t.sold, t.done - t.neutral);
        },

        /**
         * Ile paczek odpowiada zadanemu tempu — dwukierunkowe pole w panelu.
         *
         * Zwraca liczbę CAŁKOWITĄ, bo paczek połówkowych nie ma. Panel po
         * wpisaniu tempa pokazuje tempo przeliczone z tej liczby z powrotem
         * (`rate`), więc człowiek widzi wartość OSIĄGALNĄ, a nie tę, którą
         * wpisał: przy 1:17 pracy tempo 118 daje 151 paczek, czyli naprawdę
         * 117,7 na godzinę.
         */
        doneForRate(task, rate, nowMs) {
            const worked = this.workedMs(task, nowMs);
            const wanted = Number(rate);
            // Ta sama granica, co w `rate`: przeliczanie tempa na paczki przy
            // trzech sekundach pracy dałoby liczbę wziętą z niczego, a wpisuje
            // się ona do liczników na stałe.
            if (!isFinite(wanted) || wanted < 0 || worked < CONFIG.RATE_MIN_WORKED_MS) return null;
            return Math.max(0, Math.round(wanted * worked / 3600000));
        },

        /**
         * Wpisanie liczby paczek WPROST dla jednego zadania.
         *
         * Liczby zadania sumują się po wszystkich kartach, więc różnica idzie do
         * tej karty, przy której człowiek siedzi. Paczki dopisane tą drogą są
         * jak każde inne wpisane ręcznie: poza mianownikiem procentu.
         */
        applyTaskTotal(task, tabKey, target) {
            if (!task) return;
            const wanted = Math.max(0, Number(target) || 0);
            const delta = wanted - this.totals(task).done;
            if (!delta) return;
            this._applyDelta(task, tabKey, delta);
        },

        /**
         * Zmiana paczek zadania na jednej karcie — wspólna dla pola paczek
         * i pola tempa. W górę: paczki poza mianownik, bo ich kierunku nikt nie
         * zna. W dół: przez _shrink, żeby procent nie drgnął.
         */
        _applyDelta(task, tabKey, delta) {
            const c = this.counters(task.id, tabKey);
            if (delta >= 0) {
                this._write(task.id, tabKey, { ...c, done: c.done + delta, neutral: c.neutral + delta });
            } else {
                this._write(task.id, tabKey, this._shrink(c, Math.max(0, c.done + delta)));
            }
        },

        /**
         * Liczniki zmiany karty (paczki, sprzedane, poza mianownikiem) dostają
         * sumy z zadań. Jedno miejsce dla panelu i skrótu klawiszowego, żeby
         * linia 1 nie rozjechała się z zadaniami.
         */
        syncShift(tabKey) {
            store.tabCounters[tabKey] = this.shiftTotal(tabKey, 'done');
            store.tabSold[tabKey] = this.shiftTotal(tabKey, 'sold');
            store.tabNeutral[tabKey] = this.shiftTotal(tabKey, 'neutral');
            StorageManager.saveCounter(tabKey, store.tabCounters[tabKey]);
            StorageManager.saveSold(tabKey, store.tabSold[tabKey]);
            StorageManager.saveNeutral(tabKey, store.tabNeutral[tabKey]);
        },

        /**
         * Godzina wpisana ręcznie („18:32”) na znacznik czasu.
         *
         * Wynik to najbliższa taka godzina: dzisiejsza albo wczorajsza. Na
         * nocnej zmianie o 00:40 wpisane „23:30” to pięćdziesiąt minut temu.
         *   - „wczoraj” przez setDate(-1), nie odjęcie 24 h — doba zmiany czasu
         *     ma 23 albo 25 godzin;
         *   - wczoraj tylko wtedy, gdy jest bliżej niż dziś: „06:36” wpisane
         *     o 06:35:30 to dziś, a setStart przytnie je do teraz.
         *
         * @returns {number|null} null, gdy tekst nie jest godziną.
         */
        parseClock(text) {
            const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(String(text == null ? '' : text));
            if (!m) return null;
            const hours = parseInt(m[1], 10);
            const minutes = parseInt(m[2], 10);
            if (hours > 23 || minutes > 59) return null;
            const now = Date.now();
            const d = new Date(now);
            d.setHours(hours, minutes, 0, 0);
            const today = d.getTime();
            if (today <= now) return today;
            d.setDate(d.getDate() - 1);
            const yesterday = d.getTime();
            return today - now < now - yesterday ? today : yesterday;
        },

        /**
         * „Chcę mieć mniej więcej takie tempo” — wpisane tempo zamienia się na
         * paczki, a różnica idzie do bieżącej karty.
         *
         * Liczby zadania sumują się po WSZYSTKICH kartach, więc cel liczy się
         * z sumy, a dopisuje do tej karty, przy której człowiek siedzi. Paczki
         * dopisane tą drogą są jak każde inne wpisane ręcznie: idą poza
         * mianownik procentu, bo ich kierunku nikt nie zna.
         *
         * @returns {number|null} liczba paczek zadania po zmianie albo null,
         *   gdy tempa nie da się przeliczyć (za krótki czas pracy, zły tekst).
         */
        setRate(task, rate, tabKey, nowMs) {
            if (!task) return null;
            const target = this.doneForRate(task, rate, nowMs);
            if (target === null) return null;
            this._applyDelta(task, tabKey, target - this.totals(task).done);
            return this.totals(task).done;
        },

        // ---------------- zapis ----------------
        save() {
            StorageManager.saveTasks();
        },

        /** Sprawozdanie do konsoli: SH.tasks() */
        info() {
            const now = Date.now();
            return store.tasks.map(t => {
                const tot = this.totals(t);
                const span = this.span(t);
                return {
                    nazwa: t.name + (t.id === store.activeTaskId ? ' (aktywne)' : ''),
                    paczki: tot.done,
                    'poza mianownikiem': tot.neutral,
                    tempo: this.rate(t, now).toFixed(1),
                    procent: this.percent(t) + '%',
                    czas: Utils.formatDuration(this.workedMs(t, now)),
                    odcinki: t.segments.length,
                    od: span.from ? new Date(span.from).toTimeString().substring(0, 5) : '—',
                };
            });
        },
    };
