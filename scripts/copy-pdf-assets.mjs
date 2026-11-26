#!/usr/bin/env node
/**
 * 把 pdfjs-dist 的运行时资源复制到 public/pdfjs/。
 *
 * 为什么不直接 import 这些文件：
 * - CMaps 是 169 个 .bcmap，pdfjs 需要按文件名拼 URL 去取，不能靠 bundler 改名；
 * - 标准字体同理，缺失时部分 PDF 会报 translateFont failed；
 * - worker 复制成 .js，是为了让 Android WebView / Capacitor 的本地资源服务
 *   按 text/javascript 返回。模块 worker 的 MIME 一旦是 octet-stream，
 *   浏览器会拒绝启动，pdfjs 只能退回主线程，长 PDF 会卡界面。
 *
 * 生成目录已加入 .gitignore，构建和开发前都会重新生成，避免把二进制资源
 * 提交进仓库，也避免升级 pdfjs 后留下旧版本文件。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = join(root, 'node_modules', 'pdfjs-dist')
const target = join(root, 'public', 'pdfjs')

if (!existsSync(source)) {
  console.error('找不到 pdfjs-dist，请先运行 pnpm install')
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(join(target, 'cmaps'), { recursive: true })
mkdirSync(join(target, 'standard_fonts'), { recursive: true })

cpSync(join(source, 'cmaps'), join(target, 'cmaps'), { recursive: true })
cpSync(join(source, 'standard_fonts'), join(target, 'standard_fonts'), { recursive: true })
cpSync(join(source, 'legacy', 'build', 'pdf.worker.min.mjs'), join(target, 'pdf.worker.min.js'))

console.log('PDF 运行时资源已同步到 public/pdfjs/')
