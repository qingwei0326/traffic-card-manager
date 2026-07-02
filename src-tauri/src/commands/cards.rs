use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    Card, CardFilters, CardInput, CardStats, MonthlyStats, PaginatedResult,
};
use crate::state::AppState;

#[tauri::command]
pub fn cards_get_all(
    state: tauri::State<'_, AppState>,
    filters: Option<CardFilters>,
) -> AppResult<PaginatedResult<Card>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::get_cards(&conn, filters)
}

#[tauri::command]
pub fn cards_get_by_id(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<Option<Card>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::get_card_by_id(&conn, id)
}

#[tauri::command]
pub fn cards_create(state: tauri::State<'_, AppState>, card: CardInput) -> AppResult<Card> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::create_card(&conn, card)
}

#[tauri::command]
pub fn cards_update(
    state: tauri::State<'_, AppState>,
    id: i64,
    card: CardInput,
) -> AppResult<Card> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::update_card(&conn, id, card)
}

#[tauri::command]
pub fn cards_delete(state: tauri::State<'_, AppState>, id: i64) -> AppResult<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::delete_card(&conn, id)
}

#[tauri::command]
pub fn cards_get_stats(state: tauri::State<'_, AppState>) -> AppResult<CardStats> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::get_card_stats(&conn)
}

#[tauri::command]
pub fn cards_get_monthly_stats(
    state: tauri::State<'_, AppState>,
    year: i64,
    month: i64,
) -> AppResult<MonthlyStats> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::get_monthly_stats(&conn, year, month)
}

#[tauri::command]
pub fn cards_get_expiring_soon(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> AppResult<Vec<Card>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::cards::get_expiring_soon(&conn, days)
}
