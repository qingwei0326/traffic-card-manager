use crate::error::AppResult;
use crate::models::Api172Config;
use serde_json::json;
use std::collections::BTreeMap;

const BASE_URL: &str = "https://haokaopenapi.lot-ml.com";

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
    let mut params = BTreeMap::new();
    params.insert("DownOrderID".to_string(), order_id);
    request("/api/order/GetOrderInfo", params, config).await
}

async fn request(
    path: &str,
    params: BTreeMap<String, String>,
    config: Api172Config,
) -> AppResult<serde_json::Value> {
    let timestamp = chrono::Utc::now().timestamp().to_string();
    let mut all_params = BTreeMap::new();
    all_params.insert("user_id".to_string(), config.user_id);
    all_params.insert("Timestamp".to_string(), timestamp);
    all_params.extend(params);
    let sign = generate_sign(&all_params, &config.secret);
    all_params.insert("user_sign".to_string(), sign);

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{BASE_URL}{path}"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&all_params)
        .send()
        .await?;
    Ok(response.json().await?)
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
