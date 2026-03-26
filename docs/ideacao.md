# Ideação — Tentação em Pedaços

## Objetivo
Agente de WhatsApp automatizado para empresa de bolos caseiros, focado em atendimento,
vendas, fidelização e notificações — com escalada para atendente humano como último recurso.
v1 voltada para validação do fluxo. v2 inclui painel de gerenciamento de pedidos.

---

## Casos de Uso

### Clientes (novos e recorrentes)
- [x] Ver cardápio por categoria
- [x] Fazer pedido via WhatsApp
- [x] Escolher entre retirada ou entrega própria
- [x] Receber prazo automático baseado no horário
- [x] Pagar via Pix (chave telefone, comprovante enviado na conversa)
- [x] Pagar na entrega com cartão débito/crédito
- [x] Consultar status do pedido
- [x] Cadastrar-se no programa de fidelidade
- [x] Consultar pontos de fidelidade
- [x] Falar com atendente humano
- [x] Receber notificação no WhatsApp a cada mudança de status do pedido

### Empresa — Painel Web (v2)
- [ ] Ver todos os pedidos ativos (não finalizados/entregues)
- [ ] Atualizar status dos pedidos manualmente
- [ ] Confirmar ou recusar comprovante Pix pelo painel
- [ ] Receber alerta visual/sonoro de novo pedido em tempo real
- [ ] Filtrar pedidos por status, data ou cliente
- [ ] Buscar pedido por nome ou número do cliente
- [ ] Ver histórico de pedidos finalizados (aba separada)
- [ ] Ver resumo financeiro: totais do dia, semana e mês

---

## Fluxo Principal (WhatsApp)

```
Boas-vindas
→ Menu numerado: [Cardápio] [Pedido] [Status] [Fidelidade] [Atendente]
→ Categoria: Bolos no Pote | Bolos Artesanais Tradicionais | Bolos Artesanais Especiais
→ Produto selecionado (menu numerado)
→ Entrega: Retirada | Entrega própria (endereço)
   → Retirada: endereço da loja + link Google Maps
   → Entrega: valida bairro via tool (resposta fixa, sem tokens)
→ Prazo automático:
     Pedido até 11h → entrega tarde do mesmo dia
     Pedido após 11h → entrega manhã do dia seguinte
→ Resumo do pedido + confirmação
→ Pagamento (menu numerado):
     Pix          → instrução com chave + valor (cliente envia comprovante)
     Cartão/Dinheiro → cobrado na entrega
→ Confirmação com mensagem fixa de agradecimento
→ Notificação no WhatsApp da empresa
```

---

## Status do Pedido

| Status | Descrição |
|---|---|
| `aguardando_pagamento` | Pix gerado, aguardando comprovante |
| `pago` | Comprovante confirmado pelo painel |
| `em_producao` | Equipe iniciou o preparo |
| `pronto` | Pronto para retirada ou saiu para entrega |
| `entregue` | Pedido finalizado — vai para o histórico |
| `cancelado` | Pedido cancelado — vai para o histórico |

Toda mudança de status dispara mensagem automática para o cliente no WhatsApp.

---

## Painel Web — Telas e Funcionalidades

### Aba: Pedidos Ativos
- Listagem de todos os pedidos não finalizados
- Colunas: Nº pedido | Item | Valor | Cliente | Endereço | Hora | Status
- Ação por pedido: alterar status (dropdown)
- Ação para Pix: confirmar ou recusar comprovante
- Alerta em tempo real (visual + sonoro) ao chegar novo pedido
- Filtros: status, data, busca por nome/telefone

### Aba: Histórico
- Pedidos com status `entregue` ou `cancelado`
- Mesmas colunas da listagem ativa
- Filtros: período, status, busca

### Aba: Financeiro
- Total de pedidos e faturamento: dia / semana / mês
- (futuro) breakdown por forma de pagamento

---

## Notificações Proativas para o Cliente
- Pago → confirmação do pagamento
- Em produção → "seu pedido está sendo preparado"
- Pronto → "pronto para retirada" ou "saiu para entrega"
- Entregue → confirmação de entrega + (futuro) avaliação
- Cancelado → mensagem de cancelamento

---

## Memória e Cadastro
- **Sem cadastro:** cliente reconhecido por número + nome
- **Com cadastro (fidelidade):** histórico de pedidos + pontos acumulados

### Formulário de Cadastro (mini-CRM / leads)
| Campo | Tipo |
|---|---|
| Nome completo | texto |
| WhatsApp | capturado automaticamente |
| E-mail | texto |
| Data de nascimento | data |
| Bairro / Cidade | texto |
| CEP | texto |
| Como nos conheceu | seleção |

---

## Arquitetura

**Stack agente:** Node.js + TypeScript + whatsapp-web.js + Gemini API + SQLite (Prisma)
**Stack painel:** A definir (React / Next.js + API REST sobre o mesmo banco SQLite → PostgreSQL em produção)

```
whatsapp-web.js → MessageHandler → AgentService (Gemini LLM)
                                         │
                    ┌────────────────────┼────────────────┐
                    ▼                    ▼                 ▼
              OrderService        CustomerService     MapsService
              (pedidos/Pix)       (fidelidade/CRM)   (endereço/entrega)
                    │
               SQLite via Prisma
                    │
               Painel Web (API REST / WebSocket para tempo real)
```

---

## Área de Entrega (v1)
Bairros atendidos em São Paulo: Pinheiros, Vila Madalena, Lapa, Alto de Pinheiros, Butantã, Itaim Bibi, Jardim Paulista.
Endereço da loja (retirada): Rua Padre Carvalho, 388.
Horário de corte: 11h.

---

## Decisões Registradas

| Decisão | Alternativas | Motivo |
|---|---|---|
| whatsapp-web.js | Baileys, wppconnect | Mais estável e documentada para v1 |
| SQLite | PostgreSQL, MongoDB | Sem infraestrutura extra na validação |
| Pix manual (comprovante) | OpenPix/Woovi automático | Simplicidade na v1; automático planejado para v2 |
| Validação de bairro via tool | Google Maps API | Evitar custo e complexidade na v1 |
| Sem personalização de bolo | Formulário livre | Simplificar fluxo v1 |
| Painel sem login (v1) | Auth completo | Validar funcionalidades antes de investir em segurança |

---

## Fora do Escopo da v1
- Autenticação no painel
- Entrega por terceiros (iFood Entrega, Lalamove)
- Personalização de bolos
- Múltiplas sessões WhatsApp
- Pix automático (OpenPix/Woovi)
