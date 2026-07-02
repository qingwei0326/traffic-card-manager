use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{MonthlyProfitRow, ProfitByType, ProfitSummary};
use crate::state::AppState;

#[tauri::command]
pub fn finance_get_profit_summary(
    state: tauri::State<'_, AppState>,
) -> AppResult<ProfitSummary> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::finance::get_profit_summary(&conn)
}

#[tauri::command]
pub fn finance_get_monthly_profit(
    state: tauri::State<'_, AppState>,
    year: i64,
) -> AppResult<Vec<MonthlyProfitRow>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::finance::get_monthly_profit(&conn, year)
}

#[tauri::command]
pub fn finance_get_profit_by_carrier(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<ProfitByType>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::finance::get_profit_by_carrier(&conn)
}

#[tauri::command]
pub fn finance_get_profit_by_plan_type(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<ProfitByType>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::finance::get_profit_by_plan_type(&conn)
}
