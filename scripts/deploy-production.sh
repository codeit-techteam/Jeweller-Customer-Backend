#!/usr/bin/env bash
# Run on the DigitalOcean server after SSH:
#   cd ~/Jeweller-Customer-Backend && bash scripts/deploy-production.sh
set -euo pipefail

APP_NAME="jeweller-customer-backend"
PORT="${PORT:-5106}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_DIR"

echo "==> Pulling latest main..."
git fetch --all
git reset --hard origin/main

echo "==> Installing dependencies..."
npm install --omit=dev

echo "==> Checking port ${PORT}..."
PORT_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${PORT_PID}" ]; then
  PM2_NAME="$(pm2 jlist 2>/dev/null | node -e "
    const port = ${PORT};
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => {
      try {
        const apps = JSON.parse(data || '[]');
        const match = apps.find((app) => {
          const envPort = Number(app?.pm2_env?.env?.PORT ?? app?.pm2_env?.PORT ?? 0);
          return envPort === port;
        });
        process.stdout.write(match?.name ?? '');
      } catch {
        process.stdout.write('');
      }
    });
  ")"
  if [ -n "${PM2_NAME}" ] && [ "${PM2_NAME}" != "${APP_NAME}" ]; then
    echo "==> Port ${PORT} is held by pm2 app '${PM2_NAME}'. Stopping it so ${APP_NAME} can bind."
    pm2 stop "${PM2_NAME}" || true
    pm2 delete "${PM2_NAME}" || true
  fi
fi

echo "==> Starting / reloading ${APP_NAME}..."
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

sleep 2

echo "==> Health check..."
curl -fsS "http://127.0.0.1:${PORT}/api/health" | head -c 200
echo ""

echo "==> Smart Engagement rules endpoint..."
curl -fsS \
  -H "x-admin-session: authenticated" \
  "http://127.0.0.1:${PORT}/api/admin/notification-rules?limit=1&offset=0" | head -c 300
echo ""

echo "==> PM2 status"
pm2 status
