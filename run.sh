#!/usr/bin/env bash
# Convenience script: sets up the backend and serves both backend + frontend.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Setting up Python virtual environment"
if [ ! -d "$ROOT/.venv" ]; then
  python3 -m venv "$ROOT/.venv"
fi
# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"

echo "==> Installing backend dependencies"
pip install -q -r "$ROOT/backend/requirements.txt"

echo "==> Starting backend on http://127.0.0.1:5000"
python "$ROOT/backend/app.py" &
BACKEND_PID=$!

# Stop the backend when this script is interrupted.
trap 'kill $BACKEND_PID 2>/dev/null' EXIT

echo "==> Serving frontend on http://127.0.0.1:8000"
echo "==> Open http://127.0.0.1:8000 in your browser (Ctrl+C to stop)"
cd "$ROOT/frontend"
python -m http.server 8000
