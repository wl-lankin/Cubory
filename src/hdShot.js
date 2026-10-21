// HD-Shot: erzeugt einen hochaufgelösten Screenshot und öffnet dafür das
// gemeinsame Speichern-Modal (saveModal). Hier steckt nur die HD-Shot-Konfig:
// Auflösungsstufen als Optionen, PNG als Ergebnis, Bild in die Zwischenablage.
import { t } from './i18n.js';
import { slug, stamp } from './modalUtils.js';
import { openSaveModal } from './saveModal.js';

let viewer = null;
let getName = () => 'cubory';

export function initHdShot(viewerRef, nameFn) {
  viewer = viewerRef;
  if (nameFn) getName = nameFn;
}

export function openHdShot() {
  openSaveModal({
    title: t('hdshot.title'),
    optionsLabel: t('hdshot.resolution'),
    options: [2, 3, 4].map((s) => ({ value: String(s), label: `${s}×` })),
    initialOption: '3',
    defaultName: () => `${slug(getName())}-${stamp()}`,
    generate: async (value) => {
      const scale = Number(value);
      const dataUrl = viewer.captureScreenshot(scale);
      const dims = viewer.screenshotSize(scale);
      return { base64: dataUrl.split(',')[1], ext: 'png', previewUrl: dataUrl, info: `${dims.w} × ${dims.h}` };
    },
    lastDir: () => window.cubory.screenshot.lastDir(),
    saveTo: ({ base64, dir, filename }) => window.cubory.screenshot.saveTo({ base64, dir, filename }),
    copy: (gen) => window.cubory.screenshot.copy(gen.previewUrl),
    copyable: () => true,
    reveal: (path) => window.cubory.files.reveal(path),
  });
}
