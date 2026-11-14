(function () {
  'use strict';
  const D = window.MARS;
  const DEG = Math.PI / 180;
  const $ = (id) => document.getElementById(id);

  // ---------- Géométrie sphérique ----------
  // Convention alignée sur la texture équirectangulaire (u=0 à 180°O, u=1 à 180°E).
  function toVec(lat, lon, r) {
    const phi = (lon + 180) * DEG, c = Math.cos(lat * DEG);
    return new THREE.Vector3(-Math.cos(phi) * c, Math.sin(lat * DEG), Math.sin(phi) * c).multiplyScalar(r || 1);
  }
  function toLatLon(v) {
    const n = v.clone().normalize();
    const lat = Math.asin(n.y) / DEG;
    let lon = Math.atan2(n.z, -n.x) / DEG - 180;
    if (lon < -180) lon += 360;
    return { lat, lon };
  }
  const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
  function slerp(a, b, t) {
    const w = angle(a, b);
    if (w < 1e-6) return a.clone();
    const s = Math.sin(w);
    return a.clone().multiplyScalar(Math.sin((1 - t) * w) / s).add(b.clone().multiplyScalar(Math.sin(t * w) / s)).normalize();
  }
  const fmtLatLon = (p) => Math.abs(p.lat).toFixed(1) + '°' + (p.lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(p.lon).toFixed(1) + '°' + (p.lon >= 0 ? 'E' : 'O');

  // ---------- Scène ----------
  const canvas = $('globe');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.copy(toVec(15, -150, 3.4));
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 1.25; controls.maxDistance = 6; controls.rotateSpeed = 0.5;

  scene.add(new THREE.AmbientLight(0xffe6d8, 0.45));
  const sun = new THREE.DirectionalLight(0xfff1e0, 1.25);
  scene.add(sun);

  // Étoiles
  (function () {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8 })));
  })();

  // ---------- Texture de Mars ----------
  // Secours hors-ligne : texture procédurale (bruit) avec quelques grandes régions réelles.
  function proceduralMars() {
    const W = 1024, H = 512;
    const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const sm = (t) => t * t * (3 - 2 * t);
    function noise(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
               l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
    }
    const fbm = (x, y, z) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * noise(x * f, y * f, z * f); a *= 0.5; f *= 2.1; } return s; };
    const blob = (lat, lon, la, lo, r) => { let d = lon - lo; if (d > 180) d -= 360; if (d < -180) d += 360; const dd = ((lat - la) ** 2 + (d * Math.cos(lat * DEG)) ** 2) / (r * r); return Math.exp(-dd); };
    const col = document.createElement('canvas'), bmp = document.createElement('canvas');
    col.width = bmp.width = W; col.height = bmp.height = H;
    const c1 = col.getContext('2d'), c2 = bmp.getContext('2d');
    const i1 = c1.createImageData(W, H), i2 = c2.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const lat = 90 - (y + 0.5) / H * 180;
      for (let x = 0; x < W; x++) {
        const lon = (x + 0.5) / W * 360 - 180, p = toVec(lat, lon, 1);
        const n = fbm(p.x * 3 + 7, p.y * 3 + 3, p.z * 3 + 11), fine = fbm(p.x * 14, p.y * 14, p.z * 14);
        let dark = Math.max(0, (n - 0.5) * 3.2);
        dark += 0.8 * blob(lat, lon, 8, 69, 12) + 0.6 * blob(lat, lon, -25, -40, 20) + 0.5 * blob(lat, lon, 45, -30, 22) + 0.5 * blob(lat, lon, -5, 120, 25);
        dark += 0.9 * blob(lat * 3, lon, -13 * 3, -65, 22);            // Valles Marineris
        dark -= 0.7 * blob(lat, lon, 5, -115, 28) + 0.6 * blob(lat, lon, -42, 70, 16); // Tharsis, Hellas
        dark = Math.min(1, Math.max(0, dark));
        let r = 205 - 95 * dark + 30 * (fine - 0.5), g = 118 - 62 * dark + 22 * (fine - 0.5), b = 72 - 38 * dark + 14 * (fine - 0.5);
        const cap = Math.max(0, Math.min(1, (Math.abs(lat) - (lat > 0 ? 78 : 82) + 8 * (fine - 0.5)) / 4));
        r += (245 - r) * cap; g += (240 - g) * cap; b += (235 - b) * cap;
        const k = (y * W + x) * 4;
        i1.data[k] = r; i1.data[k + 1] = g; i1.data[k + 2] = b; i1.data[k + 3] = 255;
        const hgt = 255 * Math.min(1, Math.max(0, 0.5 + (fine - 0.5) * 0.9 - dark * 0.15));
        i2.data[k] = i2.data[k + 1] = i2.data[k + 2] = hgt; i2.data[k + 3] = 255;
      }
    }
    c1.putImageData(i1, 0, 0); c2.putImageData(i2, 0, 0);
    return { map: new THREE.CanvasTexture(col), bump: new THREE.CanvasTexture(bmp) };
  }

  // En ligne : mosaïque couleur Viking (NASA Mars Trek), assemblée depuis les tuiles WMTS.
  function loadNasaMosaic() {
    const base = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/';
    const z = 2, cols = 8, rows = 4, T = 256;
    const cv = document.createElement('canvas'); cv.width = cols * T; cv.height = rows * T;
    const ctx = cv.getContext('2d'), jobs = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) jobs.push(new Promise((ok, ko) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { ctx.drawImage(im, c * T, r * T, T, T); ok(); };
      im.onerror = ko; im.src = base + z + '/' + r + '/' + c + '.jpg';
    }));
    const timeout = new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), 7000));
    return Promise.race([Promise.all(jobs), timeout]).then(() => { ctx.getImageData(0, 0, 1, 1); return new THREE.CanvasTexture(cv); });
  }

  const tex = proceduralMars();
  tex.map.encoding = THREE.sRGBEncoding;
  const marsMat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 0.012, roughness: 0.95, metalness: 0 });
  const mars = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), marsMat);
  scene.add(mars);
  $('texSrc').textContent = 'Texture : procédurale (hors-ligne)';
  loadNasaMosaic().then((t) => {
    t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    marsMat.map = t; marsMat.bumpScale = 0.006; marsMat.needsUpdate = true;
    $('texSrc').textContent = 'Texture : mosaïque Viking MDIM 2.1 — NASA Mars Trek';
  }).catch(() => {});

  // Atmosphère
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 n; void main(){ float i = pow(0.72 - dot(n, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(1.0,0.5,0.28,1.0) * i; }'
  })));

  // ---------- Couches ----------
  const layers = { sites: new THREE.Group(), relief: new THREE.Group(), storm: new THREE.Group(), ice: new THREE.Group(), labels: new THREE.Group() };
  Object.values(layers).forEach((g) => scene.add(g));

  // Calotte sphérique posée sur la surface (anneaux concentriques pour épouser la courbure).
  function capMesh(lat, lon, rKm, color, opacity) {
    const ang = rKm / D.RADIUS_KM, rings = 8, segs = 48, R = 1.004;
    const c = toVec(lat, lon, 1);
    const ref = Math.abs(c.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(c, ref).normalize(), e2 = new THREE.Vector3().crossVectors(c, e1);
    const pos = [c.x * R, c.y * R, c.z * R], idx = [];
    for (let i = 1; i <= rings; i++) {
      const a = ang * i / rings;
      for (let j = 0; j < segs; j++) {
        const t = j / segs * Math.PI * 2;
        const v = c.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a) * Math.cos(t)).addScaledVector(e2, Math.sin(a) * Math.sin(t)).multiplyScalar(R);
        pos.push(v.x, v.y, v.z);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + (j + 1) % segs);
    for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + (j + 1) % segs, c2 = a + segs, d = b + segs;
      idx.push(a, c2, b, b, c2, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
    const rim = [];
    for (let j = 0; j <= segs; j++) { const k = (1 + (rings - 1) * segs + j % segs) * 3; rim.push(new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]).multiplyScalar(1.001)); }
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
    return grp;
  }

  function label(text, color) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const c = cv.getContext('2d');
    c.font = '600 44px "Segoe UI", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,.9)'; c.shadowBlur = 10; c.fillStyle = color || '#fff'; c.fillText(text, 256, 48);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    s.scale.set(0.3, 0.056, 1);
    return s;
  }

  D.hazards.forEach((h) => layers[h.kind].add(capMesh(h.lat, h.lon, h.r, h.kind === 'relief' ? 0xff2a1a : 0xffa020, h.kind === 'relief' ? 0.5 : 0.34)));
  D.ice.forEach((i) => layers.ice.add(capMesh(i.lat, i.lon, i.r, 0x1e9bff, 0.45)));

  // Place un objet sur la surface, « debout » selon la normale locale.
  function standOn(obj, n, r) {
    obj.position.copy(n).multiplyScalar(r || 1);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  }
  D.sites.forEach((s) => {
    const n = toVec(s.lat, s.lon, 1);
    const m = MarsModels.make(s.type); m.scale.setScalar(s.type === 'habitat' ? 0.042 : 0.034); standOn(m, n, 1.001);
    layers.sites.add(m);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.09, 6),
      new THREE.MeshBasicMaterial({ color: s.type === 'habitat' ? 0x58e08a : 0xffd27a, transparent: true, opacity: 0.85 }));
    standOn(beam, n, 1.075); layers.sites.add(beam);
    const l = label(s.name, s.type === 'habitat' ? '#8dffb5' : '#ffe2a8'); l.position.copy(n).multiplyScalar(1.14); layers.labels.add(l);
  });
  [['Olympus Mons', 18.65, -133.8], ['Valles Marineris', -13, -66], ['Hellas Planitia', -42.4, 70.5]].forEach(([t, la, lo]) => {
    const l = label(t, '#ffb0a4'); l.scale.multiplyScalar(0.85); l.position.copy(toVec(la, lo, 1.05)); layers.labels.add(l);
  });

  document.querySelectorAll('[data-layer]').forEach((cb) => cb.addEventListener('change', () => { layers[cb.dataset.layer].visible = cb.checked; }));

  // ---------- Itinéraire ----------
  const hazardVecs = D.hazards.map((h) => ({ h, v: toVec(h.lat, h.lon, 1), ang: h.r / D.RADIUS_KM }));
  const iceVecs = D.ice.map((i) => ({ i, v: toVec(i.lat, i.lon, 1), ang: i.r / D.RADIUS_KM }));

  function sample(a, b, n) { const out = []; for (let i = 0; i <= n; i++) out.push(slerp(a, b, i / n)); return out; }
  function evaluate(pts) {
    let len = 0, risk = 0; const hits = new Map();
    for (let i = 0; i < pts.length; i++) {
      if (i) len += angle(pts[i - 1], pts[i]);
      let w = 0;
      for (const z of hazardVecs) if (angle(pts[i], z.v) < z.ang) { w = Math.max(w, z.h.w); hits.set(z.h.name, z.h.kind); }
      risk += w;
    }
    risk /= pts.length;
    return { pts, len, risk, hits, cost: len * (1 + 6 * risk) };
  }
  // Trajet direct (grand cercle), puis détours par un point de passage latéral ; on garde le moins coûteux.
  function plan(a, b) {
    const direct = evaluate(sample(a, b, 120));
    let best = direct;
    if (direct.risk > 0) {
      const axis = new THREE.Vector3().crossVectors(a, b).normalize();
      for (const f of [0.3, 0.5, 0.7]) for (const k of [0.12, 0.25, 0.4, 0.6, 0.85]) for (const s of [-1, 1]) {
        const w = slerp(a, b, f).addScaledVector(axis, s * k).normalize();
        const cand = evaluate(sample(a, w, 60).concat(sample(w, b, 60).slice(1)));
        if (cand.cost < best.cost) best = cand;
      }
    }
    return { direct, best };
  }

  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const traveller = MarsModels.rover(); traveller.scale.setScalar(0.04); traveller.visible = false; scene.add(traveller);
  let curve = null, simT = -1;
  const state = { start: null, end: null };

  function tube(pts, color, radius, opacity) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().multiplyScalar(1.012)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 240, radius, 6), new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
    routeGroup.add(m); return c;
  }
  function pin(p, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(p).multiplyScalar(1.014); routeGroup.add(m);
  }

  function computeRoute(fly) {
    if (!state.start || !state.end) return;
    const a = toVec(state.start.lat, state.start.lon, 1), b = toVec(state.end.lat, state.end.lon, 1);
    if (angle(a, b) < 1e-3) return;
    routeGroup.children.slice().forEach((o) => { routeGroup.remove(o); o.geometry.dispose(); o.material.dispose(); });
    const { direct, best } = plan(a, b);
    const detour = best !== direct;
    if (detour) tube(direct.pts, 0xff2a1a, 0.0026, 0.85);
    curve = tube(best.pts, best.risk > 0 ? 0xffb347 : 0x58e08a, 0.004, 1);
    pin(a, 0xffffff); pin(b, 0x58e08a);
    simT = -1; traveller.visible = false;

    const km = best.len * D.RADIUS_KM, speed = +$('speed').value, hours = +$('hours').value;
    $('rDist').textContent = Math.round(km).toLocaleString('fr-FR') + ' km';
    $('rSols').textContent = Math.ceil(km / (speed * hours)).toLocaleString('fr-FR');
    const pct = Math.round(best.risk * 100);
    $('rRisk').textContent = pct === 0 ? 'Faible' : pct < 15 ? 'Moyen' : 'Élevé';
    $('rRisk').style.color = pct === 0 ? 'var(--ok)' : pct < 15 ? 'var(--warn)' : 'var(--bad)';
    const notes = [];
    if (detour) {
      const extra = Math.round((best.len - direct.len) * D.RADIUS_KM);
      const avoided = [...direct.hits.keys()].filter((n) => !best.hits.has(n));
      notes.push(['ok', 'Détour de ' + extra.toLocaleString('fr-FR') + ' km pour éviter : ' + (avoided.join(', ') || 'zones à risque') + '. Le trajet direct est en rouge.']);
    } else if (direct.risk === 0) notes.push(['ok', 'Trajet direct sans zone dangereuse connue.']);
    best.hits.forEach((kind, name) => notes.push([kind === 'relief' ? 'bad' : 'warn', 'Traverse ' + name + (kind === 'relief' ? ' : relief extrême.' : ' : risque de poussière, panneaux solaires moins efficaces.')]));
    const ice = iceVecs.filter((z) => best.pts.some((p) => angle(p, z.v) < z.ang)).map((z) => z.i.name);
    notes.push(['ice', ice.length ? 'Ravitaillement en glace d\'eau possible : ' + ice.join(', ') + '.' : 'Aucun dépôt de glace sur le trajet : emporter toute l\'eau nécessaire.']);
    $('rNotes').innerHTML = notes.map(([c, t]) => '<p class="' + c + '">' + t + '</p>').join('');
    $('result').hidden = false;
    if (fly) flyTo(slerp(a, b, 0.5), Math.min(5, Math.max(2.4, 1.6 + best.len * 1.1)));
  }

  // ---------- Caméra ----------
  let flight = null;
  function flyTo(dir, dist) {
    flight = { from: camera.position.clone().normalize(), to: dir.clone().normalize(), d0: camera.position.length(), d1: dist || camera.position.length(), t: 0 };
  }

  // ---------- Fiche d'information et aperçu 3D ----------
  const pv = { renderer: new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true }), scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(32, 520 / 340, 0.1, 50), model: null };
  pv.renderer.outputEncoding = THREE.sRGBEncoding;
  pv.cam.position.set(3.6, 2.3, 3.6); pv.cam.lookAt(0, 0.5, 0);
  pv.scene.add(new THREE.AmbientLight(0xffe0cc, 0.3));
  const pl = new THREE.DirectionalLight(0xffffff, 0.75); pl.position.set(3, 5, 2); pv.scene.add(pl);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshStandardMaterial({ color: 0x5a2a18, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; pv.scene.add(ground);

  let current = null;
  function showSite(s, fly) {
    current = s;
    $('iTag').textContent = ({ rover: 'Rover', lander: 'Atterrisseur', habitat: 'Habitat' })[s.type] + ' · ' + s.agency + ' · ' + s.status;
    $('iName').textContent = s.name;
    $('iPlace').textContent = s.place + ' · ' + fmtLatLon(s) + (s.year !== '—' ? ' · ' + s.year : '');
    $('iText').textContent = s.text;
    if (pv.model) pv.scene.remove(pv.model);
    pv.model = MarsModels.make(s.type); pv.scene.add(pv.model);
    if (fly) flyTo(toVec(s.lat, s.lon, 1), Math.min(camera.position.length(), 2.6));
  }

  // ---------- Interface ----------
  const selStart = $('selStart'), selEnd = $('selEnd');
  function fillSelect(sel) {
    sel.innerHTML = D.sites.map((s) => '<option value="' + s.id + '">' + s.name + '</option>').join('') + '<option value="custom" hidden>Point choisi</option>';
  }
  fillSelect(selStart); fillSelect(selEnd);
  function setPoint(which, p) {
    state[which] = p;
    const sel = which === 'start' ? selStart : selEnd;
    if (p.id) sel.value = p.id;
    else { const o = sel.querySelector('[value=custom]'); o.hidden = false; o.textContent = fmtLatLon(p); sel.value = 'custom'; }
  }
  const siteById = (id) => D.sites.find((s) => s.id === id);
  selStart.addEventListener('change', () => { if (selStart.value !== 'custom') { setPoint('start', siteById(selStart.value)); computeRoute(true); } });
  selEnd.addEventListener('change', () => { if (selEnd.value !== 'custom') { setPoint('end', siteById(selEnd.value)); computeRoute(true); } });

  let pickMode = null;
  function setPick(mode) {
    pickMode = mode;
    $('pickStart').classList.toggle('on', mode === 'start'); $('pickEnd').classList.toggle('on', mode === 'end');
    canvas.classList.toggle('picking', !!mode);
    $('pickHint').textContent = mode ? 'Cliquez sur la planète pour placer ' + (mode === 'start' ? 'le départ.' : "l'arrivée.") : '';
  }
  $('pickStart').addEventListener('click', () => setPick(pickMode === 'start' ? null : 'start'));
  $('pickEnd').addEventListener('click', () => setPick(pickMode === 'end' ? null : 'end'));
  $('btnRoute').addEventListener('click', () => computeRoute(true));
  $('btnSim').addEventListener('click', () => { if (!curve) computeRoute(false); if (curve) { simT = 0; traveller.visible = true; } });
  $('speed').addEventListener('input', () => { $('speedVal').textContent = $('speed').value + ' km/h'; computeRoute(false); });
  $('hours').addEventListener('input', () => { $('hoursVal').textContent = $('hours').value + ' h/sol'; computeRoute(false); });
  $('iFrom').addEventListener('click', () => { if (current) { setPoint('start', current); computeRoute(true); } });
  $('iTo').addEventListener('click', () => { if (current) { setPoint('end', current); computeRoute(true); } });

  // Survol et clic sur le globe
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function hit(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const h = ray.intersectObject(mars)[0];
    return h ? h.point : null;
  }
  function nearestSite(v, maxDeg) {
    let best = null, bd = maxDeg * DEG;
    for (const s of D.sites) { const d = angle(v.clone().normalize(), toVec(s.lat, s.lon, 1)); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  canvas.addEventListener('pointermove', (ev) => {
    const p = hit(ev);
    $('coords').textContent = p ? fmtLatLon(toLatLon(p)) : 'Survolez la planète';
  });
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; flight = null; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    const p = hit(ev); if (!p) return;
    const site = layers.sites.visible ? nearestSite(p, pickMode ? 2 : 4) : null;
    if (pickMode) {
      setPoint(pickMode, site || Object.assign({ name: 'Point choisi' }, toLatLon(p)));
      setPick(null); computeRoute(false);
    } else if (site) showSite(site, true);
  });

  // ---------- Boucle ----------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.4);
      const e = flight.t * flight.t * (3 - 2 * flight.t);
      camera.position.copy(slerp(flight.from, flight.to, e)).multiplyScalar(flight.d0 + (flight.d1 - flight.d0) * e);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    // Le soleil suit la caméra avec un décalage : relief lisible sous tous les angles.
    sun.position.copy(camera.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7).add(new THREE.Vector3(0, 1.2, 0));
    if (simT >= 0 && curve) {
      simT += dt / 14; if (simT > 1) simT = 0;
      const p = curve.getPointAt(simT), up = p.clone().normalize();
      const fwd = curve.getTangentAt(simT); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
      traveller.position.copy(up);
      traveller.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, up, new THREE.Vector3().crossVectors(fwd, up)));
    }
    renderer.render(scene, camera);
    if (pv.model) pv.model.rotation.y += dt * 0.6;
    pv.renderer.render(pv.scene, pv.cam);
    requestAnimationFrame(frame);
  }

  // État initial : un trajet qui croise les volcans de Tharsis, pour montrer le détour.
  setPoint('start', siteById('spirit')); setPoint('end', siteById('viking1'));
  showSite(siteById('base'), false);
  computeRoute(true);
  window.__ares = { state, plan, toVec, flyTo };
  frame();
})();
