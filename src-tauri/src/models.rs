use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResult<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Card {
    pub id: i64,
    pub card_name: String,
    pub carrier: String,
    pub plan_type: String,
    pub monthly_price: f64,
    pub data_amount: Option<String>,
    pub region: Option<String>,
    pub contract_period: Option<i64>,
    pub renewal_reminder_days: Option<i64>,
    pub apply_time: Option<String>,
    pub activate_time: Option<String>,
    pub promo_start: Option<String>,
    pub promo_end: Option<String>,
    pub phone_number: Option<String>,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub profit: f64,
    pub status: String,
    pub notes: Option<String>,
    pub external_order_id: Option<String>,
    pub id_card: Option<String>,
    pub address: Option<String>,
    pub express_company: Option<String>,
    pub express_number: Option<String>,
    pub first_charge_amount: Option<f64>,
    pub source: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CardInput {
    pub card_name: Option<String>,
    pub carrier: Option<String>,
    pub plan_type: Option<String>,
    pub monthly_price: Option<f64>,
    pub data_amount: Option<String>,
    pub region: Option<String>,
    pub contract_period: Option<i64>,
    pub renewal_reminder_days: Option<i64>,
    pub apply_time: Option<String>,
    pub activate_time: Option<String>,
    pub promo_start: Option<String>,
    pub promo_end: Option<String>,
    pub phone_number: Option<String>,
    pub customer_id: Option<i64>,
    pub profit: Option<f64>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub external_order_id: Option<String>,
    pub id_card: Option<String>,
    pub address: Option<String>,
    pub express_company: Option<String>,
    pub express_number: Option<String>,
    pub first_charge_amount: Option<f64>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardFilters {
    pub status: Option<String>,
    pub carrier: Option<String>,
    pub plan_type: Option<String>,
    pub search: Option<String>,
    pub page: Option<i64>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardStats {
    pub total: i64,
    pub active: i64,
    pub expired: i64,
    pub cancelled: i64,
    #[serde(rename = "totalProfit")]
    pub total_profit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyStats {
    #[serde(rename = "newCards")]
    pub new_cards: i64,
    #[serde(rename = "monthProfit")]
    pub month_profit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub wechat: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub card_count: Option<i64>,
    pub total_profit: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CustomerInput {
    pub name: Option<String>,
    pub phone: Option<String>,
    pub wechat: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerFilters {
    pub search: Option<String>,
    pub tag: Option<String>,
    pub page: Option<i64>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub merged: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: i64,
    pub code: Option<String>,
    pub grab_code: Option<String>,
    pub name: String,
    pub carrier: Option<String>,
    pub monthly_price: f64,
    pub data_amount: i64,
    pub promo_period: i64,
    pub contract_period: i64,
    pub first_charge: i64,
    pub activation: Option<String>,
    pub region: Option<String>,
    pub commission: Option<String>,
    pub note: Option<String>,
    pub age_limit: Option<String>,
    pub forbid_regions: Option<String>,
    pub express: Option<String>,
    pub source: Option<String>,
    pub sale_status: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: i64,
    pub updated: i64,
    pub skipped: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanImportResult {
    pub imported: i64,
    pub updated: i64,
    pub backfilled: i64,
    pub total: i64,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfitSummary {
    #[serde(rename = "totalProfit")]
    pub total_profit: f64,
    #[serde(rename = "avgProfit")]
    pub avg_profit: f64,
    #[serde(rename = "totalCards")]
    pub total_cards: i64,
    #[serde(rename = "monthProfit")]
    pub month_profit: f64,
    #[serde(rename = "monthCards")]
    pub month_cards: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyProfitRow {
    pub month: String,
    pub profit: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfitByType {
    pub carrier: Option<String>,
    pub plan_type: Option<String>,
    pub profit: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Api172Config {
    pub user_id: String,
    pub secret: String,
}

/// secret 当前的保护级别，用于 UI 明确告知用户凭证是否真的被保护。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Api172SecretSource {
    /// 存在 OS 钥匙串（Windows 凭据管理器 / macOS Keychain 等）
    Keyring,
    /// 钥匙串不可用，退回本地混淆文件（非加密）
    Obfuscated,
    /// 仅进程内存缓存，重启即失效
    Memory,
    /// 明文落盘，最坏情况
    Plaintext,
    None,
}

/// 返回给前端的配置状态。
///
/// 安全约定：**secret 永不穿越 IPC**。前端只能拿到是否配置、定长掩码
/// 与保护级别，够渲染 UI，不足以还原凭证。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Api172ConfigStatus {
    pub user_id: String,
    pub configured: bool,
    pub source: Api172SecretSource,
    /// 定长掩码，刻意不暴露真实长度
    pub masked_secret: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    pub ok: bool,
    pub message: Option<String>,
    pub version: Option<String>,
}
