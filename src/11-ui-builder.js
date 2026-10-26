    const UIBuilder = {
        /**
         * Wiersz: podpis po lewej, kontrolki po prawej, zawsze w jednej
         * linii. Podpis ma stałą kolumnę i łamie się w niej sam, a kontrolki
         * biorą resztę (minWidth 0 — długie pole się zwęża, zamiast spychać
         * wiersz pod podpis). Kolumna jeden pod drugim marnowała pół panelu.
         */
        row(labelStr, ...controls) {
            return h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '6px', flexWrap: 'nowrap', gap: '10px' } },
                labelStr ? h('label', { textContent: labelStr + ':', style: { flex: '0 0 150px', fontWeight: '500', lineHeight: '1.25' } }) : null,
                h('div', { style: { display: 'flex', alignItems: 'center', flex: '1 1 0', minWidth: '0', flexWrap: 'wrap', gap: '6px' } }, ...controls)
            );
        },
        section(title) {
            return h('div', { className: 'sh-section', style: { marginBottom: '12px', borderBottom: `1px dashed ${CONFIG.SETTINGS_PANEL_TEXT_COLOR}33`, paddingBottom: '8px' } },
                h('h3', { textContent: title, style: { margin: '0 0 8px 0', fontSize: '1.15em', color: CONFIG.SETTINGS_PANEL_ACCENT_COLOR } })
            );
        },
        /**
         * Podpis pod kontrolką. Odstęp od góry dodatni: przycisk ma 44 px
         * wysokości i nie ma dolnego marginesu, więc podpis przysunięty
         * ujemnym marginesem wchodziłby mu na krawędź.
         */
        hint(text) {
            return h('div', {
                textContent: text,
                style: { fontSize: '0.85em', color: '#666', margin: '4px 0 8px 0', lineHeight: '1.35' },
            });
        },
        slider(min, max, value, onChange, labelFormatter) {
            const lbl = h('span', { textContent: labelFormatter(value), style: { minWidth: '70px', fontSize: '0.9em' } });
            const inp = h('input', {
                type: 'range', min, max, value, style: { flexGrow: '1' },
                // Number(): input.value to łańcuch, a konfiguracja trzyma liczby.
                onInput: (e) => { lbl.textContent = labelFormatter(e.target.value); onChange(Number(e.target.value)); }
            });
            return[inp, lbl];
        },
        colorPickerWithAlpha(hex, alpha, onColorChange, onAlphaChange) {
            const picker = h('input', {
                type: 'color', value: hex, style: { width: '40px', height: '24px', padding: '0', border: '1px solid #ccc', cursor: 'pointer' },
                onChange: (e) => onColorChange(e.target.value)
            });
            const [alphaSlider, alphaLabel] = this.slider(0, 100, alpha, onAlphaChange, v => `${v}%`);
            return h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', flexGrow: '1' } }, picker, alphaSlider, alphaLabel);
        },
        button(text, onClick, cssOverrides = {}) {
            return h('button', {
                textContent: text, onClick,
                style: { padding: '8px 14px', background: CONFIG.SETTINGS_PANEL_ACCENT_COLOR, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', ...cssOverrides }
            });
        },
        select(options, value, onChange) {
            const sel = h('select', { onChange: (e) => onChange(e.target.value), style: { padding: '4px', borderRadius: '4px', border: '1px solid #ccc' } });
            options.forEach(opt => sel.appendChild(h('option', { value: opt.value, textContent: opt.text, selected: String(opt.value) === String(value) })));
            return sel;
        },
        /**
         * Pole wyboru z napisem. Podpis (`hint`) stoi pod napisem, po prawej
         * stronie pola, a nie pod całym wierszem — szerokość panelu idzie na
         * tekst, a nie na pustą kolumnę pod kwadracikiem.
         */
        checkbox(label, checked, onChange, hint) {
            const chk = h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked), style: { marginRight: '10px', cursor: 'pointer' } });
            const text = hint
                ? h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                    h('span', { textContent: label }),
                    h('span', { textContent: hint, style: { fontSize: '0.85em', color: '#666', lineHeight: '1.35' } }))
                : h('span', { textContent: label });
            return h('label', { style: { display: 'flex', alignItems: hint ? 'flex-start' : 'center', cursor: 'pointer', flexGrow: '1', padding: '4px 0' } }, chk, text);
        },
        /**
         * Pole liczby nieujemnej. Pusty tekst nie jest zerem — jedno Backspace
         * i Enter w polu licznika działu skasowałoby paczki zmiany bez pytania.
         * Zero trzeba wpisać świadomie.
         */
        numberInput(val, onChange) {
            return this.live(h('input', { type: 'number', min: 0, value: val, inputMode: 'numeric',
                style: { width: '100px', textAlign: 'right' } }), (text) => {
                const n = parseInt(text, 10);
                if (Number.isFinite(n)) onChange(Math.max(0, n));
            });
        },
        /**
         * Pole, które zapisuje się samo: po PANEL_INPUT_DELAY_MS bez pisania
         * i od razu przy wyjściu z pola (zdarzenie change). Enter nie jest
         * potrzebny — na ekranie dotykowym często nie ma go pod ręką.
         * `commit` dostaje tekst pola i musi znosić powtórzenie tej samej
         * wartości: po zapisie z opóźnienia wyjście z pola woła go jeszcze raz.
         */
        live(input, commit) {
            const later = Utils.debounce(() => commit(input.value), CONFIG.PANEL_INPUT_DELAY_MS);
            input.addEventListener('input', () => later());
            input.addEventListener('change', () => { later.cancel(); commit(input.value); });
            return input;
        },
    };
