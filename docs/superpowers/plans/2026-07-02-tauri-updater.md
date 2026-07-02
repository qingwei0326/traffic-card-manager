# Tauri Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the update placeholder with Tauri v2 updater integration backed by GitHub Releases for `qingwei0326/traffic-card-manager`.

**Architecture:** Rust owns update checks, download, install, state, and events through `tauri-plugin-updater`. React keeps the existing `appApi.update` interface and sidebar workflow. GitHub Actions builds signed updater artifacts and publishes them as release assets.

**Tech Stack:** Tauri 2, `tauri-plugin-updater`, React 18, TypeScript, Vitest, Rust, GitHub Actions, SQLite unchanged.

## Global Constraints

- Use `https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json` as the updater endpoint.
- Commit only the updater public key; never commit `TAURI_SIGNING_PRIVATE_KEY`.
- Preserve the existing frontend API names: `check`, `download`, `install`, and `update:*` events.
- Keep normal update failures as `UpdateResult { ok: false, message }` so the current UI logic works.
- Do not stage or revert existing unrelated dirty files in `build/`, `data/`, or `scripts/`.
- Avoid live network checks in automated tests.

---

## File Structure

- Modify `package.json` and `package-lock.json` to add `@tauri-apps/plugin-updater`.
- Modify `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` to add `tauri-plugin-updater`.
- Modify `src-tauri/tauri.conf.json` to enable updater artifacts and configure the GitHub Release endpoint.
- Modify `src-tauri/capabilities/default.json` to grant updater permission.
- Create `src-tauri/src/updater.rs` for updater state, result helpers, and command implementations.
- Modify `src-tauri/src/lib.rs` to register the updater plugin and manage updater state.
- Modify `src-tauri/src/commands/api.rs` to delegate update commands to `updater.rs`.
- Modify `src-tauri/src/models.rs` to allow optional update metadata in `UpdateResult`.
- Modify tests in `tests/packageConfig.test.ts`, `tests/appApi.test.ts`, and `src-tauri/tests/desktop_commands.rs`.
- Modify `.github/workflows/release.yml` to publish updater artifacts to GitHub Releases.
- Modify `README.md` and `用户使用说明.md` to document update behavior and signing secrets.

---

### Task 1: Dependencies, Config, And Permissions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Test: `tests/packageConfig.test.ts`

**Interfaces:**
- Produces: Tauri updater plugin is available to Rust as `tauri_plugin_updater`; config contains `bundle.createUpdaterArtifacts`, `plugins.updater.pubkey`, and `plugins.updater.endpoints`.
- Consumes: Existing Tauri 2 project config.

- [ ] **Step 1: Add JS updater dependency**

Run:

```powershell
npm install @tauri-apps/plugin-updater@^2
```

Expected: `package.json` and `package-lock.json` include `@tauri-apps/plugin-updater`.

- [ ] **Step 2: Add Rust updater dependency**

Edit `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
tauri-plugin-updater = "2"
```

Run:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Cargo resolves `tauri-plugin-updater` and updates `src-tauri/Cargo.lock`. Compilation may fail later if code has not yet registered the plugin; dependency resolution must complete.

- [ ] **Step 3: Configure Tauri updater**

Set `src-tauri/tauri.conf.json` values:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "REPLACE_WITH_GENERATED_PUBLIC_KEY",
      "endpoints": [
        "https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json"
      ]
    }
  }
}
```

Generate a local signing key if no updater public key is already available:

```powershell
npx tauri signer generate --ci
```

Use only the generated public key in `tauri.conf.json`. Do not commit the private key output.

- [ ] **Step 4: Grant capability permission**

Edit `src-tauri/capabilities/default.json` permissions:

```json
[
  "core:default",
  "core:event:default",
  "notification:default",
  "updater:default"
]
```

- [ ] **Step 5: Update config test**

Modify `tests/packageConfig.test.ts` to assert:

```ts
expect(pkg.dependencies['@tauri-apps/plugin-updater']).toBeDefined()
expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true)
expect(tauriConfig.plugins.updater.endpoints).toContain(
  'https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json',
)
expect(typeof tauriConfig.plugins.updater.pubkey).toBe('string')
expect(tauriConfig.plugins.updater.pubkey.length).toBeGreaterThan(20)
```

Read `src-tauri/capabilities/default.json` in the test and assert:

```ts
expect(defaultCapability.permissions).toContain('updater:default')
```

- [ ] **Step 6: Run focused test**

Run:

```powershell
npm test -- tests/packageConfig.test.ts
```

Expected: config tests pass.

- [ ] **Step 7: Commit Task 1**

Run:

```powershell
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/capabilities/default.json tests/packageConfig.test.ts
git commit -m "feat: configure tauri updater"
```

---

### Task 2: Rust Updater State And Commands

**Files:**
- Create: `src-tauri/src/updater.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/api.rs`
- Modify: `src-tauri/src/models.rs`
- Test: `src-tauri/tests/desktop_commands.rs`

**Interfaces:**
- Consumes: `tauri_plugin_updater::UpdaterExt`, `crate::models::UpdateResult`, existing command names `update_check`, `update_download`, `update_install`.
- Produces:
  - `updater::UpdateState`
  - `updater::check_update(app, state) -> AppResult<UpdateResult>`
  - `updater::download_update(app, state) -> AppResult<UpdateResult>`
  - `updater::install_update(app, state) -> AppResult<UpdateResult>`
  - Deterministic helpers for tests.

- [ ] **Step 1: Extend update result model**

Edit `src-tauri/src/models.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    pub ok: bool,
    pub message: Option<String>,
    pub version: Option<String>,
}
```

- [ ] **Step 2: Create updater module**

Create `src-tauri/src/updater.rs` with:

```rust
use crate::error::{AppError, AppResult};
use crate::models::UpdateResult;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    pending_update: Mutex<Option<Update>>,
    downloaded_bytes: Mutex<Option<Vec<u8>>>,
}

pub fn ok_result(message: impl Into<String>, version: Option<String>) -> UpdateResult {
    UpdateResult {
        ok: true,
        message: Some(message.into()),
        version,
    }
}

pub fn error_result(message: impl Into<String>) -> UpdateResult {
    UpdateResult {
        ok: false,
        message: Some(message.into()),
        version: None,
    }
}

pub fn progress_percent(downloaded: u64, content_length: Option<u64>) -> u8 {
    match content_length {
        Some(total) if total > 0 => ((downloaded.saturating_mul(100) / total).min(100)) as u8,
        _ => 0,
    }
}

fn emit_error(app: &AppHandle, message: &str) {
    let _ = app.emit("update:error", message.to_string());
}

pub async fn check_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> AppResult<UpdateResult> {
    match app.updater().map_err(|err| AppError::Message(err.to_string()))?.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            {
                let mut pending = state
                    .pending_update
                    .lock()
                    .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
                *pending = Some(update);
            }
            {
                let mut downloaded = state
                    .downloaded_bytes
                    .lock()
                    .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
                *downloaded = None;
            }
            let _ = app.emit("update:available", version.clone());
            Ok(ok_result(format!("发现新版本 v{}", version), Some(version)))
        }
        Ok(None) => {
            {
                let mut pending = state
                    .pending_update
                    .lock()
                    .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
                *pending = None;
            }
            {
                let mut downloaded = state
                    .downloaded_bytes
                    .lock()
                    .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
                *downloaded = None;
            }
            let _ = app.emit("update:not-available", ());
            Ok(ok_result("当前已是最新版本", None))
        }
        Err(err) => {
            let message = format!("检查更新失败: {}", err);
            emit_error(&app, &message);
            Ok(error_result(message))
        }
    }
}

pub async fn download_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> AppResult<UpdateResult> {
    let update = {
        let mut pending = state
            .pending_update
            .lock()
            .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
        pending.take()
    };

    let Some(update) = update else {
        let message = "没有可下载的更新，请先检查更新";
        emit_error(&app, message);
        return Ok(error_result(message));
    };

    let version = update.version.clone();
    let mut downloaded: u64 = 0;
    let result = update
        .download(
            |chunk_length, content_length| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let _ = app.emit("update:progress", progress_percent(downloaded, content_length));
            },
            || {},
        )
        .await;

    match result {
        Ok(bytes) => {
            let mut downloaded_bytes = state
                .downloaded_bytes
                .lock()
                .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
            *downloaded_bytes = Some(bytes);
            let _ = app.emit("update:progress", 100_u8);
            let _ = app.emit("update:downloaded", ());
            Ok(ok_result(format!("更新 v{} 已下载完成", version), Some(version)))
        }
        Err(err) => {
            let message = format!("下载更新失败: {}", err);
            emit_error(&app, &message);
            Ok(error_result(message))
        }
    }
}

pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> AppResult<UpdateResult> {
    let bytes = {
        let mut downloaded = state
            .downloaded_bytes
            .lock()
            .map_err(|_| AppError::Message("更新状态锁已损坏".into()))?;
        downloaded.take()
    };

    let Some(bytes) = bytes else {
        let message = "没有可安装的更新，请先下载更新";
        emit_error(&app, message);
        return Ok(error_result(message));
    };

    match app
        .updater()
        .map_err(|err| AppError::Message(err.to_string()))?
        .install(bytes)
    {
        Ok(()) => Ok(ok_result("正在重启安装更新", None)),
        Err(err) => {
            let message = format!("安装更新失败: {}", err);
            emit_error(&app, &message);
            Ok(error_result(message))
        }
    }
}
```

If the exact plugin API differs, inspect the installed crate docs/source and keep the same external command behavior.

- [ ] **Step 3: Register updater module and plugin**

Edit `src-tauri/src/lib.rs`:

```rust
mod updater;
```

Add plugin registration:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

Add managed state in setup:

```rust
app.manage(updater::UpdateState::default());
```

- [ ] **Step 4: Delegate commands**

Replace the stub functions in `src-tauri/src/commands/api.rs` with:

```rust
#[tauri::command]
pub async fn update_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::updater::UpdateState>,
) -> AppResult<UpdateResult> {
    crate::updater::check_update(app, state).await
}

#[tauri::command]
pub async fn update_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::updater::UpdateState>,
) -> AppResult<UpdateResult> {
    crate::updater::download_update(app, state).await
}

#[tauri::command]
pub async fn update_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::updater::UpdateState>,
) -> AppResult<UpdateResult> {
    crate::updater::install_update(app, state).await
}
```

Remove `UPDATE_STUB_MESSAGE` and `update_stub()`.

- [ ] **Step 5: Update Rust test**

Change `src-tauri/tests/desktop_commands.rs` to include `updater.rs` and deterministic tests:

```rust
#[path = "../src/updater.rs"]
mod updater;

#[test]
fn update_result_helpers_keep_frontend_contract() {
    let ok = updater::ok_result("当前已是最新版本", None);
    assert!(ok.ok);
    assert_eq!(ok.message.as_deref(), Some("当前已是最新版本"));
    assert!(ok.version.is_none());

    let error = updater::error_result("没有可下载的更新，请先检查更新");
    assert!(!error.ok);
    assert_eq!(
        error.message.as_deref(),
        Some("没有可下载的更新，请先检查更新")
    );
    assert!(error.version.is_none());
}

#[test]
fn update_progress_percent_is_bounded() {
    assert_eq!(updater::progress_percent(25, Some(100)), 25);
    assert_eq!(updater::progress_percent(150, Some(100)), 100);
    assert_eq!(updater::progress_percent(25, Some(0)), 0);
    assert_eq!(updater::progress_percent(25, None), 0);
}
```

- [ ] **Step 6: Run Rust checks**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test desktop_commands
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: both commands pass.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add src-tauri/src/updater.rs src-tauri/src/lib.rs src-tauri/src/commands/api.rs src-tauri/src/models.rs src-tauri/tests/desktop_commands.rs
git commit -m "feat: implement tauri updater commands"
```

---

### Task 3: Frontend API Tests And Types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `tests/appApi.test.ts`

**Interfaces:**
- Consumes: Existing `AppApi.update` shape.
- Produces: Update result type includes optional `version`; tests assert command mapping and events.

- [ ] **Step 1: Extend frontend update type**

Edit `src/types/index.ts`:

```ts
export interface UpdateResult {
  ok: boolean
  message?: string
  version?: string
}
```

- [ ] **Step 2: Update appApi test**

Replace the placeholder-specific update test with:

```ts
it('maps update commands to Tauri updater commands', async () => {
  const { invoke } = await import('@tauri-apps/api/core')
  const { appApi } = await import('../src/lib/appApi')

  await expect(appApi.update.check()).resolves.toEqual({ command: 'update_check' })
  await expect(appApi.update.download()).resolves.toEqual({ command: 'update_download' })
  await expect(appApi.update.install()).resolves.toEqual({ command: 'update_install' })

  expect(invoke).toHaveBeenCalledWith('update_check')
  expect(invoke).toHaveBeenCalledWith('update_download')
  expect(invoke).toHaveBeenCalledWith('update_install')
})
```

Update the `invoke` mock to always return `{ command }`.

- [ ] **Step 3: Add update event mapping test**

Add:

```ts
it('subscribes to update events with payload mapping', async () => {
  const { listen } = await import('@tauri-apps/api/event')
  const { appApi } = await import('../src/lib/appApi')

  await appApi.update.onAvailable(() => {})
  await appApi.update.onNotAvailable(() => {})
  await appApi.update.onProgress(() => {})
  await appApi.update.onDownloaded(() => {})
  await appApi.update.onError(() => {})

  expect(listen).toHaveBeenCalledWith('update:available', expect.any(Function))
  expect(listen).toHaveBeenCalledWith('update:not-available', expect.any(Function))
  expect(listen).toHaveBeenCalledWith('update:progress', expect.any(Function))
  expect(listen).toHaveBeenCalledWith('update:downloaded', expect.any(Function))
  expect(listen).toHaveBeenCalledWith('update:error', expect.any(Function))
})
```

- [ ] **Step 4: Run frontend focused test**

Run:

```powershell
npm test -- tests/appApi.test.ts
```

Expected: appApi tests pass.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add src/types/index.ts tests/appApi.test.ts
git commit -m "test: update updater app api contract"
```

---

### Task 4: Release Workflow And Documentation

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`
- Modify: `用户使用说明.md`

**Interfaces:**
- Consumes: Tauri-generated updater artifacts from `src-tauri/target/release/bundle/nsis/`.
- Produces: GitHub Release assets for installers and updater manifests.

- [ ] **Step 1: Add signing env to build**

Set the build step in `.github/workflows/release.yml`:

```yaml
- name: Build Windows installer
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  run: npm run build
```

- [ ] **Step 2: Upload updater artifacts**

Expand artifact path:

```yaml
path: |
  src-tauri/target/release/bundle/nsis/*.exe
  src-tauri/target/release/bundle/nsis/*.sig
  src-tauri/target/release/bundle/nsis/latest.json
```

- [ ] **Step 3: Publish release assets**

Add:

```yaml
- name: Publish GitHub Release assets
  uses: softprops/action-gh-release@v2
  with:
    files: |
      src-tauri/target/release/bundle/nsis/*.exe
      src-tauri/target/release/bundle/nsis/*.sig
      src-tauri/target/release/bundle/nsis/latest.json
```

- [ ] **Step 4: Update README**

Replace the placeholder update sentence with:

```markdown
自动更新使用 Tauri updater + GitHub Releases。安装版应用会从 `https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json` 检查更新，下载完成后可重启安装。
```

Add release secret instructions:

```markdown
首次发布前，在 GitHub 仓库 Secrets 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（如果生成密钥时设置了密码）

本地生成签名密钥：

```bash
npx tauri signer generate --ci
```

只把 public key 写入 `src-tauri/tauri.conf.json`，private key 只放入 GitHub Secrets。
```

- [ ] **Step 5: Update user guide**

In `用户使用说明.md`, add a short "自动更新" section:

```markdown
## 自动更新

安装版应用左下角可以检查更新。发现新版本后，点击下载，下载完成后点击重启安装。

更新包来自 GitHub Releases。发布新版本前需要在 GitHub Secrets 配置 Tauri 签名私钥，否则 Release 工作流无法生成可被客户端验证的更新包。
```

- [ ] **Step 6: Run workflow/doc smoke checks**

Run:

```powershell
npm test -- tests/packageConfig.test.ts
```

Expected: package config still passes after workflow/doc edits.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add .github/workflows/release.yml README.md 用户使用说明.md
git commit -m "ci: publish tauri updater artifacts"
```

---

### Task 5: Full Verification

**Files:**
- No new files unless verification requires small test fixes.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: Verified updater integration status.

- [ ] **Step 1: Run full frontend tests**

Run:

```powershell
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run Rust tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

- [ ] **Step 3: Run renderer build**

Run:

```powershell
npm run build:renderer
```

Expected: Vite build succeeds.

- [ ] **Step 4: Run Tauri build**

Run:

```powershell
npm run build
```

Expected: Tauri Windows build succeeds. If signing secrets are absent locally and Tauri requires them for updater artifacts, document that full signed updater artifact generation is verified in GitHub Actions with secrets.

- [ ] **Step 5: Final diff check**

Run:

```powershell
git status --short
git diff --stat HEAD
```

Expected: only unrelated pre-existing dirty files remain, or any final fixes are committed.

---

## Self-Review

- Spec coverage: The plan covers updater config, permissions, Rust commands, state, frontend contract tests, release workflow, docs, and verification.
- Placeholder scan: The only `REPLACE_WITH_GENERATED_PUBLIC_KEY` string is an instruction inside this plan, not production code.
- Type consistency: Rust and TypeScript `UpdateResult` both use `ok`, optional `message`, and optional `version`.
