'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Pencil, Check, X, ArrowDown, ChevronRight } from 'lucide-react'

interface FlowMessage {
  id: string
  stage: string
  label: string
  description: string
  message: string
  editable: boolean
  nextStages?: string[]
}

const DEFAULT_MESSAGES: FlowMessage[] = [
  { id: 'welcome_new',    stage: 'new',              label: 'Boas-vindas (novo)',      description: 'Primeira mensagem para clientes novos',         message: 'Oi! 😊 Seja bem-vindo(a) à *Tentação em Pedaços*! Aqui é a Paty, tô aqui pra te ajudar!\n\nPode me dizer seu *nome*? 😊', editable: true, nextStages: ['awaiting_name'] },
  { id: 'welcome_back',   stage: 'main_menu',        label: 'Boas-vindas (retorno)',   description: 'Cliente já cadastrado voltando a conversar',    message: 'Oi, *{nome}*! 😊 Seja bem-vindo(a) de volta à *Tentação em Pedaços*! Aqui é a Paty!', editable: true, nextStages: ['category_select', 'status', 'fidelidade', 'atendente'] },
  { id: 'category_menu',  stage: 'category_select',  label: 'Escolha de categoria',    description: 'Pergunta qual categoria de bolo',               message: 'Ótimo! Qual categoria você prefere?', editable: true, nextStages: ['product_pote', 'product_tradicional', 'product_especial'] },
  { id: 'cobertura',      stage: 'cobertura',        label: 'Cobertura',               description: 'Pergunta sobre cobertura (Tradicionais/Especiais)', message: 'Deseja adicionar uma cobertura? (+R$ 8,75) 😋', editable: true, nextStages: ['delivery_type'] },
  { id: 'delivery',       stage: 'delivery_type',    label: 'Entrega ou retirada',     description: 'Pergunta como o cliente quer receber',          message: 'Como você prefere receber seu *{produto}*?', editable: true, nextStages: ['address_confirm', 'address_input', 'payment'] },
  { id: 'address_confirm',stage: 'address_confirm',  label: 'Confirmar endereço salvo', description: 'Sugere endereço já usado antes',               message: 'Vi que você usou o endereço *{endereço}* da última vez. Confirma a entrega aqui? 😊', editable: true, nextStages: ['payment', 'address_input'] },
  { id: 'address_input',  stage: 'address_input',    label: 'Novo endereço',           description: 'Pede o endereço de entrega',                   message: 'Me passa o endereço completo: rua, número e bairro. 😊', editable: true, nextStages: ['payment'] },
  { id: 'payment',        stage: 'payment',          label: 'Pagamento + Resumo',      description: 'Mostra resumo e opções de pagamento',           message: 'Confirma? Escolha a forma de pagamento:', editable: true, nextStages: ['done'] },
  { id: 'done',           stage: 'done',             label: 'Pedido confirmado',       description: 'Confirmação de recebimento do pedido',          message: '🎂 *Pedido #{numero} recebido!*\n\nEstamos confirmando com a equipe. Em instantes você receberá a confirmação! 😊', editable: true, nextStages: [] },
  { id: 'timeout_close',  stage: 'timeout',          label: 'Encerramento por inatividade', description: 'Enviada após 10 min sem resposta',          message: 'Tudo bem, *{nome}*! Obrigada pelo contato! 💜\nVou encerrar nossa conversa por enquanto — é só chamar quando estiver pronta(o)! Até logo! 🎂', editable: true, nextStages: [] },
]

export default function FluxosPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: messages = DEFAULT_MESSAGES } = useQuery<FlowMessage[]>({
    queryKey: ['flow-messages'],
    queryFn: async () => {
      const r = await fetch('/api/fluxos/messages')
      if (!r.ok) return DEFAULT_MESSAGES
      return r.json() as Promise<FlowMessage[]>
    },
  })

  const mutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const updated = messages.map(m => m.id === id ? { ...m, message } : m)
      const r = await fetch('/api/fluxos/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      if (!r.ok) throw new Error('Erro ao salvar')
      return r.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flow-messages'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditing(null)
    },
  })

  function startEdit(msg: FlowMessage) {
    setEditing(msg.id)
    setEditValue(msg.message)
  }

  function cancelEdit() {
    setEditing(null)
    setEditValue('')
  }

  function saveEdit(id: string) {
    mutation.mutate({ id, message: editValue })
  }

  const stageColors: Record<string, string> = {
    new: 'bg-blue-50 border-blue-200',
    main_menu: 'bg-green-50 border-green-200',
    category_select: 'bg-purple-50 border-purple-200',
    cobertura: 'bg-yellow-50 border-yellow-200',
    delivery_type: 'bg-orange-50 border-orange-200',
    address_confirm: 'bg-teal-50 border-teal-200',
    address_input: 'bg-teal-50 border-teal-200',
    payment: 'bg-pink-50 border-pink-200',
    done: 'bg-gray-50 border-gray-200',
    timeout: 'bg-red-50 border-red-200',
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <GitBranch size={22} className="text-primary" />
        <h1 className="text-xl font-bold text-gray-900">Fluxo de Atendimento</h1>
        {saved && <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">✓ Salvo</span>}
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Edite as mensagens que a Paty envia em cada etapa do atendimento.
        Use <code className="text-xs bg-gray-100 px-1 rounded">{'{nome}'}</code>, <code className="text-xs bg-gray-100 px-1 rounded">{'{produto}'}</code> e <code className="text-xs bg-gray-100 px-1 rounded">{'{endereço}'}</code> como variáveis.
      </p>

      {/* Flow nodes */}
      <div className="flex flex-col items-center gap-0">
        {messages.map((msg, idx) => {
          const colorClass = stageColors[msg.stage] ?? 'bg-gray-50 border-gray-200'
          const isEditing = editing === msg.id
          return (
            <div key={msg.id} className="w-full flex flex-col items-center">
              <div className={`w-full rounded-xl border-2 ${colorClass} p-4 shadow-sm`}>
                {/* Node header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{msg.label}</p>
                    <p className="text-xs text-muted-foreground">{msg.description}</p>
                  </div>
                  {msg.editable && !isEditing && (
                    <button
                      onClick={() => startEdit(msg)}
                      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-colors"
                      title="Editar mensagem"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>

                {/* Message content */}
                {isEditing ? (
                  <div className="mt-2">
                    <textarea
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      rows={4}
                      className="w-full text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y font-mono"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => saveEdit(msg.id)}
                        disabled={mutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        <Check size={12} />
                        {mutation.isPending ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
                      >
                        <X size={12} />
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-700 bg-white/70 rounded-lg px-3 py-2 mt-1 whitespace-pre-wrap font-mono leading-relaxed border border-white/50">
                    {msg.message}
                  </p>
                )}

                {/* Next stages */}
                {msg.nextStages && msg.nextStages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {msg.nextStages.map(next => (
                      <span key={next} className="flex items-center gap-1 text-[10px] bg-white/60 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
                        <ChevronRight size={9} />
                        {next}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Arrow between nodes */}
              {idx < messages.length - 1 && (
                <div className="flex flex-col items-center my-1 text-gray-300">
                  <div className="w-px h-3 bg-gray-300" />
                  <ArrowDown size={14} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
