use crate::error::{AppError, AppResult};
use crate::models::Api172Config;
use serde_json::json;
use std::collections::BTreeMap;
use std::time::Duration;

const BASE_URL: &str = "https://haokaopenapi.lot-ml.com";
pub(crate) const REQUEST_TIMEOUT_SECS: u64 = 15;

pub(crate) fn validate_config(config: &Api172Config) -> AppResult<()> {
    if config.user_id.trim().is_empty() {
        return Err(AppError::Message("请输入172号卡 user_id".into()));
    }
    if config.secret.trim().is_empty() {
        return Err(AppError::Message("请输入172号卡 secret".into()));
    }
    Ok(())
}

pub(crate) fn validate_order_id(order_id: &str) -> AppResult<()> {
    if order_id.trim().is_empty() {
        return Err(AppError::Message("请输入订单号".into()));
    }
    Ok(())
}

fn client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()?)
}

fn http_error_message(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        "请求超时，请稍后重试".into()
    } else {
        format!("网络请求失败: {err}")
    }
}

pub async fn test_connection(config: Api172Config) -> AppResult<serde_json::Value> {
    match get_products(config, None).await {
        Ok(value) if value.get("code").and_then(|code| code.as_i64()) == Some(0) => {
            let count = value
                .get("data")
                .and_then(|data| data.as_array())
                .map(|data| data.len())
                .unwrap_or(0);
            Ok(json!({ "success": true, "message": format!("连接成功！共 {count} 个产品") }))
        }
        Ok(value) => Ok(json!({
            "success": false,
            "message": format!("API返回错误: {}", value.get("message").and_then(|m| m.as_str()).unwrap_or("未知错误"))
        })),
        Err(err) => Ok(json!({ "success": false, "message": format!("连接失败: {err}") })),
    }
}

pub async fn get_products(
    config: Api172Config,
    product_id: Option<String>,
) -> AppResult<serde_json::Value> {
    let mut params = BTreeMap::new();
    if let Some(product_id) = product_id.filter(|value| !value.is_empty()) {
        params.insert("ProductID".to_string(), product_id);
    }
    request("/api/order/GetProductsV2", params, config).await
}

pub async fn get_order_info(
    config: Api172Config,
    order_id: String,
) -> AppResult<serde_json::Value> {
    validate_order_id(&order_id)?;
    let mut params = BTreeMap::new();
    params.insert("DownOrderID".to_string(), order_id);
    request("/api/order/GetOrderInfo", params, config).await
}

async fn request(
    path: &str,
    params: BTreeMap<String, String>,
    config: Api172Config,
) -> AppResult<serde_json::Value> {
    validate_config(&config)?;

    let timestamp = chrono::Utc::now().timestamp().to_string();
    let mut all_params = BTreeMap::new();
    all_params.insert("user_id".to_string(), config.user_id);
    all_params.insert("Timestamp".to_string(), timestamp);
    all_params.extend(params);
    let sign = generate_sign(&all_params, &config.secret);
    all_params.insert("user_sign".to_string(), sign);

    let response = client()?
        .post(format!("{BASE_URL}{path}"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&all_params)
        .send()
        .await
        .map_err(|err| AppError::Message(http_error_message(&err)))?;

    response
        .json()
        .await
        .map_err(|err| AppError::Message(format!("API响应格式不正确: {err}")))
}

fn generate_sign(params: &BTreeMap<String, String>, secret: &str) -> String {
    let mut text = String::new();
    for (key, value) in params {
        text.push_str(key);
        text.push('=');
        text.push_str(value);
        text.push('&');
    }
    text.push_str("secret=");
    text.push_str(secret);
    format!("{:x}", md5::compute(text))
}
