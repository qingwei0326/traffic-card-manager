use rusqlite::Connection;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;

fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    db::schema::init_schema(&conn).unwrap();
    conn
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
