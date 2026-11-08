#!/usr/bin/env node
/**
 * 把 APK 内的前端资源解包并用本地 HTTP 服务供出。
 *
 * 用途：宿主没有硬件虚拟化（无 VT-x），Android 模拟器起不来。
 * 能做的最强替代验证 = 把 APK 里 `assets/public/` 的真实产物解出来，
 * 由浏览器按原生壳同样的方式（hash 路由）加载，跑完整 E2E。
 *
 * 为什么必须用 APK 里的资源而不是 dist/：这两者可能不一致
 * （cap sync 复制的是哪次构建的 dist/ 只有打包时才知道），
 * 验证 APK 本身才可信。
 *
 * 用法：node scripts/serve-apk-assets.mjs <apk 路径> [端口]
 * 退出时自动清理解包目录（Ctrl+C / 进程结束）。
 */
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'

/** 未指定路径时，取 artifacts/ 里最新的 debug APK（与构建产物对齐）。 */
function resolveApk() {
  const given = process.argv[2]
  if (given) return given
  const dir = join(process.cwd(), 'artifacts')
  if (!existsSync(dir)) return null
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith('-debug.apk'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0] ?? null
}

const apk = resolveApk()
const port = Number(process.argv[3] ?? process.argv[2]) || 5183
if (!apk || !existsSync(apk)) {
  console.error(`找不到 APK：${apk ?? '(未提供)'}`)
  process.exit(1)
}

const workDir = mkdtempSync(join(tmpdir(), 'quizchest-apk-'))
const root = join(workDir, 'assets', 'public')
// 直接解整个 APK。不要用 `unzip apk "assets/public/*"`：Git Bash 的 unzip
// 只把通配符展开到一级目录，index.html 能解出来但 assets/ 子目录会缺，
// 服务就会拿 SPA 回退把 JS 请求也回成 HTML，页面白屏且无报错。
execFileSync('unzip', ['-q', apk, '-d', workDir], { stdio: 'pipe' })
if (!existsSync(join(root, 'index.html'))) {
  console.error('APK 里没有 assets/public/index.html，资源缺失')
  rmSync(workDir, { recursive: true, force: true })
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let file = join(root, url === '/' ? 'index.html' : url)
  if (!file.startsWith(root)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  let body = readFileSyncSafe(file)
  if (body === null) {
    // 原生壳是 hash 路由，任何未命中都回 index.html，与 WebView 行为一致。
    body = readFileSyncSafe(join(root, 'index.html'))
    if (body === null) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    file = join(root, 'index.html')
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(body)
})

function readFileSyncSafe(path) {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}

server.listen(port, '127.0.0.1', () => {
  console.log(`serving APK assets on http://127.0.0.1:${port}/`)
})

function cleanup() {
  server.close()
  try {
    rmSync(workDir, { recursive: true, force: true })
  } catch {
    // Windows 上文件句柄延迟释放时清理失败无害，目录在系统临时区。
  }
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', () => {
  try {
    rmSync(workDir, { recursive: true, force: true })
  } catch {
    // 同上
  }
})
