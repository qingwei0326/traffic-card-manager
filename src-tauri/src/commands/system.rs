use crate::state::AppState;
use serde::Serialize;

/// 暴露给前端的迁移健康状态。
///
/// `ok == false` 时 `error` 带可读原因：可能是旧版数据搬迁失败，
/// 也可能是启动时 `db::migrations::migrate` 抛错（schema 升级失败）。
/// 前端据此弹「起动告警」，而不是让用户面对一个静默崩溃的窗口。
#[derive(Debug, Clone, Serialize)]
pub struct MigrationStatus {
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn migration_get_status(state: tauri::State<'_, AppState>) -> MigrationStatus {
    let error = state
        .migration_error
        .lock()
        .ok()
        .and_then(|guard| guard.clone());
    MigrationStatus {
        ok: error.is_none(),
        error,
    }
}
