    /**
     * Fabryka przeciągania.
     *
     * W 8.1.0 był to jeden na sztywno zapisany obiekt dla okna statystyk.
     * W 8.2.0 pojawił się drugi przeciągalny panel — karta ceny — więc logika
     * została wyniesiona do fabryki zamiast kopiowania.
     *
     * Oba panele w normalnym stanie są przezroczyste dla myszy
     * (pointer-events:none), dlatego przeciąganie włącza się flagą z ustawień:
     * dopiero wtedy element zaczyna przyjmować zdarzenia.
     */
    function createDragger({ elementId, getFlag, setFlag, savePosition }) {
        return {
            init() {
                this.el = document.getElementById(CONFIG.SCRIPT_ID_PREFIX + elementId);
                this.isDragging = false;
                this.offsetX = 0;
                this.offsetY = 0;

                this.onMouseDown = this.onMouseDown.bind(this);
                this.onMouseMove = this.onMouseMove.bind(this);
                this.onMouseUp = this.onMouseUp.bind(this);

                if (this.el) this.el.addEventListener('mousedown', this.onMouseDown);
                else Utils.error(`Dragger: element ${elementId} nie znaleziony w DOM.`);
            },
            onMouseDown(e) {
                if (!getFlag() || e.button !== 0) return;
                this.isDragging = true;
                const rect = this.el.getBoundingClientRect();
                this.offsetX = e.clientX - rect.left;
                this.offsetY = e.clientY - rect.top;
                this.el.style.cursor = 'grabbing';
                this.el.style.transition = 'none';
                document.addEventListener('mousemove', this.onMouseMove);
                document.addEventListener('mouseup', this.onMouseUp);
            },
            onMouseMove(e) {
                if (!this.isDragging) return;
                e.preventDefault();

                let x = e.clientX - this.offsetX;
                let y = e.clientY - this.offsetY;
                x = Math.max(0, Math.min(x, window.innerWidth - this.el.offsetWidth));
                y = Math.max(0, Math.min(y, window.innerHeight - this.el.offsetHeight));

                this.el.style.left = `${x}px`;
                this.el.style.top = `${y}px`;
                this.el.style.bottom = 'auto';   // zdejmujemy przyklejenie do dołu
            },
            onMouseUp() {
                if (!this.isDragging) return;
                this.isDragging = false;
                document.removeEventListener('mousemove', this.onMouseMove);
                document.removeEventListener('mouseup', this.onMouseUp);
                this.el.style.transition = 'top 0.2s, left 0.2s, background-color 0.2s';
                // `bottom` idzie pusty celowo: skoro człowiek postawił okno ręcznie,
                // to liczy się `top`, a domyślne przyklejenie do dołu ma zniknąć.
                savePosition({ left: this.el.style.left, top: this.el.style.top, bottom: '' });
                setFlag(false);
                StorageManager.saveState();
            },
        };
    }

    const DragDropManager = createDragger({
        elementId: 'statsWindow',
        getFlag: () => store.uiFlags.isStatsWindowDragging,
        setFlag: (v) => { store.uiFlags.isStatsWindowDragging = v; },
        savePosition: (p) => { store.localTabConfig.statsWindowPosition = p; },
    });

    const PriceCardDrag = createDragger({
        elementId: 'priceCard',
        getFlag: () => store.uiFlags.isPriceCardDragging,
        setFlag: (v) => { store.uiFlags.isPriceCardDragging = v; },
        savePosition: (p) => { store.localTabConfig.priceCard.position = p; },
    });
