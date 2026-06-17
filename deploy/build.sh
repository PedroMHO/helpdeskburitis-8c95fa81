#!/usr/bin/env bash
set -e

echo "== Build para VPS / Servidor Dedicado =="

# ---- Carregar .env se existir ----
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# ---- Instalar dependências ----
echo "Instalando dependências..."
bun install || npm install

# ---- Build ----
echo "Gerando build de produção (Nitro preset: node-server)..."
bun run build || npm run build

echo ""
echo "Build concluído. Saída em: .output/"
echo "Para iniciar: node .output/server/index.mjs"
echo "Para manter com PM2: pm2 start deploy/ecosystem.config.cjs"
