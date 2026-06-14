import { Construction } from 'lucide-react'

// Placeholder para las secciones de juego scoped al Ten-Comp.
// El cableado real (servicios scoped por ten_comp_id) llega en la Fase 3.
export function PencaPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="card p-8 text-center">
      <Construction size={28} className="text-text-muted mx-auto mb-3" />
      <p className="text-sm font-medium text-text-primary mb-1">{title}</p>
      <p className="text-xs text-text-muted">
        Esta sección se conecta al modelo multi-tenant en la Fase 3.
      </p>
    </div>
  )
}
