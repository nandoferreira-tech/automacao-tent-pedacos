'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Pencil, Check, X, MessageSquare } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const NW = 220   // node width
const NH = 118   // node base height (for arrow calc)
const CANVAS_W = 1380
const CANVAS_H = 1300

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowMessage {
  id: string
  stage: string
  label: string
  description: string
  message: string
  editable: boolean
}

// ── Default messages ──────────────────────────────────────────────────────────

const DEFAULT_MESSAGES: FlowMessage[] = [
  { id: 'welcome_new',    stage: 'new',            label: 'Boas-vindas (novo)',       description: '1ª mensagem — cliente novo',            message: 'Oi! 😊 Seja bem-vindo(a) à *Tentação em Pedaços*! Aqui é a Paty, tô aqui pra te ajudar!\n\nPode me dizer seu *nome*? 😊', editable: true },
  { id: 'welcome_back',   stage: 'main_menu',      label: 'Menu Principal',           description: 'Cliente já cadastrado',                 message: 'Oi, *{nome}*! 😊 Seja bem-vindo(a) de volta à *Tentação em Pedaços*! Aqui é a Paty!', editable: true },
  { id: 'category_menu',  stage: 'category_select',label: 'Escolha de categoria',     description: 'Pote · Tradicional · Especial',         message: 'Ótimo! Qual categoria você prefere?', editable: true },
  { id: 'cobertura',      stage: 'cobertura',      label: 'Cobertura',                description: 'Oferta cobertura (+R$ 8,75)',            message: 'Deseja adicionar uma cobertura? (+R$ 8,75) 😋', editable: true },
  { id: 'delivery',       stage: 'delivery_type',  label: 'Entrega ou Retirada',      description: 'Como o cliente quer receber',            message: 'Como você prefere receber seu *{produto}*?', editable: true },
  { id: 'timeout_close',  stage: 'timeout',        label: 'Inatividade (10 min)',     description: 'Encerramento automático por inatividade', message: 'Tudo bem, *{nome}*! Obrigada pelo contato! 💜\nVou encerrar nossa conversa — é só chamar! 🎂', editable: true },
  { id: 'address_confirm',stage: 'address_confirm',label: 'Confirmar endereço salvo', description: 'Sugere endereço usado anteriormente',   message: 'Vi que você usou o endereço *{endereço}* da última vez. Confirma a entrega aqui? 😊', editable: true },
  { id: 'address_input',  stage: 'address_input',  label: 'Novo endereço',            description: 'Pede o endereço completo',              message: 'Me passa o endereço completo: rua, número e bairro. 😊', editable: true },
  { id: 'payment',        stage: 'payment',        label: 'Pagamento + Resumo',       description: 'Pix · Cartão · Dinheiro',               message: 'Confirma? Escolha a forma de pagamento:', editable: true },
  { id: 'done',           stage: 'done',           label: 'Pedido Confirmado',        description: 'Confirmação enviada ao cliente',        message: '🎂 *Pedido #{numero} recebido!*\n\nEstamos confirmando com a equipe. Em instantes você receberá a confirmação! 😊', editable: true },
]

// ── Layout positions ──────────────────────────────────────────────────────────

const POS: Record<string, { x: number; y: number }> = {
  welcome_new:    { x: 40,   y: 80  },
  welcome_back:   { x: 330,  y: 80  },
  category_menu:  { x: 620,  y: 80  },
  cobertura:      { x: 620,  y: 280 },
  delivery:       { x: 620,  y: 480 },
  timeout_close:  { x: 1060, y: 480 },
  address_confirm:{ x: 260,  y: 680 },
  address_input:  { x: 620,  y: 680 },
  payment:        { x: 620,  y: 880 },
  done:           { x: 620,  y: 1080},
}

// ── Node colors ───────────────────────────────────────────────────────────────

const COLORS: Record<string, { bg: string; border: string; header: string }> = {
  welcome_new:    { bg: '#EFF6FF', border: '#93C5FD', header: '#2563EB' },
  welcome_back:   { bg: '#F0FDF4', border: '#86EFAC', header: '#15803D' },
  category_menu:  { bg: '#FAF5FF', border: '#C4B5FD', header: '#7C3AED' },
  cobertura:      { bg: '#FEFCE8', border: '#FCD34D', header: '#B45309' },
  delivery:       { bg: '#FFF7ED', border: '#FDBA74', header: '#C2410C' },
  timeout_close:  { bg: '#FFF1F2', border: '#FDA4AF', header: '#DC2626' },
  address_confirm:{ bg: '#F0FDFA', border: '#5EEAD4', header: '#0D9488' },
  address_input:  { bg: '#ECFDF5', border: '#6EE7B7', header: '#059669' },
  payment:        { bg: '#FDF4FF', border: '#D8B4FE', header: '#9333EA' },
  done:           { bg: '#F8FAFC', border: '#94A3B8', header: '#334155' },
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function px(id: string) { return POS[id]!.x }
function py(id: string) { return POS[id]!.y }
function hc(id: string) { return px(id) + NW / 2 }
function vc(id: string) { return py(id) + NH / 2 }
function bt(id: string) { return py(id) + NH }

// ── Connections ───────────────────────────────────────────────────────────────

interface Connection {
  from: string
  to: string
  label?: string
  labelX: number
  labelY: number
  path: string
}

const CONNECTIONS: Connection[] = [
  // welcome_new → welcome_back (horizontal)
  {
    from: 'welcome_new', to: 'welcome_back',
    labelX: 245, labelY: 72,
    path: `M ${px('welcome_new') + NW} ${vc('welcome_new')} C ${px('welcome_new') + NW + 40} ${vc('welcome_new')}, ${px('welcome_back') - 40} ${vc('welcome_back')}, ${px('welcome_back')} ${vc('welcome_back')}`,
  },
  // welcome_back → category_menu (horizontal)
  {
    from: 'welcome_back', to: 'category_menu',
    labelX: 535, labelY: 72,
    path: `M ${px('welcome_back') + NW} ${vc('welcome_back')} C ${px('welcome_back') + NW + 40} ${vc('welcome_back')}, ${px('category_menu') - 40} ${vc('category_menu')}, ${px('category_menu')} ${vc('category_menu')}`,
  },
  // category_menu → cobertura (straight down)
  {
    from: 'category_menu', to: 'cobertura', label: 'Tradicionais / Especiais',
    labelX: 634, labelY: 212,
    path: `M ${hc('category_menu')} ${bt('category_menu')} C ${hc('category_menu')} ${bt('category_menu') + 40}, ${hc('cobertura')} ${py('cobertura') - 40}, ${hc('cobertura')} ${py('cobertura')}`,
  },
  // category_menu → delivery (bypass cobertura, routes right)
  {
    from: 'category_menu', to: 'delivery', label: 'Bolos no Pote',
    labelX: 866, labelY: 268,
    path: `M ${hc('category_menu')} ${bt('category_menu')} C ${hc('category_menu')} ${bt('category_menu') + 28}, ${px('category_menu') + NW + 90} ${bt('category_menu') + 28}, ${px('category_menu') + NW + 90} ${vc('delivery')} C ${px('category_menu') + NW + 90} ${py('delivery') - 28}, ${px('delivery') + NW + 10} ${py('delivery') - 20}, ${px('delivery') + NW} ${vc('delivery')}`,
  },
  // cobertura → delivery (straight down)
  {
    from: 'cobertura', to: 'delivery',
    labelX: 634, labelY: 412,
    path: `M ${hc('cobertura')} ${bt('cobertura')} C ${hc('cobertura')} ${bt('cobertura') + 40}, ${hc('delivery')} ${py('delivery') - 40}, ${hc('delivery')} ${py('delivery')}`,
  },
  // delivery → address_confirm (down-left)
  {
    from: 'delivery', to: 'address_confirm', label: 'entrega (end. salvo)',
    labelX: 380, labelY: 596,
    path: `M ${hc('delivery')} ${bt('delivery')} C ${hc('delivery')} ${bt('delivery') + 60}, ${hc('address_confirm')} ${py('address_confirm') - 60}, ${hc('address_confirm')} ${py('address_confirm')}`,
  },
  // delivery → address_input (down, slight nudge)
  {
    from: 'delivery', to: 'address_input', label: 'entrega (novo end.)',
    labelX: 660, labelY: 596,
    path: `M ${hc('delivery')} ${bt('delivery')} C ${hc('delivery')} ${bt('delivery') + 40}, ${hc('address_input')} ${py('address_input') - 40}, ${hc('address_input')} ${py('address_input')}`,
  },
  // delivery → payment (bypass address level, routes right)
  {
    from: 'delivery', to: 'payment', label: 'retirada',
    labelX: 900, labelY: 700,
    path: `M ${px('delivery') + NW} ${vc('delivery')} C ${px('delivery') + NW + 80} ${vc('delivery')}, ${px('delivery') + NW + 80} ${vc('payment')}, ${px('payment') + NW} ${vc('payment')}`,
  },
  // address_confirm → address_input (horizontal right)
  {
    from: 'address_confirm', to: 'address_input', label: 'trocar endereço',
    labelX: 428, labelY: 672,
    path: `M ${px('address_confirm') + NW} ${vc('address_confirm')} C ${px('address_confirm') + NW + 40} ${vc('address_confirm')}, ${px('address_input') - 40} ${vc('address_input')}, ${px('address_input')} ${vc('address_input')}`,
  },
  // address_confirm → payment (down-right)
  {
    from: 'address_confirm', to: 'payment',
    labelX: 380, labelY: 790,
    path: `M ${hc('address_confirm')} ${bt('address_confirm')} C ${hc('address_confirm')} ${bt('address_confirm') + 60}, ${hc('payment')} ${py('payment') - 60}, ${hc('payment')} ${py('payment')}`,
  },
  // address_input → payment (straight down)
  {
    from: 'address_input', to: 'payment',
    labelX: 634, labelY: 812,
    path: `M ${hc('address_input')} ${bt('address_input')} C ${hc('address_input')} ${bt('address_input') + 40}, ${hc('payment')} ${py('payment') - 40}, ${hc('payment')} ${py('payment')}`,
  },
  // payment → done (straight down)
  {
    from: 'payment', to: 'done',
    labelX: 634, labelY: 1012,
    path: `M ${hc('payment')} ${bt('payment')} C ${hc('payment')} ${bt('payment') + 40}, ${hc('done')} ${py('done') - 40}, ${hc('done')} ${py('done')}`,
  },
]

// ── Page component ────────────────────────────────────────────────────────────

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
      const data = await r.json() as FlowMessage[]
      // Merge: usa mensagem salva se existir, senão mantém o DEFAULT
      if (!data || data.length === 0) return DEFAULT_MESSAGES
      return DEFAULT_MESSAGES.map(def => {
        const saved = data.find(d => d.id === def.id)
        return saved ? { ...def, message: saved.message } : def
      })
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

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-white shrink-0">
        <GitBranch size={20} className="text-primary" />
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-none">Fluxo de Atendimento</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique no <span className="inline-flex items-center gap-0.5 text-gray-500"><Pencil size={10} /></span> para editar o texto de cada etapa
            &nbsp;·&nbsp; use <code className="text-[10px] bg-gray-100 px-1 rounded">{'{nome}'}</code> <code className="text-[10px] bg-gray-100 px-1 rounded">{'{produto}'}</code> <code className="text-[10px] bg-gray-100 px-1 rounded">{'{endereço}'}</code> como variáveis
          </p>
        </div>
        {saved && (
          <span className="ml-auto text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
            ✓ Salvo
          </span>
        )}
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-[#f1f5f9]"
        style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '28px 28px' }}>
        <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H, minWidth: CANVAS_W }}>

          {/* ── SVG arrows ─────────────────────────────────────────────────── */}
          <svg
            style={{ position: 'absolute', inset: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: 'none', overflow: 'visible' }}
          >
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L8,3.5 z" fill="#94a3b8" />
              </marker>
              <marker id="arrow-label" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L8,3.5 z" fill="#64748b" />
              </marker>
            </defs>

            {CONNECTIONS.map(conn => (
              <g key={`${conn.from}-${conn.to}`}>
                <path
                  d={conn.path}
                  stroke={conn.label ? '#64748b' : '#94a3b8'}
                  strokeWidth={conn.label ? 1.5 : 1.5}
                  strokeDasharray={conn.label ? '6 3' : undefined}
                  fill="none"
                  markerEnd={conn.label ? 'url(#arrow-label)' : 'url(#arrow)'}
                />
                {conn.label && (
                  <text
                    x={conn.labelX}
                    y={conn.labelY}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#475569"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="500"
                  >
                    {conn.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* ── Nodes ──────────────────────────────────────────────────────── */}
          {messages.map(msg => {
            const pos = POS[msg.id]
            const color = COLORS[msg.id]
            if (!pos || !color) return null
            const isEditing = editing === msg.id

            return (
              <div
                key={msg.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: NW,
                  background: color.bg,
                  border: `1.5px solid ${color.border}`,
                  borderRadius: 10,
                  boxShadow: '0 1px 6px rgba(0,0,0,0.10)',
                  overflow: 'hidden',
                  zIndex: isEditing ? 20 : 10,
                  minWidth: isEditing ? 280 : NW,
                  transition: 'box-shadow 0.15s',
                }}
              >
                {/* Node header */}
                <div
                  style={{ background: color.header, padding: '7px 10px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <MessageSquare size={12} color="rgba(255,255,255,0.85)" style={{ flexShrink: 0 }} />
                    <span style={{ color: 'white', fontSize: 11, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {msg.label}
                    </span>
                  </div>
                  {msg.editable && !isEditing && (
                    <button
                      onClick={() => startEdit(msg)}
                      title="Editar mensagem"
                      style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, padding: '3px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      <Pencil size={11} color="white" />
                    </button>
                  )}
                  {isEditing && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => mutation.mutate({ id: msg.id, message: editValue })}
                        disabled={mutation.isPending}
                        style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 5, padding: '3px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Salvar"
                      >
                        <Check size={11} color="white" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, padding: '3px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Cancelar"
                      >
                        <X size={11} color="white" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Node body */}
                <div style={{ padding: '8px 10px 9px' }}>
                  <p style={{ fontSize: 9, color: '#64748b', marginBottom: 5, lineHeight: 1.3 }}>{msg.description}</p>

                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      rows={5}
                      style={{
                        width: '100%',
                        fontSize: 10,
                        fontFamily: 'monospace',
                        border: '1px solid ' + color.border,
                        borderRadius: 5,
                        padding: '5px 7px',
                        resize: 'vertical',
                        outline: 'none',
                        background: 'white',
                        color: '#1e293b',
                        lineHeight: 1.4,
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <p style={{
                      fontSize: 10,
                      color: '#374151',
                      background: 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(255,255,255,0.5)',
                      borderRadius: 5,
                      padding: '5px 7px',
                      margin: 0,
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'monospace',
                      maxHeight: 56,
                      overflow: 'hidden',
                    }}>
                      {msg.message}
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {/* ── Legend ─────────────────────────────────────────────────────── */}
          <div style={{ position: 'absolute', left: 1060, top: 660, background: 'white', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0', fontSize: 10, color: '#64748b', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <p style={{ fontWeight: 700, marginBottom: 6, color: '#374151' }}>Legenda</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <svg width="36" height="10"><line x1="0" y1="5" x2="30" y2="5" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)" /></svg>
              <span>Fluxo principal</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="36" height="10"><line x1="0" y1="5" x2="30" y2="5" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 2" /></svg>
              <span>Ramificação opcional</span>
            </div>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
              <p style={{ color: '#94a3b8', fontSize: 9 }}>Clique em <Pencil size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> para editar</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
