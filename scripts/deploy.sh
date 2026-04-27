#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/webrief}"
BRANCH="${BRANCH:-main}"
BACKEND_PROCESS="${BACKEND_PROCESS:-webrief-backend}"

cd "$APP_DIR"

echo "Pulling latest $BRANCH..."
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Installing backend dependencies..."
cd "$APP_DIR/backend"
npm ci --omit=dev

echo "Restarting backend..."
if pm2 describe "$BACKEND_PROCESS" >/dev/null 2>&1; then
  pm2 restart "$BACKEND_PROCESS" --update-env
else
  pm2 start src/index.js --name "$BACKEND_PROCESS"
fi
pm2 save

echo "Installing frontend dependencies..."
cd "$APP_DIR/frontend"
npm ci

echo "Building frontend..."
npm run build

echo "Reloading nginx..."
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "Deploy complete."
