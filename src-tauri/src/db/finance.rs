use crate::error::AppResult;
use crate::models::{MonthlyProfitRow, ProfitByType, ProfitSummary};
use chrono::Datelike;
use rusqlite::{params, Connection};

pub fn get_profit_summary(conn: &Connection) -> AppResult<ProfitSummary> {
    let total_profit = scalar_f64(conn, "SELECT COALESCE(SUM(profit), 0) FROM cards")?;
    let avg_profit = scalar_f64(conn, "SELECT COALESCE(AVG(profit), 0) FROM cards WHERE profit > 0")?;
    let total_cards = scalar_i64(conn, "SELECT COUNT(*) FROM cards")?;
    let now = chrono::Local::now();
    let this_month = format!("{}-{:02}", now.year(), now.month());
    let month_profit = conn.query_row(
        "SELECT COALESCE(SUM(profit), 0) FROM cards WHERE strftime('%Y-%m', apply_time) = ?",
        params![this_month],
        |row| row.get(0),
    )?;
    let month_cards = conn.query_row(
        "SELECT COUNT(*) FROM cards WHERE strftime('%Y-%m', apply_time) = ?",
        params![format!("{}-{:02}", now.year(), now.month())],
        |row| row.get(0),
    )?;
    Ok(ProfitSummary {
        total_profit,
        avg_profit,
        total_cards,
        month_profit,
        month_cards,
    })
}

pub fn get_monthly_profit(conn: &Connection, year: i64) -> AppResult<Vec<MonthlyProfitRow>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT strftime('%m', apply_time) as month,
          COALESCE(SUM(profit), 0) as profit,
          COUNT(*) as count
        FROM cards
        WHERE strftime('%Y', apply_time) = ?
        GROUP BY strftime('%Y-%m', apply_time)
        ORDER BY month
        "#,
    )?;
    let rows = stmt
        .query_map(params![year.to_string()], |row| {
            Ok(MonthlyProfitRow {
                month: row.get("month")?,
                profit: row.get("profit")?,
                count: row.get("count")?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_profit_by_carrier(conn: &Connection) -> AppResult<Vec<ProfitByType>> {
    profit_by(conn, "carrier")
}

pub fn get_profit_by_plan_type(conn: &Connection) -> AppResult<Vec<ProfitByType>> {
    profit_by(conn, "plan_type")
}

fn profit_by(conn: &Connection, field: &str) -> AppResult<Vec<ProfitByType>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {field}, COALESCE(SUM(profit), 0) as profit, COUNT(*) as count FROM cards GROUP BY {field} ORDER BY profit DESC"
    ))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ProfitByType {
                carrier: if field == "carrier" { row.get(0)? } else { None },
                plan_type: if field == "plan_type" { row.get(0)? } else { None },
                profit: row.get("profit")?,
                count: row.get("count")?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn scalar_f64(conn: &Connection, sql: &str) -> AppResult<f64> {
    Ok(conn.query_row(sql, [], |row| row.get(0))?)
}

fn scalar_i64(conn: &Connection, sql: &str) -> AppResult<i64> {
    Ok(conn.query_row(sql, [], |row| row.get(0))?)
}
