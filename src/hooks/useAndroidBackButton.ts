import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

type BackHandler = (canGoBack: boolean) => boolean

/**
 * Android 系统返回键的统一入口。
 *
 * 优先级由调用方决定：先关弹层/抽屉，再离开练习，最后才走 WebView 历史。
 * 没有注册监听时 Capacitor 会直接退出 App；注册后必须自己决定何时退出。
 */
export function useAndroidBackButton(handler: BackHandler): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return

    let disposed = false
    let remove: (() => Promise<void>) | undefined
    void App.addListener('backButton', ({ canGoBack }) => {
      if (handlerRef.current(canGoBack)) return
      if (canGoBack) {
        window.history.back()
        return
      }
      void App.exitApp()
    }).then((listener) => {
      if (disposed) {
        void listener.remove()
      } else {
        remove = () => listener.remove()
      }
    })

    return () => {
      disposed = true
      if (remove) void remove()
    }
  }, [])
}
