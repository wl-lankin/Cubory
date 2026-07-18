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
