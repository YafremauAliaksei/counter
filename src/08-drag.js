    /**
     * Fabryka przeciągania — wspólna dla okna statystyk i karty ceny.
     *
     * Oba panele są normalnie przezroczyste dla myszy i dotyku (pointer-events:none),
     * więc przeciąganie włącza się flagą z ustawień; dopiero wtedy element
     * przyjmuje zdarzenia. Po puszczeniu flaga gaśnie sama.
     */
    function createDragger({ elementId, getFlag, setFlag, savePosition }) {
        return {
            init() {
                this.el = document.getElementById(CONFIG.SCRIPT_ID_PREFIX + elementId);
                this.isDragging = false;
                this.pointerId = null;
                this.offsetX = 0;
                this.offsetY = 0;

                this.onPointerDown = this.onPointerDown.bind(this);
                this.onPointerMove = this.onPointerMove.bind(this);
                this.onPointerUp = this.onPointerUp.bind(this);

                if (!this.el) {
                    Utils.error(`Dragger: element ${elementId} nie znaleziony w DOM.`);
                    return;
                }
                // Zdarzenia wskaźnika, a nie myszy: na ekranie dotykowym
                // przeglądarka zamienia na „mysz” tylko stuknięcie, a ruch palcem
                // przewija stronę. `touch-action: none` oddaje ruch palca
                // skryptowi — poza trybem przeciągania element i tak jest
                // przezroczysty dla dotyku (pointer-events:none).
                this.el.style.touchAction = 'none';
                this.el.addEventListener('pointerdown', this.onPointerDown);
            },
            onPointerDown(e) {
                // Drugi palec nie przejmuje okna; z myszy liczy się lewy przycisk.
                if (!getFlag() || e.button !== 0 || e.isPrimary === false) return;
                this.isDragging = true;
                this.pointerId = e.pointerId;
                const rect = this.el.getBoundingClientRect();
                this.offsetX = e.clientX - rect.left;
                this.offsetY = e.clientY - rect.top;
                this.el.style.cursor = 'grabbing';
                this.el.style.transition = 'none';
                // Przechwycenie: palec zjeżdżający z okna dalej je ciągnie.
                if (this.el.setPointerCapture) {
                    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* wskaźnik już puszczony — wystarczą słuchacze na dokumencie */ }
                }
                document.addEventListener('pointermove', this.onPointerMove);
                document.addEventListener('pointerup', this.onPointerUp);
                // Przerwany dotyk (gest systemu, wysunięty palec) kończy jak puszczenie.
                document.addEventListener('pointercancel', this.onPointerUp);
            },
            onPointerMove(e) {
                if (!this.isDragging || e.pointerId !== this.pointerId) return;
                e.preventDefault();

                let x = e.clientX - this.offsetX;
                let y = e.clientY - this.offsetY;
                x = Math.max(0, Math.min(x, window.innerWidth - this.el.offsetWidth));
                y = Math.max(0, Math.min(y, window.innerHeight - this.el.offsetHeight));

                this.el.style.left = `${x}px`;
                this.el.style.top = `${y}px`;
                this.el.style.bottom = 'auto';   // zdejmujemy przyklejenie do dołu
            },
            /** Koniec ciągnięcia bez zapisu — także przy rozbiórce w trakcie ruchu. */
            release() {
                this.isDragging = false;
                this.pointerId = null;
                document.removeEventListener('pointermove', this.onPointerMove);
                document.removeEventListener('pointerup', this.onPointerUp);
                document.removeEventListener('pointercancel', this.onPointerUp);
            },
            onPointerUp(e) {
                if (!this.isDragging || e.pointerId !== this.pointerId) return;
                this.release();
                this.el.style.transition = 'top 0.2s, left 0.2s, background-color 0.2s';
                // `bottom` idzie pusty celowo: skoro człowiek postawił okno ręcznie,
                // to liczy się `top`, a domyślne przyklejenie do dołu ma zniknąć.
                savePosition({ left: this.el.style.left, top: this.el.style.top, bottom: '' });
                setFlag(false);
                Persistence.saveState();
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
