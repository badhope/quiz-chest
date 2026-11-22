#!/usr/bin/env node
/**
 * APK 资源完整性校验。
 *
 * 为什么需要它：`cap sync` 只是复制 `dist/`。如果 `dist/` 里是 Web 构建
 * （带 sw.js、hash 文件名与 PWA）或者是上一次的残留，APK 里就可能只有
 * index.html 而没有 JS —— 装到手机上直接白屏，且本机一切测试都还是绿的。
 *
 * 校验规则：
 *   1. index.html 引用的每个本地 /assets/* 资源都必须真的在包里
 *   2. 不能包含 sw.js / workbox（原生壳关闭了 PWA）
 *   3. 必须含至少一个 JS 与一个 CSS
 *
 * 用法：node scripts/verify-apk.mjs <apk 路径>
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const apk = process.argv[2]
if (!apk || !existsSync(apk)) {
  console.error(`找不到 APK：${apk ?? '(未提供)'}`)
  process.exit(1)
}

/** Windows 上 unzip 需要在 Git Bash / MSYS 环境里才有。 */
function entries() {
  const output = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' })
  return output.split(/\r?\n/).filter(Boolean)
}

function readIndexHtml(list) {
  const entry = list.find((item) => item === 'assets/public/index.html')
  if (!entry) throw new Error('APK 内缺少 assets/public/index.html')
  return execFileSync('unzip', ['-p', apk, entry], { encoding: 'utf8' })
}

const list = entries()
const problems = []

if (!list.some((item) => item.startsWith('assets/public/'))) {
  problems.push('APK 内没有 assets/public/，前端资源完全缺失')
}

const indexHtml = problems.length === 0 ? readIndexHtml(list) : ''
const referenced = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
  (match) => match[1].replace(/^\//, ''),
)

if (referenced.length === 0) {
  problems.push('index.html 没有引用任何 /assets/ 资源，构建产物可能不完整')
}

for (const asset of referenced) {
  const entry = `assets/public/${asset}`
  if (!list.includes(entry)) {
    problems.push(`index.html 引用了不存在的资源：${entry}`)
  }
}

const hasJs = referenced.some((item) => item.endsWith('.js'))
const hasCss = referenced.some((item) => item.endsWith('.css'))
if (!hasJs) problems.push('没有 JS 资源引用，安装后会白屏')
if (!hasCss) problems.push('没有 CSS 资源引用')

const pwaLeftovers = list.filter(
  (item) => /assets\/public\/(sw\.js|workbox-[^/]*\.js)$/.test(item) || item.endsWith('manifest.webmanifest'),
)
if (pwaLeftovers.length > 0) {
  problems.push(
    `原生壳不该包含 PWA 产物，但发现了：${pwaLeftovers.join(', ')}（多半是 dist/ 用了 Web 构建）`,
  )
}

const jsCount = list.filter((item) => item.startsWith('assets/public/assets/') && item.endsWith('.js')).length
const cssCount = list.filter((item) => item.startsWith('assets/public/assets/') && item.endsWith('.css')).length

console.log(`APK: ${apk}`)
console.log(`  条目总数：${list.length}`)
console.log(`  index.html 引用资源：${referenced.length}`)
console.log(`  包内 JS：${jsCount} 个，CSS：${cssCount} 个`)

if (problems.length > 0) {
  console.error('\n校验失败：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('\nAPK 资源完整性：通过')
