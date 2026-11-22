#!/usr/bin/env node
/**
 * 版本号同步工具 —— `package.json` 是唯一的版本来源。
 *
 * 用法：
 *   node scripts/sync-version.mjs check        校验各构建清单版本一致
 *   node scripts/sync-version.mjs set 1.2.0    写入并传播到所有构建清单
 *
 * 传播目标：
 *   src-tauri/tauri.conf.json   （Tauri 安装包版本）
 *   src-tauri/Cargo.toml        （Rust crate 版本）
 *   android/app/build.gradle    （Android versionName / versionCode）
 *
 * versionCode 采用 SemVer → 整数的确定性映射：
 *   major * 1_000_000 + minor * 1_000 + patch
 * 因此 1.2.3 → 1002003，单调递增且不依赖人工维护。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

const TARGETS = {
  package: join(ROOT, 'package.json'),
  tauri: join(ROOT, 'src-tauri', 'tauri.conf.json'),
  cargo: join(ROOT, 'src-tauri', 'Cargo.toml'),
  gradle: join(ROOT, 'android', 'app', 'build.gradle'),
}

function readVersion() {
  return JSON.parse(readFileSync(TARGETS.package, 'utf-8')).version
}

function semverToCode(version) {
  const match = SEMVER.exec(version)
  if (!match) throw new Error(`版本号不是合法 SemVer: ${version}`)
  const [, major, minor, patch] = match
  return Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch)
}

function readTauriVersion() {
  return JSON.parse(readFileSync(TARGETS.tauri, 'utf-8')).version
}

function readCargoVersion() {
  const text = readFileSync(TARGETS.cargo, 'utf-8')
  const match = /^version = "([^"]+)"/m.exec(text)
  return match?.[1] ?? null
}

function readGradleVersion() {
  const text = readFileSync(TARGETS.gradle, 'utf-8')
  const name = /versionName "([^"]+)"/.exec(text)?.[1] ?? null
  const code = Number(/versionCode (\d+)/.exec(text)?.[1] ?? NaN)
  return { name, code }
}

function check() {
  const expected = readVersion()
  const expectedCode = semverToCode(expected)
  const tauri = readTauriVersion()
  const cargo = readCargoVersion()
  const gradle = readGradleVersion()

  const rows = [
    ['package.json', expected, true],
    ['tauri.conf.json', tauri, tauri === expected],
    ['Cargo.toml', cargo, cargo === expected],
    ['android versionName', gradle.name, gradle.name === expected],
    ['android versionCode', String(gradle.code), gradle.code === expectedCode],
  ]

  let ok = true
  for (const [label, actual, pass] of rows) {
    if (!pass) ok = false
    console.log(`${pass ? 'OK  ' : 'FAIL'}  ${label.padEnd(22)} ${actual}  (期望 ${label.includes('Code') ? expectedCode : expected})`)
  }
  return ok
}

function set(version) {
  if (!SEMVER.test(version)) {
    console.error(`版本号必须符合 SemVer（如 1.2.0）：${version}`)
    process.exit(1)
  }
  const code = semverToCode(version)

  const pkg = JSON.parse(readFileSync(TARGETS.package, 'utf-8'))
  pkg.version = version
  writeFileSync(TARGETS.package, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')

  const tauri = JSON.parse(readFileSync(TARGETS.tauri, 'utf-8'))
  tauri.version = version
  writeFileSync(TARGETS.tauri, `${JSON.stringify(tauri, null, 2)}\n`, 'utf-8')

  const cargo = readFileSync(TARGETS.cargo, 'utf-8')
  writeFileSync(
    TARGETS.cargo,
    cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`),
    'utf-8',
  )

  const gradle = readFileSync(TARGETS.gradle, 'utf-8')
  writeFileSync(
    TARGETS.gradle,
    gradle
      .replace(/versionCode \d+/, `versionCode ${code}`)
      .replace(/versionName "[^"]+"/, `versionName "${version}"`),
    'utf-8',
  )

  console.log(`版本已同步为 ${version}（Android versionCode=${code}）`)
}

const [command, argument] = process.argv.slice(2)
if (command === 'check') {
  process.exit(check() ? 0 : 1)
} else if (command === 'set' && argument) {
  set(argument)
} else {
  console.log('用法：node scripts/sync-version.mjs <check|set> [version]')
  process.exit(1)
}
