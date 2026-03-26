// Configurações centrais do agente
module.exports = {
  name: process.env.AGENT_NAME || 'Assistente',
  language: process.env.AGENT_LANGUAGE || 'pt-BR',
  model: 'claude-sonnet-4-6',
  maxTokens: 1024,
};
