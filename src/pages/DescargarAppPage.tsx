import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Download, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

// "latest" apunta siempre al asset de la última release — no depende de hardcodear la versión.
const APK_URL = 'https://github.com/nestorlesna/MultiPencaUy/releases/latest/download/PencaLes.apk'
const VERSION_URL = 'https://raw.githubusercontent.com/nestorlesna/MultiPencaUy/main/version.json'

export function DescargarAppPage() {
  const apkUrl = APK_URL
  const [versionName, setVersionName] = useState<string | null>(null)

  useEffect(() => {
    fetch(VERSION_URL)
      .then(res => res.json())
      .then(data => setVersionName(data.version_name))
      .catch(() => {})
  }, [])

  return (
    <div className="max-w-md mx-auto">
      <Link to="/perfil" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft size={14} /> Volver al perfil
      </Link>

      <h1 className="text-xl font-bold text-text-primary mb-2">Descargar aplicación</h1>
      <p className="text-sm text-text-secondary mb-6">
        Escaneá el código QR con tu celular para descargar la app de PencaLes.
      </p>

      <div className="card p-8 flex flex-col items-center">
        <div className="bg-white p-4 rounded-xl">
          <QRCodeSVG
            value={apkUrl}
            size={220}
            level="H"
            includeMargin
          />
        </div>

        <a
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-6 flex items-center gap-2"
        >
          <Download size={16} />
          Descargar APK
        </a>

        {versionName && (
          <p className="text-xs text-text-muted mt-4">
            Versión {versionName}
          </p>
        )}
      </div>
    </div>
  )
}
