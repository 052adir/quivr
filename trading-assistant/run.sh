#!/usr/bin/env bash
# Launch Mentor Trade locally.
set -euo pipefail

cd "$(dirname "$0")/backend"

if [ ! -d .venv ]; then
  echo "→ creating virtualenv…"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "→ installing dependencies…"
pip install -q -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ created backend/.env (edit it to add your ANTHROPIC_API_KEY / Telegram token)"
fi

echo "→ starting server on http://localhost:8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
