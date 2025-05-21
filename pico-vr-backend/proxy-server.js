const express = require('express');
const https = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// Configuración HTTPS (usar los mismos certificados que ya tienes)
const httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

// Habilitar CORS completamente
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With']
}));

// Agregar respuesta a la ruta raíz para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Proxy server is running');
});

// Middleware para logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Configuración del proxy para videos de YouTube
app.use('/stream', createProxyMiddleware({
    target: 'https://192.168.0.115:4000',
    changeOrigin: true,
    secure: false, // Ignora certificados SSL
    pathRewrite: {
        '^/stream': '/stream' // Mantiene la ruta /stream
    },
    onProxyReq: (proxyReq) => {
        // Agregar headers necesarios
        proxyReq.setHeader('Access-Control-Allow-Origin', '*');
    },
    onProxyRes: (proxyRes) => {
        // Asegurar que los headers CORS se mantengan en la respuesta
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS, HEAD';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Range, Origin, X-Requested-With';
    }
}));

// Proxy para la API de videos
app.use('/videos', createProxyMiddleware({
    target: 'https://192.168.0.115:4000',
    changeOrigin: true,
    secure: false,
    pathRewrite: {
        '^/videos': '/videos'
    },
    onProxyRes: (proxyRes) => {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    }
}));

// Iniciar servidor HTTPS
const PORT = process.env.PORT || 3000;
https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy seguro corriendo en https://localhost:${PORT}`);
});