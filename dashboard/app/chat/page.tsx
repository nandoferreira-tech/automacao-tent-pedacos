'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Phone, RefreshCw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  phone: string
  name: string
  lastMessage: string
  lastDirection: 'in' | 'out'
  lastAt: string
  unread: number
}

interface ChatMsg {
  id: string
  phone: string
  name: string
  direction: 'in' | 'out'
  body: string
  read: boolean
  createdAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`
  return phone
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Contatos
  const { data: contacts = [], isLoading: loadingContacts } = useQuery<Contact[]>({
    queryKey: ['chat-contacts'],
    queryFn: () => fetch('/api/chat/contacts').then(r => r.json()),
    refetchInterval: 5000,
  })

  // Mensagens do contato selecionado
  const { data: messages = [] } = useQuery<ChatMsg[]>({
    queryKey: ['chat-messages', selected],
    queryFn: () => fetch(`/api/chat/messages?phone=${selected}`).then(r => r.json()),
    enabled: !!selected,
    refetchInterval: 3000,
  })

  // SSE para novas mensagens em tempo real
  useEffect(() => {
    const es = new EventSource(`/api/chat/events?after=${new Date(Date.now() - 60000).toISOString()}`)
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data) as { type: string; data?: ChatMsg[] }
      if (payload.type === 'messages' && payload.data && payload.data.length > 0) {
        void qc.invalidateQueries({ queryKey: ['chat-contacts'] })
        if (selected && payload.data.some(m => m.phone === selected)) {
          void qc.invalidateQueries({ queryKey: ['chat-messages', selected] })
        }
      }
    }
    return () => es.close()
  }, [selected, qc])

  // Scroll para o fim quando chegam novas mensagens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!selected || !input.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected, message: input.trim() }),
      })
      setInput('')
      void qc.invalidateQueries({ queryKey: ['chat-messages', selected] })
      void qc.invalidateQueries({ queryKey: ['chat-contacts'] })
    } finally {
      setSending(false)
    }
  }, [selected, input, sending, qc])

  const selectedContact = contacts.find(c => c.phone === selected)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Contacts list ──────────────────────────────────────────────────── */}
      <div className="w-72 border-r border-border flex flex-col bg-white shrink-0">
        <div className="px-4 py-4 border-b border-border flex items-center gap-2">
          <MessageSquare size={18} className="text-primary" />
          <h1 className="font-bold text-sm text-gray-900">Chat WhatsApp</h1>
          {loadingContacts && <RefreshCw size={13} className="ml-auto animate-spin text-gray-400" />}
        </div>

        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && !loadingContacts && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma conversa ainda.<br />As mensagens aparecerão aqui.
            </div>
          )}
          {contacts.map(c => (
            <button
              key={c.phone}
              onClick={() => setSelected(c.phone)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-gray-50 transition-colors ${
                selected === c.phone ? 'bg-red-50 border-l-2 border-l-primary' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold text-xs text-gray-900 truncate max-w-[140px]">
                  {c.name !== c.phone ? c.name : formatPhone(c.phone)}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.lastAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-gray-500 truncate">
                  {c.lastDirection === 'out' && <span className="text-primary">↩ </span>}
                  {c.lastMessage}
                </p>
                {c.unread > 0 && (
                  <span className="shrink-0 bg-primary text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {c.unread > 9 ? '9+' : c.unread}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Conversation ───────────────────────────────────────────────────── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Selecione uma conversa para começar
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-5 py-3 border-b border-border bg-white flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare size={15} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">
                {selectedContact?.name !== selected ? selectedContact?.name : formatPhone(selected)}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Phone size={9} /> {formatPhone(selected)}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f0f2f5]">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[72%] px-3 py-2 rounded-2xl text-[13px] shadow-sm ${
                    msg.direction === 'out'
                      ? 'bg-[#dcf8c6] text-gray-800 rounded-br-sm'
                      : 'bg-white text-gray-800 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words leading-snug">{msg.body}</p>
                  <p className={`text-[10px] mt-1 ${msg.direction === 'out' ? 'text-right text-gray-500' : 'text-gray-400'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border bg-white flex items-end gap-2 shrink-0">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-28 overflow-y-auto"
              style={{ lineHeight: '1.4' }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
