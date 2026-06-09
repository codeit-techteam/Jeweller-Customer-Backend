import { supabase } from '../config/supabase.js';
import {
  applyBulkOrder,
  fetchLinkedProducts,
  normalizeBoolean,
  normalizeIntegerOrZero,
  normalizeIsoTimestampOrNull,
  normalizeNullableText,
  normalizeRequiredText,
  syncProductLinks,
  toSlug,
} from './_cmsHelpers.js';

const TABLE = 'offers';
const PRODUCT_JOIN = 'offer_products';
const COLLECTION_JOIN = 'offer_collections';

function buildPayload(input) {
  const title = normalizeRequiredText(input.title, 'Offer title');
  return {
    title,
    slug: normalizeNullableText(input.slug) ?? toSlug(title),
    subtitle: normalizeNullableText(input.subtitle),
    badge: normalizeNullableText(input.badge),
    description: normalizeNullableText(input.description),
    discount_text: normalizeNullableText(input.discount_text ?? input.discountText),
    image: normalizeNullableText(input.image),
    banner_image: normalizeNullableText(input.banner_image ?? input.bannerImage),
    cta_label: normalizeNullableText(input.cta_label ?? input.ctaLabel),
    cta_target: normalizeNullableText(input.cta_target ?? input.ctaTarget),
    starts_at: normalizeIsoTimestampOrNull(input.starts_at ?? input.startsAt),
    expires_at: normalizeIsoTimestampOrNull(input.expires_at ?? input.expiresAt),
    sort_order: normalizeIntegerOrZero(input.sort_order ?? input.sortOrder),
    is_active: normalizeBoolean(input.is_active ?? input.isActive, true),
  };
}

async function syncCollectionLinks({ offerId, collectionIds }) {
  const cleaned = Array.from(
    new Set(
      (collectionIds ?? [])
        .map((id) => normalizeNullableText(id))
        .filter((id) => id != null),
    ),
  );

  await supabase.from(COLLECTION_JOIN).delete().eq('offer_id', offerId);
  if (!cleaned.length) return;
  const rows = cleaned.map((collectionId, index) => ({
    offer_id: offerId,
    collection_id: collectionId,
    sort_order: index,
  }));
  const { error } = await supabase.from(COLLECTION_JOIN).insert(rows);
  if (error) throw new Error(`Failed to attach offer collections: ${error.message}`);
}

async function fetchOfferCollections(offerId) {
  const { data, error } = await supabase
    .from(COLLECTION_JOIN)
    .select('collection_id, sort_order, collection:collections(id, title, image, banner_image, slug)')
    .eq('offer_id', offerId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Failed to fetch offer collections: ${error.message}`);
  return (data ?? [])
    .map((row) => (row.collection ? { ...row.collection, sort_order: row.sort_order ?? 0 } : null))
    .filter(Boolean);
}

function shapeRow(row, products = [], collections = []) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle ?? null,
    badge: row.badge ?? null,
    description: row.description ?? null,
    discount_text: row.discount_text ?? null,
    image: row.image ?? null,
    banner_image: row.banner_image ?? null,
    cta_label: row.cta_label ?? null,
    cta_target: row.cta_target ?? null,
    starts_at: row.starts_at ?? null,
    expires_at: row.expires_at ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    products,
    product_ids: products.map((item) => item.id),
    collections,
    collection_ids: collections.map((item) => item.id),
  };
}

function withinSchedule(row, now) {
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < now) return false;
  return true;
}

export async function getOffers({
  includeInactive = false,
  includeExpired = false,
} = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch offers: ${error.message}`);

  const now = Date.now();
  const filtered = includeExpired
    ? (data ?? [])
    : (data ?? []).filter((row) => withinSchedule(row, now));

  return Promise.all(
    filtered.map(async (row) => {
      const [products, collections] = await Promise.all([
        fetchLinkedProducts({
          table: PRODUCT_JOIN,
          parentColumn: 'offer_id',
          parentId: row.id,
        }),
        fetchOfferCollections(row.id),
      ]);
      return shapeRow(row, products, collections);
    }),
  );
}

export async function getOfferById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch offer: ${error.message}`);
  if (!data) return null;
  const [products, collections] = await Promise.all([
    fetchLinkedProducts({ table: PRODUCT_JOIN, parentColumn: 'offer_id', parentId: id }),
    fetchOfferCollections(id),
  ]);
  return shapeRow(data, products, collections);
}

export async function createOffer(input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create offer: ${error.message}`);
  await syncProductLinks({
    table: PRODUCT_JOIN,
    parentColumn: 'offer_id',
    parentId: data.id,
    productIds: input.product_ids ?? input.productIds ?? [],
  });
  await syncCollectionLinks({
    offerId: data.id,
    collectionIds: input.collection_ids ?? input.collectionIds ?? [],
  });
  return getOfferById(data.id);
}

export async function updateOfferById(id, input = {}) {
  const payload = buildPayload(input);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update offer: ${error.message}`);
  if (!data) return null;
  if (input.product_ids !== undefined || input.productIds !== undefined) {
    await syncProductLinks({
      table: PRODUCT_JOIN,
      parentColumn: 'offer_id',
      parentId: id,
      productIds: input.product_ids ?? input.productIds ?? [],
    });
  }
  if (input.collection_ids !== undefined || input.collectionIds !== undefined) {
    await syncCollectionLinks({
      offerId: id,
      collectionIds: input.collection_ids ?? input.collectionIds ?? [],
    });
  }
  return getOfferById(id);
}

export async function deleteOfferById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete offer: ${error.message}`);
  return data;
}

export async function reorderOffers(items = []) {
  await applyBulkOrder({ table: TABLE, items });
}
