// Im Browser liefert der Import "…wasm?url" einen Web-Pfad. Unter vitest läuft
// der Code in node, wo occt-import-js die Datei über fs öffnet - dort muss ein
// echter Dateipfad stehen. vite.config.js leitet den Import hierher um.
import { createRequire } from 'node:module';

export default createRequire(import.meta.url).resolve('occt-import-js/dist/occt-import-js.wasm');
