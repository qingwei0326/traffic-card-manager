pub mod backup;
pub mod cards;
pub mod customers;
pub mod finance;
pub mod imports;
pub mod legacy;
pub mod migrations;
pub mod plans;

// 共享工具 trait 与常量（阶段六第一梯队：合并 backup/imports/plans 三处重复定义）

/// 导入利润系数：实收金额 × 该系数 = 利润（原为 imports.rs 内两处硬编码 0.94）
pub(crate) const IMPORT_PROFIT_RATE: f64 = 0.94;

/// 字符串为空时回退到默认值的便捷 trait。
/// backup/imports/plans 三处曾各自定义同名私有 trait，现统一到此。
pub(crate) trait EmptyDefault {
    fn if_empty(self, default: &str) -> String;
    fn if_empty_owned(self, default: String) -> String;
}

impl EmptyDefault for String {
    fn if_empty(self, default: &str) -> String {
        if self.is_empty() {
            default.to_string()
        } else {
            self
        }
    }

    fn if_empty_owned(self, default: String) -> String {
        if self.is_empty() {
            default
        } else {
            self
        }
    }
}
