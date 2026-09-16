    const UIBuilder = {
        row(labelStr, ...controls) {
            return h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '10px', flexWrap: 'nowrap' } },
                labelStr ? h('label', { textContent: labelStr + ':', style: { minWidth: '150px', fontWeight: '500', marginRight: '10px' } }) : null,
                h('div', { style: { display: 'flex', alignItems: 'center', flexGrow: '1', gap: '8px' } }, ...controls)
            );
        },
        section(title) {
            return h('div', { className: 'sh-section', style: { marginBottom: '20px', borderBottom: `1px dashed ${CONFIG.SETTINGS_PANEL_TEXT_COLOR}33`, paddingBottom: '15px' } },
                h('h3', { textContent: title, style: { margin: '0 0 12px 0', fontSize: '1.15em', color: CONFIG.SETTINGS_PANEL_ACCENT_COLOR } })
            );
        },
        hint(text) {
            return h('div', {
                textContent: text,
                style: { fontSize: '0.85em', color: '#666', margin: '-4px 0 10px 0', lineHeight: '1.35' },
            });
        },
        slider(min, max, value, onChange, labelFormatter) {
            const lbl = h('span', { textContent: labelFormatter(value), style: { minWidth: '70px', fontSize: '0.9em' } });
            const inp = h('input', {
                type: 'range', min, max, value, style: { flexGrow: '1' },
                // 8.1.0: Number() — input.value to łańcuch, i do konfiguracji szło
                // fontSize: "14" zamiast 14. Działało na rzutowaniu typów, ale
                // śmieciło w zapisanym JSON.
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
                style: { padding: '6px 12px', background: CONFIG.SETTINGS_PANEL_ACCENT_COLOR, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', ...cssOverrides }
            });
        },
        select(options, value, onChange) {
            const sel = h('select', { onChange: (e) => onChange(e.target.value), style: { padding: '4px', borderRadius: '4px', border: '1px solid #ccc' } });
            options.forEach(opt => sel.appendChild(h('option', { value: opt.value, textContent: opt.text, selected: String(opt.value) === String(value) })));
            return sel;
        },
        checkbox(label, checked, onChange) {
            const chk = h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked), style: { transform: 'scale(1.2)', marginRight: '8px', cursor: 'pointer' } });
            return h('label', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer', flexGrow: '1' } }, chk, h('span', { textContent: label }));
        },
        numberInput(val, onChange) {
            return h('input', { type: 'number', min: 0, value: val, onChange: (e) => onChange(parseInt(e.target.value, 10) || 0), style: { width: '80px', padding: '4px', textAlign: 'right' }});
        }
    };
