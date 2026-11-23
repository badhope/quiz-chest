import { describe, expect, it } from 'vitest'
import type { ImportedBank } from '../store/useAppStore'
import {
  decryptBankPackage,
  encryptBankPackage,
  generateSharePassword,
  isEncryptedBankPackage,
} from './securePackage'

const bank: ImportedBank = {
  id: 'bank-1',
  title: '加密测试题库',
  subtitle: '分享用',
  description: '只用于测试',
  exam: '测试',
  icon: 'book',
  accent: '#123456',
  level: '入门',
  durationMin: 10,
  tags: ['加密'],
  importedAt: 1_700_000_000_000,
  questions: [
    {
      type: 'single',
      stem: '一加一等于几？',
      options: ['1', '2'],
      answer: [1],
      explanation: '基础算术',
      difficulty: 1,
      tags: [],
    },
  ],
}

describe('加密题库包', () => {
  it('正确口令可完整还原原始题库包', async () => {
    const encrypted = await encryptBankPackage(bank, 'correct horse battery staple')
    expect(encrypted.fileName).toMatch(/\.tiyu\.enc\.json$/)
    expect(isEncryptedBankPackage(encrypted.payload)).toBe(true)

    const plaintext = await decryptBankPackage(encrypted.payload, 'correct horse battery staple')
    const parsed = JSON.parse(plaintext)
    expect(parsed.format).toBe('tiyu-bank')
    expect(parsed.bank.title).toBe('加密测试题库')
    expect(parsed.bank.questions[0].stem).toBe('一加一等于几？')
  })

  it('错误口令不会返回任何明文', async () => {
    const encrypted = await encryptBankPackage(bank, 'correct horse battery staple')
    await expect(decryptBankPackage(encrypted.payload, 'wrong password')).rejects.toThrow(
      '口令错误，或文件已被修改',
    )
  })

  it('篡改密文会被 GCM 校验拒绝', async () => {
    const encrypted = await encryptBankPackage(bank, 'correct horse battery staple')
    const parsed = JSON.parse(encrypted.payload)
    const first = parsed.ciphertext[0] === 'A' ? 'B' : 'A'
    parsed.ciphertext = first + parsed.ciphertext.slice(1)
    await expect(
      decryptBankPackage(JSON.stringify(parsed), 'correct horse battery staple'),
    ).rejects.toThrow('口令错误，或文件已被修改')
  })

  it('拒绝过short的口令', async () => {
    await expect(encryptBankPackage(bank, '1234567')).rejects.toThrow('口令至少 8 位')
  })

  it('拒绝被篡改的 KDF 参数与版本', async () => {
    const encrypted = await encryptBankPackage(bank, 'correct horse battery staple')
    const parsed = JSON.parse(encrypted.payload)
    parsed.kdf.iterations = 1
    await expect(
      decryptBankPackage(JSON.stringify(parsed), 'correct horse battery staple'),
    ).rejects.toThrow('加密参数不受支持或已被篡改')

    parsed.kdf.iterations = 310_000
    parsed.version = 99
    await expect(
      decryptBankPackage(JSON.stringify(parsed), 'correct horse battery staple'),
    ).rejects.toThrow('版本 99 不受支持')
  })

  it('生成口令长度固定且不含易混字符', () => {
    const password = generateSharePassword()
    expect(password).toHaveLength(20)
    expect(password).not.toMatch(/[01IO]/)
  })
})
