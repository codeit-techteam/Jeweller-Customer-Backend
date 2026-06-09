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

const TABLE = 'relationship_sections';
const JOIN = 'relationship_products';
const PARENT_COL = 'relationship_section_id';

/** Map DB columns to fields the app / featured-product mappers expect. */
function mapRelationshipListingProduct(row) {
  if (!row) return null;
  const images = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  const thumb =
    row.thumbnail ??
    row.primary_image ??
    row.featured_image ??
    row.image ??
    images[0] ??
    null;
  return {
    ...row,
    thumbnail_image: thumb,
    gallery_images: images,
  };
}

function buildPayload(input) {
  const title = normalizeRequiredText(input.title ?? input.name, 'Title');
  return {
    title,
    slug: normalizeNullableText(input.slug) ?? toSlug(title),
    subtitle: normalizeNullableText(input.subtitle),
    image: normalizeNullableText(input.image ?? input.banner_image ?? input.bannerImage),
    collection_slug:
      normalizeNullableText(input.collection_slug ?? input.collectionSlug) ?? null,
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
    image: row.image ?? null,
    collection_slug: row.collection_slug ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

export async function getRelationshipSections({ includeInactive = false } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch relationship sections: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return [];

  const productMap = await fetchLinkedProductsByParent({
    table: JOIN,
    parentColumn: PARENT_COL,
    parentIds: rows.map((row) => row.id),
  });
  return rows.map((row) => shapeRow(row, productMap.get(row.id) ?? []));
}

export async function getRelationshipSectionById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch relationship section: ${error.message}`);
  if (!data) return null;
  const products = await fetchLinkedProducts({
    table: JOIN,
    parentColumn: PARENT_COL,
    parentId: id,
  });
  return shapeRow(data, products);
}

/**
 * Full product rows for listing screens (category-products / relationship browse).
 */
export async function getRelationshipSectionListingProducts(sectionId) {
  const section = await getRelationshipSectionById(sectionId);
  if (!section) return null;
  const ids = section.product_ids ?? [];
  if (!ids.length) {
    return { section, products: [] };
  }

  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      price,
      image,
      primary_image,
      thumbnail,
      featured_image,
      images,
      category_id,
      boutique_id,
      status,
      description,
      category:categories(id, name),
      boutique:boutiques!boutique_id(id, name, rating, is_verified, verified, image, cover_image_url, logo_url, gallery_images, banner_images, updated_at)
    `,
    )
    .in('id', ids)
    .eq('status', 'active');

  if (error) throw new Error(`Failed to load relationship products: ${error.message}`);
  const byId = new Map((data ?? []).map((row) => [row.id, mapRelationshipListingProduct(row)]));
  const ordered = ids.map((pid) => byId.get(pid)).filter(Boolean);
  return { section, products: ordered };
}

export async function createRelationshipSection(input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create relationship section: ${error.message}`);
  await syncProductLinks({
    table: JOIN,
    parentColumn: PARENT_COL,
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  return getRelationshipSectionById(data.id);
}

export async function updateRelationshipSectionById(id, input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update relationship section: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: JOIN,
      parentColumn: PARENT_COL,
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  return getRelationshipSectionById(id);
}

export async function deleteRelationshipSectionById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete relationship section: ${error.message}`);
  return data;
}

export async function reorderRelationshipSections(items = []) {
  await applyBulkOrder({ table: TABLE, items });
}
