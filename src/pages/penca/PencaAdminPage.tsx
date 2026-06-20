import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Loader2, Users, SlidersHorizontal, ListChecks, Settings, ArrowLeft,
  Check, Ban, RotateCcw, Copy, ShieldCheck, Lock, Mail, KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTenComp } from '../../contexts/TenCompContext'
import { useAuth } from '../../hooks/useAuth'
import {
  fetchMembers, approveMember, setMemberStatus, resetUserPassword,
  updateScoring, fetchBonusConfig, updateBonusPoints, updateMenuConfig, updateTenComp,
  type MemberRow,
} from '../../services/v2/adminService'
import { Modal } from '../../components/ui/Modal'
import { CorreosTab } from '../../components/admin/CorreosTab'
import type { EmailBrand } from '../../services/v2/emailService'
import type { MenuConfig, TenCompScoring } from '../../types/tenant'

type Tab = 'miembros' | 'puntaje' | 'correos' | 'menu' | 'config'

const ALL_TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'miembros', label: 'Miembros', icon: Users },
  { key: 'puntaje',  label: 'Puntaje',  icon: SlidersHorizontal },
  { key: 'correos',  label: 'Correos',  icon: Mail },
  { key: 'menu',     label: 'Menú',     icon: ListChecks },
  { key: 'config',   label: 'Config',   icon: Settings },
]

export function PencaAdminPage() {
  const { tenComp, competition, isTenCompAdmin } = useTenComp()
  const { isSuperAdmin } = useAuth()
  const base = `/p/${tenComp.slug}`

  // Menú y Config son solo para super-admin; Correos lo gestiona el admin de la penca.
  const visibleTabs = isSuperAdmin
    ? ALL_TABS
    : ALL_TABS.filter(t => t.key === 'miembros' || t.key === 'puntaje' || t.key === 'correos')

  const [tab, setTab] = useState<Tab>('miembros')
  const activeTab = visibleTabs.find(t => t.key === tab) ? tab : 'miembros'

  // Puntaje editable solo antes del primer partido (o siempre para super-admin)
  const competitionStarted = competition.start_date
    ? new Date(competition.start_date) <= new Date()
    : false
  const canEditScoring = isSuperAdmin || !competitionStarted

  if (!isTenCompAdmin) {
    return (
      <div className="card p-8 text-center">
        <ShieldCheck className="mx-auto text-text-muted mb-3" size={32} />
        <p className="text-text-muted text-sm mb-4">No tenés permisos de administración en esta penca.</p>
        <Link to={base} className="btn-secondary text-sm inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={20} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Administración</h1>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
              activeTab === key
                ? 'text-text-primary bg-surface-2'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'miembros' && <MembersTab tenCompId={tenComp.id} />}
      {activeTab === 'puntaje'  && <ScoringTab tenCompId={tenComp.id} canEdit={canEditScoring} />}
      {activeTab === 'correos'  && (
        <CorreosTab
          tenCompId={tenComp.id}
          tenantId={tenComp.tenant_id}
          competitionId={competition.id}
          brand={{
            pencaName: tenComp.name,
            competitionName: competition.name,
            slug: tenComp.slug,
            baseUrl: window.location.origin,
          } satisfies EmailBrand}
        />
      )}
      {activeTab === 'menu'     && <MenuTab tenCompId={tenComp.id} initial={tenComp.menu_config ?? {}} />}
      {activeTab === 'config'   && <ConfigTab />}
    </div>
  )
}

// ── Miembros ──────────────────────────────────────────────────────────────────
function MembersTab({ tenCompId }: { tenCompId: string }) {
  const qc = useQueryClient()
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['v2', 'members', tenCompId],
    queryFn: () => fetchMembers(tenCompId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['v2', 'members', tenCompId] })
    qc.invalidateQueries({ queryKey: ['v2', 'leaderboard', tenCompId] })
  }

  const approveMut = useMutation({
    mutationFn: (userId: string) => approveMember(tenCompId, userId),
    onSuccess: () => { invalidate(); toast.success('Miembro aprobado') },
    onError: (e: Error) => toast.error(e.message),
  })
  const statusMut = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'approved' | 'blocked' }) =>
      setMemberStatus(tenCompId, userId, status),
    onSuccess: () => { invalidate(); toast.success('Miembro actualizado') },
    onError: (e: Error) => toast.error(e.message),
  })

  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null)
  const resetMut = useMutation({
    mutationFn: (member: MemberRow) => resetUserPassword(member.user_id),
    onSuccess: (password, member) =>
      setResetInfo({ name: member.display_name || member.username || 'Usuario', password }),
    onError: (e: Error) => toast.error(e.message),
  })
  const onReset = (m: MemberRow) => {
    if (confirm(`¿Resetear la contraseña de ${m.display_name || m.username || 'este usuario'}? Tendrá que cambiarla en el próximo ingreso.`))
      resetMut.mutate(m)
  }

  if (isLoading) return <Spinner />

  const pending = members.filter(m => m.status === 'pending')
  const approved = members.filter(m => m.status === 'approved')
  const blocked = members.filter(m => m.status === 'blocked')

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Section title={`Pendientes de aprobación (${pending.length})`}>
          {pending.map(m => (
            <MemberItem key={m.user_id} member={m} onReset={() => onReset(m)} resetting={resetMut.isPending}>
              <button
                onClick={() => approveMut.mutate(m.user_id)}
                disabled={approveMut.isPending}
                className="btn-primary text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
              >
                <Check size={12} /> Aprobar
              </button>
              <button
                onClick={() => statusMut.mutate({ userId: m.user_id, status: 'blocked' })}
                disabled={statusMut.isPending}
                className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1 text-error"
              >
                <Ban size={12} /> Rechazar
              </button>
            </MemberItem>
          ))}
        </Section>
      )}

      <Section title={`Aprobados (${approved.length})`}>
        {approved.length === 0 && <Empty>No hay miembros aprobados todavía.</Empty>}
        {approved.map(m => (
          <MemberItem key={m.user_id} member={m} onReset={() => onReset(m)} resetting={resetMut.isPending}>
            <button
              onClick={() => statusMut.mutate({ userId: m.user_id, status: 'blocked' })}
              disabled={statusMut.isPending}
              className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1 text-error"
            >
              <Ban size={12} /> Bloquear
            </button>
          </MemberItem>
        ))}
      </Section>

      {blocked.length > 0 && (
        <Section title={`Bloqueados (${blocked.length})`}>
          {blocked.map(m => (
            <MemberItem key={m.user_id} member={m} onReset={() => onReset(m)} resetting={resetMut.isPending}>
              <button
                onClick={() => statusMut.mutate({ userId: m.user_id, status: 'approved' })}
                disabled={statusMut.isPending}
                className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1 text-primary"
              >
                <RotateCcw size={12} /> Re-habilitar
              </button>
            </MemberItem>
          ))}
        </Section>
      )}

      {resetInfo && (
        <ResetPasswordModal name={resetInfo.name} password={resetInfo.password} onClose={() => setResetInfo(null)} />
      )}
    </div>
  )
}

function MemberItem({ member, onReset, resetting, children }: {
  member: MemberRow; onReset?: () => void; resetting?: boolean; children: React.ReactNode
}) {
  const name = member.display_name || member.username || 'Usuario'
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-surface-2">
      <div className="flex items-center gap-2 min-w-0">
        {member.avatar_url
          ? <img src={member.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
          : <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-[11px] text-text-muted">{name[0]?.toUpperCase()}</div>}
        <div className="min-w-0">
          <p className="text-sm text-text-primary truncate">{name}</p>
          {member.username && <p className="text-[11px] text-text-muted truncate">@{member.username}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {children}
        {onReset && (
          <button
            onClick={onReset}
            disabled={resetting}
            title="Resetear contraseña"
            className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1 text-accent"
          >
            <KeyRound size={12} /> Pass
          </button>
        )}
      </div>
    </div>
  )
}

function ResetPasswordModal({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Contraseña reseteada">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Contraseña temporal para <strong className="text-text-primary">{name}</strong>.
          Pasásela por un medio seguro: al ingresar, la app le va a pedir que cree una nueva.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-base bg-surface-2 px-3 py-2.5 rounded-lg font-mono tracking-widest text-text-primary text-center select-all">
            {password}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(password); toast.success('Copiada') }}
            className="btn-ghost px-2.5 py-2.5 inline-flex items-center gap-1"
          >
            <Copy size={14} />
          </button>
        </div>
        <p className="text-[11px] text-text-muted">
          Esta contraseña no se vuelve a mostrar. Si la perdés, reseteala de nuevo.
        </p>
        <button onClick={onClose} className="btn-primary w-full">Entendido</button>
      </div>
    </Modal>
  )
}

// ── Puntaje ───────────────────────────────────────────────────────────────────
const SCORING_FIELDS: { key: keyof Omit<TenCompScoring, 'ten_comp_id'>; label: string; hint: string }[] = [
  { key: 'exact_score_points',         label: 'Resultado exacto',         hint: 'Acertó el marcador completo' },
  { key: 'correct_winner_points',      label: 'Ganador correcto',         hint: 'Acertó quién ganó (no el marcador)' },
  { key: 'correct_draw_points',        label: 'Empate correcto',          hint: 'Acertó que fue empate' },
  { key: 'knockout_exact_score_bonus', label: 'Bonus exacto eliminatoria', hint: 'Extra por exacto en fase final' },
  { key: 'correct_et_result_points',   label: 'Resultado en alargue',     hint: 'Acertó el marcador del tiempo extra' },
  { key: 'correct_pk_winner_points',   label: 'Ganador en penales',       hint: 'Acertó quién ganó por penales' },
]

function ScoringTab({ tenCompId, canEdit }: { tenCompId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const { scoring } = useTenComp()
  const [form, setForm] = useState<Omit<TenCompScoring, 'ten_comp_id'>>(() => ({
    exact_score_points: scoring?.exact_score_points ?? 3,
    correct_winner_points: scoring?.correct_winner_points ?? 1,
    correct_draw_points: scoring?.correct_draw_points ?? 1,
    knockout_exact_score_bonus: scoring?.knockout_exact_score_bonus ?? 2,
    correct_et_result_points: scoring?.correct_et_result_points ?? 1,
    correct_pk_winner_points: scoring?.correct_pk_winner_points ?? 1,
  }))

  const { data: bonusConfig = [] } = useQuery({
    queryKey: ['v2', 'bonus-config', tenCompId],
    queryFn: () => fetchBonusConfig(tenCompId),
  })

  const scoringMut = useMutation({
    mutationFn: () => updateScoring(tenCompId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ten_comp'] })
      toast.success('Puntaje actualizado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const bonusMut = useMutation({
    mutationFn: ({ type, points }: { type: string; points: number }) =>
      updateBonusPoints(tenCompId, type, points),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v2', 'bonus-config', tenCompId] })
      toast.success('Bonus actualizado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-accent">
          <Lock size={14} className="mt-0.5 flex-shrink-0" />
          <span>La competencia ya inició. El puntaje no se puede modificar.</span>
        </div>
      )}

      <Section title="Puntaje de predicciones">
        <div className="space-y-2">
          {SCORING_FIELDS.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-surface-2">
              <div className="min-w-0">
                <p className="text-sm text-text-primary">{f.label}</p>
                <p className="text-[11px] text-text-muted">{f.hint}</p>
              </div>
              <input
                type="number"
                value={form[f.key]}
                onChange={e => canEdit && setForm(s => ({ ...s, [f.key]: Number(e.target.value) }))}
                className={`input w-16 text-center ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                min={0}
                readOnly={!canEdit}
              />
            </div>
          ))}
        </div>
        {canEdit && (
          <button onClick={() => scoringMut.mutate()} disabled={scoringMut.isPending} className="btn-primary text-sm mt-3">
            {scoringMut.isPending ? 'Guardando...' : 'Guardar puntaje'}
          </button>
        )}
      </Section>

      {bonusConfig.length > 0 && (
        <Section title="Puntos de bonus (+ Puntos)">
          <div className="space-y-2">
            {bonusConfig.map(b => (
              <BonusRow key={b.bonus_type} type={b.bonus_type} points={b.points}
                canEdit={canEdit}
                onSave={(points) => bonusMut.mutate({ type: b.bonus_type, points })} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

const BONUS_LABELS: Record<string, string> = {
  podio_exacto: 'Podio (posición exacta)',
  podio_presencia: 'Podio (presencia)',
  empates_grupos: 'Cantidad de empates en grupos',
  rango_goles: 'Rango de goles del torneo',
  final_cero: 'Final 0-0 a los 90',
  top_scorer_team: 'Equipo más goleador',
  top_group_goals: 'Grupo con más goles',
  podio: 'Podio',
}

function BonusRow({ type, points, canEdit, onSave }: { type: string; points: number; canEdit: boolean; onSave: (p: number) => void }) {
  const [val, setVal] = useState(points)
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-surface-2">
      <p className="text-sm text-text-primary min-w-0">{BONUS_LABELS[type] ?? type}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number"
          value={val}
          onChange={e => canEdit && setVal(Number(e.target.value))}
          className={`input w-16 text-center ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
          min={0}
          readOnly={!canEdit}
        />
        {canEdit && val !== points && (
          <button onClick={() => onSave(val)} className="btn-primary text-[11px] px-2.5 py-1">Guardar</button>
        )}
      </div>
    </div>
  )
}

// ── Menú ──────────────────────────────────────────────────────────────────────
// optIn: ítems que solo aplican a ciertos formatos (Posiciones → ligas todos-contra-todos).
// Ocultos por defecto; requieren true explícito (igual que visibleMenuItems).
const MENU_ITEMS: { key: keyof MenuConfig; label: string; optIn?: boolean }[] = [
  { key: 'fixture', label: 'Fixture' },
  { key: 'grupos', label: 'Grupos' },
  { key: 'cuadro', label: 'Cuadro' },
  { key: 'posiciones', label: 'Posiciones', optIn: true },
  { key: 'ranking', label: 'Ranking' },
  { key: 'mis_predicciones', label: 'Jugar' },
  { key: 'mas_puntos', label: '+ Puntos' },
  { key: 'subgrupos', label: 'Subgrupos' },
  { key: 'ayuda', label: 'Ayuda' },
]

function MenuTab({ tenCompId, initial }: { tenCompId: string; initial: MenuConfig }) {
  const qc = useQueryClient()
  const [menu, setMenu] = useState<MenuConfig>(initial)

  const mut = useMutation({
    mutationFn: () => updateMenuConfig(tenCompId, menu),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ten_comp'] })
      toast.success('Menú actualizado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Section title="Ítems visibles del menú">
      <p className="text-xs text-text-muted mb-3">
        Desactivá los ítems que no querés mostrar en esta penca.
      </p>
      <div className="space-y-2">
        {MENU_ITEMS.map(item => {
          const enabled = item.optIn ? menu[item.key] === true : menu[item.key] !== false
          return (
            <button
              key={item.key}
              onClick={() => setMenu(m => ({ ...m, [item.key]: !enabled }))}
              className="w-full flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-surface-2"
            >
              <span className="text-sm text-text-primary">{item.label}</span>
              <span className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-border'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
              </span>
            </button>
          )
        })}
      </div>
      <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary text-sm mt-3">
        {mut.isPending ? 'Guardando...' : 'Guardar menú'}
      </button>
    </Section>
  )
}

// ── Configuración ─────────────────────────────────────────────────────────────
function ConfigTab() {
  const qc = useQueryClient()
  const { tenComp } = useTenComp()
  const [status, setStatus] = useState(tenComp.status)

  const mut = useMutation({
    mutationFn: () => updateTenComp(tenComp.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ten_comp'] })
      toast.success('Configuración actualizada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      {tenComp.visibility === 'private' && (
        <Section title="Código de invitación">
          <JoinCode slug={tenComp.slug} />
        </Section>
      )}

      <Section title="Estado de la penca">
        <p className="text-xs text-text-muted mb-3">
          <strong>Abierta:</strong> se puede predecir y unirse · <strong>Cerrada:</strong> no admite nuevos
          miembros ni predicciones · <strong>Archivada:</strong> solo lectura histórica.
        </p>
        <div className="flex gap-2">
          {(['open', 'closed', 'archived'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === s ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {s === 'open' ? 'Abierta' : s === 'closed' ? 'Cerrada' : 'Archivada'}
            </button>
          ))}
        </div>
        {status !== tenComp.status && (
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary text-sm mt-3">
            {mut.isPending ? 'Guardando...' : 'Guardar estado'}
          </button>
        )}
      </Section>
    </div>
  )
}

function JoinCode({ slug }: { slug: string }) {
  // El join_code no se expone por SELECT (seguridad). Lo busca el admin via tenant admin.
  // Acá mostramos el link de la penca para compartir.
  const url = `${window.location.origin}/p/${slug}`
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs bg-surface-2 px-3 py-2 rounded-lg text-text-secondary truncate">{url}</code>
      <button
        onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiado') }}
        className="btn-ghost text-xs px-2.5 py-2 inline-flex items-center gap-1"
      >
        <Copy size={14} /> Copiar
      </button>
    </div>
  )
}

// ── Helpers UI ────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-sm py-3">{children}</p>
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-primary" size={26} />
    </div>
  )
}
