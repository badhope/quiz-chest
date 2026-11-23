#!/usr/bin/env node
/**
 * Android 产物签名校验。
 *
 * `assembleRelease` 成功不等于 APK 真的被签了：keystore.properties 缺失时
 * Gradle 会安静地产出 unsigned release。这里用 apksigner / jarsigner 验签，
 * 让“可安装”成为构建脚本的一部分，而不是发布时才发现。
 *
 * 用法：node scripts/verify-signature.mjs <apk|aab> <android-sdk> <jdk-home>
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [file, sdk, javaHome] = process.argv.slice(2)
if (!file || !existsSync(file)) {
  console.error(`找不到产物：${file ?? '(未提供)'}`)
  process.exit(1)
}

const isWindows = process.platform === 'win32'

function findApksigner() {
  if (!sdk) return null
  const buildTools = join(sdk, 'build-tools')
  if (!existsSync(buildTools)) return null
  const versions = readdirSync(buildTools).sort((a, b) => {
    const left = a.split('.').map(Number)
    const right = b.split('.').map(Number)
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const diff = (right[index] ?? 0) - (left[index] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
  for (const version of versions) {
    const name = isWindows ? 'apksigner.bat' : 'apksigner'
    const candidate = join(buildTools, version, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

if (file.endsWith('.aab')) {
  const jarsigner = javaHome ? join(javaHome, 'bin', isWindows ? 'jarsigner.exe' : 'jarsigner') : 'jarsigner'
  const output = execFileSync(jarsigner, ['-verify', '-verbose', '-certs', file], {
    encoding: 'utf8',
  })
  if (!/jar verified/i.test(output)) {
    console.error(output)
    console.error('AAB 验签失败：jar 未通过验证')
    process.exit(1)
  }
  console.log(`\nAAB 签名校验：通过（${jarsigner}）`)
} else {
  const apksigner = findApksigner()
  if (!apksigner) {
    console.error('找不到 apksigner，无法校验 APK 签名')
    process.exit(1)
  }
  const output = execFileSync(apksigner, ['verify', '--print-certs', file], {
    encoding: 'utf8',
  })
  console.log(`\n${output.trim()}`)
  console.log('APK 签名校验：通过')
}
