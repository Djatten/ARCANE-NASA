// Données de la carte. Longitudes en degrés Est (-180..180), latitudes en degrés Nord.
// Sites de mission : coordonnées réelles (arrondies). Zones de danger et de glace :
// positions réelles des régions, rayons approximatifs (à remplacer par les vrais jeux de données NASA).
window.MARS = {
  RADIUS_KM: 3389.5,

  sites: [
    { id: 'perseverance', name: 'Perseverance', place: 'Cratère Jezero', lat: 18.44, lon: 77.45, type: 'rover', agency: 'NASA', year: '2021', status: 'Actif',
      text: "Explore un ancien delta de rivière et met en réserve des échantillons de roche. A déployé l'hélicoptère Ingenuity." },
    { id: 'curiosity', name: 'Curiosity', place: 'Cratère Gale', lat: -4.59, lon: 137.44, type: 'rover', agency: 'NASA', year: '2012', status: 'Actif',
      text: "Gravit le mont Sharp et étudie si Mars a pu abriter la vie microbienne." },
    { id: 'zhurong', name: 'Zhurong', place: 'Utopia Planitia', lat: 25.07, lon: 109.93, type: 'rover', agency: 'CNSA', year: '2021', status: 'Inactif',
      text: "Premier rover chinois sur Mars, étude du sous-sol par radar." },
    { id: 'opportunity', name: 'Opportunity', place: 'Meridiani Planum', lat: -1.95, lon: -5.53, type: 'rover', agency: 'NASA', year: '2004–2018', status: 'Terminé',
      text: "A roulé plus de 45 km et trouvé des preuves d'eau liquide ancienne." },
    { id: 'spirit', name: 'Spirit', place: 'Cratère Gusev', lat: -14.57, lon: 175.47, type: 'rover', agency: 'NASA', year: '2004–2010', status: 'Terminé',
      text: "Jumeau d'Opportunity, a étudié des roches volcaniques et d'anciennes sources chaudes." },
    { id: 'insight', name: 'InSight', place: 'Elysium Planitia', lat: 4.50, lon: 135.62, type: 'lander', agency: 'NASA', year: '2018–2022', status: 'Terminé',
      text: "A écouté les séismes martiens pour sonder l'intérieur de la planète." },
    { id: 'viking1', name: 'Viking 1', place: 'Chryse Planitia', lat: 22.27, lon: -47.95, type: 'lander', agency: 'NASA', year: '1976', status: 'Terminé',
      text: "Premier atterrisseur américain à fonctionner sur Mars." },
    { id: 'viking2', name: 'Viking 2', place: 'Utopia Planitia', lat: 47.64, lon: 134.29, type: 'lander', agency: 'NASA', year: '1976', status: 'Terminé',
      text: "A photographié du givre au sol pendant l'hiver martien." },
    { id: 'pathfinder', name: 'Pathfinder', place: 'Ares Vallis', lat: 19.13, lon: -33.22, type: 'lander', agency: 'NASA', year: '1997', status: 'Terminé',
      text: "A déposé Sojourner, le tout premier rover martien." },
    { id: 'phoenix', name: 'Phoenix', place: 'Vastitas Borealis', lat: 68.22, lon: -125.75, type: 'lander', agency: 'NASA', year: '2008', status: 'Terminé',
      text: "A creusé le sol arctique et confirmé la présence de glace d'eau." },
    { id: 'base', name: 'Base Alpha', place: 'Arcadia Planitia (concept)', lat: 40.0, lon: -160.0, type: 'habitat', agency: 'Concept', year: '—', status: 'Projet',
      text: "Emplacement fictif d'une base habitée, placé près de dépôts de glace peu profonds pour produire eau et carburant." }
  ],

  // kind: 'relief' (pentes, canyons, volcans) ou 'storm' (poussière). w = poids du risque.
  hazards: [
    { name: 'Olympus Mons', kind: 'relief', lat: 18.65, lon: -133.8, r: 350, w: 1 },
    { name: 'Arsia Mons', kind: 'relief', lat: -8.35, lon: -120.09, r: 250, w: 1 },
    { name: 'Pavonis Mons', kind: 'relief', lat: 1.48, lon: -112.8, r: 220, w: 1 },
    { name: 'Ascraeus Mons', kind: 'relief', lat: 11.92, lon: -104.08, r: 250, w: 1 },
    { name: 'Elysium Mons', kind: 'relief', lat: 25.02, lon: 147.21, r: 250, w: 1 },
    { name: 'Valles Marineris', kind: 'relief', lat: -8, lon: -85, r: 300, w: 1 },
    { name: 'Valles Marineris', kind: 'relief', lat: -11, lon: -72, r: 300, w: 1 },
    { name: 'Valles Marineris', kind: 'relief', lat: -13.5, lon: -60, r: 300, w: 1 },
    { name: 'Valles Marineris', kind: 'relief', lat: -14, lon: -48, r: 300, w: 1 },
    { name: 'Hellas Planitia', kind: 'storm', lat: -42.4, lon: 70.5, r: 900, w: 0.6 },
    { name: 'Noachis Terra (tempête saisonnière)', kind: 'storm', lat: -45, lon: 0, r: 700, w: 0.6 },
    { name: 'Acidalia Planitia (tempête saisonnière)', kind: 'storm', lat: 45, lon: -30, r: 600, w: 0.6 }
  ],

  ice: [
    { name: 'Calotte polaire nord', lat: 90, lon: 0, r: 600 },
    { name: 'Calotte polaire sud', lat: -90, lon: 0, r: 500 },
    { name: 'Arcadia Planitia', lat: 47, lon: -176, r: 500 },
    { name: 'Utopia Planitia', lat: 45, lon: 110, r: 500 },
    { name: 'Deuteronilus Mensae', lat: 43, lon: 25, r: 400 },
    { name: 'Phlegra Montes', lat: 40, lon: 165, r: 300 }
  ]
};
