use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    Card, Customer, CustomerFilters, CustomerInput, MergeResult, PaginatedResult,
};
use crate::state::AppState;

#[tauri::command]
pub fn customers_get_all(
    state: tauri::State<'_, AppState>,
    filters: Option<CustomerFilters>,
) -> AppResult<PaginatedResult<Customer>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::get_customers(&conn, filters)
}

#[tauri::command]
pub fn customers_get_by_id(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<Option<Customer>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::get_customer_by_id(&conn, id)
}

#[tauri::command]
pub fn customers_create(
    state: tauri::State<'_, AppState>,
    customer: CustomerInput,
) -> AppResult<Customer> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::create_customer(&conn, customer)
}

#[tauri::command]
pub fn customers_update(
    state: tauri::State<'_, AppState>,
    id: i64,
    customer: CustomerInput,
) -> AppResult<Customer> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::update_customer(&conn, id, customer)
}

#[tauri::command]
pub fn customers_delete(state: tauri::State<'_, AppState>, id: i64) -> AppResult<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::delete_customer(&conn, id)
}

#[tauri::command]
pub fn customers_get_cards(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<Vec<Card>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::get_customer_cards(&conn, id)
}

#[tauri::command]
pub fn customers_find_duplicates(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<Vec<Customer>>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::find_duplicate_customers(&conn)
}

#[tauri::command]
pub fn customers_merge(
    state: tauri::State<'_, AppState>,
    keep_id: i64,
    merge_ids: Vec<i64>,
) -> AppResult<MergeResult> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::customers::merge_customers(&conn, keep_id, merge_ids)
}
