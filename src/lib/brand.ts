export interface BrandConfig {
  productName: string
  productEn: string
  logoMark: string
  accent: string
  accentSoft: string
  footerNote: string
}

export const DEFAULT_BRAND: BrandConfig = {
  productName: '题匣',
  productEn: 'QuizChest',
  logoMark: '题',
  accent: '#a8442a',
  accentSoft: '#f3e3dc',
  footerNote: '导入自有题库 · 离线练习 · 数据留在本机',
}

const HEX = /^#[0-9a-fA-F]{6}$/

function cleanText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  if (!text) return fallback
  return text.slice(0, max)
}

/** 合并外部白标配置；非法字段回落到默认值，不抛错。 */
export function normalizeBrand(raw: unknown): BrandConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_BRAND
  const data = raw as Record<string, unknown>
  const accent = typeof data.accent === 'string' && HEX.test(data.accent) ? data.accent : DEFAULT_BRAND.accent
  const accentSoft =
    typeof data.accentSoft === 'string' && HEX.test(data.accentSoft)
      ? data.accentSoft
      : DEFAULT_BRAND.accentSoft
  const markRaw = cleanText(data.logoMark, DEFAULT_BRAND.logoMark, 2)
  return {
    productName: cleanText(data.productName, DEFAULT_BRAND.productName, 20),
    productEn: cleanText(data.productEn, DEFAULT_BRAND.productEn, 24),
    logoMark: Array.from(markRaw).slice(0, 2).join(''),
    accent,
    accentSoft,
    footerNote: cleanText(data.footerNote, DEFAULT_BRAND.footerNote, 60),
  }
}

/** 白标配置编译期注入：VITE_BRAND_* 环境变量优先，其次 window.__TIYU_BRAND__ 运行时覆盖。 */
export function resolveBrand(): BrandConfig {
  const env = import.meta.env as Record<string, string | undefined>
  const fromEnv = normalizeBrand({
    productName: env.VITE_BRAND_NAME,
    productEn: env.VITE_BRAND_EN,
    logoMark: env.VITE_BRAND_MARK,
    accent: env.VITE_BRAND_ACCENT,
    accentSoft: env.VITE_BRAND_ACCENT_SOFT,
    footerNote: env.VITE_BRAND_FOOTER,
  })
  const runtime = (globalThis as { __TIYU_BRAND__?: unknown }).__TIYU_BRAND__
  if (runtime === undefined) return fromEnv
  return normalizeBrand({ ...fromEnv, ...(runtime as Record<string, unknown>) })
}

/** 把白标色写入 CSS 变量，供全局样式与图表使用。 */
export function applyBrand(brand: BrandConfig, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--accent', brand.accent)
  root.style.setProperty('--accent-soft', brand.accentSoft)
  root.dataset.brand = brand.productName
}
