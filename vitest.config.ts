import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // 纯逻辑测试（含直接 import .tsx 但不渲染的）跑 node，速度最快；
    // 需要真实 DOM 的组件测试请在文件头加 `// @vitest-environment jsdom`。
    // 注意：vitest 4.1.9 下 environmentMatchGlobs 实测不生效，故改用文件级 docblock。
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
