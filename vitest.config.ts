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
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'json'],
    // 只量 src 下的运行时代码；类型定义与测试/脚本不计入
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/types/**',
      'src/main.tsx',
      'src/lib/appApi.ts',
      'tests/**',
      'scripts/**',
      'dist/**',
    ],
  },
})
