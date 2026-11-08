#!/usr/bin/env node
/**
 * 依赖安全审计。
 *
 * 为什么单独一个脚本：本机 registry 指向 npmmirror，它没有实现 npm 的
 * audit 端点（`ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`），所以 `pnpm audit`
 * 默认直接报错。这里显式指定官方 registry，并区分「运行时依赖」与
 * 「仅构建期依赖」——前者必须清零，后者记录在案即可。
 *
 * 用法：
 *   node scripts/audit-deps.mjs            只报告
 *   node scripts/audit-deps.mjs --strict   运行时依赖出现 high 及以上即失败
 */
import { execFileSync } from 'node:child_process'

const strict = process.argv.includes('--strict')
const REGISTRY = 'https://registry.npmjs.org'

let raw
try {
  raw = execFileSync(
    'pnpm',
    ['audit', '--registry', REGISTRY, '--json'],
    { encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 },
  )
} catch (error) {
  // pnpm audit 有漏洞时以非 0 退出，但 stdout 仍是完整 JSON。
  raw = error.stdout ?? ''
}

let report
try {
  report = JSON.parse(raw)
} catch {
  console.error('无法解析 audit 输出。可能仍是 registry 端点问题，检查网络或 --registry 参数。')
  process.exit(2)
}

const advisories = Object.values(report.advisories ?? {})
const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 }
advisories.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))

/**
 * 判断某条漏洞是否只出现在构建期依赖链里。
 *
 * pnpm audit 的 metadata 只给数量不给名单，所以用根包名硬编码匹配：
 * 这些包只出现在 devDependencies（构建工具），不会被打进产物。
 * 新增 devDependency 时记得同步这里，否则它会被误判成运行时依赖。
 */
const DEV_ONLY_ROOTS = new Set([
  '@capacitor/cli',
  'vite-plugin-pwa',
  'vite',
  'vitest',
  'typescript-eslint',
  '@playwright/test',
  'eslint',
  '@tauri-apps/cli',
  'jsdom',
  'workbox-build',
])

function isDevOnly(advisory) {
  const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? [])
  if (paths.length === 0) return false
  return paths.every((path) => {
    // 路径形如 ".>@capacitor/cli>xcode>uuid"，取第二段根包名
    const root = path.split('>')[1]?.trim().split('/')[0]
    const scoped = path.split('>')[1]?.trim()
    return (root && DEV_ONLY_ROOTS.has(root)) || (scoped && DEV_ONLY_ROOTS.has(scoped))
  })
}

const runtime = advisories.filter((advisory) => !isDevOnly(advisory))
const devOnly = advisories.filter(isDevOnly)

console.log(`依赖审计（registry: ${REGISTRY}）`)
console.log(
  `总计 ${advisories.length} 条：运行时 ${runtime.length}，仅构建期 ${devOnly.length}`,
)

function print(list, label) {
  if (list.length === 0) {
    console.log(`\n${label}：无`)
    return
  }
  console.log(`\n${label}：`)
  for (const advisory of list) {
    const fix = advisory.patched_versions?.trim() || '无可用修复版本'
    console.log(`  [${advisory.severity}] ${advisory.module_name} ${advisory.vulnerable_versions}`)
    console.log(`      修复：${fix}`)
    console.log(`      ${advisory.title}`)
  }
}

print(runtime, '运行时依赖')
print(devOnly, '仅构建期依赖')

if (strict && runtime.some((a) => a.severity === 'high' || a.severity === 'critical')) {
  console.error('\n运行时依赖存在 high/critical 漏洞，按 --strict 判定失败。')
  process.exit(1)
}

console.log('\n审计完成。')
