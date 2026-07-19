import { defineConfig } from 'vite';

// Eigene Konfiguration für den Rauchtest: der startet eine echte
// Electron-Instanz, läuft deshalb im Node-Umfeld und braucht mehr Zeit als
// die Unit-Tests. Nacheinander statt parallel - mehrere App-Fenster
// gleichzeitig machen den Test nur wacklig.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/e2e/**/*.e2e.test.js'],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    pool: 'forks',
  },
});
