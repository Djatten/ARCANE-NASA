// Modèle de la zone de sortie, construit sur les données réelles de data/zone.js (MNT et imagerie HiRISE).
// Calcule pentes, itinéraire A*, bilan et autonomie. Tous les chiffres affichés viennent d'ici, jamais de l'IA.
(function (root) {
  'use strict';
  const Z = root.ARES_ZONE;
  if (!Z) { console.error('data/zone.js manquant : lancer tools/build_data.py'); return; }

  // Hypothèses de l'équipe (cahier des charges §2), pas des chiffres NASA.
  const HYP = { crew: 2, speedKmh: 2, maxSlope: 20, budgetMin: 240, stopMin: 15, departMin: 9 * 60, sandCost: 4 };

  const [LON0, LAT0, LON1, LAT1] = Z.bounds;
  const NX = Z.nx, NY = Z.ny, C = Z.cell, N = NX * NY;
  const W = NX * C, H = NY * C;
  const kx = W / (LON1 - LON0), ky = H / (LAT1 - LAT0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const elevRaw = new Int16Array(b64(Z.elev).buffer);
  const elev = new Float32Array(N);
  for (let i = 0; i < N; i++) elev[i] = elevRaw[i] / 2;
  const sandBits = b64(Z.sand), sand = new Uint8Array(N);
  for (let i = 0; i < N; i++) sand[i] = (sandBits[i >> 3] >> (7 - (i & 7))) & 1;
  const slope = new Float32Array(N);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NY - 1, j + 1);
    const gx = (elev[j * NX + i1] - elev[j * NX + i0]) / ((i1 - i0) * C);
    const gy = (elev[j1 * NX + i] - elev[j0 * NX + i]) / ((j1 - j0) * C);
    slope[j * NX + i] = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
  }
  let eMin = Infinity, eMax = -Infinity;
  for (const e of elev) { if (e < eMin) eMin = e; if (e > eMax) eMax = e; }
  // Classes du modèle de terrain (k-moyennes, voir tools/build_data.py) et confiance 0..1.
  const CLASSES = Z.classes || ['sol compact', 'sable', 'roche rugueuse', 'affleurement clair', 'pente raide'];
  const cls = Z.cls ? b64(Z.cls) : new Uint8Array(N);
  const confRaw = Z.conf ? b64(Z.conf) : new Uint8Array(N).fill(255);
  const conf = new Float32Array(N);
  for (let i = 0; i < N; i++) conf[i] = confRaw[i] / 255;
  // Coût de marche par classe : sable ×4, roche rugueuse ×1,8, pente raide ×2,5 (au-delà de 20° : interdit).
  const CLASS_COST = [1, 4, 1.8, 1, 2.5];

  // Repères : x vers l'est depuis le bord ouest, y vers le sud depuis le bord nord (mètres).
  const toXY = (lon, lat) => [(lon - LON0) * kx, (LAT1 - lat) * ky];
  const toLL = (x, y) => [LON0 + x / kx, LAT1 - y / ky];
  const inside = (lon, lat) => lon >= LON0 && lon <= LON1 && lat >= LAT0 && lat <= LAT1;
  const cellOf = (x, y) => clamp(Math.floor(y / C), 0, NY - 1) * NX + clamp(Math.floor(x / C), 0, NX - 1);
  const blocked = (k) => slope[k] > HYP.maxSlope;
  function elevAt(x, y) {
    const fx = clamp(x / C - 0.5, 0, NX - 1.001), fy = clamp(y / C - 0.5, 0, NY - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * NX + i;
    return (elev[k] * (1 - u) + elev[k + 1] * u) * (1 - v) + (elev[k + NX] * (1 - u) + elev[k + NX + 1] * u) * v;
  }
  function pointInfo(lon, lat) {
    const [x, y] = toXY(lon, lat), k = cellOf(x, y);
    return { lon, lat, x, y, k, elev: elevAt(x, y), slope: slope[k], sand: !!sand[k], blocked: blocked(k), inside: inside(lon, lat),
      cls: cls[k], className: CLASSES[cls[k]], conf: conf[k] };
  }
  // Cellule praticable la plus proche (ni sable ni pente interdite), pour poser un arrêt.
  function snap(lon, lat) {
    const [x, y] = toXY(lon, lat), c0 = cellOf(x, y);
    if (!blocked(c0) && !sand[c0] && cls[c0] !== 4) return [lon, lat];
    const ci = c0 % NX, cj = (c0 / NX) | 0;
    for (let r = 1; r < 40; r++) {
      let best = -1, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const k = j * NX + i;
        if (blocked(k) || sand[k] || cls[k] === 4) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return toLL((best % NX + 0.5) * C, (((best / NX) | 0) + 0.5) * C);
    }
    return [lon, lat];
  }

  // ---------- A* : pente (interdite au-delà de 20°) + sable (coût ×4) ----------
  function astar(ax, ay, bx, by) {
    const s = cellOf(ax, ay), t = cellOf(bx, by), tx = t % NX, ty = (t / NX) | 0;
    const g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const heap = [];
    const push = (f, k) => {
      heap.push([f, k]);
      for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const hEst = (k) => C * Math.hypot(k % NX - tx, ((k / NX) | 0) - ty);
    const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    g[s] = 0; push(hEst(s), s);
    while (heap.length) {
      const k = pop()[1];
      if (done[k]) continue;
      done[k] = 1;
      if (k === t) break;
      const x = k % NX, y = (k / NX) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
        const n = ny * NX + nx;
        if (done[n] || (blocked(n) && n !== t)) continue;
        if (dx && dy && (blocked(y * NX + nx) || blocked(ny * NX + x))) continue;
        const sl = slope[n] / HYP.maxSlope;
        const ng = g[k] + C * (dx && dy ? Math.SQRT2 : 1) * (1 + 2 * sl * sl) * CLASS_COST[cls[n]];
        if (ng < g[n]) { g[n] = ng; from[n] = k; push(ng + hEst(n), n); }
      }
    }
    if (s !== t && from[t] < 0) return null;
    const path = [];
    for (let k = t; k !== -1; k = from[k]) path.push([(k % NX + 0.5) * C, (((k / NX) | 0) + 0.5) * C]);
    path.reverse();
    path[0] = [ax, ay]; path[path.length - 1] = [bx, by];
    return path;
  }
  // Lissage « fil tendu » : un segment droit est gardé s'il ne franchit ni pente interdite
  // ni classe de terrain coûteuse que le trajet A* avait évitée.
  function clear(p, q, allowed) {
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (C / 3)));
    for (let i = 0; i <= n; i++) {
      const k = cellOf(p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n);
      if (slope[k] > HYP.maxSlope - 2 || (CLASS_COST[cls[k]] > 1 && !allowed.has(cls[k]))) return false;
    }
    return true;
  }
  function pull(pts, allowed) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1;) {
      let j = Math.min(pts.length - 1, i + 60);
      while (j > i + 1 && !clear(pts[i], pts[j], allowed)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  function measure(pts) {
    let dist = 0, asc = 0, desc = 0, maxS = 0, maxAt = pts[0], blockedLen = 0, sandLen = 0, roughLen = 0, steepLen = 0;
    let prevH = elevAt(pts[0][0], pts[0][1]);
    const prof = [{ d: 0, h: prevH, s: 0 }];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 10)), st = L / n;
      for (let j = 1; j <= n; j++) {
        const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n, h = elevAt(x, y), k = cellOf(x, y);
        dist += st;
        if (h > prevH) asc += h - prevH; else desc += prevH - h;
        prevH = h;
        if (slope[k] > maxS) { maxS = slope[k]; maxAt = [x, y]; }
        if (slope[k] > HYP.maxSlope) blockedLen += st;
        if (sand[k]) sandLen += st;
        if (cls[k] === 2) roughLen += st;
        if (cls[k] === 4) steepLen += st;
        prof.push({ d: dist, h, s: slope[k], c: cls[k] });
      }
    }
    return { dist, asc, desc, maxS, maxAt, blockedLen, sandLen, roughLen, steepLen, prof };
  }

  // stops : [{lon, lat, ...}] ; le premier est l'habitat, le trajet revient à l'habitat.
  function plan(stops) {
    const pts = stops.map((s) => toXY(s.lon, s.lat));
    const legs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const found = astar(a[0], a[1], b[0], b[1]), raw = found || [a, b];
      const allowed = new Set(raw.map((p) => cls[cellOf(p[0], p[1])]));
      const safe = pull(raw, allowed), short = [a, b];
      legs.push({ from: i, to: (i + 1) % pts.length, safe, short, safeM: measure(safe), shortM: measure(short), ok: !!found });
    }
    const join = (key) => legs.reduce((acc, l, i) => acc.concat(i ? l[key].slice(1) : l[key]), []);
    const safePts = join('safe'), shortPts = join('short');
    const safe = measure(safePts), short = measure(shortPts);
    const walk = (m) => m / 1000 / HYP.speedKmh * 60;
    const stopTotal = (stops.length - 1) * HYP.stopMin;
    const totalMin = walk(safe.dist) + stopTotal;
    let acc = 0;
    const stopAt = [0].concat(legs.map((l) => (acc += l.safeM.dist)));
    // Heure d'arrivée à chaque arrêt (min après le départ), arrêts compris.
    const arrive = stopAt.map((d, i) => walk(d) + Math.min(i, stops.length - 1) * HYP.stopMin);
    return {
      legs, safePts, shortPts, safe, short, stopAt, arrive,
      walkMin: walk(safe.dist), stopTotal, totalMin,
      marginMin: HYP.budgetMin - totalMin, o2Used: totalMin / HYP.budgetMin,
      unreachable: legs.some((l) => !l.ok)
    };
  }
  // Point à la distance d (m) le long d'une polyligne, avec le cap (degrés, 0 = nord).
  function along(pts, d) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0);
      if (acc + L >= d || i === pts.length - 1) {
        const t = L ? clamp((d - acc) / L, 0, 1) : 0;
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, heading: (Math.atan2(x1 - x0, -(y1 - y0)) * 180 / Math.PI + 360) % 360 };
      }
      acc += L;
    }
    return { x: pts[0][0], y: pts[0][1], heading: 0 };
  }

  // Sortie de référence : habitat et trois arrêts posés sur des formations visibles dans l'image HiRISE.
  const DEFAULT_STOPS = [
    { id: 'H', name: 'Habitat Alpha', kind: 'habitat', lon: 137.3757, lat: -4.7174,
      note: 'Emplacement fictif, sur la plaine lisse au nord de la crête.' },
    { id: '1', name: 'Bord des dunes', kind: 'science', lon: 137.3546, lat: -4.7089,
      goal: 'Étudier un champ de dunes actif : forme des rides, taille des grains.',
      tasks: ['Photographier la face d’avalanche', 'Prélever du sable en bordure (sans entrer dans la dune)', 'Mesurer le vent au sol'],
      tools: ['Caméra', 'Tamis et sachets', 'Anémomètre'] },
    { id: '2', name: 'Roche à hématite', kind: 'science', lon: 137.3609, lat: -4.7269,
      goal: 'Échantillonner la roche riche en hématite repérée depuis l’orbite.',
      tasks: ['Repérer les veines claires', 'Prélever deux carottes de roche', 'Mesurer la couleur et l’éclat'],
      tools: ['Foreuse portative', 'Spectromètre de poche', 'Caméra'] },
    { id: '3', name: 'Sol argileux', kind: 'science', lon: 137.3906, lat: -4.7266,
      goal: 'Chercher les argiles qui gardent la trace d’eau ancienne.',
      tasks: ['Creuser 10 cm sous la poussière', 'Prélever un échantillon de sol', 'Photographier les strates'],
      tools: ['Pelle', 'Sachets scellés', 'Caméra'] }
  ];
  DEFAULT_STOPS.forEach((s) => { const [lon, lat] = snap(s.lon, s.lat); s.lon = lon; s.lat = lat; });

  // Cibles minérales : contours APPROXIMATIFS tracés sur l'image HiRISE (1400 × 1050 px de la zone),
  // d'après les cartes CRISM publiées (crête à hématite, unité argileuse au sud).
  const pxToXY = ([px, py]) => [px / 1400 * W, py / 1050 * H];
  const RIDGE = [[200, 935], [330, 800], [450, 705], [560, 630], [650, 590], [760, 610], [880, 590], [1000, 520], [1120, 450], [1250, 350], [1400, 290]].map(pxToXY);
  function buffer(pts, w) {
    const a1 = [], b1 = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
      a1.push([p[0] - dy / n * w, p[1] + dx / n * w]); b1.push([p[0] + dy / n * w, p[1] - dx / n * w]);
    });
    return a1.concat(b1.reverse());
  }
  const HEM = buffer(RIDGE, 130);
  const CLAY = RIDGE.map(([x, y]) => [x, Math.min(H, y + 230)]).concat([[W, H], [RIDGE[0][0], H]]);
  const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const unitAt = (x, y) => inPoly(HEM, x, y) ? 'crête à hématite (approx.)' : inPoly(CLAY, x, y) ? 'unité argileuse (approx.)' : 'plaine du mont Sharp';

  // ---------- Produits de l'IA ----------
  // Zones dangereuses : régions connexes des classes sable, roche rugueuse, pente raide (≥ 1 ha).
  const HAZ_CLASSES = { 1: 'Dunes de sable', 2: 'Terrain rocheux', 4: 'Pente raide' };
  const HAZARDS = (function () {
    const seen = new Uint8Array(N), out = [];
    for (let s = 0; s < N; s++) {
      const c = cls[s];
      if (seen[s] || !HAZ_CLASSES[c]) continue;
      const stack = [s]; seen[s] = 1;
      let n = 0, sx = 0, sy = 0, sc = 0, ms = 0;
      while (stack.length) {
        const k = stack.pop(), x = k % NX, y = (k / NX) | 0;
        n++; sx += x; sy += y; sc += conf[k]; ms = Math.max(ms, slope[k]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, q = ny * NX + nx;
          if (nx >= 0 && ny >= 0 && nx < NX && ny < NY && !seen[q] && cls[q] === c) { seen[q] = 1; stack.push(q); }
        }
      }
      const ha = n * C * C / 10000;
      if (ha >= 1) {
        const [lon, lat] = toLL((sx / n + 0.5) * C, (sy / n + 0.5) * C);
        out.push({ cls: c, name: HAZ_CLASSES[c], lon, lat, ha, conf: sc / n, maxSlope: ms });
      }
    }
    return out.sort((a, b) => b.ha - a.ha);
  })();
  // Potentiel scientifique (SIMULÉ) : traces d'eau ancienne = argiles, hématite, affleurements clairs.
  const life = new Float32Array(N);
  (function () {
    const raw = new Float32Array(N);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = (i + 0.5) * C, y = (j + 0.5) * C;
      let s = 0.08;
      if (inPoly(CLAY, x, y)) s += 0.45;
      if (inPoly(HEM, x, y)) s += 0.35;
      if (cls[k] === 3) s += 0.25;
      if (cls[k] === 2) s += 0.08;
      if (cls[k] === 1) s -= 0.3;
      s += 0.12 * conf[k] - 0.006 * slope[k];
      raw[k] = s;
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { // lissage 5 × 5
      let t = 0, n = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue; t += raw[b * NX + a]; n++;
      }
      life[j * NX + i] = clamp(t / n, 0, 1);
    }
  })();
  // Cibles suggérées : meilleurs scores, accessibles, espacées d'au moins 500 m.
  const TARGETS = (function () {
    const idx = Array.from({ length: N }, (_, k) => k).filter((k) => !sand[k] && cls[k] !== 4 && !blocked(k)).sort((a, b) => life[b] - life[a]);
    const out = [];
    for (const k of idx) {
      const x = (k % NX + 0.5) * C, y = (((k / NX) | 0) + 0.5) * C;
      if (out.some((t) => Math.hypot(t.x - x, t.y - y) < 500)) continue;
      const [lon, lat] = toLL(x, y);
      out.push({ x, y, lon, lat, score: life[k], unit: unitAt(x, y), className: CLASSES[cls[k]] });
      if (out.length === 5) break;
    }
    return out;
  })();

  root.ARES_ZM = {
    HYP, Z, NX, NY, C, W, H, LON0, LAT0, LON1, LAT1, elev, slope, sand, eMin, eMax,
    toXY, toLL, inside, cellOf, blocked, elevAt, pointInfo, snap, plan, measure, along, DEFAULT_STOPS,
    HEM, CLAY, unitAt, CLASSES, cls, conf, CLASS_COST, HAZARDS, life, TARGETS
  };
})(typeof window !== 'undefined' ? window : globalThis);
