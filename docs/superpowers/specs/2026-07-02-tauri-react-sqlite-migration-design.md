# Tauri React SQLite Migration Design

## Summary

Refactor the desktop app from Electron + React + sql.js to Tauri + React + native SQLite. This is a full replacement: Electron runtime, preload IPC, Electron Builder, Electron updater, and sql.js are removed once the Tauri app reaches feature parity.

The migration keeps the existing UI and business behavior. React remains the renderer. Rust owns desktop integration, SQLite access, imports, backup/restore, notifications, tray behavior, and the 172 API client. Existing data is copied from the old Electron user-data directory into the new Tauri app-data directory on first launch.

## Decisions

- Migration mode: complete Electron replacement.
- Database owner: Rust backend with native SQLite.
- Legacy data strategy: copy migration from the old Electron data directory, leaving old data untouched.
- Updater strategy: keep the UI/API surface as a nonfunctional compatibility stub; real Tauri updater integration is explicitly out of scope for this migration.
- UI strategy: functional parity only. Do not redesign screens or add unrelated features.

## Current Project Context

The existing app lives in `traffic-card-manager` and currently uses:

- React + TypeScript + Vite for the renderer.
- Electron main/preload under `electron/`.
- `window.electronAPI` as the frontend IPC surface.
- `electron/database.ts` as a large sql.js-backed business/database module.
- SQLite-compatible persisted data at `%APPDATA%/traffic-card-manager/traffic-cards.db`.
- JSON plan data under `data/`.
- Vitest tests that import Electron database helpers directly.

The repository currently has unrelated modified and untracked files. The migration must avoid reverting or overwriting unrelated user changes.

## Architecture

Final structure:

- `src/`: existing React UI, Tailwind, Recharts, lucide icons, and Excel/JSON file parsing.
- `src/lib/appApi.ts`: the only frontend platform API used by components.
- `src-tauri/`: Tauri app configuration and Rust backend.
- `src-tauri/src/commands/`: Tauri command handlers grouped by domain.
- `src-tauri/src/db/`: SQLite connection, schema, migrations, repositories, import logic, and backup/restore.
- `src-tauri/src/api172.rs`: 172 API signing and request client.
- `src-tauri/src/tray.rs`, `notifications.rs`, and `window.rs`: desktop behavior.

Components must call `appApi.*`, not `window.electronAPI.*` or Tauri `invoke` directly. `appApi` maps the existing frontend API shape onto Tauri commands so the component migration is mechanical and future platform changes are localized.

Electron files, Electron Vite plugins, Electron Builder configuration, updater code, and sql.js dependencies are deleted after equivalent Tauri functionality is in place.

## SQLite And Data Migration

Database paths:

- Old Electron database: `%APPDATA%/traffic-card-manager/traffic-cards.db`.
- New Tauri database: Tauri app-data directory, file name `traffic-cards.db`.
- Old Electron config: `%APPDATA%/traffic-card-manager/config.json`.
- New Tauri config: Tauri app-data directory, file name `config.json`.

Startup migration behavior:

1. Resolve the new Tauri app-data directory and create it if missing.
2. If the new database does not exist and the old Electron database exists, copy the old database to the new path.
3. If the new config does not exist and the old Electron config exists, copy the old config to the new path.
4. Run schema creation and migrations only against the new database.
5. Never write to the old Electron database or old config.
6. If copy migration fails, continue app startup with a clear migration error exposed to Settings and preserve backup import as a recovery path.

SQLite schema keeps the current table and column names:

- `customers`
- `cards`
- `plans`

Rust migrations must preserve the current behavior from `Database.init()`:

- Create all three tables if missing.
- Add existing compatibility columns when absent.
- Create indexes used by card/customer/plan queries.
- Preserve foreign key behavior.
- Preserve current defaults where they affect app behavior.

Use `rusqlite` for native SQLite because the app is single-user desktop software and the current SQL/transaction model is synchronous and local. Use explicit transactions for imports, backup restore, merge operations, and bulk plan updates.

## Rust Business Layer

Move the behavior currently in `electron/database.ts` into Rust modules while preserving returned JSON shape:

- Cards: list, get by id, create, partial update, delete, stats, monthly stats, expiring soon.
- Customers: list, get by id, create, update, delete, customer cards, duplicate detection, merge.
- Finance: summary, monthly profit, profit by carrier, profit by plan type.
- Plans: list, import, import from bundled JSON file, fuzzy match, backfill card plan fields, delete.
- Backup: export and import using the existing JSON format.
- Imports: 172 rows and Haoyi rows, including duplicate-order update behavior and status merge protection.
- API config: read and save `{ user_id, secret }`.
- 172 API: test connection, get products, sync products to plans, get order info.

The config secret remains base64-compatible with the existing app for this migration. OS keychain storage is out of scope for this migration.

Rust domain modules must be split by behavior rather than making a single large database file equivalent to `electron/database.ts`.

## Frontend API Adaptation

Create `src/lib/appApi.ts` with methods matching the existing `window.electronAPI` shape:

- `cards`
- `customers`
- `finance`
- `settings`
- `plans`
- `backup`
- `import172`
- `importHaoyi`
- `api172`
- `apiConfig`
- `update`
- `notifications`
- `app`

Replace component calls from `window.electronAPI.*` to `appApi.*`.

Move the API type definitions out of `Window.electronAPI` global declarations into exported TypeScript interfaces that describe the `appApi` object. Keep the existing data interfaces such as `Card`, `Customer`, `Plan`, `PaginatedResult<T>`, `ImportResult`, and `PlanImportResult`.

Excel and JSON file parsing stays in React using `xlsx` and browser file APIs. Parsed rows are passed to Rust commands.

## Desktop Behavior

Tauri must preserve the current desktop behavior:

- Single-instance behavior.
- Main window title, dimensions, minimum dimensions, and app icon.
- Hidden native menu where applicable.
- Close confirmation flow through the existing React prompt.
- Tray menu with:
  - show main window;
  - check expiry notifications now;
  - quit.
- Double-click tray icon restores the window.
- Expiry checks run after startup and then every 30 minutes.
- Manual notification check remains available.
- If native notifications are unavailable, show a frontend message instead.

Use Tauri's event system for messages that were previously sent through Electron IPC events, including close requests and notification fallback messages.

## Updater Compatibility Stub

Real auto-update is out of scope for this migration.

Keep the frontend update controls stable by implementing nonfunctional compatibility API methods:

- `appApi.update.check()` returns `{ ok: false, message: 'Tauri 自动更新将在后续版本接入' }`.
- `download()` and `install()` return a non-success result with the same message.
- Event subscription methods remain callable but do not emit progress or downloaded events.

Remove `electron-updater` and all Electron updater code. Do not add Tauri updater signing, public key configuration, or release publishing changes in this migration.

## Build And Packaging

Update package scripts:

- `npm run dev`: starts Tauri development mode.
- `npm run build`: builds the Tauri app.
- `npm run preview`: remains for renderer-only preview if useful.
- `npm test`: runs Vitest for frontend/TypeScript tests.

Remove Electron-specific build config from `package.json`, including `main`, `build`, Electron Builder `publish`, NSIS config, `asarUnpack`, and Electron file lists.

Remove Electron-specific dependencies and dev dependencies:

- `electron`
- `electron-builder`
- `vite-plugin-electron`
- `vite-plugin-electron-renderer`
- `electron-log`
- `electron-updater`
- `sql.js`

Keep renderer dependencies:

- React
- React DOM
- Vite
- TypeScript
- Tailwind/PostCSS/Autoprefixer
- lucide-react
- Recharts
- xlsx
- Vitest

Add Rust dependencies for Tauri 2.x, SQLite, serialization, HTTP, hashing, and time handling. Use one Tauri major version consistently across `tauri`, `tauri-build`, and Tauri plugins.

If the portable zip remains required, create it after `tauri build` by zipping the produced Windows bundle directory. Keep the artifact naming close to the existing `traffic-card-manager-x.y.z-portable.zip`.

## Testing

Frontend tests:

- Update existing tests that import `electron/` modules so they either test pure TypeScript helpers or move equivalent coverage to Rust.
- Add tests for `appApi` updater compatibility-stub behavior.
- Keep focused tests for card search/write-field helper behavior if those helpers stay in TypeScript.

Rust tests:

- Schema initialization on a fresh database.
- Copy migration behavior from an old Electron-style data directory to the new Tauri data directory.
- Card create/list/get/update/delete, including partial update preserving existing fields.
- Customer create/list/update/delete, duplicate detection, and merge.
- 172 import duplicate-order update behavior.
- Haoyi import duplicate-order update behavior.
- Status merge protection so older pending imports do not regress active records.
- Plan import, fuzzy matching, backfill, and field preservation.
- Backup export/import with the existing JSON format.
- Finance summary and grouped profit calculations.
- API config base64 compatibility.

Verification commands for the implementation:

- `npm test`
- `cargo test` from `src-tauri`
- `npm run build`

Build verification must also manually inspect or smoke-test:

- App starts on Windows.
- Database is created in the Tauri app-data directory.
- Existing Electron database is copied, not modified.
- Tray close/restore/quit works.
- Expiry notification check works or reports fallback message.
- Excel/JSON imports still work.
- Backup export/import still uses the same format.
- Update UI shows the compatibility-stub message.

## Non-Goals

- No UI redesign.
- No new business features.
- No schema renaming.
- No backup JSON format change.
- No live Tauri updater integration.
- No system keychain migration for API secrets.
- No Electron/Tauri dual-runtime support after migration is complete.

## Risks And Mitigations

- Risk: Reimplementing a large TypeScript database class in Rust can change business behavior.
  Mitigation: migrate behavior by domain, preserve JSON shapes, and port current workflow tests to Rust.

- Risk: Old user data could be damaged.
  Mitigation: copy old data into the new Tauri directory and never write to the old Electron directory.

- Risk: Frontend code has many direct `window.electronAPI` calls.
  Mitigation: introduce `appApi` first and migrate components to that single adapter.

- Risk: Tauri updater setup is more complex than Electron updater.
  Mitigation: implement only the compatibility stub in this migration and handle updater signing/release workflow separately.

- Risk: Current worktree contains unrelated changes.
  Mitigation: do not revert user changes and stage only migration files during implementation.
