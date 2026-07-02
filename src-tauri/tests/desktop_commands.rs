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

#[test]
fn update_commands_return_compatibility_message() {
    let check = tauri::async_runtime::block_on(api_commands::update_check()).unwrap();
    let download = tauri::async_runtime::block_on(api_commands::update_download()).unwrap();
    let install = tauri::async_runtime::block_on(api_commands::update_install()).unwrap();

    assert!(!check.ok);
    assert_eq!(
        check.message.as_deref(),
        Some("Tauri 自动更新将在后续版本接入")
    );
    assert_eq!(
        download.message.as_deref(),
        Some("Tauri 自动更新将在后续版本接入")
    );
    assert_eq!(
        install.message.as_deref(),
        Some("Tauri 自动更新将在后续版本接入")
    );
}
