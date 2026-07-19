// Auswertung der electron-updater-Feeds (latest*.yml) für die Downloadliste.
// Bewusst als eigenes Modul, damit die Auswertung testbar bleibt: die
// ursprüngliche Fassung suchte mit /url:\s*(\S+)/ und schnitt Dateinamen am
// ersten Leerzeichen ab - "Cubory Setup 1.5.0.exe" wurde zu "Cubory", der
// Windows-Download blieb daraufhin dauerhaft auf "bald verfügbar" stehen.
export function parseFeed(yml) {
  const version = /^version:\s*(\S+)/m.exec(yml)?.[1] || '';
  const files = [];
  let cur = null;
  for (const line of String(yml).split(/\r?\n/)) {
    const u = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line);
    if (u) {
      cur = { url: u[1], size: 0 };
      files.push(cur);
      continue;
    }
    const sz = /^\s*size:\s*(\d+)/.exec(line);
    if (sz && cur) cur.size = Number(sz[1]);
  }
  return { version, files };
}
