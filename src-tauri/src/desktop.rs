use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

const MENU_SHOW: &str = "show";
const MENU_CHECK_EXPIRY: &str = "check_expiry";
const MENU_QUIT: &str = "quit";

pub struct DesktopState {
    close_action: Mutex<Option<String>>,
    notified_cards: Mutex<HashMap<i64, String>>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            close_action: Mutex::new(None),
            notified_cards: Mutex::new(HashMap::new()),
        }
    }
}

pub fn choose_close_action(app: &AppHandle, state: &DesktopState, action: &str) -> AppResult<()> {
    *state
        .close_action
        .lock()
        .map_err(|_| AppError::Message("关闭状态锁已损坏".into()))? = Some(action.to_string());

    if let Some(window) = app.get_webview_window("main") {
        if action == "minimize" {
            window
                .hide()
                .map_err(|err| AppError::Message(err.to_string()))?;
        } else if action == "quit" {
            app.exit(0);
        }
    }
    Ok(())
}

pub fn check_expiry_notifications(
    app: &AppHandle,
    app_state: &AppState,
    manual: bool,
) -> AppResult<()> {
    let conn = app_state
        .db
        .lock()
        .map_err(|_| AppError::Message("数据库锁已损坏".into()))?;
    let cards = crate::db::cards::get_expiring_soon(&conn, 30)?;
    drop(conn);

    if cards.is_empty() {
        if manual {
            emit_message(app, "暂无即将到期的卡片")?;
        }
        return Ok(());
    }

    let desktop_state = app.state::<DesktopState>();
    let mut notified = desktop_state
        .notified_cards
        .lock()
        .map_err(|_| AppError::Message("提醒状态锁已损坏".into()))?;

    for card in cards {
        let promo_end = card.promo_end.clone().unwrap_or_default();
        if !manual && notified.get(&card.id) == Some(&promo_end) {
            continue;
        }

        let message = format!("{} 将于 {} 到期", card.card_name, promo_end);
        notified.insert(card.id, promo_end);
        emit_message(app, &message)?;
        send_native_notification(app, &message);
    }

    Ok(())
}

pub fn setup_desktop(app: AppHandle) -> AppResult<()> {
    setup_tray(&app)?;
    setup_close_intercept(&app);
    setup_expiry_timer(app);
    Ok(())
}

fn setup_tray(app: &AppHandle) -> AppResult<()> {
    let menu = MenuBuilder::new(app)
        .text(MENU_SHOW, "显示主窗口")
        .text(MENU_CHECK_EXPIRY, "立即检查到期提醒")
        .separator()
        .text(MENU_QUIT, "退出")
        .build()
        .map_err(|err| AppError::Message(err.to_string()))?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("流量卡管理系统")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                MENU_SHOW => {
                    let _ = show_main_window(app);
                }
                MENU_CHECK_EXPIRY => {
                    if let Some(state) = app.try_state::<AppState>() {
                        let _ = check_expiry_notifications(app, &state, true);
                    }
                }
                MENU_QUIT => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .build(app)
        .map_err(|err| AppError::Message(err.to_string()))?;
    Ok(())
}

fn setup_close_intercept(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(state) = app_handle.try_state::<DesktopState>() {
                    if let Ok(mut action) = state.close_action.lock() {
                        *action = None;
                    }
                }
                let _ = app_handle.emit("app:close-request", ());
            }
        });
    }
}

fn setup_expiry_timer(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5 * 60)).await;
        loop {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = check_expiry_notifications(&app, &state, false);
            }
            tokio::time::sleep(Duration::from_secs(30 * 60)).await;
        }
    });
}

fn show_main_window(app: &AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .show()
            .map_err(|err| AppError::Message(err.to_string()))?;
        window
            .unminimize()
            .map_err(|err| AppError::Message(err.to_string()))?;
        window
            .set_focus()
            .map_err(|err| AppError::Message(err.to_string()))?;
    }
    Ok(())
}

fn emit_message(app: &AppHandle, message: &str) -> AppResult<()> {
    app.emit("notification:message", message)
        .map_err(|err| AppError::Message(err.to_string()))
}

fn send_native_notification(app: &AppHandle, message: &str) {
    let _ = app
        .notification()
        .builder()
        .title("流量卡到期提醒")
        .body(message)
        .show();
}
