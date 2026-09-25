/**
 * Nazwy, które skrypt kładzie na `window`. Sprawdzanie typów (`npm run
 * typecheck`) zna je stąd; do artefaktu ten plik nie trafia.
 *
 *   SH     — konsolowe API skryptu (22-bootstrap.js);
 *   config — skrót SH.config(...), stawiany tylko wtedy, gdy strona nie ma
 *            własnego `window.config`.
 */
interface Window {
    SH?: Record<string, unknown>;
    config?: (code: string) => unknown;
}
