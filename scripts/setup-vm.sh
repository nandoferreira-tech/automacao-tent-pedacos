#!/usr/bin/env bash
# =============================================================================
# setup-vm.sh — Configuração completa da VM para o Agente WhatsApp
# Ubuntu 22.04 LTS | Requer sudo
#
# Uso:
#   chmod +x scripts/setup-vm.sh
#   sudo bash scripts/setup-vm.sh <REPO_URL> <DOMINIO>
#
# Exemplo:
#   sudo bash scripts/setup-vm.sh https://github.com/usuario/repo.git app.meudominio.com
#
# O que este script faz:
#   1. Instala Node.js 20, PM2, Nginx, Chromium, Docker, Claude Code CLI
#   2. Cria estrutura de diretórios para homolog e prod
#   3. Clona o repositório em ambos os ambientes
#   4. Configura Nginx como reverse proxy
#   5. Configura PM2 com startup automático
#   6. (Opcional) Sobe Evolution API via Docker Compose
# =============================================================================

set -euo pipefail

REPO_URL="${1:-}"
DOMINIO="${2:-}"

if [[ -z "$REPO_URL" ]]; then
  echo "Uso: sudo bash scripts/setup-vm.sh <REPO_URL> [DOMINIO]"
  echo "Exemplo: sudo bash scripts/setup-vm.sh https://github.com/user/repo.git app.dominio.com"
  exit 1
fi

DOMINIO_PROD="${DOMINIO:-localhost}"
DOMINIO_HOMOLOG="homolog.${DOMINIO_PROD}"

echo "============================================================"
echo "  Setup VM — Agente WhatsApp"
echo "  Repo:    $REPO_URL"
echo "  Prod:    $DOMINIO_PROD"
echo "  Homolog: $DOMINIO_HOMOLOG"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Pacotes base
# ---------------------------------------------------------------------------
echo ""
echo ">>> [1/8] Atualizando pacotes base..."
apt-get update -y
apt-get install -y \
  curl wget git nginx \
  build-essential python3 python3-pip \
  chromium-browser \
  ca-certificates gnupg \
  ufw \
  apt-transport-https software-properties-common

# Docker (necessário para Evolution API)
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

# ---------------------------------------------------------------------------
# 2. Node.js 20 via NodeSource
# ---------------------------------------------------------------------------
echo ""
echo ">>> [2/8] Instalando Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v) | npm: $(npm -v)"

# ---------------------------------------------------------------------------
# 3. PM2
# ---------------------------------------------------------------------------
echo ""
echo ">>> [3/8] Instalando PM2..."
npm install -g pm2
pm2 update

# ---------------------------------------------------------------------------
# 4. Claude Code CLI
# ---------------------------------------------------------------------------
echo ""
echo ">>> [4/8] Instalando Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# ---------------------------------------------------------------------------
# 5. Estrutura de diretórios
# ---------------------------------------------------------------------------
echo ""
echo ">>> [5/8] Criando estrutura de diretórios..."

DEPLOY_USER="${SUDO_USER:-ubuntu}"

mkdir -p /srv/homolog
mkdir -p /srv/prod

# Clonar repositório
if [[ ! -d "/srv/homolog/agente-wpp/.git" ]]; then
  git clone -b develop "$REPO_URL" /srv/homolog/agente-wpp || \
  git clone "$REPO_URL" /srv/homolog/agente-wpp
  cd /srv/homolog/agente-wpp && git checkout develop 2>/dev/null || true
fi

if [[ ! -d "/srv/prod/agente-wpp/.git" ]]; then
  git clone -b main "$REPO_URL" /srv/prod/agente-wpp
fi

# Ajustar permissões
chown -R "$DEPLOY_USER:$DEPLOY_USER" /srv/homolog /srv/prod

# Criar arquivos .env a partir do exemplo (se não existirem)
if [[ ! -f "/srv/homolog/agente-wpp/.env" ]]; then
  cp /srv/homolog/agente-wpp/.env.homolog.example /srv/homolog/agente-wpp/.env
  echo "  ⚠  /srv/homolog/agente-wpp/.env criado — PREENCHA as chaves antes de iniciar!"
fi

if [[ ! -f "/srv/prod/agente-wpp/.env" ]]; then
  cp /srv/prod/agente-wpp/.env.prod.example /srv/prod/agente-wpp/.env
  echo "  ⚠  /srv/prod/agente-wpp/.env criado — PREENCHA as chaves antes de iniciar!"
fi

# ---------------------------------------------------------------------------
# 6. Nginx
# ---------------------------------------------------------------------------
echo ""
echo ">>> [6/8] Configurando Nginx..."

cat > /etc/nginx/sites-available/agente-homolog <<NGINX_HOMOLOG
server {
    listen 80;
    server_name ${DOMINIO_HOMOLOG};

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        # SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
NGINX_HOMOLOG

cat > /etc/nginx/sites-available/agente-prod <<NGINX_PROD
server {
    listen 80;
    server_name ${DOMINIO_PROD};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        # SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
NGINX_PROD

ln -sf /etc/nginx/sites-available/agente-homolog /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/agente-prod    /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

# ---------------------------------------------------------------------------
# 7. Firewall
# ---------------------------------------------------------------------------
echo ""
echo ">>> [7/8] Configurando firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ---------------------------------------------------------------------------
# 8. PM2 startup
# ---------------------------------------------------------------------------
echo ""
echo ">>> [8/8] Configurando PM2 startup..."
sudo -u "$DEPLOY_USER" pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" | tail -1 | bash || true

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Setup concluído!"
echo "============================================================"
echo ""
echo "  PRÓXIMOS PASSOS:"
echo ""
echo "  1. Preencha as variáveis de ambiente:"
echo "       nano /srv/homolog/agente-wpp/.env"
echo "       nano /srv/prod/agente-wpp/.env"
echo ""
echo "  2. Execute o deploy inicial:"
echo "       bash /srv/homolog/agente-wpp/scripts/deploy.sh homolog"
echo "       bash /srv/prod/agente-wpp/scripts/deploy.sh prod"
echo ""
echo "  3. Autentique o WhatsApp (primeira vez, se WHATSAPP_PROVIDER=wwebjs):"
echo "       pm2 logs agente-prod      # escaneie o QR code"
echo ""
echo "  4. (Opcional) Migrar para Evolution API:"
echo "       docker compose -f /srv/evolution/docker-compose.yml up -d"
echo "       # Depois defina WHATSAPP_PROVIDER=evolution nos .env e reinicie o PM2"
echo ""
echo "  5. (Opcional) SSL com Let's Encrypt:"
echo "       apt install certbot python3-certbot-nginx -y"
echo "       certbot --nginx -d ${DOMINIO_PROD} -d ${DOMINIO_HOMOLOG}"
echo ""
