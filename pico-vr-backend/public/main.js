document.addEventListener('DOMContentLoaded', () => {
  console.log("Inicializando aplicación...");
  const SERVER = 'https://192.168.0.35:4000';
  const videoGrid = document.getElementById('video-grid');
  const searchInput = document.getElementById('search-input');
  const loading = document.getElementById('loading');
  const debugPanel = document.getElementById('debug-panel');
  const video360 = document.getElementById('video360');
  const mainContainer = document.querySelector('.container');
  const vrScene = document.querySelector('a-scene');
  const backButton = document.getElementById('back-button');
  
  console.log("Elementos DOM encontrados:", {
    videoGrid: !!videoGrid,
    searchInput: !!searchInput,
    loading: !!loading,
    debugPanel: !!debugPanel,
    video360: !!video360,
    mainContainer: !!mainContainer,
    vrScene: !!vrScene,
    backButton: !!backButton
  });
  
  // Initially hide the VR scene
  if (vrScene) {
    vrScene.style.display = 'none';
    console.log("A-Frame scene oculta inicialmente");
  } else {
    console.error('VR Scene not found in the DOM');
  }
  
  videoGrid.style.display = 'grid';
  videoGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
  videoGrid.style.gap = '20px';
  videoGrid.style.padding = '20px';

  let allVideos = [];

  function renderVideos(videos) {
    console.log("Renderizando videos:", videos.length);
    videoGrid.innerHTML = '';
    
    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'video-card';

      card.innerHTML = `
        <img src="${v.thumbnail || 'https://via.placeholder.com/200x120'}" alt="${v.label}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 5px;">
        <h3 style="color: #7c3aed; font-size: 16px; margin: 10px 0 5px; cursor: pointer;">${v.label}</h3>
        <p style="color: #6b7280; font-size: 14px;">Descripción</p>
      `;

      const titleElement = card.querySelector('h3');
      if (!titleElement) {
        console.error('No se encontró el <h3> en la tarjeta generada:', card.innerHTML);
        return;
      }

      titleElement.addEventListener('click', async () => {
        console.log(`Clic en video: ${v.label}, ID: ${v.youtubeId}`);
        debugPanel.textContent = `Estado: Iniciando carga de ${v.label}`;
        
        // Hide the main container and show VR scene
        mainContainer.style.display = 'none';
        if (vrScene) {
          vrScene.style.display = 'block';
          console.log("VR Scene mostrada");
          
          // Force A-Frame to redraw and recognize the video
          const videosphere = document.getElementById('videosphere');
          if (videosphere) {
            // Update the material to ensure it reflects the new video source
            videosphere.setAttribute('material', 'src', '#video360');
            videosphere.setAttribute('material', 'side', 'back');
            console.log("Videosphere actualizado");
            try {
              videosphere.components.material.shader.update();
              console.log("Shader actualizado");
            } catch (e) {
              console.error("Error al actualizar shader:", e);
            }
          } else {
            console.error('Videosphere element not found');
          }
        } else {
          console.error('VR Scene not found');
        }
        
        if (backButton) {
          backButton.style.display = 'block';
          console.log("Botón atrás mostrado");
        } else {
          console.error('Back button not found');
        }
        
        if (!debugPanel) {
          console.error('El elemento debug-panel no existe en el DOM.');
          return;
        }

        if (!loading) {
          console.error('El elemento loading no existe en el DOM.');
          return;
        }

        debugPanel.textContent = `Estado: Cargando video ${v.label}`;
        loading.style.display = 'block';
        console.log("Indicador de carga mostrado");

        // Configurar el video en el visor 360
        if (!video360) {
          console.error("Elemento video360 no encontrado");
          debugPanel.textContent = "Error: Elemento de video no encontrado";
          loading.style.display = 'none';
          return;
        }

        console.log("Configurando video:", `${SERVER}/stream/${v.youtubeId}`);
        video360.pause();
        video360.removeAttribute('src');
        video360.load();
        video360.src = `${SERVER}/stream/${v.youtubeId}`;
        
        // Remove muted attribute to allow sound
        video360.muted = false;
        
        console.log("Video configurado, esperando a que se pueda reproducir...");

        try {
          // We need to wait for the video to be loaded
          const canPlayHandler = function() {
            console.log("Video listo para reproducir");
            video360.removeEventListener('canplay', canPlayHandler);
            
            video360.play().then(() => {
              console.log("Video reproduciendo correctamente");
              debugPanel.textContent = `Estado: Reproduciendo ${v.label}`;
              loading.style.display = 'none';
              
              // Ensure the video is connected to the videosphere
              const videosphere = document.getElementById('videosphere');
              if (videosphere) {
                // Update the material to ensure it reflects the new video source
                videosphere.setAttribute('material', 'src', '#video360');
                // videosphere.setAttribute('material', 'side', 'back');
                
                // Trigger A-Frame to update the scene
                if (typeof AFRAME !== 'undefined') {
                  console.log("Forzando actualización de A-Frame");
                  AFRAME.scenes[0].renderer.setAnimationLoop(AFRAME.scenes[0].render);
                }
              }
            }).catch(e => {
              console.error('Error al reproducir video:', e);
              debugPanel.textContent = `Estado: Error al reproducir ${v.label}`;
              loading.style.display = 'none';
            });
          };
          
          video360.addEventListener('canplay', canPlayHandler);
          
          // También manejamos errores de carga
          video360.addEventListener('error', function(e) {
            console.error("Error en carga de video:", e);
            debugPanel.textContent = `Estado: Error al cargar video - ${e.type}`;
            loading.style.display = 'none';
          });
          
        } catch (e) {
          console.error('Error al configurar video:', e);
          debugPanel.textContent = `Estado: Error al cargar ${v.label}`;
          loading.style.display = 'none';
        }
      });

      videoGrid.appendChild(card);
    });
  }

  // Back button functionality
  if (backButton) {
    backButton.addEventListener('click', () => {
      // Pause and reset video
      if (video360) {
        video360.pause();
        video360.currentTime = 0;
      }
      
      // Hide VR scene and show main container
      if (vrScene) {
        vrScene.style.display = 'none';
      }
      mainContainer.style.display = 'flex';
      if (backButton) {
        backButton.style.display = 'none';
      }
      
      if (debugPanel) {
        debugPanel.textContent = 'Estado: Esperando selección de video';
      }
    });
  } else {
    console.error('Back button not found in the DOM');
  }

  fetch(`${SERVER}/videos`)
    .then(r => {
      console.log("Respuesta recibida del servidor");
      return r.json();
    })
    .then(videos => {
      console.log("Videos cargados:", videos);
      allVideos = videos;
      renderVideos(videos);
    })
    .catch(err => {
      console.error('Error al cargar los videos:', err);
      debugPanel.textContent = 'Estado: Error al cargar la lista de videos';
    });

  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredVideos = allVideos.filter(v => v.label?.toLowerCase().includes(searchTerm));
    renderVideos(filteredVideos);
  });
});