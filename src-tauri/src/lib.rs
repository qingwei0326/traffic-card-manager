mod commands;
mod api172;
mod config_store;
mod db;
mod desktop;
mod error;
mod models;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let migration_error =
                if let Some(old_dir) = db::migration::old_electron_data_dir() {
                    db::migration::copy_legacy_files(&old_dir, &app_data_dir)
                        .err()
                        .map(|err| err.to_string())
                } else {
                    None
                };

            let db_path = app_data_dir.join("traffic-cards.db");
            let config_path = app_data_dir.join("config.json");
            let conn = rusqlite::Connection::open(&db_path)?;
            db::schema::init_schema(&conn)?;

            app.manage(state::AppState {
                db: std::sync::Mutex::new(conn),
                db_path,
                config_path,
                migration_error: std::sync::Mutex::new(migration_error),
            });
            app.manage(desktop::DesktopState::default());
            desktop::setup_desktop(app.handle().clone())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cards::cards_get_all,
            commands::cards::cards_get_by_id,
            commands::cards::cards_create,
            commands::cards::cards_update,
            commands::cards::cards_delete,
            commands::cards::cards_get_stats,
            commands::cards::cards_get_monthly_stats,
            commands::cards::cards_get_expiring_soon,
            commands::customers::customers_get_all,
            commands::customers::customers_get_by_id,
            commands::customers::customers_create,
            commands::customers::customers_update,
            commands::customers::customers_delete,
            commands::customers::customers_get_cards,
            commands::customers::customers_find_duplicates,
            commands::customers::customers_merge,
            commands::plans::plans_get_all,
            commands::plans::plans_import,
            commands::plans::plans_import_from_file,
            commands::plans::plans_match,
            commands::plans::plans_backfill_cards,
            commands::plans::plans_delete,
            commands::backup::backup_export,
            commands::backup::backup_import,
            commands::imports::import_172,
            commands::imports::import_haoyi,
            commands::finance::finance_get_profit_summary,
            commands::finance::finance_get_monthly_profit,
            commands::finance::finance_get_profit_by_carrier,
            commands::finance::finance_get_profit_by_plan_type,
            commands::api::api172_test_connection,
            commands::api::api172_get_products,
            commands::api::api172_sync_products,
            commands::api::api172_get_order_info,
            commands::api::api_config_get,
            commands::api::api_config_save,
            commands::api::update_check,
            commands::api::update_download,
            commands::api::update_install,
            commands::api::app_show_window,
            commands::api::app_choose_close_action,
            commands::api::notifications_check_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
