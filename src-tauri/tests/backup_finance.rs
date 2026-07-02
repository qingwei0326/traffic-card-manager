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
    db::cards::create_card(
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

    let backup = db::backup::export_data(&source).unwrap();
    let target = conn();
    let result = db::backup::import_data(&target, backup).unwrap();

    assert_eq!(result["cards"], 1);
    assert_eq!(result["customers"], 1);
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
