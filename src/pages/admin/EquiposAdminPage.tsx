import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, Upload, Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { Modal } from '../../components/ui/Modal'
import { fetchTeamsByCompetition, updateTeam, uploadTeamFlag, createTeam, deleteTeam } from '../../services/v2/teamService'
import { fetchCompetition } from '../../services/v2/adminService'
import type { TeamWithGroup } from '../../services/teamService'

function FlagImg({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="w-8 h-6 object-cover rounded border border-border flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className="w-8 h-6 rounded border border-border bg-surface-2 flex items-center justify-center flex-shrink-0">
      <span className="text-[8px] text-text-muted font-bold">?</span>
    </div>
  )
}

// ── Modal de creación / edición ───────────────────────────────────────────────
function TeamModal({
  open, team, competitionId, isLeague, onClose,
}: {
  open: boolean
  team: TeamWithGroup | null   // null → modo creación
  competitionId: string
  isLeague: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const isEdit = !!team

  // El padre remonta este modal con `key` al abrir/cambiar de equipo,
  // así el estado se inicializa desde props sin necesidad de un efecto.
  const [name, setName] = useState(team?.name ?? '')
  const [abbreviation, setAbbreviation] = useState(team?.abbreviation ?? '')
  const [flagUrl, setFlagUrl] = useState(team?.flag_url ?? '')
  const [placeholderName, setPlaceholderName] = useState(team?.placeholder_name ?? '')
  const [isConfirmed, setIsConfirmed] = useState(team?.is_confirmed ?? true)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (team) {
        await updateTeam(team.id, {
          name: name.trim(),
          abbreviation: abbreviation.trim().toUpperCase().slice(0, 3),
          flag_url: flagUrl.trim() || null,
          placeholder_name: placeholderName.trim() || null,
          is_confirmed: isConfirmed,
        })
      } else {
        await createTeam(competitionId, {
          name, abbreviation,
          flag_url: flagUrl,
          placeholder_name: placeholderName,
          is_confirmed: isConfirmed,
        })
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Equipo actualizado' : 'Equipo creado')
      qc.invalidateQueries({ queryKey: ['teams_admin'] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: async () => { if (team) await deleteTeam(team.id) },
    onSuccess: () => {
      toast.success('Equipo eliminado')
      qc.invalidateQueries({ queryKey: ['teams_admin'] })
      onClose()
    },
    onError: () => toast.error('No se pudo eliminar: el equipo está usado en partidos.'),
  })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !team) return

    // Preview local
    const reader = new FileReader()
    reader.onload = ev => setPreviewUrl(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      const url = await uploadTeamFlag(team.id, file)
      setFlagUrl(url)
      toast.success('Imagen subida — guardá para confirmar')
    } catch {
      setPreviewUrl(null)
      toast.error('Error al subir imagen. Verificá el bucket "flags" en Supabase.')
    }
    setUploading(false)
  }

  if (!open) return null

  const title = isEdit
    ? (team!.group ? `Editar equipo — Grupo ${team!.group.name}` : 'Editar equipo')
    : 'Nuevo equipo'

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-4">

        {/* Preview bandera */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {(previewUrl || flagUrl) ? (
              <img
                src={previewUrl ?? flagUrl}
                alt={name}
                className="w-20 h-14 object-cover rounded-lg border border-border"
              />
            ) : (
              <div className="w-20 h-14 rounded-lg border border-dashed border-border bg-surface-2 flex items-center justify-center">
                <span className="text-text-muted text-xs">Sin imagen</span>
              </div>
            )}
            {isEdit && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary-hover transition-colors"
                >
                  {uploading
                    ? <Loader2 size={12} className="animate-spin text-white" />
                    : <Upload size={12} className="text-white" />
                  }
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-muted mb-1">O pegá una URL de imagen</p>
            <input
              type="url"
              value={flagUrl}
              onChange={e => { setFlagUrl(e.target.value); setPreviewUrl(null) }}
              placeholder="https://..."
              className="input text-xs"
            />
          </div>
        </div>

        {/* Nombre */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Nombre del equipo</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
            maxLength={60}
          />
        </div>

        {/* Abreviación */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Abreviación (3 letras)</label>
          <input
            type="text"
            value={abbreviation}
            onChange={e => setAbbreviation(e.target.value.toUpperCase().slice(0, 3))}
            className="input font-mono tracking-widest text-center"
            maxLength={3}
          />
        </div>

        {/* Nombre placeholder (para equipos TBD) */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">
            Nombre placeholder
            <span className="text-text-muted ml-1">(para equipos por confirmar, ej: "UEFA Playoff A")</span>
          </label>
          <input
            type="text"
            value={placeholderName}
            onChange={e => setPlaceholderName(e.target.value)}
            className="input"
            maxLength={60}
            placeholder="Dejar vacío si el equipo está confirmado"
          />
        </div>

        {/* Confirmado */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isConfirmed}
            onChange={e => setIsConfirmed(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <div>
            <p className="text-sm text-text-primary">Equipo confirmado</p>
            <p className="text-[11px] text-text-muted">Desmarcá si el equipo aún no está clasificado</p>
          </div>
        </label>

        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary flex-1"
            onClick={() => save()}
            disabled={isPending || !name.trim() || !abbreviation.trim()}
          >
            {isPending ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear equipo'}
          </button>
          <button className="btn-ghost flex-1 border border-border" onClick={onClose}>
            Cancelar
          </button>
        </div>

        {isEdit && isLeague && (
          <button
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-error hover:text-error/80 transition-colors pt-1"
            onClick={() => { if (confirm(`¿Eliminar el equipo "${team!.name}"?`)) remove() }}
            disabled={removing}
          >
            <Trash2 size={13} /> {removing ? 'Eliminando...' : 'Eliminar equipo'}
          </button>
        )}
      </div>
    </Modal>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export function EquiposAdminPage() {
  const { id: competitionId = '' } = useParams()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TeamWithGroup | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: comp } = useQuery({
    queryKey: ['v2', 'competition', competitionId],
    queryFn: () => fetchCompetition(competitionId),
    enabled: !!competitionId,
  })
  const isLeague = !!comp && !comp.advancement_engine

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams_admin', competitionId],
    queryFn: () => fetchTeamsByCompetition(competitionId),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 5,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return teams
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.abbreviation.toLowerCase().includes(q) ||
      (t.group?.name ?? '').toLowerCase().includes(q) ||
      (t.placeholder_name ?? '').toLowerCase().includes(q)
    )
  }, [teams, search])

  // Agrupar por grupo
  const byGroup = useMemo(() => {
    const map = new Map<string, TeamWithGroup[]>()
    for (const t of filtered) {
      const g = t.group?.name ?? 'Sin grupo'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(t)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <RequireAdmin>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Link to={`/admin/competencias/${competitionId}`} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Competencia
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-text-primary">Equipos</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{teams.length} equipos</span>
            {isLeague && (
              <button onClick={() => setCreating(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
                <Plus size={14} /> Nuevo equipo
              </button>
            )}
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, abreviación o grupo..."
            className="input pl-9"
          />
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        )}

        {/* Lista agrupada */}
        <div className="space-y-6">
          {byGroup.map(([groupName, groupTeams]) => (
            <section key={groupName}>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
                {groupName === 'Sin grupo' ? groupName : `Grupo ${groupName}`}
              </h2>
              <div className="card overflow-hidden">
                {groupTeams.map((team, idx) => (
                  <button
                    key={team.id}
                    onClick={() => setSelected(team)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors text-left ${
                      idx !== groupTeams.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    <FlagImg url={team.flag_url} name={team.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{team.name}</p>
                      {team.placeholder_name && (
                        <p className="text-[11px] text-text-muted">{team.placeholder_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-mono text-text-muted">{team.abbreviation}</span>
                      {!team.is_confirmed && (
                        <span className="badge bg-warning/20 text-warning text-[9px]">TBD</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {!isLoading && byGroup.length === 0 && (
            <p className="text-text-muted text-sm text-center py-8">No se encontraron equipos.</p>
          )}
        </div>
      </div>

      <TeamModal
        key={selected?.id ?? (creating ? 'new' : 'closed')}
        open={!!selected || creating}
        team={selected}
        competitionId={competitionId}
        isLeague={isLeague}
        onClose={() => { setSelected(null); setCreating(false) }}
      />
    </RequireAdmin>
  )
}
