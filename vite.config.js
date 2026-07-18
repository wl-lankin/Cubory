import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'chrome120',
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: {
    // occt-import-js ist CommonJS und braucht das esbuild-Interop im Dev-Modus;
    // die .wasm-Datei wird separat über ?url geladen.
    include: ['occt-import-js', 'dxf'],
  },
});
