mod common;
pub use common::{db, error, models};
use common::conn;

#[test]
fn partial_card_update_preserves_existing_fields() {
    let conn = conn();
    let created = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("福建移动专享卡【29元235G】".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            monthly_price: Some(29.0),
            data_amount: Some("235G".into()),
            region: Some("福建·漳州".into()),
            contract_period: Some(24),
            renewal_reminder_days: Some(15),
            apply_time: Some("2026-06-01".into()),
            activate_time: Some("2026-06-02".into()),
            promo_start: Some("2026-06-02".into()),
            promo_end: Some("2026-12-31".into()),
            phone_number: Some("13800138000".into()),
            customer_id: None,
            profit: Some(88.0),
            status: Some("待确认".into()),
            notes: Some("保留备注".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let updated = db::cards::update_card(
        &conn,
        created.id,
        models::CardInput {
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(updated.status, "使用中");
    assert_eq!(updated.card_name, "福建移动专享卡【29元235G】");
    assert_eq!(updated.phone_number.unwrap(), "13800138000");
    assert_eq!(updated.region.unwrap(), "福建·漳州");
    assert_eq!(updated.profit, 88.0);
    assert_eq!(updated.notes.unwrap(), "保留备注");
}

#[test]
fn update_card_treats_some_zero_as_a_real_value() {
    // Some(0.0) 是"把利润改成 0"，不能被当成"未填写"而保留原值。
    // 若日后有人把 merge 逻辑改成按 falsy 判断，这条会立刻红。
    let conn = conn();
    let created = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("清零利润测试卡".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            profit: Some(88.0),
            renewal_reminder_days: Some(15),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let updated = db::cards::update_card(
        &conn,
        created.id,
        models::CardInput {
            profit: Some(0.0),
            renewal_reminder_days: Some(0),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(updated.profit, 0.0);
    assert_eq!(updated.renewal_reminder_days, Some(0));
    // 未传的字段仍然保留
    assert_eq!(updated.card_name, "清零利润测试卡");
    assert_eq!(updated.status, "使用中");
}

#[test]
fn update_card_with_empty_string_overwrites_rather_than_preserving() {
    // merge 用的是 Option::or：Some("") 表示"显式改成空"，只有 None 才是"不动"。
    // 这里是锁定当前语义，前端若要局部更新必须传 None 而非空串。
    let conn = conn();
    let created = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("原名".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            notes: Some("原备注".into()),
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let updated = db::cards::update_card(
        &conn,
        created.id,
        models::CardInput {
            card_name: Some(String::new()),
            notes: Some(String::new()),
            ..Default::default()
        },
    )
    .unwrap();

    assert_eq!(updated.card_name, "");
    assert_eq!(updated.notes.as_deref(), Some(""));
    // 同样传空串 vs 完全不传，结果必须不同
    let untouched = db::cards::update_card(
        &conn,
        created.id,
        models::CardInput {
            carrier: Some("联通".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(untouched.carrier, "联通");
    assert_eq!(untouched.plan_type, "性价比");
}

#[test]
fn update_card_rejects_missing_id_without_panicking() {
    let conn = conn();
    let error = db::cards::update_card(
        &conn,
        9999,
        models::CardInput {
            status: Some("使用中".into()),
            ..Default::default()
        },
    )
    .unwrap_err()
    .to_string();
    assert!(error.contains("卡片不存在"), "got: {error}");
}

#[test]
fn customer_merge_moves_cards_and_deletes_duplicates() {
    let conn = conn();
    let keep = db::customers::create_customer(
        &conn,
        models::CustomerInput {
            name: Some("张三".into()),
            phone: Some("13800138000".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let duplicate = db::customers::create_customer(
        &conn,
        models::CustomerInput {
            name: Some("张三".into()),
            phone: Some("13800138000".into()),
            ..Default::default()
        },
    )
    .unwrap();

    let card = db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("测试卡29元100G".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            customer_id: Some(duplicate.id),
            ..Default::default()
        },
    )
    .unwrap();

    let result = db::customers::merge_customers(&conn, keep.id, vec![duplicate.id]).unwrap();
    let moved = db::cards::get_card_by_id(&conn, card.id).unwrap().unwrap();
    let deleted = db::customers::get_customer_by_id(&conn, duplicate.id).unwrap();

    assert_eq!(result.merged, 1);
    assert_eq!(moved.customer_id, Some(keep.id));
    assert!(deleted.is_none());
}

#[test]
fn cards_search_covers_package_customer_phone_region_and_notes() {
    let conn = conn();
    let customer = db::customers::create_customer(
        &conn,
        models::CustomerInput {
            name: Some("漳州客户".into()),
            phone: Some("13800138000".into()),
            ..Default::default()
        },
    )
    .unwrap();
    db::cards::create_card(
        &conn,
        models::CardInput {
            card_name: Some("福建移动专享卡【29元235G】".into()),
            carrier: Some("移动".into()),
            plan_type: Some("性价比".into()),
            region: Some("福建·漳州".into()),
            notes: Some("搜索备注".into()),
            customer_id: Some(customer.id),
            ..Default::default()
        },
    )
    .unwrap();

    for search in ["福建移动", "漳州客户", "13800138000", "福建·漳州", "搜索备注"] {
        let result = db::cards::get_cards(
            &conn,
            Some(models::CardFilters {
                search: Some(search.into()),
                status: None,
                carrier: None,
                plan_type: None,
                page: Some(1),
                page_size: Some(50),
            }),
        )
        .unwrap();
        assert_eq!(result.total, 1, "search {search} should match");
    }
}
