const stops = [
  {
    label: 'POINT DE DÉPART',
    time: '00:00',
    quote: '« Vérification étanche. La ligne de crête offre un bon point de repère. Confirmez le niveau d’oxygène avant le départ. »',
    layers: ['terrain', 'hazards'],
  },
  {
    label: 'DÉTOUR SUD · 0,7 KM',
    time: '00:30',
    quote: '« Champ de blocs devant vous : ne traversez pas le lit caillouteux. Gardez le détour au sud et surveillez vos appuis. »',
    layers: ['terrain', 'hazards'],
  },
  {
    label: 'FRONT DU DELTA · 1,5 KM',
    time: '01:15',
    quote: '« Arrêt au front du delta. Ces dépôts stratifiés sont une cible intéressante pour rechercher des minéraux argileux. »',
    layers: ['terrain', 'geology'],
  },
  {
    label: 'PRÉLÈVEMENT · 2,4 KM',
    time: '01:40',
    quote: '« Affleurement sédimentaire repéré. Photographiez la stratification, puis prélevez une carotte en contexte. Échantillon scellé avant le retour. »',
    layers: ['terrain', 'geology', 'resources'],
  },
];

const layerButtons = Array.from(document.querySelectorAll('[data-toggle-layer]'));
const stopsButtons = Array.from(document.querySelectorAll('[data-stop-button]'));
const mapStops = Array.from(document.querySelectorAll('[data-stop]'));
const guideQuote = document.getElementById('guide-quote');
const focusLabel = document.getElementById('guide-focus-label');
const guideTime = document.getElementById('guide-time');
const progress = document.getElementById('tour-progress');
const playButton = document.getElementById('play-tour');
let activeStop = 0;
let playbackTimer;
let zoom = 1;

function setLayer(name, enabled) {
  const layer = document.querySelector(`[data-layer="${name}"]`);
  const button = layerButtons.find((item) => item.dataset.toggleLayer === name);
  if (!layer || !button) return;

  layer.classList.toggle('is-hidden', !enabled);
  button.classList.toggle('active', enabled);
  button.setAttribute('aria-pressed', String(enabled));
  button.querySelector('.toggle-state').textContent = enabled ? 'ON' : 'OFF';
}

function selectStop(index) {
  activeStop = (index + stops.length) % stops.length;
  const stop = stops[activeStop];

  stopsButtons.forEach((button, buttonIndex) => {
    const selected = buttonIndex === activeStop;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  mapStops.forEach((marker, markerIndex) => marker.classList.toggle('selected', markerIndex === activeStop));
  guideQuote.textContent = stop.quote;
  focusLabel.textContent = stop.label;
  guideTime.innerHTML = `${stop.time} <i>/ 02:00</i>`;
  progress.style.width = `${(parseTime(stop.time) / 120) * 100}%`;
  stop.layers.forEach((layer) => setLayer(layer, true));
}

function parseTime(time) {
  const [minutes, seconds] = time.split(':').map(Number);
  return minutes * 60 + seconds;
}

layerButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const layer = document.querySelector(`[data-layer="${button.dataset.toggleLayer}"]`);
    setLayer(button.dataset.toggleLayer, layer.classList.contains('is-hidden'));
  });
});

stopsButtons.forEach((button) => {
  button.addEventListener('click', () => {
    stopPlayback();
    selectStop(Number(button.dataset.stopButton));
  });
});

mapStops.forEach((marker) => {
  const activate = () => {
    stopPlayback();
    selectStop(Number(marker.dataset.stop));
  };
  marker.addEventListener('click', activate);
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
});

function stopPlayback() {
  window.clearInterval(playbackTimer);
  playbackTimer = undefined;
  playButton.classList.remove('is-playing');
  playButton.innerHTML = '<span class="play-icon">▶</span> LANCER LE BRIEFING';
}

playButton.addEventListener('click', () => {
  if (playbackTimer) {
    stopPlayback();
    return;
  }

  selectStop(0);
  const startedAt = Date.now();
  playButton.classList.add('is-playing');
  playButton.innerHTML = '<span class="play-icon">Ⅱ</span> PAUSE BRIEFING';
  playbackTimer = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed >= 120) {
      stopPlayback();
      selectStop(3);
      return;
    }
    const nextStop = stops.reduce((current, stop, index) => parseTime(stop.time) <= elapsed ? index : current, 0);
    if (nextStop !== activeStop) selectStop(nextStop);
  }, 250);
});

document.getElementById('reset-map').addEventListener('click', () => {
  layerButtons.forEach((button) => setLayer(button.dataset.toggleLayer, button.dataset.toggleLayer !== 'resources'));
  zoom = 1;
  document.querySelector('.mars-map').style.transform = 'scale(1)';
});

document.querySelectorAll('.map-zoom button').forEach((button) => {
  button.addEventListener('click', () => {
    zoom = Math.min(1.35, Math.max(1, zoom + (button.textContent.trim() === '+' ? 0.1 : -0.1)));
    document.querySelector('.mars-map').style.transform = `scale(${zoom})`;
  });
});

document.addEventListener('keydown', (event) => {
  if (event.target.closest('button, a, [tabindex="0"]')) return;
  if (event.key === 'ArrowRight') selectStop(activeStop + 1);
  if (event.key === 'ArrowLeft') selectStop(activeStop - 1);
});
