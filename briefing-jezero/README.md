# Jezero Fieldnotes

Maquette statique en français d'un briefing interactif pour une sortie EVA
simulée dans le delta ouest du cratère Jezero. Elle présente une carte
schématique multicouche, quatre étapes de parcours et un guide de terrain.

## Lancer en local

Aucune dépendance ni compilation n'est nécessaire : ouvrez `index.html` dans
un navigateur, ou démarrez un serveur statique :

```bash
python -m http.server 8000
```

Ouvrez ensuite <http://localhost:8000>.

## Interactions

- Activez ou masquez les couches relief, géologie, dangers et ressources.
- Sélectionnez une étape depuis la liste ou directement sur la carte.
- Lancez le briefing pour parcourir les étapes selon la chronologie de la
  démonstration ; les touches fléchées permettent aussi de naviguer.
- Utilisez les commandes de zoom ou réinitialisez la carte.

## Portée et sources

La carte, les valeurs météo, la télémétrie et les recommandations sont des
éléments illustratifs, pas des données NASA en direct ni un itinéraire
géoréférencé ou certifié pour une EVA réelle. La page affiche une image
Mastcam-Z réelle du delta de Jezero (PIA25022) et un clip NASA avec des sons
enregistrés par Perseverance. Les liens des sources renvoient vers les pages
NASA des missions MRO et Mars 2020 et le Planetary Data System. Une vraie
carte géoréférencée et des données scientifiques de mission devront être
traitées séparément avant une utilisation opérationnelle.
