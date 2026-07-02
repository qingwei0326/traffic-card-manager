# Tauri React SQLite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Electron + React + sql.js desktop app with a Tauri 2 + React + native SQLite app while preserving existing UI behavior and data.

**Architecture:** React remains the renderer and calls a single `src/lib/appApi.ts` adapter. Tauri/Rust owns desktop integration, SQLite persistence, imports, backup/restore, tray, notifications, and API calls. Existing Electron user data is copied into the Tauri app-data directory and the old data is never modified. Rust business behavior is validated by porting the current workflow tests first, then implementing the minimum repository code that makes those tests pass.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Tauri 2.x, Rust, `rusqlite`, `serde`, `reqwest`, Vitest, Cargo tests.

## Global Constraints

- Complete Electron replacement; do not keep a dual Electron/Tauri runtime after migration.
- Rust backend owns native SQLite access.
- Copy legacy data from `%APPDATA%/traffic-card-manager/traffic-cards.db` into the Tauri app-data directory; never write to the old Electron database.
- Preserve the current table names, column names, TypeScript data shapes, and backup JSON format.
- Keep the current React UI and business workflows; do not redesign screens or add unrelated features.
- Implement updater controls as a nonfunctional compatibility stub with message `Tauri 自动更新将在后续版本接入`.
- Use Tauri 2.x consistently across npm, Cargo, and plugins.
- Avoid reverting pre-existing unrelated changes in the dirty worktree.

---

## References

- Tauri 2 configuration uses `build.devUrl`, `build.frontendDist`, `beforeDevCommand`, `beforeBuildCommand`, `app.windows`, and `bundle` fields: <https://v2.tauri.app/reference/config/>
- Tauri frontend-to-Rust calls use `#[tauri::command]`, `invoke`, and `generate_handler!`: <https://v2.tauri.app/develop/calling-rust/>
- Tauri notification plugin is available from Rust and JavaScript: <https://v2.tauri.app/plugin/notification/>
- Tauri single-instance plugin must be registered first and can focus the existing window: <https://v2.tauri.app/plugin/single-instance/>

## File Structure

Create:

- `src/lib/appApi.ts`: Tauri invoke/event adapter that replaces `window.electronAPI`.
- `tests/appApi.test.ts`: Vitest coverage for updater stub and command-name mapping.
- `src-tauri/Cargo.toml`: Rust package and dependency manifest.
- `src-tauri/build.rs`: Tauri build script.
- `src-tauri/tauri.conf.json`: Tauri 2 app, build, window, bundle, and resource config.
- `src-tauri/capabilities/default.json`: Tauri permission capability file.
- `src-tauri/icons/icon.ico`: Windows icon copied from `build/icon.ico`.
- `src-tauri/icons/icon.png`: PNG icon copied from `build/icon.png`.
- `src-tauri/src/main.rs`: Rust binary entrypoint.
- `src-tauri/src/lib.rs`: Tauri builder, managed state, command registration, plugin setup.
- `src-tauri/src/error.rs`: Shared `AppError` and `AppResult<T>`.
- `src-tauri/src/state.rs`: Shared app state with database path, config path, and `Mutex<Connection>`.
- `src-tauri/src/models.rs`: Serializable Rust structs matching TypeScript API shapes.
- `src-tauri/src/db/mod.rs`: Database module exports.
- `src-tauri/src/db/schema.rs`: Table creation, compatibility column migration, indexes.
- `src-tauri/src/db/migration.rs`: Old Electron data/config copy migration.
- `src-tauri/src/db/cards.rs`: Card SQL and card stats.
- `src-tauri/src/db/customers.rs`: Customer SQL, duplicate detection, merge.
- `src-tauri/src/db/plans.rs`: Plan import, plan matching, card backfill.
- `src-tauri/src/db/finance.rs`: Finance aggregation queries.
- `src-tauri/src/db/backup.rs`: Backup export/import.
- `src-tauri/src/db/imports.rs`: 172 and Haoyi row import workflows.
- `src-tauri/src/api172.rs`: 172 API signing, request, product sync mapping.
- `src-tauri/src/config_store.rs`: API config read/write with base64 compatibility.
- `src-tauri/src/desktop.rs`: tray, window close flow, notifications, expiry timer.
- `src-tauri/src/commands/mod.rs`: Command module exports.
- `src-tauri/src/commands/cards.rs`: Card commands.
- `src-tauri/src/commands/customers.rs`: Customer commands.
- `src-tauri/src/commands/finance.rs`: Finance commands.
- `src-tauri/src/commands/plans.rs`: Plan commands.
- `src-tauri/src/commands/imports.rs`: Import commands.
- `src-tauri/src/commands/backup.rs`: Backup commands.
- `src-tauri/src/commands/api.rs`: API config, 172 API, notification, app, and updater-stub commands.
- `src-tauri/tests/schema_migration.rs`: Fresh DB and legacy copy migration tests.
- `src-tauri/tests/cards_customers.rs`: Card/customer CRUD, partial update, duplicate/merge tests.
- `src-tauri/tests/plans_imports.rs`: Plan import/match/backfill and 172/Haoyi import tests.
- `src-tauri/tests/backup_finance.rs`: Backup restore and finance aggregation tests.

Modify:

- `package.json`: remove Electron scripts/config/deps, add Tauri scripts/deps.
- `package-lock.json`: refresh after dependency changes.
- `vite.config.ts`: remove Electron plugins and keep React/alias config.
- `tsconfig.json`: include `src` and Tauri API typings only; remove Node-only assumptions where possible.
- `vitest.config.ts`: keep frontend tests under `tests/**/*.test.ts`.
- `src/types/index.ts`: replace `Window.electronAPI` global with exported `AppApi` interfaces.
- `src/App.tsx`: use `appApi.app` for close request and close action.
- `src/components/Layout.tsx`: use `appApi.update` updater stub methods/events.
- `src/components/Dashboard.tsx`: use `appApi.cards`.
- `src/components/CardList.tsx`: use `appApi.cards`.
- `src/components/CardForm.tsx`: use `appApi.cards` and `appApi.customers`.
- `src/components/CardPicker.tsx`: use `appApi.plans`.
- `src/components/CustomerList.tsx`: use `appApi.customers`.
- `src/components/CustomerForm.tsx`: use `appApi.customers`.
- `src/components/FinanceStats.tsx`: use `appApi.finance`.
- `src/components/PlanList.tsx`: use `appApi.plans`.
- `src/components/Settings.tsx`: use `appApi` for backup, imports, API config, plans, and 172 API.
- `tests/cardSql.test.ts`: delete after `cards_get_all_searches_package_customer_phone_region_and_notes` is added to `src-tauri/tests/cards_customers.rs`.
- `tests/database.test.ts`: delete after parser/status/price/date cases are added to `src-tauri/tests/plans_imports.rs`.
- `tests/databaseWorkflow.test.ts`: move workflow coverage to Rust integration tests.
- `tests/packageConfig.test.ts`: update from Electron Builder assertions to Tauri package/config assertions.
- `.gitignore`: ignore `src-tauri/target/` and generated Tauri artifacts.
- `README.md`: update tech stack, dev/build commands, data storage, and updater note.
- `用户使用说明.md`: update app/runtime wording and remove Electron-specific packaging language.
- `.github/workflows/release.yml`: replace Electron build commands and updater artifact handling with Tauri Windows bundle handling.

Delete after replacement is verified:

- `electron/main.ts`
- `electron/preload.ts`
- `electron/database.ts`
- `electron/cardSql.ts`
- `electron/api172.ts`
- `electron/`
- `dist-electron/`
- `scripts/build.js`
- `scripts/create-portable-zip.js`; portable zip is excluded from this migration and can be reintroduced after the Tauri installer build is stable.
- `scripts/update-win-icon.js`
- `scripts/fix-phones.js` and `scripts/update-plans.js`; they import `sql.js` and are obsolete once Rust owns SQLite migrations.

## Interfaces

Frontend API interface produced by Task 2:

```ts
export interface AppApi {
  cards: {
    getAll(filters?: CardFilters): Promise<PaginatedResult<Card>>
    getById(id: number): Promise<Card | null>
    create(card: Partial<Card>): Promise<Card>
    update(id: number, card: Partial<Card>): Promise<Card>
    delete(id: number): Promise<void>
    getStats(): Promise<CardStats>
    getMonthlyStats(year: number, month: number): Promise<MonthlyStats>
    getExpiringSoon(days: number): Promise<Card[]>
  }
  customers: {
    getAll(filters?: CustomerFilters): Promise<PaginatedResult<Customer>>
    getById(id: number): Promise<Customer | null>
    create(customer: Partial<Customer>): Promise<Customer>
    update(id: number, customer: Partial<Customer>): Promise<Customer>
    delete(id: number): Promise<void>
    getCards(id: number): Promise<Card[]>
    findDuplicates(): Promise<Customer[][]>
    merge(keepId: number, mergeIds: number[]): Promise<{ merged: number }>
  }
  finance: {
    getProfitSummary(): Promise<ProfitSummary>
    getMonthlyProfit(year: number): Promise<MonthlyProfitRow[]>
    getProfitByCarrier(): Promise<ProfitByType[]>
    getProfitByPlanType(): Promise<ProfitByType[]>
  }
  plans: {
    getAll(): Promise<Plan[]>
    import(plans: unknown[]): Promise<PlanImportResult>
    importFromFile(filePath: string): Promise<PlanImportResult>
    match(cardName: string): Promise<Plan | null>
    backfillCards(): Promise<{ backfilled: number }>
    delete(id: number): Promise<void>
  }
  backup: {
    export(): Promise<unknown>
    import(data: unknown): Promise<unknown>
  }
  import172: { import(rows: unknown[]): Promise<ImportResult> }
  importHaoyi: { import(rows: unknown[]): Promise<ImportResult> }
  api172: {
    testConnection(config: Api172Config): Promise<{ success: boolean; message: string }>
    getProducts(config: Api172Config): Promise<unknown>
    syncProducts(config: Api172Config): Promise<PlanImportResult>
    getOrderInfo(config: Api172Config, orderId: string): Promise<unknown>
  }
  apiConfig: {
    get(): Promise<Api172Config>
    save(config: Api172Config): Promise<void>
  }
  update: {
    check(): Promise<{ ok: boolean; message?: string }>
    download(): Promise<{ ok: boolean; message?: string }>
    install(): Promise<{ ok: boolean; message?: string }>
    onAvailable(callback: (version: string) => void): () => void
    onNotAvailable(callback: () => void): () => void
    onProgress(callback: (percent: number) => void): () => void
    onDownloaded(callback: () => void): () => void
    onError(callback: (message: string) => void): () => void
  }
  notifications: {
    checkNow(): Promise<void>
    onMessage(callback: (message: string) => void): () => void
  }
  app: {
    showWindow(): Promise<void>
    chooseCloseAction(action: 'minimize' | 'quit'): Promise<void>
    onCloseRequest(callback: () => void): () => void
  }
}
```

Rust command names consumed by `src/lib/appApi.ts`:

```text
cards_get_all
cards_get_by_id
cards_create
cards_update
cards_delete
cards_get_stats
cards_get_monthly_stats
cards_get_expiring_soon
customers_get_all
customers_get_by_id
customers_create
customers_update
customers_delete
customers_get_cards
customers_find_duplicates
customers_merge
finance_get_profit_summary
finance_get_monthly_profit
finance_get_profit_by_carrier
finance_get_profit_by_plan_type
plans_get_all
plans_import
plans_import_from_file
plans_match
plans_backfill_cards
plans_delete
backup_export
backup_import
import_172
import_haoyi
api172_test_connection
api172_get_products
api172_sync_products
api172_get_order_info
api_config_get
api_config_save
update_check
update_download
update_install
notifications_check_now
app_show_window
app_choose_close_action
```

Tauri events consumed by `src/lib/appApi.ts`:

```text
app:close-request
notification:message
update:available
update:not-available
update:progress
update:downloaded
update:error
```

---

### Task 1: Scaffold Tauri 2 Runtime And Package Configuration

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/icons/icon.ico`
- Create: `src-tauri/icons/icon.png`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `.gitignore`
- Test: `tests/packageConfig.test.ts`

**Interfaces:**
- Consumes: approved design spec.
- Produces: runnable Tauri shell with Vite renderer and empty command registry ready for later tasks.

- [ ] **Step 1: Write failing package/config test**

Replace `tests/packageConfig.test.ts` with Tauri-specific assertions:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'))

describe('Tauri package config', () => {
  it('uses Tauri scripts and removes Electron entry/config', () => {
    expect(pkg.main).toBeUndefined()
    expect(pkg.build).toBeUndefined()
    expect(pkg.scripts.dev).toBe('tauri dev')
    expect(pkg.scripts.build).toBe('tauri build')
    expect(pkg.scripts['dev:renderer']).toBe('vite --host 127.0.0.1')
    expect(pkg.scripts['build:renderer']).toBe('vite build')
  })

  it('keeps renderer dependencies and removes Electron/sql.js dependencies', () => {
    expect(pkg.dependencies.react).toBeDefined()
    expect(pkg.dependencies['@tauri-apps/api']).toBeDefined()
    expect(pkg.dependencies['sql.js']).toBeUndefined()
    expect(pkg.dependencies['electron-log']).toBeUndefined()
    expect(pkg.dependencies['electron-updater']).toBeUndefined()
    expect(pkg.devDependencies.electron).toBeUndefined()
    expect(pkg.devDependencies['electron-builder']).toBeUndefined()
    expect(pkg.devDependencies['vite-plugin-electron']).toBeUndefined()
    expect(pkg.devDependencies['vite-plugin-electron-renderer']).toBeUndefined()
    expect(pkg.devDependencies['@tauri-apps/cli']).toBeDefined()
  })

  it('configures the Tauri app, renderer build, bundled data, and Windows installer', () => {
    expect(tauriConfig.identifier).toBe('com.traffic-card.manager')
    expect(tauriConfig.productName).toBe('流量卡管理系统')
    expect(tauriConfig.version).toBe(pkg.version)
    expect(tauriConfig.build.devUrl).toBe('http://127.0.0.1:5173')
    expect(tauriConfig.build.frontendDist).toBe('../dist')
    expect(tauriConfig.bundle.active).toBe(true)
    expect(tauriConfig.bundle.targets).toContain('nsis')
    expect(tauriConfig.bundle.resources).toContain('../data/172-plans.json')
    expect(tauriConfig.bundle.resources).toContain('../data/haoyi-plans-parsed.json')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/packageConfig.test.ts`

Expected: FAIL because `src-tauri/tauri.conf.json` is missing or Electron config is still present.

- [ ] **Step 3: Update npm package config**

Modify `package.json`:

```json
{
  "name": "traffic-card-manager",
  "version": "1.0.1",
  "description": "流量卡管理系统 - 本地版",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "dist": "tauri build",
    "release": "tauri build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev:renderer": "vite --host 127.0.0.1",
    "build:renderer": "vite build",
    "tauri": "tauri"
  },
  "keywords": ["流量卡", "管理", "tauri", "桌面应用"],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/qingwei0326/traffic-card-manager.git"
  },
  "homepage": "https://github.com/qingwei0326/traffic-card-manager#readme",
  "bugs": {
    "url": "https://github.com/qingwei0326/traffic-card-manager/issues"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "lucide-react": "^1.21.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.15.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "puppeteer-core": "^25.1.0",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.3",
    "vitest": "^4.1.9"
  }
}
```

Then run: `npm install`

Expected: `package-lock.json` updates and installs `@tauri-apps/api` and `@tauri-apps/cli`.

- [ ] **Step 4: Simplify Vite config**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
```

- [ ] **Step 5: Create Tauri config and Rust entrypoint skeleton**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "流量卡管理系统",
  "version": "1.0.1",
  "identifier": "com.traffic-card.manager",
  "build": {
    "beforeDevCommand": "npm run dev:renderer",
    "devUrl": "http://127.0.0.1:5173",
    "beforeBuildCommand": "npm run build:renderer",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "流量卡管理系统",
        "width": 1400,
        "height": 900,
        "minWidth": 1200,
        "minHeight": 800,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/icon.ico", "icons/icon.png"],
    "resources": ["../data/172-plans.json", "../data/haoyi-plans-parsed.json"],
    "windows": {
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "installMode": "both",
        "displayLanguageSelector": false
      }
    }
  }
}
```

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "traffic-card-manager"
version = "1.0.1"
description = "流量卡管理系统 - 本地版"
edition = "2021"

[lib]
name = "traffic_card_manager_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
base64 = "0.22"
chrono = { version = "0.4", features = ["serde", "clock"] }
md5 = "0.7"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
rusqlite = { version = "0.32", features = ["bundled", "chrono"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = ["tray-icon", "image-ico", "image-png"] }
tauri-plugin-notification = "2"
tauri-plugin-single-instance = "2"
thiserror = "2"
tokio = { version = "1", features = ["time"] }
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

Create `src-tauri/src/main.rs`:

```rust
fn main() {
    traffic_card_manager_lib::run();
}
```

Create `src-tauri/src/error.rs`:

```rust
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("文件错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON错误: {0}")]
    Json(#[from] serde_json::Error),
    #[error("网络错误: {0}")]
    Http(#[from] reqwest::Error),
    #[error("{0}")]
    Message(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
```

Create `src-tauri/src/state.rs`:

```rust
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub config_path: PathBuf,
    pub migration_error: Mutex<Option<String>>,
}
```

Create `src-tauri/src/lib.rs`:

```rust
mod error;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default desktop permissions",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

Copy icons:

```powershell
Copy-Item -LiteralPath .\build\icon.ico -Destination .\src-tauri\icons\icon.ico -Force
Copy-Item -LiteralPath .\build\icon.png -Destination .\src-tauri\icons\icon.png -Force
```

- [ ] **Step 6: Update ignore file**

Add to `.gitignore`:

```gitignore
src-tauri/target/
src-tauri/gen/
```

- [ ] **Step 7: Run config tests**

Run: `npm test -- tests/packageConfig.test.ts`

Expected: PASS.

- [ ] **Step 8: Run Rust compile check**

Run: `cargo check` from `src-tauri`

Expected: PASS with no command modules yet.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts .gitignore tests/packageConfig.test.ts src-tauri
git commit -m "feat: scaffold tauri runtime"
```

---

### Task 2: Add Frontend Tauri API Adapter And Migrate Component Calls

**Files:**
- Create: `src/lib/appApi.ts`
- Test: `tests/appApi.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/CardList.tsx`
- Modify: `src/components/CardForm.tsx`
- Modify: `src/components/CardPicker.tsx`
- Modify: `src/components/CustomerList.tsx`
- Modify: `src/components/CustomerForm.tsx`
- Modify: `src/components/FinanceStats.tsx`
- Modify: `src/components/PlanList.tsx`
- Modify: `src/components/Settings.tsx`

**Interfaces:**
- Consumes: command names and events from the Interfaces section.
- Produces: `appApi: AppApi` and exported TypeScript API types.

- [ ] **Step 1: Write failing adapter test**

Create `tests/appApi.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    if (command.startsWith('update_')) {
      return { ok: false, message: 'Tauri 自动更新将在后续版本接入' }
    }
    return { command }
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}))

describe('appApi', () => {
  it('maps update commands to compatibility-stub commands', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { appApi } = await import('../src/lib/appApi')

    await expect(appApi.update.check()).resolves.toEqual({
      ok: false,
      message: 'Tauri 自动更新将在后续版本接入',
    })
    await expect(appApi.update.download()).resolves.toEqual({
      ok: false,
      message: 'Tauri 自动更新将在后续版本接入',
    })
    await expect(appApi.update.install()).resolves.toEqual({
      ok: false,
      message: 'Tauri 自动更新将在后续版本接入',
    })

    expect(invoke).toHaveBeenCalledWith('update_check')
    expect(invoke).toHaveBeenCalledWith('update_download')
    expect(invoke).toHaveBeenCalledWith('update_install')
  })

  it('returns unsubscribe functions from event subscriptions', async () => {
    const { appApi } = await import('../src/lib/appApi')
    const unsubscribe = await appApi.app.onCloseRequest(() => {})
    expect(typeof unsubscribe).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/appApi.test.ts`

Expected: FAIL because `src/lib/appApi.ts` does not exist.

- [ ] **Step 3: Export API types from `src/types/index.ts`**

Remove the `declare global { interface Window { electronAPI: ... } }` block and add:

```ts
export interface Api172Config {
  user_id: string
  secret: string
}

export interface UpdateResult {
  ok: boolean
  message?: string
}

export interface AppApi {
  cards: {
    getAll: (filters?: CardFilters) => Promise<PaginatedResult<Card>>
    getById: (id: number) => Promise<Card | null>
    create: (card: Partial<Card>) => Promise<Card>
    update: (id: number, card: Partial<Card>) => Promise<Card>
    delete: (id: number) => Promise<void>
    getStats: () => Promise<CardStats>
    getMonthlyStats: (year: number, month: number) => Promise<MonthlyStats>
    getExpiringSoon: (days: number) => Promise<Card[]>
  }
  customers: {
    getAll: (filters?: CustomerFilters) => Promise<PaginatedResult<Customer>>
    getById: (id: number) => Promise<Customer | null>
    create: (customer: Partial<Customer>) => Promise<Customer>
    update: (id: number, customer: Partial<Customer>) => Promise<Customer>
    delete: (id: number) => Promise<void>
    getCards: (id: number) => Promise<Card[]>
    findDuplicates: () => Promise<Customer[][]>
    merge: (keepId: number, mergeIds: number[]) => Promise<{ merged: number }>
  }
  finance: {
    getProfitSummary: () => Promise<ProfitSummary>
    getMonthlyProfit: (year: number) => Promise<MonthlyProfitRow[]>
    getProfitByCarrier: () => Promise<ProfitByType[]>
    getProfitByPlanType: () => Promise<ProfitByType[]>
  }
  settings: Record<string, never>
  plans: {
    getAll: () => Promise<Plan[]>
    import: (plans: unknown[]) => Promise<PlanImportResult>
    importFromFile: (filePath: string) => Promise<PlanImportResult>
    match: (cardName: string) => Promise<Plan | null>
    backfillCards: () => Promise<{ backfilled: number }>
    delete: (id: number) => Promise<void>
  }
  backup: {
    export: () => Promise<unknown>
    import: (data: unknown) => Promise<unknown>
  }
  import172: {
    import: (rows: unknown[]) => Promise<ImportResult>
  }
  importHaoyi: {
    import: (rows: unknown[]) => Promise<ImportResult>
  }
  api172: {
    testConnection: (config: Api172Config) => Promise<{ success: boolean; message: string }>
    getProducts: (config: Api172Config) => Promise<unknown>
    syncProducts: (config: Api172Config) => Promise<PlanImportResult>
    getOrderInfo: (config: Api172Config, orderId: string) => Promise<unknown>
  }
  apiConfig: {
    get: () => Promise<Api172Config>
    save: (config: Api172Config) => Promise<void>
  }
  update: {
    check: () => Promise<UpdateResult>
    download: () => Promise<UpdateResult>
    install: () => Promise<UpdateResult>
    onAvailable: (callback: (version: string) => void) => Promise<() => void>
    onNotAvailable: (callback: () => void) => Promise<() => void>
    onProgress: (callback: (percent: number) => void) => Promise<() => void>
    onDownloaded: (callback: () => void) => Promise<() => void>
    onError: (callback: (message: string) => void) => Promise<() => void>
  }
  notifications: {
    checkNow: () => Promise<void>
    onMessage: (callback: (message: string) => void) => Promise<() => void>
  }
  app: {
    showWindow: () => Promise<void>
    chooseCloseAction: (action: 'minimize' | 'quit') => Promise<void>
    onCloseRequest: (callback: () => void) => Promise<() => void>
  }
}
```

- [ ] **Step 4: Implement `src/lib/appApi.ts`**

```ts
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  Api172Config,
  AppApi,
  Card,
  CardFilters,
  Customer,
  CustomerFilters,
  ImportResult,
  PaginatedResult,
  Plan,
  PlanImportResult,
} from '../types'

const call = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args)

const on = async <T>(event: string, callback: (payload: T) => void) => {
  const unlisten = await listen<T>(event, eventData => callback(eventData.payload))
  return unlisten
}

export const appApi: AppApi = {
  cards: {
    getAll: filters => call<PaginatedResult<Card>>('cards_get_all', { filters }),
    getById: id => call<Card | null>('cards_get_by_id', { id }),
    create: card => call<Card>('cards_create', { card }),
    update: (id, card) => call<Card>('cards_update', { id, card }),
    delete: id => call<void>('cards_delete', { id }),
    getStats: () => call('cards_get_stats'),
    getMonthlyStats: (year, month) => call('cards_get_monthly_stats', { year, month }),
    getExpiringSoon: days => call<Card[]>('cards_get_expiring_soon', { days }),
  },
  customers: {
    getAll: filters => call<PaginatedResult<Customer>>('customers_get_all', { filters }),
    getById: id => call<Customer | null>('customers_get_by_id', { id }),
    create: customer => call<Customer>('customers_create', { customer }),
    update: (id, customer) => call<Customer>('customers_update', { id, customer }),
    delete: id => call<void>('customers_delete', { id }),
    getCards: id => call<Card[]>('customers_get_cards', { id }),
    findDuplicates: () => call<Customer[][]>('customers_find_duplicates'),
    merge: (keepId, mergeIds) => call<{ merged: number }>('customers_merge', { keepId, mergeIds }),
  },
  finance: {
    getProfitSummary: () => call('finance_get_profit_summary'),
    getMonthlyProfit: year => call('finance_get_monthly_profit', { year }),
    getProfitByCarrier: () => call('finance_get_profit_by_carrier'),
    getProfitByPlanType: () => call('finance_get_profit_by_plan_type'),
  },
  settings: {},
  plans: {
    getAll: () => call<Plan[]>('plans_get_all'),
    import: plans => call<PlanImportResult>('plans_import', { plans }),
    importFromFile: filePath => call<PlanImportResult>('plans_import_from_file', { filePath }),
    match: cardName => call<Plan | null>('plans_match', { cardName }),
    backfillCards: () => call<{ backfilled: number }>('plans_backfill_cards'),
    delete: id => call<void>('plans_delete', { id }),
  },
  backup: {
    export: () => call('backup_export'),
    import: data => call('backup_import', { data }),
  },
  import172: {
    import: rows => call<ImportResult>('import_172', { rows }),
  },
  importHaoyi: {
    import: rows => call<ImportResult>('import_haoyi', { rows }),
  },
  api172: {
    testConnection: (config: Api172Config) => call('api172_test_connection', { config }),
    getProducts: (config: Api172Config) => call('api172_get_products', { config }),
    syncProducts: (config: Api172Config) => call('api172_sync_products', { config }),
    getOrderInfo: (config: Api172Config, orderId: string) => call('api172_get_order_info', { config, orderId }),
  },
  apiConfig: {
    get: () => call('api_config_get'),
    save: config => call<void>('api_config_save', { config }),
  },
  update: {
    check: () => call('update_check'),
    download: () => call('update_download'),
    install: () => call('update_install'),
    onAvailable: callback => on<string>('update:available', callback),
    onNotAvailable: callback => on<null>('update:not-available', () => callback()),
    onProgress: callback => on<number>('update:progress', callback),
    onDownloaded: callback => on<null>('update:downloaded', () => callback()),
    onError: callback => on<string>('update:error', callback),
  },
  notifications: {
    checkNow: () => call<void>('notifications_check_now'),
    onMessage: callback => on<string>('notification:message', callback),
  },
  app: {
    showWindow: () => call<void>('app_show_window'),
    chooseCloseAction: action => call<void>('app_choose_close_action', { action }),
    onCloseRequest: callback => on<null>('app:close-request', () => callback()),
  },
}
```

- [ ] **Step 5: Migrate component imports and calls**

For each component listed in this task, add:

```ts
import { appApi } from '../lib/appApi'
```

Use `import { appApi } from './lib/appApi'` in `src/App.tsx`.

Replace all `window.electronAPI` occurrences with `appApi`.

For event subscription effects in `App.tsx` and `Layout.tsx`, preserve cleanup:

```ts
useEffect(() => {
  let dispose: (() => void) | undefined
  appApi.app.onCloseRequest(() => setShowClosePrompt(true)).then(unlisten => {
    dispose = unlisten
  })
  return () => dispose?.()
}, [])
```

For update event subscriptions in `Layout.tsx`, collect disposers:

```ts
useEffect(() => {
  const disposers: Array<() => void> = []
  appApi.update.onAvailable(version => {
    setUpdateVersion(version)
    setUpdateChecking(false)
    setUpdateDownloading(false)
    setUpdateMessage(`发现新版本 v${version}`)
    setUpdateProgress(0)
  }).then(fn => disposers.push(fn))
  appApi.update.onNotAvailable(() => {
    setUpdateVersion('')
    setUpdateChecking(false)
    setUpdateDownloading(false)
    setUpdateProgress(0)
    setUpdateMessage('当前已是最新版本')
  }).then(fn => disposers.push(fn))
  appApi.update.onProgress(percent => {
    setUpdateProgress(percent)
    setUpdateChecking(false)
    setUpdateDownloading(true)
    setUpdateMessage('')
  }).then(fn => disposers.push(fn))
  appApi.update.onDownloaded(() => {
    setUpdateReady(true)
    setUpdateChecking(false)
    setUpdateDownloading(false)
    setUpdateMessage('更新已下载完成')
  }).then(fn => disposers.push(fn))
  appApi.update.onError(message => {
    setUpdateChecking(false)
    setUpdateDownloading(false)
    setUpdateMessage(message || '检查更新失败')
  }).then(fn => disposers.push(fn))
  return () => disposers.forEach(dispose => dispose())
}, [])
```

- [ ] **Step 6: Verify no direct Electron API calls remain**

Run: `rg "window\.electronAPI|electronAPI" src tests`

Expected: no matches, except none.

- [ ] **Step 7: Run frontend tests and type build**

Run: `npm test -- tests/appApi.test.ts tests/packageConfig.test.ts`

Expected: PASS.

Run: `npm run build:renderer`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src tests package.json package-lock.json vite.config.ts
git commit -m "refactor: route frontend through tauri app api"
```

---

### Task 3: Implement SQLite State, Schema, And Legacy Copy Migration

**Files:**
- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/schema.rs`
- Create: `src-tauri/src/db/migration.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/state.rs`
- Test: `src-tauri/tests/schema_migration.rs`

**Interfaces:**
- Consumes: `AppState` from Task 1.
- Produces: initialized `AppState` with SQLite connection, DB/config paths, and migration-error state.

- [ ] **Step 1: Write failing schema and migration tests**

Create `src-tauri/tests/schema_migration.rs`:

```rust
use rusqlite::Connection;
use std::fs;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;

#[test]
fn initializes_fresh_database_schema() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("traffic-cards.db");
    let conn = Connection::open(&db_path).unwrap();

    db::schema::init_schema(&conn).unwrap();

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('customers','cards','plans')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 3);

    let card_columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(cards)").unwrap();
        stmt.query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    };
    assert!(card_columns.contains(&"external_order_id".to_string()));
    assert!(card_columns.contains(&"renewal_reminder_days".to_string()));
}

#[test]
fn copies_old_database_without_modifying_source() {
    let old_dir = tempfile::tempdir().unwrap();
    let new_dir = tempfile::tempdir().unwrap();
    let old_db = old_dir.path().join("traffic-cards.db");
    let old_config = old_dir.path().join("config.json");
    let new_db = new_dir.path().join("traffic-cards.db");
    let new_config = new_dir.path().join("config.json");

    fs::write(&old_db, b"legacy-db-bytes").unwrap();
    fs::write(&old_config, r#"{"user_id":"u","secret_enc":"cw=="}"#).unwrap();

    db::migration::copy_legacy_files(old_dir.path(), new_dir.path()).unwrap();

    assert_eq!(fs::read(&new_db).unwrap(), b"legacy-db-bytes");
    assert_eq!(fs::read_to_string(&new_config).unwrap(), r#"{"user_id":"u","secret_enc":"cw=="}"#);
    assert_eq!(fs::read(&old_db).unwrap(), b"legacy-db-bytes");
}
```

Add `tempfile = "3"` to `[dev-dependencies]` in `src-tauri/Cargo.toml`.

- [ ] **Step 2: Run test to verify it fails**

Run from `src-tauri`: `cargo test --test schema_migration`

Expected: FAIL because `db::schema` and `db::migration` are not implemented.

- [ ] **Step 3: Implement schema module**

Create `src-tauri/src/db/mod.rs`:

```rust
pub mod migration;
pub mod schema;
```

Create `src-tauri/src/db/schema.rs` with:

```rust
use crate::error::AppResult;
use rusqlite::Connection;

pub fn init_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          wechat TEXT,
          address TEXT,
          notes TEXT,
          tags TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          card_name TEXT NOT NULL,
          carrier TEXT NOT NULL,
          plan_type TEXT NOT NULL,
          monthly_price REAL DEFAULT 0,
          data_amount TEXT,
          region TEXT,
          contract_period INTEGER DEFAULT 0,
          renewal_reminder_days INTEGER DEFAULT 30,
          apply_time TEXT,
          activate_time TEXT,
          promo_start TEXT,
          promo_end TEXT,
          phone_number TEXT,
          customer_id INTEGER,
          profit REAL DEFAULT 0,
          status TEXT DEFAULT '使用中',
          notes TEXT,
          external_order_id TEXT,
          id_card TEXT,
          address TEXT,
          express_company TEXT,
          express_number TEXT,
          first_charge_amount REAL DEFAULT 0,
          source TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE,
          grab_code TEXT,
          name TEXT NOT NULL,
          carrier TEXT,
          monthly_price REAL DEFAULT 0,
          data_amount INTEGER DEFAULT 0,
          promo_period INTEGER DEFAULT 0,
          contract_period INTEGER DEFAULT 0,
          first_charge INTEGER DEFAULT 0,
          activation TEXT,
          region TEXT DEFAULT '全国',
          commission TEXT,
          note TEXT,
          age_limit TEXT,
          forbid_regions TEXT,
          express TEXT,
          source TEXT DEFAULT '号易平台',
          sale_status TEXT DEFAULT '在售',
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
        "#,
    )?;

    add_column_if_missing(conn, "cards", "external_order_id", "TEXT")?;
    add_column_if_missing(conn, "cards", "id_card", "TEXT")?;
    add_column_if_missing(conn, "cards", "address", "TEXT")?;
    add_column_if_missing(conn, "cards", "express_company", "TEXT")?;
    add_column_if_missing(conn, "cards", "express_number", "TEXT")?;
    add_column_if_missing(conn, "cards", "first_charge_amount", "REAL DEFAULT 0")?;
    add_column_if_missing(conn, "cards", "source", "TEXT")?;
    add_column_if_missing(conn, "cards", "region", "TEXT")?;
    add_column_if_missing(conn, "cards", "contract_period", "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "cards", "renewal_reminder_days", "INTEGER DEFAULT 30")?;
    add_column_if_missing(conn, "customers", "tags", "TEXT")?;
    add_column_if_missing(conn, "plans", "age_limit", "TEXT")?;
    add_column_if_missing(conn, "plans", "forbid_regions", "TEXT")?;
    add_column_if_missing(conn, "plans", "express", "TEXT")?;
    add_column_if_missing(conn, "plans", "sale_status", "TEXT DEFAULT '在售'")?;

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_cards_customer_id ON cards(customer_id);
        CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
        CREATE INDEX IF NOT EXISTS idx_cards_promo_end ON cards(promo_end);
        CREATE INDEX IF NOT EXISTS idx_cards_apply_time ON cards(apply_time);
        CREATE INDEX IF NOT EXISTS idx_cards_region ON cards(region);
        CREATE INDEX IF NOT EXISTS idx_plans_name ON plans(name);
        CREATE INDEX IF NOT EXISTS idx_plans_carrier ON plans(carrier);
        "#,
    )?;

    Ok(())
}

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, definition: &str) -> AppResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;

    if !columns.iter().any(|name| name == column) {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))?;
    }
    Ok(())
}
```

- [ ] **Step 4: Implement legacy copy migration**

Create `src-tauri/src/db/migration.rs`:

```rust
use crate::error::AppResult;
use std::fs;
use std::path::{Path, PathBuf};

pub fn old_electron_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|dir| dir.join("traffic-card-manager"))
}

pub fn copy_legacy_files(old_dir: &Path, new_dir: &Path) -> AppResult<()> {
    fs::create_dir_all(new_dir)?;

    let old_db = old_dir.join("traffic-cards.db");
    let new_db = new_dir.join("traffic-cards.db");
    if !new_db.exists() && old_db.exists() {
        fs::copy(&old_db, &new_db)?;
    }

    let old_config = old_dir.join("config.json");
    let new_config = new_dir.join("config.json");
    if !new_config.exists() && old_config.exists() {
        fs::copy(&old_config, &new_config)?;
    }

    Ok(())
}
```

- [ ] **Step 5: Initialize state in Tauri setup**

Modify `src-tauri/src/lib.rs` to include modules:

```rust
mod db;
mod error;
mod state;
```

In `.setup`, resolve app data:

```rust
.setup(|app| {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| Box::<dyn std::error::Error>::from(err))?;
    std::fs::create_dir_all(&app_data_dir)?;

    let migration_error = if let Some(old_dir) = db::migration::old_electron_data_dir() {
        db::migration::copy_legacy_files(&old_dir, &app_data_dir).err().map(|err| err.to_string())
    } else {
        None
    };

    let db_path = app_data_dir.join("traffic-cards.db");
    let config_path = app_data_dir.join("config.json");
    let conn = rusqlite::Connection::open(&db_path)?;
    db::schema::init_schema(&conn)?;

    app.manage(state::AppState {
        db: std::sync::Mutex::new(conn),
        db_path,
        config_path,
        migration_error: std::sync::Mutex::new(migration_error),
    });

    Ok(())
})
```

- [ ] **Step 6: Run tests**

Run from `src-tauri`: `cargo test --test schema_migration`

Expected: PASS.

Run from `src-tauri`: `cargo check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri
git commit -m "feat: initialize sqlite schema and legacy migration"
```

---

### Task 4: Implement Cards And Customers Repositories And Commands

**Files:**
- Modify: `src-tauri/src/models.rs`
- Create: `src-tauri/src/db/cards.rs`
- Create: `src-tauri/src/db/customers.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/cards.rs`
- Create: `src-tauri/src/commands/customers.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/cards_customers.rs`

**Interfaces:**
- Consumes: schema tables from Task 3.
- Produces: card/customer commands used by `appApi.cards` and `appApi.customers`.

- [ ] **Step 1: Write failing Rust integration tests**

Create `src-tauri/tests/cards_customers.rs` with tests ported from `tests/databaseWorkflow.test.ts`:

```rust
use rusqlite::Connection;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;

fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    db::schema::init_schema(&conn).unwrap();
    conn
}

#[test]
fn partial_card_update_preserves_existing_fields() {
    let conn = conn();
    let created = db::cards::create_card(&conn, models::CardInput {
        card_name: Some("福建移动专享卡【29元235G】".into()),
        carrier: Some("移动".into()),
        plan_type: Some("性价比".into()),
        monthly_price: Some(29.0),
        data_amount: Some("235G".into()),
        region: Some("福建·漳州".into()),
        contract_period: Some(24),
        renewal_reminder_days: Some(15),
        apply_time: Some("2026-06-01".into()),
        activate_time: Some("2026-06-02".into()),
        promo_start: Some("2026-06-02".into()),
        promo_end: Some("2026-12-31".into()),
        phone_number: Some("13800138000".into()),
        customer_id: None,
        profit: Some(88.0),
        status: Some("待确认".into()),
        notes: Some("保留备注".into()),
    }).unwrap();

    let updated = db::cards::update_card(&conn, created.id, models::CardInput {
        status: Some("使用中".into()),
        ..Default::default()
    }).unwrap();

    assert_eq!(updated.status, "使用中");
    assert_eq!(updated.card_name, "福建移动专享卡【29元235G】");
    assert_eq!(updated.phone_number.unwrap(), "13800138000");
    assert_eq!(updated.region.unwrap(), "福建·漳州");
    assert_eq!(updated.profit, 88.0);
    assert_eq!(updated.notes.unwrap(), "保留备注");
}

#[test]
fn customer_merge_moves_cards_and_deletes_duplicates() {
    let conn = conn();
    let keep = db::customers::create_customer(&conn, models::CustomerInput {
        name: Some("张三".into()),
        phone: Some("13800138000".into()),
        ..Default::default()
    }).unwrap();
    let duplicate = db::customers::create_customer(&conn, models::CustomerInput {
        name: Some("张三".into()),
        phone: Some("13800138000".into()),
        ..Default::default()
    }).unwrap();

    let card = db::cards::create_card(&conn, models::CardInput {
        card_name: Some("测试卡29元100G".into()),
        carrier: Some("移动".into()),
        plan_type: Some("性价比".into()),
        customer_id: Some(duplicate.id),
        ..Default::default()
    }).unwrap();

    let result = db::customers::merge_customers(&conn, keep.id, vec![duplicate.id]).unwrap();
    let moved = db::cards::get_card_by_id(&conn, card.id).unwrap().unwrap();
    let deleted = db::customers::get_customer_by_id(&conn, duplicate.id).unwrap();

    assert_eq!(result.merged, 1);
    assert_eq!(moved.customer_id, Some(keep.id));
    assert!(deleted.is_none());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `src-tauri`: `cargo test --test cards_customers`

Expected: FAIL because models and db modules are missing.

- [ ] **Step 3: Implement model structs**

Create `src-tauri/src/models.rs` with serializable structs matching `src/types/index.ts`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginatedResult<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Card {
    pub id: i64,
    pub card_name: String,
    pub carrier: String,
    pub plan_type: String,
    pub monthly_price: f64,
    pub data_amount: Option<String>,
    pub region: Option<String>,
    pub contract_period: Option<i64>,
    pub renewal_reminder_days: Option<i64>,
    pub apply_time: Option<String>,
    pub activate_time: Option<String>,
    pub promo_start: Option<String>,
    pub promo_end: Option<String>,
    pub phone_number: Option<String>,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub profit: f64,
    pub status: String,
    pub notes: Option<String>,
    pub external_order_id: Option<String>,
    pub id_card: Option<String>,
    pub address: Option<String>,
    pub express_company: Option<String>,
    pub express_number: Option<String>,
    pub first_charge_amount: Option<f64>,
    pub source: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CardInput {
    pub card_name: Option<String>,
    pub carrier: Option<String>,
    pub plan_type: Option<String>,
    pub monthly_price: Option<f64>,
    pub data_amount: Option<String>,
    pub region: Option<String>,
    pub contract_period: Option<i64>,
    pub renewal_reminder_days: Option<i64>,
    pub apply_time: Option<String>,
    pub activate_time: Option<String>,
    pub promo_start: Option<String>,
    pub promo_end: Option<String>,
    pub phone_number: Option<String>,
    pub customer_id: Option<i64>,
    pub profit: Option<f64>,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub wechat: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub card_count: Option<i64>,
    pub total_profit: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CustomerInput {
    pub name: Option<String>,
    pub phone: Option<String>,
    pub wechat: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CardFilters {
    pub status: Option<String>,
    pub carrier: Option<String>,
    pub plan_type: Option<String>,
    pub search: Option<String>,
    pub page: Option<i64>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CustomerFilters {
    pub search: Option<String>,
    pub tag: Option<String>,
    pub page: Option<i64>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MergeResult {
    pub merged: usize,
}
```

Add remaining model structs in later tasks to the same file.

- [ ] **Step 4: Implement card repository**

Create `src-tauri/src/db/cards.rs` implementing:

```rust
pub fn get_cards(conn: &Connection, filters: Option<CardFilters>) -> AppResult<PaginatedResult<Card>>;
pub fn get_card_by_id(conn: &Connection, id: i64) -> AppResult<Option<Card>>;
pub fn create_card(conn: &Connection, input: CardInput) -> AppResult<Card>;
pub fn update_card(conn: &Connection, id: i64, input: CardInput) -> AppResult<Card>;
pub fn delete_card(conn: &Connection, id: i64) -> AppResult<()>;
pub fn get_card_stats(conn: &Connection) -> AppResult<CardStats>;
pub fn get_monthly_stats(conn: &Connection, year: i64, month: i64) -> AppResult<MonthlyStats>;
pub fn get_expiring_soon(conn: &Connection, days: i64) -> AppResult<Vec<Card>>;
```

Implement the SQL from `electron/database.ts` methods `getCards`, `getCardById`, `createCard`, `updateCard`, `deleteCard`, `getCardStats`, `getMonthlyStats`, and `getExpiringSoon` with these exact observable behaviors:

```text
status/carrier/plan_type value "全部" disables that filter
search covers c.card_name, c.phone_number, cu.name, c.region, c.notes
page defaults to 1
pageSize defaults to 50
updateCard merges input over existing row before writing
customer_id writes NULL when absent
profit/monthly_price/contract_period default to 0
renewal_reminder_days defaults to 30
status defaults to 使用中
```

- [ ] **Step 5: Add search and customer tests, then implement customer repository**

Extend `src-tauri/tests/cards_customers.rs` with:

```rust
#[test]
fn cards_search_covers_package_customer_phone_region_and_notes() {
    let conn = conn();
    let customer = db::customers::create_customer(&conn, models::CustomerInput {
        name: Some("漳州客户".into()),
        phone: Some("13800138000".into()),
        ..Default::default()
    }).unwrap();
    db::cards::create_card(&conn, models::CardInput {
        card_name: Some("福建移动专享卡【29元235G】".into()),
        carrier: Some("移动".into()),
        plan_type: Some("性价比".into()),
        region: Some("福建·漳州".into()),
        notes: Some("搜索备注".into()),
        customer_id: Some(customer.id),
        ..Default::default()
    }).unwrap();

    for search in ["福建移动", "漳州客户", "13800138000", "福建·漳州", "搜索备注"] {
        let result = db::cards::get_cards(&conn, Some(models::CardFilters {
            search: Some(search.into()),
            status: None,
            carrier: None,
            plan_type: None,
            page: Some(1),
            page_size: Some(50),
        })).unwrap();
        assert_eq!(result.total, 1, "search {search} should match");
    }
}
```

Create `src-tauri/src/db/customers.rs` implementing:

```rust
pub fn get_customers(conn: &Connection, filters: Option<CustomerFilters>) -> AppResult<PaginatedResult<Customer>>;
pub fn get_customer_by_id(conn: &Connection, id: i64) -> AppResult<Option<Customer>>;
pub fn create_customer(conn: &Connection, input: CustomerInput) -> AppResult<Customer>;
pub fn update_customer(conn: &Connection, id: i64, input: CustomerInput) -> AppResult<Customer>;
pub fn delete_customer(conn: &Connection, id: i64) -> AppResult<()>;
pub fn get_customer_cards(conn: &Connection, customer_id: i64) -> AppResult<Vec<Card>>;
pub fn find_duplicate_customers(conn: &Connection) -> AppResult<Vec<Vec<Customer>>>;
pub fn merge_customers(conn: &Connection, keep_id: i64, merge_ids: Vec<i64>) -> AppResult<MergeResult>;
```

Implement the SQL and grouping behavior from `electron/database.ts` methods `getCustomers`, `getCustomerById`, `createCustomer`, `updateCustomer`, `deleteCustomer`, `getCustomerCards`, `findDuplicateCustomers`, and `mergeCustomers`. The repository is complete when the two tests in this task pass and the command functions compile.

- [ ] **Step 6: Add card/customer commands**

Create command modules that lock `AppState.db` and call repositories:

```rust
#[tauri::command]
pub fn cards_get_all(state: tauri::State<'_, AppState>, filters: Option<CardFilters>) -> AppResult<PaginatedResult<Card>> {
    let conn = state.db.lock().map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::get_cards(&conn, filters)
}
```

Use this pattern for every cards/customers command listed in the Interfaces section.

Register commands in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::cards::cards_get_all,
    commands::cards::cards_get_by_id,
    commands::cards::cards_create,
    commands::cards::cards_update,
    commands::cards::cards_delete,
    commands::cards::cards_get_stats,
    commands::cards::cards_get_monthly_stats,
    commands::cards::cards_get_expiring_soon,
    commands::customers::customers_get_all,
    commands::customers::customers_get_by_id,
    commands::customers::customers_create,
    commands::customers::customers_update,
    commands::customers::customers_delete,
    commands::customers::customers_get_cards,
    commands::customers::customers_find_duplicates,
    commands::customers::customers_merge,
])
```

- [ ] **Step 7: Run tests**

Run from `src-tauri`: `cargo test --test cards_customers`

Expected: PASS.

Run from `src-tauri`: `cargo check`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri
git commit -m "feat: port card and customer data access"
```

---

### Task 5: Implement Plans, Matching, Backfill, Imports, Backup, Finance, API Config, And 172 API

**Files:**
- Modify: `src-tauri/src/models.rs`
- Create: `src-tauri/src/db/plans.rs`
- Create: `src-tauri/src/db/imports.rs`
- Create: `src-tauri/src/db/backup.rs`
- Create: `src-tauri/src/db/finance.rs`
- Create: `src-tauri/src/config_store.rs`
- Create: `src-tauri/src/api172.rs`
- Create: `src-tauri/src/commands/plans.rs`
- Create: `src-tauri/src/commands/imports.rs`
- Create: `src-tauri/src/commands/backup.rs`
- Create: `src-tauri/src/commands/finance.rs`
- Create: `src-tauri/src/commands/api.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/plans_imports.rs`
- Test: `src-tauri/tests/backup_finance.rs`

**Interfaces:**
- Consumes: card/customer repositories from Task 4.
- Produces: remaining business commands required by Settings, PlanList, Dashboard, and FinanceStats.

- [ ] **Step 1: Write failing plan/import tests**

Create `src-tauri/tests/plans_imports.rs` by porting the workflow tests from `tests/databaseWorkflow.test.ts`:

```rust
use rusqlite::Connection;
use serde_json::json;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;

fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    db::schema::init_schema(&conn).unwrap();
    conn
}

#[test]
fn reimporting_same_172_order_updates_pending_record() {
    let conn = conn();
    let pending = vec![json!({
        "订单状态": "已发货",
        "激活状态": "",
        "172订单号": "172-A001",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "0",
        "首充金额": "",
        "姓名": "张三",
        "按号码发货": "13800138000",
        "省份": "福建",
        "城市": "漳州",
        "县区": "芗城区",
        "详细地址": "测试路1号",
        "下单时间": "2026-06-01"
    })];
    let settled = vec![json!({
        "订单状态": "已结算",
        "激活状态": "已激活",
        "172订单号": "172-A001",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "100",
        "首充金额": "50",
        "姓名": "张三",
        "按号码发货": "13800138000",
        "省份": "福建",
        "城市": "漳州",
        "县区": "芗城区",
        "详细地址": "测试路1号",
        "下单时间": "2026-06-01",
        "激活时间": "2026-06-10",
        "物流公司": "顺丰",
        "运单号": "SF123"
    })];

    assert_eq!(db::imports::import_from_172(&conn, pending).unwrap().imported, 1);
    let result = db::imports::import_from_172(&conn, settled).unwrap();
    let cards = db::cards::get_cards(&conn, None).unwrap().data;

    assert_eq!(result.updated, 1);
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].external_order_id.as_deref(), Some("172-A001"));
    assert_eq!(cards[0].status, "使用中");
    assert_eq!(cards[0].activate_time.as_deref(), Some("2026-06-10"));
    assert_eq!(cards[0].profit, 94.0);
}

#[test]
fn plan_backfill_preserves_manual_fields() {
    let conn = conn();
    let created = db::cards::create_card(&conn, models::CardInput {
        card_name: Some("回填保护测试移动卡【29元235G】".into()),
        carrier: Some("移动".into()),
        plan_type: Some("性价比".into()),
        monthly_price: Some(29.0),
        data_amount: Some("235G".into()),
        region: Some("福建".into()),
        contract_period: Some(12),
        promo_start: Some("2026-06-10".into()),
        promo_end: Some("2026-10-31".into()),
        activate_time: Some("2026-06-10".into()),
        status: Some("使用中".into()),
        ..Default::default()
    }).unwrap();

    db::plans::import_plans(&conn, vec![json!({
        "code": "P002",
        "name": "回填保护测试移动卡【29元235G】",
        "carrier": "移动",
        "monthlyPrice": 29,
        "dataAmount": 235,
        "promoPeriod": 6,
        "contractPeriod": 24,
        "firstCharge": 50,
        "status": "在售"
    })]).unwrap();

    let updated = db::cards::get_card_by_id(&conn, created.id).unwrap().unwrap();
    assert_eq!(updated.contract_period, Some(12));
    assert_eq!(updated.promo_start.as_deref(), Some("2026-06-10"));
    assert_eq!(updated.promo_end.as_deref(), Some("2026-10-31"));
}
```

- [ ] **Step 2: Write failing backup/finance/config test**

Create `src-tauri/tests/backup_finance.rs`:

```rust
use rusqlite::Connection;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;

fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    db::schema::init_schema(&conn).unwrap();
    conn
}

#[test]
fn backup_export_import_round_trips_cards_and_customers() {
    let source = conn();
    let customer = db::customers::create_customer(&source, models::CustomerInput {
        name: Some("张三".into()),
        phone: Some("13800138000".into()),
        ..Default::default()
    }).unwrap();
    db::cards::create_card(&source, models::CardInput {
        card_name: Some("测试卡29元100G".into()),
        carrier: Some("移动".into()),
        plan_type: Some("性价比".into()),
        customer_id: Some(customer.id),
        profit: Some(88.0),
        ..Default::default()
    }).unwrap();

    let backup = db::backup::export_data(&source).unwrap();
    let target = conn();
    let result = db::backup::import_data(&target, backup).unwrap();

    assert_eq!(result["cards"], 1);
    assert_eq!(result["customers"], 1);
    assert_eq!(db::cards::get_cards(&target, None).unwrap().total, 1);
}

#[test]
fn finance_summary_counts_profit() {
    let conn = conn();
    db::cards::create_card(&conn, models::CardInput {
        card_name: Some("测试卡29元100G".into()),
        carrier: Some("移动".into()),
        plan_type: Some("性价比".into()),
        profit: Some(88.0),
        apply_time: Some("2026-07-01".into()),
        status: Some("使用中".into()),
        ..Default::default()
    }).unwrap();

    let summary = db::finance::get_profit_summary(&conn).unwrap();
    assert_eq!(summary.total_profit, 88.0);
    assert_eq!(summary.total_cards, 1);
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run from `src-tauri`: `cargo test --test plans_imports --test backup_finance`

Expected: FAIL because modules are missing.

- [ ] **Step 4: Add remaining model structs**

Extend `src-tauri/src/models.rs` with:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CardStats {
    pub total: i64,
    pub active: i64,
    pub expired: i64,
    pub cancelled: i64,
    #[serde(rename = "totalProfit")]
    pub total_profit: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonthlyStats {
    #[serde(rename = "newCards")]
    pub new_cards: i64,
    #[serde(rename = "monthProfit")]
    pub month_profit: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfitSummary {
    #[serde(rename = "totalProfit")]
    pub total_profit: f64,
    #[serde(rename = "avgProfit")]
    pub avg_profit: f64,
    #[serde(rename = "totalCards")]
    pub total_cards: i64,
    #[serde(rename = "monthProfit")]
    pub month_profit: f64,
    #[serde(rename = "monthCards")]
    pub month_cards: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonthlyProfitRow {
    pub month: String,
    pub profit: f64,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfitByType {
    pub carrier: Option<String>,
    pub plan_type: Option<String>,
    pub profit: f64,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Plan {
    pub id: i64,
    pub code: Option<String>,
    pub grab_code: Option<String>,
    pub name: String,
    pub carrier: Option<String>,
    pub monthly_price: f64,
    pub data_amount: i64,
    pub promo_period: i64,
    pub contract_period: i64,
    pub first_charge: i64,
    pub activation: Option<String>,
    pub region: Option<String>,
    pub commission: Option<String>,
    pub note: Option<String>,
    pub age_limit: Option<String>,
    pub forbid_regions: Option<String>,
    pub express: Option<String>,
    pub source: Option<String>,
    pub sale_status: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportResult {
    pub imported: i64,
    pub updated: i64,
    pub skipped: i64,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanImportResult {
    pub imported: i64,
    pub updated: i64,
    pub backfilled: i64,
    pub total: i64,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Api172Config {
    pub user_id: String,
    pub secret: String,
}
```

- [ ] **Step 5: Add parser/matcher cases, then implement plans repository**

Extend `src-tauri/tests/plans_imports.rs` with:

```rust
#[test]
fn plan_matching_rejects_similar_name_when_price_and_data_differ() {
    let conn = conn();
    db::plans::import_plans(&conn, vec![json!({
        "code": "P004",
        "name": "福建移动专享卡【59元80G+100分钟】仅发厦门",
        "carrier": "移动",
        "monthlyPrice": 59,
        "dataAmount": 80,
        "promoPeriod": 0,
        "contractPeriod": 0,
        "firstCharge": 50,
        "region": "厦门",
        "status": "在售"
    })]).unwrap();

    let matched = db::plans::match_plan(&conn, "福建移动专享卡【29元235G】").unwrap();
    assert!(matched.is_none());
}

#[test]
fn promo_end_calculation_matches_existing_month_end_behavior() {
    assert_eq!(db::plans::calculate_promo_end("2026-05-15", 6), "2026-10-31");
    assert_eq!(db::plans::calculate_promo_end("2026-01-31", 1), "2026-02-28");
    assert_eq!(db::plans::calculate_promo_end("2028-01-31", 1), "2028-02-29");
    assert_eq!(db::plans::calculate_promo_end("", 6), "");
    assert_eq!(db::plans::calculate_promo_end("2026-05-15", 0), "");
}
```

Create `src-tauri/src/db/plans.rs` implementing:

```rust
pub fn import_plans(conn: &Connection, plans: Vec<serde_json::Value>) -> AppResult<PlanImportResult>;
pub fn import_plans_from_file(conn: &Connection, app_handle: &tauri::AppHandle, file_path: String) -> AppResult<PlanImportResult>;
pub fn get_all_plans(conn: &Connection) -> AppResult<Vec<Plan>>;
pub fn match_plan(conn: &Connection, card_name: &str) -> AppResult<Option<Plan>>;
pub fn backfill_card_plan_fields(conn: &Connection) -> AppResult<i64>;
pub fn delete_plan(conn: &Connection, id: i64) -> AppResult<()>;
```

Implement behavior from `electron/database.ts` methods `importPlans`, `importPlansFromFile`, `syncPlansFrom172Api`, `getAllPlans`, `matchPlan`, `deletePlan`, `backfillCardPlanFields`, `calculatePromoEnd`, `parseMonthlyPrice`, and helper code used by plan matching. Export `calculate_promo_end(start_time: &str, promo_months: i64) -> String` so the test above can pin the date behavior.

Preserve:

```text
Existing promo_period and contract_period are not cleared by imports missing those fields.
Fuzzy matching rejects similar plans when price or data differ.
Backfill never overwrites manually filled promo_start, promo_end, or contract_period.
Imported source labels remain compatible with 172号卡平台 and 号易平台.
```

- [ ] **Step 6: Add import status/parser cases, then implement imports repository**

Extend `src-tauri/tests/plans_imports.rs` with:

```rust
#[test]
fn imported_pending_status_does_not_regress_active_172_order() {
    let conn = conn();
    let pending = json!({
        "订单状态": "已发货",
        "激活状态": "",
        "172订单号": "172-A002",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "0",
        "姓名": "王五",
        "按号码发货": "13700137000",
        "省份": "福建",
        "城市": "泉州",
        "下单时间": "2026-06-01"
    });
    let settled = json!({
        "订单状态": "已结算",
        "激活状态": "已激活",
        "172订单号": "172-A002",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "100",
        "姓名": "王五",
        "按号码发货": "13700137000",
        "省份": "福建",
        "城市": "泉州",
        "下单时间": "2026-06-01",
        "激活时间": "2026-06-10"
    });

    db::imports::import_from_172(&conn, vec![pending.clone()]).unwrap();
    db::imports::import_from_172(&conn, vec![settled]).unwrap();
    db::imports::import_from_172(&conn, vec![pending]).unwrap();

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].status, "使用中");
    assert_eq!(cards[0].activate_time.as_deref(), Some("2026-06-10"));
    assert_eq!(cards[0].profit, 94.0);
}

#[test]
fn imported_haoyi_duplicate_order_updates_pending_record() {
    let conn = conn();
    let pending = json!({
        "上游订单状态": "已发货",
        "订单号": "HY-A001",
        "商品名称": "号易联通卡29元100G",
        "运营商": "联通",
        "订单金额": "0",
        "首充金额": "",
        "用户姓名": "李四",
        "生产号码": "'13900139000",
        "省": "福建",
        "市": "厦门",
        "区": "思明区",
        "街道": "测试路2号"
    });
    let activated = json!({
        "上游订单状态": "已激活",
        "订单号": "HY-A001",
        "商品名称": "号易联通卡29元100G",
        "运营商": "联通",
        "订单金额": "50",
        "首充金额": "30",
        "用户姓名": "李四",
        "生产号码": "'13900139000",
        "省": "福建",
        "市": "厦门",
        "区": "思明区",
        "街道": "测试路2号",
        "快递名称": "京东",
        "物流单号": "JD123"
    });

    assert_eq!(db::imports::import_from_haoyi(&conn, vec![pending]).unwrap().imported, 1);
    assert_eq!(db::imports::import_from_haoyi(&conn, vec![activated]).unwrap().updated, 1);
    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards[0].external_order_id.as_deref(), Some("HY-A001"));
    assert_eq!(cards[0].status, "使用中");
    assert_eq!(cards[0].profit, 47.0);
    assert_eq!(cards[0].express_company.as_deref(), Some("京东"));
    assert_eq!(cards[0].express_number.as_deref(), Some("JD123"));
}
```

Create `src-tauri/src/db/imports.rs` implementing:

```rust
pub fn import_from_172(conn: &Connection, rows: Vec<serde_json::Value>) -> AppResult<ImportResult>;
pub fn import_from_haoyi(conn: &Connection, rows: Vec<serde_json::Value>) -> AppResult<ImportResult>;
```

Implement behavior from `electron/database.ts` methods `importFrom172`, `importFromHaoyi`, `excelDateToString`, `parseCarrier`, `parsePlanType`, `parseDataAmount`, `parseMonthlyPrice`, `isMaskedPhone`, `formatRegion`, `extractRegion`, and `mergeImportedStatus`.

Preserve:

```text
172 rows with 订单状态 已撤单 or 审核不通过 are skipped.
Haoyi rows with 上游订单状态 开卡失败 or 已取消 are skipped.
Duplicate external_order_id updates the existing card instead of inserting.
待确认 import status never regresses an existing non-待确认 status.
已注销 existing status is preserved unless imported status is 已注销.
Profit = order amount * 0.94 rounded to two decimals.
Masked phone values are not stored on new customer phone.
```

- [ ] **Step 7: Implement backup and finance modules**

Create `src-tauri/src/db/backup.rs`:

```rust
pub fn export_data(conn: &Connection) -> AppResult<serde_json::Value>;
pub fn import_data(conn: &Connection, data: serde_json::Value) -> AppResult<serde_json::Value>;
```

The JSON shape must remain:

```json
{
  "cards": [],
  "customers": []
}
```

Create `src-tauri/src/db/finance.rs`:

```rust
pub fn get_profit_summary(conn: &Connection) -> AppResult<ProfitSummary>;
pub fn get_monthly_profit(conn: &Connection, year: i64) -> AppResult<Vec<MonthlyProfitRow>>;
pub fn get_profit_by_carrier(conn: &Connection) -> AppResult<Vec<ProfitByType>>;
pub fn get_profit_by_plan_type(conn: &Connection) -> AppResult<Vec<ProfitByType>>;
```

Port SQL from `electron/database.ts` methods with the same names.

- [ ] **Step 8: Implement API config and 172 API client**

Create `src-tauri/src/config_store.rs`:

```rust
use crate::error::AppResult;
use crate::models::Api172Config;
use base64::Engine;
use std::path::Path;

pub fn get_api_config(config_path: &Path) -> AppResult<Api172Config> {
    if !config_path.exists() {
        return Ok(Api172Config { user_id: String::new(), secret: String::new() });
    }
    let value: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(config_path)?)?;
    let user_id = value.get("user_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let secret = if let Some(encoded) = value.get("secret_enc").and_then(|v| v.as_str()) {
        let decoded = base64::engine::general_purpose::STANDARD.decode(encoded).unwrap_or_default();
        String::from_utf8(decoded).unwrap_or_default()
    } else {
        value.get("secret").and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    Ok(Api172Config { user_id, secret })
}

pub fn save_api_config(config_path: &Path, config: Api172Config) -> AppResult<()> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let secret_enc = base64::engine::general_purpose::STANDARD.encode(config.secret.as_bytes());
    let value = serde_json::json!({ "user_id": config.user_id, "secret_enc": secret_enc });
    std::fs::write(config_path, serde_json::to_string_pretty(&value)?)?;
    Ok(())
}
```

Create `src-tauri/src/api172.rs` implementing:

```rust
pub async fn test_connection(config: Api172Config) -> AppResult<serde_json::Value>;
pub async fn get_products(config: Api172Config, product_id: Option<String>) -> AppResult<serde_json::Value>;
pub async fn get_order_info(config: Api172Config, order_id: String) -> AppResult<serde_json::Value>;
```

Port signing from `electron/api172.ts`:

```text
BASE_URL = https://haokaopenapi.lot-ml.com
timestamp is 10-digit Unix seconds
sort params by key
sign string is key=value&...&secret=SECRET
MD5 is lowercase hex
POST body is application/x-www-form-urlencoded with user_sign appended
```

- [ ] **Step 9: Add commands and register them**

Implement command modules for:

```text
plans_get_all
plans_import
plans_import_from_file
plans_match
plans_backfill_cards
plans_delete
backup_export
backup_import
import_172
import_haoyi
finance_get_profit_summary
finance_get_monthly_profit
finance_get_profit_by_carrier
finance_get_profit_by_plan_type
api172_test_connection
api172_get_products
api172_sync_products
api172_get_order_info
api_config_get
api_config_save
```

Register all commands in `src-tauri/src/lib.rs` `generate_handler!`.

- [ ] **Step 10: Run tests**

Run from `src-tauri`: `cargo test --test plans_imports --test backup_finance`

Expected: PASS.

Run from `src-tauri`: `cargo test`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src-tauri
git commit -m "feat: port sqlite business workflows"
```

---

### Task 6: Implement Desktop Tray, Close Flow, Notifications, Expiry Timer, And Update Stub

**Files:**
- Create: `src-tauri/src/desktop.rs`
- Modify: `src-tauri/src/commands/api.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Test: `src-tauri/tests/desktop_commands.rs`

**Interfaces:**
- Consumes: `db::cards::get_expiring_soon`, Tauri event names, and `appApi.update`.
- Produces: desktop behavior equivalent to Electron tray/close/notification/update placeholder.

- [ ] **Step 1: Write failing update-stub command test**

Create `src-tauri/tests/desktop_commands.rs`:

```rust
#[path = "../src/commands/api.rs"]
mod api_commands;
#[path = "../src/error.rs"]
mod error;

#[tokio::test]
async fn update_commands_return_compatibility_message() {
    let check = api_commands::update_check().await.unwrap();
    let download = api_commands::update_download().await.unwrap();
    let install = api_commands::update_install().await.unwrap();

    assert_eq!(check.ok, false);
    assert_eq!(check.message.as_deref(), Some("Tauri 自动更新将在后续版本接入"));
    assert_eq!(download.message.as_deref(), Some("Tauri 自动更新将在后续版本接入"));
    assert_eq!(install.message.as_deref(), Some("Tauri 自动更新将在后续版本接入"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `src-tauri`: `cargo test --test desktop_commands`

Expected: FAIL because update commands are missing.

- [ ] **Step 3: Implement updater compatibility commands**

In `src-tauri/src/models.rs` add:

```rust
#[derive(Debug, serde::Serialize)]
pub struct UpdateResult {
    pub ok: bool,
    pub message: Option<String>,
}
```

In `src-tauri/src/commands/api.rs` add:

```rust
use crate::error::AppResult;
use crate::models::UpdateResult;

fn update_stub() -> UpdateResult {
    UpdateResult {
        ok: false,
        message: Some("Tauri 自动更新将在后续版本接入".to_string()),
    }
}

#[tauri::command]
pub async fn update_check() -> AppResult<UpdateResult> {
    Ok(update_stub())
}

#[tauri::command]
pub async fn update_download() -> AppResult<UpdateResult> {
    Ok(update_stub())
}

#[tauri::command]
pub async fn update_install() -> AppResult<UpdateResult> {
    Ok(update_stub())
}
```

- [ ] **Step 4: Implement app close/show and notification commands**

In `src-tauri/src/commands/api.rs` add:

```rust
#[tauri::command]
pub fn app_show_window(app: tauri::AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|err| crate::error::AppError::Message(err.to_string()))?;
        window.set_focus().map_err(|err| crate::error::AppError::Message(err.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn app_choose_close_action(app: tauri::AppHandle, state: tauri::State<'_, crate::desktop::DesktopState>, action: String) -> AppResult<()> {
    crate::desktop::choose_close_action(&app, &state, &action)
}

#[tauri::command]
pub fn notifications_check_now(app: tauri::AppHandle, state: tauri::State<'_, crate::state::AppState>) -> AppResult<()> {
    crate::desktop::check_expiry_notifications(&app, &state, true)
}
```

- [ ] **Step 5: Implement desktop module**

Create `src-tauri/src/desktop.rs`:

```rust
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct DesktopState {
    close_action: Mutex<Option<String>>,
    notified_cards: Mutex<HashMap<i64, i64>>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            close_action: Mutex::new(None),
            notified_cards: Mutex::new(HashMap::new()),
        }
    }
}

pub fn choose_close_action(app: &AppHandle, state: &DesktopState, action: &str) -> AppResult<()> {
    *state.close_action.lock().map_err(|_| AppError::Message("关闭状态锁已损坏".into()))? = Some(action.to_string());
    if let Some(window) = app.get_webview_window("main") {
        if action == "minimize" {
            window.hide().map_err(|err| AppError::Message(err.to_string()))?;
        } else if action == "quit" {
            app.exit(0);
        }
    }
    Ok(())
}

pub fn check_expiry_notifications(app: &AppHandle, app_state: &AppState, manual: bool) -> AppResult<()> {
    let conn = app_state.db.lock().map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    let cards = crate::db::cards::get_expiring_soon(&conn, 30)?;
    if cards.is_empty() && manual {
        app.emit("notification:message", "暂无即将到期的卡片")
            .map_err(|err| AppError::Message(err.to_string()))?;
    }
    Ok(())
}
```

Complete the module by implementing these behaviors in `setup_desktop(app: AppHandle) -> AppResult<()>`:

```text
create tray menu: 显示主窗口, 立即检查到期提醒, 退出
double-click tray icon restores and focuses main window
window close event emits app:close-request and prevents close unless action is quit
startup timer waits 5 minutes, then repeats every 30 minutes
native notification uses tauri-plugin-notification when supported
manual notification sends frontend message if no cards exist
```

- [ ] **Step 6: Register desktop state and hooks**

In `src-tauri/src/lib.rs`:

```rust
mod desktop;
```

In setup after `AppState`:

```rust
app.manage(desktop::DesktopState::default());
desktop::setup_desktop(app.handle().clone())?;
```

Register commands:

```rust
commands::api::update_check,
commands::api::update_download,
commands::api::update_install,
commands::api::app_show_window,
commands::api::app_choose_close_action,
commands::api::notifications_check_now,
```

- [ ] **Step 7: Run tests and compile**

Run from `src-tauri`: `cargo test --test desktop_commands`

Expected: PASS.

Run from `src-tauri`: `cargo check`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri
git commit -m "feat: add tauri desktop integration"
```

---

### Task 7: Remove Electron Runtime, Update Tests And Documentation

**Files:**
- Delete: `electron/main.ts`
- Delete: `electron/preload.ts`
- Delete: `electron/database.ts`
- Delete: `electron/cardSql.ts`
- Delete: `electron/api172.ts`
- Delete: `electron/`
- Delete: `scripts/build.js`
- Delete: `scripts/update-win-icon.js`
- Delete: `scripts/create-portable-zip.js`
- Modify: `tests/database.test.ts`
- Modify: `tests/databaseWorkflow.test.ts`
- Modify: `tests/cardSql.test.ts`
- Modify: `README.md`
- Modify: `用户使用说明.md`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: completed Tauri/Rust behavior and tests.
- Produces: repository with no Electron runtime or sql.js app dependency.

- [ ] **Step 1: Write failing cleanup checks**

Run: `rg "electron|sql\.js|dist-electron|electronAPI|vite-plugin-electron|electron-builder|electron-updater" package.json vite.config.ts src tests README.md 用户使用说明.md .github`

Expected before cleanup: matches exist.

- [ ] **Step 2: Remove Electron source and scripts**

Delete the Electron runtime files and obsolete scripts listed in this task. `scripts/create-portable-zip.js` is deleted in this migration; portable zip packaging is a follow-up after the Tauri installer is stable.

- [ ] **Step 3: Update TypeScript tests**

Replace `tests/databaseWorkflow.test.ts` with a short pointer test that prevents reintroducing Electron imports:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('database workflow coverage location', () => {
  it('keeps SQLite workflow coverage in Rust integration tests', () => {
    const rustTests = [
      'src-tauri/tests/cards_customers.rs',
      'src-tauri/tests/plans_imports.rs',
      'src-tauri/tests/backup_finance.rs',
    ]
    for (const relative of rustTests) {
      expect(fs.existsSync(path.resolve(__dirname, '..', relative))).toBe(true)
    }
  })
})
```

Delete `tests/cardSql.test.ts`; search/write-field behavior is covered by `cards_search_covers_package_customer_phone_region_and_notes` and `partial_card_update_preserves_existing_fields` in `src-tauri/tests/cards_customers.rs`.

Delete `tests/database.test.ts`; parser/status/price/date behavior is covered by `src-tauri/tests/plans_imports.rs`.

- [ ] **Step 4: Update docs**

In `README.md`, update:

```text
技术栈: Tauri + React + TypeScript + Tailwind CSS + SQLite
开发: npm install; npm run dev
打包: npm run build
数据存储: Tauri app data directory contains traffic-cards.db
自动更新: Tauri 版本暂保留检查更新入口，真实自动更新后续接入
```

Remove Electron-specific release instructions that depend on `electron-builder`, `latest.yml`, and `blockmap`.

- [ ] **Step 5: Update release workflow**

Modify `.github/workflows/release.yml`. Add Rust setup before `npm ci`:

```yaml
- name: Setup Rust
  uses: dtolnay/rust-toolchain@stable
```

Replace the Electron publish build step:

```yaml
- name: Build Windows installer
  run: npm run build
```

Delete the `Upload portable zip` step. Replace workflow artifact paths with:

```yaml
path: |
  src-tauri/target/release/bundle/nsis/*.exe
```

- [ ] **Step 6: Verify cleanup**

Run: `rg "window\.electronAPI|electronAPI|vite-plugin-electron|electron-builder|electron-updater|dist-electron|sql\.js" package.json vite.config.ts src tests README.md 用户使用说明.md .github`

Expected: no matches.

Run: `npm test`

Expected: PASS.

Run from `src-tauri`: `cargo test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove electron runtime"
```

---

### Task 8: Final Build, Smoke Verification, And Release Artifact Check

**Files:**
- Modify: `README.md` if verification reveals command corrections.
- Modify: `src-tauri/tauri.conf.json` if bundle resource or icon paths need correction.
- Modify: `package.json` if scripts need correction.

**Interfaces:**
- Consumes: full migrated app from Tasks 1-7.
- Produces: verified Tauri build and documented residual risks.

- [ ] **Step 1: Run full frontend tests**

Run: `npm test`

Expected: PASS with all Vitest suites.

- [ ] **Step 2: Run full Rust tests**

Run from `src-tauri`: `cargo test`

Expected: PASS with all unit and integration tests.

- [ ] **Step 3: Run renderer build**

Run: `npm run build:renderer`

Expected: PASS and `dist/` is generated.

- [ ] **Step 4: Run Tauri build**

Run: `npm run build`

Expected: PASS and Windows bundle artifacts are generated under `src-tauri/target/release/bundle/`.

- [ ] **Step 5: Run local app smoke test**

Run: `npm run dev`

Manual checks:

```text
Main window opens at 1400x900 minimum 1200x800.
Sidebar renders without layout breakage.
Update check displays Tauri 自动更新将在后续版本接入.
Close button opens the existing React close prompt.
Minimize to tray hides the window.
Tray show restores and focuses the window.
Manual expiry check displays a notification or frontend fallback message.
Settings can load API config.
Backup export creates JSON with cards/customers.
Plan import from data/172-plans.json and data/haoyi-plans-parsed.json works.
Excel imports still parse rows in React and pass them to Rust.
```

- [ ] **Step 6: Verify legacy migration behavior manually**

Use a disposable old Electron data directory:

```powershell
$old = Join-Path $env:APPDATA 'traffic-card-manager'
New-Item -ItemType Directory -Force $old | Out-Null
Copy-Item -LiteralPath .\path\to\known-good-traffic-cards.db -Destination (Join-Path $old 'traffic-cards.db') -Force
npm run dev
```

Expected:

```text
The Tauri app starts.
The new Tauri app-data directory contains traffic-cards.db.
The old %APPDATA%/traffic-card-manager/traffic-cards.db remains byte-for-byte unchanged.
Existing cards/customers/plans are visible in the app.
```

- [ ] **Step 7: Final cleanup check**

Run: `git status --short`

Expected: only intentional migration files are modified. Pre-existing unrelated user changes remain separate unless a migration task explicitly touched the same file and incorporated them.

Run: `rg "electron|sql\.js|dist-electron|electronAPI" package.json vite.config.ts src src-tauri tests README.md 用户使用说明.md`

Expected: no obsolete runtime references. Historical mention in docs is acceptable only if explicitly describing removed legacy behavior.

- [ ] **Step 8: Commit verification fixes**

If Steps 1-7 required fixes:

```bash
git add -A
git commit -m "chore: verify tauri migration build"
```

If no fixes were required, do not create an empty commit.
