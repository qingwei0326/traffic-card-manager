use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{Plan, PlanImportResult};
use crate::state::AppState;

#[tauri::command]
pub fn plans_get_all(state: tauri::State<'_, AppState>) -> AppResult<Vec<Plan>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::plans::get_all_plans(&conn)
}

#[tauri::command]
pub fn plans_import(
    state: tauri::State<'_, AppState>,
    plans: Vec<serde_json::Value>,
) -> AppResult<PlanImportResult> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::plans::import_plans(&conn, plans)
}

#[tauri::command]
pub fn plans_import_from_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    file_path: String,
) -> AppResult<PlanImportResult> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::plans::import_plans_from_file(&conn, &app, file_path)
}

#[tauri::command]
pub fn plans_match(
    state: tauri::State<'_, AppState>,
    card_name: String,
) -> AppResult<Option<Plan>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::plans::match_plan(&conn, &card_name)
}

#[tauri::command]
pub fn plans_backfill_cards(
    state: tauri::State<'_, AppState>,
) -> AppResult<serde_json::Value> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    let backfilled = db::plans::backfill_card_plan_fields(&conn)?;
    Ok(serde_json::json!({ "backfilled": backfilled }))
}

#[tauri::command]
pub fn plans_delete(state: tauri::State<'_, AppState>, id: i64) -> AppResult<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::plans::delete_plan(&conn, id)
}
