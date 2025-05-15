// server.js

// Carga variables de entorno
require('dotenv').config();

const express     = require('express');
const https       = require('https');
const fs          = require('fs');
const path        = require('path');
const cors        = require('cors');
const mysql       = require('mysql2/promise');
const { spawn }   = require('child_process');
const bcrypt      = require('bcrypt');
const jwt         = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const app = express();
const log = msg => console.log(new Date().toISOString(), msg);

// Debug .env
console.log('DB_HOST=', process.env.DB_HOST);
console.log('DB_PORT=', process.env.DB_PORT);
console.log('DB_NAME=', process.env.DB_NAME);
console.log('DB_USER=', process.env.DB_USER);
console.log('DB_PASS=', process.env.DB_PASS ? '<set>' : '<empty>');

// MySQL pool
const pool = mysql.createPool({
  host:            process.env.DB_HOST,
  port:            process.env.DB_PORT,
  user:            process.env.DB_USER,
  password:        process.env.DB_PASS,
  database:        process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// HTTPS options
const httpsOptions = {
  key:  fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

app.use(cors({
  origin: '*',
  methods: ['GET','HEAD'],
  allowedHeaders: ['Range','Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: kill process tree cross-platform
function killProcessTree(pid) {
  if (process.platform === 'win32') {
    // Windows: use taskkill
    spawn('taskkill', ['/PID', pid.toString(), '/T', '/F']);
  } else {
    try {
      // POSIX: negative PID kills group
      process.kill(-pid, 'SIGKILL');
    } catch (e) {
      log(`Error killing group ${pid}: ${e.message}`);
      // fallback: kill single
      try { process.kill(pid, 'SIGKILL'); } catch {};
    }
  }
}

// Auth middleware (Bearer or ?token)
function authMiddleware(req, res, next) {
  let token;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
  else if (req.query.token) token = req.query.token;
  if (!token) return res.status(401).json({ msg: 'No autorizado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ msg: 'Token inválido' });
  }
}

// Test DB connection
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error de BD');
  }
});

// Videos listing
app.get('/videos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, titulo AS label, url AS youtubeId, miniatura AS thumbnail FROM video'
    );
    res.json(rows);
    log('Videos list served');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cannot read video list' });
  }
});

// Streaming with cancellation on client disconnect
app.get('/stream/:youtubeId', authMiddleware, (req, res) => {
  const { youtubeId } = req.params;
  const url = `https://www.youtube.com/watch?v=${youtubeId}`;
  log(`Stream start: ${youtubeId}`);

  res.set({
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked'
  });

  // spawn detached to create process group on POSIX
  const yt = spawn('yt-dlp', [
    '--cookies','cookies.txt',
    '-f','bv*[height>=1440][ext=mp4]+ba[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]',
    '-o','-', url
  ], { detached: true });

  yt.stdout.pipe(res);

  const cleanup = () => {
    log(`Client disconnected, killing tree for ${youtubeId}`);
    killProcessTree(yt.pid);
    try { res.destroy(); } catch {}
  };
  req.on('close', cleanup);
  res.on('close', cleanup);

  yt.stderr.on('data', d => log(`yt-dlp stderr: ${d}`));
  yt.on('close', code => log(`yt-dlp exited code ${code}`));
  yt.on('error', err => {
    log(`yt-dlp error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed', details: err.message });
  });
});

// Authentication endpoints
app.post('/auth/register',
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { nombre, apellidos, email, password } = req.body;
    try {
      const [ex] = await pool.query('SELECT 1 FROM usuario WHERE email = ?', [email]);
      if (ex.length) return res.status(400).json({ msg: 'Email ya registrado' });
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO usuario (nombre,apellidos,email,contrasena) VALUES (?,?,?,?)',
        [ nombre, apellidos, email, hash ]
      );
      res.json({ msg: 'Usuario creado correctamente' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  }
);

app.post('/auth/login',
  body('email').isEmail(),
  body('password').exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    try {
      const [rows] = await pool.query(
        'SELECT id,contrasena FROM usuario WHERE email = ?', [email]
      );
      if (!rows.length) return res.status(400).json({ msg: 'Credenciales inválidas' });
      const user = rows[0];
      const match = await bcrypt.compare(password, user.contrasena);
      if (!match) return res.status(400).json({ msg: 'Credenciales inválidas' });
      const token = jwt.sign(
        { id: user.id, email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      res.json({ token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  }
);

// Start HTTPS server
https.createServer(httpsOptions, app)
  .listen(process.env.PORT || 4000, '0.0.0.0', () => log('Server listening'));
