#!/bin/bash
# reinstall-evolution.sh — Reinstalação limpa da stack Evolution API
# Execute no servidor: bash /srv/prod/agente-wpp/reinstall-evolution.sh
set -e

EVOLUTION_DIR="/srv/evolution"
PROD_DIR="/srv/prod/agente-wpp"
API_URL="http://localhost:8080"
API_KEY="tentacao2024"
INSTANCE="agente-prod"
WEBHOOK_URL="http://host.docker.internal:3002/webhook"

echo "═══════════════════════════════════════════════"
echo "  Reinstalação Evolution API — Tentação em Pedaços"
echo "═══════════════════════════════════════════════"

# ── 1. Remove containers e volumes antigos ────────────────────────────────────
echo ""
echo "▶ [1/7] Removendo containers e volumes antigos..."
cd "$EVOLUTION_DIR" 2>/dev/null || mkdir -p "$EVOLUTION_DIR"
if [ -f "$EVOLUTION_DIR/docker-compose.yml" ]; then
  docker compose down -v --remove-orphans 2>/dev/null || true
fi
docker rm -f evolution-api evolution-postgres evolution-redis 2>/dev/null || true
echo "  ✓ Containers removidos"

# ── 2. Limpa resíduos do whatsapp-web.js ──────────────────────────────────────
echo ""
echo "▶ [2/7] Removendo resíduos do whatsapp-web.js..."
pkill -f "chrome" 2>/dev/null || true
pkill -f "puppeteer" 2>/dev/null || true
rm -rf "$PROD_DIR/.wwebjs_auth" 2>/dev/null || true
rm -rf "$PROD_DIR/.wwebjs_cache" 2>/dev/null || true
echo "  ✓ Processos Chrome e sessões wwebjs removidos"

# ── 3. Cria docker-compose.yml limpo ──────────────────────────────────────────
echo ""
echo "▶ [3/7] Criando docker-compose.yml com Evolution API v2.3.7..."
mkdir -p "$EVOLUTION_DIR"
cat > "$EVOLUTION_DIR/docker-compose.yml" << 'COMPOSE'
services:
  postgres:
    image: postgres:16-alpine
    container_name: evolution-postgres
    restart: always
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: evolution-redis
    restart: always
    command: redis-server --save "" --appendonly no

  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    extra_hosts:
      - "host.docker.internal:host-gateway"
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
      - DATABASE_CONNECTION_URI=postgresql://user:pass@postgres:5432/evolution?schema=public
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://redis:6379
      - CACHE_REDIS_PREFIX_KEY=evolution
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
  postgres_data:
COMPOSE

echo "  ✓ docker-compose.yml criado"

# ── 4. Sobe containers ────────────────────────────────────────────────────────
echo ""
echo "▶ [4/7] Subindo containers..."
cd "$EVOLUTION_DIR"
docker compose pull --quiet
docker compose up -d
echo "  Aguardando Evolution API iniciar (40s)..."
sleep 40

# Verifica se está respondendo
for i in $(seq 1 12); do
  if curl -sf "$API_URL/" > /dev/null 2>&1; then
    echo "  ✓ Evolution API respondendo"
    break
  fi
  [ $i -eq 12 ] && echo "  ✗ Evolution API não respondeu. Verifique: docker logs evolution-api" && exit 1
  sleep 5
done

# ── 5. Cria instância e configura webhook ─────────────────────────────────────
echo ""
echo "▶ [5/7] Criando instância e configurando webhook..."

# Deleta instância antiga se existir
curl -sf -X DELETE "$API_URL/instance/delete/$INSTANCE" \
  -H "apikey: $API_KEY" > /dev/null 2>&1 || true
sleep 2

# Cria instância
curl -sf -X POST "$API_URL/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{\"instanceName\":\"$INSTANCE\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}" > /dev/null
echo "  ✓ Instância $INSTANCE criada"
sleep 3

# Configura webhook apontando para o HOST via host.docker.internal
WEBHOOK_RESP=$(curl -sf -X POST "$API_URL/webhook/set/$INSTANCE" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{\"webhook\":{\"enabled\":true,\"url\":\"$WEBHOOK_URL\",\"webhook_by_events\":false,\"webhook_base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}")
echo "  ✓ Webhook configurado: $WEBHOOK_URL"

# ── 6. Atualiza .env do agente ────────────────────────────────────────────────
echo ""
echo "▶ [6/7] Atualizando .env do agente..."

# Remove linhas Evolution API antigas e wwebjs
sed -i '/^WHATSAPP_PROVIDER=/d' "$PROD_DIR/.env"
sed -i '/^# Evolution API/d' "$PROD_DIR/.env"
sed -i '/^EVOLUTION_API_URL=/d' "$PROD_DIR/.env"
sed -i '/^EVOLUTION_API_KEY=/d' "$PROD_DIR/.env"
sed -i '/^EVOLUTION_INSTANCE=/d' "$PROD_DIR/.env"
sed -i '/^EVOLUTION_WEBHOOK_PORT=/d' "$PROD_DIR/.env"

# Adiciona configuração correta
cat >> "$PROD_DIR/.env" << 'ENV'

# Evolution API
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=tentacao2024
EVOLUTION_INSTANCE=agente-prod
EVOLUTION_WEBHOOK_PORT=3002
ENV

echo "  ✓ .env atualizado"

# Atualiza .env do dashboard também
DASH_ENV="$PROD_DIR/dashboard/.env.local"
[ ! -f "$DASH_ENV" ] && touch "$DASH_ENV"
sed -i '/^WHATSAPP_PROVIDER=/d' "$DASH_ENV"
sed -i '/^EVOLUTION_API_URL=/d' "$DASH_ENV"
sed -i '/^EVOLUTION_API_KEY=/d' "$DASH_ENV"
sed -i '/^EVOLUTION_INSTANCE=/d' "$DASH_ENV"

cat >> "$DASH_ENV" << 'DASHENV'
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=tentacao2024
EVOLUTION_INSTANCE=agente-prod
DASHENV

echo "  ✓ dashboard/.env.local atualizado"

# ── 7. Reinicia serviços ──────────────────────────────────────────────────────
echo ""
echo "▶ [7/7] Reiniciando agente e dashboard..."
pm2 restart agente-prod --update-env
pm2 restart dashboard-prod --update-env
pm2 save
sleep 5

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ Reinstalação concluída!"
echo ""
echo "  Próximo passo — conectar WhatsApp:"
echo "  Acesse http://192.168.1.169:8080/manager"
echo "  Abra a instância 'agente-prod' e escaneie o QR"
echo ""
pm2 logs agente-prod --lines 6 --nostream
echo "═══════════════════════════════════════════════"
