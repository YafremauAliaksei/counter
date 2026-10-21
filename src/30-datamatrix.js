    // ==========================================
    // 6j. KOD DATA MATRIX
    // ==========================================
    /**
     * Kod Data Matrix (ECC200) z tekstu — żeby zakładkę dało się zeskanować
     * telefonem albo skanerem zamiast przepisywać. Bez sieci i bez bibliotek:
     * tylko macierz modułów, rysuje ją wywołujący.
     *
     * Kodowanie ASCII (norma ISO/IEC 16022): znak 0–127 to jeden symbol
     * kodowy, para cyfr — jeden. Znaków spoza ASCII (np. „ł”) kod nie
     * przyjmuje: większość generatorów i skanerów pracuje na jednej stronie
     * kodowej i taki znak kończy się błędem albo krzakami. Dlatego tekst
     * zakładki jest czysto ASCII.
     *
     * Tylko symbole kwadratowe, od 10×10 do 132×132 (do 1304 symboli
     * kodowych danych). 144×144 ma w normie bloki korekcji nierównej
     * długości — zakładka mieści się w 72×72, więc go tu nie ma.
     */
    const DataMatrix = {
        /** [bok symbolu, bok obszaru danych, dane, korekcja, bloki korekcji] — tablica z normy. */
        SIZES: [
            [10, 8, 3, 5, 1], [12, 10, 5, 7, 1], [14, 12, 8, 10, 1], [16, 14, 12, 12, 1],
            [18, 16, 18, 14, 1], [20, 18, 22, 18, 1], [22, 20, 30, 20, 1], [24, 22, 36, 24, 1],
            [26, 24, 44, 28, 1], [32, 14, 62, 36, 1], [36, 16, 86, 42, 1], [40, 18, 114, 48, 1],
            [44, 20, 144, 56, 1], [48, 22, 174, 68, 1], [52, 24, 204, 84, 2], [64, 14, 280, 112, 2],
            [72, 16, 368, 144, 4], [80, 18, 456, 192, 4], [88, 20, 576, 224, 4], [96, 22, 696, 272, 4],
            [104, 24, 816, 336, 6], [120, 18, 1050, 408, 6], [132, 20, 1304, 496, 8],
        ],

        /**
         * Symbole kodowe danych w kodowaniu ASCII.
         * @returns {number[]|null} null, gdy w tekście jest znak spoza ASCII.
         */
        encodeAscii(text) {
            const out = [];
            for (let i = 0; i < text.length; i++) {
                const c = text.charCodeAt(i);
                if (c > 127) return null;
                const next = text.charCodeAt(i + 1);
                if (c >= 48 && c <= 57 && next >= 48 && next <= 57) {
                    out.push(130 + (c - 48) * 10 + (next - 48));
                    i++;
                } else {
                    out.push(c + 1);
                }
            }
            return out;
        },

        /** Tablice logarytmów GF(256) z wielomianem 0x12D — liczone raz. */
        _gf() {
            if (this._log) return;
            this._exp = new Array(512);
            this._log = new Array(256);
            let x = 1;
            for (let i = 0; i < 255; i++) {
                this._exp[i] = x;
                this._log[x] = i;
                x <<= 1;
                if (x & 0x100) x ^= 0x12D;
            }
            for (let i = 255; i < 512; i++) this._exp[i] = this._exp[i - 255];
        },

        /** Symbole korekcji Reeda-Solomona dla jednego bloku. */
        reedSolomon(data, n) {
            this._gf();
            const mul = (a, b) => (a && b) ? this._exp[this._log[a] + this._log[b]] : 0;
            // Wielomian generujący (x − α)(x − α²)…(x − αⁿ).
            let g = [1];
            for (let i = 1; i <= n; i++) {
                const next = new Array(g.length + 1).fill(0);
                for (let j = 0; j < g.length; j++) {
                    next[j] ^= g[j];
                    next[j + 1] ^= mul(g[j], this._exp[i]);
                }
                g = next;
            }
            const ecc = new Array(n).fill(0);
            for (const d of data) {
                const k = d ^ ecc[0];
                for (let j = 0; j < n - 1; j++) ecc[j] = ecc[j + 1] ^ mul(k, g[j + 1]);
                ecc[n - 1] = mul(k, g[n]);
            }
            return ecc;
        },

        /**
         * Macierz modułów: true — moduł ciemny. Bez strefy ciszy (ramki
         * jasnych modułów) — tę dokłada rysujący.
         * @returns {boolean[][]|null} null, gdy tekst nie jest ASCII albo
         *   nie mieści się w największym symbolu.
         */
        encode(text) {
            const data = this.encodeAscii(String(text));
            if (!data) return null;
            const size = this.SIZES.find(s => s[2] >= data.length);
            if (!size) return null;
            const [side, region, dataCount, eccCount, blocks] = size;

            // Dopełnienie: pierwszy symbol 129, kolejne pseudolosowe z normy
            // (zależne od pozycji, liczonej od 1).
            if (data.length < dataCount) data.push(129);
            while (data.length < dataCount) {
                let v = 129 + ((149 * (data.length + 1)) % 253) + 1;
                if (v > 254) v -= 254;
                data.push(v);
            }

            // Korekcja w blokach przeplatanych: symbol i należy do bloku i % bloki.
            const perBlock = eccCount / blocks;
            const codewords = data.slice();
            for (let b = 0; b < blocks; b++) {
                const ecc = this.reedSolomon(data.filter((_, i) => i % blocks === b), perBlock);
                ecc.forEach((e, j) => { codewords[dataCount + j * blocks + b] = e; });
            }

            const regions = side / (region + 2);
            const nrow = side - 2 * regions;
            const bits = this.place(nrow, nrow, codewords);

            // Obszary danych w ramkach: lewa i dolna krawędź pełne, górna
            // i prawa naprzemienne.
            const per = region + 2;
            const m = [];
            for (let r = 0; r < side; r++) {
                const row = [];
                for (let c = 0; c < side; c++) {
                    const lr = r % per, lc = c % per;
                    let dark;
                    if (lc === 0 || lr === per - 1) dark = true;
                    else if (lr === 0) dark = lc % 2 === 0;
                    else if (lc === per - 1) dark = lr % 2 === 1;
                    else {
                        const y = r - 2 * Math.floor(r / per) - 1;
                        const x = c - 2 * Math.floor(c / per) - 1;
                        dark = bits[y * nrow + x] === 1;
                    }
                    row.push(dark);
                }
                m.push(row);
            }
            return m;
        },

        /**
         * Rozkład bitów symboli kodowych w obszarze danych — algorytm
         * „utah” z normy, z czterema przypadkami narożnymi.
         * @returns {number[]} nrow × ncol bitów (0 albo 1).
         */
        place(nrow, ncol, codewords) {
            const a = new Array(nrow * ncol).fill(-1);
            const mod = (row, col, chr, bit) => {
                if (row < 0) { row += nrow; col += 4 - ((nrow + 4) % 8); }
                if (col < 0) { col += ncol; row += 4 - ((ncol + 4) % 8); }
                a[row * ncol + col] = (codewords[chr] >> (8 - bit)) & 1;
            };
            const utah = (row, col, chr) => {
                mod(row - 2, col - 2, chr, 1); mod(row - 2, col - 1, chr, 2);
                mod(row - 1, col - 2, chr, 3); mod(row - 1, col - 1, chr, 4);
                mod(row - 1, col, chr, 5); mod(row, col - 2, chr, 6);
                mod(row, col - 1, chr, 7); mod(row, col, chr, 8);
            };
            const corner = (chr, cells) => cells.forEach(([r, c], i) => mod(r, c, chr, i + 1));
            const R = nrow, C = ncol;
            let chr = 0, row = 4, col = 0;
            do {
                if (row === R && col === 0) corner(chr++, [[R - 1, 0], [R - 1, 1], [R - 1, 2], [0, C - 2], [0, C - 1], [1, C - 1], [2, C - 1], [3, C - 1]]);
                if (row === R - 2 && col === 0 && C % 4) corner(chr++, [[R - 3, 0], [R - 2, 0], [R - 1, 0], [0, C - 4], [0, C - 3], [0, C - 2], [0, C - 1], [1, C - 1]]);
                if (row === R - 2 && col === 0 && C % 8 === 4) corner(chr++, [[R - 3, 0], [R - 2, 0], [R - 1, 0], [0, C - 2], [0, C - 1], [1, C - 1], [2, C - 1], [3, C - 1]]);
                if (row === R + 4 && col === 2 && !(C % 8)) corner(chr++, [[R - 1, 0], [R - 1, C - 1], [0, C - 3], [0, C - 2], [0, C - 1], [1, C - 3], [1, C - 2], [1, C - 1]]);
                do {
                    if (row < R && col >= 0 && a[row * C + col] < 0) utah(row, col, chr++);
                    row -= 2; col += 2;
                } while (row >= 0 && col < C);
                row += 1; col += 3;
                do {
                    if (row >= 0 && col < C && a[row * C + col] < 0) utah(row, col, chr++);
                    row += 2; col -= 2;
                } while (row < R && col >= 0);
                row += 3; col += 1;
            } while (row < R || col < C);
            // Narożnik bez symbolu: stały wzór szachownicy 2×2.
            if (a[R * C - 1] < 0) {
                a[R * C - 1] = a[R * C - C - 2] = 1;
                a[R * C - 2] = a[R * C - C - 1] = 0;
            }
            return a;
        },
    };
