// Modèles 3D low-poly construits en code (aucun fichier externe).
// Chaque modèle repose sur le plan y=0, regarde vers +x et mesure environ 1,5 unité.
(function () {
  const M = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.15, flatShading: true }, extra || {}));
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; };

  function rover() {
    const g = new THREE.Group();
    const white = M(0xe9e4dc), dark = M(0x2a2a2e), gold = M(0xd9a441, { metalness: 0.5 }), grey = M(0x8d8f96);
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.26, 0.8), white, 0, 0.52, 0));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.7), gold, 0, 0.36, 0));
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.13, 10);
    for (const x of [-0.52, 0, 0.52]) for (const z of [-0.52, 0.52]) {
      const w = mesh(wheelGeo, dark, x, 0.18, z); w.rotation.x = Math.PI / 2; g.add(w);
      const leg = mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), grey, x, 0.33, z * 0.9); g.add(leg);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), grey, 0.42, 0.95, 0.22));
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.15, 0.2), white, 0.44, 1.3, 0.22));
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.07, 0.07), dark, 0.58, 1.3, 0.22));
    const rtg = mesh(new THREE.BoxGeometry(0.42, 0.2, 0.3), dark, -0.72, 0.68, 0); rtg.rotation.z = 0.5; g.add(rtg);
    const dish = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), gold, -0.2, 0.85, -0.2); dish.rotation.z = 0.5; g.add(dish);
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5), grey, -0.2, 0.74, -0.2));
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), grey, 0.8, 0.45, -0.2); arm.rotation.z = -0.35; g.add(arm);
    return g;
  }

  function lander() {
    const g = new THREE.Group();
    const gold = M(0xd9a441, { metalness: 0.5 }), grey = M(0x8d8f96), blue = M(0x23406e, { metalness: 0.4 }), white = M(0xe9e4dc);
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.26, 6), gold, 0, 0.5, 0));
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + 0.5;
      const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 5), grey, Math.cos(a) * 0.55, 0.26, Math.sin(a) * 0.55);
      leg.rotation.z = -Math.cos(a) * 0.5; leg.rotation.x = Math.sin(a) * 0.5; g.add(leg);
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 8), grey, Math.cos(a) * 0.7, 0.02, Math.sin(a) * 0.7));
    }
    for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 10), blue, 0, 0.62, s * 0.82));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), grey, 0.15, 0.88, 0));
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), white, 0.15, 1.15, 0));
    return g;
  }

  function habitat() {
    const g = new THREE.Group();
    const white = M(0xeee9e2), grey = M(0x8d8f96), blue = M(0x23406e, { metalness: 0.4 });
    const glow = M(0xffc37a, { emissive: 0xff8a3d, emissiveIntensity: 0.9 });
    g.add(mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 20), grey, 0, 0.03, 0)).rotation.x = Math.PI / 2;
    const tube = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 10), white, 0.75, 0.16, 0); tube.rotation.z = Math.PI / 2; g.add(tube);
    const mod = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.7, 12), white, 1.2, 0.26, 0); mod.rotation.x = Math.PI / 2; g.add(mod);
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 0.2), glow, 0.52, 0.2, 0.16));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.02), glow, 0, 0.3, 0.47));
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5), grey, -0.2, 0.85, 0));
    g.add(mesh(new THREE.SphereGeometry(0.04, 6, 5), glow, -0.2, 1.22, 0));
    for (let i = 0; i < 3; i++) {
      const p = mesh(new THREE.BoxGeometry(0.34, 0.02, 0.5), blue, -0.85, 0.2, -0.56 + i * 0.56); p.rotation.z = -0.6; g.add(p);
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4), grey, -0.85, 0.1, -0.56 + i * 0.56));
    }
    return g;
  }

  window.MarsModels = { rover, lander, habitat, make: (type) => ({ rover, lander, habitat }[type] || rover)() };
})();
