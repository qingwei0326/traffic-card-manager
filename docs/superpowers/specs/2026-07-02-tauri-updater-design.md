# Tauri Updater Design

## Goal

Add real automatic updates to the Tauri + React + SQLite desktop app using Tauri v2's official updater plugin and GitHub Releases from `qingwei0326/traffic-card-manager`.

## Current State

The renderer already exposes an update UI in `src/components/Layout.tsx`. It calls `appApi.update.check()`, `download()`, and `install()`, then listens for these events:

- `update:available`
- `update:not-available`
- `update:progress`
- `update:downloaded`
- `update:error`

The Rust commands in `src-tauri/src/commands/api.rs` currently return a compatibility placeholder: `Tauri 自动更新将在后续版本接入`.

## Architecture

The Rust/Tauri side owns updater integration. The React side keeps the existing `appApi.update` interface and receives the same event names it already handles. This keeps the UI stable and limits the change to the Tauri bridge, app configuration, release workflow, and tests.

Tauri will use `tauri-plugin-updater` with a static updater manifest hosted as a GitHub Release asset:

```text
https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json
```

The updater command flow is:

1. `update_check(app, state)` calls `app.updater().check().await`.
2. If an update exists, Rust stores the pending `Update` object in managed state, emits `update:available` with the version string, and returns `{ ok: true, message }`.
3. If no update exists, Rust clears pending state, emits `update:not-available`, and returns `{ ok: true, message: "当前已是最新版本" }`.
4. `update_download(state)` downloads the pending update with progress callbacks and emits `update:progress` percentages plus `update:downloaded`.
5. `update_install(state)` installs the downloaded update and restarts the app.

The commands return `UpdateResult` instead of throwing for normal updater failures so the existing React `result.ok` checks continue to work.

## State

Add a focused updater state module:

- `UpdateState`
  - `pending_update: Mutex<Option<tauri_plugin_updater::Update>>`
  - `downloaded_bytes: Mutex<Option<Vec<u8>>>`

This state lets the current three-step UI preserve the checked update between `check`, `download`, and `install`.

## Events

The existing frontend event contract remains:

- `update:available`: payload is the available version string.
- `update:not-available`: payload is `null`.
- `update:progress`: payload is an integer percent from `0` to `100`.
- `update:downloaded`: payload is `null`.
- `update:error`: payload is a human-readable error string.

## Tauri Configuration

Enable the updater plugin in Tauri config:

- `bundle.createUpdaterArtifacts = true`
- `plugins.updater.pubkey = <public key>`
- `plugins.updater.endpoints = ["https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json"]`

Add capability permission:

- `updater:default`

The repository stores only the public key. The private key must never be committed.

## Release Workflow

The GitHub Actions release workflow builds the Windows NSIS installer and uploads:

- Windows installer `.exe`
- Tauri-generated updater artifacts, including the static JSON manifest and installer signature files

Signing uses GitHub Secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the generated key has a password

The workflow continues to keep build artifacts for debugging.

## Manifest Format

GitHub Releases will serve a static JSON manifest compatible with Tauri v2 updater. The Windows platform entry must include:

- `version`
- `notes`
- `pub_date`
- `platforms.windows-x86_64.signature`
- `platforms.windows-x86_64.url`

The URL points to the installer asset on the same GitHub Release.

## Error Handling

Rust commands convert updater errors to `UpdateResult { ok: false, message }`, emit `update:error`, and do not panic. Specific local state errors return:

- No pending update when downloading: `没有可下载的更新，请先检查更新`
- No downloaded update when installing: `没有可安装的更新，请先下载更新`

## Testing

The test scope avoids live network update checks. It covers:

- Package/config tests assert updater dependency, Tauri config endpoint, updater artifacts, and capability permission.
- `appApi` tests assert command mappings and event subscriptions without depending on placeholder messages.
- Rust unit tests cover deterministic helper result functions and progress calculation.
- Build/check commands verify the updater plugin compiles with the app.

## Documentation

Update README and user-facing instructions to state that installed release builds can check for GitHub Release updates. The docs must also list the signing secrets required before publishing real update releases.
