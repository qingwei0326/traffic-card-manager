use crate::error::AppResult;
use crate::models::Api172Config;
use base64::Engine;
use std::path::Path;

pub fn get_api_config(config_path: &Path) -> AppResult<Api172Config> {
    if !config_path.exists() {
        return Ok(Api172Config {
            user_id: String::new(),
            secret: String::new(),
        });
    }
    let value: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(config_path)?)?;
    let user_id = value
        .get("user_id")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let secret = if let Some(encoded) = value.get("secret_enc").and_then(|value| value.as_str()) {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap_or_default();
        String::from_utf8(decoded).unwrap_or_default()
    } else {
        value
            .get("secret")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string()
    };
    Ok(Api172Config { user_id, secret })
}

pub fn save_api_config(config_path: &Path, config: Api172Config) -> AppResult<()> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let secret_enc =
        base64::engine::general_purpose::STANDARD.encode(config.secret.as_bytes());
    let value = serde_json::json!({ "user_id": config.user_id, "secret_enc": secret_enc });
    std::fs::write(config_path, serde_json::to_string_pretty(&value)?)?;
    Ok(())
}
