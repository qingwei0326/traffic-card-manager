use crate::error::{AppError, AppResult};
use crate::models::{Plan, PlanImportResult};
use rusqlite::{params, Connection, Row};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn import_plans(conn: &Connection, plans: Vec<Value>) -> AppResult<PlanImportResult> {
    import_plan_values(conn, plans, "号易平台".to_string(), None)
}

pub fn import_plans_from_file(
    conn: &Connection,
    app_handle: &tauri::AppHandle,
    file_path: String,
) -> AppResult<PlanImportResult> {
    let path = resolve_plan_file(app_handle, &file_path)?;
    let raw = std::fs::read_to_string(path)?;
    let plans: Vec<Value> = serde_json::from_str(&raw)?;
    if plans.is_empty() {
        return Ok(PlanImportResult {
            imported: 0,
            updated: 0,
            backfilled: 0,
            total: 0,
            source: None,
        });
    }
    let first = &plans[0];
    let is_172 = first.get("settlementRules").is_some()
        || first.get("taocanDetail").is_some()
        || (first.get("price").is_some() && first.get("data").is_some());
    let source = if is_172 {
        "172号卡平台"
    } else {
        "号易平台"
    };
    import_plan_values(conn, plans, source.to_string(), Some(source.to_string()))
}

pub fn sync_plans_from_172_api(
    conn: &Connection,
    products: Vec<Value>,
) -> AppResult<PlanImportResult> {
    import_plan_values(conn, products, "172号卡平台".to_string(), None)
}

pub fn get_all_plans(conn: &Connection) -> AppResult<Vec<Plan>> {
    let mut stmt = conn.prepare("SELECT * FROM plans ORDER BY carrier, monthly_price")?;
    let plans = stmt
        .query_map([], map_plan)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(plans)
}

pub fn match_plan(conn: &Connection, card_name: &str) -> AppResult<Option<Plan>> {
    let mut exact = conn.prepare("SELECT * FROM plans WHERE name = ? LIMIT 1")?;
    let mut exact_rows = exact.query(params![card_name])?;
    if let Some(row) = exact_rows.next()? {
        return Ok(Some(map_plan(row)?));
    }

    let clean_card = clean_plan_name(card_name);
    let candidates = get_all_plans(conn)?
        .into_iter()
        .filter(|plan| {
            let clean_plan = clean_plan_name(&plan.name);
            (!clean_card.is_empty() && plan.name.contains(&clean_card))
                || (!clean_plan.is_empty() && card_name.contains(&clean_plan))
        })
        .collect::<Vec<_>>();

    Ok(pick_compatible_plan(card_name, candidates))
}

pub fn backfill_card_plan_fields(conn: &Connection) -> AppResult<i64> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, card_name, contract_period, activate_time, promo_start
        FROM cards
        WHERE card_name IS NOT NULL
          AND card_name != ''
          AND (
            contract_period IS NULL OR contract_period = 0
            OR promo_start IS NULL OR promo_start = ''
          )
        "#,
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>("id")?,
                row.get::<_, String>("card_name")?,
                row.get::<_, Option<i64>>("contract_period")?,
                row.get::<_, Option<String>>("activate_time")?,
                row.get::<_, Option<String>>("promo_start")?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut updated = 0;
    for (id, card_name, contract_period, activate_time, promo_start) in rows {
        let Some(plan) = match_plan(conn, &card_name)? else {
            continue;
        };
        let mut assignments = Vec::<String>::new();
        let mut values = Vec::<rusqlite::types::Value>::new();

        if contract_period.unwrap_or(0) <= 0 && plan.contract_period > 0 {
            assignments.push("contract_period = ?".into());
            values.push(rusqlite::types::Value::Integer(plan.contract_period));
        }

        if plan.promo_period > 0 {
            if promo_start.as_deref().unwrap_or("").trim().is_empty()
                && activate_time.as_deref().unwrap_or("").trim() != ""
            {
                assignments.push("promo_start = ?".into());
                values.push(rusqlite::types::Value::Text(activate_time.clone().unwrap()));
            }
        }

        if assignments.is_empty() {
            continue;
        }
        assignments.push("updated_at = datetime('now', 'localtime')".into());
        let sql = format!("UPDATE cards SET {} WHERE id = ?", assignments.join(", "));
        values.push(rusqlite::types::Value::Integer(id));
        conn.execute(&sql, rusqlite::params_from_iter(values.iter()))?;
        updated += 1;
    }

    Ok(updated)
}

pub fn delete_plan(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM plans WHERE id = ?", params![id])?;
    Ok(())
}

pub(crate) fn parse_monthly_price(plan_name: &str) -> f64 {
    let Some(index) = plan_name.find('元') else {
        return 0.0;
    };
    let prefix = &plan_name[..index];
    let number = prefix
        .chars()
        .rev()
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    number.parse::<f64>().unwrap_or(0.0)
}

pub(crate) fn parse_data_amount(plan_name: &str) -> String {
    let Some(g_index) = plan_name.find('G') else {
        return String::new();
    };
    let prefix = &plan_name[..g_index];
    let number = prefix
        .chars()
        .rev()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    if number.is_empty() {
        String::new()
    } else {
        format!("{number}G")
    }
}

pub(crate) fn parse_data_amount_number(value: &str) -> i64 {
    value
        .chars()
        .filter(|ch| ch.is_ascii_digit())
        .collect::<String>()
        .parse::<i64>()
        .unwrap_or(0)
}

pub(crate) fn parse_carrier(plan_name: &str) -> String {
    if plan_name.contains("电信") || plan_name.contains("CT") {
        "电信".into()
    } else if plan_name.contains("联通") || plan_name.contains("CU") {
        "联通".into()
    } else if plan_name.contains("移动") || plan_name.contains("CM") {
        "移动".into()
    } else if plan_name.contains("广电") {
        "广电".into()
    } else {
        "未知".into()
    }
}

pub(crate) fn parse_plan_type(plan_name: &str) -> String {
    if plan_name.contains("长期") || plan_name.contains("合约") || plan_name.contains('年') {
        return "长期套餐".into();
    }
    let price = parse_monthly_price(plan_name);
    let data = parse_data_amount_number(&parse_data_amount(plan_name));
    if price > 0.0 && price <= 19.0 {
        "低价套餐".into()
    } else if price > 0.0 && price <= 29.0 {
        "性价比".into()
    } else if price >= 39.0 || data >= 200 {
        "大流量".into()
    } else {
        "性价比".into()
    }
}

fn import_plan_values(
    conn: &Connection,
    plans: Vec<Value>,
    source: String,
    result_source: Option<String>,
) -> AppResult<PlanImportResult> {
    let mut imported = 0;
    let mut updated = 0;
    let tx = conn.unchecked_transaction()?;
    let result = (|| {
        for value in &plans {
            let plan = normalized_plan(value, &source);
            if plan.code.is_empty() && plan.name.is_empty() {
                continue;
            }
            let existing_id = if plan.code.is_empty() {
                None
            } else {
                conn.query_row(
                    "SELECT id FROM plans WHERE code = ?",
                    params![plan.code],
                    |row| row.get::<_, i64>(0),
                )
                .ok()
            };

            if let Some(id) = existing_id {
                conn.execute(
                    r#"
                    UPDATE plans SET
                      grab_code = COALESCE(NULLIF(?, ''), grab_code),
                      name = COALESCE(NULLIF(?, ''), name),
                      carrier = COALESCE(NULLIF(?, ''), carrier),
                      monthly_price = COALESCE(NULLIF(?, 0), monthly_price),
                      data_amount = COALESCE(NULLIF(?, 0), data_amount),
                      promo_period = COALESCE(NULLIF(?, 0), promo_period),
                      contract_period = COALESCE(NULLIF(?, 0), contract_period),
                      first_charge = COALESCE(NULLIF(?, 0), first_charge),
                      activation = COALESCE(NULLIF(?, ''), activation),
                      region = COALESCE(NULLIF(?, ''), region),
                      commission = COALESCE(NULLIF(?, ''), commission),
                      note = COALESCE(NULLIF(?, ''), note),
                      age_limit = COALESCE(NULLIF(?, ''), age_limit),
                      forbid_regions = COALESCE(NULLIF(?, ''), forbid_regions),
                      express = COALESCE(NULLIF(?, ''), express),
                      source = ?,
                      sale_status = COALESCE(NULLIF(?, ''), sale_status)
                    WHERE id = ?
                    "#,
                    params![
                        plan.grab_code,
                        plan.name,
                        plan.carrier,
                        plan.monthly_price,
                        plan.data_amount,
                        plan.promo_period,
                        plan.contract_period,
                        plan.first_charge,
                        plan.activation,
                        plan.region,
                        plan.commission,
                        plan.note,
                        plan.age_limit,
                        plan.forbid_regions,
                        plan.express,
                        source,
                        plan.sale_status,
                        id
                    ],
                )?;
                updated += 1;
            } else {
                conn.execute(
                    r#"
                    INSERT INTO plans (code, grab_code, name, carrier, monthly_price, data_amount,
                      promo_period, contract_period, first_charge, activation, region, commission, note,
                      age_limit, forbid_regions, express, source, sale_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                    params![
                        plan.code,
                        plan.grab_code,
                        plan.name,
                        plan.carrier,
                        plan.monthly_price,
                        plan.data_amount,
                        plan.promo_period,
                        plan.contract_period,
                        plan.first_charge,
                        plan.activation,
                        plan.region,
                        plan.commission,
                        plan.note,
                        plan.age_limit,
                        plan.forbid_regions,
                        plan.express,
                        source,
                        plan.sale_status
                    ],
                )?;
                imported += 1;
            }
        }
        // 回填与导入同属一次操作：回填失败必须整体回滚，
        // 否则会留下「套餐导入了、卡片字段没补上」的半截状态
        let backfilled = backfill_card_plan_fields(&tx)?;
        Ok::<_, crate::error::AppError>(backfilled)
    })();

    let backfilled = match result {
        Ok(value) => {
            tx.commit()?;
            value
        }
        // tx 在这里被 drop，导入与回填一起回滚
        Err(err) => return Err(err),
    };

    Ok(PlanImportResult {
        imported,
        updated,
        backfilled,
        total: plans.len() as i64,
        source: result_source,
    })
}

fn map_plan(row: &Row<'_>) -> rusqlite::Result<Plan> {
    Ok(Plan {
        id: row.get("id")?,
        code: row.get("code")?,
        grab_code: row.get("grab_code")?,
        name: row.get("name")?,
        carrier: row.get("carrier")?,
        monthly_price: row.get::<_, Option<f64>>("monthly_price")?.unwrap_or(0.0),
        data_amount: row.get::<_, Option<i64>>("data_amount")?.unwrap_or(0),
        promo_period: row.get::<_, Option<i64>>("promo_period")?.unwrap_or(0),
        contract_period: row.get::<_, Option<i64>>("contract_period")?.unwrap_or(0),
        first_charge: row.get::<_, Option<i64>>("first_charge")?.unwrap_or(0),
        activation: row.get("activation")?,
        region: row.get("region")?,
        commission: row.get("commission")?,
        note: row.get("note")?,
        age_limit: row.get("age_limit")?,
        forbid_regions: row.get("forbid_regions")?,
        express: row.get("express")?,
        source: row.get("source")?,
        sale_status: row.get("sale_status")?,
        created_at: row.get("created_at")?,
    })
}

struct NormalizedPlan {
    code: String,
    grab_code: String,
    name: String,
    carrier: String,
    monthly_price: f64,
    data_amount: i64,
    promo_period: i64,
    contract_period: i64,
    first_charge: i64,
    activation: String,
    region: String,
    commission: String,
    note: String,
    age_limit: String,
    forbid_regions: String,
    express: String,
    sale_status: String,
}

fn normalized_plan(value: &Value, source: &str) -> NormalizedPlan {
    let code = value_string_any(value, &["code", "ProductID", "productId"]);
    let note = if source == "172号卡平台" {
        [
            value_string(value, "taocanDetail"),
            value_string(value, "settlementRules"),
            value_string(value, "keywords"),
            value_string(value, "voice"),
        ]
        .into_iter()
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
    } else {
        value_string(value, "note")
    };
    let status = value_string_any(value, &["status", "Status", "saleStatus"]);
    NormalizedPlan {
        code,
        grab_code: value_string_any(value, &["grabCode", "grab_code", "GrabCode"]),
        name: value_string_any(value, &["name", "ProductName", "productName"]),
        carrier: value_string_any(value, &["carrier", "Operator", "operator"]),
        monthly_price: value_f64_any(value, &["monthlyPrice", "monthly_price", "price", "Price"]),
        data_amount: value_i64_from_any(value, &["dataAmount", "data_amount", "data", "Data"]),
        promo_period: value_i64_from_any(value, &["promoPeriod", "promo_period", "PromoPeriod"]),
        contract_period: value_i64_from_any(value, &["contractPeriod", "contract_period", "ContractPeriod"]),
        first_charge: value_i64_from_any(value, &["firstCharge", "first_charge", "FirstCharge"]),
        activation: value_string_any(value, &["activation", "Activation"]),
        region: value_string_any(value, &["region", "Region"])
            .if_empty("全国"),
        commission: value_string_any(value, &["commission", "Commission"]),
        note,
        age_limit: value_string_any(value, &["ageLimit", "age_limit", "AgeLimit"]),
        forbid_regions: value_string_any(value, &["forbidRegions", "forbid_regions", "ForbidRegions"]),
        express: value_string_any(value, &["express", "Express"]),
        sale_status: if status.contains("下架") || status.contains("停售") {
            "停售".into()
        } else {
            status.if_empty("在售")
        },
    }
}

fn pick_compatible_plan(card_name: &str, mut candidates: Vec<Plan>) -> Option<Plan> {
    candidates.retain(|plan| is_compatible_plan_match(card_name, plan));
    candidates.sort_by_key(|plan| -((plan.promo_period + plan.contract_period) as isize));
    candidates.into_iter().next()
}

fn is_compatible_plan_match(card_name: &str, plan: &Plan) -> bool {
    let card_carrier = parse_carrier(card_name);
    let card_price = parse_monthly_price(card_name);
    let card_data = parse_data_amount_number(&parse_data_amount(card_name));
    let plan_price = plan.monthly_price;
    let plan_data = plan.data_amount;

    if card_carrier != "未知" && plan.carrier.as_deref().unwrap_or("") != card_carrier {
        return false;
    }
    if card_price > 0.0 && plan_price > 0.0 && (card_price - plan_price).abs() > 0.01 {
        return false;
    }
    if card_data > 0 && plan_data > 0 && card_data != plan_data {
        return false;
    }
    true
}

fn clean_plan_name(value: &str) -> String {
    let mut result = String::new();
    let mut in_bracket = false;
    for ch in value.chars() {
        if ch == '【' {
            in_bracket = true;
            continue;
        }
        if ch == '】' {
            in_bracket = false;
            continue;
        }
        if !in_bracket {
            result.push(ch);
        }
    }
    result.trim().to_string()
}

/// 允许作为套餐模板导入的文件名白名单。
/// 与 `tauri.conf.json` 的 `bundle.resources` 声明保持一一对应，
/// 任何未在此列表中的文件一律拒绝读取，避免前端借 `plans_import_from_file`
/// 传入任意绝对路径造成任意文件读取。
const ALLOWED_PLAN_FILES: &[&str] = &["172-plans.json", "haoyi-plans-parsed.json"];

/// 校验 `file_path` 是白名单内的「纯文件名」。
///
/// 拒绝一切包含路径分隔符（`/`、`\`）或上级目录引用（`..`）的输入，
/// 也拒绝含多余路径组件的写法（如 `data/172-plans.json` 会被要求只传文件名）。
fn allowed_plan_file_name(file_path: &str) -> AppResult<String> {
    let trimmed = file_path.trim();
    let reject = |reason: &str| -> AppResult<String> {
        Err(AppError::Message(format!(
            "不支持的套餐文件: {file_path}（{reason}）"
        )))
    };

    if trimmed.is_empty() {
        return reject("文件名为空");
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return reject("只允许白名单内的纯文件名，禁止路径分隔符与 ..");
    }
    if PathBuf::from(trimmed).components().count() != 1 {
        return reject("只允许白名单内的纯文件名");
    }

    ALLOWED_PLAN_FILES
        .iter()
        .find(|allowed| **allowed == trimmed)
        .map(|allowed| (*allowed).to_string())
        .ok_or_else(|| {
            AppError::Message(format!("不支持的套餐文件: {file_path}（不在白名单内）"))
        })
}

/// 将 `candidate` 规范化后确认其确实位于 `root` 目录之内。
///
/// `canonicalize()` 会展开符号链接，再用 `starts_with` 做前缀校验，
/// 可防止通过软链接绕过根目录限制。
fn canonicalize_within_root(root: &Path, candidate: &Path) -> Option<PathBuf> {
    let canonical_root = root.canonicalize().ok()?;
    let canonical_target = candidate.canonicalize().ok()?;
    if canonical_target.starts_with(canonical_root) {
        Some(canonical_target)
    } else {
        None
    }
}

/// 将套餐模板文件名解析为实际可读路径。
///
/// 解析顺序：打包资源目录 → 当前工作目录下的 `data/` → 当前工作目录。
/// 每一步都必须通过白名单文件名 + canonicalize 根目录前缀校验。
fn resolve_plan_file(app_handle: &tauri::AppHandle, file_path: &str) -> AppResult<PathBuf> {
    let file_name = allowed_plan_file_name(file_path)?;

    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        roots.push(resource_dir);
    }
    if let Ok(cwd) = std::env::current_dir() {
        // 兼容开发态 ./data/*.json 的目录布局。
        roots.push(cwd.join("data"));
        roots.push(cwd);
    }

    let rejected = AppError::Message(format!("不支持的套餐文件: {file_path}"));
    for root in roots {
        let Some(resolved) = canonicalize_within_root(&root, &root.join(&file_name)) else {
            continue;
        };
        if resolved.is_file() {
            return Ok(resolved);
        }
    }

    Err(rejected)
}

fn value_string_any(value: &Value, keys: &[&str]) -> String {
    keys.iter()
        .map(|key| value_string(value, key))
        .find(|text| !text.is_empty())
        .unwrap_or_default()
}

fn value_string(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(flag)) => flag.to_string(),
        _ => String::new(),
    }
}

fn value_f64_any(value: &Value, keys: &[&str]) -> f64 {
    keys.iter()
        .find_map(|key| value.get(key))
        .and_then(|value| match value {
            Value::Number(number) => number.as_f64(),
            Value::String(text) => parse_first_number(text),
            _ => None,
        })
        .unwrap_or(0.0)
}

fn value_i64_from_any(value: &Value, keys: &[&str]) -> i64 {
    let raw = value_string_any(value, keys);
    if raw.is_empty() {
        value_f64_any(value, keys) as i64
    } else {
        parse_data_amount_number(&raw)
    }
}

fn parse_first_number(text: &str) -> Option<f64> {
    let mut number = String::new();
    let mut started = false;
    for ch in text.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            number.push(ch);
            started = true;
        } else if started {
            break;
        }
    }
    number.parse::<f64>().ok()
}

trait EmptyDefault {
    fn if_empty(self, default: &str) -> String;
}

impl EmptyDefault for String {
    fn if_empty(self, default: &str) -> String {
        if self.is_empty() {
            default.to_string()
        } else {
            self
        }
    }
}
