import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

const VERSION_URL =
  'https://raw.githubusercontent.com/nestorlesna/MultiPencaUy/main/version.json'

export interface VersionInfo {
  version_code: number
  version_name: string
  apk_url: string
  release_notes: string
  force_update: boolean
}

export function useUpdateCheck() {
  const [update, setUpdate] = useState<VersionInfo | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    async function check() {
      try {
        const { build } = await App.getInfo()
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`)
        const latest: VersionInfo = await res.json()

        if (latest.version_code > Number(build)) {
          setUpdate(latest)
        }
      } catch {
        // Fallo silencioso — no interrumpir al usuario
      }
    }

    check()
  }, [])

  return { update, dismiss: () => setUpdate(null) }
}
