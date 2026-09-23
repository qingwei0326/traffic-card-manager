//! 版本化迁移的行为测试。
//!
//! 刻意放在 tests/ 而不是 src 里的 `#[cfg(test)]`：src 下的测试模块会被每一个
//! 用 `#[path]` 引入 `src/db/mod.rs` 的集成测试二进制各编译一份，
//! 同一批用例会被重复执行四五遍，CI 日志里凭空多出几十条。

mod common;
pub use common::{db, error, models};
use common::conn;

use db::migrations::{current_version, latest_version, migrate, run_pending, Migration};
use error::AppError;
use rusqlite::Connection;

fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap()
        > 0
}

#[test]
fn fresh_database_reaches_latest_version() {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();

    assert_eq!(current_version(&conn).unwrap(), latest_version());
    assert!(table_exists(&conn, "customers"));
    assert!(table_exists(&conn, "cards"));
    assert!(table_exists(&conn, "plans"));
}

#[test]
fn migrate_is_idempotent() {
    let conn = conn();
    conn.execute(
        "INSERT INTO customers (name, phone) VALUES ('张三', '13800000000')",
        [],
    )
    .unwrap();

    migrate(&conn).unwrap();
    migrate(&conn).unwrap();

    assert_eq!(current_version(&conn).unwrap(), latest_version());
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM customers", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1, "重复迁移不能动业务数据");
}

#[test]
fn legacy_zero_version_database_is_upgraded_in_place() {
    // 模拟线上现状：库早就建好表、存了数据，但 user_version 从来没被设过（=0）
    let conn = conn();
    conn.execute(
        "INSERT INTO customers (name, phone) VALUES ('李四', '13900000000')",
        [],
    )
    .unwrap();
    conn.pragma_update(None, "user_version", 0).unwrap();

    migrate(&conn).unwrap();

    assert_eq!(current_version(&conn).unwrap(), latest_version());
    let name: String = conn
        .query_row("SELECT name FROM customers WHERE id = 1", [], |row| row.get(0))
        .unwrap();
    assert_eq!(name, "李四", "升级必须保留原有数据");
}

#[test]
fn refuses_to_open_a_newer_database() {
    let conn = conn();
    conn.pragma_update(None, "user_version", latest_version() + 1)
        .unwrap();

    let err = migrate(&conn).unwrap_err();
    assert!(
        err.to_string().contains("高于当前应用支持的最高版本"),
        "错误信息应说清是版本太新，实际是: {err}"
    );
}

#[test]
fn failing_migration_rolls_back_everything() {
    let conn = Connection::open_in_memory().unwrap();

    fn creates_table(conn: &Connection) -> Result<(), AppError> {
        conn.execute_batch("CREATE TABLE halfway (id INTEGER PRIMARY KEY)")?;
        Ok(())
    }
    fn always_fails(_conn: &Connection) -> Result<(), AppError> {
        Err(AppError::Message("故意失败".to_string()))
    }

    let pending = [
        Migration {
            version: 1,
            description: "先建一张表",
            up: creates_table,
        },
        Migration {
            version: 2,
            description: "然后炸掉",
            up: always_fails,
        },
    ];

    assert!(run_pending(&conn, &pending).is_err());

    // 关键：既不能留下半成品表，也不能把版本号推进到 1
    assert!(
        !table_exists(&conn, "halfway"),
        "失败的迁移必须回滚已执行的 DDL"
    );
    assert_eq!(
        current_version(&conn).unwrap(),
        0,
        "失败的迁移不能留下已经加一的 user_version"
    );
}

fn index_exists(conn: &Connection, table: &str, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=?1 AND name=?2",
        rusqlite::params![table, name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap()
        > 0
}

/// PRAGMA index_list 的第三列是 unique 标记
fn index_is_unique(conn: &Connection, name: &str) -> Option<bool> {
    let mut stmt = conn
        .prepare("PRAGMA index_list(cards)")
        .unwrap();
    let rows: Vec<(String, bool)> = stmt
        .query_map([], |row| Ok((row.get::<_, String>(1)?, row.get::<_, i64>(2)? == 1)))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    rows.into_iter().find(|(n, _)| n == name).map(|(_, u)| u)
}

#[test]
fn v2_creates_performance_indexes() {
    let conn = conn();

    assert!(index_exists(&conn, "customers", "idx_customers_name_phone"));
    assert!(index_exists(&conn, "cards", "idx_cards_external_order_id"));
}

#[test]
fn v2_unique_index_degrades_when_duplicates_exist() {
    // 关键：先只建 v1 基线（此时 external_order_id 还没有任何索引），
    // 才能往里塞脏数据；否则 conn() 默认已跑到 v2、UNIQUE 索引已存在，
    // 插重复值会在迁移前就因约束冲突炸掉。
    let conn = Connection::open_in_memory().unwrap();
    db::migrations::migrate_to_baseline(&conn).unwrap();
    // 模拟真实脏数据：两条相同的 172 订单号 + 一条空串哨兵
    conn.execute(
        "INSERT INTO cards (card_name, carrier, plan_type, external_order_id) VALUES ('A','移动','性价比','ORD-1')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO cards (card_name, carrier, plan_type, external_order_id) VALUES ('B','移动','性价比','ORD-1')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO cards (card_name, carrier, plan_type, external_order_id) VALUES ('C','移动','性价比','')",
        [],
    )
    .unwrap();

    migrate(&conn).unwrap();

    // 索引建出来了，但因为有重复/空串哨兵，必须是普通索引，不能是 UNIQUE
    assert!(index_exists(&conn, "cards", "idx_cards_external_order_id"));
    assert_eq!(
        index_is_unique(&conn, "idx_cards_external_order_id"),
        Some(false),
        "脏数据下不应是 UNIQUE，否则后续插入空串哨兵会爆"
    );
}

#[test]
fn v2_unique_index_applies_when_data_is_clean() {
    // 同样先只建 v1，再塞**一条**干净的订单号，最后跑 migrate 触发 v2
    // ——这样才能验证「v2 看到的是干净数据、主动决定上 UNIQUE」这条分支，
    // 而不是 conn() 在空库上顺手建的 UNIQUE 索引。
    let conn = Connection::open_in_memory().unwrap();
    db::migrations::migrate_to_baseline(&conn).unwrap();
    conn.execute(
        "INSERT INTO cards (card_name, carrier, plan_type, external_order_id) VALUES ('A','移动','性价比','ORD-1')",
        [],
    )
    .unwrap();

    migrate(&conn).unwrap();

    assert_eq!(
        index_is_unique(&conn, "idx_cards_external_order_id"),
        Some(true),
        "干净数据下应给 UNIQUE，顺带兜底 external_order_id 不重复"
    );
}

#[test]
fn foreign_keys_are_enforced_after_migrate() {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();

    let enabled: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap();
    // 这条最容易在重构时被误伤：把 PRAGMA foreign_keys 挪进事务里就变成 no-op
    assert_eq!(enabled, 1, "migrate 后外键约束必须处于开启状态");
}
