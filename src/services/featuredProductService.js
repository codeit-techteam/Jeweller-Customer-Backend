import { supabase } from '../config/supabase.js';
import {
  applyBulkOrder,
  normalizeBoolean,
  normalizeNullableText,
} from './_cmsHelpers.js';

const TABLE = 'featured_products';

function mapProductRow(p) {
  if (!p) return null;
  const gallery = Array.isArray(p.images)
    ? p.images
    : Array.isArray(p.gallery_images)
      ? p.gallery_images
      : [];
  const image =
    p.primary_image ??
    p.thumbnail ??
    p.thumbnail_image ??
    p.featured_image ??
    p.image ??
    gallery[0] ??
    null;
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price ?? 0),
    image,
    description: p.description ?? null,
    status: p.status ?? 'active',
    is_trending: Boolean(p.is_trending),
    discount_percentage: p.discount_percentage ?? null,
    category: p.category?.name ?? null,
    boutique: p.boutique
      ? {
          id: p.boutique.id,
          name: p.boutique.name,
          rating: p.boutique.rating,
          verified: Boolean(p.boutique.is_verified ?? p.boutique.verified),
        }
      : null,
  };
}

export async function getDiscoverFeaturedProducts({ includeInactive = false } = {}) {
  let query = supabase
    .from(TABLE)
    .select(
      `
      id,
      sort_order,
      is_active,
      product:products(
        id,
        name,
        price,
        image,
        primary_image,
        thumbnail,
        featured_image,
        images,
        description,
        status,
        is_trending,
        discount_percentage,
        category:categories(name),
        boutique:boutiques!boutique_id(id, name, rating, is_verified, verified)
      )
    `,
    )
    .order('sort_order', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch featured products: ${error.message}`);

  return (data ?? [])
    .map((row) => {
      const product = row.product ?? null;
      const mapped = mapProductRow(product);
      if (!mapped) return null;
      if (!includeInactive) {
        if (row.is_active === false) return null;
        if (mapped.status !== 'active') return null;
      }
      return {
        row_id: row.id,
        sort_order: row.sort_order ?? 0,
        is_active: row.is_active !== false,
        ...mapped,
      };
    })
    .filter(Boolean);
}

export async function replaceDiscoverFeaturedProducts(productIds = []) {
  const cleaned = Array.from(
    new Set(
      (productIds ?? [])
        .map((id) => normalizeNullableText(id))
        .filter((id) => id != null),
    ),
  );

  const { data: existingRows, error: listErr } = await supabase.from(TABLE).select('id');
  if (listErr) throw new Error(`Failed to read featured products: ${listErr.message}`);
  const existingIds = (existingRows ?? []).map((row) => row.id).filter(Boolean);
  if (existingIds.length) {
    const { error: delErr } = await supabase.from(TABLE).delete().in('id', existingIds);
    if (delErr) throw new Error(`Failed to reset featured products: ${delErr.message}`);
  }

  if (!cleaned.length) return [];

  const rows = cleaned.map((productId, index) => ({
    product_id: productId,
    sort_order: index,
    is_active: true,
  }));

  const { error: insErr } = await supabase.from(TABLE).insert(rows);
  if (insErr) throw new Error(`Failed to save featured products: ${insErr.message}`);

  return getDiscoverFeaturedProducts({ includeInactive: true });
}

export async function updateFeaturedProductRow(id, input = {}) {
  const patch = {};
  if (input.is_active !== undefined || input.isActive !== undefined) {
    patch.is_active = normalizeBoolean(input.is_active ?? input.isActive, true);
  }
  if (Object.keys(patch).length === 0) {
    return null;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update featured product row: ${error.message}`);
  return data;
}

export async function deleteFeaturedProductRow(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete featured product row: ${error.message}`);
  return data;
}

export async function reorderDiscoverFeaturedProducts(items = []) {
  await applyBulkOrder({ table: TABLE, items });
}
