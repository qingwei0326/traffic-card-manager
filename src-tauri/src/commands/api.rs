use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{Api172Config, PlanImportResult, UpdateResult};
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
pub async fn api172_test_connection(
    config: Api172Config,
) -> AppResult<serde_json::Value> {
    crate::api172::test_connection(config).await
}

#[tauri::command]
pub async fn api172_get_products(config: Api172Config) -> AppResult<serde_json::Value> {
    crate::api172::get_products(config, None).await
}

#[tauri::command]
pub async fn api172_sync_products(
    state: tauri::State<'_, AppState>,
    config: Api172Config,
) -> AppResult<PlanImportResult> {
    let value = crate::api172::get_products(config, None).await?;
    if value.get("code").and_then(|code| code.as_i64()) != Some(0) {
        return Err(AppError::Message(
            value
                .get("message")
                .and_then(|message| message.as_str())
                .unwrap_or("API返回错误")
                .to_string(),
        ));
    }
    let products = value
        .get("data")
        .and_then(|data| data.as_array())
        .cloned()
        .unwrap_or_default();
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    db::plans::sync_plans_from_172_api(&conn, products)
}

#[tauri::command]
pub async fn api172_get_order_info(
    config: Api172Config,
    order_id: String,
) -> AppResult<serde_json::Value> {
    crate::api172::get_order_info(config, order_id).await
}

#[tauri::command]
pub fn api_config_get(state: tauri::State<'_, AppState>) -> AppResult<Api172Config> {
    crate::config_store::get_api_config(&state.config_path)
}

#[tauri::command]
pub fn api_config_save(
    state: tauri::State<'_, AppState>,
    config: Api172Config,
) -> AppResult<()> {
    crate::config_store::save_api_config(&state.config_path, config)
}

#[tauri::command]
pub async fn update_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::updater::UpdateState>,
) -> AppResult<UpdateResult> {
    crate::updater::check_update(app, state).await
}

#[tauri::command]
pub async fn update_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::updater::UpdateState>,
) -> AppResult<UpdateResult> {
    crate::updater::download_update(app, state).await
}

#[tauri::command]
pub async fn update_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::updater::UpdateState>,
) -> AppResult<UpdateResult> {
    crate::updater::install_update(app, state).await
}

#[tauri::command]
pub fn app_show_window(app: tauri::AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .show()
            .map_err(|err| AppError::Message(err.to_string()))?;
        window
            .set_focus()
            .map_err(|err| AppError::Message(err.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn app_choose_close_action(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::desktop::DesktopState>,
    action: String,
) -> AppResult<()> {
    crate::desktop::choose_close_action(&app, &state, &action)
}

#[tauri::command]
pub fn notifications_check_now(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    crate::desktop::check_expiry_notifications(&app, &state, true)
}
