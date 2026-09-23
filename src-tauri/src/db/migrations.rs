//! 版本化 schema 迁移。
//!
//! 版本记录在 SQLite 自带的 `PRAGMA user_version` 里，不额外建元数据表——
//! 它就在数据库文件头，跟着库一起走，备份/拷贝时不会丢。
//!
//! 三条硬规则：
//! 1. **v1 是冻结的基线**。它对应历史上那 15 条 `add_column_if_missing` 的累计结果，
//!    已经发布过，一个字都不能再改。要改 schema 就加 v2、v3……
//! 2. **迁移在事务里跑**。SQLite 的 DDL 是事务性的，`user_version` 也是，
//!    所以中途失败会整体回滚，不会留下「表建了一半、版本号却已经加一」的库。
//! 3. **拒绝降级打开**。`user_version` 高于本程序已知的最高版本时直接报错，
//!    而不是假装没事——旧程序读新库可能把不认识的列写坏。

use crate::error::{AppError, AppResult};
use rusqlite::Connection;

/// 一条迁移。
///
/// `up` 用函数指针而不是字符串，是因为 v1 基线里有 `add_column_if_missing`
/// 这种必须先查 `PRAGMA table_info` 才能决定要不要 ALTER 的逻辑，纯 SQL 表达不了。
pub(crate) struct Migration {
    pub(crate) version: u32,
    pub(crate) description: &'static str,
    pub(crate) up: fn(&Connection) -> AppResult<()>,
}

/// 迁移清单。**只能往后追加**，改已有条目等于让线上已有的库与新代码对不上账。
static MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    description: "基线：建表、补齐历史遗留列、建索引",
    up: baseline_v1,
}];

/// 本程序认识的最高版本。
pub fn latest_version() -> u32 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

pub(crate) fn current_version(conn: &Connection) -> AppResult<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))?)
}

/// 把数据库迁到最新版本。启动时调用一次，幂等。
///
/// 注意 `PRAGMA foreign_keys` 必须在开事务**之前**设置：
/// SQLite 明确规定它在事务内是 no-op，挪进事务里会静默失效，
/// 外键约束就形同虚设了。
pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    run_pending(conn, MIGRATIONS)
}

/// 依次执行版本号大于当前版本的所有迁移，整体作为一个事务。
///
/// 单独拆出来是为了让「失败整体回滚」这条性质可被测试直接验证——
/// 调用方可以传一份含故意失败步骤的清单，而不必污染真实的 `MIGRATIONS`。
pub(crate) fn run_pending(conn: &Connection, migrations: &[Migration]) -> AppResult<()> {
    let current = current_version(conn)?;
    let latest = migrations.last().map(|m| m.version).unwrap_or(current);

    if current > latest {
        return Err(AppError::Message(format!(
            "数据库版本 {current} 高于当前应用支持的最高版本 {latest}。\
             该数据库可能由更新版本的应用写入，请用新版本打开，否则可能损坏数据。"
        )));
    }

    let pending: Vec<&Migration> = migrations
        .iter()
        .filter(|m| m.version > current)
        .collect();
    if pending.is_empty() {
        return Ok(());
    }

    // 用 unchecked_transaction 而不是 transaction()：后者要求 &mut Connection，
    // 而整个 db 层（以及 state.rs 里 Mutex 后面取出来的）统一的都是 &Connection，
    // 为此改一遍所有签名不值得。代价是编译器不再帮我们挡嵌套事务——
    // 调用方必须保证此刻不在事务里，否则 SQLite 会在运行时报
    // "cannot start a transaction within a transaction"。
    let tx = conn.unchecked_transaction()?;
    for migration in pending {
        (migration.up)(&tx)?;
        tx.pragma_update(None, "user_version", migration.version)?;
        eprintln!(
            "[db] 已应用迁移 v{}：{}",
            migration.version, migration.description
        );
    }
    tx.commit()?;

    Ok(())
}

// ---------------------------------------------------------------------------
// v1：冻结的基线
// ---------------------------------------------------------------------------

fn baseline_v1(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
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

    // 以下 15 条是历史版本逐次累加出来的补列。对已经补过的库它们是 no-op，
    // 对更早的库则是必要的补丁。冻结在此，不再增删。
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

/// 列不存在才 ADD COLUMN。
///
/// SQLite 没有 `ADD COLUMN IF NOT EXISTS`，只能先查 `PRAGMA table_info`。
/// 表名/列名全是本文件内的常量，不存在注入面。
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
