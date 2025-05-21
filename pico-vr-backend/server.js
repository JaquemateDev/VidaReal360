require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const { spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

// Initialize
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
app.use(cors());
app.use(express.json());

// MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

// In-memory HLS processes
const activeHls = {};

// JWT Auth Middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// 1) Stripe Webhook
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const [[user]] = await pool.query('SELECT id FROM usuario WHERE stripe_customer_id = ?', [session.customer]);
      if (user) await pool.query('UPDATE usuario SET stripe_subscription_id = ?, is_subscribed = 1 WHERE id = ?', [session.subscription, user.id]);
    }
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const [[user]] = await pool.query('SELECT id FROM usuario WHERE stripe_customer_id = ?', [sub.customer]);
      if (user) await pool.query('UPDATE usuario SET is_subscribed = 0 WHERE id = ?', [user.id]);
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// 2) Register
app.post('/auth/register',
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const [[exists]] = await pool.query('SELECT id FROM usuario WHERE email = ?', [email]);
    if (exists) return res.status(409).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO usuario (email, contrasena) VALUES (?, ?)', [email, hash]);
    const [row] = await pool.query('SELECT LAST_INSERT_ID() AS id');
    const token = jwt.sign({ id: row[0].id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  }
);

// 3) Login
app.post('/auth/login',
  body('email').isEmail(),
  body('password').exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const [[user]] = await pool.query('SELECT id, contrasena FROM usuario WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.contrasena);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  }
);

// 4) Video list
app.get('/videos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, titulo AS label, url AS youtubeId, miniatura AS thumbnail FROM video');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cannot read video list' });
  }
});

// 5) Create Checkout Session
app.post('/create-checkout-session', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const [[user]] = await pool.query('SELECT stripe_customer_id FROM usuario WHERE id = ?', [userId]);
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { userId } });
    customerId = customer.id;
    await pool.query('UPDATE usuario SET stripe_customer_id = ? WHERE id = ?', [customerId, userId]);
  }
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'], mode: 'subscription', customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/cancel.html`
  });
  res.json({ sessionId: session.id });
});

// 6) Check Subscription
app.get('/check-subscription', authMiddleware, async (req, res) => {
  const [[row]] = await pool.query('SELECT is_subscribed FROM usuario WHERE id = ?', [req.user.id]);
  if (!row.is_subscribed) {
    const [[cust]] = await pool.query('SELECT stripe_customer_id FROM usuario WHERE id = ?', [req.user.id]);
    if (cust.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({ customer: cust.stripe_customer_id, status: 'active', limit: 1 });
      if (subs.data.length) {
        await pool.query('UPDATE usuario SET is_subscribed = 1 WHERE id = ?', [req.user.id]);
        return res.json({ subscribed: true });
      }
    }
  }
  res.json({ subscribed: !!row.is_subscribed });
});

// 7) HLS Streaming Endpoint
app.get('/stream/:youtubeId/playlist.m3u8', authMiddleware, async (req, res) => {
  const youtubeId = req.params.youtubeId;
  const [[{ is_subscribed }]] = await pool.query('SELECT is_subscribed FROM usuario WHERE id = ?', [req.user.id]);
  if (!is_subscribed) return res.status(402).json({ error: 'Payment required' });

  const outDir = path.join(__dirname, 'hls', youtubeId);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const playlistPath = path.join(outDir, 'playlist.m3u8');

  if (!activeHls[youtubeId]) {
    const ytdlp = spawn('yt-dlp', [
      '--cookies', 'cookies.txt', '-f', 'bv[ext=mp4]+ba[ext=m4a]/best', '-o', '-',
      `https://www.youtube.com/watch?v=${youtubeId}`
    ], { windowsHide: true });
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0', '-c:v', 'libx264', '-c:a', 'aac',
      '-f', 'hls', '-hls_time', '4', '-hls_list_size', '5',
      '-hls_flags', 'delete_segments+independent_segments',
      '-hls_segment_filename', path.join(outDir, 'segment_%03d.ts'),
      playlistPath
    ], { windowsHide: true });

    ytdlp.stdout.pipe(ffmpeg.stdin);
    activeHls[youtubeId] = { ytdlp, ffmpeg };
    ytdlp.stderr.on('data', d => console.error(`yt-dlp stderr: ${d}`));
    ffmpeg.stderr.on('data', d => console.error(`ffmpeg stderr: ${d}`));
    ffmpeg.on('exit', () => delete activeHls[youtubeId]);
  }

  // Wait until playlist is ready
  const sendWhenReady = () => {
    if (fs.existsSync(playlistPath)) return res.sendFile(playlistPath);
    setTimeout(sendWhenReady, 200);
  };
  sendWhenReady();
});

// 8) Serve HLS Segments
app.get('/stream/:youtubeId/:segment', authMiddleware, (req, res) => {
  const file = path.join(__dirname, 'hls', req.params.youtubeId, req.params.segment);
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).end();
});

// 9) Stop HLS Stream
app.post('/stop-stream/:youtubeId', authMiddleware, (req, res) => {
  const procs = activeHls[req.params.youtubeId];
  if (procs) {
    procs.ytdlp.kill('SIGKILL');
    procs.ffmpeg.kill('SIGKILL');
    delete activeHls[req.params.youtubeId];
    fs.rmSync(path.join(__dirname, 'hls', req.params.youtubeId), { recursive: true, force: true });
    return res.json({ success: true });
  }
  res.json({ success: false });
});

// 10) Static & Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// 11) HTTPS Server
const PORT = process.env.PORT || 4000;
const httpsOptions = {
  key: fs.readFileSync(path.resolve(__dirname, 'certs/key.pem')),
  cert: fs.readFileSync(path.resolve(__dirname, 'certs/cert.pem'))
};
https.createServer(httpsOptions, app).listen(PORT, () =>
  console.log(`HTTPS server listening on https://localhost:${PORT}`)
);
