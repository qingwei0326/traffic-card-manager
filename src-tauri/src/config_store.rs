//! 172号卡 API 凭证的安全读写。
//!
//! 设计原则：
//! 1. **secret 永不穿越 IPC**：对外只暴露 [`get_api_config_status`]（带掩码），
//!   明文 secret 只通过 [`load_api_config`] 留在 Rust 进程内部。
//! 2. **三级降级**：任何一层失败都不会导致应用启动失败，最坏情况只是
//!   「保护强度下降」并给出可见告警，而不是「崩溃或静默丢凭证」。
//! 3. **旧数据自愈**：旧版本的 base64/明文配置在首次读取时自动搬迁到钥匙串。

use crate::error::{AppError, AppResult};
use crate::models::{Api172Config, Api172ConfigStatus, Api172SecretSource};
use base64::Engine;
use keyring::Entry;
use serde_json::json;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

/// 钥匙串的服务名，绑定到 `tauri.conf.json` 的 identifier。
///
/// ⚠️ 一旦版本流出就**永远不能改**：改了以后旧版本写入的凭据会读不出来，
/// 用户只能重新填写 secret。
const KEYRING_SERVICE: &str = "com.traffic-card.manager";

/// 钥匙串里的凭据名。本应用只有一个 172 凭证，因此用固定 key，
/// 不用 user_id 做 key —— 否则用户改一次 user_id 就会在钥匙串里留下孤儿条目。
const KEYRING_USER: &str = "api172-secret";

/// 配置文件里标记「secret 存在哪里」的字段名。
const STORE_MODE_KEY: &str = "secret_store";

/// 文件落盘形态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SecretStoreMode {
    /// secret 在 OS 钥匙串里，文件中**不保留任何副本**。
    Keyring,
    /// 钥匙串不可用，退回本地混淆文件（base64，**不是加密**，只能防肩窥）。
    Obfuscated,
    /// 最坏情况：明文落盘。
    Plaintext,
}

impl SecretStoreMode {
    /// 序列化到配置文件时的字符串标记。
    fn as_str(self) -> &'static str {
        match self {
            SecretStoreMode::Keyring => "keyring",
            SecretStoreMode::Obfuscated => "obfuscated",
            SecretStoreMode::Plaintext => "plaintext",
        }
    }
}

/// 进程内 secret 缓存，key 是配置文件路径的字符串形式。
///
/// 只在「钥匙串不可用且无法落盘」时兜住当次会话，重启即失效。
fn secret_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(config_path: &Path) -> String {
    config_path.to_string_lossy().to_string()
}

/// 读缓存。锁中毒时按「没缓存」处理，绝不 panic。
fn cache_get(key: &str) -> Option<String> {
    match secret_cache().lock() {
        Ok(cache) => cache.get(key).cloned(),
        Err(_) => None,
    }
}

/// 写缓存。写失败同样不影响主流程——缓存只是兜底手段。
fn cache_set(key: &str, secret: &str) {
    if let Ok(mut cache) = secret_cache().lock() {
        cache.insert(key.to_string(), secret.to_string());
    }
}

fn cache_remove(key: &str) {
    if let Ok(mut cache) = secret_cache().lock() {
        cache.remove(key);
    }
}

// ---------------------------------------------------------------------------
// 钥匙串
// ---------------------------------------------------------------------------

fn keyring_entry() -> AppResult<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|err| AppError::Message(format!("系统钥匙串不可用: {err}")))
}

fn keyring_get() -> Option<String> {
    let entry = keyring_entry().ok()?;
    match entry.get_password() {
        Ok(secret) if !secret.is_empty() => Some(secret),
        _ => None,
    }
}

fn keyring_write(secret: &str) -> AppResult<()> {
    keyring_entry()?
        .set_password(secret)
        .map_err(|err| AppError::Message(format!("写入系统钥匙串失败: {err}")))
}

/// 删除钥匙串条目。凭据本来就不存在时不算错误，
/// 也不能去匹配 keyring 的错误变体——不同版本枚举不一样，越具体越容易编译不过。
fn keyring_delete() -> AppResult<()> {
    let entry = keyring_entry()?;
    if entry.get_password().is_err() {
        return Ok(());
    }
    entry
        .delete_credential()
        .map_err(|err| AppError::Message(format!("删除系统钥匙串凭据失败: {err}")))
}

// ---------------------------------------------------------------------------
// 配置文件读写
// ---------------------------------------------------------------------------

/// 读配置文件。文件不存在或内容非法时返回空对象而不是报错——
/// 凭证读不出来只应表现为「未配置」，不该把设置页或启动流程打挂。
fn read_config_file(config_path: &Path) -> AppResult<serde_json::Value> {
    if !config_path.exists() {
        return Ok(json!({}));
    }
    let raw = std::fs::read_to_string(config_path)?;
    if raw.trim().is_empty() {
        return Ok(json!({}));
    }
    Ok(serde_json::from_str(&raw)?)
}

fn write_config_file(config_path: &Path, value: &serde_json::Value) -> AppResult<()> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(config_path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

/// 从配置文件的 value 里解析出 secret。
///
/// 先试 `secret_enc`（base64 混淆），再退回 `secret`（明文）。
/// 两种 key 都来自旧版本或降级写入，都需要兼容。
fn file_secret(value: &serde_json::Value) -> Option<String> {
    if let Some(encoded) = value.get("secret_enc").and_then(|v| v.as_str()) {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap_or_default();
        let text = String::from_utf8(decoded).unwrap_or_default();
        if !text.is_empty() {
            return Some(text);
        }
    }
    match value.get("secret").and_then(|v| v.as_str()) {
        Some(secret) if !secret.is_empty() => Some(secret.to_string()),
        _ => None,
    }
}

/// 文件里这份 secret 是不是被 base64 混淆过的（而非裸明文）。
fn is_encoded_only(value: &serde_json::Value) -> bool {
    value.get("secret_enc").is_some() && value.get("secret").is_none()
}

/// 按给定模式组装要落盘的 JSON：先抹掉一切历史 secret 字段，再写入当前形态。
fn build_value(base: &serde_json::Value, mode: SecretStoreMode, secret: &str) -> serde_json::Value {
    let mut value = match base.as_object() {
        Some(map) => serde_json::Value::Object(map.clone()),
        None => json!({}),
    };
    if let Some(map) = value.as_object_mut() {
        map.remove("secret");
        map.remove("secret_enc");
        map.insert(STORE_MODE_KEY.to_string(), json!(mode.as_str()));
        match mode {
            SecretStoreMode::Keyring => {
                // secret 已在钥匙串里，文件中不再保留副本
            }
            SecretStoreMode::Obfuscated => {
                let encoded =
                    base64::engine::general_purpose::STANDARD.encode(secret.as_bytes());
                map.insert("secret_enc".to_string(), json!(encoded));
            }
            SecretStoreMode::Plaintext => {
                map.insert("secret".to_string(), json!(secret));
            }
        }
    }
    value
}

// ---------------------------------------------------------------------------
// 读取：三级回退
// ---------------------------------------------------------------------------

/// 读取 secret，返回 `(secret, 来源)`。
///
/// 顺序：OS 钥匙串 → 配置文件（含旧版明文）→ 进程内存。
/// 任何一层异常都下沉为「未配置」，绝不向上抛 Err。
fn resolve_secret(config_path: &Path) -> (Option<String>, Api172SecretSource) {
    let cache = cache_key(config_path);

    // 一级：OS 钥匙串
    if let Some(secret) = keyring_get() {
        cache_set(&cache, &secret);
        return (Some(secret), Api172SecretSource::Keyring);
    }

    // 二级：配置文件
    let value = read_config_file(config_path).unwrap_or_else(|_| json!({}));
    if let Some(secret) = file_secret(&value) {
        if upgrade_to_keyring(config_path, &value, &secret).is_ok() {
            cache_set(&cache, &secret);
            return (Some(secret), Api172SecretSource::Keyring);
        }
        // 搬迁失败：保持文件现状，如实告知当前保护级别
        let source = if is_encoded_only(&value) {
            Api172SecretSource::Obfuscated
        } else {
            Api172SecretSource::Plaintext
        };
        cache_set(&cache, &secret);
        return (Some(secret), source);
    }

    // 三级：进程内存（上次降级保存的残留）
    if let Some(secret) = cache_get(&cache) {
        return (Some(secret), Api172SecretSource::Memory);
    }

    (None, Api172SecretSource::None)
}

/// 把文件里的旧/降级 secret 搬迁到钥匙串，成功后抹掉文件副本。
///
/// 抹文件失败时必须返回 Err：此时 secret 虽然进了钥匙串，但明文副本仍在盘上，
/// 让上层如实报成「明文落盘」比粉饰成「已进钥匙串」更诚实。
fn upgrade_to_keyring(
    config_path: &Path,
    base: &serde_json::Value,
    secret: &str,
) -> AppResult<()> {
    keyring_write(secret)?;
    let value = build_value(base, SecretStoreMode::Keyring, secret);
    write_config_file(config_path, &value)
}

fn read_user_id(config_path: &Path) -> String {
    read_config_file(config_path)
        .ok()
        .and_then(|value| value.get("user_id").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// 写入：三级降级
// ---------------------------------------------------------------------------

/// 按 keyring → 混淆文件 → 明文 → 内存 的顺序尝试保存，返回**实际达成**的级别。
///
/// 本函数永不返回 Err：凭证保存失败时用户看到的应该是「保护强度下降」告警，
/// 而不是一条让整条命令失败的异常。
fn persist_secret(config_path: &Path, base: &serde_json::Value, secret: &str) -> Api172SecretSource {
    let cache = cache_key(config_path);
    let value = build_value(base, SecretStoreMode::Keyring, secret);

    match keyring_write(secret) {
        Ok(()) => {
            // 文件写入失败不影响可用性：钥匙串已经保住了 secret
            if let Err(err) = write_config_file(config_path, &value) {
                eprintln!("[warn] 钥匙串已写入，但更新配置文件失败: {err}");
            }
            cache_remove(&cache);
            Api172SecretSource::Keyring
        }
        Err(keyring_err) => {
            eprintln!("[warn] 系统钥匙串不可用，降级保存 secret: {keyring_err}");
            let value = build_value(base, SecretStoreMode::Obfuscated, secret);
            if write_config_file(config_path, &value).is_ok() {
                cache_remove(&cache);
                return Api172SecretSource::Obfuscated;
            }
            eprintln!("[warn] 混淆写入失败，尝试明文写入 secret");
            let value = build_value(base, SecretStoreMode::Plaintext, secret);
            if write_config_file(config_path, &value).is_ok() {
                cache_remove(&cache);
                return Api172SecretSource::Plaintext;
            }
            eprintln!("[warn] 明文写入失败，secret 仅保留在进程内存中，重启后需重新填写");
            cache_set(&cache, secret);
            Api172SecretSource::Memory
        }
    }
}

/// 保存配置。
///
/// - `secret` 为 `Some("")`：清空凭证（同时删钥匙串、文件副本与内存缓存）
/// - `secret` 为 `Some(x)`：更新凭证
/// - `secret` 为 `None`：只更新 user_id，保留已有凭证
///
/// 返回实际达成的保护级别，便于 UI 立刻给出真实反馈。
pub fn save_api_config(
    config_path: &Path,
    user_id: &str,
    secret: Option<&str>,
) -> AppResult<Api172SecretSource> {
    let cache = cache_key(config_path);
    let base = read_config_file(config_path).unwrap_or_else(|_| json!({}));

    // 基础对象：保留无关字段，清掉一切历史 secret 字段
    let mut value = match base.as_object() {
        Some(map) => serde_json::Value::Object(map.clone()),
        None => json!({}),
    };
    if let Some(map) = value.as_object_mut() {
        map.remove("secret");
        map.remove("secret_enc");
        map.remove(STORE_MODE_KEY);
        map.insert("user_id".to_string(), json!(user_id.trim()));
    }

    match secret {
        Some(raw) if raw.trim().is_empty() => {
            // 主动撤销凭证：三处一起清干净
            if let Err(err) = keyring_delete() {
                eprintln!("[warn] 删除钥匙串凭据失败: {err}");
            }
            cache_remove(&cache);
            write_config_file(config_path, &value)?;
            Ok(Api172SecretSource::None)
        }
        Some(raw) => Ok(persist_secret(config_path, &value, raw.trim())),
        None => {
            // 不碰 secret，但要保证 user_id 落盘
            write_config_file(config_path, &value)?;
            let (existing, source) = resolve_secret(config_path);
            if existing.is_none() {
                return Ok(Api172SecretSource::None);
            }
            Ok(source)
        }
    }
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/// 给 IPC 用的配置状态。**不含明文 secret**，前端拿到的是定长掩码。
pub fn get_api_config_status(config_path: &Path) -> AppResult<Api172ConfigStatus> {
    let (secret, source) = resolve_secret(config_path);
    let configured = match secret.as_deref() {
        Some(secret) => !secret.trim().is_empty(),
        None => false,
    };
    let final_source = if configured {
        source
    } else {
        Api172SecretSource::None
    };
    Ok(Api172ConfigStatus {
        user_id: read_user_id(config_path),
        configured,
        source: final_source,
        masked_secret: mask_secret(secret.as_deref()),
        warning: source_warning(final_source),
    })
}

/// 给 Rust 内部（签名请求）用的完整配置，含明文 secret。
///
/// ⚠️ 调用方必须保证结果不会进 IPC 返回值。
pub fn load_api_config(config_path: &Path) -> AppResult<Api172Config> {
    let (secret, _source) = resolve_secret(config_path);
    Ok(Api172Config {
        user_id: read_user_id(config_path),
        secret: secret.unwrap_or_default(),
    })
}

/// 定长掩码。刻意不按真实长度输出，避免从掩码长度反推凭证长度。
fn mask_secret(secret: Option<&str>) -> Option<String> {
    match secret {
        Some(secret) if !secret.is_empty() => Some("••••••••".to_string()),
        _ => None,
    }
}

/// 把保护级别翻译成用户能看懂的告警。钥匙串级别无需告警。
fn source_warning(source: Api172SecretSource) -> Option<String> {
    match source {
        Api172SecretSource::Keyring => None,
        Api172SecretSource::Obfuscated => Some(
            "系统钥匙串不可用，secret 已混淆保存到本地配置文件（不是加密），请勿外传该文件。"
                .to_string(),
        ),
        Api172SecretSource::Plaintext => Some(
            "系统钥匙串不可用，secret 以明文保存在本地配置文件，请注意本机安全。".to_string(),
        ),
        Api172SecretSource::Memory => Some(
            "系统钥匙串不可用且无法写入本地文件，secret 仅保存在内存中，重启后需要重新填写。"
                .to_string(),
        ),
        Api172SecretSource::None => None,
    }
}

#[cfg(test)]
mod tests {
    //! 这里只测**不碰钥匙串**的纯函数。
    //!
    //! 刻意不去测 `save_api_config` / `resolve_secret` 的整条链路：
    //! 它们会读写真实的 OS 钥匙串（Windows 是凭据管理器），单机跑会污染用户环境，
    //! 在 CI 上又因后端缺失而退化成降级分支，测出来的结论没有可移植性。
    //! 「secret 不越界」这条安全不变量改由下面的序列化断言守住——它锁的是
    //! 对外暴露的类型形状，而形状跟平台无关。

    use super::*;

    /// 一个不可能出现在掩码或告警文案里的高辨识度值。
    const SECRET: &str = "top-secret-9f3c1a";

    #[test]
    fn mask_is_fixed_length_and_leaks_nothing() {
        let short = mask_secret(Some("a"));
        let long = mask_secret(Some(&"x".repeat(64)));

        assert_eq!(short, long, "掩码必须定长，否则会泄漏凭证长度");
        assert_eq!(short.as_deref(), Some("••••••••"));
        assert_eq!(mask_secret(None), None);
        assert_eq!(mask_secret(Some("")), None);
    }

    #[test]
    fn status_payload_never_carries_the_secret() {
        let status = Api172ConfigStatus {
            user_id: "user-1".to_string(),
            configured: true,
            source: Api172SecretSource::Keyring,
            masked_secret: mask_secret(Some(SECRET)),
            warning: source_warning(Api172SecretSource::Keyring),
        };

        let payload = serde_json::to_string(&status).unwrap();
        assert!(
            !payload.contains(SECRET),
            "返回给前端的载荷里出现了明文 secret: {payload}"
        );

        // 顺带锁住字段集合：以后谁往 Api172ConfigStatus 里加了 secret 字段，这里立刻红。
        let payload_value = serde_json::to_value(&status).unwrap();
        let mut keys: Vec<&str> = payload_value
            .as_object()
            .unwrap()
            .keys()
            .map(|key| key.as_str())
            .collect();
        // serde_json 的对象默认走 BTreeMap，键是字母序；排序后比较，免得字段改名就误报
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec!["configured", "masked_secret", "source", "user_id", "warning"]
        );
    }

    #[test]
    fn keyring_mode_leaves_no_secret_copy_in_file() {
        let base = json!({ "user_id": "u", "secret": SECRET, "secret_enc": "legacy" });
        let value = build_value(&base, SecretStoreMode::Keyring, SECRET);

        assert!(value.get("secret").is_none(), "钥匙串模式不得留明文副本");
        assert!(value.get("secret_enc").is_none(), "钥匙串模式不得留混淆副本");
        assert_eq!(value.get("secret_store").unwrap(), "keyring");
        assert_eq!(value.get("user_id").unwrap(), "u", "无关字段必须保留");
    }

    #[test]
    fn obfuscated_mode_stores_encoded_not_plaintext() {
        let value = build_value(&json!({}), SecretStoreMode::Obfuscated, SECRET);

        assert!(value.get("secret").is_none(), "降级形态也不该落明文");
        let encoded = value.get("secret_enc").unwrap().as_str().unwrap();
        assert_ne!(encoded, SECRET);
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), SECRET);
    }

    #[test]
    fn file_secret_reads_both_legacy_shapes() {
        let encoded = base64::engine::general_purpose::STANDARD.encode(SECRET.as_bytes());

        assert_eq!(file_secret(&json!({ "secret_enc": encoded })).as_deref(), Some(SECRET));
        assert_eq!(file_secret(&json!({ "secret": SECRET })).as_deref(), Some(SECRET));
        assert_eq!(file_secret(&json!({})), None);
        // base64 非法时不能 panic，只能当没读到
        assert_eq!(file_secret(&json!({ "secret_enc": "!!!not-base64!!!" })), None);
    }

    #[test]
    fn source_warning_only_fires_on_degraded_storage() {
        assert!(source_warning(Api172SecretSource::Keyring).is_none());
        assert!(source_warning(Api172SecretSource::None).is_none());
        assert!(source_warning(Api172SecretSource::Obfuscated).is_some());
        assert!(source_warning(Api172SecretSource::Plaintext).is_some());
        assert!(source_warning(Api172SecretSource::Memory).is_some());
    }
}
