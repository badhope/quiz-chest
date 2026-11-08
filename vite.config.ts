import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

/** package.json 是版本号唯一来源，构建期注入到前端运行时。 */
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig(({ mode }) => {
  const isNative = mode === 'native'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      VitePWA({
        disable: isNative,
        registerType: 'autoUpdate',
        includeAssets: ['icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: '题匣 · QuizChest',
          short_name: '题匣',
          description: '导入自有题库，离线完成练习、模拟考试、错题复习与学习统计',
          lang: 'zh-CN',
          theme_color: '#f4f0e7',
          background_color: '#f4f0e7',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            { name: '题库总览', url: '/catalog' },
            { name: '错题本', url: '/wrong' },
            { name: '学习统计', url: '/stats' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // 手动分块：把体积大且变动少的依赖拆出来，最大化长期缓存命中。
          manualChunks: {
            echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
            react: ['react', 'react-dom', 'react-router-dom'],
            state: ['zustand'],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
      watch: { ignored: ['**/src-tauri/target/**', '**/android/**'] },
    },
    preview: { port: 4173, host: true },
  }
})
