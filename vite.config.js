import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'chrome120',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    // happy-dom liefert DOMParser, den der 3MF-Loader braucht.
    environment: 'happy-dom',
    environmentOptions: {
      // Die Tests parsen HTML nur, sie führen es nicht aus - ohne das versucht
      // happy-dom, jedes <script src> und <link> tatsächlich zu laden.
      happyDOM: {
        settings: {
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
          disableCSSFileLoading: true,
          // Sonst meldet happy-dom das unterdrückte Laden als Fehler und
          // überschwemmt die Testausgabe mit Netzwerk-Stacktraces.
          handleDisabledFileLoadingAsSuccess: true,
          fetch: { disableSameOriginPolicy: true },
        },
      },
    },
    include: ['test/**/*.test.js'],
    // Der Rauchtest startet eine echte Electron-Instanz und hat eine eigene
    // Konfiguration - hier würde er die schnellen Unit-Tests nur ausbremsen.
    exclude: ['test/e2e/**'],
    restoreMocks: true,
  },
  optimizeDeps: {
    // occt-import-js ist CommonJS und braucht das esbuild-Interop im Dev-Modus;
    // die .wasm-Datei wird separat über ?url geladen.
    include: ['occt-import-js', 'dxf'],
  },
});
