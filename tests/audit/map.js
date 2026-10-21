/**
 * map.js — mapa kodu dla audytu, liczona skryptem, a nie przez model.
 *
 * Agent audytu zaczyna od tej mapy zamiast przeglądać repozytorium: kto
 * nadaje i kto słucha zdarzeń szyny, kto reaguje na zmiany stanu, kto pisze
 * do magazynu, kto stawia nasłuchy i timery. Mapa jest wynikiem grep na
 * src/, więc nic nie kosztuje i zawsze zgadza się z kodem.
 *
 *   node tests/audit/map.js            -> docs/audit/map.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs', 'audit', 'map.md');

const PATTERNS = {
    emit: /bus\.emit\('([^']+)'/g,
    on: /bus\.on\('([^']+)'/g,
    paths: /onStorePaths\(\[([^\]]+)\]/g,
    listen: /addEventListener\('([^']+)'/g,
    timers: /\b(setInterval|setTimeout)\(/g,
    writes: /\b(Persistence\.(?:write|bump|scheduleSave|saveState|saveTasks)|localStorage\.(?:setItem|removeItem)|sessionStorage\.setItem)\b/g,
    objects: /^ {4}const ([A-Z][A-Za-z]+) = \{/gm,
};

function scan(file) {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    const out = { file, lines: text.split('\n').length };
    for (const [key, re] of Object.entries(PATTERNS)) {
        const found = [];
        for (const m of text.matchAll(re)) found.push(m[1].replace(/\s+/g, ' ').trim());
        out[key] = found;
    }
    return out;
}

const count = (list) => {
    const m = new Map();
    for (const x of list) m.set(x, (m.get(x) || 0) + 1);
    return [...m].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ');
};

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
const rows = files.map(scan);

const events = new Map();
for (const r of rows) {
    for (const e of r.emit) (events.get(e) || events.set(e, { from: new Set(), to: new Set() }).get(e)).from.add(r.file);
    for (const e of r.on) (events.get(e) || events.set(e, { from: new Set(), to: new Set() }).get(e)).to.add(r.file);
}

const md = [];
md.push('# Mapa kodu do audytu');
md.push('');
md.push('Wygenerowana przez `node tests/audit/map.js` — nie poprawiać ręcznie.');
md.push('');
md.push('## Moduły');
md.push('');
md.push('| Plik | Linie | Obiekty | Nasłuchy DOM | Timery | Zapisy do magazynu |');
md.push('| --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
    md.push(`| \`${r.file}\` | ${r.lines} | ${r.objects.join(', ')} | ${count(r.listen)} | ${count(r.timers)} | ${count(r.writes)} |`);
}
md.push('');
md.push('## Zdarzenia szyny: kto nadaje, kto słucha');
md.push('');
md.push('| Zdarzenie | Nadaje | Słucha |');
md.push('| --- | --- | --- |');
for (const [e, v] of [...events].sort()) {
    md.push(`| \`${e}\` | ${[...v.from].join(', ') || '— (createReactive)'} | ${[...v.to].join(', ')} |`);
}
md.push('');
md.push('## Reakcje na zmiany stanu (onStorePaths)');
md.push('');
for (const r of rows) for (const p of r.paths) md.push(`- \`${r.file}\`: ${p}`);
md.push('');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md.join('\n'));
process.stdout.write(`mapa: ${path.relative(ROOT, OUT)} (${rows.length} modułów, ${events.size} zdarzeń)\n`);
