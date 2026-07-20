// Export: öffnet das gemeinsame Speichern-Modal mit Formatoptionen. Für 2D
// (DXF/DWG) SVG oder PNG, für 3D STL, OBJ, PLY oder GLB. SVG lässt sich als
// Quelltext in die Zwischenablage kopieren.
import { t } from './i18n.js';
import { can, openAccountModal } from './account.js';
import { slug } from './modalUtils.js';
import { openSaveModal } from './saveModal.js';
import { exportFormats, generateExport } from './exporters.js';

let viewer = null;
let getModel = () => null;

export function initExportModal(viewerRef, modelFn) {
  viewer = viewerRef;
  getModel = modelFn;
}

export function openExport() {
  if (!can('export')) {
    openAccountModal();
    return;
  }
  const model = getModel();
  if (!model) return;

  const formats = exportFormats(model);
  openSaveModal({
    title: t('export.title'),
    optionsLabel: t('export.format'),
    options: formats,
    initialOption: formats[0].value,
    defaultName: () => slug(model.name),
    generate: (value) => generateExport(model, viewer, value),
    lastDir: () => window.cubory.exportFile.lastDir(),
    saveTo: (payload) => window.cubory.exportFile.saveTo(payload),
    // Kopieren nur, wo es Sinn ergibt: SVG als Quelltext.
    copy: (gen) => window.cubory.exportFile.copyText(gen.text),
    copyable: (gen) => !!gen.text,
    reveal: (path) => window.cubory.files.reveal(path),
  });
}
