# Stability Release Optimization Design

## Goal

Prepare a safer stability release by tightening release gates, reducing desktop security risk, improving external API failure behavior, preserving backup data more faithfully, and calculating missing imported card promo end dates when the source data allows it.

## Scope

This work uses the aggressive stability option selected by the user:

- Release gates for TypeScript, frontend tests, and Rust tests.
- Tauri CSP hardening.
- 172 API request timeout and clearer input/failure handling.
- Honest short-term API credential storage behavior without a new secret-storage dependency.
- Backup export/import fidelity for card IDs and timestamps.
- Imported order promo end calculation when a matched plan and activation date are available.

Large UI restructuring, broad `any` cleanup, bundle splitting, Rust test warning cleanup, and `cargo clippy` as a hard release gate are out of scope for this pass.

## Current State

`npm test` and `npm run build:renderer` pass, but `npx tsc --noEmit` fails because `tsconfig.json` references Node types while the project does not provide a resolvable `@types/node` package.

The release workflow only runs `npm test` before building the Tauri installer, so TypeScript type checking and Rust tests do not currently block a release.

The Tauri config disables CSP with `csp: null`. The renderer can import user-selected Excel/JSON files, trigger backup restore, call local Tauri commands, and handle API credentials, so the desktop security boundary should not rely on a completely open CSP.

The 172 API client creates a fresh `reqwest::Client` for every request and has no explicit timeout. Empty credentials can be submitted, which produces low-quality user feedback.

API credentials are stored as base64 in `config.json`. That is compatibility encoding, not secure storage.

Backup restore rebuilds cards through the normal create path. Customers keep IDs and timestamps, but cards lose their original IDs and timestamps.

Order imports currently preserve an existing `promo_end` but do not calculate a missing value from the matched plan. Existing tests intentionally lock in that old behavior and must be updated with the new rule.

## Architecture

Keep the optimization package small and release-focused. The app keeps its existing React/Tauri command contracts except where stricter validation returns earlier, clearer errors.

The implementation divides into four focused areas:

1. Release gate changes in Node package config and GitHub Actions.
2. Tauri security and API reliability changes in config/Rust command modules.
3. Backup-specific database helpers that avoid reusing paginated UI query paths or normal create paths.
4. Shared promo-end calculation used by import logic and covered by Rust tests.

No database schema migration is required.

## Release Gates

Add `@types/node` as a dev dependency so `tsconfig.json` and `tsconfig.node.json` can resolve Node types.

Add a package script:

```json
"typecheck": "tsc --noEmit"
```

Update the release workflow so the installer build is gated by:

1. `npm test`
2. `npm run typecheck`
3. `cargo test`

`cargo clippy` stays advisory for this pass. The current test structure imports source modules via `#[path]`, creating large duplicate dead-code warning output. That warning cleanup should be handled separately before clippy becomes a hard release gate.

Remove the current PostCSS module-type warning by making the config format match the package module mode. The preferred low-risk change is to convert `postcss.config.js` to CommonJS syntax because the package is currently not marked as ESM.

## Tauri CSP

Replace `csp: null` with a conservative static policy:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src https://haokaopenapi.lot-ml.com https://github.com;
object-src 'none';
base-uri 'self'
```

The policy allows local application assets, Tailwind/runtime styles, data images, the 172 API host, and GitHub updater checks. It does not allow arbitrary remote scripts or object/embed content.

The implementation must verify the renderer build still runs with the stricter policy.

## 172 API Reliability

Centralize request construction in `src-tauri/src/api172.rs`.

Use a `reqwest::Client::builder()` with an explicit request timeout. The initial timeout should be 15 seconds, which is long enough for a slow network while preventing indefinite hangs.

Validate credentials before sending network requests:

- `user_id` must not be blank.
- `secret` must not be blank.
- `order_id` must not be blank for order lookup.

Return human-readable validation messages before any network request when inputs are missing.

Normalize common network failures into clearer messages:

- Timeout: `请求超时，请稍后重试`
- Connectivity or transport failure: `网络请求失败: <details>`
- Invalid JSON response: `API响应格式不正确: <details>`
- API business error: use the upstream message when present.

The React settings UI can keep its existing success/error display contract.

## API Credential Storage

Do not introduce a new encrypted-storage dependency in this release-focused pass.

Keep backward compatibility with existing `secret_enc` values and continue saving the current config format for now. Update user-facing copy so it does not imply strong security. The correct wording is local configuration storage, not secure encrypted credential storage.

Future work can migrate credentials to Windows Credential Manager or a Tauri Stronghold-backed store. That migration should be a separate spec because it requires storage migration, fallback behavior, and recovery UX.

## Backup Fidelity

Add backup-specific database functions rather than using paginated UI functions:

- Export all cards without a fake `page_size: 1_000_000`.
- Export all customers without a fake `page_size: 1_000_000`.
- Restore cards with explicit `id`, all card fields, `created_at`, and `updated_at`.
- Restore customers with explicit `id`, all customer fields, `created_at`, and `updated_at`.

Restore remains destructive and transactional:

1. Validate the JSON shape contains `cards` and `customers` arrays.
2. Begin transaction.
3. Delete cards before customers.
4. Insert customers with original IDs.
5. Insert cards with original IDs and original customer references.
6. Commit on success or roll back on error.

This preserves backup semantics while keeping the existing frontend `backup.export()` and `backup.import(data)` API stable.

## Promo End Calculation On Import

When importing 172 or Haoyi orders, calculate `promo_end` only when all of these are true:

- The current imported or existing card does not already have a non-empty `promo_end`.
- A matched plan exists.
- The matched plan has `promo_period > 0`.
- The imported activation date can be parsed.

The calculation follows the current frontend behavior:

1. Start from the activation date.
2. Add `promo_period` months.
3. Set the date to the previous day, which lands on the last day of the prior month.
4. Store the date in `YYYY-MM-DD` format.

Examples:

- Activation `2026-07-15`, promo period `6` months -> `2026-12-31`.
- Activation `2026-07-01`, promo period `1` month -> `2026-07-31`.

Existing manual or previously imported `promo_end` values must not be overwritten.

If activation time is missing, invalid, or a plan cannot be matched, keep `promo_end` empty.

## Tests

Frontend/package tests:

- Assert `typecheck` exists in `package.json`.
- Assert release workflow includes the typecheck and Rust test gates.
- Keep existing updater/package configuration tests.

Type checking:

- `npm run typecheck` must pass.

Rust tests:

- Backup round-trip should assert card ID and timestamps are preserved, not just row counts.
- Backup import rollback behavior should remain covered by transaction behavior if an invalid customer reference is introduced.
- Import tests should replace the old "does not calculate promo_end" expectations with:
  - Calculates missing `promo_end` from matched plan and activation time.
  - Does not overwrite an existing `promo_end`.
  - Does not calculate when activation time is missing.

Verification commands for implementation:

```powershell
npm test
npm run typecheck
npm run build:renderer
cargo test
```

Run `cargo test` from `src-tauri`.

## Documentation

Update README or user-facing settings copy where it currently implies old technology or stronger credential security than exists.

The release notes for this optimization should call out:

- Stronger release checks.
- API timeout and clearer errors.
- Backup restore now preserves card identifiers and timestamps.
- Imports can auto-fill missing promo end dates from matched plans.

## Risks And Mitigations

CSP can break runtime asset loading if the policy is too strict. Mitigation: verify renderer build and local Tauri startup after applying the policy. If needed, widen only the blocked directive observed in testing.

API timeout can fail slow requests that previously waited indefinitely. Mitigation: use 15 seconds initially and keep the error message actionable.

Backup restore preserving card IDs can expose conflicts only if malformed backup data includes duplicate IDs. Mitigation: let the transaction fail and roll back with the database error surfaced to the user.

Promo end calculation changes existing import behavior. Mitigation: calculate only for empty `promo_end`, require a matched plan and activation time, and cover all branches with Rust tests.
