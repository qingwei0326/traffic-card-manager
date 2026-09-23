use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub fn backup_export(state: tauri::State<'_, AppState>) -> AppResult<serde_json::Value> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::backup::export_data(&conn)
}

#[tauri::command]
pub fn backup_import(
    state: tauri::State<'_, AppState>,
    data: serde_json::Value,
) -> AppResult<serde_json::Value> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::backup::import_data(&conn, Some(&state.db_path), data)
}
