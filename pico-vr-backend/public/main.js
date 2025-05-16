// main.js

// Componente custom-video-controller (con cambios en el icono)
AFRAME.registerComponent('custom-video-controller', {
  schema: { target: { type: 'selector' } },
  init: function () {
    const video = this.data.target;
    const el = this.el;
    const btnSize = 0.3;
    const iconSize = 0.5; // ajustado para que quepa dentro del círculo
    const timeOffsetX = btnSize / 2 + 0.1;

    // Botón redondo Play/Pause
    const playBtn = document.createElement('a-circle');
    playBtn.setAttribute('class', 'clickable');
    playBtn.setAttribute('radius', btnSize / 2);
    playBtn.setAttribute('segments', 32);
    playBtn.setAttribute('material', 'color: #000; opacity: 0.5');
    el.appendChild(playBtn);

    // Icono como imagen (play/pause)
    const icon = document.createElement('a-image');
    icon.setAttribute('src', '#playIcon');
    icon.setAttribute('width', iconSize);
    icon.setAttribute('height', iconSize);
    icon.setAttribute('position', '0 0 0.01');
    playBtn.appendChild(icon);

    playBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        icon.setAttribute('src', '#pauseIcon');
      } else {
        video.pause();
        icon.setAttribute('src', '#playIcon');
      }
    });

    // Texto de tiempo
    const timeText = document.createElement('a-text');
    timeText.setAttribute('value', '00:00 / --:--');
    timeText.setAttribute('align', 'left');
    timeText.setAttribute('baseline', 'center');
    timeText.setAttribute('width', 2);
    timeText.setAttribute('position', `${timeOffsetX} 0 0`);
    el.appendChild(timeText);

    this.video = video;
    this.icon = icon;
    this.timeText = timeText;
  },
  tick: function () {
    const v = this.video;
    const fmt = s => {
      const m = Math.floor(s/60).toString().padStart(2,'0');
      const s2 = Math.floor(s%60).toString().padStart(2,'0');
      return `${m}:${s2}`;
    };
    const current = fmt(v.currentTime || 0);
    const total = isFinite(v.duration) ? fmt(v.duration) : '--:--';
    this.timeText.setAttribute('value', `${current} / ${total}`);
  }
});

// Resto de tu main.js sigue igual...
window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.replace('/auth.html'); return; }
  const SERVER = 'https://192.168.0.35:4000';

  const videoGrid     = document.getElementById('video-grid');
  const searchInput   = document.getElementById('search-input');
  const loading       = document.getElementById('loading');
  const debugPanel    = document.getElementById('debug-panel');
  const mainContainer = document.querySelector('.container');
  const vrScene       = document.querySelector('a-scene');
  const backButton    = document.getElementById('back-button');
  const customControls= document.getElementById('customControls');
  const video360      = document.getElementById('video360');
  let   allVideos     = [];

  // Ocultar VR y controles al inicio
  if (vrScene) vrScene.style.display = 'none';
  if (customControls) customControls.setAttribute('visible', false);

  // Toggle controles: doble click y doble trigger
  document.addEventListener('dblclick', () => {
    if (customControls) {
      const vis = customControls.getAttribute('visible');
      customControls.setAttribute('visible', !vis);
    }
  });
  const laser = document.querySelector('[laser-controls]');
  let lastTr = 0;
  if (laser) {
    laser.addEventListener('triggerdown', () => {
      const now = Date.now();
      if (now - lastTr < 400 && customControls) {
        const vis = customControls.getAttribute('visible');
        customControls.setAttribute('visible', !vis);
      }
      lastTr = now;
    });
  }

  function renderVideos(videos) {
    videoGrid.innerHTML = '';
    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'video-card';
      card.innerHTML = `<img src="${v.thumbnail}" alt="${v.label}"><h3>${v.label}</h3>`;
      const title = card.querySelector('h3');
      title.style.cursor = 'pointer';
      title.addEventListener('click', () => {
        // Muestra VR y oculta galería
        mainContainer.style.display = 'none';
        vrScene.style.display       = 'block';
        backButton.style.display    = 'block';
        loading.style.display       = 'block';
        debugPanel.textContent      = `Estado: Iniciando ${v.label}`;

        // Detener stream anterior y limpiar src
        video360.pause();
        video360.removeAttribute('src');
        video360.load();

        // Asignar src con token para streaming nativo MP4
        video360.src = `${SERVER}/stream/${v.youtubeId}?token=${token}`;
        video360.load();
        video360.muted = false;

        // Esperar canplay
        const onCanPlay = () => {
          video360.removeEventListener('canplay', onCanPlay);
          video360.play().then(() => {
            debugPanel.textContent = `Estado: Reproduciendo ${v.label}`;
            loading.style.display  = 'none';
            const scene = AFRAME.scenes[0];
            if (scene) scene.renderer.setAnimationLoop(scene.render);
          }).catch(err => {
            console.error('Error al reproducir:', err);
            debugPanel.textContent = `Error al reproducir: ${err.message}`;
            loading.style.display  = 'none';
          });
        };
        video360.addEventListener('canplay', onCanPlay);

        // Manejo de errores
        video360.addEventListener('error', e => {
          console.error('Error al cargar video:', e);
          debugPanel.textContent = `Error al cargar video`;
          loading.style.display  = 'none';
        });
      });
      videoGrid.appendChild(card);
    });
  }

  // Botón volver
  backButton.addEventListener('click', () => {
    video360.pause();
    video360.removeAttribute('src');
    video360.load();
    video360.currentTime = 0;

    vrScene.style.display       = 'none';
    mainContainer.style.display = 'flex';
    backButton.style.display    = 'none';
    debugPanel.textContent      = 'Estado: Esperando selección de video';
    if (customControls) customControls.setAttribute('visible', false);
  });

  // Carga lista de vídeos con JWT
  fetch(`${SERVER}/videos`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
    .then(videos => { allVideos = videos; renderVideos(videos); })
    .catch(err => { console.error(err); debugPanel.textContent = `Error: ${err.message}`; });

  // Filtrar
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    renderVideos(allVideos.filter(v => v.label.toLowerCase().includes(term)));
  });
});
