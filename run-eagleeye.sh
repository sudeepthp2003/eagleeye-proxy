#!/usr/bin/env bash
set -e

APP_NAME="eagleeye"
WEB_PORT=8081
PROXY_PORT=8080

echo "========================================"
echo "          Starting EagleEye             "
echo "========================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[!] Docker is not installed. Installing Docker..."
    sudo apt update
    sudo apt install -y docker.io docker-compose
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$USER"
    echo "[+] Docker installed. If permission issues occur, log out and log back in."
fi

# Stop and remove existing container if running
if [ "$(sudo docker ps -aq -f name=^${APP_NAME}$)" ]; then
    echo "[*] Stopping existing EagleEye container..."
    sudo docker stop "$APP_NAME" >/dev/null 2>&1 || true
    sudo docker rm "$APP_NAME" >/dev/null 2>&1 || true
fi

# Build image
echo "[*] Building EagleEye Docker image..."
sudo docker build -t "${APP_NAME}:latest" .

# Run container
echo "[*] Launching container on port ${WEB_PORT} (Web UI) and ${PROXY_PORT} (Proxy)..."
sudo docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  -p "${WEB_PORT}:${WEB_PORT}" \
  -p "${PROXY_PORT}:${PROXY_PORT}" \
  "${APP_NAME}:latest"

echo "========================================"
echo "[+] EagleEye Web UI is live at: http://localhost:${WEB_PORT}"
echo "[+] EagleEye Proxy listening on: 127.0.0.1:${PROXY_PORT}"
echo "[+] To view logs: sudo docker logs -f ${APP_NAME}"
echo "[+] To stop:      sudo docker stop ${APP_NAME}"
echo "========================================"
