import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每个用例后卸载 DOM 树，避免测试之间互相污染。
afterEach(() => {
  cleanup()
})
