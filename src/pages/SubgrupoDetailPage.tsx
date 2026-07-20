import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trophy, ArrowLeft, UserPlus, Search, UserMinus, Power, PowerOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import {
  fetchSubgrupoDetail,
  fetchSubgrupoRanking,
  fetchSubgrupoMembers,
  fetchAllProfiles,
  addMemberToSubgrupo,
  removeMemberFromSubgrupo,
  deleteSubgrupo,
  toggleSubgrupoActive,
} from '../services/subgrupoService'
import { Modal } from '../components/ui/Modal'
import { UserAvatar } from '../components/ui/UserAvatar'

function MedalOrRank({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-accent text-lg">🥇</span>
  if (rank === 2) return <span className="text-accent text-lg">🥈</span>
  if (rank === 3) return <span className="text-accent text-lg">🥉</span>
  return (
    <span className="text-sm font-bold tabular-nums text-text-muted w-6 text-center">
      {rank}
    </span>
  )
}

function Avatar({ entry }: { entry: { user_id?: string; display_name: string; avatar_url: string | null } }) {
  return (
    <UserAvatar
      avatarUrl={entry.avatar_url}
      seed={entry.user_id ?? entry.display_name}
      className="w-9 h-9 flex-shrink-0"
    />
  )
}

export function SubgrupoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [searchUser, setSearchUser] = useState('')

  const { data: subgrupo, isLoading: loadingSg } = useQuery({
    queryKey: ['subgrupo', id],
    queryFn: () => fetchSubgrupoDetail(id!),
    enabled: !!id,
  })

  const { data: ranking = [], isLoading: loadingRank } = useQuery({
    queryKey: ['subgrupo_ranking', id],
    queryFn: () => fetchSubgrupoRanking(id!),
    enabled: !!id,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['subgrupo_members', id],
    queryFn: () => fetchSubgrupoMembers(id!),
    enabled: !!id,
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles_active'],
    queryFn: fetchAllProfiles,
  })

  const inviteMutation = useMutation({
    mutationFn: (userId: string) => addMemberToSubgrupo(id!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subgrupo_members'] })
      qc.invalidateQueries({ queryKey: ['subgrupo_ranking'] })
      toast.success('Miembro agregado')
    },
    onError: () => toast.error('Error al agregar miembro'),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMemberFromSubgrupo(id!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subgrupo_members'] })
      qc.invalidateQueries({ queryKey: ['subgrupo_ranking'] })
      qc.invalidateQueries({ queryKey: ['my_subgrupos'] })
      toast.success('Miembro eliminado')
    },
    onError: () => toast.error('Error al eliminar miembro'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteSubgrupo(id!),
    onSuccess: () => {
      toast.success('Subgrupo eliminado')
      navigate('/subgrupos')
    },
    onError: () => toast.error('Error al eliminar el subgrupo'),
  })

  const toggleMutation = useMutation({
    mutationFn: (val: boolean) => toggleSubgrupoActive(id!, val),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subgrupo', id] })
      toast.success('Subgrupo actualizado')
    },
    onError: () => toast.error('Error al actualizar el subgrupo'),
  })

  if (loadingSg) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!subgrupo) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-muted text-sm">Subgrupo no encontrado.</p>
        <button onClick={() => navigate('/subgrupos')} className="btn-primary mt-4 text-sm">
          Volver a subgrupos
        </button>
      </div>
    )
  }

  const isCreator = subgrupo.creator_id === user?.id
  const availableProfiles = profiles.filter(
    p => !members.includes(p.id)
  )
  const filteredProfiles = availableProfiles.filter(
    p =>
      p.display_name.toLowerCase().includes(searchUser.toLowerCase()) ||
      p.username.toLowerCase().includes(searchUser.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/subgrupos')}
          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
        >
          <ArrowLeft size={18} className="text-text-secondary" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text-primary truncate">{subgrupo.name}</h1>
            {!subgrupo.is_active && (
              <span className="badge bg-error/20 text-error text-[10px] flex-shrink-0">
                Inactivo
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">{members.length} miembros</p>
        </div>
        {isCreator && subgrupo.is_active && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowInvite(true); setSearchUser('') }}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
            >
              <UserPlus size={14} /> Invitar
            </button>
            <button
              onClick={() => {
                if (confirm(`¿Eliminar el subgrupo "${subgrupo.name}"? Esta acción no se puede deshacer.`)) {
                  deleteMutation.mutate()
                }
              }}
              className="p-2 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
              title="Eliminar subgrupo"
            >
              <UserMinus size={16} />
            </button>
          </div>
        )}
        {isAdmin && (
          <button
            onClick={() => {
              toggleMutation.mutate(!subgrupo.is_active)
            }}
            title={subgrupo.is_active ? 'Deshabilitar subgrupo' : 'Habilitar subgrupo'}
            className={`p-2 rounded-lg transition-colors ${
              subgrupo.is_active
                ? 'text-text-muted hover:text-error hover:bg-error/10'
                : 'text-text-muted hover:text-primary hover:bg-primary/10'
            }`}
          >
            {subgrupo.is_active ? <PowerOff size={16} /> : <Power size={16} />}
          </button>
        )}
        {isAdmin && isCreator && (
          <button
            onClick={() => {
              if (confirm(`¿Eliminar el subgrupo "${subgrupo.name}"? Esta acción no se puede deshacer.`)) {
                deleteMutation.mutate()
              }
            }}
            className="p-2 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
            title="Eliminar subgrupo"
          >
            <UserMinus size={16} />
          </button>
        )}
      </div>

      {loadingRank && (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      )}

      {!loadingRank && ranking.length === 0 && (
        <div className="card p-8 text-center">
          <Trophy size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-muted text-sm">
            Aún no hay puntos registrados en este subgrupo.
          </p>
        </div>
      )}

      {!loadingRank && ranking.length > 0 && (
        <div className="space-y-2">
          {ranking.map(entry => (
            <div key={entry.user_id} className="card p-3 flex items-center gap-3">
              <div className="flex-shrink-0 w-8 flex justify-center">
                <MedalOrRank rank={entry.subgrupo_rank} />
              </div>
              <Avatar entry={entry} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {entry.display_name}
                </p>
                <p className="text-[11px] text-text-muted">
                  Global #{entry.global_rank} · {entry.predictions_count} pred.
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xl font-bold tabular-nums text-primary leading-none">
                  {entry.total_points}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">pts</p>
              </div>
              {isCreator && entry.user_id !== user?.id && (
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar a ${entry.display_name} del subgrupo?`)) {
                      removeMutation.mutate(entry.user_id)
                    }
                  }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
                  title="Eliminar del subgrupo"
                >
                  <UserMinus size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal invitar */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setSearchUser('') }} title="Agregar miembros">
        <div className="space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchUser}
              onChange={e => setSearchUser(e.target.value)}
              className="input pl-9"
              placeholder="Buscar usuario..."
            />
          </div>

          {filteredProfiles.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">No hay usuarios disponibles</p>
          )}

          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredProfiles.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-surface-2 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">{p.display_name}</p>
                  <p className="text-xs text-text-muted">@{p.username}</p>
                </div>
                <button
                  onClick={() => inviteMutation.mutate(p.id)}
                  disabled={inviteMutation.isPending}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                >
                  <UserPlus size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
