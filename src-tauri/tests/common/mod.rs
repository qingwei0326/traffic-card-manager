#![allow(dead_code)]

// 集成测试共享 fixture。
//
// 注意：src/ 下的文件是用 #[path] 直接包含进来的，它们内部写的是 crate::error / crate::models /
// crate::db 这类绝对路径。因此这些模块必须能在测试 crate 的根命名空间下解析到，
// 使用方需在自己的文件里写：
//
//   mod common;
//   pub use common::{db, error, models};
//   use common::conn;
//
// 这样既复用了 fixture，又不破坏 src 文件里的 crate:: 引用。

use rusqlite::Connection;

#[path = "../../src/db/mod.rs"]
pub mod db;
#[path = "../../src/error.rs"]
pub mod error;
#[path = "../../src/models.rs"]
pub mod models;

/// 每个用例独享一个内存库，天然隔离、可重复执行。
pub fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    db::schema::init_schema(&conn).unwrap();
    conn
}
