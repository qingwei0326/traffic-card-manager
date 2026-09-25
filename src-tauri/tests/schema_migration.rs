use rusqlite::Connection;
use std::fs;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;

#[test]
fn initializes_fresh_database_schema() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("traffic-cards.db");
    let conn = Connection::open(&db_path).unwrap();

    db::migrations::migrate(&conn, None).unwrap();

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('customers','cards','plans')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 3);

    let card_columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(cards)").unwrap();
        stmt.query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    };
    assert!(card_columns.contains(&"external_order_id".to_string()));
    assert!(card_columns.contains(&"renewal_reminder_days".to_string()));
}

#[test]
fn copies_old_database_without_modifying_source() {
    let old_dir = tempfile::tempdir().unwrap();
    let new_dir = tempfile::tempdir().unwrap();
    let old_db = old_dir.path().join("traffic-cards.db");
    let old_config = old_dir.path().join("config.json");
    let new_db = new_dir.path().join("traffic-cards.db");
    let new_config = new_dir.path().join("config.json");

    fs::write(&old_db, b"legacy-db-bytes").unwrap();
    fs::write(&old_config, r#"{"user_id":"u","secret_enc":"cw=="}"#).unwrap();

    db::legacy::copy_legacy_files(old_dir.path(), new_dir.path()).unwrap();

    assert_eq!(fs::read(&new_db).unwrap(), b"legacy-db-bytes");
    assert_eq!(
        fs::read_to_string(&new_config).unwrap(),
        r#"{"user_id":"u","secret_enc":"cw=="}"#
    );
    assert_eq!(fs::read(&old_db).unwrap(), b"legacy-db-bytes");
}
