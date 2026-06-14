import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, Users, Plus, Trophy, LogOut, Power, PowerOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { useTenComp } from '../../contexts/TenCompContext'
import { Modal } from '../../components/ui/Modal'
import {
  fetchMySubgruposV2, createSubgrupoV2, leaveSubgrupoV2,
  getUserSubgrupoCountV2, toggleSubgrupoActiveV2, deleteSubgrupoV2,
} from '../../services/v2/subgrupoService'

export function PencaSubgruposPage() {
  const { user } = useAuth()
  const { tenComp, memberStatus, isTenCompAdmin } = useTenComp()
  const qc = useQueryClient()
  const tenCompId = tenComp.id
  const base = `/p/${tenComp.slug}`
  const isApproved = memberStatus === 'approved'
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: mySubgrupos = [], isLoading } = useQuery({
    queryKey: ['v2', 'my-subgrupos', tenCompId, user?.id],
    queryFn: () => fetchMySubgruposV2(tenCompId, user!.id),
    enabled: !!user,
  })

  const { data: count = 0 } = useQuery({
    queryKey: ['v2', 'subgrupo-count', tenCompId, user?.id],
    queryFn: () => getUserSubgrupoCountV2(tenCompId, user!.id),
    enabled: !!user,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['v2', 'my-subgrupos', tenCompId] })
    qc.invalidateQueries({ queryKey: ['v2', 'subgrupo-count', tenCompId] })
  }

  const createMut = useMutation({
    mutationFn: () => createSubgrupoV2(tenCompId, newName.trim(), user!.id),
    onSuccess: () => { invalidate(); setShowCreate(false); setNewName(''); toast.success('Subgrupo creado') },
    onError: (e: any) => toast.error(e.message || 'Error al crear el subgrupo'),
  })
  const leaveMut = useMutation({
    mutationFn: (id: string) => leaveSubgrupoV2(id, user!.id),
    onSuccess: () => { invalidate(); toast.success('Saliste del subgrupo') },
    onError: () => toast.error('Error al salir del subgrupo'),
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, val }: { id: string; val: boolean }) => toggleSubgrupoActiveV2(id, val),
    onSuccess: () => { invalidate(); toast.success('Subgrupo actualizado') },
    onError: () => toast.error('Error al actualizar el subgrupo'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSubgrupoV2(id),
    onSuccess: () => { invalidate(); toast.success('Subgrupo eliminado') },
    onError: () => toast.error('Error al eliminar el subgrupo'),
  })

  if (!user) {
    return (
      <div className="card p-8 text-center">
        <Users size={32} className="text-text-muted mx-auto mb-3" />
        <p className="text-text-muted text-sm">Iniciá sesión para ver los subgrupos.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Subgrupos</h1>
        </div>
        {isApproved && count < 3 && (
          <button onClick={() => { setShowCreate(true); setNewName('') }}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
            <Plus size={14} /> Crear
          </button>
        )}
      </div>

      {!isApproved && (
        <p className="text-xs text-text-muted mb-3">
          Necesitás ser miembro aprobado de la penca para crear o unirte a subgrupos.
        </p>
      )}
      {isApproved && count >= 3 && (
        <p className="text-xs text-text-muted mb-3">Llegaste al límite de 3 subgrupos como creador.</p>
      )}

      {isLoading && (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
      )}

      {!isLoading && mySubgrupos.length === 0 && (
        <div className="card p-8 text-center">
          <Users size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-muted text-sm mb-2">No pertenecés a ningún subgrupo todavía.</p>
          <p className="text-xs text-text-muted">Creá uno e invitá a tus amigos de la penca.</p>
        </div>
      )}

      {!isLoading && mySubgrupos.length > 0 && (
        <div className="space-y-2">
          {mySubgrupos.map(sg => (
            <div key={sg.id}
              className={`card p-4 flex items-center gap-3 transition-colors ${!sg.is_active ? 'opacity-60 border-error/30' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link to={`${base}/subgrupos/${sg.id}`}
                    className="text-sm font-medium text-text-primary hover:text-primary transition-colors truncate block">
                    {sg.name}
                  </Link>
                  {!sg.is_active && <span className="badge bg-error/20 text-error text-[10px] flex-shrink-0">Inactivo</span>}
                </div>
                <p className="text-xs text-text-muted">{sg.creator_id === user.id ? 'Tu subgrupo' : 'Te invitaron'}</p>
              </div>
              {sg.is_active && (
                <Link to={`${base}/subgrupos/${sg.id}`} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                  <Trophy size={12} /> Ranking
                </Link>
              )}
              {sg.creator_id !== user.id && (
                <button
                  onClick={() => { if (confirm(`¿Salir de "${sg.name}"?`)) leaveMut.mutate(sg.id) }}
                  title="Salir" className="p-2 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                  <LogOut size={16} />
                </button>
              )}
              {(isTenCompAdmin || sg.creator_id === user.id) && (
                <div className="flex items-center">
                  <button onClick={() => toggleMut.mutate({ id: sg.id, val: !sg.is_active })}
                    title={sg.is_active ? 'Deshabilitar' : 'Habilitar'}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      sg.is_active ? 'text-text-muted hover:text-error hover:bg-error/10' : 'text-text-muted hover:text-primary hover:bg-primary/10'
                    }`}>
                    {sg.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿ELIMINAR el subgrupo "${sg.name}"? Borra a todos los miembros y no se puede deshacer.`)) deleteMut.mutate(sg.id) }}
                    title="Eliminar" className="p-2 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Crear subgrupo">
        <form onSubmit={e => { e.preventDefault(); if (newName.trim().length >= 2) createMut.mutate() }} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Nombre del subgrupo</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="input"
              placeholder="Ej: La banda del gol" required minLength={2} maxLength={50} autoFocus />
          </div>
          <button type="submit" disabled={createMut.isPending} className="btn-primary w-full">
            {createMut.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Crear subgrupo'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
