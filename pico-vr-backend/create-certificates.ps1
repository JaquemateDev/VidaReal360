#!/bin/bash

# Crear directorio para certificados si no existe
mkdir -p certs

# Generar certificado autofirmado
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName = IP:192.168.0.115,DNS:localhost"

echo "Certificados generados en la carpeta 'certs/'"
echo "Ahora puedes ejecutar 'npm run dev' para iniciar el servidor con HTTPS"