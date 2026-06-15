import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, Link } from 'react-router-dom'
import { Loader2, Trophy, Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { Modal } from '../../components/ui/Modal'
import {
  fetchCompetitions, createCompetition, fetchAdvancementEngines,
} from '../../services/v2/adminService'
import type { Competition, CompetitionStatus } from '../../types/tenant'

const STATUS_LABEL: Record<CompetitionStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  finished: 'Finalizada',
  archived: 'Archivada',
}

const STATUS_STYLE: Record<CompetitionStatus, string> = {
  draft: 'bg-border text-text-muted',
  active: 'bg-success/20 text-success',
  finished: 'bg-accent/20 text-accent',
  archived: 'bg-border text-text-muted',
}

export function CompetenciasPage() {
  const { user, loading, isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: competitions = [], isLoading } = useQuery({
    queryKey: ['v2', 'competitions'],
    queryFn: fetchCompetitions,
    enabled: isSuperAdmin,
  })

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isSuperAdmin) return <Navigate to="/" replace />

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Competencias</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
          <Plus size={14} /> Nueva competencia
        </button>
      </div>

      <p className="text-xs text-text-muted">
        Catálogo deportivo global. Cada competencia agrupa sus equipos, partidos y resultados,
        compartidos entre las pencas de todas las empresas.
      </p>

      {isLoading ? <Spinner /> : (
        <div className="space-y-3">
          {competitions.length === 0 && <Empty>No hay competencias todavía. Creá la primera.</Empty>}
          {competitions.map(c => <CompetitionCard key={c.id} comp={c} />)}
        </div>
      )}

      <CreateCompetitionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['v2', 'competitions'] })}
      />
    </div>
  )
}

function CompetitionCard({ comp }: { comp: Competition }) {
  return (
    <Link
      to={`/admin/competencias/${comp.id}`}
      className="card p-4 flex items-center gap-3 hover:border-primary/40 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{comp.name}</p>
          <span className={`badge text-[10px] ${STATUS_STYLE[comp.status]}`}>
            {STATUS_LABEL[comp.status]}
          </span>
        </div>
        <p className="text-xs text-text-muted truncate">
          {comp.sport}{comp.season ? ` · ${comp.season}` : ''}
          {comp.advancement_engine ? ` · ${comp.advancement_engine}` : ''}
        </p>
      </div>
      <ChevronRight size={18} className="text-text-muted group-hover:text-primary transition-colors flex-shrink-0" />
    </Link>
  )
}

function CreateCompetitionModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [sport, setSport] = useState('futbol')
  const [season, setSeason] = useState('')
  const [status, setStatus] = useState<CompetitionStatus>('draft')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [engine, setEngine] = useState('')

  const { data: engines = [] } = useQuery({
    queryKey: ['v2', 'advancement-engines'],
    queryFn: fetchAdvancementEngines,
    enabled: open,
    staleTime: 1000 * 60 * 30,
  })

  const reset = () => {
    setName(''); setSport('futbol'); setSeason(''); setStatus('draft')
    setStartDate(''); setEndDate(''); setEngine('')
  }

  const mut = useMutation({
    mutationFn: () => createCompetition({
      name: name.trim(),
      sport: sport.trim() || 'futbol',
      season: season.trim() || null,
      status,
      start_date: startDate || null,
      end_date: endDate || null,
      advancement_engine: engine || null,
    }),
    onSuccess: () => {
      toast.success('Competencia creada')
      onCreated()
      onClose()
      reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Modal open={open} onClose={onClose} title="Nueva competencia">
      <form
        onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate() }}
        className="space-y-4"
      >
        <Field label="Nombre">
          <input
            className="input w-full" value={name} autoFocus
            onChange={e => setName(e.target.value)}
            placeholder="Mundial Fútbol 2026"
            maxLength={100}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deporte">
            <input
              className="input w-full" value={sport}
              onChange={e => setSport(e.target.value)}
              placeholder="futbol" maxLength={30}
            />
          </Field>
          <Field label="Temporada (opcional)">
            <input
              className="input w-full" value={season}
              onChange={e => setSeason(e.target.value)}
              placeholder="2026" maxLength={20}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio (opcional)">
            <input className="input w-full" type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="Fin (opcional)">
            <input className="input w-full" type="date" value={endDate}
              onChange={e => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado">
            <select className="input w-full" value={status}
              onChange={e => setStatus(e.target.value as CompetitionStatus)}>
              <option value="draft">Borrador</option>
              <option value="active">Activa</option>
              <option value="finished">Finalizada</option>
              <option value="archived">Archivada</option>
            </select>
          </Field>
          <Field label="Motor de avance">
            <select className="input w-full" value={engine}
              onChange={e => setEngine(e.target.value)}>
              <option value="">Ninguno</option>
              {engines.map(eng => (
                <option key={eng.id} value={eng.id}>{eng.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" disabled={mut.isPending || !name.trim()} className="btn-primary w-full">
          {mut.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Crear competencia'}
        </button>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-sm py-2">{children}</p>
}

function Spinner() {
  return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
}
