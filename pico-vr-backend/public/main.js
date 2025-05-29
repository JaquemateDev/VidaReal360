// Importamos las palabras clave de categorías desde un archivo externo
import { CATEGORY_KEYWORDS } from "./categories";

// ===== COMPONENTE PERSONALIZADO DE A-FRAME PARA CONTROLES DE VIDEO =====
// Registramos un componente personalizado en A-Frame para manejar controles de video
AFRAME.registerComponent('custom-video-controller', {
  // Esquema que define que el componente necesita un selector de video como parámetro
  schema: { target: { type: 'selector' } },
  
  // Función de inicialización del componente
  init: function () {
    const video = this.data.target;  // Elemento de video objetivo
    const el = this.el;              // Elemento actual del componente
    const btnSize = 0.3;             // Tamaño del botón de reproducir/pausar
    const iconSize = 0.5;            // Tamaño del icono
    const timeOffsetX = btnSize / 2 + 0.1; // Posición X del texto de tiempo

    // === CREAR BOTÓN DE REPRODUCIR/PAUSAR ===
    const playBtn = document.createElement('a-circle');
    playBtn.setAttribute('class', 'clickable');
    playBtn.setAttribute('radius', btnSize / 2);
    playBtn.setAttribute('segments', 32);
    playBtn.setAttribute('material', 'color: #000; opacity: 0.5'); // Fondo negro semitransparente
    el.appendChild(playBtn);

    // Crear icono del botón (play/pause)
    const icon = document.createElement('a-image');
    icon.setAttribute('src', '#playIcon');    // Por defecto, icono de play
    icon.setAttribute('width', iconSize);
    icon.setAttribute('height', iconSize);
    icon.setAttribute('position', '0 0 0.01'); // Ligeramente adelante para evitar z-fighting
    playBtn.appendChild(icon);

    // Event listener para alternar reproducción/pausa
    playBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        icon.setAttribute('src', '#pauseIcon'); // Cambiar a icono de pausa
      } else {
        video.pause();
        icon.setAttribute('src', '#playIcon');  // Cambiar a icono de play
      }
    });

    // === CREAR DISPLAY DE TIEMPO ===
    const timeText = document.createElement('a-text');
    timeText.setAttribute('value', '00:00 / --:--');
    timeText.setAttribute('align', 'left');
    timeText.setAttribute('baseline', 'center');
    timeText.setAttribute('width', 2);
    timeText.setAttribute('position', `${timeOffsetX} 0 0`); // Posicionado a la derecha del botón
    el.appendChild(timeText);

    // Guardamos referencias para usar en tick()
    this.video = video;
    this.icon = icon;
    this.timeText = timeText;
  },
  
  // Función que se ejecuta en cada frame para actualizar el tiempo
  tick: function () {
    const v = this.video;
    
    // Función helper para formatear segundos a MM:SS
    const fmt = s => {
      const m = Math.floor(s / 60).toString().padStart(2, '0');
      const s2 = Math.floor(s % 60).toString().padStart(2, '0');
      return `${m}:${s2}`;
    };
    
    // Obtener tiempo actual y duración total
    const current = fmt(v.currentTime || 0);
    const total = isFinite(v.duration) ? fmt(v.duration) : '--:--';
    
    // Actualizar el texto mostrado
    this.timeText.setAttribute('value', `${current} / ${total}`);
  }
});

// ===== INICIALIZACIÓN DE STRIPE =====
// Iniciamos el cliente de Stripe con la clave pública
const stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);

// ===== INICIALIZACIÓN PRINCIPAL CUANDO EL DOM ESTÁ LISTO =====
window.addEventListener('DOMContentLoaded', () => {
  // === VERIFICACIÓN DE AUTENTICACIÓN ===
  // Si no hay token, redirigir a la página de autenticación
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.replace('/auth.html');
    return;
  }

  // === DECLARACIÓN DE VARIABLES Y ELEMENTOS DEL DOM ===
  const SERVER = window.__ENV__.SERVER;  // URL del servidor backend

  // Elementos de la interfaz
  const videoGrid = document.getElementById('video-grid');        // Rejilla de videos
  const searchInput = document.getElementById('search-input');    // Campo de búsqueda
  const loading = document.getElementById('loading');             // Indicador de carga
  const debugPanel = document.getElementById('debug-panel');      // Panel de debug
  const mainContainer = document.querySelector('.container');     // Contenedor principal
  const vrScene = document.querySelector('a-scene');             // Escena de A-Frame
  const backButton = document.getElementById('back-button');      // Botón de retroceso
  const customControls = document.getElementById('customControls'); // Controles personalizados
  const video360 = document.getElementById('video360');          // Elemento de video 360°

  // Variables de estado
  let allVideos = [];           // Array con todos los videos cargados
  let allCategories = new Set(); // Set con todas las categorías únicas
  let hls = null;               // Instancia de HLS.js para streaming

  // === CONFIGURACIÓN INICIAL DE LA UI ===
  // Ocultamos la escena VR inicialmente y los controles personalizados
  if (vrScene) vrScene.style.display = 'none';
  if (customControls) customControls.setAttribute('visible', false);

  // === EVENT LISTENERS ===
  
  // Mostrar/ocultar controles de video con doble clic
  document.addEventListener('dblclick', () => {
    if (customControls) {
      const vis = customControls.getAttribute('visible');
      customControls.setAttribute('visible', !vis);
    }
  });

  // === LÓGICA DEL BOTÓN DE RETROCESO ===
  // Limpia todos los recursos activos y vuelve a la galería
  backButton.addEventListener('click', () => {
    // Destruir instancia de HLS si existe
    if (hls) {
      hls.destroy();
      hls = null;
    }
    
    // Detener stream de YouTube en el servidor si está activo
    const ytId = video360.dataset.youtubeId;
    if (ytId) {
      fetch(`${SERVER}/stop-stream/${ytId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => { }); // Ignorar errores de red
      delete video360.dataset.youtubeId;
    }
    
    // Pausar video y limpiar source
    video360.pause();
    video360.removeAttribute('src');
    
    // Restaurar UI a estado de galería
    vrScene.style.display = 'none';
    mainContainer.style.display = 'flex';
    backButton.style.display = 'none';
    loading.style.display = 'none';
    debugPanel.textContent = 'Estado: Esperando selección de video';
    if (customControls) customControls.setAttribute('visible', false);
  });

  // === FUNCIÓN PRINCIPAL PARA CARGAR Y REPRODUCIR VIDEOS ===
  const loadAndPlay = async (youtubeId) => {
    // === VERIFICACIÓN DE SUSCRIPCIÓN ===
    // Comprobar si el usuario tiene suscripción activa
    const checkRes = await fetch(`${SERVER}/check-subscription`, { 
      headers: { 'Authorization': `Bearer ${token}` } 
    });
    const { subscribed } = await checkRes.json();
    
    // Si no está suscrito, redirigir a Stripe Checkout
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

    // === PREPARACIÓN DE LA UI PARA REPRODUCCIÓN ===
    cleanUI();                                    // Limpiar estado anterior
    mainContainer.style.display = 'none';        // Ocultar galería
    vrScene.style.display = 'block';             // Mostrar escena VR
    backButton.style.display = 'block';          // Mostrar botón de retroceso
    loading.style.display = 'block';             // Mostrar indicador de carga
    debugPanel.textContent = `Estado: Iniciando ${youtubeId}`;

    // === CONFIGURACIÓN DE HLS PARA STREAMING ===
    if (Hls.isSupported()) {
      // Crear nueva instancia de HLS con configuración optimizada
      hls = new Hls({
        enableWorker: true,              // Usar Web Worker para mejor rendimiento
        maxBufferLength: 45,             // Buffer más grande para conexiones inestables (segundos)
        maxMaxBufferLength: 90,          // Buffer máximo absoluto
        maxBufferSize: 90 * 1000 * 1000, // 90 MB de buffer máximo
        liveSyncDuration: 20,            // Sincronización en tiempo real para streams en vivo
        liveMaxLatencyDuration: 21,      // Reducir latencia máxima
        xhrSetup: (xhr) => { 
          // Agregar token de autorización a todas las peticiones HLS
          xhr.setRequestHeader('Authorization', `Bearer ${token}`); 
        }
      });
      
      // Cargar playlist M3U8 y asociar con el elemento video
      hls.loadSource(`${SERVER}/stream/${youtubeId}/playlist.m3u8`);
      hls.attachMedia(video360);
      
      // Cuando el manifest está listo, iniciar reproducción
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video360.play();
        loading.style.display = 'none';
        debugPanel.textContent = `Reproduciendo ${youtubeId}`;
      });
      
      // Manejo de errores de HLS
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad(); // Reintentar carga en errores de red
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError(); // Recuperar de errores de media
          }
        }
      });
    } 
    // Fallback para navegadores que soportan HLS nativamente (Safari)
    else if (video360.canPlayType('application/vnd.apple.mpegurl')) {
      video360.src = `${SERVER}/stream/${youtubeId}/playlist.m3u8`;
      video360.addEventListener('loadedmetadata', () => {
        video360.play();
        loading.style.display = 'none';
        debugPanel.textContent = `Reproduciendo ${youtubeId}`;
      });
    } 
    // Error si no hay soporte para HLS
    else {
      debugPanel.textContent = 'Error: HLS no soportado en este navegador';
      loading.style.display = 'none';
    }

    // Guardar ID del video para referencia posterior
    video360.dataset.youtubeId = youtubeId;
  };

  // === FUNCIÓN PARA RENDERIZAR LA GALERÍA DE VIDEOS ===
  function renderVideos(videos) {
    videoGrid.innerHTML = ''; // Limpiar galería existente
    
    videos.forEach(v => {
      // Crear card para cada video
      const card = document.createElement('div');
      card.className = 'video-card';
      card.innerHTML = `<img src="${v.thumbnail}" alt="${v.label}"><h3>${v.label}</h3>`;
      
      // Agregar event listener al título para reproducir video
      const title = card.querySelector('h3');
      title.style.cursor = 'pointer';
      title.addEventListener('click', () => loadAndPlay(v.youtubeId));
      
      videoGrid.appendChild(card);
    });
  }

  // === FUNCIÓN PARA LIMPIAR LA UI Y EL REPRODUCTOR ===
  function cleanUI() {
    if (hls) { 
      hls.destroy(); 
      hls = null; 
    }
    video360.pause();
    video360.removeAttribute('src');
    loading.style.display = 'none';
    debugPanel.textContent = '';
  }

  // === FUNCIÓN PARA DETECTAR CATEGORÍAS EN TÍTULOS DE VIDEOS ===
  function detectCategories(label) {
    const found = [];
    const lower = label.toLowerCase();
    
    // Buscar cada palabra clave en el título
    CATEGORY_KEYWORDS.forEach(({ keyword, category }) => {
      if (lower.includes(keyword)) found.push(category);
    });
    
    // Si no se encuentran categorías, asignar "Otros"
    return found.length ? Array.from(new Set(found)) : ['Otros'];
  }

  // === FUNCIÓN PARA RENDERIZAR LA BARRA LATERAL DE CATEGORÍAS ===
  function renderSidebar(categories) {
    if (window.renderSidebar) {
      window.renderSidebar(categories, false); // false = no seleccionados por defecto
    }
    
    // Configurar event listeners para los checkboxes de categoría
    document.querySelectorAll('.sidebar input[type=checkbox]').forEach(cb => {
      cb.checked = false; // Asegurar que estén desmarcados inicialmente
      
      cb.addEventListener('change', function () {
        // Solo permitir una categoría seleccionada a la vez
        document.querySelectorAll('.sidebar input[type=checkbox]').forEach(other => {
          if (other !== cb) other.checked = false;
        });
        filterVideos(); // Aplicar filtro
      });
    });
  }

  // === FUNCIÓN PARA FILTRAR VIDEOS POR BÚSQUEDA Y CATEGORÍA ===
  function filterVideos() {
    const term = searchInput.value.toLowerCase(); // Término de búsqueda
    
    // Obtener categorías seleccionadas (solo una a la vez)
    const checked = Array.from(document.querySelectorAll('.sidebar input[type=checkbox]:checked'))
                          .map(cb => cb.value);
    
    // Filtrar videos que coincidan con búsqueda Y categoría
    renderVideos(
      allVideos.filter(v =>
        v.label.toLowerCase().includes(term) &&
        (checked.length === 0 || v.categories.some(cat => checked.includes(cat)))
      )
    );
  }

  // === CARGA INICIAL DE VIDEOS DESDE EL SERVIDOR ===
  fetch(`${SERVER}/videos`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(videos => {
      // Procesar cada video: detectar categorías y agregarlas al set global
      videos.forEach(v => {
        v.categories = detectCategories(v.label);
        v.categories.forEach(cat => allCategories.add(cat));
      });
      
      allVideos = videos;
      renderSidebar(Array.from(allCategories)); // Renderizar barra lateral
      renderVideos(allVideos);                  // Mostrar todos los videos inicialmente
      debugPanel.textContent = `${videos.length} videos cargados`;
    })
    .catch(err => {
      console.error('Error al cargar videos:', err);
      debugPanel.textContent = `Error: ${err.message}`;
    });

  // === EVENT LISTENERS ADICIONALES ===
  
  // Filtrar en tiempo real mientras se escribe en el campo de búsqueda
  searchInput.addEventListener('input', filterVideos);

  // Verificar soporte de Media Source Extensions
  if (!window.MediaSource) {
    debugPanel.textContent = 'Error: Tu navegador no soporta MSE';
  }

  // === BOTÓN DE CERRAR SESIÓN ===
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token'); // Eliminar token de autenticación
    window.location.replace('/auth.html'); // Redirigir a login
  });
});