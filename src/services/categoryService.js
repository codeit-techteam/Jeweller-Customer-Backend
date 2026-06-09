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

const CATEGORY_TABLE = 'categories';
const CATEGORY_PRODUCTS_TABLE = 'category_products';

function resolveCategoryImageInput(input) {
  // CMS uploads write to `image`; stale `category_image_url` may still be in the payload.
  return (
    normalizeNullableText(input.image) ??
    normalizeNullableText(input.category_image_url ?? input.categoryImageUrl)
  );
}

function buildCategoryPayload(input) {
  const name = normalizeRequiredText(input.name ?? input.title, 'Category name');
  const imageUrl = resolveCategoryImageInput(input);
  return {
    name,
    subtitle: normalizeNullableText(input.subtitle),
    image: imageUrl,
    category_image_url: imageUrl,
    slug: normalizeNullableText(input.slug) ?? toSlug(name),
    sort_order: normalizeIntegerOrZero(input.sort_order ?? input.sortOrder),
    is_active: normalizeBoolean(input.is_active ?? input.isActive, true),
  };
}

function shapeRow(row, products = []) {
  const categoryImage = row.image ?? row.category_image_url ?? null;
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle ?? null,
    image: categoryImage,
    category_image_url: categoryImage,
    slug: row.slug ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
  };
}

/**
 * Read products that point at this category via the legacy
 * `products.category_id` column. Used to back-fill the new junction table the
 * first time an admin opens a category that was seeded before the CMS.
 */
async function fetchLegacyCategoryProducts(categoryId) {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, price, primary_image, thumbnail, featured_image, image, status, is_trending, discount_percentage',
    )
    .eq('category_id', categoryId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Failed to load legacy products for category: ${error.message}`);
  }
  return (data ?? []).map((product, index) => ({
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
    sort_order: index,
  }));
}

/**
 * Seed the junction table from the legacy column the first time a category
 * is touched, so future admin saves don't accidentally wipe history.
 */
async function seedJunctionFromLegacy(categoryId, products) {
  if (!products.length) return;
  const rows = products.map((product, index) => ({
    category_id: categoryId,
    product_id: product.id,
    sort_order: index,
  }));
  const { error } = await supabase
    .from(CATEGORY_PRODUCTS_TABLE)
    .upsert(rows, { onConflict: 'category_id,product_id' });
  if (error) {
    throw new Error(`Failed to seed category_products: ${error.message}`);
  }
}

/**
 * After admins save the attached product set, keep the legacy
 * `products.category_id` column synced so the existing mobile app (which
 * still reads `category_id`) keeps showing the same products.
 *
 *  - For every product that is now attached: set products.category_id = this category id.
 *  - For every product that USED to be attached but no longer is, and that
 *    still has products.category_id = this category id: clear it to null.
 */
async function syncLegacyCategoryColumn(categoryId, nextProductIds) {
  const sanitizedNext = Array.from(
    new Set(
      (nextProductIds ?? [])
        .map((id) => normalizeNullableText(id))
        .filter(Boolean),
    ),
  );

  if (sanitizedNext.length) {
    const { error: assignErr } = await supabase
      .from('products')
      .update({ category_id: categoryId })
      .in('id', sanitizedNext);
    if (assignErr) {
      throw new Error(`Failed to set products.category_id: ${assignErr.message}`);
    }
  }

  // Clear category_id on products that used to belong to this category but
  // are no longer attached.
  const { data: stillPointing, error: stillErr } = await supabase
    .from('products')
    .select('id')
    .eq('category_id', categoryId);
  if (stillErr) {
    throw new Error(`Failed to load products by category_id: ${stillErr.message}`);
  }
  const orphanIds = (stillPointing ?? [])
    .map((row) => row.id)
    .filter((id) => !sanitizedNext.includes(id));
  if (orphanIds.length) {
    const { error: clearErr } = await supabase
      .from('products')
      .update({ category_id: null })
      .in('id', orphanIds);
    if (clearErr) {
      throw new Error(`Failed to clear stale category_id: ${clearErr.message}`);
    }
  }
}

export async function getCategories({ includeInactive = false } = {}) {
  let query = supabase
    .from(CATEGORY_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch categories: ${error.message}`);

  const rows = data ?? [];
  if (!rows.length) return [];

  // Hydrate every row with its junction products so the Admin Panel can
  // pre-select them without an extra round-trip per row.
  const productMap = await fetchLinkedProductsByParent({
    table: CATEGORY_PRODUCTS_TABLE,
    parentColumn: 'category_id',
    parentIds: rows.map((row) => row.id),
  });

  return rows.map((row) => shapeRow(row, productMap.get(row.id) ?? []));
}

export async function getCategoryById(id) {
  const { data, error } = await supabase
    .from(CATEGORY_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch category: ${error.message}`);
  if (!data) return null;

  let products = await fetchLinkedProducts({
    table: CATEGORY_PRODUCTS_TABLE,
    parentColumn: 'category_id',
    parentId: id,
  });

  // Legacy fall-back: if no junction rows yet, pull from products.category_id
  // and seed the junction so subsequent admin saves work without surprises.
  if (!products.length) {
    const legacy = await fetchLegacyCategoryProducts(id);
    if (legacy.length) {
      await seedJunctionFromLegacy(id, legacy);
      products = legacy;
    }
  }

  return shapeRow(data, products);
}

export async function createCategory(input = {}) {
  const payload = buildCategoryPayload(input);
  const { data, error } = await supabase
    .from(CATEGORY_TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create category: ${error.message}`);
  const nextProductIds = input.product_ids ?? input.productIds ?? [];
  await syncProductLinks({
    table: CATEGORY_PRODUCTS_TABLE,
    parentColumn: 'category_id',
    parentId: data.id,
    productIds: nextProductIds,
  });
  await syncLegacyCategoryColumn(data.id, nextProductIds);
  return getCategoryById(data.id);
}

export async function updateCategoryById(id, input = {}) {
  const payload = buildCategoryPayload(input);
  const { data, error } = await supabase
    .from(CATEGORY_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update category: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    const nextProductIds = input.product_ids ?? input.productIds ?? [];
    await syncProductLinks({
      table: CATEGORY_PRODUCTS_TABLE,
      parentColumn: 'category_id',
      parentId: id,
      productIds: nextProductIds,
    });
    await syncLegacyCategoryColumn(id, nextProductIds);
  }
  return getCategoryById(id);
}

export async function deleteCategoryById(id) {
  const { data, error } = await supabase
    .from(CATEGORY_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete category: ${error.message}`);
  return data;
}

export async function getCategoryListingProducts(categoryId) {
  const category = await getCategoryById(categoryId);
  if (!category) return null;

  const productIds = category.product_ids ?? [];
  if (!productIds.length) {
    return { category, products: [] };
  }

  const { getProductsByIds } = await import('./productService.js');
  const products = await getProductsByIds(productIds);
  const byId = new Map(products.map((product) => [product.id, product]));
  const ordered = productIds
    .map((id) => byId.get(id))
    .filter(Boolean);

  return { category, products: ordered };
}

export async function getCategoryListingProductsBySlug(slugOrName) {
  const token = String(slugOrName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!token) return null;

  const { data: rows, error } = await supabase
    .from(CATEGORY_TABLE)
    .select('id, name, slug')
    .eq('is_active', true);
  if (error) throw new Error(`Failed to resolve category: ${error.message}`);

  const match = (rows ?? []).find((row) => {
    const nameKey = String(row.name ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    const slugKey = String(row.slug ?? row.name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    const targetUpper = token.toUpperCase();
    return nameKey === targetUpper || slugKey === token;
  });
  if (!match?.id) return null;
  return getCategoryListingProducts(match.id);
}

export async function reorderCategories(items = []) {
  await applyBulkOrder({ table: CATEGORY_TABLE, items });
}
