use crate::error::{AppError, AppResult};
use crate::models::{
    Card, CardFilters, CardInput, CardStats, MonthlyStats, PaginatedResult,
};
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, Row};

const CARD_WRITE_COLUMNS: &[&str] = &[
    "card_name",
    "carrier",
    "plan_type",
    "monthly_price",
    "data_amount",
    "region",
    "contract_period",
    "renewal_reminder_days",
    "apply_time",
    "activate_time",
    "promo_start",
    "promo_end",
    "phone_number",
    "customer_id",
    "profit",
    "status",
    "notes",
    "external_order_id",
    "id_card",
    "address",
    "express_company",
    "express_number",
    "first_charge_amount",
    "source",
];

pub fn get_cards(
    conn: &Connection,
    filters: Option<CardFilters>,
) -> AppResult<PaginatedResult<Card>> {
    let filters = filters.unwrap_or(CardFilters {
        status: None,
        carrier: None,
        plan_type: None,
        search: None,
        page: None,
        page_size: None,
    });
    let (where_sql, where_params) = build_card_where(&filters);
    let page = filters.page.unwrap_or(1).max(1);
    let page_size = filters.page_size.unwrap_or(50).max(1);
    let offset = (page - 1) * page_size;

    let total: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM cards c LEFT JOIN customers cu ON c.customer_id = cu.id {where_sql}"
        ),
        params_from_iter(where_params.iter()),
        |row| row.get(0),
    )?;

    let mut data_params = where_params;
    data_params.push(Value::Integer(page_size));
    data_params.push(Value::Integer(offset));
    let mut stmt = conn.prepare(&format!(
        r#"
        SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
        FROM cards c
        LEFT JOIN customers cu ON c.customer_id = cu.id
        {where_sql}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
        "#
    ))?;
    let data = stmt
        .query_map(params_from_iter(data_params.iter()), map_card)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(PaginatedResult {
        data,
        total,
        page,
        page_size,
    })
}

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

pub fn get_card_by_id(conn: &Connection, id: i64) -> AppResult<Option<Card>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
        FROM cards c
        LEFT JOIN customers cu ON c.customer_id = cu.id
        WHERE c.id = ?
        "#,
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_card(row)?))
    } else {
        Ok(None)
    }
}

pub fn create_card(conn: &Connection, input: CardInput) -> AppResult<Card> {
    let placeholders = CARD_WRITE_COLUMNS
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO cards ({}) VALUES ({})",
        CARD_WRITE_COLUMNS.join(", "),
        placeholders
    );
    let values = card_input_values(&input);
    conn.execute(&sql, params_from_iter(values.iter()))?;
    let id = conn.last_insert_rowid();
    get_card_by_id(conn, id)?.ok_or_else(|| AppError::Message("卡片创建失败".into()))
}

pub fn update_card(conn: &Connection, id: i64, input: CardInput) -> AppResult<Card> {
    let existing = get_card_by_id(conn, id)?
        .ok_or_else(|| AppError::Message("卡片不存在".into()))?;
    let next = merge_card_input(existing, input);
    let assignments = CARD_WRITE_COLUMNS
        .iter()
        .map(|field| format!("{field} = ?"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "UPDATE cards SET {assignments}, updated_at = datetime('now', 'localtime') WHERE id = ?"
    );
    let mut values = card_input_values(&next);
    values.push(Value::Integer(id));
    conn.execute(&sql, params_from_iter(values.iter()))?;
    get_card_by_id(conn, id)?.ok_or_else(|| AppError::Message("卡片不存在".into()))
}

pub fn delete_card(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM cards WHERE id = ?", params![id])?;
    Ok(())
}

pub fn get_card_stats(conn: &Connection) -> AppResult<CardStats> {
    Ok(CardStats {
        total: count(conn, "SELECT COUNT(*) FROM cards")?,
        active: count(conn, "SELECT COUNT(*) FROM cards WHERE status = '使用中'")?,
        expired: count(conn, "SELECT COUNT(*) FROM cards WHERE status = '已到期'")?,
        cancelled: count(conn, "SELECT COUNT(*) FROM cards WHERE status = '已注销'")?,
        total_profit: sum(conn, "SELECT COALESCE(SUM(profit), 0) FROM cards")?,
    })
}

pub fn get_monthly_stats(conn: &Connection, year: i64, month: i64) -> AppResult<MonthlyStats> {
    let month_str = format!("{year}-{month:02}");
    let new_cards = conn.query_row(
        "SELECT COUNT(*) FROM cards WHERE strftime('%Y-%m', apply_time) = ?",
        params![month_str],
        |row| row.get(0),
    )?;
    let month_profit = conn.query_row(
        "SELECT COALESCE(SUM(profit), 0) FROM cards WHERE strftime('%Y-%m', apply_time) = ?",
        params![format!("{year}-{month:02}")],
        |row| row.get(0),
    )?;
    Ok(MonthlyStats {
        new_cards,
        month_profit,
    })
}

pub fn get_expiring_soon(conn: &Connection, days: i64) -> AppResult<Vec<Card>> {
    let today = chrono::Local::now().date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();
    let mut stmt = conn.prepare(
        r#"
        SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
        FROM cards c
        LEFT JOIN customers cu ON c.customer_id = cu.id
        WHERE c.status = '使用中'
          AND c.promo_end >= ?
          AND julianday(c.promo_end) - julianday(?) <= COALESCE(c.renewal_reminder_days, ?)
        ORDER BY c.promo_end ASC
        "#,
    )?;
    let cards = stmt
        .query_map(params![today_str, today_str, days], map_card)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(cards)
}

pub(crate) fn map_card(row: &Row<'_>) -> rusqlite::Result<Card> {
    Ok(Card {
        id: row.get("id")?,
        card_name: row.get("card_name")?,
        carrier: row.get("carrier")?,
        plan_type: row.get("plan_type")?,
        monthly_price: row.get::<_, Option<f64>>("monthly_price")?.unwrap_or(0.0),
        data_amount: row.get("data_amount")?,
        region: row.get("region")?,
        contract_period: row.get("contract_period")?,
        renewal_reminder_days: row.get("renewal_reminder_days")?,
        apply_time: row.get("apply_time")?,
        activate_time: row.get("activate_time")?,
        promo_start: row.get("promo_start")?,
        promo_end: row.get("promo_end")?,
        phone_number: row.get("phone_number")?,
        customer_id: row.get("customer_id")?,
        customer_name: row.get("customer_name").unwrap_or(None),
        customer_phone: row.get("customer_phone").unwrap_or(None),
        profit: row.get::<_, Option<f64>>("profit")?.unwrap_or(0.0),
        status: row.get::<_, Option<String>>("status")?.unwrap_or_default(),
        notes: row.get("notes")?,
        external_order_id: row.get("external_order_id")?,
        id_card: row.get("id_card")?,
        address: row.get("address")?,
        express_company: row.get("express_company")?,
        express_number: row.get("express_number")?,
        first_charge_amount: row.get("first_charge_amount")?,
        source: row.get("source")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn build_card_where(filters: &CardFilters) -> (String, Vec<Value>) {
    let mut clauses = vec!["1=1".to_string()];
    let mut params = Vec::new();

    if let Some(status) = non_all(&filters.status) {
        clauses.push("c.status = ?".into());
        params.push(Value::Text(status));
    }
    if let Some(carrier) = non_all(&filters.carrier) {
        clauses.push("c.carrier = ?".into());
        params.push(Value::Text(carrier));
    }
    if let Some(plan_type) = non_all(&filters.plan_type) {
        clauses.push("c.plan_type = ?".into());
        params.push(Value::Text(plan_type));
    }
    if let Some(search) = filters.search.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        clauses.push(
            "(c.card_name LIKE ? OR c.phone_number LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ? OR c.region LIKE ? OR c.notes LIKE ?)"
                .into(),
        );
        for _ in 0..6 {
            params.push(Value::Text(format!("%{search}%")));
        }
    }

    (format!("WHERE {}", clauses.join(" AND ")), params)
}

fn non_all(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && *s != "全部")
        .map(ToOwned::to_owned)
}

fn card_input_values(input: &CardInput) -> Vec<Value> {
    vec![
        text(input.card_name.clone().unwrap_or_default()),
        text(input.carrier.clone().unwrap_or_default()),
        text(input.plan_type.clone().unwrap_or_default()),
        real(input.monthly_price.unwrap_or(0.0)),
        text(input.data_amount.clone().unwrap_or_default()),
        text(input.region.clone().unwrap_or_default()),
        integer(input.contract_period.unwrap_or(0)),
        integer(input.renewal_reminder_days.unwrap_or(30)),
        text(input.apply_time.clone().unwrap_or_default()),
        text(input.activate_time.clone().unwrap_or_default()),
        text(input.promo_start.clone().unwrap_or_default()),
        text(input.promo_end.clone().unwrap_or_default()),
        text(input.phone_number.clone().unwrap_or_default()),
        optional_integer(input.customer_id),
        real(input.profit.unwrap_or(0.0)),
        text(input.status.clone().unwrap_or_else(|| "使用中".into())),
        text(input.notes.clone().unwrap_or_default()),
        optional_text(input.external_order_id.clone()),
        optional_text(input.id_card.clone()),
        optional_text(input.address.clone()),
        optional_text(input.express_company.clone()),
        optional_text(input.express_number.clone()),
        real(input.first_charge_amount.unwrap_or(0.0)),
        optional_text(input.source.clone()),
    ]
}

fn merge_card_input(existing: Card, input: CardInput) -> CardInput {
    CardInput {
        card_name: input.card_name.or(Some(existing.card_name)),
        carrier: input.carrier.or(Some(existing.carrier)),
        plan_type: input.plan_type.or(Some(existing.plan_type)),
        monthly_price: input.monthly_price.or(Some(existing.monthly_price)),
        data_amount: input.data_amount.or(existing.data_amount),
        region: input.region.or(existing.region),
        contract_period: input.contract_period.or(existing.contract_period),
        renewal_reminder_days: input
            .renewal_reminder_days
            .or(existing.renewal_reminder_days),
        apply_time: input.apply_time.or(existing.apply_time),
        activate_time: input.activate_time.or(existing.activate_time),
        promo_start: input.promo_start.or(existing.promo_start),
        promo_end: input.promo_end.or(existing.promo_end),
        phone_number: input.phone_number.or(existing.phone_number),
        customer_id: input.customer_id.or(existing.customer_id),
        profit: input.profit.or(Some(existing.profit)),
        status: input.status.or(Some(existing.status)),
        notes: input.notes.or(existing.notes),
        external_order_id: input.external_order_id.or(existing.external_order_id),
        id_card: input.id_card.or(existing.id_card),
        address: input.address.or(existing.address),
        express_company: input.express_company.or(existing.express_company),
        express_number: input.express_number.or(existing.express_number),
        first_charge_amount: input
            .first_charge_amount
            .or(existing.first_charge_amount),
        source: input.source.or(existing.source),
    }
}

fn count(conn: &Connection, sql: &str) -> AppResult<i64> {
    Ok(conn.query_row(sql, [], |row| row.get(0))?)
}

fn sum(conn: &Connection, sql: &str) -> AppResult<f64> {
    Ok(conn.query_row(sql, [], |row| row.get(0))?)
}

fn text(value: String) -> Value {
    Value::Text(value)
}

fn optional_text(value: Option<String>) -> Value {
    value.map(Value::Text).unwrap_or(Value::Null)
}

fn integer(value: i64) -> Value {
    Value::Integer(value)
}

fn optional_integer(value: Option<i64>) -> Value {
    value.map(Value::Integer).unwrap_or(Value::Null)
}

fn real(value: f64) -> Value {
    Value::Real(value)
}
