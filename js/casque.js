// ARES NAV — vue casque : l'astronaute marche sur le vrai terrain (MNT + image HiRISE) avec un copilote IA.
// Position, oxygène, énergie et constantes sont SIMULÉS ; terrain, dangers (modèle IA) et trajet sont calculés.
(function () {
  'use strict';
  const M = window.ARES_ZM, $ = (s) => document.querySelector(s);
  if (!M || !window.THREE) return;
  const H = M.HYP, STOPS = M.DEFAULT_STOPS, PLAN = M.plan(STOPS);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nf = (n, d) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (min) => { const t = Math.round(H.departMin + min); return pad(Math.floor(t / 60) % 24) + ':' + pad(t % 60); };
  const CLS = M.CLASSES, HZ = { 1: 'Dunes', 2: 'Rochers', 4: 'Pente raide' };

  // ---------- Scène ----------
  const canvas = $('#world');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const SKY = new THREE.Color(0xc79a70);
  scene.background = SKY; scene.fog = new THREE.Fog(SKY, 350, 2600);
  const cam = new THREE.PerspectiveCamera(68, 1, 0.3, 200000);
  scene.add(new THREE.HemisphereLight(0xffe6cc, 0x4a2a18, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.35); sun.position.set(900, 420, -300); scene.add(sun);

  // Ciel : dégradé simple (zénith plus sombre, horizon caramel)
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(150000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = clamp(normalize(p).y, 0.0, 1.0); vec3 top = vec3(0.36,0.25,0.19); vec3 hor = vec3(0.78,0.60,0.44); gl_FragColor = vec4(mix(hor, top, pow(h, 0.55)), 1.0); }'
  })));

  // ---------- Terrain réel ----------
  const NX = M.NX, NY = M.NY, C = M.C, W = M.W, HH = M.H, E0 = M.eMin;
  const wx = (x) => x - W / 2, wz = (y) => y - HH / 2, wy = (e) => e - E0;
  function grid(yOff) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(NX * NY * 3), uv = new Float32Array(NX * NY * 2), idx = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      pos.set([wx((i + 0.5) * C), wy(M.elev[k]) + yOff, wz((j + 0.5) * C)], k * 3);
      uv.set([(i + 0.5) / NX, 1 - (j + 0.5) / NY], k * 2);
    }
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i; idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const tex = new THREE.TextureLoader().load(window.ARES_TERRAIN || '');
  tex.encoding = THREE.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Grain du sol (procédural) : l'image HiRISE fait ≈ 2,3 m/px, trop peu pour la vue à hauteur d'yeux.
  const detail = (function () {
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'), img = x.createImageData(n, n);
    const hsh = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const vn = (u, v, f) => { const i = Math.floor(u * f), j = Math.floor(v * f), fu = u * f - i, fv = v * f - j, w = (q) => ((q % f) + f) % f;
      const a = hsh(w(i), w(j)), b = hsh(w(i + 1), w(j)), cc = hsh(w(i), w(j + 1)), d = hsh(w(i + 1), w(j + 1)), su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      return a + (b - a) * su + (cc - a) * sv + (a - b - cc + d) * su * sv; };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = i / n, v = j / n;
      let t = 0.5 * vn(u, v, 4) + 0.3 * vn(u, v, 16) + 0.2 * vn(u, v, 64);
      if (hsh(i, j) > 0.985) t -= 0.35; else if (hsh(j, i) > 0.99) t += 0.25;   // graviers
      const g = Math.max(0, Math.min(255, t * 255)); img.data.set([g, g, g, 255], (j * n + i) * 4);
    }
    x.putImageData(img, 0, 0);
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8; return tx;
  })();
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.detail = { value: detail };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detail; varying vec3 vW;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat dd = texture2D(detail, vW.xz * 0.45).r * 0.55 + texture2D(detail, vW.xz * 0.06).r * 0.45;\nfloat fadeD = 1.0 - smoothstep(60.0, 400.0, length(vW - cameraPosition));\ndiffuseColor.rgb *= mix(1.0, mix(0.62, 1.32, dd), fadeD);');
  };
  scene.add(new THREE.Mesh(grid(0), groundMat));

  // Rochers le long du trajet : plus nombreux là où l'IA classe le terrain « roche rugueuse »
  (function () {
    const geo = new THREE.IcosahedronGeometry(1, 0), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) * (0.8 + Math.random() * 0.5), pa.getY(i) * (0.45 + Math.random() * 0.35), pa.getZ(i) * (0.8 + Math.random() * 0.5));
    geo.computeVertexNormals();
    const N = 6000, mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    let n = 0, guard = 0;
    while (n < N && guard++ < N * 8) {
      const d = Math.random() * PLAN.safe.dist, a = M.along(PLAN.safePts, d), r = (Math.random() - 0.5) * 140, ang = Math.random() * Math.PI * 2;
      const x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
      if (x < 0 || y < 0 || x >= W || y >= HH) continue;
      const c = M.cls[M.cellOf(x, y)], pr = c === 2 ? 1 : c === 4 ? 0.7 : c === 1 ? 0.04 : 0.3;
      if (Math.random() > pr) continue;
      if (Math.hypot(x - a.x, y - a.y) < 1.2) continue;                 // le tracé reste dégagé
      const s0 = Math.pow(Math.random(), 3) * (c === 2 ? 1.1 : 0.6) + 0.06;
      ps.set(wx(x), wy(M.elevAt(x, y)) + s0 * 0.15, wz(y)); e.set(Math.random(), Math.random() * 6, Math.random()); q.setFromEuler(e); sc.set(s0, s0, s0);
      mesh.setMatrixAt(n, m4.compose(ps, q, sc));
      const t = 0.75 + Math.random() * 0.35; mesh.setColorAt(n, col.setRGB(0.55 * t, 0.37 * t, 0.26 * t)); n++;
    }
    mesh.count = n; scene.add(mesh);
  })();
  // Au-delà de la zone : vrai relief du cratère Gale (MOLA, ≈ 240 km), pour voir le mont Sharp à l'horizon
  (function () {
    const A = window.ARES_ASSETS || {};
    if (!A.gale) return;
    const meta = A.galeMeta, im = new Image();
    im.onload = () => {
      const n = im.width, c = document.createElement('canvas'); c.width = c.height = n;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = x.getImageData(0, 0, n, n).data;
      const kx = M.Z.mPerDegLon, ky = M.Z.mPerDegLat, lonC = (M.LON0 + M.LON1) / 2, latC = (M.LAT0 + M.LAT1) / 2;
      const g = new THREE.BufferGeometry(), pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const lon = meta.lon[0] + (meta.lon[1] - meta.lon[0]) * i / (n - 1), lat = meta.lat[0] + (meta.lat[1] - meta.lat[0]) * j / (n - 1);
        const X = (lon - lonC) * kx, Zz = (latC - lat) * ky, e = -8200 + 115.4 * px[(j * n + i) * 4];
        const near = Math.max(0, 1 - Math.max(Math.abs(X) / 3500, Math.abs(Zz) / 2700));          // s'efface sous la zone détaillée
        const k = j * n + i; pos.set([X, wy(e) - 40 - 120 * near, Zz], k * 3);
        const t = Math.min(1, Math.max(0, (e + 4800) / 6000)); col.set([0.55 + 0.25 * t, 0.36 + 0.18 * t, 0.25 + 0.12 * t], k * 3);
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })));
    };
    im.src = A.gale;
  })();
  scene.fog.far = 60000; scene.fog.near = 2500;

  // Couche « vision IA » : dangers détectés, drapés sur le terrain
  const hzCanvas = document.createElement('canvas'); hzCanvas.width = NX; hzCanvas.height = NY;
  (function () {
    const x = hzCanvas.getContext('2d'), img = x.createImageData(NX, NY), col = { 1: [255, 216, 74], 2: [255, 154, 46], 4: [255, 68, 51] };
    for (let k = 0; k < NX * NY; k++) { const c = col[M.cls[k]]; if (c) img.data.set([c[0], c[1], c[2], Math.round(90 + 120 * M.conf[k])], k * 4); }
    x.putImageData(img, 0, 0);
  })();
  const hzTex = new THREE.CanvasTexture(hzCanvas); hzTex.magFilter = THREE.NearestFilter;
  const hzMesh = new THREE.Mesh(grid(0.35), new THREE.MeshBasicMaterial({ map: hzTex, transparent: true, opacity: 0.42, depthWrite: false }));
  scene.add(hzMesh);

  // Trajet en réalité augmentée : ruban lumineux posé au sol
  const step = 6, path = [];
  for (let d = 0; d <= PLAN.safe.dist; d += step) { const a = M.along(PLAN.safePts, d); path.push({ x: a.x, y: a.y, d }); }
  const ribbon = (function () {
    const g = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
    path.forEach((p, i) => {
      const q = path[Math.min(path.length - 1, i + 1)], o = path[Math.max(0, i - 1)];
      let dx = q.x - o.x, dy = q.y - o.y; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      const h = wy(M.elevAt(p.x, p.y)) + 0.35, w = 0.45;
      pos.push(wx(p.x - dy * w), h, wz(p.y + dx * w), wx(p.x + dy * w), h, wz(p.y - dx * w));
      uv.push(0, p.d, 1, p.d);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uD: { value: 0 }, uT: { value: 0 } },
      vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uD; uniform float uT; varying vec2 v; void main(){ if (v.y < uD - 2.0) discard; float edge = smoothstep(0.0,0.25,v.x) * smoothstep(1.0,0.75,v.x); float chev = 0.55 + 0.45 * step(0.5, fract((v.y - uT) / 8.0)); float fade = (1.0 - smoothstep(250.0, 700.0, v.y - uD)) * smoothstep(2.0, 14.0, v.y - uD); gl_FragColor = vec4(0.62,0.95,1.0,1.0) * edge * chev * fade * 0.75; }'
    }));
  })();
  scene.add(ribbon);

  // Balises des arrêts
  const beacons = STOPS.map((s, i) => {
    const [x, y] = M.toXY(s.lon, s.lat), h = wy(M.elevAt(x, y));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 8, 1, true), new THREE.MeshBasicMaterial({ color: i ? 0x9ff3ff : 0xff5a1f, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(wx(x), h + 30, wz(y)); scene.add(m);
    return { s, i, x, y, h, m };
  });

  // Poussière en suspension
  const dust = (function () {
    const n = 600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([(Math.random() - 0.5) * 120, Math.random() * 30, (Math.random() - 0.5) * 120], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8c39e, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(pts); return pts;
  })();

  // ---------- Simulation de la sortie ----------
  const phases = []; let T = 0;
  PLAN.legs.forEach((leg, i) => {
    const dur = leg.safeM.dist / 1000 / H.speedKmh * 60;
    phases.push({ type: 'walk', t0: T, t1: T + dur, d0: PLAN.stopAt[i], d1: PLAN.stopAt[i + 1], to: (i + 1) % STOPS.length }); T += dur;
    if (i < PLAN.legs.length - 1) { phases.push({ type: 'stop', t0: T, t1: T + H.stopMin, at: i + 1, d: PLAN.stopAt[i + 1] }); T += H.stopMin; }
  });
  const TOTAL = T;
  const sim = { t: 0, speed: 30, playing: true, o2: 1, en: 1, dose: 0, yaw: 0, look: 0, pitch: 0, lastPh: null };
  // ?t=minutes : démarrer la simulation plus loin (démonstration)
  { const t0 = +new URLSearchParams(location.search).get('t'); if (t0 > 0) { sim.t = Math.min(TOTAL - 1, t0); sim.o2 = 1 - sim.t / H.budgetMin; sim.en = 1 - sim.t * 0.0035; sim.dose = sim.t * 0.444; } }
  function state() {
    const ph = phases.find((p) => sim.t < p.t1) || phases[phases.length - 1];
    const d = ph.type === 'walk' ? ph.d0 + (ph.d1 - ph.d0) * clamp((sim.t - ph.t0) / (ph.t1 - ph.t0), 0, 1) : ph.d;
    return { ph, d, done: sim.t >= TOTAL };
  }

  // ---------- Vision IA : balayage du cône devant l'astronaute ----------
  const arBox = $('#ar');
  let detections = [];
  function scan(px, py, yaw) {
    const found = {};
    for (let r = 12; r <= 160; r += 8) for (let a = -45; a <= 45; a += 7.5) {
      const ang = yaw + a * Math.PI / 180, x = px + Math.sin(ang) * r, y = py - Math.cos(ang) * r;
      if (x < 0 || y < 0 || x >= W || y >= HH) continue;
      const k = M.cellOf(x, y), c = M.cls[k];
      if (!HZ[c] || M.conf[k] < 0.55) continue;
      if (!found[c] || found[c].r > r) found[c] = { c, r, x, y, k, conf: M.conf[k], slope: M.slope[k], a };
    }
    detections = Object.values(found).sort((a, b) => a.r - b.r);
  }

  // ---------- Copilote IA ----------
  const aiEl = $('#ai'); let typing = 0, lastMsg = '', lastHz = {}, said = {};
  function say(text, force) {
    if (!force && text === lastMsg) return;
    lastMsg = text; cancelAnimationFrame(typing);
    let i = 0; const run = () => { i = Math.min(text.length, i + 2); aiEl.textContent = text.slice(0, i); if (i < text.length) typing = requestAnimationFrame(run); };
    run();
  }
  const sideOf = (a) => (a < -12 ? ' sur votre gauche' : a > 12 ? ' sur votre droite' : ' droit devant');
  function copilot(st) {
    const ph = st.ph;
    if (!said.start) { said.start = 1; say('Bonjour. Sortie de ' + Math.floor(TOTAL / 60) + ' h ' + pad(Math.round(TOTAL % 60)) + ', ' + (STOPS.length - 1) + ' arrêts. Je surveille le terrain, votre oxygène et votre énergie.'); return; }
    if (st.done) { if (!said.end) { said.end = 1; say('Retour à l’habitat. Sortie terminée à ' + clock(TOTAL) + ', marge de ' + nf(H.budgetMin - TOTAL) + ' min. Bon travail.'); } return; }
    if (ph !== sim.lastPh) {
      sim.lastPh = ph;
      if (ph.type === 'stop') { const s = STOPS[ph.at]; say('Arrêt ' + ph.at + ' : ' + s.name + '. ' + (s.tasks ? s.tasks.join('. ') + '.' : '') + ' ' + H.stopMin + ' min prévues.'); return; }
      if (ph.d0 > 0) { say('Reprise du trajet vers ' + (ph.to ? 'l’arrêt ' + ph.to + ' · ' + STOPS[ph.to].name : 'l’habitat') + '. Suivez le ruban.'); return; }
    }
    if (ph.type === 'walk') {
      const left = ph.d1 - st.d;
      if (left < 120 && !said['near' + ph.to]) { said['near' + ph.to] = 1; say((ph.to ? 'Arrêt ' + ph.to : 'Habitat') + ' dans ' + nf(Math.round(left / 10) * 10) + ' m.' + (ph.to && STOPS[ph.to].tools ? ' Préparez : ' + STOPS[ph.to].tools.join(', ').toLowerCase() + '.' : '')); return; }
    }
    const d0 = detections[0];
    if (d0 && d0.r < 70 && (!lastHz[d0.c] || sim.t - lastHz[d0.c] > 6)) {
      lastHz[d0.c] = sim.t;
      say(HZ[d0.c] + ' détecté' + (d0.c === 4 ? 'e' : 's') + ' à ' + nf(Math.round(d0.r / 5) * 5) + ' m' + sideOf(d0.a) + ' (confiance ' + nf(d0.conf * 100) + ' %). ' + (d0.c === 4 ? 'Le tracé l’évite, restez dessus.' : d0.c === 1 ? 'Sable meuble : ne quittez pas le ruban.' : 'Terrain rocheux : regardez où vous posez les pieds.'));
      return;
    }
    if (sim.o2 < 0.35 && !said.o2) { said.o2 = 1; say('Oxygène sous 35 %. Retour impératif avant ' + clock(H.budgetMin) + '.'); }
  }
  function answer(q) {
    const st = state(), a = M.along(PLAN.safePts, st.d), info = M.pointInfo(...M.toLL(a.x, a.y));
    if (q === 'danger') {
      const d = detections[0];
      say(d ? 'Devant vous : ' + detections.map((x) => HZ[x.c].toLowerCase() + ' à ' + nf(Math.round(x.r)) + ' m' + sideOf(x.a)).join(', ') + '. Le tracé contourne ces zones.' : 'Rien de dangereux dans les 160 m devant vous. Terrain : ' + info.className + '.', true);
    } else if (q === 'o2') {
      say('Oxygène ' + nf(sim.o2 * 100) + ' %, énergie ' + nf(sim.en * 100) + ' %. Retour prévu ' + clock(TOTAL) + ', limite ' + clock(H.budgetMin) + ' : marge ' + nf(H.budgetMin - TOTAL) + ' min.', true);
    } else {
      const ll = M.toLL(a.x, a.y);
      say('Vous êtes à ' + nf(Math.abs(ll[1]), 4) + '° S, ' + nf(ll[0], 4) + '° E, altitude ' + nf(info.elev) + ' m, sur ' + info.className + ' (' + M.unitAt(a.x, a.y) + '). ' + nf(st.d / 1000, 1) + ' km parcourus sur ' + nf(PLAN.safe.dist / 1000, 1) + '. Position estimée par odométrie et repérage visuel : pas de GPS sur Mars.', true);
    }
  }

  // ---------- HUD ----------
  const tape = $('#tape'), PX = 4.2;
  const marks = [];
  for (let d = 0; d < 360; d += 15) { const s = document.createElement('span'); const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }[d]; s.innerHTML = '<b>' + (lbl || (d % 30 === 0 ? d : '')) + '</b>'; tape.appendChild(s); marks.push({ s, d }); }
  const wpt = document.createElement('span'); wpt.className = 'wpt'; tape.appendChild(wpt);
  const radar = $('#radar').getContext('2d');
  const tags = STOPS.map((s, i) => { const el = document.createElement('div'); el.className = 'tag wp'; el.innerHTML = '<b>' + (i ? i + ' · ' : '') + s.name + '</b><small></small><i></i>'; arBox.appendChild(el); return el; });
  const hzTags = [0, 1, 2].map(() => { const el = document.createElement('div'); el.className = 'tag hz'; el.innerHTML = '<div class="box"></div><span></span>'; arBox.appendChild(el); return el; });
  const v3 = new THREE.Vector3();
  function project(x, y, h) {
    v3.set(wx(x), h, wz(y)).project(cam);
    return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, ok: v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 };
  }
  function bearing(ax, ay, bx, by) { return (Math.atan2(bx - ax, -(by - ay)) * 180 / Math.PI + 360) % 360; }

  function hud(st, px, py, hdg, slope) {
    // Boussole
    marks.forEach(({ s, d }) => { const dl = ((d - hdg + 540) % 360) - 180; s.style.left = (dl * PX) + 'px'; s.style.display = Math.abs(dl) > 70 ? 'none' : ''; });
    const ph = st.ph, target = STOPS[ph.type === 'walk' ? ph.to : ph.at] || STOPS[0];
    const [tx, ty] = M.toXY(target.lon, target.lat), bw = bearing(px, py, tx, ty), dw = ((bw - hdg + 540) % 360) - 180;
    wpt.style.left = clamp(dw, -70, 70) * PX + 'px';
    $('#hdg').textContent = pad(Math.round(hdg) % 360).padStart(3, '0') + '°';
    // Prochain point
    if (st.done) { $('#nextLbl').textContent = 'Sortie terminée'; $('#nextDist').textContent = 'Habitat'; $('#nextEta').textContent = clock(TOTAL); }
    else if (ph.type === 'walk') {
      const left = ph.d1 - st.d;
      $('#nextLbl').textContent = (ph.to ? 'Arrêt ' + ph.to + ' · ' : 'Retour · ') + target.name;
      $('#nextDist').textContent = left >= 1000 ? nf(left / 1000, 1) + ' km' : nf(Math.round(left / 10) * 10) + ' m';
      $('#nextEta').textContent = 'arrivée ' + clock(ph.t1) + ' · cap ' + pad(Math.round(bw)).padStart(3, '0') + '°';
    } else { $('#nextLbl').textContent = 'Arrêt ' + ph.at + ' · mesures'; $('#nextDist').textContent = nf(Math.ceil(ph.t1 - sim.t)) + ' min'; $('#nextEta').textContent = 'départ ' + clock(ph.t1); }
    // Ressources
    const o2c = sim.o2 > 0.4 ? '#4ade80' : sim.o2 > 0.2 ? '#ff9a2e' : '#ff4433';
    $('#o2Arc').style.strokeDasharray = (sim.o2 * 100).toFixed(1) + ' 100'; $('#o2Arc').style.stroke = o2c;
    $('#o2').textContent = nf(sim.o2 * 100) + ' %'; $('#o2t').textContent = 'retour ≤ ' + clock(H.budgetMin);
    $('#enArc').style.strokeDasharray = (sim.en * 100).toFixed(1) + ' 100';
    $('#en').textContent = nf(sim.en * 100) + ' %'; $('#ent').textContent = '≈ ' + nf(sim.en / 0.0045 / 60, 1) + ' h restantes';
    const hr = Math.round(86 + slope * 2.4 + (st.ph.type === 'walk' ? 14 : 0) + Math.sin(sim.t * 3) * 3);
    $('#vitals').innerHTML = '<li>Cœur <b>' + hr + '</b> bpm</li><li>CO₂ <b>' + nf(0.3 + slope * 0.01, 2) + '</b> kPa</li><li>Combinaison <b>29,6</b> kPa</li><li>Pente <b>' + nf(slope) + '°</b></li>';
    const air = -78 + 65 * clamp(sim.t / 260, 0, 1);
    $('#env').innerHTML = '<li><b>' + nf(air) + ' °C</b> air · REMS</li><li><b>7,9 hPa</b> · REMS</li><li><b>' + nf(sim.dose, 1) + ' µSv</b> reçus · RAD</li><li>Vent <b>' + nf(4 + Math.sin(sim.t / 9) * 2) + ' m/s</b> · MEDA</li>';
    // Alerte : danger proche du tracé ou ressources
    let al = null;
    if (!st.done && ph.type === 'walk') for (let dd = 5; dd <= 50 && !al; dd += 5) {
      const q = M.along(PLAN.safePts, st.d + dd), k = M.cellOf(q.x, q.y);
      if (M.cls[k] === 4 || M.slope[k] > 15) al = ['bad', 'Pente ' + nf(M.slope[k]) + '° dans ' + dd + ' m · ralentissez'];
      else if (M.cls[k] === 1) al = ['warn', 'Sable dans ' + dd + ' m · restez sur le tracé'];
    }
    if (!al && sim.o2 < 0.25) al = ['bad', 'Oxygène bas · retour immédiat'];
    const ab = $('#alert'); ab.hidden = !al; if (al) { ab.className = 'alert' + (al[0] === 'warn' ? ' warn' : ''); ab.textContent = al[1]; }
    $('#clock').textContent = clock(sim.t);
    $('#scanN').textContent = detections.length;
    // Radar (300 m, nord en haut tourné selon le cap)
    const R = 110, S = R / 300;
    radar.clearRect(0, 0, 220, 220); radar.save(); radar.translate(R, R); radar.rotate(-hdg * Math.PI / 180);
    for (let j = -15; j <= 15; j++) for (let i = -15; i <= 15; i++) {
      const x = px + i * 20, y = py + j * 20; if (x < 0 || y < 0 || x >= W || y >= HH || i * i + j * j > 225) continue;
      const c = M.cls[M.cellOf(x, y)]; if (!HZ[c]) continue;
      radar.fillStyle = c === 1 ? 'rgba(255,216,74,.55)' : c === 2 ? 'rgba(255,154,46,.45)' : 'rgba(255,68,51,.7)';
      radar.fillRect(i * 20 * S - 3, j * 20 * S - 3, 6, 6);
    }
    radar.strokeStyle = 'rgba(159,243,255,.9)'; radar.lineWidth = 2; radar.beginPath();
    let first = true; for (const p of path) { if (p.d < st.d) continue; const dx = (p.x - px) * S, dy = (p.y - py) * S; if (dx * dx + dy * dy > R * R) break; if (first) { radar.moveTo(dx, dy); first = false; } else radar.lineTo(dx, dy); }
    radar.stroke();
    beacons.forEach((b) => { const dx = (b.x - px) * S, dy = (b.y - py) * S; if (dx * dx + dy * dy < R * R) { radar.fillStyle = b.i ? '#9ff3ff' : '#ff5a1f'; radar.fillRect(dx - 4, dy - 4, 8, 8); } });
    radar.restore();
    radar.fillStyle = '#fff'; radar.beginPath(); radar.moveTo(R, R - 9); radar.lineTo(R + 6, R + 6); radar.lineTo(R, R + 2); radar.lineTo(R - 6, R + 6); radar.closePath(); radar.fill();
    radar.strokeStyle = 'rgba(159,243,255,.25)'; radar.beginPath(); radar.arc(R, R, R / 2, 0, 7); radar.stroke();
  }
  function arTags(px, py, target) {
    beacons.forEach((b, i) => {
      const p = project(b.x, b.y, b.h + 8), el = tags[i], dist = Math.hypot(b.x - px, b.y - py);
      el.style.opacity = p.ok && dist > 15 && i === target ? 1 : 0;
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      el.querySelector('small').textContent = ' ' + (dist >= 1000 ? nf(dist / 1000, 1) + ' km' : nf(Math.round(dist / 10) * 10) + ' m');
    });
    hzTags.forEach((el, i) => {
      const d = detections[i]; if (!d) { el.style.opacity = 0; return; }
      const p = project(d.x, d.y, wy(M.elevAt(d.x, d.y)) + 1);
      el.style.opacity = p.ok ? 1 : 0; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      el.className = 'tag hz c' + d.c; el.style.setProperty('--s', Math.round(clamp(2600 / d.r, 26, 120)) + 'px');
      el.querySelector('span').textContent = HZ[d.c] + ' · ' + nf(d.r) + ' m · ' + nf(d.conf * 100) + ' %';
    });
  }

  // ---------- Regard à la souris ----------
  const look = { on: false, x: 0, y: 0 };
  canvas.addEventListener('pointerdown', (e) => { look.on = true; look.x = e.clientX; look.y = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!look.on) return; sim.look -= (e.clientX - look.x) * 0.004; sim.pitch = clamp(sim.pitch - (e.clientY - look.y) * 0.003, -0.6, 0.5); look.x = e.clientX; look.y = e.clientY; });
  canvas.addEventListener('pointerup', () => { look.on = false; });
  // Les éléments au-dessus du canvas laissent passer le glisser
  $('.visor').style.pointerEvents = 'none';

  // ---------- Commandes ----------
  $('#play').onclick = () => { if (sim.t >= TOTAL) { sim.t = 0; sim.o2 = 1; sim.en = 1; sim.dose = 0; said = {}; sim.lastPh = null; } sim.playing = !sim.playing; $('#play').textContent = sim.playing ? '❚❚' : '▶'; };
  document.querySelectorAll('.speed button').forEach((b) => (b.onclick = () => { sim.speed = +b.dataset.x; document.querySelectorAll('.speed button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const vision = () => { const on = !hzMesh.visible; hzMesh.visible = on; $('#vision').classList.toggle('on', on); document.body.classList.toggle('vision-off', !on); };
  $('#vision').onclick = vision;
  document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => answer(b.dataset.q)));
  addEventListener('keydown', (e) => { if (e.key === ' ') { $('#play').click(); e.preventDefault(); } if (e.key.toLowerCase() === 'v') vision(); });
  const size = () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  size(); addEventListener('resize', size);

  // ---------- Boucle ----------
  let last = performance.now(), yawS = null, lastScan = 0, lastHud = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (sim.playing && sim.t < TOTAL) {
      const dm = dt * sim.speed / 60;                                   // minutes simulées
      const st0 = state(), a0 = M.along(PLAN.safePts, st0.d), s0 = M.slope[M.cellOf(a0.x, a0.y)];
      sim.t = Math.min(TOTAL, sim.t + dm);
      sim.o2 = Math.max(0, sim.o2 - dm / H.budgetMin * (0.92 + 0.012 * s0 + (st0.ph.type === 'walk' ? 0.05 : -0.08)));
      sim.en = Math.max(0, sim.en - dm * (0.0028 + (st0.ph.type === 'walk' ? 0.0012 + s0 * 0.00008 : 0)));
      sim.dose += dm * 0.444;                                            // ≈ 0,64 mSv/jour (Curiosity RAD)
    }
    const st = state(), a = M.along(PLAN.safePts, st.d), ahead = M.along(PLAN.safePts, st.d + 25);
    const px = a.x, py = a.y, slope = M.slope[M.cellOf(px, py)];
    const yawPath = Math.atan2(ahead.x - px, -(ahead.y - py));
    if (yawS === null) yawS = yawPath;
    let dy = yawPath - yawS; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yawS += dy * Math.min(1, dt * 2.5);
    if (st.ph.type === 'stop' && !look.on) sim.look = Math.sin(now / 2600) * 0.9;               // regarde autour pendant les mesures
    else if (!look.on) sim.look *= 1 - Math.min(1, dt * 0.8);
    if (!look.on) sim.pitch *= 1 - Math.min(1, dt * 0.6);
    const yaw = yawS + sim.look, bob = st.ph.type === 'walk' && sim.playing ? Math.sin(now / 260) * 0.04 : 0;
    const eye = wy(M.elevAt(px, py)) + 1.75 + bob;
    cam.position.set(wx(px), eye, wz(py));
    cam.lookAt(wx(px + Math.sin(yaw) * 40), eye - 4 + sim.pitch * 40, wz(py - Math.cos(yaw) * 40));
    ribbon.material.uniforms.uD.value = st.d; ribbon.material.uniforms.uT.value = now / 120;
    dust.position.set(cam.position.x, eye - 10, cam.position.z); dust.rotation.y += dt * 0.05;
    if (now - lastScan > 250) { lastScan = now; scan(px, py, yaw); copilot(st); }
    arTags(px, py, st.done ? -1 : st.ph.type === 'walk' ? st.ph.to : st.ph.at);
    if (now - lastHud > 90) { lastHud = now; hud(st, px, py, (yaw * 180 / Math.PI + 360) % 360, slope); }
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
})();
