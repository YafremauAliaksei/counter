    // ==========================================
    // 6. INTERFEJS I RENDERERY
    // ==========================================
    const CSSManager = {
        init() {
            this.styleEl = h('style', { id: 'reactiveStyles' });
            document.head.appendChild(this.styleEl);
            this.updateAll();
            // Tylko wygląd karty: podmiana textContent w <style> unieważnia
            // style całego dokumentu, więc nie może iść przy każdej zmianie
            // stanu (np. flagach ustawianych na każdym przedmiocie).
            onStorePaths(['localTabConfig'], () => this.updateAll());
        },
        updateAll() {
            const lc = store.localTabConfig;
            // Każda liczba w tym łańcuchu przechodzi przez Utils.clampNum,
            // a każdy kolor przez Utils.hexToRgb. Oba zwracają same cyfry, więc
            // wartość z localStorage nie może zamknąć reguły i dopisać własnej.
            const bgAlpha = Utils.clampNum(lc.statsWindowBgAlpha, 0, 100, 0);
            let css = `:root {
                --sh-bg-color: rgba(${Utils.hexToRgb(lc.statsWindowBgColorHex)}, ${bgAlpha / 100});
                --sh-font: ${CONFIG.FONT_FAMILY_OPTIONS[lc.statsWindowFontFamily] || CONFIG.FONT_FAMILY_OPTIONS.default};
            `;

            Object.keys(lc.linesConfig).forEach(k => {
                // Nazwa zmiennej CSS powstaje z klucza konfiguracji, więc klucz
                // musi być nazwą, a nie dowolnym tekstem. Zapisana konfiguracja
                // mogłaby przynieść klucz ze spacją albo nawiasem klamrowym.
                if (!/^[A-Za-z0-9_]+$/.test(k)) return;
                const cfg = lc.linesConfig[k];
                const alpha = Utils.clampNum(cfg.alpha, 0, 100, 60);
                const size = Utils.clampNum(cfg.fontSize, 6, 96, 14);
                css += `
                --sh-${k}-color: rgba(${Utils.hexToRgb(cfg.colorHex)}, ${alpha / 100});
                --sh-${k}-size: ${size}px;
                --sh-${k}-display: ${cfg.visible ? 'block' : 'none'};
                `;
            });
            css += `}`;
            this.styleEl.textContent = css;
        }
    };

    // Kolejność linii w oknie. Jedno miejsce prawdy: po tej liście renderer
    // tworzy elementy, a CSSManager i panel ustawień chodzą po linesConfig.
    const LINE_KEYS = ['line1_currentTab', 'line2_globalSummary', 'line3_shiftInfo',
                       'line4_lunchInfo', 'line5_realTimeClock', 'line6_valueSum',
                       'line7_compact', 'line8_taskInfo'];
