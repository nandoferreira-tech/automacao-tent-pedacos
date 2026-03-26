# Agente WhatsApp — Contexto para Claude Code

## Stack planejada
- Node.js + TypeScript
- **Gemini** (`@google/genai`) como LLM principal
- **Google Maps API** para validação de endereço e cobertura de entrega
- **whatsapp-web.js** para integração com WhatsApp
- **Prisma + SQLite** (v1) → PostgreSQL quando o dashboard for desenvolvido

## Estrutura
- `src/agent/` — lógica do agente e integração com Claude
- `src/handlers/` — tratamento de mensagens recebidas
- `src/tools/` — ferramentas que o agente pode invocar
- `src/prompts/` — system prompts e templates
- `config/` — configurações centrais
- `docs/` — documentação e ideação

## Convenções
- Português do Brasil em comentários e docs
- Variáveis de ambiente via `.env` (nunca commitar)
