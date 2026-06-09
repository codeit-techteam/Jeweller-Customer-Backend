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

const COLLECTION_TABLE = 'collections';
const COLLECTION_PRODUCTS_TABLE = 'collection_products';

function buildCollectionPayload(input) {
  const title = normalizeRequiredText(input.title ?? input.name, 'Collection title');
  return {
    title,
    subtitle: normalizeNullableText(input.subtitle),
    description: normalizeNullableText(input.description),
    image: normalizeNullableText(input.image),
    banner_image: normalizeNullableText(input.banner_image ?? input.bannerImage),
    slug: normalizeNullableText(input.slug) ?? toSlug(title),
    sort_order: normalizeIntegerOrZero(input.sort_order ?? input.sortOrder),
    is_active: normalizeBoolean(input.is_active ?? input.isActive, true),
    is_trending: normalizeBoolean(input.is_trending ?? input.isTrending, false),
    is_featured: normalizeBoolean(input.is_featured ?? input.isFeatured, false),
  };
}

function shapeRow(row, products = []) {
  return {
    id: row.id,
    title: row.title ?? row.name ?? null,
    name: row.title ?? row.name ?? null,
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    image: row.image ?? null,
    banner_image: row.banner_image ?? null,
    slug: row.slug ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    is_trending: Boolean(row.is_trending),
    is_featured: Boolean(row.is_featured),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

export async function getCollections({
  includeInactive = false,
  trendingOnly = false,
  featuredOnly = false,
} = {}) {
  let query = supabase
    .from(COLLECTION_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);
  if (trendingOnly) query = query.eq('is_trending', true);
  if (featuredOnly) query = query.eq('is_featured', true);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch collections: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return [];

  const productMap = await fetchLinkedProductsByParent({
    table: COLLECTION_PRODUCTS_TABLE,
    parentColumn: 'collection_id',
    parentIds: rows.map((row) => row.id),
  });
  return rows.map((row) => shapeRow(row, productMap.get(row.id) ?? []));
}

export async function getCollectionById(id) {
  const { data, error } = await supabase
    .from(COLLECTION_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch collection: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: COLLECTION_PRODUCTS_TABLE,
    parentColumn: 'collection_id',
    parentId: id,
  });
  return shapeRow(data, products);
}

export async function getCollectionBySlug(slug) {
  const value = normalizeNullableText(slug);
  if (!value) return null;
  const { data, error } = await supabase
    .from(COLLECTION_TABLE)
    .select('*')
    .eq('slug', value)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch collection: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: COLLECTION_PRODUCTS_TABLE,
    parentColumn: 'collection_id',
    parentId: data.id,
  });
  return shapeRow(data, products);
}

export async function createCollection(input = {}) {
  const payload = buildCollectionPayload(input);
  const { data, error } = await supabase
    .from(COLLECTION_TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create collection: ${error.message}`);
  await syncProductLinks({
    table: COLLECTION_PRODUCTS_TABLE,
    parentColumn: 'collection_id',
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  return getCollectionById(data.id);
}

export async function updateCollectionById(id, input = {}) {
  const payload = buildCollectionPayload(input);
  const { data, error } = await supabase
    .from(COLLECTION_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update collection: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: COLLECTION_PRODUCTS_TABLE,
      parentColumn: 'collection_id',
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  return getCollectionById(id);
}

export async function deleteCollectionById(id) {
  const { data, error } = await supabase
    .from(COLLECTION_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete collection: ${error.message}`);
  return data;
}

export async function reorderCollections(items = []) {
  await applyBulkOrder({ table: COLLECTION_TABLE, items });
}
