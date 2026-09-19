// ==========================================
    // 9. USTAWIENIA PRACOWNIKA (KONFIGURACJA OSOBISTA)
    // ==========================================


///POCZĄTEK KONFIGURACJI UŻYTKOWNIKA
/*
        const originalInit = Main.init;

        Main.init = function() {
        // 1. Wołamy oryginalny rdzeń (wczytanie pamięci, rozpoznanie zmiany)
        originalInit.call(Main);

        // 2. WYMUSZONA PRZERWA NR 4

        // Indeks 3 dla zmiany dziennej (12:50-13:20), indeks 7 dla nocnej (00:50-01:20)
        // indeksy 0-3 dla dziennej, indeksy 4-7 dla nocnej
        const isNight = store.sessionConfig.shiftType === 'night';
        store.sessionConfig.selectedLunchIndex = isNight ? 7 : 3;

        // 3. USTAWIENIA INDYWIDUALNE ZALEŻNE OD BIEŻĄCEGO DZIAŁU
        const tab = store.currentTabType; // 'CRET', 'REFURB', 'WHD' albo 'UNKNOWN'

        if (tab === 'CRET') {
            // --- Przykład: ustawienia dla karty CRET ---

            // Włączamy tylko linię 1 i linię 2
            store.localTabConfig.linesConfig.line1_currentTab.visible = true;
            store.localTabConfig.linesConfig.line2_globalSummary.visible = true;
            store.localTabConfig.linesConfig.line3_shiftInfo.visible = false;
            store.localTabConfig.linesConfig.line4_lunchInfo.visible = false;
            store.localTabConfig.linesConfig.line5_realTimeClock.visible = false;
            store.localTabConfig.linesConfig.line7_compact.visible = false;

            // Linia 1: przezroczystość 53%, kolor czarny (#000000)
            store.localTabConfig.linesConfig.line1_currentTab.alpha = 53;
            store.localTabConfig.linesConfig.line1_currentTab.colorHex = '#000000';

            // Linia 2: włączyć wielokolor i ustawić własne kolory
            store.localTabConfig.linesConfig.line2_globalSummary.multicolor = true;
            store.localTabConfig.linesConfig.line2_globalSummary.customColors.CRET = '#0078D7';
            store.localTabConfig.linesConfig.line2_globalSummary.customColors.REFURB = '#FF0000';
            store.localTabConfig.linesConfig.line2_globalSummary.customColors.WHD = '#FF0000';

            // Pozycja okna na ekranie (lewy górny róg z niewielkim odstępem)
            store.localTabConfig.statsWindowPosition.top = '15px';
            store.localTabConfig.statsWindowPosition.left = '15%';

            // Globalne zaznaczenia
            store.userConfig.globalStatsContributionKnown.CRET = true;
            store.userConfig.globalStatsContributionKnown.REFURB = true;
            store.userConfig.globalStatsContributionKnown.WHD = true;

        } else if (tab === 'REFURB') {
            // --- Przykład: ustawienia dla karty REFURB ---
            store.localTabConfig.linesConfig.line1_currentTab.visible = true;
            store.localTabConfig.linesConfig.line1_currentTab.colorHex = '#FFA500'; // pomarańczowy
            store.localTabConfig.linesConfig.line1_currentTab.alpha = 100; // pełna nieprzezroczystość

            // Liczyć do sumy globalnej wszystko
            store.userConfig.globalStatsContributionKnown.CRET = true;
            store.userConfig.globalStatsContributionKnown.REFURB = true;
            store.userConfig.globalStatsContributionKnown.WHD = true;
        }

        // 4. Utrwalenie stanu (gwarantuje zapis do localStorage i render)
        StorageManager.saveState();
    };

*/
// można zdjąć komentarz i dopisać własne ustawienia


///KONIEC KONFIGURACJI UŻYTKOWNIKA


    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Main.init());
    else Main.init();
