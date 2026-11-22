import { useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'

const isNativeBuild = import.meta.env.MODE === 'native'

export function useServiceWorker(): void {
  useEffect(() => {
    if (isNativeBuild) return
    if (!('serviceWorker' in navigator)) return
    registerSW({ immediate: true })
  }, [])
}
