// ARES NAV — page de présentation.
// Chiffres : js/zone-model.js (données réelles de data/zone.js). Images NASA : assets/. Animations : GSAP + ScrollTrigger.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const M = window.ARES_ZM, A = window.ARES_ASSETS || {};
  const G = window.gsap, ST = window.ScrollTrigger;
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const nf = (n, d) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const km = (m) => nf(m / 1000, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (min) => { const t = Math.round(min); return Math.floor(t / 60) + ' h ' + pad(t % 60); };
  const clock = (min) => { const t = Math.round(M.HYP.departMin + min); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
  const C = { ink: '#f2ede8', ink2: '#c4bcb5', mars: '#ff5a1f', y: '#ffd84a', o: '#ff9a2e', r: '#e3321f', danger: '#ff4433', blue: '#5cc8ff', safe: '#4ade80', muted: '#8a827b' };
  const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
  const PLAN = M.plan(M.DEFAULT_STOPS), STOPS = M.DEFAULT_STOPS;
  const CLASS_COL = [null, [255, 216, 74], [255, 154, 46], [92, 200, 255], [255, 68, 51]];
  if (G && ST) G.registerPlugin(ST);

  function once(el, cb, threshold, margin) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.disconnect(); cb(); } }), { threshold: threshold || 0.25, rootMargin: margin || '0px' });
    io.observe(el);
  }
  function onResize(fn) {
    let w = window.innerWidth, t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (window.innerWidth !== w) { w = window.innerWidth; fn(); } }, 150); });
  }
  const loadImg = (src) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });
  function sizeCanvas(cv, w, h) {
    const d = DPR();
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    return ctx;
  }
  function visibleLoop(el, draw) { // boucle d'animation active seulement quand l'élément est visible
    let on = false, raf = 0;
    const tick = (t) => { if (!on) return; draw(t); raf = requestAnimationFrame(tick); };
    new IntersectionObserver((es) => { on = es[0].isIntersecting; if (on) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); } }).observe(el);
  }

  // ---------- Navigation, progression, apparitions ----------
  const nav = $('#nav'), bar = $('#progress');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? window.scrollY / h : 0).toFixed(4) + ')';
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('.reveal').forEach((el) => io.observe(el));
  } else $$('.reveal').forEach((el) => el.classList.add('in'));

  // =====================================================================
  // 1. Accueil : de la planète à la sortie (carrousel d'échelles)
  // =====================================================================
  const eRange = M.eMax - M.eMin;
  const SLIDES = [
    { title: 'MARS', kind: 'Planète', sub: 'Planète rouge', img: 'assets/hero/mars.webp',
      stats: [['Atmosphère', '95 % CO₂<br>2,6 % N₂'], ['Climat', 'Air à −63 °C<br>en moyenne'], ['Gravité', '3,71 m/s²'], ['Lunes', 'Phobos<br>Deimos'], ['Rayon', '3 389,5 km'], ['Année', '687 jours']] },
    { title: 'GALE', kind: 'Cratère', sub: 'Cratère de 154 km', img: 'assets/hero/gale.webp',
      stats: [['Diamètre', '154 km'], ['Âge', '≈ 3,6 milliards<br>d’années'], ['Mont Sharp', '≈ 5 km<br>de haut'], ['Curiosity', 'sur place<br>depuis 2012'], ['Position', '5,4° S<br>137,8° E'], ['Image', 'MRO CTX<br>6 m/px']] },
    { title: 'SORTIE', kind: 'Zone', sub: '4,7 × 3,5 km à pied', img: 'assets/hero/zone.webp',
      stats: [['Image', 'MRO HiRISE<br>30 cm/px'], ['Dénivelé', '≈ ' + nf(Math.round(eRange / 10) * 10) + ' m'], ['Trajet sûr', km(PLAN.safe.dist) + ' km<br>' + hm(PLAN.totalMin)], ['Dangers (IA)', M.HAZARDS.length + ' zones<br>détectées'], ['Cibles (IA)', M.TARGETS.length + ' sites<br>suggérés'], ['Marge O₂', nf(PLAN.marginMin) + ' min']] }
  ];
  function scramble(el, text) {
    el.dataset.text = text;
    if (REDUCE) { el.textContent = text; return; }
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/%';
    const len = Math.max(el.textContent.length, text.length);
    let f = 0;
    cancelAnimationFrame(el._raf);
    el.classList.remove('glitch'); void el.offsetWidth; el.classList.add('glitch');
    const step = () => {
      f++;
      let out = '';
      for (let i = 0; i < len; i++) out += f > 6 + i * 3 ? (text[i] || '') : (i < text.length || f < 10 ? glyphs[(Math.random() * glyphs.length) | 0] : '');
      el.textContent = out;
      if (out !== text) el._raf = requestAnimationFrame(step);
    };
    step();
  }
  function starfield(el) {
    const c = document.createElement('canvas'); c.width = c.height = 600;
    const x = c.getContext('2d');
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 420; i++) {
      const r = rnd() < 0.92 ? 0.6 : 1.2;
      x.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.75).toFixed(2) + ')';
      x.beginPath(); x.arc(rnd() * 600, rnd() * 600, r, 0, 7); x.fill();
    }
    el.style.backgroundImage = 'url(' + c.toDataURL() + ')';
  }
  function heroGlobe() {
    const cv = $('#heroGlobe');
    if (!cv || !window.THREE || !A.mars) { document.body.classList.add('no-webgl'); return; }
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { document.body.classList.add('no-webgl'); return; }
    renderer.setPixelRatio(DPR()); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene(), F = 1.18;
    const cam = new THREE.OrthographicCamera(-F, F, F, -F, 0.1, 10); cam.position.z = 5;
    const DEG = Math.PI / 180;
    const tex = new THREE.TextureLoader().load(A.mars);
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    globe.rotation.x = -35 * DEG; // incline Gale vers la partie visible du disque
    scene.add(globe);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 n; void main(){ float i = pow(0.78 - dot(n, vec3(0.0,0.0,1.0)), 2.6); gl_FragColor = vec4(1.0,0.42,0.18,1.0) * i * 1.6; }'
    })));
    scene.add(new THREE.AmbientLight(0xffe2d0, 0.12));
    const sun = new THREE.DirectionalLight(0xfff0e0, 2.0); sun.position.set(-2.2, 2.6, 2.4); scene.add(sun);
    // Gale face à la caméra au départ, puis rotation lente.
    const toLon = (lon) => -((lon + 180) * DEG) - Math.PI / 2;
    let rot = toLon(137.8) + Math.PI;
    const size = () => { const w = cv.clientWidth; renderer.setSize(w, w, false); };
    size(); onResize(size);
    let last = 0;
    visibleLoop($('#top'), (t) => {
      const dt = last ? Math.min(50, t - last) : 16; last = t;
      if (!REDUCE) rot += dt * 0.000035;
      globe.rotation.y = rot;
      renderer.render(scene, cam);
    });
  }
  function hero() {
    const root = $('#top');
    if (!root) return;
    starfield($('#heroStars'));
    heroGlobe();
    const bodies = $$('.hb', root), title = $('#hTitle'), dots = $('#hDots');
    let cur = 0, timer = 0, user = false;
    dots.innerHTML = SLIDES.map(() => '<i></i>').join('');
    function side(btn, i) { const s = SLIDES[i]; $('img', btn).src = s.img; $('span', btn).textContent = s.title; }
    function show(i, first) {
      cur = (i + SLIDES.length) % SLIDES.length;
      const s = SLIDES[cur];
      bodies.forEach((b, k) => b.classList.toggle('on', k === cur));
      if (first) { title.textContent = s.title; title.dataset.text = s.title; } else scramble(title, s.title);
      $('#hSub').textContent = s.sub; $('#hIdx').textContent = pad(cur + 1); $('#hKind').textContent = s.kind;
      $('#hStats').innerHTML = s.stats.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
      $$('i', dots).forEach((d, k) => d.classList.toggle('on', k === cur));
      side($('#sideL'), cur - 1 < 0 ? SLIDES.length - 1 : cur - 1);
      side($('#sideR'), (cur + 1) % SLIDES.length);
      if (G && !REDUCE && !first) {
        G.fromTo('#hStats > div', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power3.out' });
        G.fromTo(['#hSub', '.hero-index'], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08 });
        G.fromTo('.side img', { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 0.85, duration: 0.8, ease: 'power3.out' });
      }
    }
    // Le défilement pilote les planètes : 3 étapes sur la hauteur de l'accueil.
    const prog = () => { const r = root.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1); };
    const go = (i) => {
      const k = (i + SLIDES.length) % SLIDES.length, r = root.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + (k + 0.5) / SLIDES.length * (r.height - innerHeight), behavior: REDUCE ? 'auto' : 'smooth' });
    };
    const onScroll = () => {
      const q = prog(), k = Math.min(SLIDES.length - 1, Math.floor(q * SLIDES.length * 0.999));
      if (k !== cur) show(k);
      bodies.forEach((b, j) => b.classList.toggle('past', j < cur));
      const local = q * SLIDES.length - cur;
      bodies[cur].style.setProperty('--s', (0.94 + 0.12 * local).toFixed(3));
      root.classList.toggle('leaving', q > 0.985);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    show(0, true); onScroll();
    void timer; void user;
  }

  // =====================================================================
  // 2. Relief réel du cratère Gale (MOLA) en terrasses isométriques
  // =====================================================================
  async function terrain() {
    const cv = $('#terrain'), box = $('#terrainBox');
    if (!cv || !A.gale) return;
    const im = await loadImg(A.gale);
    const S0 = im.width, c0 = document.createElement('canvas');
    c0.width = c0.height = S0;
    const x0 = c0.getContext('2d'); x0.drawImage(im, 0, 0);
    const src = x0.getImageData(0, 0, S0, S0).data;
    const N = 360, K = 14;
    let Hm = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const fx = i / (N - 1) * (S0 - 1), fy = j / (N - 1) * (S0 - 1), a = Math.min(S0 - 2, Math.floor(fx)), b = Math.min(S0 - 2, Math.floor(fy)), u = fx - a, w = fy - b;
      const p = (q, r) => src[(r * S0 + q) * 4];
      Hm[j * N + i] = (p(a, b) * (1 - u) + p(a + 1, b) * u) * (1 - w) + (p(a, b + 1) * (1 - u) + p(a + 1, b + 1) * u) * w;
    }
    for (let pass = 0; pass < 2; pass++) { // adoucit les marches du 8 bits
      const o = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const q = i + di, r = j + dj; if (q < 0 || r < 0 || q >= N || r >= N) continue; s += Hm[r * N + q]; n++;
        }
        o[j * N + i] = s / n;
      }
      Hm = o;
    }
    let lo = Infinity, hi = -Infinity;
    for (const h of Hm) { if (h < lo) lo = h; if (h > hi) hi = h; }
    const lvl = new Uint8Array(N * N);
    for (let p = 0; p < N * N; p++) lvl[p] = Math.min(K - 1, Math.floor((Hm[p] - lo) / (hi - lo) * K));

    const meta = A.galeMeta || { lat: [-3.4, -7.4], lon: [135.8, 139.8] };
    const toIJ = (lat, lon) => [Math.round((lon - meta.lon[0]) / (meta.lon[1] - meta.lon[0]) * (N - 1)), Math.round((meta.lat[0] - lat) / (meta.lat[0] - meta.lat[1]) * (N - 1))];
    const marks = [
      { name: 'Bradbury', sub: 'Atterrissage de Curiosity, 2012', lat: -4.589, lon: 137.441, lift: 0.05, dx: 0.17, align: 'l' },
      { name: 'Zone de sortie', sub: 'Dunes Bagnold et crête Vera Rubin', lat: -4.72, lon: 137.37, lift: 0.15, dx: 0.2, align: 'l', target: true },
      { name: 'Mont Sharp', sub: '≈ 5 km au-dessus du fond', lat: -5.08, lon: 137.85, lift: 0.12, dx: 0.16, align: 'r' }
    ];

    const m = document.createElement('canvas'); m.width = m.height = N;
    const mx = m.getContext('2d'), id = mx.createImageData(N, N), px = id.data;
    function paint(k, rgba, edge) {
      for (let j = 0, p = 0; j < N; j++) for (let i = 0; i < N; i++, p++) {
        const q = p * 4;
        if (lvl[p] < k) { px[q + 3] = 0; continue; }
        const isEdge = edge && (i === 0 || j === 0 || i === N - 1 || j === N - 1 || lvl[p - 1] < k || lvl[p + 1] < k || lvl[p - N] < k || lvl[p + N] < k);
        const c = isEdge ? edge : rgba;
        px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = c[3];
      }
      mx.putImageData(id, 0, 0);
    }

    // Vue depuis le nord-ouest : Bradbury au premier plan, le mont Sharp derrière.
    function draw() {
      const W = box.clientWidth, d = DPR(), c30 = Math.cos(Math.PI / 6), ky = 0.6;
      const s = (W * 0.94) / (2 * N * c30), relief = W * 0.26, dz = relief / (K - 1), base = W * 0.035, top = W * 0.13;
      const foot = 2 * N * s * ky, Hc = Math.ceil(top + relief + foot + base + 8);
      cv.style.height = Hc + 'px'; cv.width = Math.round(W * d); cv.height = Math.round(Hc * d);
      const ctx = cv.getContext('2d'), ox = W / 2, oy = top + relief;
      ctx.imageSmoothingEnabled = true;
      const at = (z) => ctx.setTransform(-d * s * c30, -d * s * ky, d * s * c30, -d * s * ky, d * ox, d * (oy + foot - z));
      const wall = [14, 14, 14, 255], edge = [242, 237, 232, 235];
      const step = 1 / d;
      paint(0, wall, null);
      for (let z = -base; z < 0; z += step) { at(z); ctx.drawImage(m, 0, 0); }
      for (let k = 0; k < K; k++) {
        const z = k * dz;
        if (k > 0) { paint(k, wall, null); for (let zz = z - dz + step; zz < z; zz += step) { at(zz); ctx.drawImage(m, 0, 0); } }
        const g = 22 + k * 2;
        paint(k, [g, g, g, 255], edge);
        at(z); ctx.drawImage(m, 0, 0);
      }
      // Étiquettes
      $$('.t-label', box).forEach((n) => n.remove());
      for (const mk of marks) {
        const [i, j] = toIJ(mk.lat, mk.lon), k = lvl[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
        const X = ox + (j - i) * s * c30, Yp = oy + foot - (i + j) * s * ky - k * dz, L = Math.round(W * mk.lift);
        const el = document.createElement('div');
        el.className = 't-label al-' + mk.align + (mk.target ? ' is-target' : '');
        el.style.left = X + 'px'; el.style.top = Yp + 'px'; el.style.setProperty('--l', L + 'px'); el.style.setProperty('--dx', Math.round(W * mk.dx) + 'px');
        el.innerHTML = '<span class="stem"></span><span class="arm"></span><span class="dot"></span><span class="txt">' + mk.name + '<small>' + mk.sub + '</small></span>';
        box.appendChild(el);
      }
    }
    draw();
    onResize(draw);
  }

  // =====================================================================
  // 3. Outils de dessin de la zone (données réelles + classes de l'IA)
  // =====================================================================
  const ZW = M.W, ZH = M.H;
  const IMG = { hirise: 'assets/zone/hirise.jpg', themis: 'assets/zone/themis-color.jpg' };
  const xy = (lon, lat) => M.toXY(lon, lat);
  const LABELS = [['DUNES BAGNOLD', 137.3671, -4.7014], ['CRÊTE VERA RUBIN', 137.3974, -4.7129]];
  function canvasEl(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function gridImg(fn) {
    const c = canvasEl(M.NX, M.NY), x = c.getContext('2d'), img = x.createImageData(M.NX, M.NY);
    for (let k = 0; k < M.NX * M.NY; k++) { const v = fn(k); if (v) img.data.set(v, k * 4); }
    x.putImageData(img, 0, 0);
    return c;
  }
  const BLACK = [0, 0, 0, 255];
  const SAND = gridImg((k) => M.cls[k] === 1 && BLACK);
  const ROCK = gridImg((k) => M.cls[k] === 2 && BLACK);
  const STEEP = gridImg((k) => M.cls[k] === 4 && BLACK);
  const CLASSIMG = gridImg((k) => { const c = CLASS_COL[M.cls[k]]; return c && [c[0], c[1], c[2], Math.round(120 + 110 * M.conf[k])]; });
  const LIFEIMG = gridImg((k) => {
    const s = M.life[k]; if (s < 0.2) return null;
    const t = clamp((s - 0.2) / 0.6, 0, 1);
    return [Math.round(40 + 140 * t), Math.round(150 + 105 * t), Math.round(200 - 90 * t), Math.round(70 + 170 * t)];
  });
  function fillMask(ctx, m, fill) {
    const t = canvasEl(ctx.canvas.width, ctx.canvas.height), tx = t.getContext('2d');
    tx.imageSmoothingEnabled = true; tx.drawImage(m, 0, 0, t.width, t.height);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = fill; tx.fillRect(0, 0, t.width, t.height);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(t, 0, 0); ctx.restore();
  }
  function pattern(ctx, kind, color, s) {
    const c = canvasEl(s, s), x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = color; x.lineWidth = Math.max(1, s / 5);
    if (kind === 'hatch' || kind === 'cross') { x.beginPath(); x.moveTo(-1, s + 1); x.lineTo(s + 1, -1); x.stroke(); }
    if (kind === 'cross') { x.beginPath(); x.moveTo(-1, -1); x.lineTo(s + 1, s + 1); x.stroke(); }
    if (kind === 'dots') { x.beginPath(); x.arc(s / 2, s / 2, s / 5, 0, 7); x.fill(); }
    return ctx.createPattern(c, 'repeat');
  }
  function hazards(ctx, scale) {
    const d = DPR() * (scale || 1);
    fillMask(ctx, SAND, pattern(ctx, 'dots', 'rgba(255,216,74,.9)', Math.round(5 * d)));
    fillMask(ctx, ROCK, pattern(ctx, 'cross', 'rgba(255,154,46,.75)', Math.round(6 * d)));
    fillMask(ctx, STEEP, pattern(ctx, 'hatch', 'rgba(255,68,51,.95)', Math.round(5 * d)));
  }
  const RAMP = [[0, [32, 52, 120]], [0.25, [40, 140, 160]], [0.5, [120, 180, 90]], [0.75, [220, 170, 70]], [1, [250, 240, 230]]];
  const ramp = (t) => { for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], u = (t - a) / (b - a); return ca.map((v, n) => v + (cb[n] - v) * u); } return RAMP[RAMP.length - 1][1]; };
  const DEM = gridImg((k) => {
    const i = k % M.NX, j = (k / M.NX) | 0;
    const gx = (M.elev[j * M.NX + Math.min(M.NX - 1, i + 1)] - M.elev[j * M.NX + Math.max(0, i - 1)]) / (2 * M.C);
    const gy = (M.elev[Math.min(M.NY - 1, j + 1) * M.NX + i] - M.elev[Math.max(0, j - 1) * M.NX + i]) / (2 * M.C);
    const sh = clamp((gx * 0.7 + gy * 0.7 + 1) / Math.hypot(gx, gy, 1) * 0.75 + 0.15, 0, 1);
    const col = ramp((M.elev[k] - M.eMin) / (M.eMax - M.eMin));
    return [col[0] * sh, col[1] * sh, col[2] * sh, 255];
  });
  function polyline(ctx, pts, k, upto) {
    let acc = 0;
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0);
      if (acc + L >= upto) { const t = (upto - acc) / L; ctx.lineTo((x0 + (x1 - x0) * t) * k, (y0 + (y1 - y0) * t) * k); break; }
      ctx.lineTo(x1 * k, y1 * k); acc += L;
    }
    ctx.stroke();
  }
  function poly(ctx, pts, k) { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a * k, b * k) : ctx.moveTo(a * k, b * k))); ctx.closePath(); }
  function drawStops(ctx, k, r, labels) {
    STOPS.forEach((st, i) => {
      const [X, Y] = xy(st.lon, st.lat), x = X * k, y = Y * k;
      ctx.lineWidth = 1.5;
      if (i === 0) { ctx.fillStyle = C.mars; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.fillStyle = '#140803'; }
      else { ctx.fillStyle = '#0a0909'; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.ink; }
      ctx.font = '700 ' + Math.round(r * 1.1) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i ? String(i) : 'H', x, y + 0.5);
      if (labels) {
        ctx.font = '600 10.5px ' + MONO; ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(st.name.toUpperCase(), x + r + 7, y); ctx.shadowBlur = 0;
      }
    });
  }
  const hazStats = (function () {
    let n = 0, conf = 0, area = 0;
    M.HAZARDS.forEach((h) => { n++; conf += h.conf * h.ha; area += h.ha; });
    const counts = [0, 0, 0, 0, 0], cconf = [0, 0, 0, 0, 0];
    for (let k = 0; k < M.cls.length; k++) { counts[M.cls[k]]++; cconf[M.cls[k]] += M.conf[k]; }
    return { n, area, conf: area ? conf / area : 0, counts, cconf };
  })();

  // =====================================================================
  // 4. Rover Curiosity en 3D (modèle officiel NASA, chargé à l'approche)
  // =====================================================================
  function rover() {
    const sec = $('#rover'), cv = $('#roverCanvas'), load = $('#roverLoading'), steps = $$('#roverSteps li');
    if (!sec) return;
    let prog = 0, model = null;
    const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1); };
    const setStep = (p) => { const i = Math.min(steps.length - 1, Math.floor(p * steps.length)); steps.forEach((s, k) => s.classList.toggle('on', k === i)); };
    setStep(0);
    window.addEventListener('scroll', () => { prog = progress(); setStep(prog); }, { passive: true });
    if (!window.THREE || !THREE.GLTFLoader) { load.textContent = 'Modèle 3D indisponible'; return; }
    once(sec, () => {
      const s = document.createElement('script'); s.src = 'assets/models/rover-data.js';
      s.onload = build; s.onerror = () => { load.textContent = 'Modèle 3D indisponible'; };
      document.body.appendChild(s);
    }, 0, '150% 0px');
    function build() {
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { load.textContent = 'WebGL indisponible'; return; }
      renderer.setPixelRatio(DPR()); renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
      scene.add(new THREE.HemisphereLight(0xfff1e6, 0x2a1208, 1.2));
      const key = new THREE.DirectionalLight(0xffe2c4, 2.8); key.position.set(4, 6, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xff6a2a, 2.6); rim.position.set(-5, 3, -4); scene.add(rim);
      const fill = new THREE.DirectionalLight(0x8fc8ff, 0.7); fill.position.set(-3, 1, 5); scene.add(fill);
      const base = new THREE.Group(); scene.add(base);
      base.add(new THREE.PolarGridHelper(2.6, 16, 6, 96, 0x5a3322, 0x24160f));
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.57, 2.62, 160), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; base.add(ring);
      const bin = atob(window.ARES_ROVER), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      new THREE.GLTFLoader().parse(buf.buffer, '', (gltf) => {
        const m = gltf.scene, box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
        m.scale.setScalar(3.4 / Math.max(size.x, size.y, size.z));
        const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3());
        m.position.set(-c.x, -b2.min.y, -c.z);
        model = new THREE.Group(); model.add(m); base.add(model);
        load.hidden = true;
        if (G && !REDUCE) G.from(model.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 1.6, ease: 'power3.out' });
      }, (err) => { console.error(err); load.textContent = 'Modèle 3D indisponible'; });
      const size = () => { const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      // Glisser à la souris (ou au doigt) pour tourner le rover ; il garde un peu d'élan au lâcher.
      const drag = { on: false, x: 0, y: 0, ry: 0, rx: 0, vy: 0 };
      cv.addEventListener('pointerdown', (e) => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.vy = 0; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => {
        if (!drag.on) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        drag.vy = dx * 0.01; drag.ry += drag.vy; drag.rx = clamp(drag.rx + dy * 0.004, -0.35, 0.35);
      });
      const stopDrag = () => { drag.on = false; };
      cv.addEventListener('pointerup', stopDrag); cv.addEventListener('pointercancel', stopDrag);
      size(); window.addEventListener('resize', size);
      visibleLoop(sec, (t) => {
        const p = prog, wide = innerWidth > 860;
        drag.vy *= drag.on ? 1 : 0.94; if (!drag.on) drag.ry += drag.vy;
        if (model) { model.rotation.y = -0.7 + p * Math.PI * 1.7 + drag.ry + (REDUCE ? 0 : Math.sin(t / 2600) * 0.05); model.rotation.x = drag.rx; }
        base.position.set(wide ? 1.15 : 0, wide ? -0.7 : -2.2, 0);
        cam.position.set(0, 2.2 + p * 0.9, (wide ? 9 : 12.5) - p * 1.8);
        cam.lookAt(base.position.x * 0.6, base.position.y + 0.9, 0);
        renderer.render(scene, cam);
      });
    }
  }

  // =====================================================================
  // 5. IA : schéma isométrique, comparateur, chiffres
  // =====================================================================
  function pipeline() {
    const svg = $('#pipeline');
    if (!svg) return;
    const c30 = Math.cos(Math.PI / 6);
    const P = (x, y, z) => [(x - y) * c30, (x + y) * 0.5 - z];
    const pts = (arr) => arr.map((p) => P(p[0], p[1], p[2]).map((v) => v.toFixed(1)).join(',')).join(' ');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y, z) => { const [a, b] = P(x, y, z); minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, b); maxY = Math.max(maxY, b); };
    const RB = ['#1ea7ff', '#7c4dff', '#e040fb', '#ff3d71', '#ff9100', '#ffd600', '#00e676', '#00e5ff'];
    const flows = [], boxes = [], notes = [];
    function box(x, y, z, w, d, h, label, sub, color, out) { boxes.push({ x, y, z, w, d, h, label, sub, color, out }); grow(x, y, z); grow(x + w, y + d, z + h); grow(x, y + d, z); grow(x + w, y, z + h); }
    function flow(path, color) { flows.push({ path, color }); path.forEach((p) => grow(p[0], p[1], p[2])); }
    // Sources
    const SRC = [['HiRISE', 'MRO · image'], ['CTX', 'MRO · image'], ['MOLA', 'MGS · relief'], ['THEMIS', 'Odyssey · chaleur'], ['CRISM', 'MRO · minéraux'], ['REMS|RAD', 'Curiosity']];
    const Z = 14;
    SRC.forEach((s, i) => box(0, i * 74, 0, 58, 58, 58, s[0], s[1], RB[i]));
    // Plateforme IA
    const plat = [150, -40, 560, 440];
    grow(plat[0], plat[1], 0); grow(plat[2], plat[3], 0); grow(plat[2], plat[1], 0); grow(plat[0], plat[3], 0);
    const MOD = {
      cls: [200, -10, 120, 96, 64, 'Classement|du terrain', 'k-moyennes', '#00e5ff'],
      haz: [200, 150, 120, 96, 64, 'Détection|des dangers', 'sable · pentes', '#ff3d71'],
      life: [200, 310, 120, 96, 64, 'Potentiel|de vie', 'argiles', '#00e676'],
      route: [400, 60, 110, 90, 64, 'Itinéraire|A*', 'le plus sûr', '#ff9100'],
      ai: [400, 240, 110, 90, 64, 'Assistant|IA', 'briefing', '#7c4dff']
    };
    const mid = (k) => { const m = MOD[k]; return [m[0], m[1], m[2], m[3]]; };
    // Flux sources -> modules
    const target = [0, 0, 1, 0, 2, 4];   // index vers cls, cls, haz(MOLA), cls(THEMIS), life(CRISM), ai(REMS)
    const keys = ['cls', 'haz', 'life', 'route', 'ai'];
    SRC.forEach((s, i) => {
      const [mx, my, mw, md] = mid(keys[target[i]]);
      const y0 = i * 74 + 29, ty = my + 18 + (i % 3) * 22, xm = 112 + i * 7;
      flow([[58, y0, Z], [xm, y0, Z], [xm, ty, Z], [mx, ty, Z]], RB[i]);
    });
    const [cx, cy, cw, cd] = mid('cls'), [hx, hy, hw, hd] = mid('haz'), [lx, ly, lw, ld] = mid('life'), [rx, ry, rw, rd] = mid('route'), [ax, ay, aw, ad] = mid('ai');
    flow([[cx + cw / 2, cy + cd, Z], [cx + cw / 2, hy, Z]], '#00e5ff');
    flow([[cx + cw * 0.85, cy + cd, Z], [cx + cw * 0.85, cy + cd + 30, Z], [cx + cw + 30, cy + cd + 30, Z], [cx + cw + 30, ly + 20, Z], [lx + lw, ly + 20, Z]], '#00b8d4');
    flow([[hx + hw, hy + 30, Z], [rx - 20, hy + 30, Z], [rx - 20, ry + 50, Z], [rx, ry + 50, Z]], '#ff3d71');
    flow([[lx + lw, ly + 60, Z], [rx - 40, ly + 60, Z], [rx - 40, ry + 70, Z], [rx, ry + 70, Z]], '#00e676');
    flow([[rx + rw / 2, ry + rd, Z], [rx + rw / 2, ay, Z]], '#ff9100');
    // Sorties
    const OUT = [['Écran|habitat', 'planifier', 40], ['Casque', 'flèche · O₂', 190], ['Briefing', 'texte', 340]];
    OUT.forEach((o, i) => box(640, o[2], 0, 84, 74, 66, o[0], o[1], '#fff', true));
    flow([[rx + rw, ry + 30, Z], [600, ry + 30, Z], [600, 77, Z], [640, 77, Z]], '#ffd600');
    flow([[ax + aw, ay + 25, Z], [610, ay + 25, Z], [610, 227, Z], [640, 227, Z]], '#7c4dff');
    flow([[ax + aw, ay + 65, Z], [620, ay + 65, Z], [620, 377, Z], [640, 377, Z]], '#e040fb');
    Object.values(MOD).forEach((m) => box(m[0], m[1], 8, m[2], m[3], m[4], m[5], m[6], m[7]));

    const fmt = (p) => p.map((v) => v.toFixed(1)).join(',');
    let s = '';
    // Plateforme pointillée
    const pz = 8, [px0, py0, px1, py1] = plat;
    s += '<g class="platform"><polygon class="plat-fill" points="' + pts([[px0, py0, pz], [px1, py0, pz], [px1, py1, pz], [px0, py1, pz]]) + '"/>';
    s += '<polygon class="plat" points="' + pts([[px0, py0, pz], [px1, py0, pz], [px1, py1, pz], [px0, py1, pz]]) + '"/>';
    s += '<polygon class="plat" points="' + pts([[px0, py1, 0], [px1, py1, 0], [px1, py1, pz], [px0, py1, pz]]) + '"/>';
    s += '<polygon class="plat" points="' + pts([[px1, py0, 0], [px1, py1, 0], [px1, py1, pz], [px1, py0, pz]]) + '"/>';
    const [tx, ty] = P(px0 + 30, py1, 22);
    s += '<text class="big" transform="matrix(' + c30.toFixed(3) + ',0.5,0,1,' + tx.toFixed(1) + ',' + ty.toFixed(1) + ')">IA · ARES NAV</text></g>';
    // Flux
    s += '<g class="flows">' + flows.map((f) => '<polyline class="flow" pathLength="1" stroke="' + f.color + '" points="' + pts(f.path) + '"/>').join('') + '</g>';
    s += '<g class="flows-dash">' + flows.map((f) => '<polyline class="flow-dash" points="' + pts(f.path) + '"/>').join('') + '</g>';
    // Boîtes (de l'arrière vers l'avant)
    boxes.sort((a, b) => (a.x + a.y) - (b.x + b.y)).forEach((b) => {
      const { x, y, z, w, d, h } = b;
      let g = '<g class="box">';
      g += '<polygon class="face f-top' + (b.out ? ' out' : '') + '" points="' + pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]) + '"/>';
      g += '<polygon class="face f-left' + (b.out ? ' out' : '') + '" points="' + pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]) + '"/>';
      g += '<polygon class="face f-right' + (b.out ? ' out' : '') + '" points="' + pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]) + '"/>';
      // Repères colorés (comme des connecteurs) sur la face droite
      for (let q = 0; q < 2; q++) g += '<polygon class="port" fill="' + b.color + '" points="' + pts([[x + w, y + 10 + q * 22, z + h - 16], [x + w, y + 22 + q * 22, z + h - 16], [x + w, y + 22 + q * 22, z + h - 26], [x + w, y + 10 + q * 22, z + h - 26]]) + '"/>';
      const lines = b.label.split('|');
      const [lx0, ly0] = P(x + 7, y + d, z + h - 14);
      g += '<text class="lbl" fill="' + (b.out ? '#fff' : b.color) + '" transform="matrix(' + c30.toFixed(3) + ',0.5,0,1,' + lx0.toFixed(1) + ',' + ly0.toFixed(1) + ')">' +
        lines.map((t, i) => '<tspan x="0" dy="' + (i ? 13 : 0) + '" style="fill:' + (b.out ? '#fff' : b.color) + '">' + t + '</tspan>').join('') +
        '<tspan class="lbl-sm" x="0" dy="14">' + b.sub + '</tspan></text>';
      s += g + '</g>';
    });
    // Annotations
    const note = (x, y, z, text, anchor) => { const [a, b] = P(x, y, z); grow(x, y, z); s += '<text class="note-t" x="' + a.toFixed(1) + '" y="' + b.toFixed(1) + '" text-anchor="' + (anchor || 'start') + '">' + text + '</text>'; };
    note(-10, -40, 90, 'Six instruments NASA', 'middle');
    note(560, -40, 120, 'Tout tourne à bord, sans connexion', 'middle');
    note(700, 0, 120, 'Ce que voit l’équipage', 'middle');
    const pad2 = 30;
    svg.setAttribute('viewBox', [minX - pad2, minY - pad2, maxX - minX + 2 * pad2, maxY - minY + 2 * pad2].map((v) => v.toFixed(0)).join(' '));
    svg.insertAdjacentHTML('beforeend', s);
    void fmt; void notes;
  }

  function aiCompare() {
    const cv = $('#aiCompare'), box = $('#compareBox'), handle = $('#compareHandle');
    if (!cv) return;
    let pos = 0.5, mode = 'cls';
    const base = new Image(); base.src = IMG.hirise;
    function render() {
      const w = box.clientWidth, h = Math.round(w * ZH / ZW), ctx = sizeCanvas(cv, w, h), k = w / ZW;
      ctx.fillStyle = '#0a0909'; ctx.fillRect(0, 0, w, h);
      if (base.complete && base.naturalWidth) ctx.drawImage(base, 0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(w * pos, 0, w * (1 - pos), h); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = mode === 'life';
      ctx.drawImage(mode === 'cls' ? CLASSIMG : LIFEIMG, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      if (mode === 'life') M.TARGETS.forEach((t, i) => {
        const x = t.x * k, y = t.y * k;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 11px ' + MONO; ctx.textAlign = 'left'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
        ctx.fillText('Cible ' + (i + 1) + ' · ' + nf(t.score * 100) + ' %', x + 13, y + 4); ctx.shadowBlur = 0;
      });
      ctx.restore();
      handle.style.left = (pos * 100) + '%'; handle.setAttribute('aria-valuenow', Math.round(pos * 100));
    }
    base.onload = render;
    const setPos = (clientX) => { const r = box.getBoundingClientRect(); pos = clamp((clientX - r.left) / r.width, 0.02, 0.98); render(); };
    let drag = false;
    box.addEventListener('pointerdown', (e) => { drag = true; box.setPointerCapture(e.pointerId); setPos(e.clientX); });
    box.addEventListener('pointermove', (e) => { if (drag) setPos(e.clientX); });
    box.addEventListener('pointerup', () => { drag = false; });
    handle.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { pos = clamp(pos + (e.key === 'ArrowLeft' ? -0.05 : 0.05), 0.02, 0.98); render(); e.preventDefault(); } });
    const legend = () => {
      const tot = M.cls.length;
      $('#aiLegend').innerHTML = mode === 'cls'
        ? [1, 2, 4, 3].map((c) => '<span><i style="background:rgb(' + CLASS_COL[c].join(',') + ')"></i>' + M.CLASSES[c] + ' <b>' + nf(hazStats.counts[c] / tot * 100) + ' %</b></span>').join('') + '<span>confiance moyenne <b>' + nf(hazStats.conf * 100) + ' %</b></span>'
        : '<span><i style="background:linear-gradient(90deg,#28968c,#b4ff6e)"></i>Potentiel de vie (simulé)</span><span>' + M.TARGETS.length + ' cibles suggérées</span><span>score max <b>' + nf(M.TARGETS[0].score * 100) + ' %</b></span>';
    };
    $$('[data-ai]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.ai; $$('[data-ai]').forEach((x) => x.classList.toggle('on', x === b)); legend(); render(); }));
    legend(); render(); onResize(render);
    once(box, () => {
      if (REDUCE || !G) return;
      const o = { p: 0.92 }; G.to(o, { p: 0.5, duration: 1.8, ease: 'power3.inOut', onUpdate: () => { pos = o.p; render(); } });
    }, 0.5);
    // Chiffres de l'IA
    const t0 = performance.now(); M.plan(STOPS); const ms = performance.now() - t0;
    const units = {}; M.TARGETS.forEach((t) => { units[t.unit] = 1; });
    $('#aiHaz').textContent = hazStats.n + ' zones';
    $('#aiHazTxt').textContent = 'Sable, roche rugueuse et pentes raides repérés sur ' + nf(hazStats.area) + ' ha, avec une confiance moyenne de ' + nf(hazStats.conf * 100) + ' %.';
    $('#aiLife').textContent = nf(M.TARGETS[0].score * 100) + ' %';
    $('#aiLifeTxt').textContent = M.TARGETS.length + ' cibles suggérées, dans l’' + Object.keys(units).join(' et la ').replace(' (approx.)', '') + '.';
    $('#aiRoute').textContent = km(PLAN.safe.dist) + ' km';
    $('#aiRouteTxt').textContent = 'Le trajet sûr évite ' + nf(PLAN.short.sandLen) + ' m de dunes ; recalculé en ' + nf(Math.max(1, ms)) + ' ms à chaque changement.';
    const psh = $('#psHaz'); if (psh) psh.textContent = hazStats.n + ' zones à risque';
  }

  // =====================================================================
  // 6. Couches en vue éclatée
  // =====================================================================
  const LAYERS = [
    { key: 'opt', name: 'Image', src: 'MRO · HiRISE', what: 'Le sol vu d’orbite, jusqu’à 30 cm par pixel.', tag: 'real' },
    { key: 'relief', name: 'Relief', src: 'MRO · HiRISE (MNT) · MGS · MOLA', what: 'Altitude et pentes : la base du calcul de trajet.', tag: 'real' },
    { key: 'therm', name: 'Thermique', src: 'Mars Odyssey · THEMIS', what: 'La nuit, la roche reste chaude, le sable refroidit.', tag: 'real' },
    { key: 'min', name: 'Minéraux', src: 'MRO · CRISM', what: 'Hématite et argiles, formées en présence d’eau.', tag: 'approx' },
    { key: 'ai', name: 'Lecture de l’IA', src: 'Modèle ARES NAV', what: 'Sable, roche rugueuse et pentes raides détectés.', tag: 'ai' },
    { key: 'route', name: 'Itinéraire', src: 'ARES NAV · A*', what: 'Le trajet sûr entre l’habitat et les trois arrêts.', tag: 'calc' }
  ];
  const PW = 700, PH = Math.round(PW * ZH / ZW), PK = PW / ZW;
  function layerEl(key) {
    if (key === 'opt' || key === 'therm') { const im = new Image(); im.src = key === 'opt' ? IMG.hirise : IMG.themis; im.alt = ''; return im; }
    const cv = canvasEl(PW, PH), ctx = cv.getContext('2d');
    if (key === 'relief') ctx.drawImage(DEM, 0, 0, PW, PH);
    if (key === 'min') {
      ctx.fillStyle = 'rgba(5,5,5,.6)'; ctx.fillRect(0, 0, PW, PH);
      poly(ctx, M.CLAY, PK); ctx.fillStyle = 'rgba(63,208,201,.28)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#3fd0c9'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      poly(ctx, M.HEM, PK); ctx.fillStyle = 'rgba(224,95,176,.5)'; ctx.fill(); ctx.strokeStyle = '#e05fb0'; ctx.stroke();
    }
    if (key === 'ai') { ctx.fillStyle = 'rgba(5,5,5,.55)'; ctx.fillRect(0, 0, PW, PH); ctx.imageSmoothingEnabled = false; ctx.drawImage(CLASSIMG, 0, 0, PW, PH); }
    if (key === 'route') {
      ctx.fillStyle = 'rgba(5,5,5,.35)'; ctx.fillRect(0, 0, PW, PH);
      ctx.strokeStyle = C.mars; ctx.lineWidth = 4; ctx.lineJoin = 'round';
      polyline(ctx, PLAN.safePts, PK, Infinity); drawStops(ctx, PK, 11, false);
    }
    return cv;
  }
  function layersSection() {
    const stack = $('#stack'), list = $('#layerList'), wrap = $('#stackWrap');
    if (!stack) return;
    stack.style.setProperty('--hr', (ZH / ZW).toFixed(4));
    LAYERS.forEach((L, i) => {
      const pl = document.createElement('div');
      pl.className = 'plane'; pl.style.setProperty('--i', i); pl.dataset.i = i;
      pl.appendChild(layerEl(L.key));
      const tg = document.createElement('span'); tg.className = 'plane-tag';
      tg.innerHTML = pad(i + 1) + ' ' + L.name + '<i>' + L.src + '</i>';
      pl.appendChild(tg); stack.appendChild(pl);
    });
    STOPS.forEach((st) => {
      const [X, Y] = xy(st.lon, st.lat), pin = document.createElement('span'); pin.className = 'pin';
      pin.style.left = (X / ZW * 100) + '%'; pin.style.top = 'calc(' + (Y / ZH * 100) + '% - var(--gap) * ' + (LAYERS.length - 1) + ')';
      pin.style.height = 'calc(var(--gap) * ' + (LAYERS.length - 1) + ')';
      stack.appendChild(pin);
    });
    const TAG = { real: '<span class="tag-real">Réel</span>', calc: '<span class="tag-real">Calculé</span>', approx: '<span class="tag-sim">Approx.</span>', ai: '<span class="tag-ai">IA</span>' };
    LAYERS.slice().reverse().forEach((L) => {
      const i = LAYERS.indexOf(L), li = document.createElement('li');
      li.dataset.i = i; li.tabIndex = 0;
      li.innerHTML = '<span class="n">' + pad(i + 1) + '</span><div><b>' + L.name + '</b>' + TAG[L.tag] + '<span class="src">' + L.src + '</span><p>' + L.what + '</p></div>';
      list.appendChild(li);
    });
    const focus = (i) => {
      stack.classList.toggle('focus', i != null);
      $$('.plane', stack).forEach((p) => p.classList.toggle('on', String(i) === p.dataset.i));
      $$('li', list).forEach((l) => l.classList.toggle('on', String(i) === l.dataset.i));
    };
    $$('li', list).forEach((li) => { li.addEventListener('mouseenter', () => focus(li.dataset.i)); li.addEventListener('focus', () => focus(li.dataset.i)); li.addEventListener('click', () => focus(li.dataset.i)); });
    list.addEventListener('mouseleave', () => focus(null));
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = wrap.getBoundingClientRect(), vh = window.innerHeight;
      const p = REDUCE ? 1 : ease(clamp((vh - r.top) / (vh * 0.85), 0, 1));
      stack.style.setProperty('--gap', ((8 + 44 * p) * stack.clientWidth / 470).toFixed(1) + 'px');
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update); update();
  }

  // =====================================================================
  // 7. Carte locale : image HiRISE, dangers de l'IA, trajets
  // =====================================================================
  function routeSection() {
    const cv = $('#routeMap');
    if (!cv) return;
    cv.style.aspectRatio = ZW + ' / ' + ZH;
    let mode = 'both', prog = REDUCE ? 1 : 0;
    const base = new Image(); base.src = IMG.hirise;
    function render() {
      const w = cv.clientWidth, h = Math.round(w * ZH / ZW), ctx = sizeCanvas(cv, w, h), k = w / ZW;
      ctx.fillStyle = '#0a0909'; ctx.fillRect(0, 0, w, h);
      if (base.complete && base.naturalWidth) { ctx.globalAlpha = 0.9; ctx.drawImage(base, 0, 0, w, h); ctx.globalAlpha = 1; }
      hazards(ctx);
      ctx.font = '600 10px ' + MONO; ctx.fillStyle = 'rgba(242,237,232,.9)'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      if (w > 520) LABELS.forEach(([t, lon, lat]) => { const [X, Y] = xy(lon, lat); ctx.fillText(t, X * k, Y * k - 10); });
      ctx.shadowBlur = 0; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (mode !== 'safe') { ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(242,237,232,.9)'; ctx.lineWidth = 1.6; polyline(ctx, PLAN.shortPts, k, PLAN.short.dist * prog); ctx.setLineDash([]); }
      if (mode !== 'short') { ctx.shadowColor = 'rgba(255,90,31,.8)'; ctx.shadowBlur = 10; ctx.strokeStyle = C.mars; ctx.lineWidth = 3; polyline(ctx, PLAN.safePts, k, PLAN.safe.dist * prog); ctx.shadowBlur = 0; }
      drawStops(ctx, k, w < 520 ? 8 : 11, w >= 520);
      const bx = 16, by = h - 18, bl = 500 * k;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fillStyle = C.ink; ctx.font = '600 10px ' + MONO;
      ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by); ctx.lineTo(bx + bl, by); ctx.lineTo(bx + bl, by - 5); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillText('500 m', bx + bl + 8, by + 3);
      ctx.textAlign = 'center'; ctx.fillText('N', w - 22, 22);
      ctx.beginPath(); ctx.moveTo(w - 22, 30); ctx.lineTo(w - 26, 40); ctx.lineTo(w - 18, 40); ctx.closePath(); ctx.fill();
    }
    base.onload = render;
    $$('.seg button[data-show]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.show; $$('.seg button[data-show]').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
    render(); onResize(render);
    once(cv, () => {
      if (REDUCE) return;
      const t0 = performance.now();
      const tick = (now) => { prog = ease(clamp((now - t0) / 2600, 0, 1)); render(); if (prog < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, 0.4);
  }

  // =====================================================================
  // 8. Bilan, profil, autonomie, alerte, casque (calculés par zone-model.js)
  // =====================================================================
  function dashSection() {
    const p = PLAN, sf = p.safe, sh = p.short;
    $('#dashStats').innerHTML = [['Distance', km(sf.dist) + ' km'], ['Durée', hm(p.totalMin)], ['Dénivelé', '+' + nf(sf.asc) + ' m'], ['Pente max', nf(sf.maxS) + '°']]
      .map(([a, b], i) => '<li><span>' + a + '</span><b' + (i === 3 && sf.maxS <= 20 ? ' class="ok"' : '') + '>' + b + '</b></li>').join('');
    $('#profileLegend').innerHTML = '<span><i style="background:linear-gradient(' + C.r + ',' + C.o + ',' + C.y + ')"></i>Altitude</span><span><i style="background:' + C.ink + '"></i>Arrêt</span><span>MNT HiRISE</span>';
    $('#profileAxis').innerHTML = '<span>0 km</span><span>' + km(sf.dist / 2) + ' km</span><span>' + km(sf.dist) + ' km</span>';
    const cv = $('#profile');
    let grow = REDUCE ? 1 : 0;
    const prof = sf.prof, hs = prof.map((q) => q.h), lo = Math.min(...hs), hi = Math.max(...hs);
    const hAtD = (dd) => { let a = 0, b = prof.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (prof[m].d < dd) a = m; else b = m; } const t = (dd - prof[a].d) / ((prof[b].d - prof[a].d) || 1); return prof[a].h + (prof[b].h - prof[a].h) * t; };
    function render() {
      const w = cv.clientWidth, h = cv.clientHeight, ctx = sizeCanvas(cv, w, h);
      const n = Math.max(24, Math.floor(w / 7)), gap = 2, bw = (w - 28) / n - gap, x0 = 14;
      const grad = ctx.createLinearGradient(0, 14, 0, h);
      grad.addColorStop(0, C.r); grad.addColorStop(0.45, C.o); grad.addColorStop(1, C.y);
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const y = Math.round(h * i / 4) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = 0; i < n; i++) {
        const v = (hAtD((i + 0.5) / n * sf.dist) - lo) / (hi - lo), g = clamp((grow - i / n * 0.5) / 0.5, 0, 1);
        const bh = (0.12 + 0.8 * v) * (h - 22) * ease(g);
        ctx.fillStyle = grad; ctx.fillRect(x0 + i * (bw + gap), h - bh, bw, bh);
      }
      ctx.font = '600 10px ' + MONO; ctx.textAlign = 'center';
      p.stopAt.forEach((dd, i) => {
        const x = x0 + dd / sf.dist * (w - 28);
        ctx.strokeStyle = 'rgba(242,237,232,.85)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 14); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.ink; ctx.fillText(i === 0 || i === p.stopAt.length - 1 ? 'H' : String(i), clamp(x, 6, w - 6), 10);
      });
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(242,237,232,.6)'; ctx.fillText(nf(hi) + ' m', w - 4, 26);
    }
    render(); onResize(render);
    once(cv, () => {
      if (REDUCE) return;
      const t0 = performance.now();
      const tick = (now) => { grow = clamp((now - t0) / 1400, 0, 1); render(); if (grow < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, 0.4);
    const gauge = $('#o2Gauge .gauge-fill'), ok = p.marginMin >= 20;
    gauge.style.background = 'repeating-linear-gradient(90deg,' + (ok ? C.safe : C.o) + ' 0 6px, transparent 6px 8px)';
    once($('#o2Gauge'), () => { gauge.style.width = (clamp(p.o2Used, 0, 1) * 100).toFixed(1) + '%'; }, 0.6);
    $('#o2Stats').innerHTML = '<div><dt>Durée prévue</dt><dd>' + hm(p.totalMin) + '</dd></div><div><dt>Marge</dt><dd class="' + (ok ? 'ok' : '') + '">' + nf(p.marginMin) + ' min</dd></div>' +
      '<div><dt>Retour prévu</dt><dd>' + clock(p.totalMin) + '</dd></div><div><dt>Retour au plus tard</dt><dd>' + clock(M.HYP.budgetMin) + '</dd></div>';
    const parts = [];
    if (sh.sandLen > 0) parts.push(nf(sh.sandLen) + ' m de dunes');
    if (sh.steepLen > sf.steepLen) parts.push(nf(sh.steepLen) + ' m de pente raide');
    if (sh.blockedLen > 0) parts.push(nf(sh.blockedLen) + ' m de pentes de plus de 20°');
    $('#alertBox').innerHTML = '<b>Trajet le plus court refusé</b><p>La ligne droite entre les arrêts traverse ' + (parts.join(' et ') || 'des zones à risque') + ', détectés par l’IA.</p>' +
      '<p>Le trajet sûr ajoute ' + nf(Math.max(0, sf.dist - sh.dist)) + ' m et reste sous ' + nf(Math.ceil(sf.maxS)) + '° de pente.</p>';

    // Affichage casque : un moment réel du trajet vers l'arrêt 2, là où un danger arrive devant.
    const ahead = (d) => {
      for (let dd = 10; dd <= 120; dd += 10) {
        const q = M.along(p.safePts, d + dd), kk = M.cellOf(q.x, q.y);
        if (M.cls[kk] === 4 || M.slope[kk] > 12) return 'PENTE ' + nf(M.slope[kk]) + '° DANS ' + dd + ' m';
        if (M.cls[kk] === 1) return 'DUNES DANS ' + dd + ' m · RESTEZ SUR LE TRACÉ';
        if (M.cls[kk] === 2) return 'ROCHERS DANS ' + dd + ' m · RALENTISSEZ';
      }
      return null;
    };
    let d = p.stopAt[2] - 400, alert = null;
    for (let dd = p.stopAt[1] + 150; dd <= p.stopAt[2] - 150 && !alert; dd += 20) { const al = ahead(dd); if (al) { d = dd; alert = al; } }
    const left = p.stopAt[2] - d, leftMin = left / 1000 / M.HYP.speedKmh * 60;
    const o2 = (M.HYP.budgetMin - (p.arrive[2] - leftMin)) / M.HYP.budgetMin;
    const set = (id, t) => { const el = $('#' + id); if (el) el.textContent = t; };
    set('hudDist', nf(Math.round(left / 10) * 10) + ' m'); set('hudNext', 'ARRÊT 2 · ' + STOPS[2].name.toUpperCase());
    set('hudO2', 'O₂ ' + nf(o2 * 100) + ' %'); set('hudRet', 'RETOUR AVANT ' + clock(M.HYP.budgetMin));
    if (alert) set('hudAlert', alert); else { const g = $('#hudAlert'); if (g) g.parentNode.style.display = 'none'; }
    set('hudAi', '« Arrêt 2 dans ' + nf(Math.max(1, leftMin)) + ' min. Marge oxygène : ' + nf(p.marginMin) + ' min. »');
    const barEl = $('#hudO2Bar'); if (barEl) { barEl.setAttribute('height', (150 * o2).toFixed(0)); barEl.setAttribute('y', (150 * (1 - o2)).toFixed(0)); }
  }

  // =====================================================================
  // 9. Assistant : réponses préparées à partir des faits calculés
  // =====================================================================
  function chatSection() {
    const log = $('#chatLog'), sugg = $('#chatSugg');
    if (!log) return;
    const p = PLAN, sf = p.safe, leg = p.legs[1], walkLeg = leg.safeM.dist / 1000 / M.HYP.speedKmh * 60;
    let q1 = 'Oui. Le trajet de l’arrêt 1 à l’arrêt 2 fait ' + km(leg.safeM.dist) + ' km, pente maximale ' + nf(leg.safeM.maxS) + '°, environ ' + nf(walkLeg) + ' min de marche.';
    if (leg.shortM.sandLen > 0) q1 += ' La ligne droite traverserait ' + nf(leg.shortM.sandLen) + ' m de dunes détectées par l’IA : le trajet proposé les contourne.';
    const t = M.TARGETS[0];
    const QA = [
      { q: 'Le trajet vers l’arrêt 2 est-il sûr ?', a: q1, src: ['IA · terrain', 'MRO · HiRISE', 'Calcul ARES NAV'] },
      { q: 'Où chercher des traces de vie ?', a: 'La meilleure cible est à ' + km(Math.hypot(t.x - xy(STOPS[0].lon, STOPS[0].lat)[0], t.y - xy(STOPS[0].lon, STOPS[0].lat)[1])) + ' km de l’habitat, dans l’' + t.unit.replace(' (approx.)', '') + ' (score ' + nf(t.score * 100) + ' %, simulé). Les argiles et l’hématite se forment en présence d’eau : ce sont les meilleurs endroits pour chercher des traces de vie passée.', src: ['MRO · CRISM', 'IA · potentiel de vie'] },
      { q: 'Génère le briefing de sortie', a: 'Sortie de ' + hm(p.totalMin) + ' pour ' + M.HYP.crew + ' astronautes, départ ' + clock(0) + '. Trajet de ' + km(sf.dist) + ' km : bord des dunes (1), roche à hématite (2), sol argileux (3), puis retour. Dénivelé +' + nf(sf.asc) + ' m, pente maximale ' + nf(sf.maxS) + '°. Le trajet contourne ' + nf(p.short.sandLen) + ' m de dunes. Conditions types : air entre −80 et 0 °C, dose ≈ 0,64 mSv par jour. Retour au plus tard ' + clock(M.HYP.budgetMin) + ', marge de ' + nf(p.marginMin) + ' min.', src: ['Calcul ARES NAV', 'IA · terrain', 'Curiosity · REMS', 'Curiosity · RAD'] },
      { q: 'Combien de marge me reste-t-il ?', a: 'Trajet prévu : ' + hm(p.totalMin) + ', retour à ' + clock(p.totalMin) + '. Limite : ' + clock(M.HYP.budgetMin) + '. Marge : ' + nf(p.marginMin) + ' min. Si chaque arrêt dure 10 min de plus, elle passe à ' + nf(p.marginMin - 30) + ' min.', src: ['Calcul ARES NAV'] }
    ];
    let busy = false;
    function ask(item) {
      if (busy) return;
      busy = true;
      $$('button', sugg).forEach((b) => { b.disabled = true; });
      const q = document.createElement('div'); q.className = 'msg msg-q'; q.textContent = item.q; log.appendChild(q);
      const a = document.createElement('div'); a.className = 'msg msg-a'; a.innerHTML = '<span class="who">ARES · assistant</span><p></p>'; log.appendChild(a);
      const para = $('p', a), caret = document.createElement('span'); caret.className = 'caret'; para.appendChild(caret);
      let i = 0;
      const done = () => {
        caret.remove(); para.textContent = item.a;
        const s = document.createElement('div'); s.className = 'srcs'; s.innerHTML = item.src.map((x) => '<span>' + x + '</span>').join(''); a.appendChild(s);
        busy = false; $$('button', sugg).forEach((b) => { b.disabled = false; }); log.scrollTop = log.scrollHeight;
      };
      if (REDUCE) { done(); return; }
      setTimeout(function type() {
        i = Math.min(item.a.length, i + 3); para.textContent = item.a.slice(0, i); para.appendChild(caret); log.scrollTop = log.scrollHeight;
        if (i < item.a.length) requestAnimationFrame(type); else done();
      }, 450);
    }
    QA.slice(1).forEach((item) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = item.q; b.addEventListener('click', () => { if (busy) return; b.remove(); ask(item); }); sugg.appendChild(b); });
    once(log, () => ask(QA[0]), 0.5);
  }

  // =====================================================================
  // 10. Animations au défilement
  // =====================================================================
  function scrollFx() {
    const hero = $('#top');
    const par = () => {};
    window.addEventListener('scroll', par, { passive: true }); par();
    if (!G || !ST || REDUCE) return;
    G.from(['.hero-index', '.hero-titlerow', '.hero-sub', '.hero-tag'], { y: 30, opacity: 0, duration: 1.1, stagger: 0.12, ease: 'power3.out', delay: 0.15 });
    G.from('#hStats > div', { y: 24, opacity: 0, duration: 0.9, stagger: 0.07, delay: 0.7, ease: 'power3.out' });
    G.from('.side', { autoAlpha: 0, duration: 1.4, delay: 0.5, clearProps: 'opacity,visibility' });
    $$('.ps-row').forEach((row) => {
      G.timeline({ scrollTrigger: { trigger: row, start: 'top 85%' } })
        .from($('.ps-n', row), { opacity: 0, duration: 0.4 })
        .from($('.ps-pb', row), { x: -50, opacity: 0, duration: 0.7, ease: 'power3.out' }, '<')
        .from($('.ps-link i', row), { scaleX: 0, scaleY: 0, duration: 0.6, ease: 'power2.inOut' }, '-=.3')
        .from($('.ps-so', row), { x: 50, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=.25');
    });
    G.fromTo('#pipeline .flow', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', stagger: 0.04,
      scrollTrigger: { trigger: '#pipelineFig', start: 'top 80%', end: 'center 45%', scrub: 1 } });
    G.from('#pipeline .box', { opacity: 0, y: 24, duration: 0.6, stagger: 0.05, ease: 'power3.out', scrollTrigger: { trigger: '#pipelineFig', start: 'top 80%' } });
    G.from('#pipeline .flows-dash', { opacity: 0, duration: 1, scrollTrigger: { trigger: '#pipelineFig', start: 'center 60%' } });
    $$('.ai-card b, .big-num b').forEach((el) => {
      const m = el.textContent.match(/^(\d+(?:[\s\u202f\u00a0]\d{3})*(?:,\d+)?)(.*)$/); if (!m) return;
      const end = parseFloat(m[1].replace(/[\s\u202f\u00a0]/g, '').replace(',', '.')), dec = (m[1].split(',')[1] || '').length, o = { v: 0 };
      G.to(o, { v: end, duration: 1.4, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%' }, onUpdate: () => { el.textContent = nf(o.v, dec) + m[2]; } });
    });
    G.from('.outro-title', { scale: 0.85, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.outro', start: 'top 75%' } });
  }

  // =====================================================================
  // Visuels de la section problèmes → solutions
  // =====================================================================
  function psVisuals() {
    const V = {};
    V.gps = '<img src="assets/hero/mars.webp" alt=""><svg viewBox="0 0 200 200"><ellipse cx="100" cy="100" rx="92" ry="34" class="orb"/><g transform="translate(160 78)"><rect x="-9" y="-6" width="18" height="12" class="sat"/><path d="M-22 0h13M9 0h13" class="sat-w"/></g><path d="M40 40L160 160M160 40L40 160" class="cross"/></svg><b class="vis-tag">0 satellite GPS</b>';
    V.scale = '<img src="assets/hero/gale.webp" alt=""><svg viewBox="0 0 200 200"><rect x="78" y="92" width="22" height="16" class="zoom"/><path d="M100 92L196 6M100 108L196 194" class="zoom-l"/></svg><b class="vis-tag">154 km → 5 km</b>';
    V.o2 = '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="70" class="o2-bg"/><circle cx="100" cy="100" r="70" class="o2-arc" pathLength="100" stroke-dasharray="86 100" transform="rotate(-90 100 100)"/><text x="100" y="98" class="o2-t">4 h</text><text x="100" y="122" class="o2-s">D’OXYGÈNE</text></svg>';
    V.earth = '<svg viewBox="0 0 200 200"><circle cx="34" cy="100" r="18" class="earth"/><circle cx="170" cy="100" r="11" class="mars"/><path d="M54 100H157" class="sig"/><text x="102" y="86" class="sig-t">3 à 22 min</text><text x="34" y="138" class="lab">TERRE</text><text x="170" y="138" class="lab">MARS</text></svg>';
    V.hud = '<svg viewBox="0 0 200 200"><path d="M30 60Q100 30 170 60Q182 100 170 140Q100 170 30 140Q18 100 30 60Z" class="visor"/><path d="M100 70l16 34-16-8-16 8z" class="arr"/><text x="100" y="128" class="hud-t">340 m</text><rect x="44" y="84" width="6" height="40" class="o2b"/><rect x="44" y="96" width="6" height="28" class="o2f"/></svg>';
    $$('.ps-vis').forEach((el) => {
      const v = el.dataset.v;
      if (V[v]) { el.innerHTML = V[v]; return; }
      // Vues réelles de la zone : HiRISE + dangers (IA) ou potentiel de vie
      const cv = document.createElement('canvas'), w = 360, hh = Math.round(w * ZH / ZW);
      cv.width = w; cv.height = hh; el.appendChild(cv);
      const base = new Image();
      base.onload = () => {
        const ctx = cv.getContext('2d');
        ctx.drawImage(base, 0, 0, w, hh);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, w, hh);
        ctx.imageSmoothingEnabled = v === 'life';
        ctx.drawImage(v === 'haz' ? CLASSIMG : LIFEIMG, 0, 0, w, hh);
      };
      base.src = IMG.hirise;
      el.insertAdjacentHTML('beforeend', '<b class="vis-tag">' + (v === 'haz' ? hazStats.n + ' zones détectées par l’IA' : M.TARGETS.length + ' cibles (simulé)') + '</b>');
    });
    if (G && ST && !REDUCE) $$('.ps-vis').forEach((el) => G.from(el, { scale: 0.7, opacity: 0, rotate: -6, duration: 0.9, ease: 'back.out(1.6)', scrollTrigger: { trigger: el, start: 'top 85%' } }));
  }

  // =====================================================================
  // Casque ARES en 3D (d'après la planche technique) : rotation à la souris, vue éclatée au scroll
  // =====================================================================
  function helmet3d() {
    const cv = $('#helmet3d');
    if (!cv || !window.THREE) return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { return; }
    renderer.setPixelRatio(DPR()); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 50);
    cam.position.set(0, 0.3, 7); cam.lookAt(0, -0.05, 0);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a0c06, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6a2a, 1.4); rim.position.set(-4, 1, -3); scene.add(rim);
    const root = new THREE.Group(); scene.add(root);
    const shellM = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.45, metalness: 0.6, flatShading: true });
    const plateM = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.5, metalness: 0.5, flatShading: true });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x220c04, roughness: 0.08, metalness: 0.9, emissive: 0xff5a1f, emissiveIntensity: 0.12, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const glowM = new THREE.MeshBasicMaterial({ color: 0x9ff3ff });
    const lineM = new THREE.LineBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.55 });
    const parts = [];
    function part(geo, mat, pos, rot, dir) {
      const g = new THREE.Group(), m = new THREE.Mesh(geo, mat);
      g.add(m); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), lineM));
      g.position.copy(pos); if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
      g.userData = { base: pos.clone(), dir: new THREE.Vector3(...dir) };
      root.add(g); parts.push(g); return g;
    }
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // Coque : calotte facettée (dessus et arrière), ouverte devant pour la visière
    part(new THREE.SphereGeometry(1, 14, 10, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.78), shellM, V(0, 0.05, 0), [0, 0, 0], [0, 0.15, -0.9]).scale.set(0.92, 1.04, 1.08);
    // Plaque de crête (comme sur la planche, vue de dessus)
    part(new THREE.CylinderGeometry(1.06, 1.06, 0.42, 14, 1, true, -0.21, 0.42), plateM, V(0, 0.05, 0), [0, 0, Math.PI / 2], [0, 1, 0]).scale.set(1.04, 1, 1.1);
    // Visière
    part(new THREE.SphereGeometry(1.03, 20, 12, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.32), glassM, V(0, 0.02, 0.02), [0, 0, 0], [0, 0, 1.1]).scale.set(0.93, 1, 1.09);
    // Mentonnière hexagonale
    const chin = new THREE.Shape([[-0.42, 0], [0.42, 0], [0.55, -0.32], [0.3, -0.62], [-0.3, -0.62], [-0.55, -0.32]].map(([x, y]) => new THREE.Vector2(x, y)));
    part(new THREE.ExtrudeGeometry(chin, { depth: 0.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }), plateM, V(0, -0.38, 0.72), [-0.25, 0, 0], [0, -0.6, 1]);
    // Capteur frontal (A)
    const sens = part(new THREE.TorusGeometry(0.15, 0.04, 8, 24), plateM, V(0, 0.78, 0.72), [-0.75, 0, 0], [0, 0.6, 0.9]);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), glowM); lens.position.z = 0.01; sens.add(lens);
    // Modules latéraux (B)
    [-1, 1].forEach((sx) => {
      const pod = part(new THREE.CylinderGeometry(0.24, 0.27, 0.16, 16), plateM, V(sx * 0.96, 0.1, -0.05), [0, 0, Math.PI / 2], [sx * 1.2, 0, 0]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 24), glowM); ring.rotation.y = Math.PI / 2; ring.position.y = sx * 0.09; ring.rotation.set(Math.PI / 2, 0, 0); pod.add(ring);
    });
    // Unité arrière (D) avec fentes de ventilation
    const back = part(new THREE.BoxGeometry(0.7, 0.42, 0.28), plateM, V(0, -0.32, -0.95), [0.25, 0, 0], [0, -0.2, -1.2]);
    [-0.1, 0.02, 0.14].forEach((y) => { const s0 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.02), glowM); s0.position.set(0, y - 0.04, -0.15); back.add(s0); });
    // Module central (E) : calculateur, visible en vue éclatée
    const core = part(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 6), plateM, V(0, 0.15, -0.2), [Math.PI / 2, 0, 0], [0, 0, 0]);
    const coreL = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), glowM); coreL.position.y = 0.065; coreL.rotation.x = -Math.PI / 2; core.add(coreL);
    // Collier
    part(new THREE.CylinderGeometry(0.72, 0.85, 0.28, 16, 1, true), plateM, V(0, -0.98, -0.05), [0, 0, 0], [0, -1, 0]);
    // Rotation à la souris, vue éclatée au défilement
    const drag = { on: false, x: 0, ry: -0.6, rx: 0.05, v: 0.004 };
    cv.addEventListener('pointerdown', (e) => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drag.on) return; drag.v = (e.clientX - drag.x) * 0.01; drag.ry += drag.v; drag.rx = clamp(drag.rx + (e.clientY - drag.y) * 0.006, -0.6, 0.6); drag.x = e.clientX; drag.y = e.clientY; });
    cv.addEventListener('pointerup', () => { drag.on = false; });
    const size = () => { const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    size(); window.addEventListener('resize', size);
    let ex = 0;
    visibleLoop(cv, () => {
      if (!drag.on) { drag.v += (0.004 - drag.v) * 0.03; drag.ry += REDUCE ? 0 : drag.v; }
      const r = cv.getBoundingClientRect(), target = clamp((innerHeight * 0.55 - r.top) / (r.height * 0.9), 0, 1);
      ex += (target - ex) * 0.08;
      parts.forEach((p) => p.position.copy(p.userData.base).addScaledVector(p.userData.dir, ex * 0.32));
      root.rotation.set(drag.rx, drag.ry, 0);
      renderer.render(scene, cam);
    });
  }

  // ---------- Lancement ----------
  const safe = (fn) => { try { const r = fn(); if (r && r.catch) r.catch((e) => console.error(e)); } catch (e) { console.error(e); } };
  [hero, terrain, rover, helmet3d, psVisuals, pipeline, aiCompare, layersSection, routeSection, dashSection, chatSection, scrollFx].forEach(safe);
  // Les positions de déclenchement changent quand images et polices arrivent : on les recalcule.
  if (ST) { window.addEventListener('load', () => ST.refresh()); if (document.fonts) document.fonts.ready.then(() => ST.refresh()); }
})();
