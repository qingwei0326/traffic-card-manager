use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub config_path: PathBuf,
    pub migration_error: Mutex<Option<String>>,
}
