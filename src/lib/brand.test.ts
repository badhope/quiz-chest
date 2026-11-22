import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND, applyBrand, normalizeBrand, resolveBrand } from './brand'

describe('normalizeBrand', () => {
  it('returns defaults for non-object input', () => {
    expect(normalizeBrand(null)).toEqual(DEFAULT_BRAND)
    expect(normalizeBrand('x')).toEqual(DEFAULT_BRAND)
  })

  it('keeps the default brand aligned with the product positioning', () => {
    expect(DEFAULT_BRAND.productName).toBe('题匣')
    expect(DEFAULT_BRAND.productEn).toBe('QuizChest')
    expect(DEFAULT_BRAND.footerNote).toBe('导入自有题库 · 离线练习 · 数据留在本机')
  })

  it('accepts a full custom brand', () => {
    const brand = normalizeBrand({
      productName: '教研通',
      productEn: 'JIAOYAN',
      logoMark: '研',
      accent: '#1F7A5C',
      accentSoft: '#dff0e8',
      footerNote: '内部培训专用',
    })
    expect(brand.productName).toBe('教研通')
    expect(brand.accent).toBe('#1F7A5C')
    expect(brand.footerNote).toBe('内部培训专用')
  })

  it('falls back on invalid colors and empty strings', () => {
    const brand = normalizeBrand({ accent: 'red', accentSoft: '#zzzzzz', productName: '   ' })
    expect(brand.accent).toBe(DEFAULT_BRAND.accent)
    expect(brand.accentSoft).toBe(DEFAULT_BRAND.accentSoft)
    expect(brand.productName).toBe(DEFAULT_BRAND.productName)
  })

  it('truncates overlong text and mark', () => {
    const brand = normalizeBrand({ productName: 'A'.repeat(40), logoMark: '甲乙丙' })
    expect(brand.productName.length).toBe(20)
    expect(Array.from(brand.logoMark)).toHaveLength(2)
  })
})

describe('resolveBrand', () => {
  it('returns a brand object even with no env or runtime config', () => {
    const brand = resolveBrand()
    expect(brand.productName.length).toBeGreaterThan(0)
    expect(brand.accent).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('lets runtime config override env defaults', () => {
    ;(globalThis as { __TIYU_BRAND__?: unknown }).__TIYU_BRAND__ = { productName: '运行时品牌' }
    try {
      expect(resolveBrand().productName).toBe('运行时品牌')
    } finally {
      delete (globalThis as { __TIYU_BRAND__?: unknown }).__TIYU_BRAND__
    }
  })
})

describe('applyBrand', () => {
  it('writes css variables and a data attribute', () => {
    const vars: Record<string, string> = {}
    const dataset: Record<string, string> = {}
    const root = {
      style: {
        setProperty: (name: string, value: string) => {
          vars[name] = value
        },
      },
      dataset,
    }
    applyBrand({ ...DEFAULT_BRAND, productName: '测试品牌', accent: '#123456' }, root as unknown as HTMLElement)
    expect(vars['--accent']).toBe('#123456')
    expect(dataset.brand).toBe('测试品牌')
  })
})
