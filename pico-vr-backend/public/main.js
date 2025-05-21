// Load hls.js via CDN in your HTML:
// <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>

// Custom A-Frame video controls component
AFRAME.registerComponent('custom-video-controller', {
  schema: { target: { type: 'selector' } },
  init: function () {
    const video = this.data.target;
    const el = this.el;
    const btnSize = 0.3;
    const iconSize = 0.5;
    const timeOffsetX = btnSize / 2 + 0.1;

    // Play/pause button
    const playBtn = document.createElement('a-circle');
    playBtn.setAttribute('class', 'clickable');
    playBtn.setAttribute('radius', btnSize / 2);
    playBtn.setAttribute('segments', 32);
    playBtn.setAttribute('material', 'color: #000; opacity: 0.5');
    el.appendChild(playBtn);

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

    // Time display
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
      const m = Math.floor(s / 60).toString().padStart(2, '0');
      const s2 = Math.floor(s % 60).toString().padStart(2, '0');
      return `${m}:${s2}`;
    };
    const current = fmt(v.currentTime || 0);
    const total = isFinite(v.duration) ? fmt(v.duration) : '--:--';
    this.timeText.setAttribute('value', `${current} / ${total}`);
  }
});

// Stripe client initialization
const stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);

window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.replace('/auth.html');
    return;
  }
  const SERVER = 'https://192.168.0.35:4000';

  const videoGrid = document.getElementById('video-grid');
  const searchInput = document.getElementById('search-input');
  const loading = document.getElementById('loading');
  const debugPanel = document.getElementById('debug-panel');
  const mainContainer = document.querySelector('.container');
  const vrScene = document.querySelector('a-scene');
  const backButton = document.getElementById('back-button');
  const customControls = document.getElementById('customControls');
  const video360 = document.getElementById('video360');

  let allVideos = [];
  let hls = null;

  // Initial UI state
  if (vrScene) vrScene.style.display = 'none';
  if (customControls) customControls.setAttribute('visible', false);

  // Toggle custom controls on double-click
  document.addEventListener('dblclick', () => {
    if (customControls) {
      const vis = customControls.getAttribute('visible');
      customControls.setAttribute('visible', !vis);
    }
  });

  // Back button logic
  backButton.addEventListener('click', () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    const ytId = video360.dataset.youtubeId;
    if (ytId) {
      fetch(`${SERVER}/stop-stream/${ytId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
      delete video360.dataset.youtubeId;
    }
    video360.pause();
    video360.removeAttribute('src');
    vrScene.style.display = 'none';
    mainContainer.style.display = 'flex';
    backButton.style.display = 'none';
    loading.style.display = 'none';
    debugPanel.textContent = 'Estado: Esperando selección de video';
    if (customControls) customControls.setAttribute('visible', false);
  });

  // Load and play video with HLS
  const loadAndPlay = async (youtubeId) => {
    const checkRes = await fetch(`${SERVER}/check-subscription`, { headers: { 'Authorization': `Bearer ${token}` }});
    const { subscribed } = await checkRes.json();
    if (!subscribed) {
      const res = await fetch(`${SERVER}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const { sessionId } = await res.json();
      return stripe.redirectToCheckout({ sessionId });
    }

    cleanUI();
    mainContainer.style.display = 'none';
    vrScene.style.display = 'block';
    backButton.style.display = 'block';
    loading.style.display = 'block';
    debugPanel.textContent = `Estado: Iniciando ${youtubeId}`;

    if (Hls.isSupported()) {
      hls = new Hls({
        xhrSetup: (xhr) => { xhr.setRequestHeader('Authorization', `Bearer ${token}`); }
      });
      hls.loadSource(`${SERVER}/stream/${youtubeId}/playlist.m3u8`);
      hls.attachMedia(video360);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video360.play();
        loading.style.display = 'none';
        debugPanel.textContent = `Reproduciendo ${youtubeId}`;
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        debugPanel.textContent = `Error HLS: ${data.type} ${data.details}`;
        loading.style.display = 'none';
      });
    } else if (video360.canPlayType('application/vnd.apple.mpegurl')) {
      video360.src = `${SERVER}/stream/${youtubeId}/playlist.m3u8`;
      video360.addEventListener('loadedmetadata', () => {
        video360.play();
        loading.style.display = 'none';
        debugPanel.textContent = `Reproduciendo ${youtubeId}`;
      });
    } else {
      debugPanel.textContent = 'Error: HLS no soportado en este navegador';
      loading.style.display = 'none';
    }

    video360.dataset.youtubeId = youtubeId;
  };

  // Render video grid
  function renderVideos(videos) {
    videoGrid.innerHTML = '';
    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'video-card';
      card.innerHTML = `<img src="${v.thumbnail}" alt="${v.label}"><h3>${v.label}</h3>`;
      const title = card.querySelector('h3');
      title.style.cursor = 'pointer';
      title.addEventListener('click', () => loadAndPlay(v.youtubeId));
      videoGrid.appendChild(card);
    });
  }

  // Clean up UI between videos
  function cleanUI() {
    if (hls) { hls.destroy(); hls = null; }
    video360.pause();
    video360.removeAttribute('src');
    loading.style.display = 'none';
    debugPanel.textContent = '';
  }

  // Initial fetch of videos
  fetch(`${SERVER}/videos`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(r => r.ok ? r.json() : Promise.reject(r))
  .then(videos => {
    allVideos = videos;
    renderVideos(videos);
    debugPanel.textContent = `${videos.length} videos cargados`;
  })
  .catch(err => {
    console.error('Error al cargar videos:', err);
    debugPanel.textContent = `Error: ${err.message}`;
  });

  // Search filtering
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    renderVideos(allVideos.filter(v => v.label.toLowerCase().includes(term)));
  });

  // MSE support check
  if (!window.MediaSource) debugPanel.textContent = 'Error: Tu navegador no soporta MSE';
});
