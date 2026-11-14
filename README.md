# ARES NAV — La carte qui vous ramène à la base

Défi NASA Space Apps 2026 : *Interplanetary Survival Guide: Martian Map*.
La carte qu'un astronaute consulte pour préparer et réussir une sortie à pied sur Mars,
avec un assistant qui explique les données NASA en langage clair.

## Lancer
Double-cliquez sur `index.html` (Chrome, Edge ou Firefox). Aucune installation, aucun serveur, aucune connexion.
- `index.html` : page de présentation.
- `carte.html` : la carte (bouton « Préparer la sortie »).

## La zone de sortie
Cratère Gale, au pied du mont Sharp, entre les dunes Bagnold et la crête Vera Rubin
(137,33–137,41° E, 4,69–4,75° S, environ 4,7 × 3,5 km), sur la route du rover Curiosity.
Toutes les images et le relief viennent de NASA Mars Trek :

| Vue ou couche | Source | Résolution |
|---|---|---|
| Satellite | Viking (planète), MRO CTX (cratère Gale), MRO HiRISE (route de Curiosity) | 232 m, 6 m, 0,3 m par pixel |
| Relief | MGS MOLA + Mars Express HRSC ; dans la zone, MNT HiRISE de Gale | 200 m ; 2,5 m |
| Thermique | Mars Odyssey THEMIS, infrarouge de nuit | 100 m |
| Pentes | calculées sur le MNT HiRISE (voir limites) | grille de 20 m |
| Sable (dunes) | zones sombres et lisses de l'image HiRISE, seuil automatique | grille de 20 m |
| Minéraux | contours **approximatifs** tracés d'après les cartes CRISM publiées | — |

## Fonctions de la carte (cahier des charges)
- Menu : Carte, Couches, Itinéraire, Sécurité, Science, Assistant ; modes Habitat et Casque.
- Vues Satellite, Relief et Thermique ; couches avec case à cocher, opacité, légende, source et bouton « Expliquer ».
- Points à connaître (Gale, mont Sharp, Bradbury Landing, dunes Bagnold, crête Vera Rubin) et zones de référence
  (zone de sortie, rayon de retour, sable, pentes interdites).
- Itinéraire : ajout d'arrêts au clic, glisser-déposer, ordre, suppression ; trajet sûr calculé par A*
  (pente > 20° interdite, sable évité), comparé au trajet le plus court ; distance, durée, dénivelé, pente, profil.
- Sécurité : alertes, autonomie en oxygène, heure limite de retour, conditions types (Curiosity REMS et RAD).
- Science : fiche de chaque arrêt (objectif, mesures, matériel).
- Clic sur la carte : altitude, pente, sol, unité, et synthèse par l'assistant.
- Mode casque : flèche, distance, oxygène, alerte et une ligne de l'assistant ; simulation de la sortie (position simulée).
- Assistant hors ligne : réponses rédigées à partir des faits calculés, sources citées et cliquables.
  Le relais vers un vrai modèle de langage (clé côté serveur) reste à brancher.

## Ce qui est réel, calculé ou simulé
- Réel : toutes les images, le relief, la thermique, les noms de lieux.
- Calculé par le code (jamais par l'IA) : pentes, sable, trajets, durées, marge d'oxygène.
- Simulé ou supposé : position de l'astronaute, habitat Alpha (fictif), hypothèses de l'équipe
  (2 astronautes, 4 h, 2 km/h, pente max 20°, 15 min par arrêt), contours des minéraux.
- Limite connue : le MNT HiRISE de Mars Trek est fourni en 8 bits (un niveau = 18,5 m). Les altitudes sont étalonnées
  sur MOLA (régression r = 0,999) et les pentes reconstruites entre courbes de niveau : les petits obstacles n'y figurent pas.

## Mettre à jour les données
`python tools/build_data.py` (Pillow, numpy, scipy ; internet) retélécharge les tuiles et reconstruit `data/zone.js`.
Les téléchargements sont mis en cache dans `tools/.cache/` (à ne pas publier). Pour changer de zone, modifier `ZONE` dans le script.

## Structure
- `index.html`, `css/landing.css`, `js/landing.js` : page de présentation
- `carte.html`, `css/carte.css`, `js/carte.js` : carte (Leaflet)
- `js/zone-model.js` : modèle commun (pentes, A*, bilan, minéraux, arrêts de référence)
- `data/zone.js` : altitude et sable de la zone ; `tiles/` : tuiles NASA locales ; `assets/` : images NASA
- `vendor/` : Leaflet 1.9.4, three.js r147, polices (licences libres)
- `archive/prototype-v1/` : premier prototype (globe et trajets de rover)
