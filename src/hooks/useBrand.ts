import { useMemo } from 'react'
import { resolveBrand, type BrandConfig } from '../lib/brand'

export function useBrand(): BrandConfig {
  return useMemo(() => resolveBrand(), [])
}
