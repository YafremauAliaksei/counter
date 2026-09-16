    // ==========================================
    // 5. MENEDŻERY
    // ==========================================

    const I18n = {
        get(key, replacements = {}) {
            const lang = store.userConfig.language || CONFIG.DEFAULT_LANGUAGE;
            const pack = LANG_STRINGS[lang] || LANG_STRINGS[CONFIG.DEFAULT_LANGUAGE];
            let str = pack[key] !== undefined ? pack[key] : LANG_STRINGS[CONFIG.DEFAULT_LANGUAGE][key];
            if (!str) return `[${key}]`;
            // 8.3.0: podstawianie przez split/join, a nie przez String.replace.
            // Łańcuch ZASTĘPUJĄCY w replace traktuje $& $` $' $1 jako sekwencje
            // specjalne, więc nazwa karty typu "Tab ($&)" psuła wynik. To także
            // kwestia bezpieczeństwa: nazwę karty wpisuje człowiek, a więc jest
            // to dane wejściowe, nad którym parser nie powinien mieć władzy.
            const put = (text, name, value) => text.split('${' + name + '}').join(String(value));
            for (const r in replacements) str = put(str, r, replacements[r]);
            return put(put(str, 'version', CONFIG.SCRIPT_VERSION), 'scriptName', CONFIG.SCRIPT_NAME);
        },
        getTabName(idOrKey) {
            if (CONFIG.KNOWN_TAB_TYPES[idOrKey]) return I18n.get(CONFIG.KNOWN_TAB_TYPES[idOrKey].displayNameKey);
            if (store.userConfig.customTabSettings[idOrKey]) return store.userConfig.customTabSettings[idOrKey].displayName;
            if (idOrKey.startsWith(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX)) {
                return `${I18n.get(CONFIG.DEFAULT_UNKNOWN_TAB_DETAILS.displayNameKey)} (${idOrKey.substring(CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX.length, CONFIG.UNKNOWN_TAB_INSTANCE_ID_PREFIX.length + 5)})`;
            }
            return idOrKey;
        }
    };
