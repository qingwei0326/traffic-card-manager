use crate::db::{cards, customers, plans};
use crate::error::AppResult;
use crate::models::{Card, CardInput, CustomerInput, ImportResult, Plan};
use rusqlite::{params, Connection};
use serde_json::Value;

pub fn import_from_172(conn: &Connection, rows: Vec<Value>) -> AppResult<ImportResult> {
    let mut imported = 0;
    let mut updated = 0;
    let mut skipped = 0;
    conn.execute_batch("BEGIN TRANSACTION")?;
    let result = (|| {
        for row in &rows {
            let order_status = value_string(row, "订单状态");
            if order_status == "已撤单" || order_status == "审核不通过" {
                skipped += 1;
                continue;
            }
            let order_id = value_string(row, "172订单号");
            let existing = find_card_by_order(conn, &order_id)?;
            let plan_name = value_string(row, "套餐");
            let matched_plan = plans::match_plan(conn, &plan_name)?;
            let activate_time = value_string(row, "激活时间");
            let address = [
                value_string(row, "省份"),
                value_string(row, "城市"),
                value_string(row, "县区"),
                value_string(row, "详细地址"),
            ]
            .into_iter()
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join("");
            let raw_phone = first_non_empty(&[value_string(row, "按号码发货"), value_string(row, "生产号码")]);
            let customer_id = find_or_create_customer(
                conn,
                &value_string(row, "姓名"),
                &raw_phone,
                &address,
                &value_string(row, "身份证号"),
            )?;
            let amount = parse_amount(&value_string(row, "金额"));
            let profit = round2(amount * 0.94);
            let status = if order_status == "已结算" {
                if value_string(row, "激活状态") == "已激活" {
                    "使用中"
                } else {
                    "已到期"
                }
            } else if order_status == "已失效" {
                "已到期"
            } else {
                "待确认"
            }
            .to_string();

            let input = build_import_card(
                existing.as_ref(),
                matched_plan.as_ref(),
                CardInput {
                    card_name: Some(plan_name.clone()),
                    carrier: Some(
                        matched_plan
                            .as_ref()
                            .and_then(|plan| plan.carrier.clone())
                            .unwrap_or_else(|| plans::parse_carrier(&plan_name)),
                    ),
                    plan_type: Some(plans::parse_plan_type(&plan_name)),
                    monthly_price: Some(
                        matched_plan
                            .as_ref()
                            .map(|plan| plan.monthly_price)
                            .unwrap_or_else(|| plans::parse_monthly_price(&plan_name)),
                    ),
                    data_amount: Some(
                        matched_plan
                            .as_ref()
                            .map(|plan| plan.data_amount.to_string())
                            .unwrap_or_else(|| plans::parse_data_amount(&plan_name)),
                    ),
                    region: Some(
                        format_region(&value_string(row, "省份"), &value_string(row, "城市"))
                            .or_else(|| matched_plan.as_ref().and_then(|plan| plan.region.clone()))
                            .unwrap_or_default(),
                    ),
                    contract_period: Some(
                        matched_plan
                            .as_ref()
                            .map(|plan| plan.contract_period)
                            .unwrap_or(0),
                    ),
                    renewal_reminder_days: Some(30),
                    apply_time: Some(value_string(row, "下单时间")),
                    activate_time: Some(activate_time.clone()),
                    promo_start: Some(activate_time.clone()),
                    promo_end: existing.as_ref().and_then(|card| card.promo_end.clone()),
                    phone_number: Some(raw_phone),
                    customer_id,
                    profit: Some(profit),
                    status: Some(merge_imported_status(
                        existing.as_ref().map(|card| card.status.as_str()),
                        &status,
                    )),
                    notes: Some(first_non_empty(&[
                        value_string(row, "生产失败原因"),
                        existing.as_ref().and_then(|card| card.notes.clone()).unwrap_or_default(),
                    ])),
                    external_order_id: Some(order_id),
                    id_card: optional_non_empty(value_string(row, "身份证号")),
                    address: optional_non_empty(address),
                    express_company: optional_non_empty(value_string(row, "物流公司")),
                    express_number: optional_non_empty(value_string(row, "运单号")),
                    first_charge_amount: Some(parse_amount(&value_string(row, "首充金额"))),
                    source: Some(value_string(row, "订单来源").if_empty("172号卡平台")),
                },
            );

            if let Some(existing) = existing {
                cards::update_card(conn, existing.id, input)?;
                updated += 1;
            } else {
                cards::create_card(conn, input)?;
                imported += 1;
            }
        }
        Ok::<_, crate::error::AppError>(())
    })();
    finish_import(conn, result)?;
    Ok(ImportResult {
        imported,
        updated,
        skipped,
        total: rows.len() as i64,
    })
}

pub fn import_from_haoyi(conn: &Connection, rows: Vec<Value>) -> AppResult<ImportResult> {
    let mut imported = 0;
    let mut updated = 0;
    let mut skipped = 0;
    conn.execute_batch("BEGIN TRANSACTION")?;
    let result = (|| {
        for row in &rows {
            let upstream_status = value_string(row, "上游订单状态");
            if upstream_status == "开卡失败" || upstream_status == "已取消" {
                skipped += 1;
                continue;
            }
            let order_id = value_string(row, "订单号");
            let existing = find_card_by_order(conn, &order_id)?;
            let plan_name = value_string(row, "商品名称");
            let matched_plan = plans::match_plan(conn, &plan_name)?;
            let address = value_string(row, "收货地址").if_empty_owned(
                [
                    value_string(row, "省"),
                    value_string(row, "市"),
                    value_string(row, "区"),
                    value_string(row, "街道"),
                ]
                .into_iter()
                .filter(|item| !item.is_empty())
                .collect::<Vec<_>>()
                .join(""),
            );
            let raw_phone = first_non_empty(&[value_string(row, "生产号码"), value_string(row, "手机号")])
                .trim_start_matches('\'')
                .to_string();
            let customer_id = find_or_create_customer(
                conn,
                &value_string(row, "用户姓名"),
                &raw_phone,
                &address,
                &value_string(row, "身份证号码"),
            )?;
            let amount = parse_amount(&value_string(row, "订单金额"));
            let profit = round2(amount * 0.94);
            let activate_time = excel_date_to_string(&value_string(row, "入网时间"));
            let apply_time = excel_date_to_string(&value_string(row, "下单时间"));
            let status = if upstream_status == "已激活" || upstream_status == "已开卡" {
                "使用中"
            } else if upstream_status.contains("失败") || upstream_status == "已取消" {
                "已到期"
            } else {
                "待确认"
            }
            .to_string();

            let input = build_import_card(
                existing.as_ref(),
                matched_plan.as_ref(),
                CardInput {
                    card_name: Some(plan_name.clone()),
                    carrier: Some(
                        matched_plan
                            .as_ref()
                            .and_then(|plan| plan.carrier.clone())
                            .unwrap_or_else(|| value_string(row, "运营商").if_empty(&plans::parse_carrier(&plan_name))),
                    ),
                    plan_type: Some(plans::parse_plan_type(&plan_name)),
                    monthly_price: Some(
                        matched_plan
                            .as_ref()
                            .map(|plan| plan.monthly_price)
                            .unwrap_or_else(|| plans::parse_monthly_price(&plan_name)),
                    ),
                    data_amount: Some(
                        matched_plan
                            .as_ref()
                            .map(|plan| plan.data_amount.to_string())
                            .unwrap_or_else(|| plans::parse_data_amount(&plan_name)),
                    ),
                    region: Some(
                        format_region(&value_string(row, "省"), &value_string(row, "市"))
                            .or_else(|| extract_region(&address))
                            .or_else(|| matched_plan.as_ref().and_then(|plan| plan.region.clone()))
                            .unwrap_or_default(),
                    ),
                    contract_period: Some(
                        matched_plan
                            .as_ref()
                            .map(|plan| plan.contract_period)
                            .unwrap_or(0),
                    ),
                    renewal_reminder_days: Some(30),
                    apply_time: Some(apply_time),
                    activate_time: Some(activate_time.clone()),
                    promo_start: Some(activate_time.clone()),
                    promo_end: existing.as_ref().and_then(|card| card.promo_end.clone()),
                    phone_number: Some(raw_phone),
                    customer_id,
                    profit: Some(profit),
                    status: Some(merge_imported_status(
                        existing.as_ref().map(|card| card.status.as_str()),
                        &status,
                    )),
                    notes: Some(first_non_empty(&[
                        value_string(row, "结算规则"),
                        value_string(row, "备注"),
                        existing.as_ref().and_then(|card| card.notes.clone()).unwrap_or_default(),
                    ])),
                    external_order_id: Some(order_id),
                    id_card: optional_non_empty(value_string(row, "身份证号码")),
                    address: optional_non_empty(address),
                    express_company: optional_non_empty(value_string(row, "快递名称")),
                    express_number: optional_non_empty(value_string(row, "物流单号")),
                    first_charge_amount: Some(parse_amount(&value_string(row, "首充金额"))),
                    source: Some(value_string(row, "渠道来源").if_empty("号易平台")),
                },
            );

            if let Some(existing) = existing {
                cards::update_card(conn, existing.id, input)?;
                updated += 1;
            } else {
                cards::create_card(conn, input)?;
                imported += 1;
            }
        }
        Ok::<_, crate::error::AppError>(())
    })();
    finish_import(conn, result)?;
    Ok(ImportResult {
        imported,
        updated,
        skipped,
        total: rows.len() as i64,
    })
}

fn build_import_card(
    existing: Option<&Card>,
    _matched_plan: Option<&Plan>,
    mut input: CardInput,
) -> CardInput {
    if let Some(existing) = existing {
        if input.profit.unwrap_or(0.0) == 0.0 {
            input.profit = Some(existing.profit);
        }
        if input.activate_time.as_deref().unwrap_or("").is_empty() {
            input.activate_time = existing.activate_time.clone();
        }
        if input.promo_start.as_deref().unwrap_or("").is_empty() {
            input.promo_start = existing.promo_start.clone();
        }
        if input.promo_end.as_deref().unwrap_or("").is_empty() {
            input.promo_end = existing.promo_end.clone();
        }
    }
    input
}

fn find_card_by_order(conn: &Connection, order_id: &str) -> AppResult<Option<Card>> {
    if order_id.trim().is_empty() {
        return Ok(None);
    }
    let id = conn
        .query_row(
            "SELECT id FROM cards WHERE external_order_id = ?",
            params![order_id],
            |row| row.get::<_, i64>(0),
        )
        .ok();
    if let Some(id) = id {
        cards::get_card_by_id(conn, id)
    } else {
        Ok(None)
    }
}

fn find_or_create_customer(
    conn: &Connection,
    name: &str,
    raw_phone: &str,
    address: &str,
    notes: &str,
) -> AppResult<Option<i64>> {
    if name.trim().is_empty() {
        return Ok(None);
    }
    let phone = if is_masked_phone(raw_phone) {
        String::new()
    } else {
        raw_phone.to_string()
    };
    let existing = if !phone.is_empty() {
        conn.query_row(
            "SELECT id FROM customers WHERE name = ? AND phone = ?",
            params![name, phone],
            |row| row.get::<_, i64>(0),
        )
        .ok()
    } else {
        None
    }
    .or_else(|| {
        conn.query_row(
            "SELECT id FROM customers WHERE name = ? AND (phone = ? OR phone = '' OR phone IS NULL)",
            params![name, phone],
            |row| row.get::<_, i64>(0),
        )
        .ok()
    });

    if let Some(id) = existing {
        return Ok(Some(id));
    }

    let customer = customers::create_customer(
        conn,
        CustomerInput {
            name: Some(name.to_string()),
            phone: Some(phone),
            address: Some(address.to_string()),
            notes: Some(notes.to_string()),
            ..Default::default()
        },
    )?;
    Ok(Some(customer.id))
}

fn finish_import<T>(conn: &Connection, result: Result<T, crate::error::AppError>) -> AppResult<T> {
    match result {
        Ok(value) => {
            conn.execute_batch("COMMIT")?;
            Ok(value)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

fn merge_imported_status(existing_status: Option<&str>, imported_status: &str) -> String {
    let Some(existing) = existing_status else {
        return imported_status.to_string();
    };
    if imported_status == "待确认" && existing != "待确认" {
        existing.to_string()
    } else if existing == "已注销" && imported_status != "已注销" {
        existing.to_string()
    } else {
        imported_status.to_string()
    }
}

fn value_string(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(flag)) => flag.to_string(),
        _ => String::new(),
    }
}

fn first_non_empty(values: &[String]) -> String {
    values
        .iter()
        .find(|value| !value.trim().is_empty())
        .cloned()
        .unwrap_or_default()
}

fn optional_non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn parse_amount(value: &str) -> f64 {
    let mut number = String::new();
    let mut started = false;
    for ch in value.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            number.push(ch);
            started = true;
        } else if started {
            break;
        }
    }
    number.parse::<f64>().unwrap_or(0.0)
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn excel_date_to_string(value: &str) -> String {
    if value.trim().is_empty() {
        return String::new();
    }
    if value.contains('-') {
        return value.to_string();
    }
    let Ok(days) = value.parse::<f64>() else {
        return String::new();
    };
    let seconds = ((days - 25569.0) * 86400.0) as i64;
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|dt| dt.naive_utc().format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_default()
}

fn is_masked_phone(phone: &str) -> bool {
    phone.trim().is_empty() || phone.contains('*') || phone.starts_with('\'')
}

fn format_region(province: &str, city: &str) -> Option<String> {
    let province = province
        .replace(['省', '市'], "")
        .replace("自治区", "")
        .replace("壮族", "")
        .replace("回族", "")
        .replace("维吾尔", "")
        .trim()
        .to_string();
    let city = city
        .replace('市', "")
        .replace("地区", "")
        .replace("自治州", "")
        .trim()
        .to_string();
    if !province.is_empty() && !city.is_empty() {
        Some(format!("{province}·{city}"))
    } else if !city.is_empty() {
        Some(city)
    } else if !province.is_empty() {
        Some(province)
    } else {
        None
    }
}

fn extract_region(address: &str) -> Option<String> {
    if address.is_empty() {
        None
    } else {
        Some(address.chars().take(6).collect())
    }
}

trait EmptyDefault {
    fn if_empty(self, default: &str) -> String;
    fn if_empty_owned(self, default: String) -> String;
}

impl EmptyDefault for String {
    fn if_empty(self, default: &str) -> String {
        if self.is_empty() {
            default.to_string()
        } else {
            self
        }
    }

    fn if_empty_owned(self, default: String) -> String {
        if self.is_empty() {
            default
        } else {
            self
        }
    }
}
