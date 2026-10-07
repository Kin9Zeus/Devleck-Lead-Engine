#!/usr/bin/env bash
# Devleck Lead Engine — lanzador para macOS / Linux
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Necesitas Node.js 18+: https://nodejs.org"; exit 1; }
command -v claude >/dev/null || echo "AVISO: no se encontró Claude Code. Instálalo y ejecuta 'claude' una vez para iniciar sesión."
node server/index.mjs
