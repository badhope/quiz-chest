import type { ImportedBank } from '../store/useAppStore'
import { buildExportPackage, exportFileName } from './exporter'

// 加密题库包用 WebCrypto 做，三端共用。PBKDF2-SHA256 310k 次派生 AES-256-GCM，
// 每包独立 salt/IV；版本、KDF 参数和算法名都进 AAD，改信封元数据会直接解不开。
// 口令只用于派生 key，不落日志、不进文件名。

export const ENCRYPTED_BANK_FORMAT = 'tixing-bank-encrypted'
export const ENCRYPTED_BANK_VERSION = 2
export const SHARE_PASSWORD_MIN_LENGTH = 8

const KDF_ITERATIONS = 310_000
const KDF_MIN_ITERATIONS = 100_000
const KDF_MAX_ITERATIONS = 1_000_000
const SALT_BYTES = 16
const IV_BYTES = 12
const AAD = new TextEncoder().encode(`${ENCRYPTED_BANK_FORMAT}:v${ENCRYPTED_BANK_VERSION}`)
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

interface EncryptedEnvelope {
  format: typeof ENCRYPTED_BANK_FORMAT
  version: number
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  cipher: {
    name: 'AES-GCM'
    iv: string
  }
  ciphertext: string
}

function subtle(): SubtleCrypto {
  const value = globalThis.crypto?.subtle
  if (!value) {
    throw new Error('当前环境不支持加密。请使用最新版浏览器、桌面端或安卓端。')
  }
  return value
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function assertPassword(password: string): void {
  if (password.length < SHARE_PASSWORD_MIN_LENGTH) {
    throw new Error(`口令至少 ${SHARE_PASSWORD_MIN_LENGTH} 位`)
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle().deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 生成便于手输、又不容易被猜中的一次性口令。 */
export function generateSharePassword(length = 20): string {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(length))
  return Array.from(random, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('')
}

export async function encryptBankPackage(
  bank: ImportedBank,
  password: string,
): Promise<{ fileName: string; payload: string }> {
  assertPassword(password)
  const plaintext = JSON.stringify(buildExportPackage(bank))
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, KDF_ITERATIONS)
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
    key,
    new TextEncoder().encode(plaintext),
  )

  const envelope: EncryptedEnvelope = {
    format: ENCRYPTED_BANK_FORMAT,
    version: ENCRYPTED_BANK_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }

  return {
    fileName: exportFileName(bank).replace(/\.tixing\.json$/, '.tixing.enc.json'),
    payload: JSON.stringify(envelope, null, 2),
  }
}

export function isEncryptedBankPackage(raw: string): boolean {
  try {
    const value = JSON.parse(raw) as { format?: unknown }
    return value?.format === ENCRYPTED_BANK_FORMAT
  } catch {
    return false
  }
}

function parseEnvelope(raw: string): EncryptedEnvelope {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('加密题库包不是合法的 JSON')
  }
  if (typeof value !== 'object' || value === null) throw new Error('加密题库包格式不正确')
  const envelope = value as Partial<EncryptedEnvelope>
  if (envelope.format !== ENCRYPTED_BANK_FORMAT) throw new Error('不是题小星加密题库包')
  if (envelope.version !== ENCRYPTED_BANK_VERSION) {
    throw new Error(`加密题库包版本 ${String(envelope.version)} 不受支持，请升级应用`)
  }
  if (
    envelope.kdf?.name !== 'PBKDF2' ||
    envelope.kdf.hash !== 'SHA-256' ||
    typeof envelope.kdf.iterations !== 'number' ||
    envelope.kdf.iterations < KDF_MIN_ITERATIONS ||
    envelope.kdf.iterations > KDF_MAX_ITERATIONS
  ) {
    throw new Error('加密参数不受支持或已被篡改')
  }
  if (envelope.cipher?.name !== 'AES-GCM' || typeof envelope.cipher.iv !== 'string') {
    throw new Error('加密算法不受支持或已被篡改')
  }
  if (typeof envelope.kdf.salt !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('加密题库包字段不完整')
  }
  return envelope as EncryptedEnvelope
}

/** 解密后返回原始 `.tixing.json` 文本，后续仍走同一套 valibot 校验。 */
export async function decryptBankPackage(raw: string, password: string): Promise<string> {
  const envelope = parseEnvelope(raw)
  assertPassword(password)
  let salt: Uint8Array
  let iv: Uint8Array
  let ciphertext: Uint8Array
  try {
    salt = base64ToBytes(envelope.kdf.salt)
    iv = base64ToBytes(envelope.cipher.iv)
    ciphertext = base64ToBytes(envelope.ciphertext)
  } catch {
    throw new Error('加密题库包内容损坏')
  }
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length === 0) {
    throw new Error('加密题库包内容损坏')
  }

  const key = await deriveKey(password, salt, envelope.kdf.iterations)
  try {
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
      key,
      ciphertext as BufferSource,
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error('口令错误，或文件已被修改')
  }
}
