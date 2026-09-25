//! 备份格式与导入安全性。
//!
//! 这里盯的是两类真实事故：
//! 1. 导入是全量覆盖，一旦中途出错或文件是坏的，用户数据就没了 —— 所以导入前必须有快照、
//!    导入前必须校验完整性、整个过程必须能整体回滚。
//! 2. 备份格式本身会演进。新增 plans 之后，**老备份里没有 plans 字段**，
//!    这种备份导入时必须保留现有套餐，绝不能反过来清表。

mod common;
pub use common::{db, error, models};
use common::conn;

use rusqlite::Connection;

fn insert_plan(conn: &Connection, id: i64, code: &str, name: &str) {
    conn.execute(
        "INSERT INTO plans (id, code, name, carrier, monthly_price) VALUES (?1, ?2, ?3, '移动', 29.0)",
        rusqlite::params![id, code, name],
    )
    .unwrap();
}

fn plan_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM plans", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn export_carries_plans_schema_version_and_checksum() {
    let source = conn();
    insert_plan(&source, 1, "PLAN-A", "套餐A");

    let backup = db::backup::export_data(&source).unwrap();

    assert_eq!(backup["plans"][0]["code"], "PLAN-A");
    assert_eq!(
        backup["schemaVersion"],
        db::migrations::latest_version(),
        "备份必须记下导出时的 schema 版本，否则导入端无从判断是否兼容"
    );
    assert!(
        backup["checksum"].as_str().unwrap().len() == 64,
        "checksum 应是 SHA-256 十六进制串"
    );
}

#[test]
fn import_restores_plans_alongside_cards_and_customers() {
    let source = conn();
    insert_plan(&source, 7, "PLAN-B", "套餐B");
    let backup = db::backup::export_data(&source).unwrap();

    let target = conn();
    // 目标库里先放一条同 id 的脏数据，验证是被覆盖而不是被追加
    insert_plan(&target, 7, "STALE", "过期套餐");

    let result = db::backup::import_data(&target, None, backup).unwrap();

    assert_eq!(result["plans"], 1);
    assert_eq!(plan_count(&target), 1);
    let code: String = target
        .query_row("SELECT code FROM plans WHERE id = 7", [], |row| row.get(0))
        .unwrap();
    assert_eq!(code, "PLAN-B");
}

#[test]
fn legacy_backup_without_plans_keeps_existing_plans() {
    // 这条最重要：plans 是后来才进备份格式的，老备份没有这个字段。
    // 导入时若不加区分地清表，等于把老备份变成一次数据销毁。
    let target = conn();
    insert_plan(&target, 1, "KEEP-ME", "现有套餐");

    let legacy = serde_json::json!({
        "cards": [],
        "customers": [],
        "exportTime": "2025-01-01T00:00:00+08:00"
    });

    let result = db::backup::import_data(&target, None, legacy).unwrap();

    assert_eq!(result["plans"], 0);
    assert_eq!(plan_count(&target), 1, "老备份不得清掉现有套餐");
    let code: String = target
        .query_row("SELECT code FROM plans WHERE id = 1", [], |row| row.get(0))
        .unwrap();
    assert_eq!(code, "KEEP-ME");
}

#[test]
fn tampered_backup_is_rejected_and_data_left_intact() {
    let source = conn();
    source
        .execute(
            "INSERT INTO customers (id, name) VALUES (1, '原始客户')",
            [],
        )
        .unwrap();
    let mut backup = db::backup::export_data(&source).unwrap();
    backup["cards"] = serde_json::json!([{
        "id": 1,
        "card_name": "被塞进去的卡",
        "carrier": "移动",
        "plan_type": "性价比"
    }]);

    let target = conn();
    target
        .execute(
            "INSERT INTO customers (id, name) VALUES (2, '目标库原有客户')",
            [],
        )
        .unwrap();

    let err = db::backup::import_data(&target, None, backup).unwrap_err();
    assert!(
        err.to_string().contains("校验失败"),
        "应报校验失败而不是别的错，实际是: {err}"
    );

    let count: i64 = target
        .query_row("SELECT COUNT(*) FROM customers", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1, "校验失败时一个字节都不该动");
}

#[test]
fn backup_from_a_newer_schema_is_rejected() {
    let target = conn();
    target
        .execute("INSERT INTO customers (id, name) VALUES (1, '不该被清掉')", [])
        .unwrap();

    let future = serde_json::json!({
        "schemaVersion": db::migrations::latest_version() + 1,
        "cards": [],
        "customers": []
    });

    let err = db::backup::import_data(&target, None, future).unwrap_err();
    assert!(
        err.to_string().contains("高于当前应用支持的"),
        "应明确说明版本过新，实际是: {err}"
    );

    let count: i64 = target
        .query_row("SELECT COUNT(*) FROM customers", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn import_snapshots_the_database_file_before_overwriting() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("traffic-cards.db");
    let target = Connection::open(&db_path).unwrap();
    db::migrations::migrate(&target, None).unwrap();
    target
        .execute("INSERT INTO customers (id, name) VALUES (1, '导入前的客户')", [])
        .unwrap();

    let backup = serde_json::json!({
        "schemaVersion": db::migrations::latest_version(),
        "cards": [],
        "customers": [{ "id": 9, "name": "导入后的客户" }]
    });

    let result = db::backup::import_data(&target, Some(&db_path), backup).unwrap();
    let snapshot = result["backupPath"].as_str().expect("应返回快照路径").to_string();

    assert!(std::path::Path::new(&snapshot).exists(), "快照文件必须真的落盘");
    assert!(snapshot.contains("pre-import"));

    // 快照里应当是导入**之前**的数据：这是它存在的唯一理由
    let snapshot_conn = Connection::open(&snapshot).unwrap();
    let name: String = snapshot_conn
        .query_row("SELECT name FROM customers WHERE id = 1", [], |row| row.get(0))
        .unwrap();
    assert_eq!(name, "导入前的客户");

    // 而当前库已经被覆盖
    let current: i64 = target
        .query_row("SELECT COUNT(*) FROM customers WHERE id = 1", [], |row| row.get(0))
        .unwrap();
    assert_eq!(current, 0);
}
