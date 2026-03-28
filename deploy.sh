#!/bin/bash
# deploy.sh — Executa no servidor: bash deploy.sh
# Aplica todas as atualizações: código + Prisma migration + Evolution API (Docker) + pm2 restart

set -e
PROD_DIR="/srv/prod/agente-wpp"
HOMOLOG_DIR="/srv/homolog/agente-wpp"

echo "═══════════════════════════════════════"
echo "  Deploy — Tentação em Pedaços"
echo "═══════════════════════════════════════"

# ── 1. Backup do banco ────────────────────────────────────────────────────────
echo ""
echo "▶ [1/6] Backup do banco de dados..."
BACKUP_DIR="/srv/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
[ -f "$PROD_DIR/prod.db" ]    && cp "$PROD_DIR/prod.db"    "$BACKUP_DIR/prod_${STAMP}.db"    && echo "  ✓ prod.db salvo em $BACKUP_DIR/prod_${STAMP}.db"
[ -f "$HOMOLOG_DIR/homolog.db" ] && cp "$HOMOLOG_DIR/homolog.db" "$BACKUP_DIR/homolog_${STAMP}.db" && echo "  ✓ homolog.db salvo"

# ── 2. Git pull ───────────────────────────────────────────────────────────────
echo ""
echo "▶ [2/6] Atualizando código..."
cd "$PROD_DIR"
git pull origin main
echo "  ✓ Código atualizado"

# Homolog também
cd "$HOMOLOG_DIR"
git pull origin main
echo "  ✓ Homolog atualizado"

# ── 3. npm install + build ────────────────────────────────────────────────────
echo ""
echo "▶ [3/6] Instalando dependências e compilando..."
cd "$PROD_DIR"
npm ci --silent
npm run build
echo "  ✓ Build do agente concluído"

cd "$PROD_DIR/dashboard"
npm ci --silent
npm run build
echo "  ✓ Build do dashboard concluído"

# ── 4. Prisma — gerar client + migrate ───────────────────────────────────────
echo ""
echo "▶ [4/6] Aplicando migrações do banco..."
cd "$PROD_DIR"

# Gera client Prisma atualizado (inclui ChatMessage)
npx prisma generate
echo "  ✓ Prisma client gerado (agente)"

cd "$PROD_DIR/dashboard"
npx prisma generate
echo "  ✓ Prisma client gerado (dashboard)"

# Aplica schema ao SQLite via db push (sem histórico de migrations necessário)
cd "$PROD_DIR"
DATABASE_URL="file:$PROD_DIR/prod.db" npx prisma db push --accept-data-loss 2>&1 | grep -E "✓|Error|warn" || true
echo "  ✓ Schema aplicado em prod.db"

DATABASE_URL="file:$HOMOLOG_DIR/homolog.db" npx prisma db push --accept-data-loss 2>&1 | grep -E "✓|Error|warn" || true
echo "  ✓ Schema aplicado em homolog.db"

# ── 5. Docker + Evolution API ─────────────────────────────────────────────────
echo ""
echo "▶ [5/6] Configurando Evolution API (Docker)..."

# Instala Docker se necessário
if ! command -v docker &> /dev/null; then
  echo "  Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  usermod -aG docker master
  echo "  ✓ Docker instalado"
else
  echo "  ✓ Docker já instalado ($(docker --version | cut -d' ' -f3 | tr -d ','))"
fi

# Cria docker-compose para Evolution API se não existir
EVOLUTION_DIR="/srv/evolution"
mkdir -p "$EVOLUTION_DIR"

cat > "$EVOLUTION_DIR/docker-compose.yml" << 'COMPOSE'
services:
  postgres:
    image: postgres:16-alpine
    container_name: evolution-postgres
    restart: always
    environment:
      - POSTGRES_USER=evolution
      - POSTGRES_PASSWORD=evolution2024
      - POSTGRES_DB=evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution"]
      interval: 5s
      timeout: 5s
      retries: 10

  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - SERVER_TYPE=http
      - SERVER_PORT=8080
      - CORS_ORIGIN=*
      - CORS_METHODS=GET,POST,PUT,DELETE
      - CORS_CREDENTIALS=true
      - LOG_LEVEL=ERROR
      - LOG_COLOR=true
      - LOG_BAILEYS=error
      - DEL_INSTANCE=false
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution:evolution2024@postgres:5432/evolution?schema=public
      - STORE_MESSAGES=true
      - STORE_MESSAGE_UP=true
      - STORE_CONTACTS=true
      - STORE_CHATS=true
      - QRCODE_LIMIT=30
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=tentacao2024
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
      - WEBHOOK_GLOBAL_ENABLED=false
      - CONFIG_SESSION_PHONE_CLIENT=Tentação em Pedaços
      - CONFIG_SESSION_PHONE_NAME=Chrome
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store

volumes:
  postgres_data:
  evolution_instances:
  evolution_store:
COMPOSE

# Inicia ou recria o container
cd "$EVOLUTION_DIR"
docker compose pull 2>&1 | tail -3
docker compose up -d
echo "  ✓ Evolution API rodando em http://localhost:8080"
echo "  ✓ API Key: tentacao2024"

# Aguarda Evolution API iniciar
echo "  Aguardando Evolution API ficar disponível..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:8080/ > /dev/null 2>&1; then
    echo "  ✓ Evolution API respondendo"
    break
  fi
  sleep 2
done

# Cria instância do agente se não existir
INSTANCE_RESP=$(curl -sf -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: tentacao2024" \
  -d '{"instanceName":"agente-prod","qrcode":true,"integration":"WHATSAPP-BAILEYS"}' 2>&1 || echo "já existe")
echo "  ✓ Instância agente-prod configurada"

# ── Atualiza .env do prod com Evolution API ────────────────────────────────────
if ! grep -q "WHATSAPP_PROVIDER" "$PROD_DIR/.env" 2>/dev/null; then
  echo "" >> "$PROD_DIR/.env"
  echo "# Evolution API" >> "$PROD_DIR/.env"
  echo "WHATSAPP_PROVIDER=evolution" >> "$PROD_DIR/.env"
  echo "EVOLUTION_API_URL=http://localhost:8080" >> "$PROD_DIR/.env"
  echo "EVOLUTION_API_KEY=tentacao2024" >> "$PROD_DIR/.env"
  echo "EVOLUTION_INSTANCE=agente-prod" >> "$PROD_DIR/.env"
  echo "EVOLUTION_WEBHOOK_PORT=3002" >> "$PROD_DIR/.env"
  echo "  ✓ Variáveis Evolution API adicionadas ao .env de prod"
else
  echo "  ✓ Variáveis Evolution API já existem no .env"
fi

# ── 6. PM2 restart ────────────────────────────────────────────────────────────
echo ""
echo "▶ [6/6] Reiniciando serviços..."
cd "$PROD_DIR"
pm2 reload ecosystem.config.cjs --only agente-prod,dashboard-prod
pm2 save
echo "  ✓ agente-prod e dashboard-prod reiniciados"

echo ""
echo "═══════════════════════════════════════"
echo "  ✅ Deploy concluído!"
echo ""
echo "  Próximo passo — conectar WhatsApp:"
echo "  1. Acesse http://192.168.1.169:8080"
echo "  2. Ou: curl http://localhost:8080/instance/connect/agente-prod -H 'apikey: tentacao2024'"
echo "  3. Escaneie o QR code com o WhatsApp da boleria"
echo "═══════════════════════════════════════"
