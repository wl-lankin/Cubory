import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'chrome120',
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: {
    exclude: ['occt-import-js'],
  },
});
