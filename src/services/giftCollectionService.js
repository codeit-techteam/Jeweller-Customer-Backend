import { supabase } from '../config/supabase.js';
import {
  applyBulkOrder,
  fetchLinkedProducts,
  normalizeBoolean,
  normalizeIntegerOrZero,
  normalizeNullableText,
  normalizeRequiredText,
  syncProductLinks,
  toSlug,
} from './_cmsHelpers.js';

const TABLE = 'gift_collections';
const JOIN = 'gift_collection_products';

function buildPayload(input) {
  const title = normalizeRequiredText(input.title ?? input.name, 'Gift collection title');
  return {
    title,
    slug: normalizeNullableText(input.slug) ?? toSlug(title),
    subtitle: normalizeNullableText(input.subtitle),
    description: normalizeNullableText(input.description),
    image: normalizeNullableText(input.image),
    banner_image: normalizeNullableText(input.banner_image ?? input.bannerImage),
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
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    image: row.image ?? null,
    banner_image: row.banner_image ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

export async function getGiftCollections({ includeInactive = false } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch gift collections: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (row) => {
      const products = await fetchLinkedProducts({
        table: JOIN,
        parentColumn: 'gift_collection_id',
        parentId: row.id,
      });
      return shapeRow(row, products);
    }),
  );
}

export async function getGiftCollectionById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch gift collection: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: JOIN,
    parentColumn: 'gift_collection_id',
    parentId: id,
  });
  return shapeRow(data, products);
}

export async function createGiftCollection(input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create gift collection: ${error.message}`);
  await syncProductLinks({
    table: JOIN,
    parentColumn: 'gift_collection_id',
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  return getGiftCollectionById(data.id);
}

export async function updateGiftCollectionById(id, input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update gift collection: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: JOIN,
      parentColumn: 'gift_collection_id',
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  return getGiftCollectionById(id);
}

export async function deleteGiftCollectionById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete gift collection: ${error.message}`);
  return data;
}

export async function reorderGiftCollections(items = []) {
  await applyBulkOrder({ table: TABLE, items });
}
