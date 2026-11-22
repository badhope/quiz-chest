import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 统一质量门禁。顺序有意设计：越便宜、越早能抓到问题的检查越靠前，
 * 失败即中止，避免在脏构建上浪费后续步骤。
 *
 * Rust 那一步在缺少 cargo 的机器上会明确跳过并打印原因，而不是假装通过；
 * 桌面数据层（src-tauri/src/db.rs）的 SQL 与命令只有 cargo test 能覆盖。
 */
const steps = [
  ['version', 'node', ['scripts/sync-version.mjs', 'check']],
  ['typecheck', 'npx', ['tsc', '-b', '--pretty', 'false']],
  ['lint', 'npx', ['eslint', '.']],
  ['test', 'npx', ['vitest', 'run']],
  ['build', 'npm', ['run', 'build']],
  // E2E 显式排除在默认门禁外：它要起 dev server 并驱动真实浏览器，
  // 在 CI 之外会拖慢每次提交。用 `pnpm test:e2e` 单独跑。
]

const rustManifest = join('src-tauri', 'Cargo.toml')
const hasCargo = spawnSync('cargo', ['--version'], { shell: true, stdio: 'ignore' }).status === 0

let failed = false
for (const [name, cmd, args] of steps) {
  process.stdout.write(`\n=== ${name} ===\n`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    failed = true
    process.stdout.write(`\n${name} FAILED (exit ${result.status})\n`)
    break
  }
}

if (!failed) {
  if (!existsSync(rustManifest)) {
    process.stdout.write('\n=== rust (skipped: no src-tauri/Cargo.toml) ===\n')
  } else if (!hasCargo) {
    process.stdout.write('\n=== rust (skipped: cargo not installed) ===\n')
  } else {
    process.stdout.write('\n=== rust ===\n')
    const result = spawnSync(
      'cargo',
      ['test', '--manifest-path', rustManifest, '--quiet'],
      { stdio: 'inherit', shell: true },
    )
    if (result.status !== 0) {
      failed = true
      process.stdout.write(`\nrust FAILED (exit ${result.status})\n`)
    }
  }
}

// 依赖审计：运行时依赖出现 high/critical 即失败。
// 网络不可用时明确跳过并打印原因，不假装通过。
if (!failed && process.env.SKIP_AUDIT !== '1') {
  process.stdout.write('\n=== audit ===\n')
  const result = spawnSync('node', ['scripts/audit-deps.mjs', '--strict'], {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status === 2) {
    process.stdout.write('\n=== audit (skipped: registry unavailable) ===\n')
  } else if (result.status !== 0) {
    failed = true
    process.stdout.write(`\naudit FAILED (exit ${result.status})\n`)
  }
}

if (failed) process.exit(1)
process.stdout.write('\nAll checks passed.\n')
