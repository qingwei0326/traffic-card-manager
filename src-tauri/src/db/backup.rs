use crate::db::{cards, customers, migrations, plans};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

/// 备份文件里标记 payload 校验和的字段名。
const CHECKSUM_KEY: &str = "checksum";
const SCHEMA_VERSION_KEY: &str = "schemaVersion";

pub fn export_data(conn: &Connection) -> AppResult<Value> {
    let mut payload = json!({
        SCHEMA_VERSION_KEY: migrations::latest_version(),
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "cards": cards::get_all_cards(conn)?,
        "customers": customers::get_all_customers(conn)?,
        "plans": plans::get_all_plans(conn)?,
    });

    // 校验和必须在 checksum 字段**插入之前**算，否则自己算自己永远对不上
    let checksum = payload_checksum(&payload)?;
    if let Some(map) = payload.as_object_mut() {
        map.insert(CHECKSUM_KEY.to_string(), json!(checksum));
    }

    Ok(payload)
}

/// 导入备份。
///
/// `db_path` 为 `Some` 时会先整库复制一份快照再动数据——导入是全量覆盖，
/// 没有退路的操作不该允许发生。传 `None`（内存库，仅测试用）则跳过快照。
pub fn import_data(conn: &Connection, db_path: Option<&Path>, data: Value) -> AppResult<Value> {
    let cards_data = data
        .get("cards")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Message("数据格式不正确：缺少 cards 数组".into()))?;
    let customers_data = data
        .get("customers")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Message("数据格式不正确：缺少 customers 数组".into()))?;
    // plans 是后加进备份格式的，老备份没有。没有就不动 plans，
    // 绝不能反过来把现有套餐表清掉——那会让老备份变成一次数据销毁。
    let plans_data = data.get("plans").and_then(Value::as_array);

    verify_schema_version(&data)?;
    verify_checksum(&data)?;

    // 快照必须在开事务之前做：事务一旦开始，文件就不再处于一致状态
    let backup_path = snapshot_db_file(db_path, "pre-import")?;

    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM cards", [])?;
    tx.execute("DELETE FROM customers", [])?;
    if plans_data.is_some() {
        tx.execute("DELETE FROM plans", [])?;
    }

    for customer in customers_data {
        insert_customer_snapshot(&tx, customer)?;
    }
    for card in cards_data {
        insert_card_snapshot(&tx, card)?;
    }
    if let Some(plans) = plans_data {
        for plan in plans {
            insert_plan_snapshot(&tx, plan)?;
        }
    }
    tx.commit()?;

    Ok(json!({
        "success": true,
        "cards": cards_data.len(),
        "customers": customers_data.len(),
        "plans": plans_data.map(|plans| plans.len()).unwrap_or(0),
        "backupPath": backup_path,
    }))
}

/// 把数据库文件复制一份到 `<db 目录>/backups/<prefix>-<时间戳>.db`。
///
/// 复制失败就让调用方失败：拿不到退路还要清全表/改 schema，是不可接受的。
///
/// `pub(crate)`：迁移模块也复用同一套快照策略（`migrations.rs` 在跑前向迁移前先留退路），
/// 用不同的 `prefix`（`pre-import` / `pre-migration`）区分两种快照的用途。
pub(crate) fn snapshot_db_file(db_path: Option<&Path>, prefix: &str) -> AppResult<Option<String>> {
    let Some(db_path) = db_path else {
        return Ok(None);
    };
    if !db_path.exists() {
        return Ok(None);
    }

    let backup_dir = match db_path.parent() {
        Some(parent) => parent.join("backups"),
        None => Path::new("backups").to_path_buf(),
    };
    fs::create_dir_all(&backup_dir)?;

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let dest = backup_dir.join(format!("{prefix}-{stamp}.db"));
    fs::copy(db_path, &dest)?;

    Ok(Some(dest.to_string_lossy().to_string()))
}

fn verify_schema_version(data: &Value) -> AppResult<()> {
    let Some(version) = data.get(SCHEMA_VERSION_KEY).and_then(Value::as_u64) else {
        // 老备份没写版本号，按当前基线处理
        return Ok(());
    };

    let latest = migrations::latest_version() as u64;
    if version > latest {
        return Err(AppError::Message(format!(
            "备份文件的 schema 版本为 {version}，高于当前应用支持的 {latest}。\
             请升级应用后再导入，否则可能丢失备份中新增的数据。"
        )));
    }

    Ok(())
}

fn verify_checksum(data: &Value) -> AppResult<()> {
    let Some(expected) = data.get(CHECKSUM_KEY).and_then(Value::as_str) else {
        return Ok(());
    };

    let mut payload = data.clone();
    if let Some(map) = payload.as_object_mut() {
        map.remove(CHECKSUM_KEY);
    }
    let actual = payload_checksum(&payload)?;

    if actual != expected {
        return Err(AppError::Message(
            "备份文件校验失败：内容与校验和不符，可能已损坏或被修改。已中止导入，现有数据未改动。"
                .into(),
        ));
    }

    Ok(())
}

fn payload_checksum(payload: &Value) -> AppResult<String> {
    // serde_json 的 Map 默认按 key 排序，同一份数据在同一版本里序列化结果稳定
    let bytes = serde_json::to_vec(payload)?;
    Ok(format!("{:x}", Sha256::digest(&bytes)))
}

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
            optional_i64(card, "renewal_reminder_days").unwrap_or(30),
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

fn insert_plan_snapshot(conn: &Connection, plan: &Value) -> AppResult<()> {
    conn.execute(
        r#"
        INSERT INTO plans (
          id, code, grab_code, name, carrier, monthly_price, data_amount,
          promo_period, contract_period, first_charge, activation, region,
          commission, note, age_limit, forbid_regions, express, source,
          sale_status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        rusqlite::params![
            required_i64(plan, "id")?,
            optional_string(plan, "code"),
            optional_string(plan, "grab_code"),
            value_string(plan, "name"),
            optional_string(plan, "carrier"),
            value_f64(plan, "monthly_price"),
            value_i64(plan, "data_amount"),
            value_i64(plan, "promo_period"),
            value_i64(plan, "contract_period"),
            value_i64(plan, "first_charge"),
            optional_string(plan, "activation"),
            optional_string(plan, "region"),
            optional_string(plan, "commission"),
            optional_string(plan, "note"),
            optional_string(plan, "age_limit"),
            optional_string(plan, "forbid_regions"),
            optional_string(plan, "express"),
            optional_string(plan, "source"),
            optional_string(plan, "sale_status"),
            optional_string(plan, "created_at"),
        ],
    )?;
    Ok(())
}

fn value_string(value: &Value, key: &str) -> String {
    optional_string(value, key).unwrap_or_default()
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    match value.get(key) {
        Some(Value::String(text)) if !text.is_empty() => Some(text.clone()),
        Some(Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

fn value_i64(value: &Value, key: &str) -> i64 {
    optional_i64(value, key).unwrap_or(0)
}

fn optional_i64(value: &Value, key: &str) -> Option<i64> {
    match value.get(key) {
        Some(Value::Number(number)) => number.as_i64(),
        Some(Value::String(text)) => text.parse().ok(),
        _ => None,
    }
}

fn required_i64(value: &Value, key: &str) -> AppResult<i64> {
    optional_i64(value, key)
        .ok_or_else(|| AppError::Message(format!("数据格式不正确：缺少 {key}")))
}

fn value_f64(value: &Value, key: &str) -> f64 {
    match value.get(key) {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(Value::String(text)) => text.parse().unwrap_or(0.0),
        _ => 0.0,
    }
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
