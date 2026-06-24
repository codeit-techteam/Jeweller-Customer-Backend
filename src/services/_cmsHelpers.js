/**
 * Shared helpers used by every CMS / dynamic-content service.
 *
 * - text/boolean/number normalisation that survives the loose `req.body`
 *   inputs the Admin Panel sends.
 * - slug generation.
 * - a generic junction-table reconciler used to attach products to
 *   Occasions, Collections, Categories, Menu Categories, Featured Sections,
 *   Offers and Gift Collections.
 */
import { supabase } from '../config/supabase.js';

export function normalizeNullableText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeRequiredText(value, label) {
  const out = normalizeNullableText(value);
  if (!out) throw new Error(`${label} is required`);
  return out;
}

export function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

export function normalizeIntegerOrZero(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function normalizeIsoTimestampOrNull(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toSlug(value) {
  if (!value) return null;
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const trimmed = normalizeNullableText(item);
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/**
 * Sync the join table for a parent record (e.g. occasion_products for an occasion).
 *
 * Strategy: replace the full set in a single transaction-like flow:
 * - delete existing rows for the parent
 * - insert the new ordered rows
 *
 * @param {object} args
 * @param {string} args.table        join table name (e.g. "occasion_products")
 * @param {string} args.parentColumn FK column on the join table (e.g. "occasion_id")
 * @param {string} args.parentId     id value
 * @param {string[]} args.productIds list of product ids (ordering = array order)
 */
export async function syncProductLinks({ table, parentColumn, parentId, productIds }) {
  if (!parentId) return;
  const cleaned = Array.from(
    new Set(
      (productIds ?? [])
        .map((id) => normalizeNullableText(id))
        .filter((id) => id != null),
    ),
  );

  const { error: deleteError } = await supabase.from(table).delete().eq(parentColumn, parentId);
  if (deleteError) {
    throw new Error(`Failed to clear ${table}: ${deleteError.message}`);
  }

  if (!cleaned.length) return;

  const rows = cleaned.map((productId, index) => ({
    [parentColumn]: parentId,
    product_id: productId,
    sort_order: index,
  }));

  const { error: insertError } = await supabase.from(table).insert(rows);
  if (insertError) {
    throw new Error(`Failed to attach products in ${table}: ${insertError.message}`);
  }
}

/**
 * Resolve the canonical display price from price_breakup, falling back to
 * products.price. Ensures cards always show the correct total even when
 * products.price is stale.
 *
 * Priority: price_breakup.total → sum(gold+gemstone+makingCharge+gst) → price
 */
function resolveLinkedProductPrice(rawPrice, priceBreakup) {
  const base = Number(rawPrice ?? 0) || 0;
  const pb = priceBreakup;
  if (!pb || typeof pb !== 'object') return base;
  const total = Number(pb.total);
  if (Number.isFinite(total) && total > 0) return total;
  const sum =
    (Number(pb.gold) || 0) +
    (Number(pb.gemstone) || 0) +
    (Number(pb.makingCharge ?? pb.making) || 0) +
    (Number(pb.gst) || 0);
  return sum > 0 ? sum : base;
}

/**
 * Fetch the products linked to a parent in deterministic display order.
 * Returns lightweight product info suitable for app cards.
 */
export async function fetchLinkedProducts({ table, parentColumn, parentId }) {
  if (!parentId) return [];
  const { data, error } = await supabase
    .from(table)
    .select(
      'product_id, sort_order, product:products(id, name, price, price_breakup, primary_image, thumbnail, featured_image, image, status, is_trending, discount_percentage)',
    )
    .eq(parentColumn, parentId)
    .order('sort_order', { ascending: true });
  if (error) {
    throw new Error(`Failed to fetch linked products from ${table}: ${error.message}`);
  }
  return (data ?? [])
    .map((row) => {
      const product = row.product ?? null;
      if (!product) return null;
      return {
        id: product.id,
        name: product.name,
        price: resolveLinkedProductPrice(product.price, product.price_breakup),
        image:
          product.primary_image ??
          product.thumbnail ??
          product.featured_image ??
          product.image ??
          null,
        status: product.status ?? 'active',
        is_trending: Boolean(product.is_trending),
        discount_percentage: product.discount_percentage ?? null,
        sort_order: row.sort_order ?? 0,
      };
    })
    .filter(Boolean);
}

/**
 * Batch-load the linked product ids (and optional product details) for many
 * parents at once so list endpoints can return the picker-ready state without
 * an N+1.
 */
export async function fetchLinkedProductsByParent({
  table,
  parentColumn,
  parentIds,
}) {
  if (!Array.isArray(parentIds) || !parentIds.length) {
    return new Map();
  }
  const { data, error } = await supabase
    .from(table)
    .select(
      `${parentColumn}, product_id, sort_order, product:products(id, name, price, primary_image, thumbnail, featured_image, image, status, is_trending, discount_percentage)`,
    )
    .in(parentColumn, parentIds)
    .order('sort_order', { ascending: true });
  if (error) {
    throw new Error(`Failed to batch-fetch ${table}: ${error.message}`);
  }
  const map = new Map();
  for (const row of data ?? []) {
    const parentId = row[parentColumn];
    if (!map.has(parentId)) map.set(parentId, []);
    const product = row.product ?? null;
    if (!product) continue;
    map.get(parentId).push({
      id: product.id,
      name: product.name,
      price: product.price,
      image:
        product.primary_image ??
        product.thumbnail ??
        product.featured_image ??
        product.image ??
        null,
      status: product.status ?? 'active',
      is_trending: Boolean(product.is_trending),
      discount_percentage: product.discount_percentage ?? null,
      sort_order: row.sort_order ?? 0,
    });
  }
  return map;
}

/** Apply sort_order to a list of rows so admins can drag/drop. */
export async function applyBulkOrder({ table, items }) {
  if (!Array.isArray(items) || !items.length) return;
  await Promise.all(
    items.map((item, index) => {
      if (!item?.id) return null;
      return supabase
        .from(table)
        .update({ sort_order: index })
        .eq('id', item.id);
    }),
  );
}
