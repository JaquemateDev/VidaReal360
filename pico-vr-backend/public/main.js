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
  const SERVER = window.__ENV__.SERVER;

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
  let allCategories = new Set();
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
      }).catch(() => { });
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
    const checkRes = await fetch(`${SERVER}/check-subscription`, { headers: { 'Authorization': `Bearer ${token}` } });
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
        enableWorker: true,
        maxBufferLength: 45, // Buffer más grande para conexiones inestables
        maxMaxBufferLength: 90,
        maxBufferSize: 90 * 1000 * 1000, // 90 MB
        liveSyncDuration: 20, // Sincronización en tiempo real para streams en vivo
        liveMaxLatencyDuration: 21, // Reducir latencia máxima
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
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
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

  // Palabras clave y categorías asociadas
  const CATEGORY_KEYWORDS = [
    // Ciudades/Lugares
    { keyword: 'valencia', category: 'Ciudades/Lugares' },
    { keyword: 'xativa', category: 'Ciudades/Lugares' },
    { keyword: 'cullera', category: 'Ciudades/Lugares' },
    { keyword: 'napoles', category: 'Ciudades/Lugares' },
    { keyword: 'pompeya', category: 'Ciudades/Lugares' },
    { keyword: 'casablanca', category: 'Ciudades/Lugares' },
    { keyword: 'almagro', category: 'Ciudades/Lugares' },
    { keyword: 'medjugorje', category: 'Ciudades/Lugares' },
    { keyword: 'bosnia', category: 'Ciudades/Lugares' },
    { keyword: 'herzegovina', category: 'Ciudades/Lugares' },
    { keyword: 'piramide', category: 'Ciudades/Lugares' },
    { keyword: 'teti', category: 'Ciudades/Lugares' },
    { keyword: 'pilar', category: 'Ciudades/Lugares' },

    // Playa/Naturaleza
    { keyword: 'beach', category: 'Playa/Naturaleza' },
    { keyword: 'wave', category: 'Playa/Naturaleza' },

    // Eventos/Fiestas
    { keyword: 'fiesta', category: 'Eventos/Fiestas' },
    { keyword: 'halloween', category: 'Eventos/Fiestas' },
    { keyword: 'fashion', category: 'Eventos/Fiestas' },
    { keyword: 'week', category: 'Eventos/Fiestas' },
    { keyword: 'demo', category: 'Eventos/Fiestas' },
    { keyword: 'concurso', category: 'Eventos/Fiestas' },
    { keyword: 'ejemplo', category: 'Eventos/Fiestas' },

    // Cultura/Historia
    { keyword: 'comedias', category: 'Cultura/Historia' },
    { keyword: 'capilla', category: 'Cultura/Historia' },
    { keyword: 'sixtina', category: 'Cultura/Historia' },

    // Religión/Procesiones
    { keyword: 'procesión', category: 'Religión/Procesiones' },
    { keyword: 'procesion', category: 'Religión/Procesiones' },
    { keyword: 'semana santa', category: 'Religión/Procesiones' },
    { keyword: 'cruz', category: 'Religión/Procesiones' },
    { keyword: 'belen', category: 'Religión/Procesiones' },
    { keyword: 'domingo de ramos', category: 'Religión/Procesiones' },

    // Música/Conciertos
    { keyword: 'ac/dc', category: 'Música/Conciertos' },
    { keyword: 'concert', category: 'Música/Conciertos' },
    { keyword: 'live', category: 'Música/Conciertos' },
    { keyword: 'guitar', category: 'Música/Conciertos' },
    { keyword: 'music', category: 'Música/Conciertos' },
    { keyword: 'walker', category: 'Música/Conciertos' },
    { keyword: 'sylvan', category: 'Música/Conciertos' },
    { keyword: 'whigfield', category: 'Música/Conciertos' },
    { keyword: 'dire straits', category: 'Música/Conciertos' },

    // Transporte
    { keyword: 'crucero', category: 'Transporte' },
    { keyword: 'bus', category: 'Transporte' },
    { keyword: 'vespa', category: 'Transporte' },

    // Mercados/Compras
    { keyword: 'mercado', category: 'Mercados/Compras' },

    // Juegos/Reconocimiento
    { keyword: 'juegos', category: 'Juegos/Reconocimiento' },
    { keyword: 'reconocimiento', category: 'Juegos/Reconocimiento' },
  ];

  // Función para detectar categorías en un título
  function detectCategories(label) {
    const found = [];
    const lower = label.toLowerCase();
    CATEGORY_KEYWORDS.forEach(({ keyword, category }) => {
      if (lower.includes(keyword)) found.push(category);
    });
    return found.length ? Array.from(new Set(found)) : ['Otros'];
  }

  function renderSidebar(categories) {
    if (window.renderSidebar) {
      window.renderSidebar(categories, false); // Pasamos false para que no estén seleccionados
    }
    // Al cambiar un checkbox, filtra por esa categoría (solo una a la vez)
    document.querySelectorAll('.sidebar input[type=checkbox]').forEach(cb => {
      cb.checked = false; // Asegura que todos estén desmarcados al renderizar
      cb.addEventListener('change', function () {
        // Desmarca todos menos el actual
        document.querySelectorAll('.sidebar input[type=checkbox]').forEach(other => {
          if (other !== cb) other.checked = false;
        });
        filterVideos();
      });
    });
  }

  function filterVideos() {
    const term = searchInput.value.toLowerCase();
    // Solo una categoría seleccionada a la vez
    const checked = Array.from(document.querySelectorAll('.sidebar input[type=checkbox]:checked')).map(cb => cb.value);
    renderVideos(
      allVideos.filter(v =>
        v.label.toLowerCase().includes(term) &&
        (checked.length === 0 || v.categories.some(cat => checked.includes(cat)))
      )
    );
  }

  fetch(`${SERVER}/videos`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(videos => {
      videos.forEach(v => {
        v.categories = detectCategories(v.label);
        v.categories.forEach(cat => allCategories.add(cat));
      });
      allVideos = videos;
      renderSidebar(Array.from(allCategories));
      renderVideos(allVideos); // Muestra todos al inicio
      debugPanel.textContent = `${videos.length} videos cargados`;
    })
    .catch(err => {
      console.error('Error al cargar videos:', err);
      debugPanel.textContent = `Error: ${err.message}`;
    });

  searchInput.addEventListener('input', filterVideos);

  // MSE support check
  if (!window.MediaSource) debugPanel.textContent = 'Error: Tu navegador no soporta MSE';

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.replace('/auth.html');
  });
});
