# 流量卡管理系统

本地桌面应用，用于管理流量卡、客户和财务统计。

## 功能特性

- 📊 **仪表盘** - 查看当月办卡数量、利润统计、即将到期提醒
- 💳 **流量卡管理** - 添加、编辑、删除流量卡，支持筛选和搜索
- 👥 **客户管理** - 管理客户信息，查看客户关联的流量卡
- 💰 **财务统计** - 月度利润趋势、按运营商/套餐类型分析
- ⚙️ **系统设置** - 数据备份与恢复

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS
- **桌面**: Tauri 2
- **数据库**: SQLite
- **后端**: Rust + rusqlite
- **图表**: Recharts

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 打包

```bash
# 本地打包 Windows 安装包
npm run build
```

打包后的 Windows 安装包位于 `src-tauri/target/release/bundle/nsis/`。

自动更新使用 Tauri updater + GitHub Releases。安装版应用会从 `https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json` 检查更新，下载完成后可重启安装。

## 发布更新

项目使用 GitHub Releases 作为公开发布源。创建公开仓库 `qingwei0326/traffic-card-manager` 后，推送版本标签会自动构建并发布：

```bash
git tag v1.0.0
git push origin v1.0.0
```

Release 工作流会在 Windows 环境运行测试、打包 Tauri Windows 安装包，并上传安装包、签名和自动生成的 `latest.json` 到 GitHub Release。

首次发布前，在 GitHub 仓库 Secrets 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果生成密钥时设置了密码；无密码密钥可留空）

本地生成签名密钥：

```bash
npx tauri signer generate --ci
```

只把 public key 写入 `src-tauri/tauri.conf.json`，private key 只放入 GitHub Secrets。

## 数据存储

数据库文件保存在 Tauri 应用数据目录中的 `traffic-cards.db`。
首次启动 Tauri 版本时，会从旧版用户数据目录复制已有数据库到新的应用数据目录，旧数据库不会被修改。

套餐模板 JSON 放在项目的 `data` 目录中，系统设置页会从这里导入 172 号卡和号易平台套餐数据。

## 套餐类型说明

| 类型 | 说明 |
|------|------|
| 性价比 | 价格适中，流量够用，适合普通用户 |
| 大流量 | 流量充足，适合重度使用者 |
| 长期套餐 | 优惠期长，适合不想频繁换卡的用户 |
| 低价套餐 | 价格最低，适合预算有限的用户 |

## 许可证

MIT
