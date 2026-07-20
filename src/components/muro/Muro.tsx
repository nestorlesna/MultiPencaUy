import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchMuroMessages,
  postMuroMessage,
  deleteMuroMessage,
  countWords,
  MURO_MAX_CHARS,
  MURO_MAX_WORDS,
  type MuroMessage,
} from '../../services/v2/muroService'
import { formatRelativeTime } from '../../utils/formatters'
import { UserAvatar } from '../ui/UserAvatar'

const COOLDOWN_SECONDS = 30

export function Muro({
  tenCompId,
  userId,
  canPost,
  isAdmin,
}: {
  tenCompId: string
  userId?: string
  canPost: boolean
  isAdmin: boolean
}) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['v2', 'muro', tenCompId],
    queryFn: () => fetchMuroMessages(tenCompId),
    staleTime: 1000 * 30,
  })

  useEffect(() => () => clearInterval(cooldownRef.current), [])

  function startCooldown() {
    setCooldown(COOLDOWN_SECONDS)
    clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(cooldownRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const postMutation = useMutation({
    mutationFn: () => postMuroMessage(tenCompId, userId!, texto),
    onSuccess: () => {
      setTexto('')
      startCooldown()
      qc.invalidateQueries({ queryKey: ['v2', 'muro', tenCompId] })
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'No se pudo enviar el mensaje'
      toast.error(msg)
    },
  })

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteMuroMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['v2', 'muro', tenCompId] }),
    onError: () => toast.error('No se pudo borrar el mensaje'),
  })

  const chars = texto.trim().length
  const words = countWords(texto)
  const overLimit = chars > MURO_MAX_CHARS || words > MURO_MAX_WORDS
  const canSend = canPost && chars > 0 && !overLimit && cooldown === 0 && !postMutation.isPending

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Muro</h2>
      </div>

      {/* Formulario */}
      {canPost ? (
        <form
          onSubmit={e => { e.preventDefault(); if (canSend) postMutation.mutate() }}
          className="mb-4"
        >
          <div className="flex gap-2">
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              maxLength={MURO_MAX_CHARS + 20}
              placeholder="Dejá un mensaje…"
              className="input text-sm flex-1"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="btn-primary px-3 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Enviar"
            >
              {postMutation.isPending
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1 px-0.5">
            <span className={`text-[11px] ${overLimit ? 'text-red-400' : 'text-text-muted'}`}>
              {chars}/{MURO_MAX_CHARS} · {words}/{MURO_MAX_WORDS} palabras
            </span>
            {cooldown > 0 && (
              <span className="text-[11px] text-text-muted">Esperá {cooldown}s</span>
            )}
          </div>
        </form>
      ) : (
        <p className="text-xs text-text-muted mb-4">
          Uníte a la penca para dejar mensajes.
        </p>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">
          Todavía no hay mensajes. ¡Sé el primero!
        </p>
      ) : (
        <div className="space-y-2.5">
          {messages.map(m => (
            <MuroRow
              key={m.id}
              m={m}
              canDelete={isAdmin || m.user_id === userId}
              onDelete={() => delMutation.mutate(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MuroRow({
  m,
  canDelete,
  onDelete,
}: {
  m: MuroMessage
  canDelete: boolean
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-2.5 group">
      <UserAvatar
        avatarUrl={m.avatar_url}
        seed={m.user_id}
        className="w-7 h-7 flex-shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-text-primary truncate">{m.display_name}</span>
          <span className="text-[10px] text-text-muted flex-shrink-0">{formatRelativeTime(m.created_at)}</span>
        </div>
        <p className="text-sm text-text-secondary break-words">{m.texto}</p>
      </div>
      {canDelete && (
        <button
          onClick={onDelete}
          className="btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          aria-label="Borrar mensaje"
        >
          <Trash2 size={13} className="text-text-muted hover:text-red-400" />
        </button>
      )}
    </div>
  )
}
