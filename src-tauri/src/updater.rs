use crate::error::{AppError, AppResult};
use crate::models::UpdateResult;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    pending_update: Mutex<Option<Update>>,
    downloaded_bytes: Mutex<Option<Vec<u8>>>,
}

pub fn ok_result(message: impl Into<String>, version: Option<String>) -> UpdateResult {
    UpdateResult {
        ok: true,
        message: Some(message.into()),
        version,
    }
}

pub fn error_result(message: impl Into<String>) -> UpdateResult {
    UpdateResult {
        ok: false,
        message: Some(message.into()),
        version: None,
    }
}

pub fn progress_percent(downloaded: u64, content_length: Option<u64>) -> u8 {
    match content_length {
        Some(total) if total > 0 => ((downloaded.saturating_mul(100) / total).min(100)) as u8,
        _ => 0,
    }
}

fn emit_error(app: &AppHandle, message: &str) {
    let _ = app.emit("update:error", message.to_string());
}

fn map_lock_error() -> AppError {
    AppError::Message("更新状态锁已损坏".into())
}

pub async fn check_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> AppResult<UpdateResult> {
    let updater = app
        .updater()
        .map_err(|err| AppError::Message(err.to_string()))?;

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();

            {
                let mut pending = state.pending_update.lock().map_err(|_| map_lock_error())?;
                *pending = Some(update);
            }

            {
                let mut downloaded = state.downloaded_bytes.lock().map_err(|_| map_lock_error())?;
                *downloaded = None;
            }

            let _ = app.emit("update:available", version.clone());
            Ok(ok_result(format!("发现新版本 v{}", version), Some(version)))
        }
        Ok(None) => {
            {
                let mut pending = state.pending_update.lock().map_err(|_| map_lock_error())?;
                *pending = None;
            }

            {
                let mut downloaded = state.downloaded_bytes.lock().map_err(|_| map_lock_error())?;
                *downloaded = None;
            }

            let _ = app.emit("update:not-available", ());
            Ok(ok_result("当前已是最新版本", None))
        }
        Err(err) => {
            let message = format!("检查更新失败: {}", err);
            emit_error(&app, &message);
            Ok(error_result(message))
        }
    }
}

pub async fn download_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> AppResult<UpdateResult> {
    let update = {
        let pending = state.pending_update.lock().map_err(|_| map_lock_error())?;
        pending.clone()
    };

    let Some(update) = update else {
        let message = "没有可下载的更新，请先检查更新";
        emit_error(&app, message);
        return Ok(error_result(message));
    };

    let version = update.version.clone();
    let mut downloaded: u64 = 0;
    let download_app = app.clone();
    let finish_app = app.clone();

    let result = update
        .download(
            move |chunk_length, content_length| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let _ = download_app.emit(
                    "update:progress",
                    progress_percent(downloaded, content_length),
                );
            },
            move || {
                let _ = finish_app.emit("update:progress", 100_u8);
            },
        )
        .await;

    match result {
        Ok(bytes) => {
            {
                let mut downloaded_bytes =
                    state.downloaded_bytes.lock().map_err(|_| map_lock_error())?;
                *downloaded_bytes = Some(bytes);
            }

            let _ = app.emit("update:downloaded", ());
            Ok(ok_result(format!("更新 v{} 已下载完成", version), Some(version)))
        }
        Err(err) => {
            let message = format!("下载更新失败: {}", err);
            emit_error(&app, &message);
            Ok(error_result(message))
        }
    }
}

pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> AppResult<UpdateResult> {
    let update = {
        let pending = state.pending_update.lock().map_err(|_| map_lock_error())?;
        pending.clone()
    };

    let Some(update) = update else {
        let message = "没有可安装的更新，请先检查更新";
        emit_error(&app, message);
        return Ok(error_result(message));
    };

    let bytes = {
        let mut downloaded = state.downloaded_bytes.lock().map_err(|_| map_lock_error())?;
        downloaded.take()
    };

    let Some(bytes) = bytes else {
        let message = "没有可安装的更新，请先下载更新";
        emit_error(&app, message);
        return Ok(error_result(message));
    };

    match update.install(bytes) {
        Ok(()) => {
            {
                let mut pending = state.pending_update.lock().map_err(|_| map_lock_error())?;
                *pending = None;
            }

            Ok(ok_result("正在重启安装更新", None))
        }
        Err(err) => {
            let message = format!("安装更新失败: {}", err);
            emit_error(&app, &message);
            Ok(error_result(message))
        }
    }
}
