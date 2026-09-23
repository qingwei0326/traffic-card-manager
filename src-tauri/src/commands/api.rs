use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    Api172Config, Api172ConfigStatus, Api172SecretSource, PlanImportResult, UpdateResult,
};
use crate::state::AppState;
use tauri::Manager;

/// 把 IPC 传来的 user_id 与安全存储里的 secret 拼成完整配置。
///
/// secret 由 Rust 侧自行读取，**永远不经过 IPC**，因此也不会出现在
/// 前端 payload、日志或开发者工具里。允许前端只传 user_id 来覆盖文件中的旧值，
/// 方便「先填账号测试、通过后再保存」。
fn build_config(state: &tauri::State<'_, AppState>, user_id: &str) -> AppResult<Api172Config> {
    let mut config = crate::config_store::load_api_config(&state.config_path)?;
    if !user_id.trim().is_empty() {
        config.user_id = user_id.trim().to_string();
    }
    Ok(config)
}

#[tauri::command]
pub async fn api172_test_connection(
    state: tauri::State<'_, AppState>,
    user_id: String,
) -> AppResult<serde_json::Value> {
    let config = build_config(&state, &user_id)?;
    crate::api172::test_connection(config).await
}

#[tauri::command]
pub async fn api172_get_products(
    state: tauri::State<'_, AppState>,
    user_id: String,
) -> AppResult<serde_json::Value> {
    let config = build_config(&state, &user_id)?;
    crate::api172::get_products(config, None).await
}

#[tauri::command]
pub async fn api172_sync_products(
    state: tauri::State<'_, AppState>,
    user_id: String,
) -> AppResult<PlanImportResult> {
    let config = build_config(&state, &user_id)?;
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
    state: tauri::State<'_, AppState>,
    user_id: String,
    order_id: String,
) -> AppResult<serde_json::Value> {
    let config = build_config(&state, &user_id)?;
    crate::api172::get_order_info(config, order_id).await
}

/// 读取配置状态（同步命令，保持简单）。返回体里没有明文 secret。
#[tauri::command]
pub fn api_config_get(state: tauri::State<'_, AppState>) -> AppResult<Api172ConfigStatus> {
    crate::config_store::get_api_config_status(&state.config_path)
}

/// 保存配置（同步命令）。
///
/// `secret` 用 `Option<String>` 表达三种语义：
/// - `Some("")`：清空凭证
/// - `Some(x)`：更新凭证
/// - `None`：不动凭证，只更新 user_id（避免「只改账号」误删已存好的 secret）
///
/// 返回值让前端能立刻展示真实落地的保护级别，而不是乐观假设。
#[tauri::command]
pub fn api_config_save(
    state: tauri::State<'_, AppState>,
    user_id: String,
    secret: Option<String>,
) -> AppResult<Api172ConfigStatus> {
    let applied = crate::config_store::save_api_config(
        &state.config_path,
        &user_id,
        secret.as_deref(),
    )?;
    if applied == Api172SecretSource::Memory || applied == Api172SecretSource::Plaintext {
        eprintln!(
            "[warn] 172号卡 secret 保护级别降级为 {:?}，请检查本机钥匙串可用性",
            applied
        );
    }
    crate::config_store::get_api_config_status(&state.config_path)
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
