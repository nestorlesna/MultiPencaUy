import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Minus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { TeamFlag } from '../ui/TeamFlag'
import { setMatchResultV2 } from '../../services/v2/adminService'
import type { MatchWithRelations } from '../../types/match'

interface Props {
  match: MatchWithRelations | null
  competitionId: string
  onClose: () => void
}

interface FormState {
  homeScore90: number
  awayScore90: number
  homeScoreEt: number
  awayScoreEt: number
  homeScorePk: number
  awayScorePk: number
}

const empty: FormState = {
  homeScore90: 0, awayScore90: 0,
  homeScoreEt: 0, awayScoreEt: 0,
  homeScorePk: 0, awayScorePk: 0,
}

function ScoreInput({
  value, onChange, large = false,
}: {
  value: number
  onChange: (v: number) => void
  large?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-9 h-9 rounded-lg bg-surface-2 border border-border text-text-primary flex items-center justify-center hover:border-primary/50 transition-colors"
      >
        <Minus size={14} />
      </button>
      <span className={`w-10 text-center font-bold tabular-nums text-text-primary select-none ${large ? 'text-3xl' : 'text-xl'}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-9 h-9 rounded-lg bg-surface-2 border border-border text-text-primary flex items-center justify-center hover:border-primary/50 transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

// Carga de resultado v2: dispara el RPC set_match_result (UPDATE + puntos + bonus,
// para TODOS los Ten-Comps de la competencia).
export function ResultFormV2({ match, competitionId, onClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(empty)

  useEffect(() => {
    if (!match) return
    setForm({
      homeScore90: match.home_score_90 ?? 0,
      awayScore90: match.away_score_90 ?? 0,
      homeScoreEt: match.home_score_et ?? 0,
      awayScoreEt: match.away_score_et ?? 0,
      homeScorePk: match.home_score_pk ?? 0,
      awayScorePk: match.away_score_pk ?? 0,
    })
  }, [match])

  function set<K extends keyof FormState>(key: K, val: number) {
    setForm(f => ({ ...f, [key]: val }))
  }

  const isKnockout = match?.phase.has_extra_time ?? false
  const drawAt90   = form.homeScore90 === form.awayScore90
  const showEt     = isKnockout && drawAt90
  const drawAtEt   = form.homeScoreEt === form.awayScoreEt
  const showPk     = showEt && drawAtEt

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!match) return { predictions_updated: 0, bonus_rows_updated: 0 }
      return setMatchResultV2(match.id, {
        homeScore90: form.homeScore90,
        awayScore90: form.awayScore90,
        homeScoreEt: showEt ? form.homeScoreEt : null,
        awayScoreEt: showEt ? form.awayScoreEt : null,
        homeScorePk: showPk ? form.homeScorePk : null,
        awayScorePk: showPk ? form.awayScorePk : null,
      })
    },
    onSuccess: (r) => {
      toast.success(`Resultado guardado · ${r.predictions_updated} predicciones · ${r.bonus_rows_updated} bonus`)
      qc.invalidateQueries({ queryKey: ['v2', 'matches', competitionId] })
      qc.invalidateQueries({ queryKey: ['v2', 'admin-matches', competitionId] })
      // Las posiciones (liga/serie) y el ranking dependen del resultado recién
      // cargado; refrescarlos para que reflejen el cambio sin recargar.
      qc.invalidateQueries({ queryKey: ['v2', 'league_standings', competitionId] })
      qc.invalidateQueries({ queryKey: ['v2', 'group_standings', competitionId] })
      qc.invalidateQueries({ queryKey: ['v2', 'leaderboard'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!match) return null

  return (
    <Modal open={!!match} onClose={onClose} title={`Partido #${match.match_number}`} size="sm">
      <div className="space-y-6">
        <div>
          <p className="text-[11px] text-text-muted uppercase tracking-wide mb-4 text-center">90 minutos</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 flex flex-col items-center gap-3">
              <TeamFlag team={match.home_team} slotLabel={match.home_slot_label} size="sm" align="left" />
              <ScoreInput large value={form.homeScore90} onChange={v => set('homeScore90', v)} />
            </div>
            <span className="text-text-muted text-2xl font-light pb-1">-</span>
            <div className="flex-1 flex flex-col items-center gap-3">
              <TeamFlag team={match.away_team} slotLabel={match.away_slot_label} size="sm" align="right" />
              <ScoreInput large value={form.awayScore90} onChange={v => set('awayScore90', v)} />
            </div>
          </div>
        </div>

        {isKnockout && (
          <div className={showEt ? '' : 'opacity-35 pointer-events-none'}>
            <p className="text-[11px] text-text-muted uppercase tracking-wide mb-4 text-center">
              Tiempo extra {!showEt && '(solo si hay empate a 90)'}
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 flex justify-center">
                <ScoreInput value={form.homeScoreEt} onChange={v => set('homeScoreEt', v)} />
              </div>
              <span className="text-text-muted text-xl font-light">-</span>
              <div className="flex-1 flex justify-center">
                <ScoreInput value={form.awayScoreEt} onChange={v => set('awayScoreEt', v)} />
              </div>
            </div>
          </div>
        )}

        {isKnockout && (
          <div className={showPk ? '' : 'opacity-35 pointer-events-none'}>
            <p className="text-[11px] text-text-muted uppercase tracking-wide mb-4 text-center">
              Penales {!showPk && '(solo si hay empate en ET)'}
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 flex justify-center">
                <ScoreInput value={form.homeScorePk} onChange={v => set('homeScorePk', v)} />
              </div>
              <span className="text-text-muted text-xl font-light">-</span>
              <div className="flex-1 flex justify-center">
                <ScoreInput value={form.awayScorePk} onChange={v => set('awayScorePk', v)} />
              </div>
            </div>
          </div>
        )}

        <button className="btn-primary w-full" onClick={() => mutate()} disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar resultado'}
        </button>
      </div>
    </Modal>
  )
}
