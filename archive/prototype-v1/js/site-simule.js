// Site de sortie SIMULÉ (≈ 3 × 1,9 km au pied du mont Sharp) : relief, pentes, sable, itinéraire A*.
// Tous les chiffres affichés par la page (distance, durée, pente, marge) sont calculés ici, jamais par l'IA.
// Le relief est inventé pour la démonstration ; il sera remplacé par le modèle de terrain HiRISE du vrai site.
(function (root) {
  'use strict';

  // Hypothèses de l'équipe (cahier des charges §2) : ce ne sont pas des chiffres NASA.
  const HYP = { crew: 2, speedKmh: 2, maxSlope: 20, budgetMin: 240, stopMin: 15, departMin: 9 * 60 };

  // ---------- Bruit ----------
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  }
  function fbm(x, y, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < (oct || 4); i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- Terrain (mètres ; x vers l'est, y vers le sud) ----------
  const W = 3000, H = 1900, C = 20, NX = W / C, NY = H / C;
  const ramp = { y: 1000, s: 110 };                       // passage en pente douce dans l'escarpement
  const crater = { x: 720, y: 780, r: 125, d: 42, rim: 9 };
  const sand = { x: 2230, y: 1000, r: 230 };              // sable meuble (faible inertie thermique)
  const box = { x: 2120, y: 1560, r: 300 };               // réseau de crêtes en boxwork
  const scarpX = (y) => 1420 + 80 * Math.sin(y / 280);

  function height(x, y) {
    let h = 22 * fbm(x / 650, y / 650, 4) + 6 * fbm(x / 180 + 40, y / 180, 3);
    const w = 45 + 420 * Math.exp(-0.5 * ((y - ramp.y) / ramp.s) ** 2);
    h += 55 * smooth(-w / 2, w / 2, x - scarpX(y));
    const dr = Math.hypot(x - crater.x, y - crater.y) / crater.r;
    if (dr < 1) h -= crater.d * (1 - dr * dr);
    h += crater.rim * Math.exp(-(((dr - 1) / 0.25) ** 2));
    return h;
  }

  const N = NX * NY;
  const hgt = new Float32Array(N), slope = new Float32Array(N), isSand = new Uint8Array(N);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = (i + 0.5) * C, y = (j + 0.5) * C, k = j * NX + i;
    hgt[k] = height(x, y);
    const edge = sand.r * (0.8 + 0.4 * fbm(x / 120, y / 120, 3));
    isSand[k] = Math.hypot(x - sand.x, y - sand.y) < edge ? 1 : 0;
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i;
    const i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NY - 1, j + 1);
    const gx = (hgt[j * NX + i1] - hgt[j * NX + i0]) / ((i1 - i0) * C);
    const gy = (hgt[j1 * NX + i] - hgt[j0 * NX + i]) / ((j1 - j0) * C);
    slope[k] = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
  }
  const blocked = (k) => slope[k] > HYP.maxSlope;
  const cellOf = (x, y) => clamp(Math.floor(y / C), 0, NY - 1) * NX + clamp(Math.floor(x / C), 0, NX - 1);
  function hAt(x, y) {
    const fx = clamp(x / C - 0.5, 0, NX - 1.001), fy = clamp(y / C - 0.5, 0, NY - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * NX + i;
    return (hgt[k] * (1 - u) + hgt[k + 1] * u) * (1 - v) + (hgt[k + NX] * (1 - u) + hgt[k + NX + 1] * u) * v;
  }

  // ---------- A* sur la grille de coût (pente + sable ; pente > 20° interdite) ----------
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
        if (done[n] || blocked(n)) continue;
        if (dx && dy && (blocked(y * NX + nx) || blocked(ny * NX + x))) continue;
        const sl = slope[n] / HYP.maxSlope;
        const ng = g[k] + C * (dx && dy ? Math.SQRT2 : 1) * (1 + 1.5 * sl * sl) * (isSand[n] ? 3 : 1);
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

  // Lissage « fil tendu » : on garde un segment droit s'il ne franchit aucune pente interdite.
  function clear(p, q, avoidSand) {
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (C / 3)));
    for (let i = 0; i <= n; i++) {
      const k = cellOf(p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n);
      if (slope[k] > HYP.maxSlope - 1.5 || (avoidSand && isSand[k])) return false;
    }
    return true;
  }
  function pull(pts, avoidSand) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1;) {
      let j = pts.length - 1;
      while (j > i + 1 && !clear(pts[i], pts[j], avoidSand)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  function measure(pts) {
    let dist = 0, asc = 0, maxS = 0, maxAt = pts[0], blockedLen = 0, sandLen = 0;
    let prevH = hAt(pts[0][0], pts[0][1]);
    const prof = [{ d: 0, h: prevH }];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 10)), st = L / n;
      for (let j = 1; j <= n; j++) {
        const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n, h = hAt(x, y), k = cellOf(x, y);
        dist += st;
        if (h > prevH) asc += h - prevH;
        prevH = h;
        if (slope[k] > maxS) { maxS = slope[k]; maxAt = [x, y]; }
        if (slope[k] > HYP.maxSlope) blockedLen += st;
        if (isSand[k]) sandLen += st;
        prof.push({ d: dist, h });
      }
    }
    return { dist, asc, maxS, maxAt, blockedLen, sandLen, prof };
  }

  // ---------- Sortie de référence ----------
  const stops = [
    { id: 'H', name: 'Habitat', x: 360, y: 1100 },
    { id: '1', name: 'Strates sédimentaires', task: "Photographier les couches exposées au pied de l'escarpement", x: 1220, y: 430 },
    { id: '2', name: 'Champ de sable', task: 'Mesurer la température du sol et la taille des grains', x: 2300, y: 690 },
    { id: '3', name: 'Crêtes de boxwork', task: 'Analyser les minéraux déposés par les anciennes eaux souterraines', x: 2050, y: 1520 }
  ];
  const legs = stops.map((a, i) => {
    const b = stops[(i + 1) % stops.length];
    const raw = astar(a.x, a.y, b.x, b.y);
    const avoidSand = !raw.some((p) => isSand[cellOf(p[0], p[1])]);
    const safe = pull(raw, avoidSand), short = [[a.x, a.y], [b.x, b.y]];
    return { from: a, to: b, safe, short, safeM: measure(safe), shortM: measure(short) };
  });
  const join = (key) => legs.reduce((acc, l, i) => acc.concat(i ? l[key].slice(1) : l[key]), []);
  const safePts = join('safe'), shortPts = join('short');
  const safe = measure(safePts), short = measure(shortPts);
  const walk = (m) => m / 1000 / HYP.speedKmh * 60;
  const stopTotal = (stops.length - 1) * HYP.stopMin;
  const plan = {
    walkMin: walk(safe.dist), stopTotal, totalMin: walk(safe.dist) + stopTotal,
    shortTotalMin: walk(short.dist) + stopTotal
  };
  plan.marginMin = HYP.budgetMin - plan.totalMin;
  plan.o2Used = plan.totalMin / HYP.budgetMin;
  // Distances cumulées de chaque arrêt le long du trajet sûr (pour le profil).
  let acc = 0;
  const stopAt = [0].concat(legs.map((l) => (acc += l.safeM.dist)));

  root.ARES_SITE = {
    HYP, W, H, C, NX, NY, hgt, slope, isSand, blocked, cellOf, hAt, fbm,
    ramp, crater, sand, box, scarpX, stops, legs, safePts, shortPts, safe, short, plan, stopAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
