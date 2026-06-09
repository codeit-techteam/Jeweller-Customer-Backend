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

const OCCASION_TABLE = 'occasions';
const OCCASION_PRODUCTS_TABLE = 'occasion_products';

function buildOccasionPayload(input, { requireTitle = true } = {}) {
  const title = requireTitle
    ? normalizeRequiredText(input.title ?? input.name, 'Occasion title')
    : normalizeNullableText(input.title ?? input.name);

  const payload = {
    title,
    subtitle: normalizeNullableText(input.subtitle),
    description: normalizeNullableText(input.description),
    image: normalizeNullableText(input.image),
    collection_slug: normalizeNullableText(input.collection_slug ?? input.collectionSlug),
    slug:
      normalizeNullableText(input.slug) ??
      (title ? toSlug(title) : null),
    sort_order: normalizeIntegerOrZero(input.sort_order ?? input.sortOrder),
    is_active: normalizeBoolean(input.is_active ?? input.isActive, true),
  };

  return payload;
}

function shapeOccasionRow(row, products = []) {
  return {
    id: row.id,
    title: row.title ?? row.name ?? null,
    name: row.title ?? row.name ?? null,
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    image: row.image ?? null,
    slug: row.slug ?? null,
    collection_slug: row.collection_slug ?? row.slug ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

export async function getOccasions({ includeInactive = false } = {}) {
  let query = supabase
    .from(OCCASION_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch occasions: ${error.message}`);
  }
  const rows = data ?? [];
  if (!rows.length) return [];

  const productMap = await fetchLinkedProductsByParent({
    table: OCCASION_PRODUCTS_TABLE,
    parentColumn: 'occasion_id',
    parentIds: rows.map((row) => row.id),
  });
  return rows.map((row) => shapeOccasionRow(row, productMap.get(row.id) ?? []));
}

export async function getOccasionById(id) {
  const { data, error } = await supabase
    .from(OCCASION_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch occasion: ${error.message}`);
  }
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: OCCASION_PRODUCTS_TABLE,
    parentColumn: 'occasion_id',
    parentId: id,
  });
  return shapeOccasionRow(data, products);
}

export async function createOccasion(input = {}) {
  const payload = buildOccasionPayload(input);
  const { data, error } = await supabase
    .from(OCCASION_TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to create occasion: ${error.message}`);
  }
  await syncProductLinks({
    table: OCCASION_PRODUCTS_TABLE,
    parentColumn: 'occasion_id',
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  return getOccasionById(data.id);
}

export async function updateOccasionById(id, input = {}) {
  const payload = buildOccasionPayload(input);
  const { data, error } = await supabase
    .from(OCCASION_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to update occasion: ${error.message}`);
  }
  if (!data) return null;

  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: OCCASION_PRODUCTS_TABLE,
      parentColumn: 'occasion_id',
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  return getOccasionById(id);
}

export async function deleteOccasionById(id) {
  const { data, error } = await supabase
    .from(OCCASION_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to delete occasion: ${error.message}`);
  }
  return data;
}

export async function reorderOccasions(items = []) {
  await applyBulkOrder({ table: OCCASION_TABLE, items });
}
