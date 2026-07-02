#[path = "../src/commands/api.rs"]
mod api_commands;
#[path = "../src/api172.rs"]
mod api172;
#[path = "../src/config_store.rs"]
mod config_store;
#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/desktop.rs"]
mod desktop;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;
#[path = "../src/state.rs"]
mod state;
#[path = "../src/updater.rs"]
mod updater;

#[test]
fn update_result_helpers_keep_frontend_contract() {
    let ok = updater::ok_result("当前已是最新版本", None);
    assert!(ok.ok);
    assert_eq!(ok.message.as_deref(), Some("当前已是最新版本"));
    assert!(ok.version.is_none());

    let error = updater::error_result("没有可下载的更新，请先检查更新");
    assert!(!error.ok);
    assert_eq!(
        error.message.as_deref(),
        Some("没有可下载的更新，请先检查更新")
    );
    assert!(error.version.is_none());
}

#[test]
fn update_progress_percent_is_bounded() {
    assert_eq!(updater::progress_percent(25, Some(100)), 25);
    assert_eq!(updater::progress_percent(150, Some(100)), 100);
    assert_eq!(updater::progress_percent(25, Some(0)), 0);
    assert_eq!(updater::progress_percent(25, None), 0);
}
