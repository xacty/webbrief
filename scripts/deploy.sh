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

echo "Installing shared/ dependencies..."
# shared/documentInvariants.js imports @tiptap/* and resolves them out of
# shared/node_modules at runtime when the backend's /api/mcp pipeline loads
# the editOps tool. Without this step the backend crashes on boot with
# ERR_MODULE_NOT_FOUND for @tiptap/html.
cd "$APP_DIR/shared"
npm ci --omit=dev

echo "Installing MCP server dependencies..."
# The backend imports the MCP HTTP handler from mcp/webrief-server/src/http.js.
# Node resolves @modelcontextprotocol/sdk + @tiptap/* from that folder's
# node_modules, so we must install them here even though backend never does so
# itself.
cd "$APP_DIR/mcp/webrief-server"
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

echo "Deploy complete."
