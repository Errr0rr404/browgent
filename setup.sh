#!/usr/bin/env bash
# One-command bootstrap for Browgent contributors
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> Browgent setup"
echo "    $(node -v 2>/dev/null || echo 'Node not found')"
echo "    $(npm -v 2>/dev/null || echo 'npm not found')"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20+ is required. Install from https://nodejs.org"
  exit 1
fi

echo "==> npm install"
npm install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env from .env.example"
  echo "    Optional: set XAI_API_KEY for Grok tool-calling"
else
  echo "==> .env already present (left unchanged)"
fi

echo "==> typecheck"
npm run typecheck

echo ""
echo "Ready. Start the app with:"
echo "  npm run dev"
echo ""
echo "Docs: README.md  ·  Contributing: CONTRIBUTING.md"
