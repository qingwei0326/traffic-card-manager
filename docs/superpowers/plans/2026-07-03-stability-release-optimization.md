# Stability Release Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved stability release optimization: stronger release gates, safer Tauri defaults, bounded 172 API requests, faithful backup restore, and automatic imported promo end dates when enough data exists.

**Architecture:** Keep the existing React/Tauri command contracts. Add release checks at the package/workflow layer, tighten Tauri config, add small pure Rust helpers for API validation and promo-end calculation, and add backup-specific database paths instead of reusing UI pagination or normal card creation.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Tauri 2, Rust 2021, rusqlite, reqwest, chrono, GitHub Actions.

## Global Constraints

- Do not implement broad UI restructuring, broad `any` cleanup, bundle splitting, Rust test warning cleanup, or `cargo clippy` hard gating in this pass.
- Do not introduce a new encrypted-storage dependency in this release-focused pass.
- Preserve the existing frontend APIs: `appApi.backup.export()`, `appApi.backup.import(data)`, `appApi.api172.*`, and existing Tauri command names.
- Keep `secret_enc` backward-compatible and keep saving the existing config format.
- Run final verification: `npm test`, `npm run typecheck`, `npm run build:renderer`, and `cargo test` from `src-tauri`.
- Commit each task separately and stage only files touched by that task.

---

## File Structure

- `package.json`: add `typecheck` script and `@types/node` dev dependency.
- `package-lock.json`: lock `@types/node`.
- `postcss.config.js`: convert to CommonJS to remove Node module-type warning.
- `.github/workflows/release.yml`: add typecheck and Rust test gates before build.
- `tests/packageConfig.test.ts`: assert release gates and CSP.
- `src-tauri/tauri.conf.json`: replace `csp: null` with a restrictive policy.
- `src-tauri/src/api172.rs`: add credential/order validation, timeout client construction, and normalized network/JSON errors.
- `src-tauri/tests/desktop_commands.rs`: add pure API validation tests.
- `src/components/Settings.tsx`: update API credential copy and outdated Electron/version copy.
- `src-tauri/src/db/cards.rs`: add all-card export query for backup.
- `src-tauri/src/db/customers.rs`: add all-customer export query for backup.
- `src-tauri/src/db/backup.rs`: use backup export helpers and restore cards with explicit IDs/timestamps.
- `src-tauri/tests/backup_finance.rs`: assert backup ID/timestamp preservation and rollback.
- `src-tauri/src/db/imports.rs`: calculate missing `promo_end` during order imports.
- `src-tauri/tests/plans_imports.rs`: replace old import no-calc expectations with new behavior tests.
- `README.md` or `用户使用说明.md`: update user-facing release note bullets if implementation changes visible behavior.

---

### Task 1: Release Gates And Tooling Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `postcss.config.js`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/packageConfig.test.ts`

**Interfaces:**
- Produces: `npm run typecheck`, implemented as `tsc --noEmit`.
- Produces: release workflow gates for `npm test`, `npm run typecheck`, and `cargo test`.
- Consumes: existing Vitest config and package config tests.

- [ ] **Step 1: Add failing package/workflow tests**

Modify `tests/packageConfig.test.ts` so the setup reads the release workflow:

```ts
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
```

Add this test inside the existing `describe('Tauri package config', () => { ... })` block:

```ts
  it('gates release builds with frontend tests, typecheck, and Rust tests', () => {
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit')
    expect(pkg.devDependencies['@types/node']).toBeDefined()
    expect(releaseWorkflow).toContain('run: npm test')
    expect(releaseWorkflow).toContain('run: npm run typecheck')
    expect(releaseWorkflow).toContain('working-directory: src-tauri')
    expect(releaseWorkflow).toContain('run: cargo test')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/packageConfig.test.ts
```

Expected: FAIL because `pkg.scripts.typecheck` and `@types/node` are missing, and `.github/workflows/release.yml` does not contain the typecheck/Rust test gates.

- [ ] **Step 3: Install Node type definitions**

Run:

```powershell
npm install -D @types/node
```

Expected: `package.json` and `package-lock.json` update with `@types/node` in `devDependencies`.

- [ ] **Step 4: Add the typecheck script**

Modify `package.json` scripts to include:

```json
"typecheck": "tsc --noEmit"
```

Keep existing scripts unchanged.

- [ ] **Step 5: Convert PostCSS config to CommonJS**

Replace `postcss.config.js` with:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Add release workflow gates**

In `.github/workflows/release.yml`, after the existing `Run tests` step and before `Build Windows installer`, add:

```yaml
      - name: Run typecheck
        run: npm run typecheck

      - name: Run Rust tests
        working-directory: src-tauri
        run: cargo test
```

- [ ] **Step 7: Verify package test passes**

Run:

```powershell
npm test -- tests/packageConfig.test.ts
```

Expected: PASS for `tests/packageConfig.test.ts`.

- [ ] **Step 8: Verify typecheck passes**

Run:

```powershell
npm run typecheck
```

Expected: PASS. The previous `Cannot find type definition file for 'node'` error is gone.

- [ ] **Step 9: Commit release gate changes**

Run:

```powershell
git add package.json package-lock.json postcss.config.js .github/workflows/release.yml tests/packageConfig.test.ts
git commit -m "chore: gate releases with typecheck and rust tests"
```

---

### Task 2: CSP, 172 API Validation, Timeout, And Honest Credential Copy

**Files:**
- Modify: `tests/packageConfig.test.ts`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/api172.rs`
- Modify: `src-tauri/tests/desktop_commands.rs`
- Modify: `src/components/Settings.tsx`

**Interfaces:**
- Produces: `api172::REQUEST_TIMEOUT_SECS: u64 = 15`.
- Produces: `api172::validate_config(config: &Api172Config) -> AppResult<()>`.
- Produces: `api172::validate_order_id(order_id: &str) -> AppResult<()>`.
- Consumes: existing `Api172Config`, `AppError`, and `AppResult`.

- [ ] **Step 1: Add failing CSP test**

In `tests/packageConfig.test.ts`, add this test inside the existing describe block:

```ts
  it('uses a restrictive Tauri CSP for desktop security', () => {
    const csp = tauriConfig.app.security.csp
    expect(typeof csp).toBe('string')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data:")
    expect(csp).toContain('connect-src https://haokaopenapi.lot-ml.com https://github.com')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })
```

- [ ] **Step 2: Run package config test to verify CSP failure**

Run:

```powershell
npm test -- tests/packageConfig.test.ts
```

Expected: FAIL because `tauriConfig.app.security.csp` is currently `null`.

- [ ] **Step 3: Add failing API validation tests**

In `src-tauri/tests/desktop_commands.rs`, add these tests after `update_progress_percent_is_bounded`:

```rust
#[test]
fn api172_validation_rejects_blank_credentials() {
    let missing_user = api172::validate_config(&models::Api172Config {
        user_id: " ".into(),
        secret: "secret".into(),
    })
    .unwrap_err()
    .to_string();
    assert_eq!(missing_user, "请输入172号卡 user_id");

    let missing_secret = api172::validate_config(&models::Api172Config {
        user_id: "user".into(),
        secret: " ".into(),
    })
    .unwrap_err()
    .to_string();
    assert_eq!(missing_secret, "请输入172号卡 secret");
}

#[test]
fn api172_validation_rejects_blank_order_id_and_sets_timeout() {
    let missing_order = api172::validate_order_id(" ")
        .unwrap_err()
        .to_string();
    assert_eq!(missing_order, "请输入订单号");
    assert_eq!(api172::REQUEST_TIMEOUT_SECS, 15);
}
```

- [ ] **Step 4: Run Rust API tests to verify failure**

Run:

```powershell
cargo test --test desktop_commands
```

from `src-tauri`.

Expected: FAIL because `validate_config`, `validate_order_id`, and `REQUEST_TIMEOUT_SECS` do not exist.

- [ ] **Step 5: Implement restrictive CSP**

In `src-tauri/tauri.conf.json`, replace:

```json
"csp": null
```

with:

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://haokaopenapi.lot-ml.com https://github.com; object-src 'none'; base-uri 'self'"
```

- [ ] **Step 6: Implement API validation and timeout helpers**

In `src-tauri/src/api172.rs`, change the imports to include `AppError` and `Duration`:

```rust
use crate::error::{AppError, AppResult};
use crate::models::Api172Config;
use serde_json::json;
use std::collections::BTreeMap;
use std::time::Duration;
```

Add this constant and helpers after `BASE_URL`:

```rust
pub(crate) const REQUEST_TIMEOUT_SECS: u64 = 15;

pub(crate) fn validate_config(config: &Api172Config) -> AppResult<()> {
    if config.user_id.trim().is_empty() {
        return Err(AppError::Message("请输入172号卡 user_id".into()));
    }
    if config.secret.trim().is_empty() {
        return Err(AppError::Message("请输入172号卡 secret".into()));
    }
    Ok(())
}

pub(crate) fn validate_order_id(order_id: &str) -> AppResult<()> {
    if order_id.trim().is_empty() {
        return Err(AppError::Message("请输入订单号".into()));
    }
    Ok(())
}

fn client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()?)
}

fn http_error_message(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        "请求超时，请稍后重试".into()
    } else {
        format!("网络请求失败: {err}")
    }
}
```

- [ ] **Step 7: Wire validation and normalized request errors**

In `get_order_info`, validate the order before building params:

```rust
pub async fn get_order_info(
    config: Api172Config,
    order_id: String,
) -> AppResult<serde_json::Value> {
    validate_order_id(&order_id)?;
    let mut params = BTreeMap::new();
    params.insert("DownOrderID".to_string(), order_id);
    request("/api/order/GetOrderInfo", params, config).await
}
```

In `request`, validate config and replace the current client/send/json block with:

```rust
    validate_config(&config)?;

    let timestamp = chrono::Utc::now().timestamp().to_string();
    let mut all_params = BTreeMap::new();
    all_params.insert("user_id".to_string(), config.user_id);
    all_params.insert("Timestamp".to_string(), timestamp);
    all_params.extend(params);
    let sign = generate_sign(&all_params, &config.secret);
    all_params.insert("user_sign".to_string(), sign);

    let response = client()?
        .post(format!("{BASE_URL}{path}"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&all_params)
        .send()
        .await
        .map_err(|err| AppError::Message(http_error_message(&err)))?;

    response
        .json()
        .await
        .map_err(|err| AppError::Message(format!("API响应格式不正确: {err}")))
```

- [ ] **Step 8: Update settings copy**

In `src/components/Settings.tsx`, replace the API config description text with:

```tsx
          配置172号卡平台API凭证，用于自动同步订单数据。配置会保存在本机应用数据目录，便于下次使用；当前版本不提供系统级凭据加密。
```

In the about block near the bottom, replace:

```tsx
          <p>流量卡管理系统 v1.0</p>
          <p>本地数据存储，隐私安全</p>
          <p>基于 Electron + React + SQLite 构建</p>
```

with:

```tsx
          <p>流量卡管理系统 v1.0.1</p>
          <p>本地数据存储</p>
          <p>基于 Tauri + React + SQLite 构建</p>
```

- [ ] **Step 9: Verify Task 2 tests**

Run:

```powershell
npm test -- tests/packageConfig.test.ts
```

Expected: PASS.

Run:

```powershell
cargo test --test desktop_commands
```

from `src-tauri`.

Expected: PASS.

- [ ] **Step 10: Verify renderer build with stricter CSP config**

Run:

```powershell
npm run build:renderer
```

Expected: PASS. Existing large chunk warning may remain; the PostCSS module warning should be gone after Task 1.

- [ ] **Step 11: Commit CSP and API reliability changes**

Run:

```powershell
git add tests/packageConfig.test.ts src-tauri/tauri.conf.json src-tauri/src/api172.rs src-tauri/tests/desktop_commands.rs src/components/Settings.tsx
git commit -m "fix: harden csp and 172 api requests"
```

---

### Task 3: Backup Export And Restore Fidelity

**Files:**
- Modify: `src-tauri/src/db/cards.rs`
- Modify: `src-tauri/src/db/customers.rs`
- Modify: `src-tauri/src/db/backup.rs`
- Modify: `src-tauri/tests/backup_finance.rs`

**Interfaces:**
- Produces: `db::cards::get_all_cards(conn: &Connection) -> AppResult<Vec<Card>>`.
- Produces: `db::customers::get_all_customers(conn: &Connection) -> AppResult<Vec<Customer>>`.
- Consumes: existing `cards::map_card`, `customers::map_customer`, and JSON backup command contract.

- [ ] **Step 1: Strengthen backup round-trip test**

In `src-tauri/tests/backup_finance.rs`, update `backup_export_import_round_trips_cards_and_customers` so it stores fixed card timestamps and asserts ID/timestamp preservation:

```rust
    let card = db::cards::create_card(
        &source,
        models::CardInput {
            card_name: Some("测试卡29元100G".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            customer_id: Some(customer.id),
            profit: Some(88.0),
            ..Default::default()
        },
    )
    .unwrap();
    source
        .execute(
            "UPDATE cards SET created_at = '2026-01-02 03:04:05', updated_at = '2026-02-03 04:05:06' WHERE id = ?",
            rusqlite::params![card.id],
        )
        .unwrap();
```

After import, replace the final total-only assertion with:

```rust
    assert_eq!(db::cards::get_cards(&target, None).unwrap().total, 1);
    let restored = db::cards::get_card_by_id(&target, card.id)
        .unwrap()
        .unwrap();
    assert_eq!(restored.id, card.id);
    assert_eq!(restored.customer_id, Some(customer.id));
    assert_eq!(restored.created_at.as_deref(), Some("2026-01-02 03:04:05"));
    assert_eq!(restored.updated_at.as_deref(), Some("2026-02-03 04:05:06"));
```

- [ ] **Step 2: Add backup rollback test**

Add this test to `src-tauri/tests/backup_finance.rs`:

```rust
#[test]
fn backup_import_rolls_back_when_card_references_missing_customer() {
    let target = conn();
    let existing = db::cards::create_card(
        &target,
        models::CardInput {
            card_name: Some("保留卡".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let malformed = serde_json::json!({
        "customers": [],
        "cards": [{
            "id": 100,
            "card_name": "坏备份",
            "carrier": "移动",
            "plan_type": "性价比",
            "customer_id": 999,
            "created_at": "2026-01-01 00:00:00",
            "updated_at": "2026-01-01 00:00:00"
        }]
    });

    assert!(db::backup::import_data(&target, malformed).is_err());
    assert!(db::cards::get_card_by_id(&target, existing.id)
        .unwrap()
        .is_some());
    assert_eq!(db::cards::get_cards(&target, None).unwrap().total, 1);
}
```

- [ ] **Step 3: Run backup tests to verify failure**

Run:

```powershell
cargo test --test backup_finance
```

from `src-tauri`.

Expected: FAIL because card ID/timestamps are not preserved by the current restore path.

- [ ] **Step 4: Add all-card backup query**

In `src-tauri/src/db/cards.rs`, add this public function after `get_cards`:

```rust
pub fn get_all_cards(conn: &Connection) -> AppResult<Vec<Card>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
        FROM cards c
        LEFT JOIN customers cu ON c.customer_id = cu.id
        ORDER BY c.created_at DESC
        "#,
    )?;
    let data = stmt
        .query_map([], map_card)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(data)
}
```

- [ ] **Step 5: Add all-customer backup query**

In `src-tauri/src/db/customers.rs`, add this public function after `get_customers`:

```rust
pub fn get_all_customers(conn: &Connection) -> AppResult<Vec<Customer>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT c.*,
          (SELECT COUNT(*) FROM cards WHERE customer_id = c.id) as card_count,
          (SELECT COALESCE(SUM(profit), 0) FROM cards WHERE customer_id = c.id) as total_profit
        FROM customers c
        ORDER BY c.created_at DESC
        "#,
    )?;
    let data = stmt
        .query_map([], map_customer)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(data)
}
```

- [ ] **Step 6: Use all-record export helpers**

In `src-tauri/src/db/backup.rs`, replace the current `export_data` body with:

```rust
pub fn export_data(conn: &Connection) -> AppResult<Value> {
    let cards = cards::get_all_cards(conn)?;
    let customers = customers::get_all_customers(conn)?;
    Ok(json!({
        "cards": cards,
        "customers": customers,
        "exportTime": chrono::Local::now().to_rfc3339(),
    }))
}
```

- [ ] **Step 7: Add required ID helper**

In `src-tauri/src/db/backup.rs`, add this helper near the existing JSON value helpers:

```rust
fn required_i64(value: &Value, key: &str) -> AppResult<i64> {
    optional_i64(value, key)
        .ok_or_else(|| AppError::Message(format!("数据格式不正确：缺少 {key}")))
}
```

- [ ] **Step 8: Add restore insert helpers**

In `src-tauri/src/db/backup.rs`, add these helpers before `value_string`:

```rust
fn insert_customer_snapshot(conn: &Connection, customer: &Value) -> AppResult<()> {
    conn.execute(
        r#"
        INSERT INTO customers (id, name, phone, wechat, address, notes, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        rusqlite::params![
            required_i64(customer, "id")?,
            value_string(customer, "name"),
            value_string(customer, "phone"),
            value_string(customer, "wechat"),
            value_string(customer, "address"),
            value_string(customer, "notes"),
            value_string(customer, "tags"),
            optional_string(customer, "created_at"),
            optional_string(customer, "updated_at"),
        ],
    )?;
    Ok(())
}

fn insert_card_snapshot(conn: &Connection, card: &Value) -> AppResult<()> {
    conn.execute(
        r#"
        INSERT INTO cards (
          id, card_name, carrier, plan_type, monthly_price, data_amount, region,
          contract_period, renewal_reminder_days, apply_time, activate_time, promo_start,
          promo_end, phone_number, customer_id, profit, status, notes, external_order_id,
          id_card, address, express_company, express_number, first_charge_amount, source,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        rusqlite::params![
            required_i64(card, "id")?,
            value_string(card, "card_name"),
            value_string(card, "carrier"),
            value_string(card, "plan_type"),
            value_f64(card, "monthly_price"),
            value_string(card, "data_amount"),
            optional_string(card, "region"),
            value_i64(card, "contract_period"),
            value_i64(card, "renewal_reminder_days").max(30),
            value_string(card, "apply_time"),
            value_string(card, "activate_time"),
            value_string(card, "promo_start"),
            value_string(card, "promo_end"),
            value_string(card, "phone_number"),
            optional_i64(card, "customer_id"),
            value_f64(card, "profit"),
            value_string(card, "status").if_empty("使用中"),
            value_string(card, "notes"),
            optional_string(card, "external_order_id"),
            optional_string(card, "id_card"),
            optional_string(card, "address"),
            optional_string(card, "express_company"),
            optional_string(card, "express_number"),
            value_f64(card, "first_charge_amount"),
            optional_string(card, "source"),
            optional_string(card, "created_at"),
            optional_string(card, "updated_at"),
        ],
    )?;
    Ok(())
}
```

- [ ] **Step 9: Use snapshot helpers in import**

In `import_data`, replace the customer insert loop with:

```rust
        for customer in customers_data {
            insert_customer_snapshot(conn, customer)?;
        }
```

Replace the card loop that calls `cards::create_card` with:

```rust
        for card in cards_data {
            insert_card_snapshot(conn, card)?;
        }
```

Remove `use crate::models::CardInput;` from the top of `backup.rs` because it is no longer used.

- [ ] **Step 10: Verify backup tests pass**

Run:

```powershell
cargo test --test backup_finance
```

from `src-tauri`.

Expected: PASS.

- [ ] **Step 11: Commit backup fidelity changes**

Run:

```powershell
git add src-tauri/src/db/cards.rs src-tauri/src/db/customers.rs src-tauri/src/db/backup.rs src-tauri/tests/backup_finance.rs
git commit -m "fix: preserve backup card identifiers"
```

---

### Task 4: Imported Promo End Calculation

**Files:**
- Modify: `src-tauri/src/db/imports.rs`
- Modify: `src-tauri/tests/plans_imports.rs`

**Interfaces:**
- Produces: `calculate_promo_end(activate_time: &str, promo_period: i64) -> Option<String>` inside `imports.rs`.
- Produces: `import_promo_end(existing: Option<&Card>, matched_plan: Option<&Plan>, activate_time: &str) -> Option<String>` inside `imports.rs`.
- Consumes: existing `plans::match_plan`, `CardInput`, and import status preservation behavior.

- [ ] **Step 1: Replace old no-calc import test**

In `src-tauri/tests/plans_imports.rs`, rename `order_import_does_not_calculate_promo_end_from_matched_plan` to:

```rust
fn order_import_calculates_missing_promo_end_from_matched_plan()
```

In that test, change the plan name and order ID strings so the test reads as the new behavior:

```rust
"name": "自动到期测试移动卡【29元235G】",
"172订单号": "172-CALC-END",
"套餐": "自动到期测试移动卡【29元235G】",
```

Replace the final promo end assertion with:

```rust
    assert_eq!(cards[0].promo_end.as_deref(), Some("2026-11-30"));
```

The activation date in that test stays `2026-06-10`, and a 6-month promo period should calculate to `2026-11-30`.

- [ ] **Step 2: Add no-overwrite import test**

Add this test to `src-tauri/tests/plans_imports.rs`:

```rust
#[test]
fn order_import_does_not_overwrite_existing_promo_end() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P007",
            "name": "保留到期测试移动卡【29元235G】",
            "carrier": "移动",
            "monthlyPrice": 29,
            "dataAmount": 235,
            "promoPeriod": 6,
            "contractPeriod": 24,
            "firstCharge": 50,
            "status": "在售"
        })],
    )
    .unwrap();

    let existing = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("保留到期测试移动卡【29元235G】".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            monthly_price: Some(29.0),
            data_amount: Some("235G".into()),
            external_order_id: Some("172-KEEP-END".into()),
            promo_end: Some("2026-10-31".into()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    db::imports::import_from_172(
        &conn,
        vec![json!({
            "订单状态": "已结算",
            "激活状态": "已激活",
            "172订单号": "172-KEEP-END",
            "套餐": "保留到期测试移动卡【29元235G】",
            "金额": "100",
            "姓名": "孙七",
            "按号码发货": "13500135000",
            "省份": "福建",
            "城市": "漳州",
            "下单时间": "2026-06-01",
            "激活时间": "2026-06-10"
        })],
    )
    .unwrap();

    let updated = db::cards::get_card_by_id(&conn, existing.id).unwrap().unwrap();
    assert_eq!(updated.promo_end.as_deref(), Some("2026-10-31"));
}
```

- [ ] **Step 3: Add missing activation import test**

Add this test to `src-tauri/tests/plans_imports.rs`:

```rust
#[test]
fn order_import_keeps_promo_end_empty_without_activation_time() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P008",
            "name": "无激活测试移动卡【29元235G】",
            "carrier": "移动",
            "monthlyPrice": 29,
            "dataAmount": 235,
            "promoPeriod": 6,
            "contractPeriod": 24,
            "firstCharge": 50,
            "status": "在售"
        })],
    )
    .unwrap();

    db::imports::import_from_172(
        &conn,
        vec![json!({
            "订单状态": "已结算",
            "激活状态": "已激活",
            "172订单号": "172-NO-ACTIVATE",
            "套餐": "无激活测试移动卡【29元235G】",
            "金额": "100",
            "姓名": "周八",
            "按号码发货": "13400134000",
            "省份": "福建",
            "城市": "漳州",
            "下单时间": "2026-06-01"
        })],
    )
    .unwrap();

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].promo_end.as_deref(), Some(""));
}
```

- [ ] **Step 4: Run import tests to verify failure**

Run:

```powershell
cargo test --test plans_imports
```

from `src-tauri`.

Expected: FAIL because import currently does not calculate missing `promo_end`.

- [ ] **Step 5: Add promo end helpers**

In `src-tauri/src/db/imports.rs`, add these helpers after `build_import_card`:

```rust
fn import_promo_end(
    existing: Option<&Card>,
    matched_plan: Option<&Plan>,
    activate_time: &str,
) -> Option<String> {
    if let Some(existing_end) = existing
        .and_then(|card| card.promo_end.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(existing_end.to_string());
    }

    let plan = matched_plan?;
    calculate_promo_end(activate_time, plan.promo_period)
}

fn calculate_promo_end(activate_time: &str, promo_period: i64) -> Option<String> {
    if promo_period <= 0 {
        return None;
    }
    let date_text = activate_time.trim().get(0..10).unwrap_or(activate_time.trim());
    let start = chrono::NaiveDate::parse_from_str(date_text, "%Y-%m-%d").ok()?;
    let months = u32::try_from(promo_period).ok()?;
    let end = start
        .checked_add_months(chrono::Months::new(months))?
        .pred_opt()?;
    Some(end.format("%Y-%m-%d").to_string())
}
```

- [ ] **Step 6: Use helper in 172 import**

In `import_from_172`, after `let activate_time = value_string(row, "激活时间");`, add:

```rust
            let promo_end = import_promo_end(
                existing.as_ref(),
                matched_plan.as_ref(),
                &activate_time,
            );
```

Replace the `promo_end` field in the 172 `CardInput` with:

```rust
                    promo_end,
```

- [ ] **Step 7: Use helper in Haoyi import**

In `import_from_haoyi`, after `let activate_time = excel_date_to_string(&value_string(row, "入网时间"));`, add:

```rust
            let promo_end = import_promo_end(
                existing.as_ref(),
                matched_plan.as_ref(),
                &activate_time,
            );
```

Replace the `promo_end` field in the Haoyi `CardInput` with:

```rust
                    promo_end,
```

- [ ] **Step 8: Verify import tests pass**

Run:

```powershell
cargo test --test plans_imports
```

from `src-tauri`.

Expected: PASS.

- [ ] **Step 9: Commit promo end import changes**

Run:

```powershell
git add src-tauri/src/db/imports.rs src-tauri/tests/plans_imports.rs
git commit -m "fix: calculate imported promo end dates"
```

---

### Task 5: Final Verification And Release Notes

**Files:**
- Modify: `README.md`
- Modify: `用户使用说明.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-4.
- Produces: user-facing notes for stronger checks, API timeout, backup fidelity, and imported promo-end fill.

- [ ] **Step 1: Update README release behavior notes**

In `README.md`, add this paragraph after the automatic update paragraph:

```md
稳定性优化说明：发布流程会先运行前端测试、TypeScript 类型检查和 Rust 测试；172 号卡 API 请求设置了超时并会更清楚地提示空凭证、网络失败和响应格式问题；JSON 备份恢复会保留卡片 ID 和时间戳；订单导入在匹配到套餐且有激活时间时会自动补全缺失的优惠到期日。
```

- [ ] **Step 2: Update user instructions backup/API note**

In `用户使用说明.md`, add this paragraph in the data/backup section:

```md
从本版本开始，JSON 备份恢复会保留卡片原始 ID 和创建/更新时间。订单导入如果匹配到套餐模板并且订单包含激活时间，会自动计算缺失的优惠到期日；已手动填写的到期日不会被覆盖。
```

- [ ] **Step 3: Run full frontend verification**

Run:

```powershell
npm test
npm run typecheck
npm run build:renderer
```

Expected:

- `npm test`: PASS.
- `npm run typecheck`: PASS.
- `npm run build:renderer`: PASS. Existing large chunk warning may remain.

- [ ] **Step 4: Run full Rust verification**

Run:

```powershell
cargo test
```

from `src-tauri`.

Expected: PASS.

- [ ] **Step 5: Check git status for unrelated changes**

Run:

```powershell
git status --short
```

Expected: Only intended files from Task 5 are unstaged, plus any pre-existing user changes such as `build/icon.*`, `data/172-plans.json`, backup JSON files, or `scripts/scrape-172-auto.js`. Do not stage pre-existing unrelated files.

- [ ] **Step 6: Commit documentation and final verified state**

Run:

```powershell
git add README.md 用户使用说明.md
git commit -m "docs: describe stability release changes"
```

- [ ] **Step 7: Report final verification evidence**

In the handoff message, include:

- `npm test` result.
- `npm run typecheck` result.
- `npm run build:renderer` result.
- `cargo test` result.
- Any remaining warnings, especially the Vite large chunk warning if it remains.
- Any unrelated pre-existing dirty files left untouched.

---

## Plan Self-Review

Spec coverage:

- Release gates: Task 1.
- PostCSS warning: Task 1.
- CSP hardening: Task 2.
- API timeout and input validation: Task 2.
- Honest credential storage copy without new dependency: Task 2.
- Backup export/import fidelity: Task 3.
- Imported promo end calculation: Task 4.
- Documentation and full verification: Task 5.

No broad UI restructuring, bundle splitting, clippy hard gate, or secret-store migration is included.

Type consistency:

- `REQUEST_TIMEOUT_SECS`, `validate_config`, and `validate_order_id` are produced in Task 2 before their tests are expected to pass.
- `get_all_cards` and `get_all_customers` are produced in Task 3 before `backup::export_data` consumes them.
- `import_promo_end` and `calculate_promo_end` are private helpers inside `imports.rs` and are consumed by both import paths in the same task.

Verification coverage:

- Each behavior-changing task has a failing-test step before implementation and a passing-test step after implementation.
- Final verification runs all commands required by the approved spec.
