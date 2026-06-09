import { supabase } from '../config/supabase.js';
import {
  applyBulkOrder,
  fetchLinkedProducts,
  fetchLinkedProductsByParent,
  normalizeBoolean,
  normalizeIntegerOrZero,
  normalizeNullableText,
  normalizeRequiredText,
  syncProductLinks,
  toSlug,
} from './_cmsHelpers.js';

const TABLE = 'menu_categories';
const JOIN = 'menu_category_products';

function buildPayload(input) {
  const title = normalizeRequiredText(input.title ?? input.name, 'Menu title');
  return {
    title,
    slug: normalizeNullableText(input.slug) ?? toSlug(title),
    icon: normalizeNullableText(input.icon),
    image: normalizeNullableText(input.image),
    badge: normalizeNullableText(input.badge),
    collection_slug:
      normalizeNullableText(input.collection_slug ?? input.collectionSlug) ??
      toSlug(title),
    description: normalizeNullableText(input.description),
    sort_order: normalizeIntegerOrZero(input.sort_order ?? input.sortOrder),
    is_active: normalizeBoolean(input.is_active ?? input.isActive, true),
  };
}

function shapeRow(row, products = []) {
  return {
    id: row.id,
    title: row.title,
    name: row.title,
    slug: row.slug,
    icon: row.icon ?? null,
    image: row.image ?? null,
    badge: row.badge ?? null,
    collection_slug: row.collection_slug ?? row.slug,
    description: row.description ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

export async function getMenuCategories({ includeInactive = false } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch menu categories: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return [];

  const productMap = await fetchLinkedProductsByParent({
    table: JOIN,
    parentColumn: 'menu_category_id',
    parentIds: rows.map((row) => row.id),
  });
  return rows.map((row) => shapeRow(row, productMap.get(row.id) ?? []));
}

export async function getMenuCategoryById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch menu category: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: JOIN,
    parentColumn: 'menu_category_id',
    parentId: id,
  });
  return shapeRow(data, products);
}

export async function createMenuCategory(input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create menu category: ${error.message}`);
  await syncProductLinks({
    table: JOIN,
    parentColumn: 'menu_category_id',
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  return getMenuCategoryById(data.id);
}

export async function updateMenuCategoryById(id, input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update menu category: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: JOIN,
      parentColumn: 'menu_category_id',
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  return getMenuCategoryById(id);
}

export async function deleteMenuCategoryById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete menu category: ${error.message}`);
  return data;
}

export async function reorderMenuCategories(items = []) {
  await applyBulkOrder({ table: TABLE, items });
}
