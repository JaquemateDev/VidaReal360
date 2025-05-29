// server.js
require('dotenv').config(); // Carga variables de entorno desde .env
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // MySQL con soporte para promesas
const jwt = require('jsonwebtoken'); // Manejo de tokens JWT
const Stripe = require('stripe'); // SDK de Stripe para pagos
const { spawn, spawnSync } = require('child_process'); // Ejecutar procesos hijos
const https = require('https'); // Servidor HTTPS
const fs = require('fs'); // Sistema de archivos
const path = require('path'); // Manejo de rutas de archivos
const bcrypt = require('bcrypt'); // Encriptación de contraseñas
const { body, validationResult } = require('express-validator'); // Validación de datos

// Función para obtener URLs de streams de YouTube usando yt-dlp
async function getStreamUrl(youtubeId, format) {
  return new Promise((resolve, reject) => {
    // Ejecuta yt-dlp para obtener URL del stream
    const ytdlp = spawn('yt-dlp', [
      '--cookies', process.env.YTDLP_COOKIES, // Cookies para contenido restringido
      '-f', format, // Formato solicitado (video/audio)
      '-g', `https://www.youtube.com/watch?v=${youtubeId}` // URL del video
    ], { windowsHide: true }); // Oculta ventana en Windows

    let output = '';
    ytdlp.stdout.on('data', data => output += data); // Captura salida estándar
    ytdlp.stderr.on('data', data => console.error(`yt-dlp error: ${data}`)); // Captura errores

    // Maneja cierre del proceso
    ytdlp.on('close', code => {
      if (code === 0 && output) resolve(output.trim()); // Éxito
      else reject(new Error(`yt-dlp failed for format ${format}, code ${code}`)); // Error
    });
  });
}

const SERVER = process.env.SERVER; // URL del servidor desde variables de entorno

// Configuración inicial de Express
const app = express();
app.use(cors()); // Habilita CORS
app.use(express.json()); // Parsea JSON en las solicitudes
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // Inicializa Stripe

// Pool de conexiones a la base de datos MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Objeto para rastrear streams HLS activos (key: youtubeId)
const activeHls = {};

// Middleware de autenticación
function authMiddleware(req, res, next) {
  // Extrae token de headers o query string
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : req.query.token;
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' }); // Sin token
  
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // Verifica token
    next(); // Continúa si es válido
  } catch {
    res.status(401).json({ error: 'Invalid token' }); // Token inválido
  }
}

// Webhook para eventos de Stripe
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']; // Firma de Stripe
  
  try {
    // Construye evento verificando la firma
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // Maneja diferentes tipos de eventos
    if (event.type === 'checkout.session.completed') {
      // Actualiza suscripción al completar pago
      const session = event.data.object;
      const [[user]] = await pool.query(
        'SELECT id FROM usuario WHERE stripe_customer_id = ?',
        [session.customer]
      );
      // Si el usuario existe, actualiza su estado de suscripción
      if (user) {
        await pool.query(
          'UPDATE usuario SET stripe_subscription_id = ?, is_subscribed = 1 WHERE id = ?',
          [session.subscription, user.id]
        );
      }
    } else if (event.type === 'customer.subscription.deleted') {
      // Cancela suscripción
      const sub = event.data.object;
      const [[user]] = await pool.query(
        'SELECT id FROM usuario WHERE stripe_customer_id = ?',
        [sub.customer]
      );
      
      if (user) {
        await pool.query(
          'UPDATE usuario SET is_subscribed = 0 WHERE id = ?',
          [user.id]
        );
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Registro de usuario
app.post(
  '/auth/register',
  // Validaciones de entrada
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('nombre').notEmpty(),
  body('apellidos').notEmpty(),
  async (req, res) => {
    // Verifica errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const { email, password, nombre, apellidos } = req.body;
    
    // Verifica si el usuario ya existe
    const [[exists]] = await pool.query(
      'SELECT id FROM usuario WHERE email = ?',
      [email]
    );
    if (exists) return res.status(409).json({ error: 'User exists' });
    
    // Encripta contraseña y crea usuario
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuario (email, contrasena, nombre, apellidos) VALUES (?, ?, ?, ?)',
      [email, hash, nombre, apellidos]
    );
    
    // Genera token JWT
    const [row] = await pool.query('SELECT LAST_INSERT_ID() AS id');
    const token = jwt.sign(
      { id: row[0].id, email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({ token });
  }
);

// Login de usuario
app.post(
  '/auth/login',
  // Validaciones básicas
  body('email').isEmail(),
  body('password').exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const { email, password } = req.body;
    
    // Busca usuario en DB
    const [[user]] = await pool.query(
      'SELECT id, contrasena FROM usuario WHERE email = ?',
      [email]
    );
    
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Compara contraseñas
    const match = await bcrypt.compare(password, user.contrasena);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Genera token JWT
    const token = jwt.sign(
      { id: user.id, email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({ token });
  }
);

// Obtener lista de videos
app.get('/videos', authMiddleware, async (req, res) => {
  try {
    // Consulta videos desde la base de datos
    const [rows] = await pool.query(
      'SELECT id, titulo AS label, url AS youtubeId, miniatura AS thumbnail FROM video'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cannot read video list' });
  }
});

// Crear sesión de pago con Stripe
app.post('/create-checkout-session', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  
  // Verifica si el usuario ya tiene ID de cliente en Stripe
  const [[user]] = await pool.query(
    'SELECT stripe_customer_id FROM usuario WHERE id = ?',
    [userId]
  );
  
  let customerId = user.stripe_customer_id;
  
  // Crea nuevo cliente en Stripe si es necesario
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { userId } });
    customerId = customer.id;
    await pool.query(
      'UPDATE usuario SET stripe_customer_id = ? WHERE id = ?',
      [customerId, userId]
    );
  }
  
  // Crea sesión de pago
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription', // Modo suscripción
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/cancel.html`,
  });
  
  res.json({ sessionId: session.id }); // Devuelve ID de sesión
});

// Verificar estado de suscripción
app.get('/check-subscription', authMiddleware, async (req, res) => {
  // Consulta estado en base de datos
  const [[row]] = await pool.query(
    'SELECT is_subscribed FROM usuario WHERE id = ?',
    [req.user.id]
  );
  
  // Verifica directamente en Stripe si no está marcado como suscrito
  if (!row.is_subscribed) {
    const [[cust]] = await pool.query(
      'SELECT stripe_customer_id FROM usuario WHERE id = ?',
      [req.user.id]
    );
    
    if (cust.stripe_customer_id) {
      // Busca suscripciones activas en Stripe
      const subs = await stripe.subscriptions.list({
        customer: cust.stripe_customer_id,
        status: 'active',
        limit: 1
      });
      
      // Actualiza estado si existe suscripción activa
      if (subs.data.length) {
        await pool.query(
          'UPDATE usuario SET is_subscribed = 1 WHERE id = ?',
          [req.user.id]
        );
        return res.json({ subscribed: true });
      }
    }
  }
  
  res.json({ subscribed: !!row.is_subscribed });
});

// Función principal para manejar streaming HLS
async function handleHls(req, res) {
  const youtubeId = req.params.youtubeId;
  
  try {
    // Verifica si el usuario tiene suscripción activa
    const [[{ is_subscribed }]] = await pool.query(
      'SELECT is_subscribed FROM usuario WHERE id = ?',
      [req.user.id]
    );
    
    if (!is_subscribed) return res.status(402).json({ error: 'Payment required' });
    
    // Configura directorio para archivos HLS
    const outDir = path.join(__dirname, 'hls', youtubeId);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const playlistPath = path.join(outDir, 'playlist.m3u8');
    
    // Crea nuevo stream si no existe uno activo
    if (!activeHls[youtubeId]) {
      // Obtiene URLs de video y audio en paralelo
      const [videoUrl, audioUrl] = await Promise.all([
        getStreamUrl(youtubeId, 'bestvideo[height<=1080]'), // Mejor video hasta 1080p
        getStreamUrl(youtubeId, 'bestaudio') // Mejor audio
      ]);
      
      console.log('Retrieved URLs:', { videoUrl, audioUrl });
      
      // Configuración de ffmpeg para generar HLS
      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'warning',
        '-analyzeduration', '10M',
        '-probesize', '32M',
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
        '-i', videoUrl, // Input video
        '-i', audioUrl, // Input audio
        '-map', '0:v', // Usa video del primer input
        '-map', '1:a', // Usa audio del segundo input
        '-c:v', 'libx264', // Codec video
        '-preset', 'fast', // Balance velocidad/calidad
        '-crf', '20', // Calidad (0-51, menor=mejor)
        '-x264-params', 'keyint=60:min-keyint=60:scenecut=0:threads=auto',
        '-vf', 'scale=-2:720:flags=fast_bilinear', // Escala a 720p
        '-c:a', 'aac', // Codec audio
        '-b:a', '128k', // Bitrate audio
        '-ar', '48000', // Sample rate
        '-f', 'hls', // Formato salida
        '-hls_time', '4', // Duración segmentos (seg)
        '-hls_list_size', '6', // Segmentos en playlist
        '-hls_flags', 'append_list+omit_endlist',
        '-hls_segment_filename', path.join(outDir, 'segment_%03d.ts'),
        playlistPath // Ruta playlist
      ], { windowsHide: true });
      
      // Registra proceso activo
      activeHls[youtubeId] = { ffmpeg, lastAccessed: Date.now() };
      
      // Manejo de errores y limpieza al finalizar
      ffmpeg.stderr.on('data', d => console.error(`ffmpeg stderr: ${d}`));
      ffmpeg.on('exit', () => delete activeHls[youtubeId]);
    }
    
    // Espera hasta que exista el archivo de playlist
    while (!fs.existsSync(playlistPath)) {
      await new Promise(r => setTimeout(r, 200));
    }
    
    // Sirve el archivo playlist
    res.sendFile(playlistPath);
  } catch (err) {
    console.error('Stream error:', err);
    delete activeHls[youtubeId]; // Limpia en caso de error
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
}

// Endpoint para playlist HLS
app.get('/stream/:youtubeId/playlist.m3u8', authMiddleware, handleHls);

// Sirve segmentos HLS individuales
app.get('/stream/:youtubeId/:segment', authMiddleware, (req, res) => {
  const file = path.join(__dirname, 'hls', req.params.youtubeId, req.params.segment);
  if (fs.existsSync(file)) return res.sendFile(file); // Si existe lo sirve
  res.status(404).end(); // No encontrado
});

// Detiene un stream activo
app.post('/stop-stream/:youtubeId', authMiddleware, (req, res) => {
  const youtubeId = req.params.youtubeId;
  const entry = activeHls[youtubeId];
  
  if (entry && entry.ffmpeg) {
    entry.ffmpeg.kill('SIGKILL'); // Termina proceso ffmpeg
    delete activeHls[youtubeId]; // Elimina de registro
    
    try {
      // Elimina archivos temporales
      const dirPath = path.join(__dirname, 'hls', youtubeId);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Error cleaning directory:', err);
    }
    
    return res.json({ success: true });
  }
  res.json({ success: false }); // No había stream activo
});

// Configuración de archivos estáticos
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración e inicio del servidor HTTPS
const PORT = process.env.PORT || 4000;
const httpsOptions = {
  key: fs.readFileSync(path.resolve(__dirname, 'certs/key.pem')), // Clave privada
  cert: fs.readFileSync(path.resolve(__dirname, 'certs/cert.pem')) // Certificado
};

https.createServer(httpsOptions, app).listen(PORT, () =>
  console.log(`HTTPS server listening on ${SERVER}`)
);