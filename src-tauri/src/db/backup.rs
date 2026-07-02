use crate::db::{cards, customers};
use crate::error::{AppError, AppResult};
use crate::models::CardInput;
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn export_data(conn: &Connection) -> AppResult<Value> {
    let cards = cards::get_cards(
        conn,
        Some(crate::models::CardFilters {
            status: None,
            carrier: None,
            plan_type: None,
            search: None,
            page: Some(1),
            page_size: Some(1_000_000),
        }),
    )?
    .data;
    let customers = customers::get_customers(
        conn,
        Some(crate::models::CustomerFilters {
            search: None,
            tag: None,
            page: Some(1),
            page_size: Some(1_000_000),
        }),
    )?
    .data;
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
            conn.execute(
                r#"
                INSERT INTO customers (id, name, phone, wechat, address, notes, tags, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
                rusqlite::params![
                    value_i64(customer, "id"),
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
        }

        for card in cards_data {
            cards::create_card(
                conn,
                CardInput {
                    card_name: Some(value_string(card, "card_name")),
                    carrier: Some(value_string(card, "carrier")),
                    plan_type: Some(value_string(card, "plan_type")),
                    monthly_price: Some(value_f64(card, "monthly_price")),
                    data_amount: Some(value_string(card, "data_amount")),
                    region: Some(value_string(card, "region")),
                    contract_period: Some(value_i64(card, "contract_period")),
                    renewal_reminder_days: Some(value_i64(card, "renewal_reminder_days").max(30)),
                    apply_time: Some(value_string(card, "apply_time")),
                    activate_time: Some(value_string(card, "activate_time")),
                    promo_start: Some(value_string(card, "promo_start")),
                    promo_end: Some(value_string(card, "promo_end")),
                    phone_number: Some(value_string(card, "phone_number")),
                    customer_id: optional_i64(card, "customer_id"),
                    profit: Some(value_f64(card, "profit")),
                    status: Some(value_string(card, "status").if_empty("使用中")),
                    notes: Some(value_string(card, "notes")),
                    external_order_id: optional_string(card, "external_order_id"),
                    id_card: optional_string(card, "id_card"),
                    address: optional_string(card, "address"),
                    express_company: optional_string(card, "express_company"),
                    express_number: optional_string(card, "express_number"),
                    first_charge_amount: Some(value_f64(card, "first_charge_amount")),
                    source: optional_string(card, "source"),
                },
            )?;
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
