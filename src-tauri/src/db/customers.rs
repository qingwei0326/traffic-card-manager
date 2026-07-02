use crate::db::cards;
use crate::error::{AppError, AppResult};
use crate::models::{
    Card, Customer, CustomerFilters, CustomerInput, MergeResult, PaginatedResult,
};
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, Row};
use std::collections::{HashMap, HashSet};

pub fn get_customers(
    conn: &Connection,
    filters: Option<CustomerFilters>,
) -> AppResult<PaginatedResult<Customer>> {
    let filters = filters.unwrap_or(CustomerFilters {
        search: None,
        tag: None,
        page: None,
        page_size: None,
    });
    let (where_sql, where_params) = build_customer_where(&filters);
    let page = filters.page.unwrap_or(1).max(1);
    let page_size = filters.page_size.unwrap_or(50).max(1);
    let offset = (page - 1) * page_size;

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM customers c {where_sql}"),
        params_from_iter(where_params.iter()),
        |row| row.get(0),
    )?;

    let mut data_params = where_params;
    data_params.push(Value::Integer(page_size));
    data_params.push(Value::Integer(offset));
    let mut stmt = conn.prepare(&format!(
        r#"
        SELECT c.*,
          (SELECT COUNT(*) FROM cards WHERE customer_id = c.id) as card_count,
          (SELECT COALESCE(SUM(profit), 0) FROM cards WHERE customer_id = c.id) as total_profit
        FROM customers c
        {where_sql}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
        "#
    ))?;
    let data = stmt
        .query_map(params_from_iter(data_params.iter()), map_customer)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(PaginatedResult {
        data,
        total,
        page,
        page_size,
    })
}

pub fn get_customer_by_id(conn: &Connection, id: i64) -> AppResult<Option<Customer>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT c.*,
          (SELECT COUNT(*) FROM cards WHERE customer_id = c.id) as card_count,
          (SELECT COALESCE(SUM(profit), 0) FROM cards WHERE customer_id = c.id) as total_profit
        FROM customers c
        WHERE c.id = ?
        "#,
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_customer(row)?))
    } else {
        Ok(None)
    }
}

pub fn create_customer(conn: &Connection, input: CustomerInput) -> AppResult<Customer> {
    conn.execute(
        r#"
        INSERT INTO customers (name, phone, wechat, address, notes, tags)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
        params![
            input.name.unwrap_or_default(),
            input.phone.unwrap_or_default(),
            input.wechat.unwrap_or_default(),
            input.address.unwrap_or_default(),
            input.notes.unwrap_or_default(),
            input.tags.unwrap_or_default()
        ],
    )?;
    let id = conn.last_insert_rowid();
    get_customer_by_id(conn, id)?
        .ok_or_else(|| AppError::Message("客户创建失败".into()))
}

pub fn update_customer(conn: &Connection, id: i64, input: CustomerInput) -> AppResult<Customer> {
    let existing = get_customer_by_id(conn, id)?
        .ok_or_else(|| AppError::Message("客户不存在".into()))?;
    conn.execute(
        r#"
        UPDATE customers SET
          name = ?, phone = ?, wechat = ?, address = ?, notes = ?, tags = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
        params![
            input.name.unwrap_or(existing.name),
            input.phone.or(existing.phone).unwrap_or_default(),
            input.wechat.or(existing.wechat).unwrap_or_default(),
            input.address.or(existing.address).unwrap_or_default(),
            input.notes.or(existing.notes).unwrap_or_default(),
            input.tags.or(existing.tags).unwrap_or_default(),
            id
        ],
    )?;
    get_customer_by_id(conn, id)?.ok_or_else(|| AppError::Message("客户不存在".into()))
}

pub fn delete_customer(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM customers WHERE id = ?", params![id])?;
    Ok(())
}

pub fn get_customer_cards(conn: &Connection, customer_id: i64) -> AppResult<Vec<Card>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
        FROM cards c
        LEFT JOIN customers cu ON c.customer_id = cu.id
        WHERE c.customer_id = ?
        ORDER BY c.created_at DESC
        "#,
    )?;
    let cards = stmt
        .query_map(params![customer_id], cards::map_card)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(cards)
}

pub fn find_duplicate_customers(conn: &Connection) -> AppResult<Vec<Vec<Customer>>> {
    let mut groups: Vec<Vec<i64>> = Vec::new();
    collect_duplicate_groups(
        conn,
        "SELECT GROUP_CONCAT(id) FROM customers GROUP BY name HAVING COUNT(*) > 1",
        &mut groups,
    )?;
    collect_duplicate_groups(
        conn,
        "SELECT GROUP_CONCAT(id) FROM customers WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1",
        &mut groups,
    )?;

    let merged = merge_id_groups(groups);
    let mut result = Vec::new();
    for ids in merged {
        let mut customers = Vec::new();
        for id in ids {
            if let Some(customer) = get_customer_by_id(conn, id)? {
                customers.push(customer);
            }
        }
        if customers.len() > 1 {
            customers.sort_by_key(|customer| customer.id);
            result.push(customers);
        }
    }
    Ok(result)
}

pub fn merge_customers(
    conn: &Connection,
    keep_id: i64,
    merge_ids: Vec<i64>,
) -> AppResult<MergeResult> {
    if merge_ids.is_empty() {
        return Ok(MergeResult { merged: 0 });
    }

    conn.execute_batch("BEGIN TRANSACTION")?;
    let result = (|| {
        let keep = get_customer_by_id(conn, keep_id)?
            .ok_or_else(|| AppError::Message("保留的客户不存在".into()))?;
        let mut tags = split_csv(keep.tags.as_deref());
        let mut notes = keep.notes.into_iter().filter(|note| !note.is_empty()).collect::<Vec<_>>();

        for merge_id in &merge_ids {
            if let Some(customer) = get_customer_by_id(conn, *merge_id)? {
                tags.extend(split_csv(customer.tags.as_deref()));
                if let Some(note) = customer.notes.filter(|note| !note.is_empty()) {
                    notes.push(note);
                }
            }
        }

        let tag_text = tags.into_iter().collect::<Vec<_>>().join(",");
        let note_text = notes.join("\n---\n");
        conn.execute(
            "UPDATE customers SET tags = ?, notes = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            params![tag_text, note_text, keep_id],
        )?;

        for merge_id in &merge_ids {
            conn.execute(
                "UPDATE cards SET customer_id = ? WHERE customer_id = ?",
                params![keep_id, merge_id],
            )?;
        }
        for merge_id in &merge_ids {
            conn.execute("DELETE FROM customers WHERE id = ?", params![merge_id])?;
        }

        Ok::<_, AppError>(MergeResult {
            merged: merge_ids.len(),
        })
    })();

    match result {
        Ok(value) => {
            conn.execute_batch("COMMIT")?;
            Ok(value)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

fn map_customer(row: &Row<'_>) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: row.get("id")?,
        name: row.get("name")?,
        phone: row.get("phone")?,
        wechat: row.get("wechat")?,
        address: row.get("address")?,
        notes: row.get("notes")?,
        tags: row.get("tags")?,
        card_count: row.get("card_count").unwrap_or(None),
        total_profit: row.get("total_profit").unwrap_or(None),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn build_customer_where(filters: &CustomerFilters) -> (String, Vec<Value>) {
    let mut clauses = Vec::new();
    let mut params = Vec::new();

    if let Some(search) = filters.search.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        clauses.push("(c.name LIKE ? OR c.phone LIKE ? OR c.wechat LIKE ?)".to_string());
        for _ in 0..3 {
            params.push(Value::Text(format!("%{search}%")));
        }
    }

    if let Some(tag) = filters.tag.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        clauses.push("c.tags LIKE ?".into());
        params.push(Value::Text(format!("%{tag}%")));
    }

    if clauses.is_empty() {
        ("".into(), params)
    } else {
        (format!("WHERE {}", clauses.join(" AND ")), params)
    }
}

fn collect_duplicate_groups(
    conn: &Connection,
    sql: &str,
    groups: &mut Vec<Vec<i64>>,
) -> AppResult<()> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in rows {
        let mut ids = row?
            .split(',')
            .filter_map(|id| id.parse::<i64>().ok())
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids.dedup();
        if ids.len() > 1 {
            groups.push(ids);
        }
    }
    Ok(())
}

fn merge_id_groups(groups: Vec<Vec<i64>>) -> Vec<Vec<i64>> {
    let mut parent = HashMap::<i64, i64>::new();
    for group in groups {
        if let Some(first) = group.first().copied() {
            for id in group {
                parent.entry(id).or_insert(id);
                union(&mut parent, first, id);
            }
        }
    }

    let ids = parent.keys().copied().collect::<Vec<_>>();
    let mut by_root = HashMap::<i64, Vec<i64>>::new();
    for id in ids {
        let root = find(&mut parent, id);
        by_root.entry(root).or_default().push(id);
    }

    by_root
        .into_values()
        .map(|mut ids| {
            ids.sort_unstable();
            ids
        })
        .collect()
}

fn find(parent: &mut HashMap<i64, i64>, id: i64) -> i64 {
    let current = *parent.get(&id).unwrap_or(&id);
    if current == id {
        id
    } else {
        let root = find(parent, current);
        parent.insert(id, root);
        root
    }
}

fn union(parent: &mut HashMap<i64, i64>, left: i64, right: i64) {
    let left_root = find(parent, left);
    let right_root = find(parent, right);
    if left_root != right_root {
        parent.insert(right_root, left_root);
    }
}

fn split_csv(value: Option<&str>) -> HashSet<String> {
    value
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}
