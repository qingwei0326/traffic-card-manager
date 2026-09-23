use chrono::Datelike;

mod common;
pub use common::{db, error, models};
use common::conn;

// get_profit_summary 的 month_profit / month_cards 以 chrono::Local::now() 为基准，
// 因此测试中不能写死月份，必须按当前月份动态构造 apply_time，否则跨月后用例会假红。
fn current_month() -> String {
    let now = chrono::Local::now();
    format!("{:04}-{:02}", now.year(), now.month())
}

fn card_with(
    profit: Option<f64>,
    apply_time: Option<&str>,
    carrier: Option<&str>,
    plan_type: Option<&str>,
) -> models::CardInput {
    models::CardInput {
        card_name: Some("测试卡29元100G".into()),
        carrier: carrier.map(str::to_string),
        plan_type: plan_type.map(str::to_string),
        profit,
        apply_time: apply_time.map(str::to_string),
        status: Some("使用中".into()),
        ..Default::default()
    }
}

fn assert_close(actual: f64, expected: f64, field: &str) {
    assert!(
        (actual - expected).abs() < 1e-9,
        "{field}: expected {expected}, got {actual}"
    );
}

#[test]
fn backup_export_import_round_trips_cards_and_customers() {
    let source = conn();
    let customer = db::customers::create_customer(
        &source,
        models::CustomerInput {
            name: Some("张三".into()),
            phone: Some("13800138000".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let card = db::cards::create_card(
        &source,
        models::CardInput {
            card_name: Some("测试卡29元100G".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            customer_id: Some(customer.id),
            profit: Some(88.0),
            renewal_reminder_days: Some(15),
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

    let backup = db::backup::export_data(&source).unwrap();
    let target = conn();
    let result = db::backup::import_data(&target, backup).unwrap();

    assert_eq!(result["cards"], 1);
    assert_eq!(result["customers"], 1);
    assert_eq!(db::cards::get_cards(&target, None).unwrap().total, 1);
    let restored = db::cards::get_card_by_id(&target, card.id)
        .unwrap()
        .unwrap();
    assert_eq!(restored.id, card.id);
    assert_eq!(restored.customer_id, Some(customer.id));
    assert_eq!(restored.renewal_reminder_days, Some(15));
    assert_eq!(restored.created_at.as_deref(), Some("2026-01-02 03:04:05"));
    assert_eq!(restored.updated_at.as_deref(), Some("2026-02-03 04:05:06"));
}

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

#[test]
fn finance_summary_counts_profit() {
    let conn = conn();
    db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("测试卡29元100G".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            profit: Some(88.0),
            apply_time: Some("2026-07-01".into()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let summary = db::finance::get_profit_summary(&conn).unwrap();
    assert_eq!(summary.total_profit, 88.0);
    assert_eq!(summary.total_cards, 1);
}

#[test]
fn backup_import_replaces_existing_cards_and_customers() {
    // 还原是"先清空再写入"的覆盖语义，不是合并。用户点恢复会丢掉当前库里的数据，
    // 这条用例把该行为固定下来，避免将来有人误改成合并导致恢复结果不完整。
    let source = conn();
    let new_customer = db::customers::create_customer(
        &source,
        models::CustomerInput {
            name: Some("新客户".into()),
            ..Default::default()
        },
    )
    .unwrap();
    db::cards::create_card(
        &source,
        models::CardInput {
            card_name: Some("新卡".into()),
            customer_id: Some(new_customer.id),
            ..Default::default()
        },
    )
    .unwrap();

    let target = conn();
    let old_customer = db::customers::create_customer(
        &target,
        models::CustomerInput {
            name: Some("旧客户".into()),
            ..Default::default()
        },
    )
    .unwrap();
    db::cards::create_card(
        &target,
        models::CardInput {
            card_name: Some("旧卡".into()),
            customer_id: Some(old_customer.id),
            ..Default::default()
        },
    )
    .unwrap();

    let backup = db::backup::export_data(&source).unwrap();
    let result = db::backup::import_data(&target, backup).unwrap();
    assert_eq!(result["cards"], 1);
    assert_eq!(result["customers"], 1);

    let cards = db::cards::get_cards(&target, None).unwrap();
    assert_eq!(cards.total, 1);
    assert_eq!(cards.data[0].card_name, "新卡");

    // 按名字断言而非按 id：两个内存库的自增 id 都从 1 开始，必然撞号，
    // 用 id 判断"旧数据已消失"会得到错误结论。
    let customers = db::customers::get_all_customers(&target).unwrap();
    assert_eq!(customers.len(), 1);
    assert_eq!(customers[0].name, "新客户");
}

#[test]
fn backup_import_rolls_back_preserving_both_customers_and_cards() {
    // 原有用例只验证了 cards 表未受损；这里补上 customers 表必须同样完整回滚。
    let target = conn();
    let customer = db::customers::create_customer(
        &target,
        models::CustomerInput {
            name: Some("保留客户".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let card = db::cards::create_card(
        &target,
        models::CardInput {
            card_name: Some("保留卡".into()),
            ..Default::default()
        },
    )
    .unwrap();

    // 卡片缺少 id 会在插入阶段失败，此时 customers 已被 DELETE，必须靠 ROLLBACK 救回
    let malformed = serde_json::json!({
        "customers": [{ "id": 1, "name": "坏备份客户" }],
        "cards": [{ "card_name": "没有 id 的卡片" }]
    });

    assert!(db::backup::import_data(&target, malformed).is_err());
    assert!(db::cards::get_card_by_id(&target, card.id).unwrap().is_some());
    assert!(db::customers::get_customer_by_id(&target, customer.id)
        .unwrap()
        .is_some());
    assert_eq!(db::cards::get_cards(&target, None).unwrap().total, 1);
}

#[test]
fn backup_import_rejects_payload_missing_required_arrays() {
    let target = conn();
    db::cards::create_card(
        &target,
        models::CardInput {
            card_name: Some("保留卡".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let missing_cards = db::backup::import_data(&target, serde_json::json!({ "customers": [] }))
        .unwrap_err()
        .to_string();
    assert!(missing_cards.contains("cards"), "got: {missing_cards}");

    let missing_customers = db::backup::import_data(&target, serde_json::json!({ "cards": [] }))
        .unwrap_err()
        .to_string();
    assert!(
        missing_customers.contains("customers"),
        "got: {missing_customers}"
    );

    // 校验失败发生在 DELETE 之前，原有数据必须完好
    assert_eq!(db::cards::get_cards(&target, None).unwrap().total, 1);
}

#[test]
fn profit_summary_averages_only_positive_profits() {
    let conn = conn();
    let month = current_month();
    // 100 / 0 / NULL 三张卡：AVG 的分母必须排除 0 与 NULL，否则均值会被拉低。
    for profit in [Some(100.0), Some(0.0), None] {
        db::cards::create_card(&conn, card_with(profit, Some(&format!("{month}-01")), None, None))
            .unwrap();
    }

    let summary = db::finance::get_profit_summary(&conn).unwrap();
    assert_close(summary.total_profit, 100.0, "total_profit");
    assert_close(summary.avg_profit, 100.0, "avg_profit");
    assert_eq!(summary.total_cards, 3);
    assert_close(summary.month_profit, 100.0, "month_profit");
    assert_eq!(summary.month_cards, 3);
}

#[test]
fn profit_summary_scopes_month_stats_to_current_month_only() {
    let conn = conn();
    let month = current_month();
    db::cards::create_card(&conn, card_with(Some(100.0), Some(&format!("{month}-01")), None, None))
        .unwrap();
    // 固定历史月份，绝不会与当前月重合
    db::cards::create_card(&conn, card_with(Some(999.0), Some("1999-01-15"), None, None)).unwrap();

    let summary = db::finance::get_profit_summary(&conn).unwrap();
    assert_close(summary.total_profit, 1099.0, "total_profit");
    assert_close(summary.avg_profit, 549.5, "avg_profit");
    assert_eq!(summary.total_cards, 2);
    // 月度统计只认 apply_time 落在当月的卡片
    assert_close(summary.month_profit, 100.0, "month_profit");
    assert_eq!(summary.month_cards, 1);
}

#[test]
fn monthly_profit_groups_by_month_for_requested_year() {
    let conn = conn();
    db::cards::create_card(&conn, card_with(Some(100.0), Some("2026-06-15"), None, None)).unwrap();
    db::cards::create_card(&conn, card_with(Some(50.0), Some("2026-06-20"), None, None)).unwrap();
    db::cards::create_card(&conn, card_with(Some(200.0), Some("2026-07-05"), None, None)).unwrap();
    // 上一年同月，必须被年份过滤掉
    db::cards::create_card(&conn, card_with(Some(999.0), Some("2025-06-15"), None, None)).unwrap();

    let rows = db::finance::get_monthly_profit(&conn, 2026).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].month, "06");
    assert_close(rows[0].profit, 150.0, "2026-06 profit");
    assert_eq!(rows[0].count, 2);
    assert_eq!(rows[1].month, "07");
    assert_close(rows[1].profit, 200.0, "2026-07 profit");
    assert_eq!(rows[1].count, 1);
}

#[test]
fn profit_by_carrier_groups_and_orders_by_profit_desc() {
    let conn = conn();
    db::cards::create_card(&conn, card_with(Some(100.0), None, Some("移动"), None)).unwrap();
    db::cards::create_card(&conn, card_with(Some(50.0), None, Some("移动"), None)).unwrap();
    db::cards::create_card(&conn, card_with(Some(200.0), None, Some("联通"), None)).unwrap();

    let rows = db::finance::get_profit_by_carrier(&conn).unwrap();
    assert_eq!(rows.len(), 2);
    // ORDER BY profit DESC：联通 200 排在移动 150 之前
    assert_eq!(rows[0].carrier.as_deref(), Some("联通"));
    assert_close(rows[0].profit, 200.0, "联通 profit");
    assert_eq!(rows[0].count, 1);
    assert_eq!(rows[1].carrier.as_deref(), Some("移动"));
    assert_close(rows[1].profit, 150.0, "移动 profit");
    assert_eq!(rows[1].count, 2);
    // 按 carrier 聚合时 plan_type 必须留空，避免前端误读字段
    assert!(rows[0].plan_type.is_none());
}

#[test]
fn profit_by_plan_type_groups_and_orders_by_profit_desc() {
    let conn = conn();
    db::cards::create_card(&conn, card_with(Some(100.0), None, None, Some("性价比"))).unwrap();
    db::cards::create_card(&conn, card_with(Some(50.0), None, None, Some("性价比"))).unwrap();
    db::cards::create_card(&conn, card_with(Some(200.0), None, None, Some("长期"))).unwrap();

    let rows = db::finance::get_profit_by_plan_type(&conn).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].plan_type.as_deref(), Some("长期"));
    assert_close(rows[0].profit, 200.0, "长期 profit");
    assert_eq!(rows[1].plan_type.as_deref(), Some("性价比"));
    assert_close(rows[1].profit, 150.0, "性价比 profit");
    assert_eq!(rows[1].count, 2);
    assert!(rows[0].carrier.is_none());
}

#[test]
fn finance_stats_on_empty_database_return_zeroed_values() {
    let conn = conn();

    let summary = db::finance::get_profit_summary(&conn).unwrap();
    assert_close(summary.total_profit, 0.0, "empty total_profit");
    assert_close(summary.avg_profit, 0.0, "empty avg_profit");
    assert_close(summary.month_profit, 0.0, "empty month_profit");
    assert_eq!(summary.total_cards, 0);
    assert_eq!(summary.month_cards, 0);

    assert!(db::finance::get_monthly_profit(&conn, 2026).unwrap().is_empty());
    assert!(db::finance::get_profit_by_carrier(&conn).unwrap().is_empty());
    assert!(db::finance::get_profit_by_plan_type(&conn).unwrap().is_empty());
}
