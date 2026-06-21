import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ChevronDown, Globe, Building2, Check, Plus, Clock } from 'lucide-react'
import { useTenCompState } from '../../contexts/TenCompContext'
import { useAuth } from '../../hooks/useAuth'

// Selector de competencia activa (arriba-izquierda de la barra superior).
// Muestra el nombre de la penca activa y un combo para cambiar entre pencas.
export function CompetitionSwitcher() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, activeSlug, myPencas, publicPencas, setActive } = useTenCompState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Solo pencas activas (no archivadas), ordenadas por creación descendente.
  const byNewest = (a: { createdAt: string }, b: { createdAt: string }) =>
    b.createdAt.localeCompare(a.createdAt)

  const myActive = useMemo(
    () => myPencas.filter(p => p.tenComp.status !== 'archived'),
    [myPencas]
  )
  // 1º Privadas mías, 2º Públicas mías.
  const myPrivate = useMemo(
    () => myActive.filter(p => p.tenComp.visibility === 'private').sort(byNewest),
    [myActive]
  )
  const myPublic = useMemo(
    () => myActive.filter(p => p.tenComp.visibility === 'public').sort(byNewest),
    [myActive]
  )
  // 3º Públicas activas a las que NO estoy asociado (para anónimo: todas las públicas).
  const myIds = useMemo(() => new Set(myPencas.map(p => p.tenComp.id)), [myPencas])
  const otherPublic = useMemo(
    () => publicPencas
      .filter(p => p.tenComp.status !== 'archived' && !myIds.has(p.tenComp.id))
      .sort(byNewest),
    [publicPencas, myIds]
  )

  const activeName = data?.tenComp.name ?? 'PencaLes'

  function choose(slug: string) {
    setActive(slug)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 font-bold text-text-primary max-w-[60vw] sm:max-w-xs"
      >
        <Trophy className="text-accent flex-shrink-0" size={20} />
        <span className="text-sm font-semibold truncate">{activeName}</span>
        <ChevronDown size={16} className="text-text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 card py-1 shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
          {/* Logueado: 1º privadas mías, 2º públicas mías, 3º otras públicas. */}
          {user && myPrivate.length > 0 && (
            <Section icon={<Building2 size={12} />} label="Privadas">
              {myPrivate.map(p => (
                <PencaRow
                  key={p.tenComp.id}
                  name={p.tenComp.name}
                  hint={`${p.competition.name} · ${p.tenant.name}`}
                  pending={p.memberStatus === 'pending'}
                  active={p.tenComp.slug === activeSlug}
                  onClick={() => choose(p.tenComp.slug)}
                />
              ))}
            </Section>
          )}

          {user && myPublic.length > 0 && (
            <Section icon={<Globe size={12} />} label="Públicas">
              {myPublic.map(p => (
                <PencaRow
                  key={p.tenComp.id}
                  name={p.tenComp.name}
                  hint={p.competition.name}
                  pending={p.memberStatus === 'pending'}
                  active={p.tenComp.slug === activeSlug}
                  onClick={() => choose(p.tenComp.slug)}
                />
              ))}
            </Section>
          )}

          {/* Públicas activas que no integro (anónimo: todas las públicas activas). */}
          {otherPublic.length > 0 && (
            <Section icon={<Globe size={12} />} label={user ? 'Otras públicas' : 'Pencas públicas'}>
              {otherPublic.map(p => (
                <PencaRow
                  key={p.tenComp.id}
                  name={p.tenComp.name}
                  hint={`${p.competition.name} · ${p.tenant.name}`}
                  active={p.tenComp.slug === activeSlug}
                  onClick={() => choose(p.tenComp.slug)}
                />
              ))}
            </Section>
          )}

          <button
            onClick={() => { setOpen(false); navigate('/pencas') }}
            className="w-full text-left px-4 py-2.5 mt-1 border-t border-border text-sm text-primary hover:bg-surface-2 transition-colors flex items-center gap-2"
          >
            <Plus size={14} /> {user ? 'Explorar / Unirme' : 'Ver todas / Ingresar'}
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {icon} {label}
      </div>
      {children}
    </div>
  )
}

function PencaRow({
  name,
  hint,
  active,
  pending,
  onClick,
}: {
  name: string
  hint: string
  active: boolean
  pending?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 hover:bg-surface-2 transition-colors flex items-center gap-2 ${
        active ? 'bg-surface-2' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate flex items-center gap-1.5">
          {name}
          {pending && <Clock size={11} className="text-accent flex-shrink-0" />}
        </p>
        <p className="text-[11px] text-text-muted truncate">{hint}</p>
      </div>
      {active && <Check size={14} className="text-primary flex-shrink-0" />}
    </button>
  )
}
