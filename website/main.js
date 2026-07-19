import { parseFeed } from './feed.js';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scroll-Reveals
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));



// App-Screenshot: echte Explosions-Frames aus Cubory, gescrubbt per Scroll
const scrub = document.getElementById('scrub');
if (scrub) {
  const FR = 16;
  const imgs = [];
  let loaded = 0;
  const cx = scrub.getContext('2d');
  const draw = (i) => { const im = imgs[i]; if (im?.complete) cx.drawImage(im, 0, 0, scrub.width, scrub.height); };
  for (let i = 0; i < FR; i++) {
    const im = new Image();
    im.src = `assets/explode/f${String(i).padStart(2, '0')}.jpg`;
    im.onload = () => { if (++loaded === 1) { scrub.width = im.naturalWidth; scrub.height = im.naturalHeight; draw(0); } };
    imgs.push(im);
  }
  // Gedämpftes Nachziehen: die Frames folgen dem Scroll weich statt hart
  const section = document.getElementById('app');
  let targetF = 0, curF = 0, lastDrawn = -1;
  addEventListener('scroll', () => {
    const r = section.getBoundingClientRect();
    const total = r.height - innerHeight;
    targetF = Math.min(Math.max(-r.top / total, 0), 1) * (FR - 1);
  }, { passive: true });
  (function tick() {
    curF += (targetF - curF) * 0.14;
    const f = Math.min(FR - 1, Math.round(curF));
    if (f !== lastDrawn) { draw(f); lastDrawn = f; }
    requestAnimationFrame(tick);
  })();
}


// CAD-Fadenkreuz im Hero: Koordinaten wie im Viewport
const sheet = document.getElementById('sheet0');
if (sheet && !reduced) {
  const xh = document.getElementById('xh'), lbl = document.getElementById('xh-label');
  const h = xh.querySelector('.xh-h'), v = xh.querySelector('.xh-v');
  sheet.addEventListener('pointermove', (e) => {
    const r = sheet.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    h.style.top = y + 'px'; v.style.left = x + 'px';
    lbl.style.left = x + 'px'; lbl.style.top = y + 'px';
    lbl.textContent = `X ${(x * 0.2646).toFixed(1)} · Y ${(y * 0.2646).toFixed(1)} mm`;
  });
}

// Die Headline wird vermessen wie ein Bauteil
const h2el = document.getElementById('h2');
if (h2el) {
  const setDim = () => {
    document.getElementById('hdim-label').textContent =
      (h2el.getBoundingClientRect().width * 0.2646).toFixed(1) + ' mm';
  };
  setDim();
  addEventListener('resize', setDim);
}

// Stückliste ↔ Positions-Ballons synchron hervorheben
document.querySelectorAll('.bom-row[data-pos]').forEach((row) => {
  const balloon = document.querySelector(`.balloon[data-pos="${row.dataset.pos}"]`);
  row.addEventListener('mouseenter', () => balloon?.classList.add('hl'));
  row.addEventListener('mouseleave', () => balloon?.classList.remove('hl'));
});


// Pro: Monatlich/Jährlich-Switch in der Preistabelle
const T = (s) => (window.__t ? window.__t(s) : s);
document.querySelectorAll('.bill-toggle button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.bill-toggle button').forEach((x) => x.classList.toggle('on', x === b));
    const yearly = b.dataset.b === 'yearly';
    document.getElementById('pro-price').textContent = yearly ? '79 €' : '9 €';
    document.getElementById('pro-per').textContent = yearly ? T('pro Jahr · 2 Monate geschenkt') : T('pro Monat');
    document.getElementById('buy-pro')?.setAttribute('href', yearly ? '/portal/?plan=yearly' : '/portal/?plan=monthly');
  });
});


/* ── Downloads: Dateien und Version aus den Update-Feeds lesen ──────────── */

(async () => {
  const list = document.getElementById('dl-list');
  if (!list) return;
  const feeds = { mac: 'latest-mac.yml', win: 'latest.yml', linux: 'latest-linux.yml' };
  const mb = (b) => Math.round(b / 1048576) + ' MB';
  const got = {};
  await Promise.all(Object.entries(feeds).map(async ([key, file]) => {
    try {
      const res = await fetch(`/downloads/${file}`, { cache: 'no-cache' });
      if (res.ok) got[key] = parseFeed(await res.text());
    } catch { /* Feed fehlt - Kachel bleibt beim Fallback */ }
  }));

  const version = got.mac?.version || got.win?.version || got.linux?.version;
  if (version) {
    const label = document.getElementById('dl-version');
    if (label) label.textContent = (window.__t ? window.__t('Version') : 'Version') + ' ' + version;
  }

  const pick = {
    'mac-arm64': got.mac?.files.find((f) => /arm64/.test(f.url)),
    'mac-x64': got.mac?.files.find((f) => /\.dmg$/.test(f.url) && !/arm64/.test(f.url)),
    win: got.win?.files.find((f) => /\.exe$/i.test(f.url)),
    linux: got.linux?.files.find((f) => /AppImage$/i.test(f.url)),
  };
  for (const a of list.querySelectorAll('a[data-os]')) {
    const f = pick[a.dataset.os];
    const meta = a.querySelector('.meta');
    if (!f) { meta.textContent = window.__t ? window.__t('bald verfügbar') : 'bald verfügbar'; a.style.opacity = '.55'; continue; }
    a.href = '/downloads/' + encodeURIComponent(f.url);
    a.setAttribute('download', '');
    meta.textContent = f.url + ' · ' + mb(f.size);
  }
})();
