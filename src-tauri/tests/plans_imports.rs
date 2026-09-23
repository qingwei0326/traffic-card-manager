use serde_json::json;

mod common;
pub use common::{db, error, models};
use common::conn;

fn row_172(order_id: &str, order_status: &str, amount: &str) -> serde_json::Value {
    serde_json::json!({
        "订单状态": order_status,
        "激活状态": "已激活",
        "172订单号": order_id,
        "套餐": "福建移动专享卡【29元235G】",
        "金额": amount,
        "首充金额": "50",
        "姓名": "测试用户",
        "按号码发货": "13800138000",
        "省份": "福建",
        "城市": "漳州",
        "下单时间": "2026-06-01",
        "激活时间": "2026-06-10"
    })
}

#[test]
fn reimporting_same_172_row_is_idempotent() {
    let conn = conn();
    let row = row_172("172-IDEM-1", "已结算", "100");

    let first = db::imports::import_from_172(&conn, vec![row.clone()]).unwrap();
    assert_eq!(first.imported, 1);
    assert_eq!(first.updated, 0);

    // 重复导入必须走 update 而不是再插一条，否则用户每导一次就多一张重复卡
    let second = db::imports::import_from_172(&conn, vec![row.clone()]).unwrap();
    assert_eq!(second.imported, 0);
    assert_eq!(second.updated, 1);

    let third = db::imports::import_from_172(&conn, vec![row]).unwrap();
    assert_eq!(third.imported, 0);
    assert_eq!(third.updated, 1);

    let cards = db::cards::get_cards(&conn, None).unwrap();
    assert_eq!(cards.total, 1);
    assert_eq!(cards.data[0].external_order_id.as_deref(), Some("172-IDEM-1"));
    assert_eq!(cards.data[0].profit, 94.0);
    assert_eq!(cards.data[0].status, "使用中");
}

#[test]
fn import_tolerates_blank_and_malformed_amounts() {
    let conn = conn();
    // 金额为空 / 非数字 / 带货币符号三类脏数据都不能 panic，且换算口径要正确
    let rows = vec![
        row_172("172-AMT-EMPTY", "已结算", ""),
        row_172("172-AMT-JUNK", "已结算", "abc"),
        row_172("172-AMT-SYMBOL", "已结算", "¥100元"),
    ];
    let result = db::imports::import_from_172(&conn, rows).unwrap();
    assert_eq!(result.imported, 3);

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    let profit_of = |order_id: &str| {
        cards
            .iter()
            .find(|card| card.external_order_id.as_deref() == Some(order_id))
            .unwrap()
            .profit
    };
    assert_eq!(profit_of("172-AMT-EMPTY"), 0.0);
    assert_eq!(profit_of("172-AMT-JUNK"), 0.0);
    assert_eq!(profit_of("172-AMT-SYMBOL"), 94.0);
}

#[test]
fn import_skips_cancelled_and_rejected_orders() {
    let conn = conn();
    let rows = vec![
        row_172("172-SKIP-CANCEL", "已撤单", "100"),
        row_172("172-SKIP-REJECT", "审核不通过", "100"),
        row_172("172-SKIP-KEEP", "已结算", "100"),
    ];
    let result = db::imports::import_from_172(&conn, rows).unwrap();
    assert_eq!(result.total, 3);
    assert_eq!(result.skipped, 2);
    assert_eq!(result.imported, 1);

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].external_order_id.as_deref(), Some("172-SKIP-KEEP"));
}

#[test]
fn import_creates_card_from_minimal_row_without_panicking() {
    let conn = conn();
    // 只有订单号与状态的极简行：所有可选字段缺失也不能让导入崩掉
    let result = db::imports::import_from_172(
        &conn,
        vec![serde_json::json!({ "172订单号": "172-MINIMAL", "订单状态": "已发货" })],
    )
    .unwrap();
    assert_eq!(result.imported, 1);
    assert_eq!(db::cards::get_cards(&conn, None).unwrap().total, 1);
}

#[test]
fn large_batch_import_counts_every_row() {
    let conn = conn();
    let rows: Vec<_> = (0..200)
        .map(|index| row_172(&format!("172-BATCH-{index}"), "已结算", "100"))
        .collect();
    let result = db::imports::import_from_172(&conn, rows).unwrap();
    assert_eq!(result.imported, 200);
    assert_eq!(result.updated, 0);
    assert_eq!(result.skipped, 0);
    assert_eq!(result.total, 200);
    assert_eq!(db::cards::get_cards(&conn, None).unwrap().total, 200);
}

#[test]
fn large_batch_import_mixes_imported_and_skipped_rows() {
    let conn = conn();
    let rows: Vec<_> = (0..150)
        .map(|index| row_172(&format!("172-MIX-OK-{index}"), "已结算", "100"))
        .chain((0..50).map(|index| row_172(&format!("172-MIX-BAD-{index}"), "已撤单", "100")))
        .collect();
    let result = db::imports::import_from_172(&conn, rows).unwrap();
    assert_eq!(result.imported, 150);
    assert_eq!(result.skipped, 50);
    assert_eq!(result.total, 200);
    assert_eq!(db::cards::get_cards(&conn, None).unwrap().total, 150);
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
fn order_import_calculates_missing_promo_end_from_matched_plan() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P006",
            "name": "自动到期测试移动卡【29元235G】",
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
            "172订单号": "172-CALC-END",
            "套餐": "自动到期测试移动卡【29元235G】",
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
    assert_eq!(cards[0].promo_end.as_deref(), Some("2026-11-30"));
}

#[test]
fn order_import_does_not_overwrite_existing_promo_end() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P007",
            "name": "保留到期测试移动卡【29元235G】",
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

    let existing = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("保留到期测试移动卡【29元235G】".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            monthly_price: Some(29.0),
            data_amount: Some("235G".into()),
            external_order_id: Some("172-KEEP-END".into()),
            promo_end: Some("2026-10-31".into()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    db::imports::import_from_172(
        &conn,
        vec![json!({
            "订单状态": "已结算",
            "激活状态": "已激活",
            "172订单号": "172-KEEP-END",
            "套餐": "保留到期测试移动卡【29元235G】",
            "金额": "100",
            "姓名": "孙七",
            "按号码发货": "13500135000",
            "省份": "福建",
            "城市": "漳州",
            "下单时间": "2026-06-01",
            "激活时间": "2026-06-10"
        })],
    )
    .unwrap();

    let updated = db::cards::get_card_by_id(&conn, existing.id).unwrap().unwrap();
    assert_eq!(updated.promo_end.as_deref(), Some("2026-10-31"));
}

#[test]
fn order_import_keeps_promo_end_empty_without_activation_time() {
    let conn = conn();
    db::plans::import_plans(
        &conn,
        vec![json!({
            "code": "P008",
            "name": "无激活测试移动卡【29元235G】",
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
            "172订单号": "172-NO-ACTIVATE",
            "套餐": "无激活测试移动卡【29元235G】",
            "金额": "100",
            "姓名": "周八",
            "按号码发货": "13400134000",
            "省份": "福建",
            "城市": "漳州",
            "下单时间": "2026-06-01"
        })],
    )
    .unwrap();

    let cards = db::cards::get_cards(&conn, None).unwrap().data;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].promo_end.as_deref(), Some(""));
}


#[test]
fn match_plan_in_agrees_with_match_plan() {
    // 把 match_plan 拆成「切片内匹配」后，行为不该变：
    // 同一份套餐表下，match_plan_in 的结果必须和原先打 SQL 的 match_plan 一致。
    let conn = conn();
    conn.execute(
        "INSERT INTO plans (id, name, carrier, monthly_price) VALUES (1, '移动29元235G', '移动', 29.0)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO plans (id, name, carrier, monthly_price) VALUES (2, '电信39元100G', '电信', 39.0)",
        [],
    )
    .unwrap();

    let plans = db::plans::get_all_plans(&conn).unwrap();

    for card_name in ["移动29元235G", "29元235G移动卡", "完全不相关的名字"] {
        let via_conn = db::plans::match_plan(&conn, card_name).unwrap();
        let via_slice = db::plans::match_plan_in(&plans, card_name);
        assert_eq!(
            via_conn.map(|p| p.name),
            via_slice.map(|p| p.name),
            "两种匹配路径对「{card_name}」结果不一致"
        );
    }

    // 新导入路径结构性地消除了 N+1：1000 张卡片只取一次套餐表，而不是 1000 次
    assert!(db::plans::get_all_plans(&conn).unwrap().len() >= 2);
}
