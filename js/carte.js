// ARES NAV — carte de sortie (Leaflet, projection équirectangulaire de Mars).
// Données : tuiles NASA Mars Trek en local (tiles/), zone de sortie réelle (data/zone.js), calculs (js/zone-model.js).
(function () {
  'use strict';
  const M = window.ARES_ZM;
  const TI = (window.ARES_TILES || { layers: {} }).layers;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = (n, d) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const km = (m) => nf(m / 1000, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (min) => { const t = Math.max(0, Math.round(min)); return Math.floor(t / 60) + ' h ' + pad(t % 60); };
  const clock = (min) => { const t = Math.round(M.HYP.departMin + min); return pad(Math.floor(t / 60) % 24) + ':' + pad(t % 60); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtLL = (lat, lon) => nf(Math.abs(lat), 4) + '° ' + (lat < 0 ? 'S' : 'N') + ' · ' + nf(Math.abs(lon), 4) + '° ' + (lon < 0 ? 'O' : 'E');
  const COL = { mars: '#ff5a1f', ink: '#f2ede8', y: '#ffd84a', o: '#ff9a2e', r: '#ff4433', safe: '#4ade80', blue: '#5cc8ff', hem: '#e05fb0', clay: '#3fd0c9' };
  if (!M || !window.L) { document.body.innerHTML = '<p style="padding:40px">Données manquantes : lancer tools/build_data.py.</p>'; return; }
  const H = M.HYP;

  // =====================================================================
  // Carte et tuiles
  // =====================================================================
  const CRS = L.extend({}, L.CRS.EPSG4326, { R: 3389500 });   // échelle et distances avec le rayon de Mars
  const WORLD = L.latLngBounds([-90, -180], [90, 180]);
  const GALE = L.latLngBounds([-6.6, 135.2], [-2.8, 139.3]);
  const STRIP = L.latLngBounds([-4.93, 137.12], [-4.25, 137.73]);
  const ZB = L.latLngBounds([M.LAT0, M.LON0], [M.LAT1, M.LON1]);
  const map = L.map('map', { crs: CRS, zoomControl: false, attributionControl: false, minZoom: 1, maxZoom: 18, maxBounds: WORLD.pad(0.1), zoomSnap: 0.5, wheelPxPerZoomLevel: 100 });
  map.setView([-4.9, 137.6], 3);
  L.control.scale({ imperial: false, maxWidth: 140, position: 'bottomleft' }).addTo(map);
  map.createPane('zonesPane').style.zIndex = 420;
  map.createPane('routePane').style.zIndex = 450;

  const TREK = { viking: ['Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg'], relief: ['Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', 'jpg'], ctx: ['Gale_CTX_BlockAdj_dd', 'png'], hirise: ['curiosity_hirise_mosaic', 'png'], themis: ['THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', 'png'] };
  const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const tileUrl = (name, key) => { const k = (TI[name] || {})[key]; return k ? 'tiles/' + name + '/' + key + (k === 'j' ? '.jpg' : '.png') : null; };
  // Tuile locale si elle existe ; sinon, si l'exploration en ligne est activée, Mars Trek ; sinon rien.
  // Hors ligne par défaut : des requêtes lentes vers le serveur bloqueraient le chargement des tuiles locales.
  let ONLINE = false;
  const Tiles = L.TileLayer.extend({
    getTileUrl(c) {
      const key = c.z + '/' + c.y + '/' + c.x, local = tileUrl(this.options.name, key);
      if (local) return local;
      if (ONLINE && this.options.online && navigator.onLine) {
        const [layer, ext] = TREK[this.options.name];
        return 'https://trek.nasa.gov/tiles/Mars/EQ/' + layer + '/1.0.0/default/default028mm/' + key + '.' + ext;
      }
      return EMPTY;
    }
  });
  const T = (name, o) => new Tiles('', L.extend({ name, tileSize: 256, maxZoom: 18, noWrap: true, bounds: WORLD, errorTileUrl: EMPTY, keepBuffer: 3 }, o));

  // ---------- Images calculées sur la zone (grille de 20 m) ----------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function mask(test, rgba) {
    const c = canvas(M.NX, M.NY), x = c.getContext('2d'), img = x.createImageData(M.NX, M.NY);
    for (let k = 0; k < M.NX * M.NY; k++) if (test(k)) img.data.set(rgba, k * 4);
    x.putImageData(img, 0, 0);
    return c;
  }
  function pattern(kind, color, s) {
    const c = canvas(s, s), x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = color; x.lineWidth = Math.max(1, s / 5);
    if (kind === 'hatch' || kind === 'cross') { x.beginPath(); x.moveTo(-1, s + 1); x.lineTo(s + 1, -1); x.stroke(); }
    if (kind === 'cross') { x.beginPath(); x.moveTo(-1, -1); x.lineTo(s + 1, s + 1); x.stroke(); }
    if (kind === 'dots') { x.beginPath(); x.arc(s / 2, s / 2, s / 5, 0, 7); x.fill(); }
    return c;
  }
  function fillMask(ctx, m, fill) {
    const t = canvas(ctx.canvas.width, ctx.canvas.height), tx = t.getContext('2d');
    tx.imageSmoothingEnabled = true; tx.drawImage(m, 0, 0, t.width, t.height);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = fill; tx.fillRect(0, 0, t.width, t.height);
    ctx.drawImage(t, 0, 0);
  }
  const SC = 5;
  const slopeImg = (function () {
    const c = canvas(M.NX * SC, M.NY * SC), x = c.getContext('2d');
    fillMask(x, mask((k) => M.slope[k] >= 10 && M.slope[k] < 15, [0, 0, 0, 255]), 'rgba(255,216,74,.38)');
    fillMask(x, mask((k) => M.slope[k] >= 15 && M.slope[k] <= 20, [0, 0, 0, 255]), 'rgba(255,154,46,.62)');
    const red = mask((k) => M.slope[k] > 20, [0, 0, 0, 255]);
    fillMask(x, red, 'rgba(255,68,51,.55)');
    fillMask(x, red, x.createPattern(pattern('hatch', 'rgba(255,255,255,.85)', 7), 'repeat'));
    return c.toDataURL();
  })();
  // Dangers détectés par l'IA (classes du modèle de terrain) : sable, roche rugueuse, pente raide.
  const hazImg = (function () {
    const c = canvas(M.NX * SC, M.NY * SC), x = c.getContext('2d');
    const sand = mask((k) => M.cls[k] === 1, [0, 0, 0, 255]), rock = mask((k) => M.cls[k] === 2, [0, 0, 0, 255]), steep = mask((k) => M.cls[k] === 4, [0, 0, 0, 255]);
    fillMask(x, sand, 'rgba(255,216,74,.16)'); fillMask(x, sand, x.createPattern(pattern('dots', 'rgba(255,216,74,.9)', 6), 'repeat'));
    fillMask(x, rock, 'rgba(255,154,46,.12)'); fillMask(x, rock, x.createPattern(pattern('cross', 'rgba(255,154,46,.75)', 7), 'repeat'));
    fillMask(x, steep, 'rgba(255,68,51,.22)'); fillMask(x, steep, x.createPattern(pattern('hatch', 'rgba(255,68,51,.95)', 6), 'repeat'));
    return c.toDataURL();
  })();
  // Potentiel de vie (score SIMULÉ : minéraux formés avec l'eau + types de roche).
  const lifeImg = (function () {
    const c = canvas(M.NX, M.NY), x = c.getContext('2d'), img = x.createImageData(M.NX, M.NY);
    for (let k = 0; k < M.NX * M.NY; k++) {
      const s = M.life[k]; if (s < 0.2) continue;
      const t = Math.min(1, (s - 0.2) / 0.6);
      img.data.set([40 + 140 * t, 150 + 105 * t, 200 - 90 * t, 50 + 170 * t], k * 4);
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL();
  })();
  // Relief local : couleurs d'altitude × ombrage, calculés sur le MNT HiRISE.
  const RAMP = [[0, [32, 52, 120]], [0.25, [40, 140, 160]], [0.5, [120, 180, 90]], [0.75, [220, 170, 70]], [1, [250, 240, 230]]];
  const ramp = (t) => { for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], u = (t - a) / (b - a); return ca.map((v, n) => v + (cb[n] - v) * u); } return RAMP[RAMP.length - 1][1]; };
  const demImg = (function () {
    const c = canvas(M.NX, M.NY), x = c.getContext('2d'), img = x.createImageData(M.NX, M.NY);
    for (let j = 0; j < M.NY; j++) for (let i = 0; i < M.NX; i++) {
      const k = j * M.NX + i, e = M.elev[k];
      const gx = (M.elev[j * M.NX + Math.min(M.NX - 1, i + 1)] - M.elev[j * M.NX + Math.max(0, i - 1)]) / (2 * M.C);
      const gy = (M.elev[Math.min(M.NY - 1, j + 1) * M.NX + i] - M.elev[Math.max(0, j - 1) * M.NX + i]) / (2 * M.C);
      const sh = Math.max(0, Math.min(1, (gx * 0.7 + gy * 0.7 + 1) / Math.hypot(gx, gy, 1) * 0.75 + 0.15));
      const col = ramp((e - M.eMin) / (M.eMax - M.eMin));
      img.data.set([col[0] * sh, col[1] * sh, col[2] * sh, 255], k * 4);
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL();
  })();

  // ---------- Vues (comme les fonds de carte de Google Maps) ----------
  const VIEWS = {
    sat: { label: 'Satellite', thumb: tileUrl('hirise', '12/2155/7222') || tileUrl('viking', '7/67/225'),
      layers: [T('viking', { maxNativeZoom: 3 }), T('viking', { minZoom: 4, maxNativeZoom: 7, online: true }),
        T('ctx', { minZoom: 5, maxNativeZoom: 12, bounds: GALE, online: true }), T('hirise', { minZoom: 10, maxNativeZoom: 15, bounds: STRIP, online: true })] },
    relief: { label: 'Relief', thumb: tileUrl('relief', '7/67/225'),
      layers: [T('relief', { maxNativeZoom: 3 }), T('relief', { minZoom: 4, maxNativeZoom: 8, online: true }), L.imageOverlay(demImg, ZB, { className: 'smooth' })] },
    therm: { label: 'Thermique', thumb: tileUrl('themis', '7/67/225'),
      layers: [T('viking', { maxNativeZoom: 3, opacity: 0.5 }), T('themis', { minZoom: 4, maxNativeZoom: 9, bounds: L.latLngBounds([-65, -180], [65, 180]), online: true })] }
  };
  Object.values(VIEWS).forEach((v) => { v.group = L.layerGroup(v.layers); });
  let view = 'sat';
  function setView(k) {
    if (!VIEWS[k]) return;
    map.removeLayer(VIEWS[view].group);
    view = k; VIEWS[k].group.addTo(map);
    renderViews(); renderLegend(); updateSrc();
    if (panel === 'couches') renderPanel();
  }
  VIEWS.sat.group.addTo(map);

  // =====================================================================
  // Repères : points à connaître, zones, minéraux
  // =====================================================================
  const POIS = [
    { name: 'Cratère Gale', sub: '154 km de diamètre', lat: -5.4, lon: 137.8, z: [3, 8.5], go: 8 },
    { name: 'Mont Sharp', sub: 'Aeolis Mons · ≈ 5 km au-dessus du fond du cratère', lat: -5.08, lon: 137.85, z: [6, 11], go: 10 },
    { name: 'Bradbury Landing', sub: 'Atterrissage de Curiosity, 6 août 2012', lat: -4.5895, lon: 137.4417, z: [8, 18], go: 15 },
    { name: 'Dunes Bagnold', sub: 'Champ de dunes actif étudié par Curiosity', lat: -4.7014, lon: 137.3671, z: [11, 18], go: 15 },
    { name: 'Crête Vera Rubin', sub: 'Crête riche en hématite · position approx.', lat: -4.7129, lon: 137.3974, z: [11, 18], go: 15 }
  ];
  const poiLayer = L.layerGroup();
  POIS.forEach((p) => {
    p.marker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'poi-wrap', html: '<div class="poi' + (p.z[0] < 6 ? ' big' : '') + '"><i></i><b>' + esc(p.name) + '</b></div>', iconSize: null, iconAnchor: [6, 6] }), keyboard: false });
    p.marker.on('click', () => map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), p.go), { duration: REDUCE ? 0 : 1.5 }));
  });
  function updatePois() {
    const z = map.getZoom();
    POIS.forEach((p) => { const show = z >= p.z[0] && z <= p.z[1]; if (show && !poiLayer.hasLayer(p.marker)) poiLayer.addLayer(p.marker); if (!show) poiLayer.removeLayer(p.marker); });
  }

  // Minéraux : contours approximatifs (voir js/zone-model.js).
  const xyToLL = (p) => { const [lon, lat] = M.toLL(p[0], p[1]); return [lat, lon]; };
  const minLayer = L.layerGroup([
    L.polygon(M.CLAY.map(xyToLL), { pane: 'zonesPane', color: COL.clay, weight: 1.5, dashArray: '4 4', fillColor: COL.clay, fillOpacity: 0.16 }).bindTooltip('Unité riche en argiles (CRISM) · approx.', { sticky: true, className: 'tip' }),
    L.polygon(M.HEM.map(xyToLL), { pane: 'zonesPane', color: COL.hem, weight: 1.5, fillColor: COL.hem, fillOpacity: 0.28 }).bindTooltip('Crête riche en hématite (CRISM) · approx.', { sticky: true, className: 'tip' })
  ]);
  const unitAt = M.unitAt;

  // Zones de référence : zone de sortie et rayon de retour autour de l'habitat.
  const zoneRect = L.rectangle(ZB, { pane: 'zonesPane', color: '#fff', weight: 1.2, dashArray: '6 6', fill: false, interactive: false });
  const zoneTag = L.marker([M.LAT1, M.LON0], { icon: L.divIcon({ className: '', html: '<div class="zone-tag" style="transform:translate(4px,6px)">Zone de sortie · 4,7 × 3,5 km</div>', iconSize: null }), interactive: false, keyboard: false });
  let returnRing = null;
  const zonesLayer = L.layerGroup([zoneRect, zoneTag]);
  function returnRadius() { return Math.max(0, (H.budgetMin - (stops.length - 1) * H.stopMin) / 2 / 60 * H.speedKmh * 1000); }
  function updateRing() {
    if (returnRing) zonesLayer.removeLayer(returnRing);
    const [cx, cy] = M.toXY(stops[0].lon, stops[0].lat), r = returnRadius(), pts = [];
    for (let a = 0; a <= 64; a++) pts.push(xyToLL([cx + r * Math.cos(a / 64 * 2 * Math.PI), cy + r * Math.sin(a / 64 * 2 * Math.PI)]));
    returnRing = L.polyline(pts, { pane: 'zonesPane', color: COL.blue, weight: 1.3, dashArray: '2 6', interactive: false });
    zonesLayer.addLayer(returnRing);
  }

  // ---------- Couches de l'IA : dangers (avec confiance) et cibles scientifiques ----------
  const HZ_ICON = { 1: 'Dunes', 2: 'Rochers', 4: 'Pente raide' };
  const hazLayer = L.layerGroup([L.imageOverlay(hazImg, ZB, { pane: 'zonesPane', className: 'smooth' })]);
  M.HAZARDS.slice(0, 12).forEach((h) => {
    hazLayer.addLayer(L.marker([h.lat, h.lon], { keyboard: false, interactive: true,
      icon: L.divIcon({ className: '', html: '<div class="hz hz' + h.cls + '"><i></i>' + HZ_ICON[h.cls] + ' · ' + nf(h.conf * 100) + ' %</div>', iconSize: null, iconAnchor: [8, 8] }) })
      .bindTooltip(h.name + ' · ' + nf(h.ha, 1) + ' ha · confiance ' + nf(h.conf * 100) + ' %' + (h.cls === 4 ? ' · jusqu’à ' + nf(h.maxSlope) + '°' : ''), { direction: 'top', offset: [0, -8], className: 'tip' }));
  });
  const lifeLayer = L.layerGroup([L.imageOverlay(lifeImg, ZB, { pane: 'zonesPane', className: 'smooth' })]);
  M.TARGETS.forEach((t, i) => {
    const mk = L.marker([t.lat, t.lon], { keyboard: false, icon: L.divIcon({ className: '', html: '<div class="tg"><b>' + (i + 1) + '</b>' + nf(t.score * 100) + ' %</div>', iconSize: null, iconAnchor: [11, 11] }) });
    mk.on('click', (e) => {
      L.DomEvent.stopPropagation(e); lastClick = [t.lat, t.lon];
      L.popup({ maxWidth: 300 }).setLatLng([t.lat, t.lon]).setContent('<div class="pop"><h4>Cible IA ' + (i + 1) + ' · ' + nf(t.score * 100) + ' %</h4><dl><dt>Unité</dt><dd>' + t.unit + '</dd><dt>Terrain</dt><dd>' + t.className + '</dd><dt>Pourquoi</dt><dd>traces d’eau ancienne possibles</dd></dl><p class="note" style="margin:8px 0 0">Score simulé, à confirmer par les mesures au sol.</p><div class="row"><button class="btn primary" data-pop="add">Ajouter à l’itinéraire</button><button class="btn" data-pop="ai">Synthèse IA</button></div></div>').openOn(map);
    });
    lifeLayer.addLayer(mk);
  });

  // ---------- Couches superposables ----------
  const OV = {
    slope: { label: 'Pentes', tag: 'Calculé', src: 'MRO HiRISE · modèle de terrain (Mars Trek), étalonné sur MOLA, précision ≈ 18 m', layer: L.imageOverlay(slopeImg, ZB, { pane: 'zonesPane', className: 'smooth' }), on: true, opacity: 0.85,
      legend: '<div class="swatches"><span><i style="background:rgba(255,216,74,.7)"></i>10–15°</span><span><i style="background:#ff9a2e"></i>15–20°</span><span><i style="background:repeating-linear-gradient(-45deg,#ff4433 0 3px,#fff 3px 4px)"></i>&gt; 20° interdit</span></div>' },
    haz: { label: 'Dangers détectés', tag: 'IA', src: 'Modèle ARES NAV · k-moyennes sur l’image HiRISE et le relief · ' + M.HAZARDS.length + ' zones', layer: hazLayer, on: true, opacity: 0.9,
      legend: '<div class="swatches"><span><i style="background:radial-gradient(#ffd84a 1.2px,transparent 1.6px) 0 0/4px 4px;border:1px solid rgba(255,216,74,.5)"></i>Sable</span><span><i class="sw-rock"></i>Roche rugueuse</span><span><i style="background:repeating-linear-gradient(-45deg,#ff4433 0 2px,transparent 2px 4px);border:1px solid #ff4433"></i>Pente raide</span></div>' },
    life: { label: 'Potentiel de vie', tag: 'IA · simulé', src: 'Score simulé : argiles et hématite (CRISM) + types de roche · ' + M.TARGETS.length + ' cibles', layer: lifeLayer, on: false, opacity: 0.9,
      legend: '<div class="scale-bar" style="background:linear-gradient(90deg,rgba(40,150,200,.4),#b4ff6e)"></div><div class="scale-lab"><span>faible</span><span>fort</span></div>' },
    min: { label: 'Minéraux', tag: 'Approx.', src: 'MRO CRISM · contours approximatifs d’après les cartes publiées', layer: minLayer, on: false, opacity: 1,
      legend: '<div class="swatches"><span><i style="background:#e05fb0"></i>Hématite</span><span><i style="background:#3fd0c9"></i>Argiles</span></div>' },
    zones: { label: 'Zones de référence', tag: 'Calculé', src: 'Zone de sortie et rayon de retour (autonomie, arrêts compris)', layer: zonesLayer, on: true, opacity: 1,
      legend: '<div class="swatches"><span><i style="border:1px dashed #fff"></i>Zone de sortie</span><span><i style="border-top:2px dotted #5cc8ff;height:0"></i>Rayon de retour</span></div>' },
    pois: { label: 'Points à connaître', tag: 'Réel', src: 'Noms UAI et noms d’usage de la mission Curiosity', layer: poiLayer, on: true, opacity: 1, legend: '' }
  };
  function setOverlay(k, on) {
    const o = OV[k]; o.on = on;
    if (on) o.layer.addTo(map); else map.removeLayer(o.layer);
    renderLegend();
    if (panel === 'couches') renderPanel();
  }
  function setOpacity(k, v) {
    const o = OV[k]; o.opacity = v;
    if (o.layer.setOpacity) o.layer.setOpacity(v);
    else o.layer.eachLayer((l) => {
      if (l.setOpacity) { l.setOpacity(v); return; }
      if (!l.setStyle) return;
      if (l.options.baseFill == null) l.options.baseFill = l.options.fillOpacity;
      l.setStyle({ opacity: v, fillOpacity: l.options.baseFill * v });
    });
  }
  Object.entries(OV).forEach(([k, o]) => { if (o.on) o.layer.addTo(map); if (o.layer.setOpacity) o.layer.setOpacity(o.opacity); });

  // =====================================================================
  // Itinéraire
  // =====================================================================
  let stops = M.DEFAULT_STOPS.map((s) => Object.assign({}, s));
  let plan = null, compare = true, adding = false, freeCount = 0;
  const route = { glow: L.polyline([], { pane: 'routePane', color: COL.mars, weight: 10, opacity: 0.22, interactive: false }),
    safe: L.polyline([], { pane: 'routePane', color: COL.mars, weight: 3.5, opacity: 1, lineJoin: 'round', interactive: false }),
    short: L.polyline([], { pane: 'routePane', color: '#fff', weight: 1.8, opacity: 0.85, dashArray: '6 7', interactive: false }) };
  Object.values(route).forEach((l) => l.addTo(map));
  // Survol du trajet : distance, heure de passage, pente et terrain vu par l'IA.
  route.hit = L.polyline([], { pane: 'routePane', color: '#000', opacity: 0, weight: 20, bubblingMouseEvents: false }).addTo(map)
    .bindTooltip('', { sticky: true, className: 'tip', direction: 'top', offset: [0, -10] });
  function nearestOnRoute(x, y) {
    const pts = plan.safePts; let best = Infinity, bestD = 0, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2, Ls = Math.sqrt(L2);
      const t = L2 ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L2)) : 0;
      const d2 = (x0 + t * (x1 - x0) - x) ** 2 + (y0 + t * (y1 - y0) - y) ** 2;
      if (d2 < best) { best = d2; bestD = acc + t * Ls; }
      acc += Ls;
    }
    return bestD;
  }
  const timeAt = (d) => { let leg = 0; while (leg < plan.stopAt.length - 2 && plan.stopAt[leg + 1] <= d) leg++; return d / 1000 / H.speedKmh * 60 + leg * H.stopMin; };
  route.hit.on('mousemove', (e) => {
    const [x, y] = M.toXY(e.latlng.lng, e.latlng.lat), d = nearestOnRoute(x, y), a = M.along(plan.safePts, d), k = M.cellOf(a.x, a.y);
    route.hit.setTooltipContent('<b>' + km(d) + ' km</b> · passage ' + clock(timeAt(d)) + ' · pente ' + nf(M.slope[k]) + '° · IA : ' + M.CLASSES[M.cls[k]]);
  });
  route.hit.on('click', () => openPanel('itineraire'));
  const profMk = L.circleMarker([0, 0], { pane: 'routePane', radius: 7, color: '#fff', weight: 2, fillColor: COL.mars, fillOpacity: 1, interactive: false });
  const stopLayer = L.layerGroup().addTo(map);
  const meMarker = L.marker([stops[0].lat, stops[0].lon], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, keyboard: false })
    .bindTooltip('Ma position · simulée', { direction: 'top', offset: [0, -10], className: 'tip' }).addTo(map);

  function stopLabel(i) { return i === 0 ? 'H' : String(i); }
  function drawStops() {
    stopLayer.clearLayers();
    const next = sim.next;
    stops.forEach((s, i) => {
      const mk = L.marker([s.lat, s.lon], { draggable: true, autoPan: true, zIndexOffset: 500,
        icon: L.divIcon({ className: '', html: '<div class="stopmk' + (i === 0 ? ' h' : '') + (next === i && sim.t > 0 ? ' next' : '') + '">' + stopLabel(i) + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) });
      mk.bindTooltip(esc(s.name), { permanent: true, direction: 'right', offset: [15, 0], className: 'stop-label' });
      mk.on('dragend', () => {
        const ll = mk.getLatLng();
        if (!ZB.contains(ll)) { toast('Les arrêts doivent rester dans la zone de sortie.'); drawStops(); return; }
        const [lon, lat] = M.snap(ll.lng, ll.lat); s.lon = lon; s.lat = lat; recompute();
      });
      mk.on('click', () => openPanel(i === 0 ? 'itineraire' : 'science', i));
      stopLayer.addLayer(mk);
    });
  }
  function recompute() {
    plan = M.plan(stops);
    const ll = (pts) => pts.map((p) => xyToLL(p));
    route.safe.setLatLngs(ll(plan.safePts)); route.glow.setLatLngs(ll(plan.safePts));
    route.short.setLatLngs(compare ? ll(plan.shortPts) : []);
    route.hit.setLatLngs(ll(plan.safePts));
    simReset(); drawStops(); updateRing(); renderSummary(); renderLegend();
    if (panel && panel !== 'couches') renderPanel();
  }
  function addStop(lat, lon) {
    if (!ZB.contains([lat, lon])) { toast('Hors de la zone de sortie : pas de données de terrain détaillées ici.'); return; }
    const [sl, sa] = M.snap(lon, lat);
    freeCount++;
    stops.push({ id: String(stops.length), name: 'Arrêt libre ' + freeCount, kind: 'free', lon: sl, lat: sa });
    setAdding(false); recompute(); openPanel('itineraire');
  }
  function setAdding(on) { adding = on; document.body.classList.toggle('adding', on); if (on) toast('Cliquez sur la carte pour placer l’arrêt.'); if (panel === 'itineraire') renderPanel(); }

  function alerts() {
    const out = [], p = plan, sh = p.short, sf = p.safe;
    if (p.unreachable) out.push(['bad', 'Un arrêt est inaccessible : il est entouré de pentes de plus de 20°.']);
    if (p.marginMin < 0) out.push(['bad', 'Le trajet dépasse l’autonomie de ' + nf(-p.marginMin) + ' min. Retirez un arrêt ou raccourcissez les mesures.']);
    else if (p.marginMin < 20) out.push(['warn', 'Marge faible : ' + nf(p.marginMin) + ' min avant la limite de retour.']);
    if (sf.blockedLen > 0) out.push(['bad', 'Le trajet passe par ' + nf(sf.blockedLen) + ' m de pentes de plus de 20°.']);
    if (sf.sandLen > 0) out.push(['warn', 'IA : ' + nf(sf.sandLen) + ' m de dunes impossibles à éviter. Avancez lentement.']);
    if (sf.steepLen > 0 && sf.blockedLen === 0) out.push(['info', 'IA : ' + nf(sf.steepLen) + ' m de pente raide sur le trajet, jusqu’à ' + nf(sf.maxS) + '°.']);
    if (sf.roughLen > 0) out.push(['info', 'IA : ' + nf(sf.roughLen) + ' m de terrain rocheux. Regardez où vous posez les pieds.']);
    if (sh.sandLen > sf.sandLen || sh.blockedLen > 0 || sh.roughLen > sf.roughLen) {
      const parts = [];
      if (sh.sandLen > sf.sandLen) parts.push(nf(sh.sandLen) + ' m de dunes');
      if (sh.roughLen > sf.roughLen) parts.push(nf(sh.roughLen) + ' m de rochers');
      if (sh.blockedLen > 0) parts.push(nf(sh.blockedLen) + ' m de pentes interdites');
      out.push(['ok', 'Contournement : la ligne droite traverserait ' + parts.join(' et ') + ' (+' + nf(Math.max(0, sf.dist - sh.dist)) + ' m pour l’éviter).']);
    }
    if (!out.some((a) => a[0] === 'bad' || a[0] === 'warn')) out.unshift(['ok', 'Trajet dans les limites : marge de ' + nf(p.marginMin) + ' min.']);
    return out;
  }
  const alertHtml = (a) => '<li class="alert ' + a[0] + '"><span>' + esc(a[1]) + '</span></li>';

  // =====================================================================
  // Simulation de la sortie (position simulée : pas de GPS sur Mars)
  // =====================================================================
  const sim = { t: 0, playing: false, timer: 0, phases: [], total: 0, next: 1 };
  function simReset() {
    sim.playing = false; clearInterval(sim.timer); sim.t = 0; sim.phases = []; let t = 0;
    const n = stops.length;
    plan.legs.forEach((leg, i) => {
      const dur = leg.safeM.dist / 1000 / H.speedKmh * 60;
      sim.phases.push({ type: 'walk', t0: t, t1: t + dur, d0: plan.stopAt[i], d1: plan.stopAt[i + 1], to: (i + 1) % n }); t += dur;
      if (i < plan.legs.length - 1) { sim.phases.push({ type: 'stop', t0: t, t1: t + H.stopMin, at: i + 1, d: plan.stopAt[i + 1] }); t += H.stopMin; }
    });
    sim.total = t; sim.next = 1;
    const b = $('#simPlay'); if (b) b.textContent = '▶ Démarrer la sortie';
    placeMe(); updateHud();
  }
  function simState() {
    const ph = sim.phases.find((p) => sim.t < p.t1) || sim.phases[sim.phases.length - 1];
    const d = ph.type === 'walk' ? ph.d0 + (ph.d1 - ph.d0) * Math.min(1, (sim.t - ph.t0) / (ph.t1 - ph.t0)) : ph.d;
    return { ph, d, done: sim.t >= sim.total };
  }
  function placeMe() {
    const st = simState(), a = M.along(plan.safePts, st.d), [lon, lat] = M.toLL(a.x, a.y);
    meMarker.setLatLng([lat, lon]);
    sim.next = st.ph.type === 'walk' ? st.ph.to : st.ph.at;
    return { st, a, lat, lon };
  }
  function simToggle() {
    if (sim.t >= sim.total) simReset();
    sim.playing = !sim.playing;
    $('#simPlay').textContent = sim.playing ? '❚❚ Pause' : '▶ Reprendre';
    clearInterval(sim.timer);
    if (sim.playing) sim.timer = setInterval(() => {
      sim.t = Math.min(sim.total, sim.t + 0.5);
      const prev = sim.next;
      const { lat, lon } = placeMe();
      if (prev !== sim.next) drawStops();
      if (document.body.classList.contains('mode-casque')) map.panTo([lat, lon], { animate: false });
      updateHud();
      if (sim.t >= sim.total) { sim.playing = false; clearInterval(sim.timer); $('#simPlay').textContent = '↺ Recommencer'; }
    }, 120);
  }
  function updateHud() {
    if (!plan || !sim.phases.length) return;
    const { st, a, lat, lon } = placeMe();
    const ph = st.ph, n = stops.length;
    const remainO2 = Math.max(0, H.budgetMin - sim.t), pct = remainO2 / H.budgetMin;
    $('#hudO2').textContent = 'O₂ ' + nf(pct * 100) + ' %';
    $('#hudO2Fill').style.width = (pct * 100).toFixed(1) + '%';
    $('#hudO2Fill').style.background = pct > 0.4 ? COL.safe : pct > 0.2 ? COL.o : COL.r;
    $('#hudRet').textContent = 'Retour avant ' + clock(H.budgetMin);
    $('#simClock').textContent = clock(sim.t);
    const target = stops[sim.next] || stops[0];
    const [tx, ty] = M.toXY(target.lon, target.lat);
    const bearing = (Math.atan2(tx - a.x, -(ty - a.y)) * 180 / Math.PI + 360) % 360;
    $('#hudArrow').style.transform = 'rotate(' + ((bearing - a.heading + 540) % 360 - 180).toFixed(0) + 'deg)';
    let line;
    if (st.done) {
      $('#hudDist').textContent = 'Habitat'; $('#hudNext').textContent = 'Sortie terminée';
      line = 'Sortie terminée à ' + clock(sim.total) + '. Marge restante : ' + nf(H.budgetMin - sim.total) + ' min.';
    } else if (ph.type === 'walk') {
      const left = ph.d1 - st.d, mins = left / 1000 / H.speedKmh * 60;
      $('#hudDist').textContent = left >= 1000 ? km(left) + ' km' : nf(Math.round(left / 10) * 10) + ' m';
      $('#hudNext').textContent = (ph.to === 0 ? 'Retour · ' : 'Arrêt ' + ph.to + ' · ') + target.name;
      line = (ph.to === 0 ? 'Habitat' : 'Arrêt ' + ph.to) + ' dans ' + nf(Math.max(1, mins)) + ' min. Marge oxygène : ' + nf(plan.marginMin) + ' min.';
    } else {
      const s = stops[ph.at];
      $('#hudDist').textContent = 'Arrêt ' + ph.at; $('#hudNext').textContent = 'Mesures · encore ' + nf(Math.ceil(ph.t1 - sim.t)) + ' min';
      line = s.tasks ? s.tasks[0] + '.' : 'Faites vos mesures, puis reprenez le trajet.';
    }
    $('#hudAi').textContent = '« ' + line + ' »';
    // Alerte : regard 120 m devant sur le trajet
    let al = null;
    if (!st.done && ph.type === 'walk') {
      for (let d = 10; d <= 120 && !al; d += 10) {
        const p = M.along(plan.safePts, st.d + d), k = M.cellOf(p.x, p.y);
        if (M.slope[k] > 15 || M.cls[k] === 4) al = ['bad', 'Pente ' + nf(M.slope[k]) + '° dans ' + d + ' m'];
        else if (M.cls[k] === 1) al = ['warn', 'Dunes dans ' + d + ' m · restez sur le tracé'];
        else if (M.cls[k] === 2 && d <= 40) al = ['warn', 'Rochers dans ' + d + ' m · ralentissez'];
      }
    }
    if (!al && plan.marginMin < 20) al = ['warn', 'Marge faible : ' + nf(plan.marginMin) + ' min'];
    const box = $('#hudAlert');
    box.hidden = !al; if (al) { box.className = 'hud-alert' + (al[0] === 'warn' ? ' warn' : ''); box.textContent = al[1]; }
    return { lat, lon };
  }

  // =====================================================================
  // Assistant (hors ligne : réponses rédigées à partir des faits calculés)
  // =====================================================================
  const SRC = {
    hirise: ['MRO · HiRISE', 'view:sat'], ctx: ['MRO · CTX', 'view:sat'], viking: ['Viking · VIS', 'view:sat'],
    dem: ['MRO · HiRISE (MNT)', 'ov:slope'], mola: ['MGS · MOLA', 'view:relief'], hrsc: ['MEX · HRSC', 'view:relief'],
    themis: ['Mars Odyssey · THEMIS', 'view:therm'], crism: ['MRO · CRISM', 'ov:min'], ai: ['IA · terrain', 'ov:haz'], life: ['IA · potentiel de vie', 'ov:life'],
    rems: ['Curiosity · REMS', 'panel:securite'], rad: ['Curiosity · RAD', 'panel:securite'], calc: ['Calcul ARES NAV', 'panel:itineraire']
  };
  const EXPLAIN = {
    sat: () => ['La vue satellite assemble trois caméras en orbite : Viking pour toute la planète (232 m par pixel), CTX sur le cratère Gale (6 m) et HiRISE autour de la route de Curiosity (jusqu’à 0,3 m). Plus vous zoomez, plus l’image est fine.', ['viking', 'ctx', 'hirise']],
    relief: () => ['La vue relief colore l’altitude : bleu pour les creux, rouge et blanc pour les sommets (MOLA et HRSC). Dans la zone de sortie, le relief vient du modèle de terrain HiRISE : de ' + nf(M.eMin) + ' à ' + nf(M.eMax) + ' m.', ['mola', 'hrsc', 'dem']],
    therm: () => ['La vue thermique montre la température du sol la nuit, mesurée par THEMIS. La roche garde la chaleur et paraît claire ; le sable et la poussière refroidissent vite et paraissent sombres. Clair : sol dur, marche facile. Sombre : sol meuble.', ['themis']],
    slope: () => ['La couche pentes est calculée sur le modèle de terrain HiRISE. Jaune : 10 à 15°. Orange : 15 à 20°. Rouge hachuré : plus de 20°, interdit à pied. Le modèle est précis à environ 18 m en altitude : les petits obstacles n’y figurent pas.', ['dem']],
    haz: () => ['Un modèle d’apprentissage non supervisé (k-moyennes) a classé chaque parcelle de 20 m d’après la luminosité et la texture de l’image HiRISE et la pente du relief. Il en sort cinq types de terrain ; trois sont des dangers : les dunes (où l’on s’enfonce), la roche rugueuse et les pentes raides. ' + M.HAZARDS.length + ' zones sont signalées, chacune avec un indice de confiance. Le trajet les contourne.', ['ai', 'hirise', 'dem']],
    life: () => ['Le potentiel de vie est un score simulé : il est fort là où se trouvent des minéraux formés avec de l’eau (argiles, hématite, d’après CRISM) et des affleurements de roche claire. Les ' + M.TARGETS.length + ' cibles proposées sont accessibles à pied et espacées d’au moins 500 m. À confirmer par les mesures au sol.', ['life', 'crism']],
    min: () => ['La couche minéraux situe deux cibles : la crête riche en hématite et l’unité riche en argiles, deux minéraux formés en présence d’eau. Les contours sont approximatifs, tracés d’après les cartes CRISM publiées.', ['crism']],
    zones: () => ['La zone de sortie couvre 4,7 × 3,5 km de données détaillées. Le rayon de retour (' + km(returnRadius()) + ' km) montre jusqu’où aller et revenir dans l’autonomie, arrêts compris.', ['calc']],
    pois: () => ['Les points à connaître sont des lieux nommés : le cratère Gale, le mont Sharp, le site d’atterrissage de Curiosity et les formations étudiées par le rover.', ['hirise']]
  };
  const chat = [];
  function say(text, src) { return { text, src: src || [] }; }
  function legSafety(n) {
    if (!(n >= 1 && n < stops.length)) return say('Il n’y a pas d’arrêt ' + n + ' sur le trajet actuel.', ['calc']);
    const l = plan.legs[n - 1];
    let t = (l.safeM.blockedLen > 0 ? 'Non : le trajet franchit des pentes de plus de 20°.' : 'Oui.') + ' Le trajet vers l’arrêt ' + n + ' fait ' + km(l.safeM.dist) + ' km, pente maximale ' + nf(l.safeM.maxS) + '°.';
    if (l.shortM.sandLen > 0 || l.shortM.blockedLen > 0) t += ' La ligne droite traverserait ' + (l.shortM.sandLen > 0 ? nf(l.shortM.sandLen) + ' m de sable' : nf(l.shortM.blockedLen) + ' m de pentes interdites') + ' : le trajet proposé les contourne.';
    if (l.safeM.sandLen > 0) t += ' Attention : ' + nf(l.safeM.sandLen) + ' m de sable restent inévitables.';
    if (l.safeM.maxS > 15) t += ' Passage raide : avancez lentement.';
    return say(t, ['ai', 'dem', 'calc']);
  }
  function briefing() {
    const p = plan, names = stops.slice(1).map((s, i) => s.name.toLowerCase() + ' (' + (i + 1) + ')').join(', ');
    return say('Sortie de ' + hm(p.totalMin) + ' pour ' + H.crew + ' astronautes, départ ' + clock(0) + '. Trajet de ' + km(p.safe.dist) + ' km : ' + names + ', puis retour à l’habitat. Dénivelé +' + nf(p.safe.asc) + ' m, pente maximale ' + nf(p.safe.maxS) + '°.' +
      (p.short.sandLen > 0 ? ' Le trajet contourne ' + nf(p.short.sandLen) + ' m de dunes.' : '') +
      ' Conditions types : air entre −80 et 0 °C, pression ≈ 8 hPa, dose ≈ 0,64 mSv par jour. Retour au plus tard ' + clock(H.budgetMin) + ' : marge de ' + nf(p.marginMin) + ' min.', ['calc', 'dem', 'rems', 'rad']);
  }
  function margin() {
    const p = plan;
    return say('Trajet prévu : ' + hm(p.totalMin) + ', retour à ' + clock(p.totalMin) + '. Limite : ' + clock(H.budgetMin) + '. Marge : ' + nf(p.marginMin) + ' min.' +
      (p.marginMin > 0 ? ' Si chaque arrêt dure 10 min de plus, elle passe à ' + nf(p.marginMin - 10 * (stops.length - 1)) + ' min.' : ' Retirez un arrêt pour revenir dans l’autonomie.'), ['calc']);
  }
  function pointSummary(lat, lon) {
    const i = M.pointInfo(lon, lat), [hx, hy] = M.toXY(stops[0].lon, stops[0].lat);
    if (!i.inside) return say('Ce point est hors de la zone de sortie : je n’ai pas de données de terrain détaillées ici.', []);
    return say('Altitude ' + nf(i.elev) + ' m, pente ' + nf(i.slope) + '°. L’IA y voit : ' + i.className + ' (confiance ' + nf(i.conf * 100) + ' %). ' +
      'Unité : ' + unitAt(i.x, i.y) + ', potentiel de vie ' + nf(M.life[i.k] * 100) + ' % (simulé). À ' + km(Math.hypot(i.x - hx, i.y - hy)) + ' km de l’habitat à vol d’oiseau' + (i.blocked ? ' ; pente interdite à pied.' : '.'), ['ai', 'dem', 'life']);
  }
  function answer(q) {
    const s = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const want = (re) => re.test(s);
    if (want(/\b(affiche|montre|active|passe)\b/)) {
      if (want(/thermi/)) { setView('therm'); return say('Vue thermique affichée.', ['themis']); }
      if (want(/relief|altitude/)) { setView('relief'); return say('Vue relief affichée.', ['mola', 'dem']); }
      if (want(/satell|image/)) { setView('sat'); return say('Vue satellite affichée.', ['hirise']); }
      if (want(/pente/)) { setOverlay('slope', true); return say('Couche pentes affichée.', ['dem']); }
      if (want(/sable|dune|danger/)) { setOverlay('haz', true); return say('Couche des dangers détectés par l’IA affichée.', ['ai']); }
      if (want(/vie|cible/)) { setOverlay('life', true); return say('Couche du potentiel de vie affichée.', ['life']); }
      if (want(/mineral|argile|hematite/)) { setOverlay('min', true); return say('Couche minéraux affichée.', ['crism']); }
    }
    if (want(/ajoute.*arret|nouvel arret/)) { setAdding(true); return say('Cliquez sur la carte pour placer le nouvel arrêt.', ['calc']); }
    if (want(/brief/)) return briefing();
    const m = s.match(/arret\s*(\d+)/);
    if (m) return legSafety(+m[1]);
    if (want(/danger|obstacle|piege/)) return routeHazards();
    if (want(/\bvie\b|vivant|biosignat|cible|trace/)) return lifeTargets();
    if (want(/\bsure?\b|risque|securi/)) return say(alerts().map((a) => a[1]).join(' '), ['calc', 'ai']);
    if (want(/marge|oxyg|\bo2\b|autonom|combien de temps|heure|retour/)) return margin();
    if (want(/meteo|temperat|vent|pression|\buv\b|radiat|dose/)) return say('Conditions types au mont Sharp, mesurées par Curiosity (pas du direct) : air entre −80 et 0 °C dans la journée, pression ≈ 8 hPa, vent faible le plus souvent, UV élevés, dose ≈ 0,64 mSv par jour.', ['rems', 'rad']);
    if (want(/thermi|themis/)) return say(...EXPLAIN.therm());
    if (want(/pente|relief|altitude|mnt|mola/)) return say(...EXPLAIN.slope());
    if (want(/sable|dune|ia|intelligence/)) return say(...EXPLAIN.haz());
    if (want(/mineral|crism|argile|hematite/)) return say(...EXPLAIN.min());
    if (want(/image|hirise|ctx|satellite|photo/)) return say(...EXPLAIN.sat());
    if (want(/ou suis|position/)) { const ll = meMarker.getLatLng(); return pointSummary(ll.lat, ll.lng); }
    return say('Je ne trouve pas cette information dans les données chargées. Je peux répondre sur le trajet, la marge d’oxygène, les conditions types et les couches de la carte.', []);
  }
  function routeHazards() {
    const sf = plan.safe, sh = plan.short, parts = [];
    if (sf.sandLen) parts.push(nf(sf.sandLen) + ' m de dunes');
    if (sf.roughLen) parts.push(nf(sf.roughLen) + ' m de terrain rocheux');
    if (sf.steepLen) parts.push(nf(sf.steepLen) + ' m de pente raide (jusqu’à ' + nf(sf.maxS) + '°)');
    return say('Sur le trajet sûr, l’IA signale ' + (parts.join(', ') || 'aucun danger') + '. La ligne droite aurait traversé ' + nf(sh.sandLen) + ' m de dunes et ' + nf(sh.roughLen) + ' m de rochers. Dans toute la zone, ' + M.HAZARDS.length + ' zones dangereuses sont détectées.', ['ai', 'dem', 'calc']);
  }
  function lifeTargets() {
    const [hx, hy] = M.toXY(stops[0].lon, stops[0].lat);
    const list = M.TARGETS.slice(0, 3).map((t, i) => 'cible ' + (i + 1) + ' à ' + km(Math.hypot(t.x - hx, t.y - hy)) + ' km (' + nf(t.score * 100) + ' %, ' + t.unit.replace(' (approx.)', '') + ')').join(', ');
    setOverlay('life', true);
    return say('Les meilleurs endroits pour chercher des traces de vie passée sont là où l’eau a laissé des minéraux : ' + list + '. Score simulé, à confirmer par les mesures au sol. Cliquez sur une cible pour l’ajouter à l’itinéraire.', ['life', 'crism']);
  }
  function ask(q, a) {
    chat.push({ q }, { a: a || answer(q) });
    openPanel('assistant');
  }

  // =====================================================================
  // Interface : panneaux, bilan, légende, vues
  // =====================================================================
  let panel = null, panelArg = null;
  const TITLES = { lieux: 'Carte', couches: 'Couches', itineraire: 'Itinéraire', securite: 'Sécurité', science: 'Science', assistant: 'Assistant' };
  function openPanel(k, arg) {
    panel = k; panelArg = arg;
    $('#drawer').hidden = false;
    $('#drawerTitle').textContent = TITLES[k];
    $$('.rail button').forEach((b) => b.classList.toggle('on', b.dataset.panel === k));
    renderPanel();
  }
  function closePanel() { panel = null; $('#drawer').hidden = true; $$('.rail button').forEach((b) => b.classList.remove('on')); }

  function renderPanel() {
    const body = $('#drawerBody');
    const html = { lieux: pLieux, couches: pCouches, itineraire: pItineraire, securite: pSecurite, science: pScience, assistant: pAssistant }[panel]();
    body.innerHTML = html;
    if (panel === 'itineraire') drawProfile($('#profile'));
    // Défilement du panneau seulement (scrollIntoView ferait défiler toute la page).
    if (panel === 'assistant') body.scrollTop = body.scrollHeight;
    if (panel === 'science' && panelArg != null) { const f = $('#fiche' + panelArg); if (f) body.scrollTop = f.offsetTop - 10; }
  }
  const area = (test) => { let n = 0; for (let k = 0; k < M.NX * M.NY; k++) if (test(k)) n++; return n * M.C * M.C / 10000; };
  const AREA = { sand: area((k) => M.sand[k]), steep: area((k) => M.slope[k] > 20) };
  function pLieux() {
    const place = (icon, name, sub, act, extra) => '<button class="place" data-act="' + act + '"' + (extra || '') + '><i class="' + icon + '"></i><span><b>' + esc(name) + '</b><small>' + esc(sub) + '</small></span><em>Voir</em></button>';
    return '<div class="sec"><span class="label">Points à connaître</span>' +
      POIS.map((p, i) => place('', p.name, p.sub, 'poi', ' data-i="' + i + '"')).join('') +
      stops.map((s, i) => place(i ? '' : 'sq', (i ? 'Arrêt ' + i + ' · ' : '') + s.name, i ? (s.goal || 'Arrêt ajouté par l’équipage') : 'Départ et retour de la sortie', 'stop', ' data-i="' + i + '"')).join('') + '</div>' +
      '<div class="sec"><span class="label">Zones de référence</span>' +
      place('zone', 'Zone de sortie', '4,7 × 3,5 km couverts par HiRISE (image et relief)', 'zone') +
      place('zone', 'Rayon de retour', km(returnRadius()) + ' km autour de l’habitat, arrêts compris', 'ring') +
      place('zone', 'Dangers détectés par l’IA', M.HAZARDS.length + ' zones : dunes, rochers, pentes raides', 'ov', ' data-k="haz"') +
      place('zone', 'Cibles scientifiques (IA)', M.TARGETS.length + ' sites où chercher des traces de vie', 'ov', ' data-k="life"') +
      place('zone', 'Pentes de plus de 20°', nf(AREA.steep, 1) + ' ha interdits à pied', 'ov', ' data-k="slope"') +
      place('zone', 'Hématite et argiles', 'Cibles minérales (CRISM, contours approx.)', 'ov', ' data-k="min"') + '</div>';
  }
  function viewLegend(k) {
    if (k === 'sat') return '<div class="swatches"><span>Image en lumière visible</span></div>';
    if (k === 'relief') return '<div class="scale-bar" style="background:linear-gradient(90deg,rgb(32,52,120),rgb(40,140,160),rgb(120,180,90),rgb(220,170,70),rgb(250,240,230))"></div><div class="scale-lab"><span>' + nf(M.eMin) + ' m</span><span>zone de sortie</span><span>' + nf(M.eMax) + ' m</span></div>';
    return '<div class="scale-bar" style="background:linear-gradient(90deg,#111,#888,#eee)"></div><div class="scale-lab"><span>froid · sable</span><span>chaud · roche</span></div>';
  }
  const VIEW_SRC = { sat: 'Viking VIS · MRO CTX · MRO HiRISE', relief: 'MGS MOLA · Mars Express HRSC · MNT HiRISE', therm: 'Mars Odyssey THEMIS · infrarouge de nuit, 100 m/px' };
  function ovSection(title, keys) {
    return '<div class="sec"><span class="label">' + title + '</span>' + keys.map((k) => {
      const o = OV[k], chip = /IA/.test(o.tag) ? 'ai' : o.tag === 'Approx.' ? 'sim' : 'real';
      return '<div class="layer"><div class="layer-top"><label><input type="checkbox" data-act="ov" data-k="' + k + '"' + (o.on ? ' checked' : '') + '>' + o.label + '</label><span class="chip ' + chip + '">' + o.tag + '</span><button class="explain" data-act="explain" data-k="' + k + '">Expliquer</button></div>' +
        (['slope', 'haz', 'life', 'min'].includes(k) ? '<div class="opacity">Opacité<input type="range" min="0" max="1" step="0.05" value="' + o.opacity + '" data-op="' + k + '"></div>' : '') +
        o.legend + '<span class="src layer-meta">' + o.src + '</span></div>';
    }).join('') + '</div>';
  }
  function pCouches() {
    return '<div class="sec"><span class="label">Vue</span><div class="viewpick">' +
      Object.entries(VIEWS).map(([k, v]) => '<button data-act="view" data-k="' + k + '" class="' + (k === view ? 'on' : '') + '"><span style="background-image:url(' + v.thumb + ')"></span>' + v.label + '</button>').join('') + '</div>' +
      '<div class="layer"><div class="layer-top"><label>' + VIEWS[view].label + '</label><button class="explain" data-act="explain" data-k="' + view + '">Expliquer</button></div>' + viewLegend(view) + '<span class="src" style="margin-left:0">' + VIEW_SRC[view] + '</span></div></div>' +
      ovSection('Intelligence artificielle', ['haz', 'life']) + ovSection('Couches de données', ['slope', 'min', 'zones', 'pois']) +
      '<div class="sec"><label class="check" style="margin:0"><input type="checkbox" data-act="online"' + (ONLINE ? ' checked' : '') + '>Explorer hors de Gale (tuiles NASA Mars Trek en ligne)</label><p class="note">Désactivé par défaut : toute la zone de sortie fonctionne sans connexion.</p></div>';
  }
  function pItineraire() {
    const p = plan, n = stops.length;
    const list = stops.map((s, i) => '<li class="stop"><span class="n' + (i ? '' : ' h') + '">' + stopLabel(i) + '</span><span><b>' + esc(s.name) + '</b><small>' +
      (i ? 'arrivée ' + clock(p.arrive[i]) + ' · ' + km(p.stopAt[i]) + ' km' : 'départ ' + clock(0) + ' · retour ' + clock(p.totalMin)) + '</small></span>' +
      '<span class="acts">' + (i ? '<button data-act="up" data-i="' + i + '" aria-label="Monter"' + (i < 2 ? ' disabled' : '') + '>↑</button><button data-act="down" data-i="' + i + '" aria-label="Descendre"' + (i === n - 1 ? ' disabled' : '') + '>↓</button><button data-act="del" data-i="' + i + '" aria-label="Supprimer">✕</button>' : '') + '</span></li>').join('');
    return '<div class="sec"><span class="label">Arrêts · glisser-déposer sur la carte</span><ul class="stops">' + list + '</ul>' +
      '<div class="row"><button class="btn ' + (adding ? 'on' : 'primary') + '" data-act="add">' + (adding ? 'Cliquez sur la carte…' : '+ Ajouter un arrêt') + '</button><button class="btn" data-act="reset">Sortie de référence</button></div>' +
      '<label class="check"><input type="checkbox" data-act="compare"' + (compare ? ' checked' : '') + '>Comparer avec le trajet le plus court</label></div>' +
      '<div class="sec"><span class="label">Bilan du trajet sûr</span><div class="kpis"><div><b>' + km(p.safe.dist) + '</b><span>km</span></div><div><b>' + hm(p.totalMin) + '</b><span>durée</span></div><div><b>+' + nf(p.safe.asc) + '</b><span>m montée</span></div><div><b style="color:' + (p.safe.maxS > 20 ? COL.r : p.safe.maxS > 15 ? COL.o : COL.safe) + '">' + nf(p.safe.maxS) + '°</b><span>pente max</span></div></div>' +
      '<canvas id="profile" aria-label="Profil d’altitude du trajet"></canvas><p class="note">Profil d’altitude ; couleur = pente. Calcul A* sur le terrain HiRISE : pente &gt; 20° interdite, sable évité.</p></div>' +
      (compare ? '<div class="sec"><span class="label">Comparaison</span><div class="kpis" style="grid-template-columns:auto 1fr 1fr"><div></div><div><span>Plus court</span></div><div><span>Plus sûr</span></div>' +
        '<div><span>Distance</span></div><div><b>' + km(p.short.dist) + ' km</b></div><div><b>' + km(p.safe.dist) + ' km</b></div>' +
        '<div><span>Sable</span></div><div><b style="color:' + (p.short.sandLen ? COL.o : COL.ink) + '">' + nf(p.short.sandLen) + ' m</b></div><div><b>' + nf(p.safe.sandLen) + ' m</b></div>' +
        '<div><span>Pente max</span></div><div><b style="color:' + (p.short.maxS > 20 ? COL.r : COL.ink) + '">' + nf(p.short.maxS) + '°</b></div><div><b>' + nf(p.safe.maxS) + '°</b></div></div></div>' : '');
  }
  function pSecurite() {
    const p = plan, c = p.marginMin < 0 ? COL.r : p.marginMin < 20 ? COL.o : COL.safe;
    return '<div class="sec"><span class="label">Alertes</span><ul class="alerts">' + alerts().map(alertHtml).join('') + '</ul></div>' +
      '<div class="sec"><span class="label">Autonomie · oxygène <span class="chip sim" style="float:right">Simulé</span></span><div class="gauge" style="--c:' + c + '"><i style="width:' + Math.min(100, p.o2Used * 100).toFixed(1) + '%"></i></div>' +
      '<dl class="cond" style="margin-top:12px"><div><dt>Départ</dt><dd>' + clock(0) + '</dd></div><div><dt>Retour prévu</dt><dd>' + clock(p.totalMin) + '</dd></div><div><dt>Retour au plus tard</dt><dd>' + clock(H.budgetMin) + '</dd></div><div><dt>Marge</dt><dd style="color:' + c + '">' + nf(p.marginMin) + ' min</dd></div></dl></div>' +
      '<div class="sec"><span class="label">Conditions types · mont Sharp</span><dl class="cond"><div><dt>Air</dt><dd>−80 à 0 °C</dd></div><div><dt>Pression</dt><dd>≈ 8 hPa</dd></div><div><dt>Vent</dt><dd>faible</dd></div><div><dt>UV</dt><dd>élevés</dd></div><div><dt>Radiation</dt><dd>≈ 0,64 mSv/j</dd></div><div><dt>Poussière</dt><dd>saisonnière</dd></div></dl>' +
      '<span class="src">Curiosity · REMS et RAD · mesures passées, présentées comme conditions types, pas du direct</span></div>' +
      '<div class="sec"><span class="label">Hypothèses de l’équipe</span><dl class="hyp"><div><dt>Équipage</dt><dd>' + H.crew + ' astronautes</dd></div><div><dt>Sortie</dt><dd>' + hm(H.budgetMin) + ' max.</dd></div><div><dt>Marche</dt><dd>' + H.speedKmh + ' km/h</dd></div><div><dt>Pente max.</dt><dd>' + H.maxSlope + '°</dd></div><div><dt>Par arrêt</dt><dd>' + H.stopMin + ' min</dd></div><div><dt>Départ</dt><dd>' + clock(0) + '</dd></div></dl><p class="note">Points de départ à valider, pas des chiffres NASA.</p></div>';
  }
  function pScience() {
    return stops.map((s, i) => {
      if (!i) return '';
      const inf = M.pointInfo(s.lon, s.lat);
      return '<div class="fiche" id="fiche' + i + '"><h3><span class="stopmk" style="width:22px;height:22px;font-size:11px">' + i + '</span>' + esc(s.name) + '</h3>' +
        '<p>' + esc(s.goal || 'Objectif à définir par l’équipage.') + '</p>' +
        (s.tasks ? '<span class="label">Mesures</span><ul>' + s.tasks.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
        (s.tools ? '<span class="label">À emporter</span><ul>' + s.tools.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
        '<div class="meta">Arrivée ' + clock(plan.arrive[i]) + ' · altitude ' + nf(inf.elev) + ' m · pente ' + nf(inf.slope) + '° · ' + (inf.sand ? 'sable' : 'roche') + ' · ' + unitAt(inf.x, inf.y) + '</div>' +
        '<div class="row"><button class="btn" data-act="stop" data-i="' + i + '">Voir sur la carte</button><button class="btn" data-act="asklag" data-i="' + i + '">Le trajet est-il sûr ?</button></div></div>';
    }).join('') || '<p class="note">Ajoutez des arrêts dans l’itinéraire.</p>';
  }
  function pAssistant() {
    const log = chat.map((m) => m.q ? '<div class="msg-q">' + esc(m.q) + '</div>' :
      '<div class="msg-a"><span class="who">ARES · assistant</span><p>' + esc(m.a.text) + '</p>' +
      (m.a.src.length ? '<div class="tags">' + m.a.src.map((k) => '<button data-act="src" data-a="' + SRC[k][1] + '">' + SRC[k][0] + '</button>').join('') + '</div>' : '') + '</div>').join('');
    return '<div class="sec"><span class="chip ai">Hors ligne</span> <span class="note">Réponses rédigées à partir des faits calculés par l’application.</span></div>' +
      '<div class="chat" id="chatLog">' + (log || '<p class="note">Posez une question sur la sortie, ou choisissez une suggestion.</p>') + '</div>' +
      '<div class="sec"><div class="sugg">' + ['Génère le briefing de sortie', 'Quels dangers sur le trajet ?', 'Où chercher des traces de vie ?', 'Combien de marge me reste-t-il ?'].map((q) => '<button data-act="q">' + q + '</button>').join('') + '</div>' +
      '<form class="ask" id="askForm"><input id="askIn" placeholder="Votre question…" autocomplete="off" aria-label="Question à l’assistant"><button class="btn primary">Envoyer</button></form></div>';
  }

  function drawProfile(cv) {
    if (!cv) return;
    // Survol du profil : le point correspondant s'affiche sur la carte.
    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect(), dd = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * plan.safe.dist;
      const a = M.along(plan.safePts, dd), k = M.cellOf(a.x, a.y);
      profMk.setLatLng(xyToLL([a.x, a.y])).addTo(map);
      cv.title = km(dd) + ' km · ' + nf(M.elevAt(a.x, a.y)) + ' m · pente ' + nf(M.slope[k]) + '° · ' + M.CLASSES[M.cls[k]];
    });
    cv.addEventListener('mouseleave', () => map.removeLayer(profMk));
    const w = cv.clientWidth, h = cv.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * d; cv.height = h * d;
    const x = cv.getContext('2d'); x.scale(d, d);
    const prof = plan.safe.prof, lo = Math.min(...prof.map((p) => p.h)), hi = Math.max(...prof.map((p) => p.h)), L1 = plan.safe.dist;
    const n = Math.max(30, Math.floor(w / 5)), bw = w / n;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i / n * prof.length), b = Math.max(a + 1, Math.floor((i + 1) / n * prof.length));
      let hh = 0, ss = 0; for (let k = a; k < b; k++) { hh += prof[k].h; ss = Math.max(ss, prof[k].s); }
      hh /= (b - a);
      const bh = 10 + (hh - lo) / Math.max(1, hi - lo) * (h - 26);
      x.fillStyle = ss > 20 ? COL.r : ss > 15 ? COL.o : ss > 10 ? COL.y : COL.safe;
      x.globalAlpha = 0.85; x.fillRect(i * bw + 0.5, h - bh, bw - 1, bh);
    }
    x.globalAlpha = 1; x.font = '600 10px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.fillStyle = COL.ink;
    plan.stopAt.forEach((dd, i) => {
      const px = Math.min(w - 6, Math.max(6, dd / L1 * w));
      x.strokeStyle = 'rgba(242,237,232,.6)'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(px, 12); x.lineTo(px, h); x.stroke(); x.setLineDash([]);
      x.fillText(i === 0 || i === plan.stopAt.length - 1 ? 'H' : String(i), px, 9);
    });
    x.textAlign = 'left'; x.fillStyle = 'rgba(242,237,232,.7)'; x.fillText(nf(hi) + ' m', 3, 22);
  }

  function renderSummary() {
    const p = plan, al = alerts(), top = al.find((a) => a[0] === 'bad') || al.find((a) => a[0] === 'warn') || al[0];
    const c = p.marginMin < 0 ? COL.r : p.marginMin < 20 ? COL.o : COL.safe;
    $('#summary').innerHTML = '<span class="label"><span>Sortie · ' + (stops.length - 1) + ' arrêts</span><span class="chip sim">Simulé</span></span>' +
      '<p class="sum-path">' + stops.map((s, i) => stopLabel(i)).concat('H').join(' → ') + '</p>' +
      '<div class="kpis"><div><b>' + km(p.safe.dist) + '</b><span>km</span></div><div><b>' + hm(p.totalMin) + '</b><span>durée</span></div><div><b>+' + nf(p.safe.asc) + '</b><span>m</span></div><div><b>' + nf(p.safe.maxS) + '°</b><span>pente</span></div></div>' +
      '<div class="sum-o2"><div class="gauge" style="--c:' + c + '"><i style="width:' + Math.min(100, p.o2Used * 100).toFixed(1) + '%"></i></div>' +
      '<div class="row2"><span>Marge <b style="color:' + c + '">' + nf(p.marginMin) + ' min</b></span><span>retour ' + clock(p.totalMin) + ' · limite ' + clock(H.budgetMin) + '</span></div></div>' +
      '<ul class="alerts" style="margin:0;padding:0">' + alertHtml(top) + '</ul>' +
      '<div class="row"><button class="btn" data-act="open" data-k="itineraire">Itinéraire</button><button class="btn" data-act="brief">Briefing</button></div>';
  }
  function renderViews() {
    $('#views').innerHTML = Object.entries(VIEWS).map(([k, v]) => '<button type="button" data-k="' + k + '" class="' + (k === view ? 'on' : '') + '" style="background-image:url(' + v.thumb + ')" aria-pressed="' + (k === view) + '"><span>' + v.label + '</span></button>').join('');
  }
  function renderLegend() {
    const parts = ['<div class="lg"><b>' + VIEWS[view].label + '</b>' + viewLegend(view) + '<span class="src">' + VIEW_SRC[view] + '</span></div>'];
    ['haz', 'life', 'slope', 'min'].forEach((k) => { if (OV[k].on) parts.push('<div class="lg"><b>' + OV[k].label + '</b>' + OV[k].legend + '</div>'); });
    parts.push('<div class="lg"><b>Itinéraire</b><div class="swatches"><span><i style="border-top:3px solid #ff5a1f;height:0"></i>Plus sûr</span>' + (compare ? '<span><i style="border-top:2px dashed #fff;height:0"></i>Plus court</span>' : '') + '<span><i style="background:#5cc8ff;border-radius:50%;width:10px"></i>Ma position</span></div></div>');
    $('#legend').innerHTML = parts.join('');
  }
  function updateSrc() {
    const c = map.getCenter(), z = map.getZoom();
    let s = VIEW_SRC[view];
    if (view === 'sat') s = z >= 10 && STRIP.contains(c) ? 'MRO HiRISE · jusqu’à 0,3 m/px' : z >= 5 && GALE.contains(c) ? 'MRO CTX · 6 m/px' : 'Viking VIS · mosaïque couleur · 232 m/px';
    if (view === 'relief') s = z >= 11 && ZB.contains(c) ? 'MNT HiRISE étalonné sur MOLA · ombrage ARES NAV' : 'MGS MOLA + Mars Express HRSC · 200 m/px';
    $('#viewSrc').textContent = 'Source : ' + s;
    $$('.crumbs button').forEach((b) => b.classList.toggle('on', b.dataset.go === (z < 5 ? 'mars' : z < 11 ? 'gale' : 'zone')));
  }

  let toastT = 0;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }

  // ---------- Popup d'inspection (F8, A4) ----------
  let lastClick = null;
  function inspect(e) {
    const { lat, lng } = e.latlng; lastClick = [lat, lng];
    const i = M.pointInfo(lng, lat);
    const html = '<div class="pop"><h4>' + (i.inside ? 'Point de la zone' : 'Hors zone de sortie') + '</h4><dl><dt>Position</dt><dd>' + fmtLL(lat, lng) + '</dd>' +
      (i.inside ? '<dt>Altitude</dt><dd>' + nf(i.elev) + ' m</dd><dt>Pente</dt><dd style="color:' + (i.slope > 20 ? COL.r : i.slope > 15 ? COL.o : COL.ink) + '">' + nf(i.slope) + '°' + (i.blocked ? ' · interdit' : '') + '</dd><dt>Terrain (IA)</dt><dd style="color:' + (i.cls === 1 || i.cls === 4 ? COL.o : COL.ink) + '">' + i.className + ' · ' + nf(i.conf * 100) + ' %</dd><dt>Potentiel de vie</dt><dd>' + nf(M.life[i.k] * 100) + ' % (simulé)</dd><dt>Unité</dt><dd>' + unitAt(i.x, i.y) + '</dd>' : '<dt>Données</dt><dd>imagerie seule</dd>') +
      '</dl><div class="row">' + (i.inside ? '<button class="btn primary" data-pop="add">Ajouter un arrêt</button>' : '') + '<button class="btn" data-pop="ai">Synthèse IA</button></div></div>';
    L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(html).openOn(map);
  }
  map.on('popupopen', (e) => {
    const el = e.popup.getElement();
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pop]'); if (!b || !lastClick) return;
      map.closePopup();
      if (b.dataset.pop === 'add') addStop(lastClick[0], lastClick[1]);
      else ask('Synthèse du point ' + fmtLL(lastClick[0], lastClick[1]), pointSummary(lastClick[0], lastClick[1]));
    });
  });
  map.on('click', (e) => { if (adding) addStop(e.latlng.lat, e.latlng.lng); else inspect(e); });
  map.on('mousemove', (e) => {
    const { lat, lng } = e.latlng, i = M.pointInfo(lng, lat);
    $('#coord').textContent = fmtLL(lat, lng) + (i.inside ? ' · ' + nf(i.elev) + ' m · pente ' + nf(i.slope) + '°' + ' · IA : ' + i.className + ' ' + nf(i.conf * 100) + ' %' : '');
  });
  map.on('zoomend moveend', () => { updatePois(); updateSrc(); document.body.classList.toggle('map-z-low', map.getZoom() < 13); });

  // ---------- Événements de l'interface ----------
  function srcAction(a) {
    const [t, k] = a.split(':');
    if (t === 'view') setView(k); else if (t === 'ov') { setOverlay(k, true); if (!ZB.intersects(map.getBounds())) fitZone(); } else if (t === 'panel') openPanel(k);
  }
  $('#drawerBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, i = +b.dataset.i;
    if (a === 'poi') { const p = POIS[i]; map.flyTo([p.lat, p.lon], p.go, { duration: REDUCE ? 0 : 2 }); }
    else if (a === 'stop') { map.flyTo([stops[i].lat, stops[i].lon], 16, { duration: REDUCE ? 0 : 1.2 }); }
    else if (a === 'zone' || a === 'ring') fitZone();
    else if (a === 'ov' && b.tagName === 'BUTTON') { setOverlay(b.dataset.k, true); fitZone(); }
    else if (a === 'ov') setOverlay(b.dataset.k, b.checked);
    else if (a === 'view') setView(b.dataset.k);
    else if (a === 'explain') ask('Explique : ' + (VIEWS[b.dataset.k] ? 'vue ' + VIEWS[b.dataset.k].label.toLowerCase() : 'couche ' + OV[b.dataset.k].label.toLowerCase()), say(...EXPLAIN[b.dataset.k]()));
    else if (a === 'add') setAdding(!adding);
    else if (a === 'reset') { stops = M.DEFAULT_STOPS.map((s) => Object.assign({}, s)); freeCount = 0; recompute(); }
    else if (a === 'compare') { compare = b.checked; recompute(); }
    else if (a === 'online') { ONLINE = b.checked; Object.values(VIEWS).forEach((v) => v.layers.forEach((l) => l.redraw && l.redraw())); }
    else if (a === 'up' || a === 'down') { const j = a === 'up' ? i - 1 : i + 1; if (j >= 1 && j < stops.length) { [stops[i], stops[j]] = [stops[j], stops[i]]; recompute(); } }
    else if (a === 'del') { stops.splice(i, 1); recompute(); }
    else if (a === 'q') ask(b.textContent);
    else if (a === 'asklag') ask('Le trajet vers l’arrêt ' + i + ' est-il sûr ?');
    else if (a === 'src') srcAction(b.dataset.a);
  });
  $('#drawerBody').addEventListener('input', (e) => { const k = e.target.dataset.op; if (k) setOpacity(k, +e.target.value); });
  $('#drawerBody').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#askIn').value.trim(); if (v) ask(v); });
  $('#summary').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'open') openPanel(b.dataset.k); else ask('Génère le briefing de sortie'); });
  $$('.rail button').forEach((b) => b.addEventListener('click', () => (panel === b.dataset.panel ? closePanel() : openPanel(b.dataset.panel))));
  $('#drawerClose').addEventListener('click', closePanel);
  $('#views').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.k); });
  $('#zIn').addEventListener('click', () => map.zoomIn());
  $('#zOut').addEventListener('click', () => map.zoomOut());
  $('#myPos').addEventListener('click', () => map.flyTo(meMarker.getLatLng(), Math.max(15, map.getZoom()), { duration: REDUCE ? 0 : 1.2 }));
  const fitZone = () => map.flyToBounds(ZB, { paddingTopLeft: [innerWidth > 860 ? 420 : 10, 70], paddingBottomRight: [innerWidth > 860 ? 320 : 10, innerWidth > 860 ? 40 : 120], duration: REDUCE ? 0 : 1.5 });
  $('#toZone').addEventListener('click', fitZone);
  $$('.crumbs button').forEach((b) => b.addEventListener('click', () => {
    const go = b.dataset.go;
    if (go === 'mars') map.flyTo([0, 137], 2, { duration: REDUCE ? 0 : 2 });
    else if (go === 'gale') map.flyToBounds(GALE, { duration: REDUCE ? 0 : 2 });
    else fitZone();
  }));
  $$('.mode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#simPlay').addEventListener('click', simToggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (demo.on) demoStop(); else if (adding) setAdding(false); else if (panel) closePanel(); return; }
    if (/input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const keys = { 1: () => setView('sat'), 2: () => setView('relief'), 3: () => setView('therm'), d: () => (demo.on ? demoStop() : demoStart()),
      c: () => setMode(document.body.classList.contains('mode-casque') ? 'habitat' : 'casque'), i: () => setOverlay('haz', !OV.haz.on), v: () => setOverlay('life', !OV.life.on) };
    const f = keys[e.key.toLowerCase()]; if (f) { f(); e.preventDefault(); }
  });

  // ---------- Démo guidée : le scénario du cahier des charges, en 7 étapes ----------
  const demo = { on: false, i: 0, timer: 0, waits: [] };
  const later = (fn, ms) => demo.waits.push(setTimeout(fn, REDUCE ? 0 : ms));
  const DEMO = [
    { t: 'De la planète au site', x: 'ARES NAV part du globe de Mars et descend jusqu’à la zone de sortie : 4,7 × 3,5 km au pied du mont Sharp, imagés au mètre près.',
      run: () => { setMode('habitat'); closePanel(); map.flyTo([-2, 137], 3, { duration: REDUCE ? 0 : 1.6 }); later(() => map.flyToBounds(GALE, { duration: 2.4 }), 1900); later(fitZone, 4600); } },
    { t: 'Quatre missions, un seul endroit', x: 'Satellite (HiRISE), relief (modèle de terrain) puis thermique (THEMIS) : chaque vue répond à une question de l’équipage.',
      run: () => { openPanel('couches'); setView('relief'); later(() => setView('therm'), 2600); later(() => setView('sat'), 5200); } },
    { t: 'L’IA lit le terrain', x: () => 'Un modèle a classé chaque parcelle de 20 m : dunes, rochers, pentes raides. ' + M.HAZARDS.length + ' zones dangereuses, chacune avec un indice de confiance.',
      run: () => { setView('sat'); setOverlay('life', false); setOverlay('haz', true); fitZone(); } },
    { t: 'Où chercher la vie', x: () => M.TARGETS.length + ' cibles où l’eau a laissé des minéraux (argiles, hématite). Score simulé ; un clic ajoute une cible à l’itinéraire.',
      run: () => { setView('sat'); setOverlay('haz', true); setOverlay('life', true); } },
    { t: 'Le trajet le plus sûr', x: () => (stops.length - 1) + ' arrêts, ' + km(plan.safe.dist) + ' km, ' + hm(plan.totalMin) + '. Le calcul contourne ' + nf(plan.short.sandLen) + ' m de dunes et garde ' + nf(plan.marginMin) + ' min de marge.',
      run: () => { setView('sat'); setOverlay('life', false); if (!compare) { compare = true; recompute(); } openPanel('itineraire'); } },
    { t: 'Le briefing de l’assistant', x: 'L’assistant rédige le briefing à partir des faits calculés et cite ses sources. Sans connexion.',
      run: () => { setView('sat'); ask('Génère le briefing de sortie'); } },
    { t: 'En sortie : le casque', x: 'Flèche, distance, oxygène, alerte. La position avance sur le trajet (simulée : pas de GPS sur Mars).',
      run: () => { setView('sat'); setMode('casque'); if (!sim.playing) simToggle(); } }
  ];
  function demoShow(i) {
    demo.waits.forEach(clearTimeout); demo.waits = []; clearTimeout(demo.timer);
    demo.i = Math.max(0, Math.min(DEMO.length - 1, i));
    const s = DEMO[demo.i];
    $('#demoStep').textContent = 'Démo guidée · ' + (demo.i + 1) + ' / ' + DEMO.length;
    $('#demoTitle').textContent = s.t; $('#demoText').textContent = typeof s.x === 'function' ? s.x() : s.x;
    $('#demoPrev').disabled = demo.i === 0;
    $('#demoNext').textContent = demo.i === DEMO.length - 1 ? 'Terminer' : 'Suivant';
    const bar = $('#demoBar'); bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth;
    const dur = demo.i === DEMO.length - 1 ? 20000 : 8000;
    if (!REDUCE) { bar.style.transition = 'width ' + dur + 'ms linear'; bar.style.width = '100%'; }
    s.run();
    demo.timer = setTimeout(() => (demo.i < DEMO.length - 1 ? demoShow(demo.i + 1) : null), dur);
  }
  function demoStart() { demo.on = true; $('#demo').hidden = false; $('#hint').hidden = true; demoShow(0); }
  function demoStop() {
    demo.on = false; demo.waits.forEach(clearTimeout); clearTimeout(demo.timer); $('#demo').hidden = true;
    if (sim.playing) simToggle();
    setMode('habitat');
  }
  $('#demoBtn').addEventListener('click', () => (demo.on ? demoStop() : demoStart()));
  $('#demoNext').addEventListener('click', () => (demo.i < DEMO.length - 1 ? demoShow(demo.i + 1) : demoStop()));
  $('#demoPrev').addEventListener('click', () => demoShow(demo.i - 1));
  $('#demoQuit').addEventListener('click', demoStop);
  // Astuce de démarrage (une fois)
  let seen = false; try { seen = localStorage.getItem('ares-hint') === '1'; } catch (e) { /* stockage indisponible */ }
  if (!seen) {
    $('#hint').hidden = false;
    const close = () => { $('#hint').hidden = true; try { localStorage.setItem('ares-hint', '1'); } catch (e) { /* rien */ } };
    $('#hintX').addEventListener('click', close);
    $('#hintDemo').addEventListener('click', () => { close(); demoStart(); });
    setTimeout(close, 15000);
  }

  // Recherche de lieux
  const ENTRIES = () => POIS.map((p) => ({ name: p.name, kind: 'Lieu', go: () => map.flyTo([p.lat, p.lon], p.go, { duration: REDUCE ? 0 : 2 }) }))
    .concat(stops.map((s, i) => ({ name: s.name, kind: i ? 'Arrêt ' + i : 'Habitat', go: () => map.flyTo([s.lat, s.lon], 16, { duration: REDUCE ? 0 : 1.5 }) })))
    .concat([{ name: 'Zone de sortie', kind: 'Zone', go: fitZone }, { name: 'Cratère Gale', kind: 'Région', go: () => map.flyToBounds(GALE) }]);
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let hits = [];
  $('#q').addEventListener('input', () => {
    const v = norm($('#q').value.trim());
    hits = v ? ENTRIES().filter((e) => norm(e.name).includes(v)).slice(0, 6) : [];
    $('#qres').hidden = !hits.length;
    $('#qres').innerHTML = hits.map((h, i) => '<li data-i="' + i + '">' + esc(h.name) + '<small>' + h.kind + '</small></li>').join('');
  });
  $('#qres').addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) { hits[+li.dataset.i].go(); $('#qres').hidden = true; $('#q').value = ''; } });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && hits[0]) { hits[0].go(); $('#qres').hidden = true; $('#q').blur(); } });
  $('#q').addEventListener('blur', () => setTimeout(() => { $('#qres').hidden = true; }, 150));

  // ---------- Modes habitat / casque ----------
  function setMode(m) {
    document.body.classList.toggle('mode-casque', m === 'casque');
    document.body.classList.toggle('mode-habitat', m !== 'casque');
    $$('.mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#hud').hidden = m !== 'casque';
    map.closePopup();
    route.short.setStyle({ opacity: m === 'casque' ? 0 : 0.85 });
    if (m === 'casque') { setAdding(false); const ll = updateHud(); map.setView([ll.lat, ll.lon], 16.5, { animate: !REDUCE }); }
    else fitZone();
  }

  // ---------- Démarrage ----------
  recompute();
  renderViews(); renderLegend(); updatePois(); updateSrc();
  if (innerWidth > 860) openPanel('couches');
  setTimeout(() => { if (REDUCE) map.fitBounds(ZB); else map.flyToBounds(ZB, { paddingTopLeft: [innerWidth > 860 ? 420 : 10, 70], paddingBottomRight: [innerWidth > 860 ? 320 : 10, innerWidth > 860 ? 40 : 120], duration: 4 }); }, 700);
})();
