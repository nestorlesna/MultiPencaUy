import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../ui/Modal'

// Muestra la contraseña temporal generada al resetear la pass de un usuario.
// La pass no se vuelve a mostrar: hay que copiarla y pasársela al usuario.
export function ResetPasswordModal({ name, password, onClose }: {
  name: string; password: string; onClose: () => void
}) {
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
