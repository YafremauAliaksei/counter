    // ==========================================
    // 11. MENEDŻER ZADAŃ (1.3.0)
    // ==========================================
    /**
     * ZADANIA (TASKI): OSOBNY ZEGAR DLA KAŻDEGO PROCESU PRACY.
     *
     * =====================================================================
     * PROBLEM, KTÓRY TO ROZWIĄZUJE
     * =====================================================================
     * Tempo liczyło się od POCZĄTKU ZMIANY — godziny wpisanej na stałe (6:30
     * albo 18:30). Kto przyszedł do procesu trzy godziny później i zrobił trzy
     * paczki w sześć minut, widział „1 paczka na godzinę” zamiast „30 na
     * godzinę”. Liczba była policzona poprawnie, a jej znaczenie fałszywe —
     * i to jest gorsze niż brak liczby, bo w liczbę się wierzy.
     *
     * Zadanie ma własny zegar. Tempo zadania to jego paczki przez jego czas,
     * więc opóźniony start, przerwa na rozmowę z kierownikiem i przejście
     * z procesu o normie 30/h do procesu o normie 100/h przestają się mieszać
     * w jedną nieczytelną średnią.
     *
     * =====================================================================
     * WZNOWIENIE ZAMIAST DRUGIEGO ZADANIA O TEJ SAMEJ NAZWIE
     * =====================================================================
     * Zadanie ma LISTĘ ODCINKÓW, a nie jeden początek i koniec. Kto pracował
     * trzy godziny w procesie zwykłym, poszedł na pięć godzin do szybkiego
     * i wrócił do zwykłego, WZNAWIA to pierwsze zadanie — z tym samym
     * identyfikatorem. Dzięki temu w podsumowaniu zmiany stoi jedno zadanie
     * z sensownym tempem, a nie trzy wpisy 30 / 100 / 30, z których nic nie
     * widać. Odcinek jest też miejscem na pauzę: zamknięty odcinek zatrzymuje
     * zegar, a pierwsza paczka po pauzie otwiera nowy — bo skoro paczki idą,
     * to przerwa się skończyła, niezależnie od tego, czy ktoś o tym pamiętał.
     *
     * =====================================================================
     * RĘCZNIE WPISANE PACZKI NIE WCHODZĄ DO MIANOWNIKA PROCENTU
     * =====================================================================
     * Po awarii maszyny (a komputer stoi na sesji tymczasowej, więc pamięć
     * przeglądarki znika w całości) człowiek pamięta swoje tempo albo liczbę
     * paczek, ale nie pamięta, ile z nich poszło na sprzedaż. Wpisana liczba
     * trafia więc do paczek ORAZ do licznika „poza mianownikiem” — tego samego,
     * którym od 1.3.0 liczą się audyty. Skutek: procent sprzedaży pokazuje
     * wyłącznie to, co skrypt naprawdę zobaczył, czyli liczy się od przedmiotu,
     * przy którym człowiek wrócił do pracy. Gdyby wpisane paczki wchodziły do
     * mianownika, procent po każdej awarii spadałby do kilku procent i nie
     * znaczyłby już nic.
     *
     * =====================================================================
     * NIENARUSZALNA RÓWNOŚĆ
     * =====================================================================
     * Suma paczek wszystkich zadań danej karty ZAWSZE równa się licznikowi tej
     * karty. Liczniki zmiany zostają jedynym źródłem prawdy dla linii 1, 2 i 7,
     * a zadania są ich rozbiciem w czasie. Obie strony ruszają się w jednym
     * miejscu — w metodach niżej — i pilnuje tego osobne sprawdzenie w testach.
     *
     * =====================================================================
     * ZAPIS
     * =====================================================================
     *   `tasks`                      — wspólny dla wszystkich kart: lista zadań
     *                                  i identyfikator aktywnego. Zadanie jest
     *                                  własnością CZŁOWIEKA, nie karty: kto
     *                                  przechodzi do innego procesu, przechodzi
     *                                  w nim z wszystkimi otwartymi kartami.
     *   `taskcnt_<id>_<karta>`       — liczniki, OSOBNY KLUCZ NA KARTĘ. Tak samo
     *                                  jak liczniki zmiany i z tego samego
     *                                  powodu: dwie karty piszące jeden klucz
     *                                  zamazywałyby sobie liczby nawzajem.
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
         * razem ze zmianą — bo dopóki człowiek nie powie inaczej, cała zmiana
         * jest jednym procesem. To zachowanie sprzed 1.3.0 i po włączeniu
         * skryptu nic się nie zmienia: jedno zadanie, tempo liczone od początku
         * zmiany.
         */
        init() {
            if (store.tasks.length) return this.active();
            return this.create(CONFIG.DEFAULT_TASK_NAME,
                               store.sessionConfig.shiftCalculatedStartTime || Date.now());
        },

        // ---------------- zmiany listy ----------------
        /**
         * Zadania siedzą w zwykłej tablicy, a tablice NIE są reaktywne (patrz
         * createReactive: Utils.isObject odrzuca tablice). Dlatego każda zmiana
         * podmienia całą tablicę — inaczej linia 8 i panel nie dowiedziałyby się
         * o niczym, dopóki czegoś innego nie ruszy magistrali.
         */
        _commit(list) {
            store.tasks = list.slice();
            this.save();
        },

        /** Nazwa bez białych brzegów, przycięta do granicy z konfiguracji. */
        cleanName(raw, fallback) {
            const name = String(raw == null ? '' : raw).trim().slice(0, CONFIG.TASK_MAX_NAME_LEN);
            return name || fallback || CONFIG.DEFAULT_TASK_NAME;
        },

        /**
         * Początek odcinka: nie w przyszłości i nie wcześniej niż początek
         * odcinka, który właśnie zamykamy.
         *
         * Drugie ograniczenie nie jest ozdobne: bez niego przestawienie startu
         * „o dwie minuty wstecz” tuż po przełączeniu dałoby poprzedniemu
         * zadaniu odcinek o ujemnej długości, a więc tempo z dzieleniem przez
         * liczbę ujemną.
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
         * POCZĄTEK CAŁEGO ZADANIA — „zacząłem dwie minuty temu”, „zacząłem razem
         * ze zmianą”.
         *
         * ===================================================================
         * DLACZEGO CAŁEGO, A NIE OSTATNIEGO ODCINKA (poprawka z 1.3.2)
         * ===================================================================
         * Pierwsza wersja przestawiała początek OSTATNIEGO odcinka, a czas
         * zadania jest sumą WSZYSTKICH. Wystarczyło raz zatrzymać zegar
         * i kliknąć „początek zmiany”, żeby ostatni odcinek rozciągnął się na
         * całą zmianę OBOK odcinków wcześniejszych. Każde powtórzenie dokładało
         * kolejne pięć godzin: po niespełna pięciu godzinach pracy dało się
         * naklikać czternaście.
         *
         * Człowiek ma w głowie jedno zdanie — „to zadanie zaczęło się o X” —
         * więc kontrolka musi robić dokładnie to:
         *
         *   - przesunięcie WSTECZ rozciąga pierwszy odcinek do nowego początku;
         *   - przesunięcie W PRZÓD obcina wszystko, co leży przed nim: odcinki
         *     zamknięte wcześniej znikają, a odcinek, w środku którego wypada
         *     nowy początek, zaczyna się od niego.
         *
         * Przerwy zostają nietknięte, a przepracowany czas NIGDY nie przekracza
         * odstępu od początku zadania do teraz. To jest niezmiennik, który
         * pilnuje testów — gdyby istniał od początku, tamten błąd nie wyszedłby
         * dopiero na hali.
         */
        setStart(id, ms) {
            const task = this.byId(id);
            if (!task) return;
            const wanted = Math.min(Math.max(0, Number(ms) || 0), Date.now());
            const first = task.segments[0];
            if (wanted <= first.from) {
                first.from = wanted;
            } else {
                const kept = task.segments
                    .filter(seg => seg.to === null || seg.to > wanted)
                    .map(seg => ({ from: Math.max(seg.from, wanted), to: seg.to }));
                task.segments = kept.length ? kept : [{ from: wanted, to: null }];
            }
            this._commit(store.tasks);
        },

        remove(id) {
            const task = this.byId(id);
            if (!task || store.tasks.length <= 1) return false;
            const list = store.tasks.filter(t => t.id !== id);
            // Liczniki znikają razem z zadaniem, inaczej suma zadań przestałaby
            // zgadzać się z licznikiem zmiany. Licznik zmiany schodzi o tyle samo.
            const counters = store.taskCounters[id] || {};
            for (const [tabKey, c] of Object.entries(counters)) {
                store.tabCounters[tabKey] = Math.max(0, (store.tabCounters[tabKey] || 0) - (c.done || 0));
                store.tabSold[tabKey] = Math.max(0, (store.tabSold[tabKey] || 0) - (c.sold || 0));
                store.tabNeutral[tabKey] = Math.max(0, (store.tabNeutral[tabKey] || 0) - (c.neutral || 0));
                StorageManager.saveCounter(tabKey, store.tabCounters[tabKey]);
                StorageManager.saveSold(tabKey, store.tabSold[tabKey]);
                StorageManager.saveNeutral(tabKey, store.tabNeutral[tabKey]);
                StorageManager.removeTaskCounter(id, tabKey);
            }
            delete store.taskCounters[id];
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
         * Chwila, od której czas zadań w ogóle się liczy: początek zmiany.
         *
         * Sesja wirtualna startuje o 06:20 albo 18:20, a zmiana o 06:30 albo
         * 18:30 — te dziesięć minut nie jest pracą. Skrypt uruchamia się właśnie
         * wtedy, więc zadanie domyślne powstawało o 06:20: początku w przyszłości
         * zapisać się nie da (clampStart). Linia 1 liczyła od 06:30, linia 8 od
         * 06:20 — przy tych samych paczkach dwa różne tempa, na każdej zmianie.
         *
         * Przycięcie jest przy ODCZYCIE, a nie przy zapisie, bo odcinek przed
         * startem zmiany powstaje kilkoma drogami: zadanie domyślne, nowe zadanie
         * o 06:25, paczka w pauzie, skrypt wklejony w martwej strefie (18:10),
         * zanim zmiana w ogóle była znana. Jedno miejsce zamiast czterech.
         *
         * Bez rozpoznanej zmiany nie przycina niczego — nie ma od czego.
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
            if (!task) return;
            const c = this.counters(task.id, tabKey);
            this._write(task.id, tabKey, { ...c, done: c.done + 1 });
        },

        addSold(tabKey) {
            const task = this.active();
            if (!task) return;
            const c = this.counters(task.id, tabKey);
            this._write(task.id, tabKey, { ...c, sold: c.sold + 1 });
        },

        addNeutral(tabKey) {
            const task = this.active();
            if (!task) return;
            const c = this.counters(task.id, tabKey);
            this._write(task.id, tabKey, { ...c, neutral: c.neutral + 1 });
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
            // Przez ensureRunning, a nie przez active(): ręczna paczka też jest
            // paczką, więc kończy pauzę tak samo, jak zaliczona automatycznie.
            const task = this.ensureRunning();
            if (!task) return;
            const c = this.counters(task.id, tabKey);
            const done = Math.max(0, c.done + delta);
            const used = done - c.done;          // ile naprawdę weszło po przycięciu do zera
            this._write(task.id, tabKey, {
                done,
                sold: Math.min(c.sold, done),
                neutral: Math.max(0, Math.min(done, c.neutral + used)),
            });
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
                const done = c.done - take;
                this._write(task.id, tabKey, {
                    done,
                    sold: Math.min(c.sold, done),
                    neutral: Math.min(c.neutral, done),
                });
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
            const c = this.counters(task.id, tabKey);
            const done = Math.max(0, c.done + delta);
            const used = done - c.done;
            this._write(task.id, tabKey, {
                done,
                sold: Math.min(c.sold, done),
                neutral: Math.max(0, Math.min(done, c.neutral + used)),
            });
        },

        /**
         * Godzina wpisana ręcznie („18:32”) na znacznik czasu.
         *
         * Wynik to NAJBLIŻSZA taka godzina: dzisiejsza albo wczorajsza. Na
         * nocnej zmianie o 00:40 wpisane „23:30” znaczy pięćdziesiąt minut temu,
         * a nie prawie dobę naprzód. Bez tego clampStart przyciąłby wartość do
         * „teraz” i człowiek dostałby zadanie o zerowej długości.
         *
         * 1.3.3, dwie poprawki:
         *   - „wczoraj” liczy się przez setDate(-1), a nie odjęciem 24 h: doba
         *     zmiany czasu ma 23 albo 25 godzin i „23:30” lądowało o 22:30
         *     albo o 00:30 (w tym repozytorium już tak robi lunchOverlapMs);
         *   - wczoraj wybiera się tylko wtedy, gdy jest BLIŻEJ niż dziś.
         *     Wcześniej każda godzina choćby minutę późniejsza niż teraz szła
         *     na wczoraj, więc „06:36” wpisane o 06:35:30 cofało zadanie o dobę.
         *     Godzina z dzisiaj tuż przed nami przycina się w setStart do teraz.
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
            const current = this.totals(task).done;
            const c = this.counters(task.id, tabKey);
            const delta = target - current;
            const done = Math.max(0, c.done + delta);
            const used = done - c.done;
            this._write(task.id, tabKey, {
                done,
                sold: Math.min(c.sold, done),
                neutral: Math.max(0, Math.min(done, c.neutral + used)),
            });
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
