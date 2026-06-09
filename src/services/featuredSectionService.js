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

const TABLE = 'featured_sections';
const JOIN = 'featured_section_products';

function buildPayload(input) {
  const title = normalizeRequiredText(input.title ?? input.name, 'Section title');
  return {
    title,
    slug: normalizeNullableText(input.slug) ?? toSlug(title),
    subtitle: normalizeNullableText(input.subtitle),
    description: normalizeNullableText(input.description),
    banner_image: normalizeNullableText(input.banner_image ?? input.bannerImage),
    layout: normalizeNullableText(input.layout) ?? 'grid',
    sort_order: normalizeIntegerOrZero(input.sort_order ?? input.sortOrder),
    is_active: normalizeBoolean(input.is_active ?? input.isActive, true),
  };
}

function shapeRow(row, products = []) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    banner_image: row.banner_image ?? null,
    layout: row.layout ?? 'grid',
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

export async function getFeaturedSections({ includeInactive = false } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch featured sections: ${error.message}`);

  const rowsWithProducts = await Promise.all(
    (data ?? []).map(async (row) => {
      const products = await fetchLinkedProducts({
        table: JOIN,
        parentColumn: 'section_id',
        parentId: row.id,
      });
      return shapeRow(row, products);
    }),
  );
  return rowsWithProducts;
}

export async function getFeaturedSectionById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch featured section: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: JOIN,
    parentColumn: 'section_id',
    parentId: id,
  });
  return shapeRow(data, products);
}

export async function getFeaturedSectionBySlug(slug) {
  const normalized = normalizeNullableText(slug);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('slug', normalized)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch featured section: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: JOIN,
    parentColumn: 'section_id',
    parentId: data.id,
  });
  return shapeRow(data, products);
}

export async function createFeaturedSection(input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create featured section: ${error.message}`);
  await syncProductLinks({
    table: JOIN,
    parentColumn: 'section_id',
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  return getFeaturedSectionById(data.id);
}

export async function updateFeaturedSectionById(id, input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update featured section: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: JOIN,
      parentColumn: 'section_id',
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  return getFeaturedSectionById(id);
}

export async function deleteFeaturedSectionById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete featured section: ${error.message}`);
  return data;
}

export async function reorderFeaturedSections(items = []) {
  await applyBulkOrder({ table: TABLE, items });
}
