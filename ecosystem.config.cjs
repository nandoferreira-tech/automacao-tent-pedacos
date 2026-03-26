// ecosystem.config.cjs — Configuração PM2 para ambos os ambientes
// Referência: https://pm2.keymetrics.io/docs/usage/application-declaration/
//
// Cada ambiente tem 2 processos:
//   - agente-<env>    : whatsapp-web.js + Gemini (porta interna)
//   - dashboard-<env> : Next.js (porta HTTP pública via Nginx)

'use strict'

module.exports = {
  apps: [
    // =========================================================
    // PRODUÇÃO
    // =========================================================
    {
      name: 'agente-prod',
      script: './dist/index.js',
      cwd: '/srv/prod/agente-wpp',
      env_file: '/srv/prod/agente-wpp/.env',
      // Reinicia automaticamente se crashar
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Log
      out_file: '/srv/prod/logs/agente-prod.log',
      error_file: '/srv/prod/logs/agente-prod-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'dashboard-prod',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/srv/prod/agente-wpp/dashboard',
      env_file: '/srv/prod/agente-wpp/.env',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      out_file: '/srv/prod/logs/dashboard-prod.log',
      error_file: '/srv/prod/logs/dashboard-prod-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // =========================================================
    // HOMOLOGAÇÃO
    // =========================================================
    {
      name: 'agente-homolog',
      script: './dist/index.js',
      cwd: '/srv/homolog/agente-wpp',
      env_file: '/srv/homolog/agente-wpp/.env',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      out_file: '/srv/homolog/logs/agente-homolog.log',
      error_file: '/srv/homolog/logs/agente-homolog-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'dashboard-homolog',
      script: 'node_modules/.bin/next',
      args: 'start -p 3100',
      cwd: '/srv/homolog/agente-wpp/dashboard',
      env_file: '/srv/homolog/agente-wpp/.env',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      out_file: '/srv/homolog/logs/dashboard-homolog.log',
      error_file: '/srv/homolog/logs/dashboard-homolog-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
