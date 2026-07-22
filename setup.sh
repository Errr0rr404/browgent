#!/usr/bin/env bash
# One-command bootstrap for Browgent contributors
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> Browgent setup"
echo "    $(node -v 2>/dev/null || echo 'Node not found')"
echo "    $(npm -v 2>/dev/null || echo 'npm not found')"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 22.12+ is required. Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [[ "$NODE_MAJOR" -lt 22 ]] || { [[ "$NODE_MAJOR" -eq 22 ]] && [[ "$NODE_MINOR" -lt 12 ]]; }; then
  echo "Error: Node.js 22.12+ is required (found $(node -v))."
  exit 1
fi

if [[ -f package-lock.json ]]; then
  echo "==> npm ci (lockfile present, reproducible install)"
  npm ci
else
  echo "==> npm install (no lockfile found)"
  npm install
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env from .env.example"
  echo "    Optional: set XAI_API_KEY (Grok default) or BROWGENT_PROVIDER for another LLM"
else
  echo "==> .env already present (left unchanged)"
fi

echo "==> typecheck"
npm run typecheck

echo ""
echo "Ready. Start the app with:"
echo "  npm run dev"
echo ""
echo "Docs:     docs/README.md"
echo "Download: https://github.com/Errr0rr404/browgent/releases/latest"
