mod db;
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
