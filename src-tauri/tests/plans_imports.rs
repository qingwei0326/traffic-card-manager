use rusqlite::Connection;
use serde_json::json;

#[path = "../src/db/mod.rs"]
mod db;
#[path = "../src/error.rs"]
mod error;
#[path = "../src/models.rs"]
mod models;

fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    db::schema::init_schema(&conn).unwrap();
    conn
}

#[test]
fn reimporting_same_172_order_updates_pending_record() {
    let conn = conn();
    let pending = vec![json!({
        "订单状态": "已发货",
        "激活状态": "",
        "172订单号": "172-A001",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "0",
        "首充金额": "",
        "姓名": "张三",
        "按号码发货": "13800138000",
        "省份": "福建",
        "城市": "漳州",
        "县区": "芗城区",
        "详细地址": "测试路1号",
        "下单时间": "2026-06-01"
    })];
    let settled = vec![json!({
        "订单状态": "已结算",
        "激活状态": "已激活",
        "172订单号": "172-A001",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "100",
        "首充金额": "50",
        "姓名": "张三",
        "按号码发货": "13800138000",
        "省份": "福建",
        "城市": "漳州",
        "县区": "芗城区",
        "详细地址": "测试路1号",
        "下单时间": "2026-06-01",
        "激活时间": "2026-06-10",
        "物流公司": "顺丰",
        "运单号": "SF123"
    })];

    assert_eq!(db::imports::import_from_172(&conn, pending).unwrap().imported, 1);
    let result = db::imports::import_from_172(&conn, settled).unwrap();
    let cards = db::cards::get_cards(&conn, None).unwrap().data;

    assert_eq!(result.updated, 1);
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].external_order_id.as_deref(), Some("172-A001"));
    assert_eq!(cards[0].status, "使用中");
    assert_eq!(cards[0].activate_time.as_deref(), Some("2026-06-10"));
    assert_eq!(cards[0].profit, 94.0);
}

#[test]
fn plan_backfill_preserves_manual_fields() {
    let conn = conn();
    let created = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("回填保护测试移动卡【29元235G】".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            monthly_price: Some(29.0),
            data_amount: Some("235G".into()),
            region: Some("福建".into()),
            contract_period: Some(12),
            promo_start: Some("2026-06-10".into()),
            promo_end: Some("2026-10-31".into()),
            activate_time: Some("2026-06-10".into()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P002",
            "name": "回填保护测试移动卡【29元235G】",
            "carrier": "移动",
            "monthlyPrice": 29,
            "dataAmount": 235,
            "promoPeriod": 6,
            "contractPeriod": 24,
            "firstCharge": 50,
            "status": "在售"
        })],
    )
    .unwrap();

    let updated = db::cards::get_card_by_id(&conn, created.id).unwrap().unwrap();
    assert_eq!(updated.contract_period, Some(12));
    assert_eq!(updated.promo_start.as_deref(), Some("2026-06-10"));
    assert_eq!(updated.promo_end.as_deref(), Some("2026-10-31"));
}

#[test]
fn plan_matching_rejects_similar_name_when_price_and_data_differ() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P004",
            "name": "福建移动专享卡【59元80G+100分钟】仅发厦门",
            "carrier": "移动",
            "monthlyPrice": 59,
            "dataAmount": 80,
            "promoPeriod": 0,
            "contractPeriod": 0,
            "firstCharge": 50,
            "region": "厦门",
            "status": "在售"
        })],
    )
    .unwrap();

    let matched = db::plans::match_plan(&conn, "福建移动专享卡【29元235G】").unwrap();
    assert!(matched.is_none());
}

#[test]
fn imported_pending_status_does_not_regress_active_172_order() {
    let conn = conn();
    let pending = json!({
        "订单状态": "已发货",
        "激活状态": "",
        "172订单号": "172-A002",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "0",
        "姓名": "王五",
        "按号码发货": "13700137000",
        "省份": "福建",
        "城市": "泉州",
        "下单时间": "2026-06-01"
    });
    let settled = json!({
        "订单状态": "已结算",
        "激活状态": "已激活",
        "172订单号": "172-A002",
        "套餐": "福建移动专享卡【29元235G】",
        "金额": "100",
        "姓名": "王五",
        "按号码发货": "13700137000",
        "省份": "福建",
        "城市": "泉州",
        "下单时间": "2026-06-01",
        "激活时间": "2026-06-10"
    });

    db::imports::import_from_172(&conn, vec![pending.clone()]).unwrap();
    db::imports::import_from_172(&conn, vec![settled]).unwrap();
    db::imports::import_from_172(&conn, vec![pending]).unwrap();

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].status, "使用中");
    assert_eq!(cards[0].activate_time.as_deref(), Some("2026-06-10"));
    assert_eq!(cards[0].profit, 94.0);
}

#[test]
fn imported_haoyi_duplicate_order_updates_pending_record() {
    let conn = conn();
    let pending = json!({
        "上游订单状态": "已发货",
        "订单号": "HY-A001",
        "商品名称": "号易联通卡29元100G",
        "运营商": "联通",
        "订单金额": "0",
        "首充金额": "",
        "用户姓名": "李四",
        "生产号码": "'13900139000",
        "省": "福建",
        "市": "厦门",
        "区": "思明区",
        "街道": "测试路2号"
    });
    let activated = json!({
        "上游订单状态": "已激活",
        "订单号": "HY-A001",
        "商品名称": "号易联通卡29元100G",
        "运营商": "联通",
        "订单金额": "50",
        "首充金额": "30",
        "用户姓名": "李四",
        "生产号码": "'13900139000",
        "省": "福建",
        "市": "厦门",
        "区": "思明区",
        "街道": "测试路2号",
        "快递名称": "京东",
        "物流单号": "JD123"
    });

    assert_eq!(db::imports::import_from_haoyi(&conn, vec![pending]).unwrap().imported, 1);
    assert_eq!(db::imports::import_from_haoyi(&conn, vec![activated]).unwrap().updated, 1);
    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards[0].external_order_id.as_deref(), Some("HY-A001"));
    assert_eq!(cards[0].status, "使用中");
    assert_eq!(cards[0].profit, 47.0);
    assert_eq!(cards[0].express_company.as_deref(), Some("京东"));
    assert_eq!(cards[0].express_number.as_deref(), Some("JD123"));
}

#[test]
fn plan_backfill_does_not_calculate_missing_promo_end() {
    let conn = conn();
    let created = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("只补周期测试移动卡【29元235G】".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            monthly_price: Some(29.0),
            data_amount: Some("235G".into()),
            activate_time: Some("2026-06-10".into()),
            promo_start: Some(String::new()),
            promo_end: Some(String::new()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let result = db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P005",
            "name": "只补周期测试移动卡【29元235G】",
            "carrier": "移动",
            "monthlyPrice": 29,
            "dataAmount": 235,
            "promoPeriod": 6,
            "contractPeriod": 24,
            "firstCharge": 50,
            "status": "在售"
        })],
    )
    .unwrap();

    let updated = db::cards::get_card_by_id(&conn, created.id).unwrap().unwrap();
    assert_eq!(result.backfilled, 1);
    assert_eq!(updated.contract_period, Some(24));
    assert_eq!(updated.promo_start.as_deref(), Some("2026-06-10"));
    assert_eq!(updated.promo_end.as_deref(), Some(""));
}

#[test]
fn order_import_does_not_calculate_promo_end_from_matched_plan() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P006",
            "name": "不算到期测试移动卡【29元235G】",
            "carrier": "移动",
            "monthlyPrice": 29,
            "dataAmount": 235,
            "promoPeriod": 6,
            "contractPeriod": 24,
            "firstCharge": 50,
            "status": "在售"
        })],
    )
    .unwrap();

    db::imports::import_from_172(
        &conn,
        vec![json!({
            "订单状态": "已结算",
            "激活状态": "已激活",
            "172订单号": "172-NO-END",
            "套餐": "不算到期测试移动卡【29元235G】",
            "金额": "100",
            "姓名": "赵六",
            "按号码发货": "13600136000",
            "省份": "福建",
            "城市": "漳州",
            "下单时间": "2026-06-01",
            "激活时间": "2026-06-10"
        })],
    )
    .unwrap();

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].contract_period, Some(24));
    assert_eq!(cards[0].promo_start.as_deref(), Some("2026-06-10"));
    assert_eq!(cards[0].promo_end.as_deref(), Some(""));
}
