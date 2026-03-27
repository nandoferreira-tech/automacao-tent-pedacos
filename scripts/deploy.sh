#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy diferencial de um ambiente (homolog | prod)
#
# Uso:
#   bash scripts/deploy.sh homolog
#   bash scripts/deploy.sh prod
#   bash scripts/deploy.sh homolog --force   # força rebuild completo
#
# Chamado automaticamente pelo CI/CD (GitHub Actions).
# Pode ser executado manualmente para deploy forçado.
# =============================================================================

set -euo pipefail

ENV="${1:-}"
FORCE="${2:-}"

if [[ "$ENV" != "homolog" && "$ENV" != "prod" ]]; then
  echo "Uso: bash scripts/deploy.sh <homolog|prod> [--force]"
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
[[ "$FORCE" == "--force" ]] && echo "  Modo: FORCE (rebuild completo)"
echo "============================================================"

cd "$DIR"

# ---------------------------------------------------------------------------
# 1. Atualizar código
# ---------------------------------------------------------------------------
echo ""
echo ">>> [1] Atualizando código ($BRANCH)..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Detecta quais arquivos mudaram no último commit
CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null || echo "ALL")

changed_in() {
  # Retorna 0 (true) se algum arquivo mudado bate com o padrão
  echo "$CHANGED" | grep -qE "$1"
}

if [[ "$FORCE" == "--force" || "$CHANGED" == "ALL" ]]; then
  AGENT_DEPS=true
  AGENT_BUILD=true
  PRISMA=true
  DASH_DEPS=true
  DASH_BUILD=true
else
  # Dependências do agente — só se package-lock mudou
  changed_in "^package-lock\.json$" && AGENT_DEPS=true || AGENT_DEPS=false
  # Build do agente — src/, tsconfig, prompts ou prisma schema
  changed_in "^src/|^tsconfig|^prisma/schema" && AGENT_BUILD=true || AGENT_BUILD=false
  # Prisma — schema ou migrations
  changed_in "^prisma/" && PRISMA=true || PRISMA=false
  # Dependências do dashboard — só se dashboard/package-lock mudou
  changed_in "^dashboard/package-lock\.json$" && DASH_DEPS=true || DASH_DEPS=false
  # Build do dashboard — qualquer arquivo dentro de dashboard/
  changed_in "^dashboard/" && DASH_BUILD=true || DASH_BUILD=false
fi

echo ""
echo "  Plano diferencial:"
echo "    Deps agente    : $AGENT_DEPS"
echo "    Build agente   : $AGENT_BUILD"
echo "    Prisma migrate : $PRISMA"
echo "    Deps dashboard : $DASH_DEPS"
echo "    Build dashboard: $DASH_BUILD"
echo ""

# ---------------------------------------------------------------------------
# 2. Dependências do agente
# ---------------------------------------------------------------------------
if [[ "$AGENT_DEPS" == true ]]; then
  echo ">>> [2] Instalando dependências do agente..."
  npm ci --prefer-offline
else
  echo ">>> [2] Dependências do agente sem alteração — pulando."
fi

# ---------------------------------------------------------------------------
# 3. Build do agente (TypeScript)
# ---------------------------------------------------------------------------
if [[ "$AGENT_BUILD" == true ]]; then
  echo ">>> [3] Compilando TypeScript..."
  npm run build
else
  echo ">>> [3] Código do agente sem alteração — pulando build."
fi

# ---------------------------------------------------------------------------
# 4. Migrações do banco de dados
# ---------------------------------------------------------------------------
if [[ "$PRISMA" == true ]]; then
  echo ">>> [4] Aplicando migrações do banco..."
  npx prisma generate
  npm run db:deploy
else
  echo ">>> [4] Schema Prisma sem alteração — pulando migrate."
fi

# ---------------------------------------------------------------------------
# 5. Build do dashboard (Next.js)
# ---------------------------------------------------------------------------
if [[ "$DASH_BUILD" == true ]]; then
  echo ">>> [5] Buildando dashboard..."
  cd dashboard
  if [[ "$DASH_DEPS" == true ]]; then
    echo "      Instalando dependências do dashboard..."
    npm ci --prefer-offline
  else
    echo "      Deps do dashboard sem alteração — pulando npm ci."
  fi
  npm run build
  cd ..
else
  echo ">>> [5] Dashboard sem alteração — pulando build."
fi

# ---------------------------------------------------------------------------
# 6. Reiniciar processos no PM2
# ---------------------------------------------------------------------------
echo ""
echo ">>> [6] Reiniciando processos PM2..."

pm2 describe "$PM2_AGENT" &>/dev/null \
  && pm2 restart "$PM2_AGENT" \
  || pm2 start ecosystem.config.cjs --only "$PM2_AGENT"

# Reinicia o dashboard apenas se foi buildado
if [[ "$DASH_BUILD" == true ]]; then
  pm2 describe "$PM2_DASHBOARD" &>/dev/null \
    && pm2 restart "$PM2_DASHBOARD" \
    || pm2 start ecosystem.config.cjs --only "$PM2_DASHBOARD"
fi

pm2 save

echo ""
echo "  Deploy $ENV concluído!"
echo "  Logs: pm2 logs $PM2_AGENT"
echo "        pm2 logs $PM2_DASHBOARD"
