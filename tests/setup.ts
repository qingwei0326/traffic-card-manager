// 组件测试（*.dom.test.tsx）的全局 setup。
//
// 这里当前不注册 @testing-library/jest-dom 的 matcher，原因与应对：
// 本机 node_modules 中 jest-dom 安装不完整（其依赖 aria-query 缺少
// package.json，导入会直接抛 "Cannot find package"），会让整个 jsdom
// 测试文件加载失败。
//
// 因此组件测试统一使用**原生断言**，不依赖 jest-dom：
//   - 断言元素存在：expect(screen.getByTestId('x')).toBeTruthy()
//   - 断言不存在：  expect(screen.queryByTestId('x')).toBeNull()
//   - 断言文案：    screen.getByText('...') 本身找不到就会抛错，即断言
//
// jest-dom 安装完整后（或 CI 全新 npm ci 环境），取消下面三行注释即可启用：
// if (typeof document !== 'undefined') {
//   await import('@testing-library/jest-dom/vitest')
// }
