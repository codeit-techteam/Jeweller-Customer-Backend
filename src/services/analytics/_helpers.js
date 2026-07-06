import { supabase } from "../../config/supabase.js";

export const PAGE_SIZE = 1000;

/**
 * Resolve analytics date window from query params.
 * Supports: today | 7d | 7days | 30d | 30days | custom (+ from/to ISO strings).
 */
export function getDateRange(query = {}) {
  const rawRange = String(query.range || query.preset || "30d").toLowerCase();
  const now = new Date();
  let from;
  let to = query.to ? new Date(query.to) : now;

  if (query.from && query.to) {
    from = new Date(query.from);
    to = new Date(query.to);
  } else if (rawRange === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (rawRange === "7d" || rawRange === "7days") {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  } else if (rawRange === "30d" || rawRange === "30days") {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  } else {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
    to = now;
  }

  if (to.getTime() < from.getTime()) {
    const swap = from;
    from = to;
    to = swap;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    preset: rawRange,
  };
}

/** @deprecated Use getDateRange — kept for existing imports */
export function parseDateRange(query = {}) {
  return getDateRange(query);
}

export function buildDateFilters(range, column = "created_at") {
  return [
    [column, "gte", range.from],
    [column, "lte", range.to],
  ];
}

export async function countRows(tableName, filters = []) {
  let query = supabase.from(tableName).select("id", { count: "exact", head: true });
  for (const [col, op, val] of filters) {
    if (op === "gte") query = query.gte(col, val);
    if (op === "lte") query = query.lte(col, val);
    if (op === "eq") query = query.eq(col, val);
    if (op === "is") query = query.is(col, val);
    if (op === "not") query = query.not(col, "is", val);
  }
  const { count, error } = await query;
  if (error) {
    console.warn("[analytics] count failed", tableName, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function sumColumn(tableName, column, filters = []) {
  const rows = await fetchRows(tableName, `${column}`, filters, { limit: PAGE_SIZE });
  return rows.reduce((acc, row) => acc + Number(row[column] ?? 0), 0);
}

export async function fetchRows(tableName, select = "*", filters = [], { orderBy, ascending = false, limit } = {}) {
  const out = [];
  let from = 0;
  const cap = limit ?? PAGE_SIZE * 20;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(tableName).select(select);
    for (const [col, op, val] of filters) {
      if (op === "gte") query = query.gte(col, val);
      if (op === "lte") query = query.lte(col, val);
      if (op === "eq") query = query.eq(col, val);
      if (op === "is") query = query.is(col, val);
      if (op === "not") query = query.not(col, "is", val);
    }
    if (orderBy) query = query.order(orderBy, { ascending });
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE || out.length >= cap) break;
    from += PAGE_SIZE;
  }

  return limit ? out.slice(0, limit) : out;
}

/** Calendar day key (YYYY-MM-DD) in the server local timezone. */
export function toCalendarDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function groupByDay(rows, dateField = "created_at") {
  const map = new Map();
  for (const row of rows) {
    const raw = row[dateField];
    if (!raw) continue;
    const day = toCalendarDayKey(raw);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function groupSumByDay(rows, dateField = "created_at", valueField = "amount") {
  const map = new Map();
  for (const row of rows) {
    const raw = row[dateField];
    if (!raw) continue;
    const day = toCalendarDayKey(raw);
    map.set(day, (map.get(day) ?? 0) + Number(row[valueField] ?? 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
}

export function topCounts(rows, keyFn, limit = 10) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const existing = map.get(key.id) ?? { id: key.id, label: key.label, count: 0, meta: key.meta };
    existing.count += 1;
    map.set(key.id, existing);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function fillDateSeries(series, fromIso, toIso) {
  const map = new Map(series.map((p) => [p.date, p.value]));
  const cursor = new Date(fromIso);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(toIso);
  endDay.setHours(0, 0, 0, 0);
  const out = [];
  while (cursor <= endDay) {
    const date = toCalendarDayKey(cursor);
    out.push({ date, value: map.get(date) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Enrich time-series points with day-over-day growth insights. */
export function enrichSeriesWithInsights(series = []) {
  return series.map((point, index) => {
    const previousValue = index > 0 ? Number(series[index - 1]?.value ?? 0) : 0;
    const value = Number(point.value ?? 0);
    const difference = value - previousValue;
    let growthPercent = 0;
    if (previousValue > 0) {
      growthPercent = Math.round((difference / previousValue) * 10000) / 100;
    } else if (value > 0) {
      growthPercent = 100;
    }
    const trend = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
    return {
      ...point,
      value,
      previousValue,
      difference,
      growthPercent,
      trend,
    };
  });
}

/** Attach percentage share to ranked rows. */
export function withPercentages(rows = [], countField = "count") {
  const total = rows.reduce((sum, row) => sum + Number(row[countField] ?? 0), 0);
  return rows.map((row) => {
    const count = Number(row[countField] ?? 0);
    const percentage = total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
    return { ...row, percentage, total };
  });
}

/** Group rows by product_id with view counts (aggregation pipeline style). */
export function aggregateProductViewCounts(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const productId = row.product_id;
    if (!productId) continue;
    map.set(productId, (map.get(productId) ?? 0) + 1);
  }
  return map;
}

/** Inclusive calendar-day bounds for a YYYY-MM-DD key (server local timezone). */
export function dayBoundsFromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Resolve a query window for drill-down endpoints.
 * Accepts either a single `date` (YYYY-MM-DD) for a one-day window, or a
 * `startDate`/`endDate` (aliases for `from`/`to`) range, falling back to the
 * standard `range` presets supported by getDateRange.
 */
export function resolveDrilldownWindow(query = {}) {
  if (query.date) {
    const dateKey = String(query.date).slice(0, 10);
    const bounds = dayBoundsFromDateKey(dateKey);
    return { ...bounds, preset: "day", date: dateKey };
  }

  const range = getDateRange({
    range: query.range,
    from: query.startDate ?? query.from,
    to: query.endDate ?? query.to,
  });
  return { from: range.from, to: range.to, preset: range.preset, date: null };
}

/** Resolve a product's display image from the common column aliases used across tables. */
export function resolveProductImage(product) {
  if (!product) return null;
  return (
    product.primary_image ??
    product.thumbnail ??
    product.featured_image ??
    product.image ??
    null
  );
}

export async function getDailyRollups(fromIso, toIso) {
  const { data, error } = await supabase
    .from("analytics_daily_rollups")
    .select("day, new_users, new_boutiques, new_products, appointments, revenue, orders")
    .gte("day", fromIso.slice(0, 10))
    .lte("day", toIso.slice(0, 10))
    .order("day", { ascending: true });

  if (error) {
    console.warn("[analytics] rollups view unavailable", error.message);
    return null;
  }
  return data ?? [];
}
