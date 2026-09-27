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

### 测试与检查

| 命令 | 作用 |
|------|------|
| `npm test` | 前端单元测试 + 组件测试（Vitest + Testing Library） |
| `npm run coverage` | 前端测试并输出覆盖率报告到 `coverage/` |
| `npm run typecheck` | TypeScript 类型检查（含 `src/` 与 `tests/`） |
| `npm run contract:check` | 前后端契约校验：前端 `appApi` 调用的命令名必须与 Rust 注册的命令一一对应 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust 数据层 / 迁移 / 备份 / 导入测试（每个用例独立的内存 SQLite） |

本地执行 `npm audit` 时，如果 npm 源是 npmmirror，需要加 `--registry=https://registry.npmjs.org`（镜像不提供 audit 接口）。

### 持续集成

`.github/workflows/ci.yml` 在 push / PR 到 `main` 时运行，三个 job 均为硬门禁：

- **frontend**：`npm test` + `npm run typecheck` + `npm run contract:check`
- **rust**：Windows 上跑 `cargo test`
- **audit**：`npm audit --audit-level=high`

## 项目结构

```
src/                     React 前端
  components/            页面与组件
  lib/appApi.ts          唯一的 Tauri invoke 出口，实现 types/index.ts 中的 AppApi 契约
src-tauri/src/
  commands/              Tauri 命令（瘦适配层）
  db/                    数据层，全部以 &Connection 入参，可脱离 Tauri 单测
    migrations.rs        版本化 schema 迁移（PRAGMA user_version）
    backup.rs            备份导出 / 导入、导入前快照
  config_store.rs        172 API 凭证读写（系统钥匙串）
tests/                   前端测试
src-tauri/tests/         Rust 集成测试
scripts/                 契约校验、套餐抓取等辅助脚本
```

## 打包

```bash
# 本地打包 Windows 安装包
npm run build
```

打包后的 Windows 安装包位于 `src-tauri/target/release/bundle/nsis/`。

自动更新使用 Tauri updater + GitHub Releases。安装版应用会从 `https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json` 检查更新，下载完成后可重启安装。

172 号卡 API 请求设置了超时，会明确提示空凭证、网络失败和响应格式问题；订单导入在匹配到套餐且有激活时间时会自动补全缺失的优惠到期日（已手动填写的不覆盖）。

## 发布更新

项目使用 GitHub Releases 作为公开发布源。创建公开仓库 `qingwei0326/traffic-card-manager` 后，推送版本标签会自动构建并发布：

```bash
git tag v1.0.0
git push origin v1.0.0
```

Release 工作流在 Windows 环境打包 Tauri 安装包，并上传安装包、签名和自动生成的 `latest.json` 到 GitHub Release。测试与检查由 CI 负责，**打 tag 前请确认对应提交的 CI 已通过**。

首次发布前，在 GitHub 仓库 Secrets 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果生成密钥时设置了密码；无密码密钥可留空）

本地生成签名密钥：

```bash
npx tauri signer generate --ci
```

只把 public key 写入 `src-tauri/tauri.conf.json`，private key 只放入 GitHub Secrets 和密码管理器，**不要放在项目目录里**（私钥泄露意味着别人可以向所有用户推送恶意更新）。

## 数据存储

数据库文件保存在 Tauri 应用数据目录中的 `traffic-cards.db`。
首次启动 Tauri 版本时，会从旧版用户数据目录复制已有数据库到新的应用数据目录，旧数据库不会被修改。

套餐模板 JSON 随安装包打包为资源文件，系统设置页只允许读取白名单内的 `172-plans.json` 和 `haoyi-plans-parsed.json`，不会读取任意路径。

## 数据安全

- **版本化迁移**：schema 版本记录在 `PRAGMA user_version`，升级时按版本顺序在事务内执行迁移；迁移失败会在启动时通过界面横幅告警。
- **自动快照**：执行前向迁移或导入备份之前，会先把整个数据库复制到数据目录下的 `backups/pre-migration-<时间>.db` / `backups/pre-import-<时间>.db`，出问题可以手动还原。
- **完整备份**：JSON 备份包含客户、流量卡和套餐三张表，并带 `schemaVersion` 与 `checksum`。导入时会校验：校验和不符（文件损坏或被改动）直接拒绝；备份版本高于当前应用时提示先升级。整个导入在一个事务内完成，失败自动回滚。
- **凭证保护**：172 平台的 API secret 存在系统钥匙串（Windows 凭据管理器）中，不会写入配置文件，也不会通过 IPC 传给前端（前端只拿到掩码）。旧版本以 base64 / 明文保存的配置会在首次读取时自动迁入钥匙串。
- **最小权限**：Tauri capabilities 只开放 core / event / notification / updater，未开放 fs、shell；CSP 禁止内联脚本与 `eval`。

## 套餐类型说明

| 类型 | 说明 |
|------|------|
| 性价比 | 价格适中，流量够用，适合普通用户 |
| 大流量 | 流量充足，适合重度使用者 |
| 长期套餐 | 优惠期长，适合不想频繁换卡的用户 |
| 低价套餐 | 价格最低，适合预算有限的用户 |

## 许可证

MIT
