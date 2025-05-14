// 1) Carga variables de entorno lo primero
require('dotenv').config();

const express = require('express');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');
const mysql   = require('mysql2/promise');   // importamos el módulo entero
const { spawn } = require('child_process');

// 2) Depuración: comprueba que .env se lee bien
console.log('DB_HOST =', process.env.DB_HOST);
console.log('DB_PORT =', process.env.DB_PORT);
console.log('DB_NAME =', process.env.DB_NAME);
console.log('DB_USER =', process.env.DB_USER);
console.log('DB_PASS =', process.env.DB_PASS === '' ? '<vacío>' : process.env.DB_PASS);

// 3) Crea el pool con createPool()
const pool = mysql.createPool({
  host:            process.env.DB_HOST,
  port:            process.env.DB_PORT,
  user:            process.env.DB_USER,
  password:        process.env.DB_PASS,
  database:        process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const app = express();
const log = msg => console.log(new Date().toISOString(), msg);

// HTTPS options
const httpsOptions = {
  key:  fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

// Middlewares
app.use(cors({ origin: '*', methods: ['GET', 'HEAD'], allowedHeaders: ['Range', 'Content-Type'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de prueba de BD
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json(rows[0]);
  } catch (err) {
    console.error('Error test-db:', err);
    res.status(500).send('Error de BD');
  }
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No autorizado' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ msg: 'Token inválido' });
  }
}

// Lista de vídeos (puedes migrar más tarde a BD)
app.get('/videos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        titulo      AS label,
        url         AS youtubeId,
        miniatura   AS thumbnail
      FROM video
    `);
    res.json(rows);
    log('Served videos from DB');
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Cannot read video list' });
  }
});

// Streaming directo con yt-dlp
app.get('/stream/:youtubeId', (req, res) => {
  const { youtubeId } = req.params;
  const url = `https://www.youtube.com/watch?v=${youtubeId}`;

  log(`yt-dlp streaming start: ${youtubeId}`);

  res.set({
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked'
  });

  const yt = spawn('yt-dlp', [
    '--cookies', 'cookies.txt',
    '-f', 'bv*[height>=1440][ext=mp4]+ba[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]',
    '-o', '-',
    url
  ]);

  yt.stdout.pipe(res);

  yt.stderr.on('data', d => log(`yt-dlp stderr: ${d}`));
  yt.on('close', code => log(`yt-dlp exited with code ${code}`));
  yt.on('error', err => {
    log(`yt-dlp error: ${err.message}`);
    res.status(500).json({ error: 'yt-dlp failed', details: err.message });
  });
});

// Root
app.get('/', (req, res) => res.send('VR Gallery Backend running.'));

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

//––– Registro –––
app.post('/auth/register',
  // 1) Validaciones
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { email, password } = req.body;
  try {
    // 2) Comprueba si ya existe
    const [existing] = await pool.query(
      'SELECT 1 FROM usuario WHERE email = ?', [email]
    );
    if (existing.length) {
      return res.status(400).json({ msg: 'Email ya registrado' });
    }
    // 3) Hashea y guarda
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuario (email, contrasena) VALUES (?,?)',
      [email, hash]
    );
    res.json({ msg: 'Usuario creado correctamente' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

//––– Login –––
app.post('/auth/login',
  body('email').isEmail(),
  body('password').exists(),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { email, password } = req.body;
  try {
    // 1) Recupera usuario
    const [rows] = await pool.query(
      'SELECT id, contrasena FROM usuario WHERE email = ?', [email]
    );
    if (!rows.length) {
      return res.status(400).json({ msg: 'Credenciales inválidas' });
    }
    const user = rows[0];
    // 2) Compara hash
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ msg: 'Credenciales inválidas' });
    }
    // 3) Genera JWT
    const token = jwt.sign(
      { id: user.id, email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// Arranca HTTPS
https
  .createServer(httpsOptions, app)
  .listen(process.env.PORT || 4000, '0.0.0.0', () => log('Server listening'));
