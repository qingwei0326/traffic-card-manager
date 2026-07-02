use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::ImportResult;
use crate::state::AppState;

#[tauri::command]
pub fn import_172(
    state: tauri::State<'_, AppState>,
    rows: Vec<serde_json::Value>,
) -> AppResult<ImportResult> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::imports::import_from_172(&conn, rows)
}

#[tauri::command]
pub fn import_haoyi(
    state: tauri::State<'_, AppState>,
    rows: Vec<serde_json::Value>,
) -> AppResult<ImportResult> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::imports::import_from_haoyi(&conn, rows)
}
