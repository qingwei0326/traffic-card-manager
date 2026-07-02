use crate::error::AppResult;
use rusqlite::Connection;

pub fn init_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          wechat TEXT,
          address TEXT,
          notes TEXT,
          tags TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          card_name TEXT NOT NULL,
          carrier TEXT NOT NULL,
          plan_type TEXT NOT NULL,
          monthly_price REAL DEFAULT 0,
          data_amount TEXT,
          region TEXT,
          contract_period INTEGER DEFAULT 0,
          renewal_reminder_days INTEGER DEFAULT 30,
          apply_time TEXT,
          activate_time TEXT,
          promo_start TEXT,
          promo_end TEXT,
          phone_number TEXT,
          customer_id INTEGER,
          profit REAL DEFAULT 0,
          status TEXT DEFAULT '使用中',
          notes TEXT,
          external_order_id TEXT,
          id_card TEXT,
          address TEXT,
          express_company TEXT,
          express_number TEXT,
          first_charge_amount REAL DEFAULT 0,
          source TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE,
          grab_code TEXT,
          name TEXT NOT NULL,
          carrier TEXT,
          monthly_price REAL DEFAULT 0,
          data_amount INTEGER DEFAULT 0,
          promo_period INTEGER DEFAULT 0,
          contract_period INTEGER DEFAULT 0,
          first_charge INTEGER DEFAULT 0,
          activation TEXT,
          region TEXT DEFAULT '全国',
          commission TEXT,
          note TEXT,
          age_limit TEXT,
          forbid_regions TEXT,
          express TEXT,
          source TEXT DEFAULT '号易平台',
          sale_status TEXT DEFAULT '在售',
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
        "#,
    )?;

    add_column_if_missing(conn, "cards", "external_order_id", "TEXT")?;
    add_column_if_missing(conn, "cards", "id_card", "TEXT")?;
    add_column_if_missing(conn, "cards", "address", "TEXT")?;
    add_column_if_missing(conn, "cards", "express_company", "TEXT")?;
    add_column_if_missing(conn, "cards", "express_number", "TEXT")?;
    add_column_if_missing(conn, "cards", "first_charge_amount", "REAL DEFAULT 0")?;
    add_column_if_missing(conn, "cards", "source", "TEXT")?;
    add_column_if_missing(conn, "cards", "region", "TEXT")?;
    add_column_if_missing(conn, "cards", "contract_period", "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "cards", "renewal_reminder_days", "INTEGER DEFAULT 30")?;
    add_column_if_missing(conn, "customers", "tags", "TEXT")?;
    add_column_if_missing(conn, "plans", "age_limit", "TEXT")?;
    add_column_if_missing(conn, "plans", "forbid_regions", "TEXT")?;
    add_column_if_missing(conn, "plans", "express", "TEXT")?;
    add_column_if_missing(conn, "plans", "sale_status", "TEXT DEFAULT '在售'")?;

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_cards_customer_id ON cards(customer_id);
        CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
        CREATE INDEX IF NOT EXISTS idx_cards_promo_end ON cards(promo_end);
        CREATE INDEX IF NOT EXISTS idx_cards_apply_time ON cards(apply_time);
        CREATE INDEX IF NOT EXISTS idx_cards_region ON cards(region);
        CREATE INDEX IF NOT EXISTS idx_plans_name ON plans(name);
        CREATE INDEX IF NOT EXISTS idx_plans_carrier ON plans(carrier);
        "#,
    )?;

    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> AppResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;

    if !columns.iter().any(|name| name == column) {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))?;
    }

    Ok(())
}
