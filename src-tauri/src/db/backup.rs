use crate::db::{cards, customers};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn export_data(conn: &Connection) -> AppResult<Value> {
    let cards = cards::get_all_cards(conn)?;
    let customers = customers::get_all_customers(conn)?;
    Ok(json!({
        "cards": cards,
        "customers": customers,
        "exportTime": chrono::Local::now().to_rfc3339(),
    }))
}

pub fn import_data(conn: &Connection, data: Value) -> AppResult<Value> {
    let cards_data = data
        .get("cards")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Message("数据格式不正确：缺少 cards 数组".into()))?;
    let customers_data = data
        .get("customers")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Message("数据格式不正确：缺少 customers 数组".into()))?;

    conn.execute_batch("BEGIN TRANSACTION")?;
    let result = (|| {
        conn.execute("DELETE FROM cards", [])?;
        conn.execute("DELETE FROM customers", [])?;

        for customer in customers_data {
            insert_customer_snapshot(conn, customer)?;
        }

        for card in cards_data {
            insert_card_snapshot(conn, card)?;
        }
        Ok::<_, AppError>(())
    })();

    match result {
        Ok(()) => conn.execute_batch("COMMIT")?,
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(err);
        }
    }

    Ok(json!({
        "success": true,
        "cards": cards_data.len(),
        "customers": customers_data.len(),
    }))
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
