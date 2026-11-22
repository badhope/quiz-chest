import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    // 默认 node 环境跑纯逻辑测试；需要 DOM 的文件在首行加 `// @vitest-environment jsdom`。
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    reporters: ['default'],
    restoreMocks: true,
  },
})
