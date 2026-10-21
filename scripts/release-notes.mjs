// Prints the release notes for one version from src/changelog.js (German, then English).
import { CHANGELOG } from '../src/changelog.js';

const version = process.argv[2];
const entry = CHANGELOG.find((v) => v.version === version.replace(/-.*/, ''));
if (!entry) {
  console.error(`Kein Eintrag für ${version} in src/changelog.js`);
  process.exit(1);
}
const label = { new: ['Neu', 'New'], improved: ['Verbessert', 'Improved'], fixed: ['Behoben', 'Fixed'] };
const lines = [];
for (const [lang, idx] of [['de', 0], ['en', 1]]) {
  for (const type of ['new', 'improved', 'fixed']) {
    const items = entry.entries.filter((e) => e.type === type);
    if (!items.length) continue;
    lines.push(`### ${label[type][idx]}`, '', ...items.map((e) => `- ${e[lang]}`), '');
  }
  if (lang === 'de') lines.push('---', '');
}
console.log(lines.join('\n').trim());
