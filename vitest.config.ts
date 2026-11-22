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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        // 当前基线：页面层靠 E2E 覆盖，单测主要守数据与算法。
        // 只设下限，避免为了数字写假测试；有新逻辑时门禁会逼着补。
        lines: 40,
        statements: 40,
        functions: 32,
        branches: 32,
      },
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/data/questionBank/**',
      ],
    },
  },
})
