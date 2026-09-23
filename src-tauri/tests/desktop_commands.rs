// 仅保留本文件实际用到的模块；updater/api172 各自依赖 crate::error 与 crate::models。
// 移除了未使用的 api_commands / config_store / db / desktop / state，消除大量 dead_code 警告。
#[path = "../src/api172.rs"]
mod api172;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;
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

#[test]
fn api172_validation_rejects_blank_credentials() {
    let missing_user = api172::validate_config(&models::Api172Config {
        user_id: " ".into(),
        secret: "secret".into(),
    })
    .unwrap_err()
    .to_string();
    assert_eq!(missing_user, "请输入172号卡 user_id");

    let missing_secret = api172::validate_config(&models::Api172Config {
        user_id: "user".into(),
        secret: " ".into(),
    })
    .unwrap_err()
    .to_string();
    assert_eq!(missing_secret, "请输入172号卡 secret");
}

#[test]
fn api172_validation_rejects_blank_order_id_and_sets_timeout() {
    let missing_order = api172::validate_order_id(" ").unwrap_err().to_string();
    assert_eq!(missing_order, "请输入订单号");
    assert_eq!(api172::REQUEST_TIMEOUT_SECS, 15);
}
