import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  server: {
    // Opciones importantes para que Vite use HTTPS
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'certs/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'certs/cert.pem')),
    },
    // Host: escuchar en todas las interfaces de red, no solo localhost
    host: '0.0.0.0',
    // Puerto: usar el 5173 por defecto o el que especifiques
    port: 5173,
    // Importante: configuración CORS para que el servidor de videos acepte peticiones
    cors: true,
    // Headers adicionales que pueden ayudar con las gafas Pico G3
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Private-Network': 'true'
    }
  }
})