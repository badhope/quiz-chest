import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../lib/quiz'

export function useTimer(running: boolean): string {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!running) return undefined
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  return formatDuration(elapsed)
}

export function useCountdown(
  running: boolean,
  limitSec: number,
  onExpire: () => void,
): { remaining: string; remainingSec: number; expired: boolean } {
  const [remainingSec, setRemainingSec] = useState(limitSec)
  const [expired, setExpired] = useState(false)
  const onExpireRef = useRef(onExpire)
  const limitRef = useRef(limitSec)
  const expiredRef = useRef(false)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (!running || expired) return undefined
    limitRef.current = limitSec
    expiredRef.current = false
    const deadline = Date.now() + limitSec * 1000
    const timer = window.setInterval(() => {
      const rest = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setRemainingSec(rest)
      if (rest <= 0) {
        expiredRef.current = true
        setExpired(true)
        window.clearInterval(timer)
        onExpireRef.current()
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [running, limitSec, expired])

  return { remaining: formatDuration(remainingSec), remainingSec, expired }
}
