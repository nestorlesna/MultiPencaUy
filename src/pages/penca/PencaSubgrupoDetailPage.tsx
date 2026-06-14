import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ArrowLeft, UserPlus, X, Trophy, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { useTenComp } from '../../contexts/TenCompContext'
import { Modal } from '../../components/ui/Modal'
import {
  fetchSubgrupoDetailV2, fetchSubgrupoRankingV2, fetchSubgrupoMemberIdsV2,
  fetchTenCompMemberOptionsV2, addMemberToSubgrupoV2, removeMemberFromSubgrupoV2,
} from '../../services/v2/subgrupoService'

export function PencaSubgrupoDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { tenComp } = useTenComp()
  const qc = useQueryClient()
  const base = `/p/${tenComp.slug}`
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const { data: subgrupo, isLoading: loadingSg } = useQuery({
    queryKey: ['v2', 'subgrupo', id],
    queryFn: () => fetchSubgrupoDetailV2(id),
    enabled: !!id,
  })

  const { data: ranking = [], isLoading: loadingRanking } = useQuery({
    queryKey: ['v2', 'subgrupo-ranking', id],
    queryFn: () => fetchSubgrupoRankingV2(id),
    enabled: !!id,
  })

  const { data: memberIds = [] } = useQuery({
    queryKey: ['v2', 'subgrupo-members', id],
    queryFn: () => fetchSubgrupoMemberIdsV2(id),
    enabled: !!id,
  })

  const isCreator = !!subgrupo && subgrupo.creator_id === user?.id

  const { data: candidates = [] } = useQuery({
    queryKey: ['v2', 'tencomp-members', tenComp.id],
    queryFn: () => fetchTenCompMemberOptionsV2(tenComp.id),
    enabled: isCreator && showAdd,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['v2', 'subgrupo-ranking', id] })
    qc.invalidateQueries({ queryKey: ['v2', 'subgrupo-members', id] })
  }

  const addMut = useMutation({
    mutationFn: (userId: string) => addMemberToSubgrupoV2(id, userId),
    onSuccess: () => { invalidate(); toast.success('Miembro agregado') },
    onError: (e: any) => toast.error(e.message || 'No se pudo agregar'),
  })
  const removeMut = useMutation({
    mutationFn: (userId: string) => removeMemberFromSubgrupoV2(id, userId),
    onSuccess: () => { invalidate(); toast.success('Miembro quitado') },
    onError: () => toast.error('No se pudo quitar'),
  })

  if (loadingSg) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
  }
  if (!subgrupo) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-muted text-sm mb-4">No encontramos este subgrupo.</p>
        <Link to={`${base}/subgrupos`} className="btn-secondary text-sm inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver
        </Link>
      </div>
    )
  }

  const memberSet = new Set(memberIds)
  const addable = candidates.filter(c =>
    !memberSet.has(c.id) &&
    ((c.display_name ?? '') + (c.username ?? '')).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Link to={`${base}/subgrupos`} className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={12} /> Todos los subgrupos
      </Link>

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy size={20} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary truncate">{subgrupo.name}</h1>
        </div>
        {isCreator && (
          <button onClick={() => { setShowAdd(true); setSearch('') }}
            className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1">
            <UserPlus size={14} /> Agregar
          </button>
        )}
      </div>

      {loadingRanking ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : ranking.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text-muted text-sm">Todavía no hay miembros con puntos en este subgrupo.</p>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {ranking.map((r, idx) => (
            <div key={r.user_id} className="flex items-center gap-3 px-4 py-3">
              <span className={`w-6 text-center font-bold tabular-nums text-sm flex-shrink-0 ${
                idx === 0 ? 'text-accent' : 'text-text-muted'
              }`}>{r.subgrupo_rank}</span>
              {r.avatar_url
                ? <img src={r.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-xs text-text-muted flex-shrink-0">
                    {(r.display_name || r.username || '?')[0]?.toUpperCase()}
                  </div>}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{r.display_name || r.username}</p>
                <p className="text-[11px] text-text-muted">{r.exact_scores} exactos · {r.predictions_count} jugadas</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-text-primary tabular-nums">{r.total_points}</p>
                <p className="text-[10px] text-text-muted">pts</p>
              </div>
              {isCreator && r.user_id !== subgrupo.creator_id && (
                <button onClick={() => { if (confirm('¿Quitar a este miembro?')) removeMut.mutate(r.user_id) }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Agregar miembros">
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input className="input w-full pl-9" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar miembro de la penca..." autoFocus />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {addable.length === 0 && <p className="text-text-muted text-sm py-3 text-center">No hay miembros para agregar.</p>}
            {addable.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-surface-2">
                <span className="text-sm text-text-primary truncate">{c.display_name || c.username || 'Usuario'}</span>
                <button onClick={() => addMut.mutate(c.id)} disabled={addMut.isPending}
                  className="btn-primary text-[10px] px-2 py-0.5">Agregar</button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
