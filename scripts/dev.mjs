// Dev-Modus: Vite-Devserver (HMR für den Renderer) + Electron.
// - CSS-Änderungen erscheinen sofort, JS-Änderungen laden das Fenster neu
// - Änderungen unter electron/ starten den Electron-Prozess automatisch neu
// Start: npm run dev:app
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_URL = 'http://localhost:5173';

const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
});

async function waitForVite() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(VITE_URL);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Vite-Devserver nicht erreichbar');
}

let electron = null;
function startElectron() {
  electron = spawn('npx', ['electron', '.'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, VITE_DEV_SERVER_URL: VITE_URL },
  });
  electron.on('exit', (code, signal) => {
    // manuell geschlossen (nicht durch unseren Restart) → alles beenden
    if (signal !== 'SIGTERM') shutdown();
  });
}

function restartElectron() {
  console.log('\n[dev] electron/ geändert - Neustart …');
  const old = electron;
  old.removeAllListeners('exit');
  old.on('exit', () => startElectron());
  old.kill('SIGTERM');
}

function shutdown() {
  electron?.removeAllListeners('exit');
  electron?.kill('SIGTERM');
  vite.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await waitForVite();
startElectron();

let pending = null;
watch(join(root, 'electron'), { recursive: true }, () => {
  clearTimeout(pending);
  pending = setTimeout(restartElectron, 300); // Mehrfach-Events bündeln
});
console.log(`[dev] läuft - Renderer: ${VITE_URL} (HMR), electron/ wird überwacht`);
