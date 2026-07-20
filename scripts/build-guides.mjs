// Erzeugt die Ratgeberseiten aus scripts/guides.data.mjs - je Sprache eine
// Datei, alle nach derselben Vorlage.
//
// Warum es diese Seiten gibt: Nach "Cubory" sucht niemand. Gesucht wird nach
// "DXF öffnen" oder "STEP Datei ansehen". Die Startseite beantwortet solche
// Fragen nicht, weil sie ein Produkt vorstellt und keine Frage klärt.
//
// Aufruf:  node scripts/build-guides.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guides } from './guides.data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'website');

const esc = (s) => s.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/"/g, '&quot;');
const nurText = (s) => s.replace(/<[^>]*>/g, '');

const FUSS = {
  de: { impressum: 'Impressum', datenschutz: 'Datenschutz', agb: 'AGB' },
  en: { impressum: 'Legal notice', datenschutz: 'Privacy', agb: 'Terms' },
};

function seite(guide, sprache) {
  const d = guide[sprache];
  const anderer = sprache === 'de' ? 'en' : 'de';
  const eigenerPfad = sprache === 'de' ? `/${guide.slug.de}` : `/en/${guide.slug.en}`;
  const andererPfad = anderer === 'de' ? `/${guide.slug.de}` : `/en/${guide.slug.en}`;
  const wurzel = sprache === 'de' ? '/' : '/en/';

  const abschnitte = d.abschnitte.map((a) => {
    const teile = [`<h2>${a.h}</h2>`];
    for (const p of a.p || []) teile.push(`<p>${p}</p>`);
    if (a.liste) teile.push('<ul>' + a.liste.map((l) => `<li>${l}</li>`).join('') + '</ul>');
    if (a.liste_nummeriert) {
      teile.push('<ol>' + a.liste_nummeriert.map((l) => `<li>${l}</li>`).join('') + '</ol>');
    }
    return teile.join('\n');
  }).join('\n\n');

  // Auszeichnung: ein Fachartikel mit Brotkrumenpfad. Bewusst kein HowTo -
  // dafür zeigt Google seit 2023 keine erweiterten Ergebnisse mehr an, und
  // eine Auszeichnung ohne Wirkung ist nur Ballast.
  const daten = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `https://cubory.app${eigenerPfad}#artikel`,
        headline: d.titel,
        description: d.beschreibung,
        inLanguage: sprache,
        author: { '@type': 'Person', name: 'Wolfgang Linz', url: 'https://wolfgang-linz.de' },
        publisher: { '@type': 'Person', name: 'Wolfgang Linz', url: 'https://wolfgang-linz.de' },
        mainEntityOfPage: `https://cubory.app${eigenerPfad}`,
        about: { '@type': 'SoftwareApplication', name: 'Cubory', url: 'https://cubory.app/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Cubory', item: `https://cubory.app${wurzel}` },
          { '@type': 'ListItem', position: 2, name: d.titel, item: `https://cubory.app${eigenerPfad}` },
        ],
      },
    ],
  };

  const f = FUSS[sprache];
  const rechtlich = sprache === 'de'
    ? `<a href="/impressum.html">${f.impressum}</a> · <a href="/datenschutz.html">${f.datenschutz}</a> · <a href="/agb.html">${f.agb}</a>`
    : `<a href="/impressum.html">${f.impressum}</a> · <a href="/datenschutz.html">${f.datenschutz}</a> · <a href="/agb.html">${f.agb}</a>`;

  return `<!doctype html>
<html lang="${sprache}">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(d.metaTitel)}</title>
<meta name="description" content="${esc(d.beschreibung)}" />
<link rel="canonical" href="https://cubory.app${eigenerPfad}" />
<link rel="alternate" hreflang="de" href="https://cubory.app/${guide.slug.de}" />
<link rel="alternate" hreflang="en" href="https://cubory.app/en/${guide.slug.en}" />
<link rel="alternate" hreflang="x-default" href="https://cubory.app/${guide.slug.de}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(d.titel)}" />
<meta property="og:description" content="${esc(d.beschreibung)}" />
<meta property="og:url" content="https://cubory.app${eigenerPfad}" />
<meta property="og:image" content="https://cubory.app/assets/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://cubory.app/assets/og.png" />
<meta name="theme-color" content="#070b22" />
<link rel="icon" href="/assets/icon.png?v=2" />
<link rel="stylesheet" href="/assets/fonts/fonts.css" />
<script type="application/ld+json">
${JSON.stringify(daten, null, 2)}
</script>
<style>
:root{--text:#eef0ff;--muted:#9aa3d0;--faint:#5d668f;--a1:#ff3d8a;--a2:#7c5cff;--border:rgba(160,170,255,.22)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,sans-serif;color:var(--text);min-height:100vh;padding:60px 24px;
background:radial-gradient(900px 600px at 85% -10%,rgba(255,61,138,.12),transparent 60%),
linear-gradient(180deg,#070b22,#0a0e2a 40%,#0d1233)}
.sheet{position:relative;max-width:760px;margin:0 auto;border:1px solid var(--border);padding:48px 44px;
background:repeating-linear-gradient(0deg,transparent 0 39px,rgba(160,170,255,.04) 39px 40px),
repeating-linear-gradient(90deg,transparent 0 39px,rgba(160,170,255,.04) 39px 40px),rgba(10,14,42,.5)}
.sheet::before,.sheet::after{content:"";position:absolute;width:14px;height:14px;border:1px solid rgba(160,170,255,.5)}
.sheet::before{top:-7px;left:-7px;border-width:0 1px 1px 0}
.sheet::after{bottom:-7px;right:-7px;border-width:1px 0 0 1px}
.label{position:absolute;top:-9px;left:24px;background:#0a0e2a;padding:0 10px;
font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.2em;color:var(--faint)}
h1{font-family:'Space Grotesk';font-size:27px;line-height:1.25;margin-bottom:18px}
h2{font-family:'Space Grotesk';font-size:17px;margin:34px 0 10px;color:var(--text)}
p,li{font-size:15px;line-height:1.8;color:var(--muted)}
p+p{margin-top:12px}
ul,ol{margin:12px 0 0 20px}
li{margin-bottom:9px}
li b{color:var(--text);font-weight:600}
em{color:var(--text);font-style:normal;font-weight:500}
code{font-family:ui-monospace,Menlo,monospace;font-size:13.5px;color:var(--text)}
a{color:var(--a1);text-decoration:none}
a:hover{text-decoration:underline}
.intro{font-size:16px;line-height:1.8;color:var(--muted);padding-bottom:6px;border-bottom:1px solid var(--border)}
.back{display:inline-block;margin-bottom:26px;font-size:13px;color:var(--muted)}
.back:hover{color:var(--text);text-decoration:none}
.cta{display:inline-block;margin-top:34px;padding:13px 26px;border-radius:999px;
background:linear-gradient(92deg,var(--a1),var(--a2));color:#fff;font-weight:600;font-size:15px}
.cta:hover{text-decoration:none;filter:brightness(1.08)}
.fuss{max-width:760px;margin:26px auto 0;font-size:12.5px;color:var(--faint);display:flex;
gap:10px;flex-wrap:wrap;justify-content:space-between}
.fuss a{color:var(--faint)}
</style>
</head>
<body>
<article class="sheet">
  <span class="label">${esc(d.label)}</span>
  <a class="back" href="${wurzel}">&larr; ${esc(d.zurueck)}</a>
  <h1>${d.titel}</h1>
  <p class="intro">${d.einleitung}</p>

${abschnitte}

  <a class="cta" href="${wurzel}#download">${esc(d.cta)}</a>
</article>
<div class="fuss">
  <span>${rechtlich}</span>
  <a href="${andererPfad}" hreflang="${anderer}">${anderer === 'en' ? 'English' : 'Deutsch'}</a>
</div>
</body>
</html>
`;
}

let anzahl = 0;
const adressen = [];
for (const guide of guides) {
  for (const sprache of ['de', 'en']) {
    const pfad = sprache === 'de' ? join(site, guide.slug.de) : join(site, 'en', guide.slug.en);
    writeFileSync(pfad, seite(guide, sprache));
    adressen.push(sprache === 'de' ? `https://cubory.app/${guide.slug.de}` : `https://cubory.app/en/${guide.slug.en}`);
    anzahl++;
  }
}
console.log(`${anzahl} Ratgeberseiten erzeugt:`);
adressen.forEach((a) => console.log('   ', a));
console.log('\nDaran denken: neue Seiten gehören auch in website/sitemap.xml.');
