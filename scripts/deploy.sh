#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy de um ambiente (homolog | prod)
#
# Uso:
#   bash scripts/deploy.sh homolog
#   bash scripts/deploy.sh prod
#
# Chamado automaticamente pelo CI/CD (GitHub Actions).
# Pode ser executado manualmente para deploy forçado.
# =============================================================================

set -euo pipefail

ENV="${1:-}"

if [[ "$ENV" != "homolog" && "$ENV" != "prod" ]]; then
  echo "Uso: bash scripts/deploy.sh <homolog|prod>"
  exit 1
fi

# Configuração por ambiente
if [[ "$ENV" == "homolog" ]]; then
  DIR="/srv/homolog/agente-wpp"
  BRANCH="main"
  PM2_AGENT="agente-homolog"
  PM2_DASHBOARD="dashboard-homolog"
else
  DIR="/srv/prod/agente-wpp"
  BRANCH="main"
  PM2_AGENT="agente-prod"
  PM2_DASHBOARD="dashboard-prod"
fi

echo "============================================================"
echo "  Deploy → $ENV  |  Branch: $BRANCH"
echo "  Diretório: $DIR"
echo "============================================================"

cd "$DIR"

# ---------------------------------------------------------------------------
# 1. Atualizar código
# ---------------------------------------------------------------------------
echo ""
echo ">>> [1/6] Atualizando código ($BRANCH)..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# ---------------------------------------------------------------------------
# 2. Instalar dependências do agente
# ---------------------------------------------------------------------------
echo ""
echo ">>> [2/6] Instalando dependências do agente..."
npm ci --prefer-offline

# ---------------------------------------------------------------------------
# 3. Build do agente (TypeScript)
# ---------------------------------------------------------------------------
echo ""
echo ">>> [3/6] Compilando TypeScript..."
npm run build

# ---------------------------------------------------------------------------
# 4. Migrações do banco de dados
# ---------------------------------------------------------------------------
echo ""
echo ">>> [4/6] Aplicando migrações do banco..."
npx prisma generate
npm run db:deploy

# ---------------------------------------------------------------------------
# 5. Build do dashboard (Next.js)
# ---------------------------------------------------------------------------
echo ""
echo ">>> [5/6] Buildando dashboard..."
cd dashboard
npm ci --prefer-offline
npm run build
cd ..

# ---------------------------------------------------------------------------
# 6. Reiniciar processos no PM2
# ---------------------------------------------------------------------------
echo ""
echo ">>> [6/6] Reiniciando processos PM2..."

# Inicia ou reinicia o agente
pm2 describe "$PM2_AGENT" &>/dev/null \
  && pm2 restart "$PM2_AGENT" \
  || pm2 start ecosystem.config.cjs --only "$PM2_AGENT"

# Inicia ou reinicia o dashboard
pm2 describe "$PM2_DASHBOARD" &>/dev/null \
  && pm2 restart "$PM2_DASHBOARD" \
  || pm2 start ecosystem.config.cjs --only "$PM2_DASHBOARD"

# Salva configuração do PM2
pm2 save

echo ""
echo "  Deploy $ENV concluído!"
echo "  Logs: pm2 logs $PM2_AGENT"
echo "        pm2 logs $PM2_DASHBOARD"
