/**
 * 本地时区日期工具。
 *
 * 背景：`Date#toISOString()` 返回的是 **UTC** 时间，在 UTC+8 时区下，
 * 每天 00:00–08:00 之间调用会得到「前一天」的字符串，导致新建卡片的
 * 办卡日期、备份文件名少一天。因此本模块统一提供基于**本地时区**的
 * 日期格式化，禁止在此类场景继续使用 `toISOString()`。
 *
 * 若某处确实需要与后端约定的 UTC 语义（如跨时区对账），请勿复用本模块，
 * 并在该处显式注释说明为何必须使用 UTC。
 */

/**
 * 将 Date 按**本地时区**格式化为 `YYYY-MM-DD`。
 * 使用 getFullYear/getMonth/getDate 逐字段拼接，避免任何 UTC 转换。
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 返回本地时区的当天日期，格式 `YYYY-MM-DD`。 */
export function todayLocal(): string {
  return formatLocalDate(new Date())
}
