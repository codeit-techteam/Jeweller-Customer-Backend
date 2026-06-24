import { supabase } from '../config/supabase.js';
import { resolveBoutiqueCoverUrl, resolveBoutiqueLogoUrl, withVersion } from '../utils/boutiqueMedia.js';

const VALID_WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

const t = (v) => (v == null ? null : String(v).trim() || null);
const bool = (v, d = false) => (typeof v === 'boolean' ? v : v == null ? d : Boolean(v));
const status = (v) => (String(v || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active');
const arr = (v) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
const days = (v) => arr(v).map((d) => d.toLowerCase()).filter((d) => VALID_WEEKDAYS.has(d));
const slug = (v, f) => (t(v) ?? t(f) ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') || null;
/** Normalize known collection slug typos so tabs match products (e.g. earings → earrings). */
const SLUG_CANON = { earings: 'earrings', earing: 'earrings' };
const collectionSlug = (rawSlug, name) => {
  const base = slug(rawSlug, name);
  if (!base) return null;
  return SLUG_CANON[base] ?? base;
};
const phone = (v) => (t(v) ? String(v).replace(/[^0-9+]/g, '') : null);
const whatsapp = (v) => (t(v) ? String(v).replace(/[\s+-]/g, '') : null);
const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const firstHttp = (values = []) => values.map((v) => t(v)).find((v) => v && v.startsWith('http')) ?? null;

function resolveProductImage(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  const mediaImage = Array.isArray(row.media)
    ? row.media.find((entry) => entry && entry.type === 'image' && t(entry.url))
    : null;
  const selected =
    t(row.thumbnail) ??
    t(row.primary_image) ??
    t(row.featured_image) ??
    t(row.image) ??
    firstHttp(images) ??
    t(mediaImage?.url);
  return withVersion(selected, row.updated_at ?? row.created_at ?? null);
}

/**
 * Resolve display price using price_breakup as the source of truth when available.
 * Priority: price_breakup.total > sum of components > raw price column.
 * This ensures listing cards show the same price as the product detail page.
 */
function resolveDisplayPrice(rawPrice, priceBreakup) {
  const price = Number(rawPrice ?? 0) || 0;
  if (!priceBreakup || typeof priceBreakup !== 'object') return price;

  const totalRaw = priceBreakup.total != null ? Number(priceBreakup.total) : NaN;
  if (Number.isFinite(totalRaw) && totalRaw > 0) return totalRaw;

  const gold = Number(priceBreakup.gold ?? 0) || 0;
  const gemstone = Number(priceBreakup.gemstone ?? 0) || 0;
  const making = Number(priceBreakup.makingCharge ?? priceBreakup.making ?? 0) || 0;
  const gst = Number(priceBreakup.gst ?? 0) || 0;
  const sum = gold + gemstone + making + gst;
  return sum > 0 ? sum : price;
}

function mapBoutique(row) {
  const galleryImages = arr(row.gallery_images).length ? arr(row.gallery_images) : arr(row.banner_images);
  const cover = resolveBoutiqueCoverUrl(row);
  const logo = resolveBoutiqueLogoUrl(row);
  if (process.env.NODE_ENV !== 'production' && cover) {
    console.log('[boutiqueMedia] cover', { id: row.id, name: row.name, url: cover });
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    description: row.description ?? null,
    image: cover,
    cover_image: cover,
    cover_image_url: cover,
    logo_image: logo,
    logo_url: logo,
    logo,
    banner_images: galleryImages,
    gallery_images: galleryImages,
    location: row.location ?? null,
    full_address: row.full_address ?? row.address ?? row.location ?? null,
    address: row.full_address ?? row.address ?? row.location ?? null,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    coordinates: num(row.latitude) != null && num(row.longitude) != null ? { lat: Number(row.latitude), lng: Number(row.longitude) } : null,
    opening_time: row.opening_time ?? null,
    closing_time: row.closing_time ?? null,
    working_days: days(row.working_days),
    opening_hours: row.opening_hours ?? null,
    phone_number: row.phone_number ?? row.phone ?? row.contact_number ?? null,
    phone: row.phone_number ?? row.phone ?? row.contact_number ?? null,
    contact_number: row.contact_number ?? row.phone_number ?? row.phone ?? null,
    whatsapp_number: row.whatsapp_number ?? row.whatsapp ?? null,
    whatsapp: row.whatsapp_number ?? row.whatsapp ?? null,
    instagram_url: row.instagram_url ?? row.instagram ?? null,
    instagram: row.instagram_url ?? row.instagram ?? null,
    website_url: row.website_url ?? null,
    reviews_count: Number(row.reviews_count ?? 0),
    rating: row.rating ?? null,
    is_verified: bool(row.is_verified ?? row.verified),
    verified: bool(row.is_verified ?? row.verified),
    is_active: bool(row.is_active, row.status !== 'inactive'),
    status: row.status === 'inactive' ? 'inactive' : 'active',
    featured: bool(row.is_featured ?? row.featured),
    is_featured: bool(row.is_featured ?? row.featured),
    verification_status: row.verification_status ?? 'PENDING',
    admin_note: row.admin_note ?? null,
    verification_rejected_reason: row.verification_rejected_reason ?? null,
    verified_at: row.verified_at ?? null,
    verified_by: row.verified_by ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    deleted_at: row.deleted_at ?? null,
    // Jeweller onboarding fields
    store_status: row.store_status ?? null,
    is_self_managed: bool(row.is_self_managed),
    jeweller_user_id: row.jeweller_user_id ?? null,
    owner_name: row.owner_name ?? null,
    member_id: row.member_id ?? null,
    store_tagline: row.store_tagline ?? null,
    onboarding_step: row.onboarding_step ?? null,
    is_onboarding_done: bool(row.is_onboarding_done),
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: resolveDisplayPrice(row.price, row.price_breakup),
    image: resolveProductImage(row),
    category_id: row.category_id ?? null,
    category: row.categories ? { id: row.categories.id, name: row.categories.name } : null,
    collection: row.collection_name ?? null,
    collection_name: row.collection_name ?? null,
    trending: bool(row.is_trending ?? row.trending),
    video_url: row.video_url ?? null,
    video_thumbnail: row.video_thumbnail ?? null,
    price_breakup: row.price_breakup ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function isCustomerVisibleStatus(rawStatus) {
  const statusValue = String(rawStatus ?? "active").toLowerCase();
  if (!statusValue) return true;
  return !["draft", "archived", "deleted", "inactive"].includes(statusValue);
}

async function log(action, boutiqueId, metadata = {}) {
  await supabase.from('admin_activity_logs').insert({ action, boutique_id: boutiqueId, metadata, created_at: new Date().toISOString() });
}

async function syncCollections(boutiqueId, input = []) {
  const values = [];
  const seen = new Set();
  for (const item of input) {
    const name = t(item?.name);
    const s = collectionSlug(item?.slug, name);
    if (!name || !s || seen.has(s)) continue;
    seen.add(s);
    values.push({ name, slug: s });
  }
  const { error: delErr } = await supabase.from('boutique_collections').delete().eq('boutique_id', boutiqueId);
  if (delErr) throw new Error(`Failed to sync collections: ${delErr.message}`);
  if (!values.length) return [];
  const { data, error } = await supabase.from('boutique_collections').insert(values.map((v) => ({ ...v, boutique_id: boutiqueId }))).select('id,name,slug');
  if (error) throw new Error(`Failed to sync collections: ${error.message}`);
  return data ?? [];
}

async function syncProducts(boutiqueId, linked = []) {
  const ids = [...new Set(arr(linked))];
  const { error: delErr } = await supabase.from('boutique_product_links').delete().eq('boutique_id', boutiqueId);
  if (delErr) throw new Error(`Failed to sync products: ${delErr.message}`);
  if (!ids.length) return;
  const { error } = await supabase.from('boutique_product_links').insert(ids.map((id) => ({ boutique_id: boutiqueId, product_id: id })));
  if (error) throw new Error(`Failed to sync products: ${error.message}`);
}

function haversineDistanceKm(userLat, userLng, boutiqueLat, boutiqueLng) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(boutiqueLat - userLat);
  const dLng = toRad(boutiqueLng - userLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(userLat)) * Math.cos(toRad(boutiqueLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Sort key for boutiques missing map coordinates — always last when sorting by distance. */
const NO_COORD_DISTANCE_KM = 9999;

function isFeaturedBoutiqueRow(row) {
  return bool(row.is_featured ?? row.featured);
}

function isVerifiedBoutiqueRow(row) {
  return bool(row.is_verified ?? row.verified);
}

function hasUserCoords(userCoords) {
  return (
    userCoords &&
    Number.isFinite(userCoords.lat) &&
    Number.isFinite(userCoords.lng)
  );
}

async function attachLatestCollections(mapped) {
  if (!mapped.length) return [];
  const ids = mapped.map((b) => b.id);
  const { data: colRows, error: colErr } = await supabase
    .from('boutique_collections')
    .select('boutique_id,name,slug,updated_at')
    .in('boutique_id', ids);
  if (colErr) {
    console.error('[getFeaturedBoutiques] boutique_collections', colErr.message);
    return mapped;
  }
  const best = new Map();
  for (const c of colRows ?? []) {
    const ts = new Date(c.updated_at || 0).getTime();
    const prev = best.get(c.boutique_id);
    const label = t(c.name) ?? t(c.slug);
    if (!label) continue;
    if (!prev || ts >= prev.ts) {
      best.set(c.boutique_id, { ts, name: label });
    }
  }
  return mapped.map((m) => ({
    ...m,
    latest_collection_name: best.get(m.id)?.name ?? null,
  }));
}

async function loadFeaturedCandidateRows() {
  const { data, error } = await supabase
    .from('boutiques')
    .select('*')
    .is('deleted_at', null)
    .eq('store_status', 'approved')
    .eq('is_active', true)
    .eq('is_verified', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch featured boutiques: ${error.message}`);
  return (data ?? []).filter((row) => isFeaturedBoutiqueRow(row) && isVerifiedBoutiqueRow(row));
}

function mapFeaturedWithDistance(rows, userCoords) {
  return rows.map((row) => {
    const boutique = mapBoutique(row);
    let distance_km = NO_COORD_DISTANCE_KM;
    if (
      hasUserCoords(userCoords) &&
      boutique.latitude != null &&
      boutique.longitude != null
    ) {
      distance_km = haversineDistanceKm(
        userCoords.lat,
        userCoords.lng,
        boutique.latitude,
        boutique.longitude,
      );
    }
    return { ...boutique, distance_km };
  });
}

function sortFeaturedByDistance(mapped) {
  return [...mapped].sort((a, b) => a.distance_km - b.distance_km);
}

/** Within radius: coord boutiques inside radius + no-coord boutiques (9999) at end. */
function filterFeaturedWithinRadius(mapped, radiusKm) {
  return mapped.filter(
    (b) =>
      b.distance_km >= NO_COORD_DISTANCE_KM ||
      (Number.isFinite(b.distance_km) && b.distance_km <= radiusKm),
  );
}

function pickFeaturedTier(rows, userCoords) {
  const mapped = sortFeaturedByDistance(mapFeaturedWithDistance(rows, userCoords));
  if (!hasUserCoords(userCoords)) {
    return mapped;
  }

  const tiers = [50, 500];
  for (const radius of tiers) {
    const inRadius = filterFeaturedWithinRadius(mapped, radius);
    const withCoords = inRadius.filter((b) => b.distance_km < NO_COORD_DISTANCE_KM);
    if (withCoords.length > 0) {
      console.log('[getFeaturedBoutiques] tier hit', { radiusKm: radius, count: inRadius.length });
      return inRadius;
    }
  }

  console.log('[getFeaturedBoutiques] fallback — all featured, no radius filter');
  return mapped;
}

/**
 * Featured + verified boutiques for the customer home rail.
 * 3-tier fallback with coords: 50 km → 500 km → all featured.
 * Boutiques without lat/lng are included (sorted last).
 */
export async function getFeaturedBoutiques({
  userCoords = null,
  limit = 10,
  radiusKm = null,
} = {}) {
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = await loadFeaturedCandidateRows();
  if (!rows.length) {
    console.log('[getFeaturedBoutiques] no featured+verified boutiques in DB');
    return [];
  }

  let result = pickFeaturedTier(rows, userCoords);

  if (radiusKm != null && Number.isFinite(Number(radiusKm)) && hasUserCoords(userCoords)) {
    const custom = filterFeaturedWithinRadius(
      sortFeaturedByDistance(mapFeaturedWithDistance(rows, userCoords)),
      Number(radiusKm),
    );
    if (custom.length > 0) {
      result = custom;
    }
  }

  return attachLatestCollections(result.slice(0, cap));
}

export async function getBoutiques({ includeAll = false } = {}) {
  let query = supabase.from('boutiques').select('*').is('deleted_at', null).order('name', { ascending: true });
  if (!includeAll) {
    query = query.eq('store_status', 'approved').eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch boutiques: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return [];
  const mapped = rows.map(mapBoutique);
  const ids = mapped.map((b) => b.id);

  // When fetching all (admin mode) also include products_count per boutique
  let productsCountMap = {};
  if (includeAll) {
    const { data: productRows } = await supabase
      .from('products')
      .select('boutique_id')
      .in('boutique_id', ids)
      .eq('status', 'active');
    (productRows ?? []).forEach((r) => {
      productsCountMap[r.boutique_id] = (productsCountMap[r.boutique_id] ?? 0) + 1;
    });
  }
  const { data: colRows, error: colErr } = await supabase
    .from('boutique_collections')
    .select('boutique_id,name,slug,updated_at')
    .in('boutique_id', ids);
  if (colErr) {
    console.error('[getBoutiques] boutique_collections', colErr.message);
    return mapped.map((m) => ({ ...m, latest_collection_name: null }));
  }
  const best = new Map();
  for (const c of colRows ?? []) {
    const ts = new Date(c.updated_at || 0).getTime();
    const prev = best.get(c.boutique_id);
    const label = t(c.name) ?? t(c.slug);
    if (!label) continue;
    if (!prev || ts >= prev.ts) {
      best.set(c.boutique_id, { ts, name: label });
    }
  }
  return mapped.map((m) => ({
    ...m,
    latest_collection_name: best.get(m.id)?.name ?? null,
    products_count: productsCountMap[m.id] ?? null,
  }));
}

export async function getBoutiqueById(id) {
  const { data: row, error } = await supabase.from('boutiques').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(`Failed to fetch boutique: ${error.message}`);
  if (!row) return null;
  const { data: collections } = await supabase.from('boutique_collections').select('id,name,slug').eq('boutique_id', id).order('name', { ascending: true });
  const { data: directProducts, error: directProductsError } = await supabase
    .from('products')
    .select('id,name,price,price_breakup,image,thumbnail,primary_image,featured_image,images,media,video_url,video_thumbnail,category_id,is_trending,trending,collection_name,status,is_draft,updated_at,created_at,categories(id,name)')
    .or(`boutique_id.eq.${id},primary_boutique_id.eq.${id}`)
    .order('created_at', { ascending: false });
  if (directProductsError) {
    throw new Error(`Failed to fetch boutique products: ${directProductsError.message}`);
  }
  const visibleProducts = (directProducts ?? []).filter((product) => {
    if (product.is_draft === true) return false;
    return isCustomerVisibleStatus(product.status);
  });
  const mappedProducts = visibleProducts.map((product) => mapProduct(product));
  return {
    ...mapBoutique(row),
    collections: (collections ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    linked_product_ids: mappedProducts.map((p) => p.id),
    products: mappedProducts,
    related_products: mappedProducts.filter((p) => p.trending).slice(0, 8),
  };
}

export async function getBoutiqueDetailsById(id) {
  return getBoutiqueById(id);
}

export async function updateBoutiqueById(id, input = {}) {
  const galleryImages = arr(input.gallery_images).length ? arr(input.gallery_images) : arr(input.banner_images);
  const coverInput = t(
    input.cover_image_url ?? input.cover_image ?? input.image,
  );
  const logoInput = t(input.logo_url ?? input.logo_image ?? input.logo);
  const payload = {
    name: t(input.name),
    slug: slug(input.slug, input.name),
    description: t(input.description),
    location: t(input.location),
    full_address: t(input.full_address ?? input.address),
    logo_url: logoInput,
    banner_images: galleryImages,
    gallery_images: galleryImages,
    latitude: num(input.latitude),
    longitude: num(input.longitude),
    opening_time: t(input.opening_time),
    closing_time: t(input.closing_time),
    working_days: days(input.working_days),
    phone_number: phone(input.phone_number ?? input.phone ?? input.contact_number),
    whatsapp_number: whatsapp(input.whatsapp_number ?? input.whatsapp),
    instagram_url: t(input.instagram_url ?? input.instagram),
    website_url: t(input.website_url),
    reviews_count: Math.max(0, Number(input.reviews_count ?? 0) || 0),
    rating: num(input.rating),
    image: coverInput,
    cover_image_url: coverInput,
    is_verified: bool(input.is_verified ?? input.verified),
    verified: bool(input.verified ?? input.is_verified),
    featured: bool(input.featured),
    is_active: bool(input.is_active, status(input.status) !== 'inactive'),
    status: status(input.status),
    contact_number: phone(input.contact_number ?? input.phone_number ?? input.phone),
    phone: phone(input.phone ?? input.phone_number ?? input.contact_number),
    address: t(input.address ?? input.full_address),
    whatsapp: whatsapp(input.whatsapp ?? input.whatsapp_number),
    instagram: t(input.instagram ?? input.instagram_url),
    opening_hours: t(input.opening_hours),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  // Onboarding / store approval fields
  const validStoreStatuses = new Set(['pending', 'review', 'approved', 'rejected']);
  if (input.store_status != null && validStoreStatuses.has(String(input.store_status))) {
    payload.store_status = String(input.store_status);
  }
  if (input.is_onboarding_done != null) {
    payload.is_onboarding_done = bool(input.is_onboarding_done);
  }

  // Fall back to address when location (short area name) was not explicitly set
  if (!payload.location) {
    payload.location = t(input.address ?? input.full_address) ?? null;
  }
  if (!payload.name) throw new Error('Boutique name is required');
  if (!payload.phone_number && !payload.contact_number && !payload.phone) throw new Error('Phone is required');

  const { data, error } = await supabase.from('boutiques').update(payload).eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(`Failed to update boutique: ${error.message}`);
  if (!data) return null;

  // When approving a store, activate all products that were saved as drafts during onboarding
  if (payload.store_status === 'approved') {
    await supabase
      .from('products')
      .update({ is_draft: false, status: 'active' })
      .eq('boutique_id', id)
      .eq('status', 'draft');
  }

  await syncCollections(id, input.collections ?? []);
  await syncProducts(id, input.linked_product_ids ?? input.product_ids ?? []);
  await log('boutique.updated', id, { store_status: payload.store_status, status: payload.status, verified: payload.is_verified, featured: payload.featured });
  return getBoutiqueById(id);
}

export async function createBoutique(input = {}) {
  const galleryImages = arr(input.gallery_images).length ? arr(input.gallery_images) : arr(input.banner_images);
  const coverInput = t(
    input.cover_image_url ?? input.cover_image ?? input.image,
  );
  const logoInput = t(input.logo_url ?? input.logo_image ?? input.logo);
  const payload = {
    name: t(input.name),
    slug: slug(input.slug, input.name),
    description: t(input.description),
    location: t(input.location),
    full_address: t(input.full_address ?? input.address),
    rating: num(input.rating ?? 0) ?? 0,
    image: coverInput,
    cover_image_url: coverInput,
    logo_url: logoInput,
    banner_images: galleryImages,
    gallery_images: galleryImages,
    latitude: num(input.latitude),
    longitude: num(input.longitude),
    opening_time: t(input.opening_time),
    closing_time: t(input.closing_time),
    working_days: days(input.working_days),
    is_verified: bool(input.is_verified ?? input.verified),
    verified: bool(input.verified ?? input.is_verified),
    featured: bool(input.is_featured ?? input.featured),
    is_featured: bool(input.is_featured ?? input.featured),
    verification_status: 'PENDING',
    is_active: bool(input.is_active, status(input.status) !== 'inactive'),
    status: status(input.status),
    contact_number: phone(input.contact_number ?? input.phone ?? input.phone_number),
    phone_number: phone(input.phone_number ?? input.phone ?? input.contact_number),
    phone: phone(input.phone ?? input.phone_number ?? input.contact_number),
    address: t(input.address ?? input.full_address),
    whatsapp_number: whatsapp(input.whatsapp_number ?? input.whatsapp),
    whatsapp: whatsapp(input.whatsapp ?? input.whatsapp_number),
    instagram_url: t(input.instagram_url ?? input.instagram),
    instagram: t(input.instagram ?? input.instagram_url),
    website_url: t(input.website_url),
    reviews_count: Math.max(0, Number(input.reviews_count ?? 0) || 0),
    opening_hours: t(input.opening_hours),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  if (!payload.name) throw new Error('Boutique name is required');
  if (!payload.location) throw new Error('Boutique location is required');
  if (!payload.phone_number && !payload.contact_number && !payload.phone) throw new Error('Phone is required');
  const { data, error } = await supabase.from('boutiques').insert(payload).select('id').single();
  if (error) throw new Error(`Failed to create boutique: ${error.message}`);
  await syncCollections(data.id, input.collections ?? []);
  await syncProducts(data.id, input.linked_product_ids ?? input.product_ids ?? []);
  await log('boutique.created', data.id, { status: payload.status, verified: payload.is_verified, featured: payload.featured });
  return getBoutiqueById(data.id);
}

const VALID_VERIFICATION_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED']);

export async function patchBoutiqueAdminById(id, input = {}, adminUserId = null) {
  const { data: existing, error: fetchErr } = await supabase
    .from('boutiques')
    .select('id, verification_status, is_verified, verified, featured, is_featured')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (fetchErr) throw new Error(`Failed to fetch boutique: ${fetchErr.message}`);
  if (!existing) return null;

  const currentVerification = String(existing.verification_status ?? 'PENDING').toUpperCase();
  const payload = { updated_at: new Date().toISOString() };

  if (input.verification_status != null) {
    const next = String(input.verification_status).toUpperCase();
    if (!VALID_VERIFICATION_STATUSES.has(next)) {
      throw new Error('Invalid verification_status');
    }
    payload.verification_status = next;
    if (next === 'APPROVED') {
      payload.store_status = 'approved';
      payload.is_active = true;
      payload.status = 'active';
    }
    if (next === 'REJECTED') {
      payload.store_status = 'rejected';
      payload.is_active = false;
      payload.status = 'inactive';
      payload.is_verified = false;
      payload.verified = false;
      payload.is_featured = false;
      payload.featured = false;
      if (input.verification_rejected_reason != null) {
        payload.verification_rejected_reason = t(input.verification_rejected_reason);
      }
    }
    if (next === 'PENDING') {
      payload.verification_rejected_reason = null;
    }
  }

  if (input.verification_rejected_reason != null && payload.verification_status !== 'APPROVED') {
    payload.verification_rejected_reason = t(input.verification_rejected_reason);
  }

  if (input.is_verified != null || input.verified != null) {
    const wantVerified = bool(input.is_verified ?? input.verified);
    const verificationOk = (payload.verification_status ?? currentVerification) === 'APPROVED';
    if (wantVerified && !verificationOk) {
      throw new Error('Complete document review in Jeweller Approvals before verifying');
    }
    payload.is_verified = wantVerified;
    payload.verified = wantVerified;
    if (wantVerified) {
      payload.verified_at = new Date().toISOString();
      payload.verified_by = adminUserId ?? null;
    } else {
      payload.verified_at = null;
      payload.verified_by = null;
      payload.is_featured = false;
      payload.featured = false;
    }
  }

  if (input.is_featured != null || input.featured != null) {
    const wantFeatured = bool(input.is_featured ?? input.featured);
    const isVerified = payload.is_verified ?? bool(existing.is_verified ?? existing.verified);
    if (wantFeatured && !isVerified) {
      throw new Error('Verify boutique before featuring');
    }
    payload.is_featured = wantFeatured;
    payload.featured = wantFeatured;
  }

  if (input.is_active != null) {
    payload.is_active = bool(input.is_active);
    payload.status = payload.is_active ? 'active' : 'inactive';
  }

  if (input.admin_note !== undefined) {
    payload.admin_note = t(input.admin_note);
  }

  const { data, error } = await supabase.from('boutiques').update(payload).eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(`Failed to update boutique: ${error.message}`);
  if (!data) return null;

  if (payload.store_status === 'approved') {
    await supabase
      .from('products')
      .update({ is_draft: false, status: 'active' })
      .eq('boutique_id', id)
      .eq('status', 'draft');
  }

  await log('boutique.admin_patch', id, {
    verification_status: payload.verification_status,
    is_verified: payload.is_verified,
    is_featured: payload.is_featured,
    is_active: payload.is_active,
  });

  return getBoutiqueById(id);
}

export async function softDeleteBoutiqueById(id) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('boutiques')
    .update({ status: 'inactive', is_active: false, deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id,name,deleted_at,status')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete boutique: ${error.message}`);
  if (!data) return null;
  await log('boutique.deleted', id, { deleted_at: now });
  return data;
}

export async function getBoutiqueProducts(id, { includeAll = false } = {}) {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,price_breakup,image,thumbnail,primary_image,featured_image,images,media,video_url,video_thumbnail,category_id,is_trending,trending,collection_name,status,is_draft,updated_at,created_at,categories(id,name)')
    .or(`boutique_id.eq.${id},primary_boutique_id.eq.${id}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch boutique products: ${error.message}`);
  return (data ?? [])
    .filter((row) => {
      if (String(row.status ?? '').toLowerCase() === 'deleted') return false;
      if (includeAll) return true;
      if (row.is_draft === true) return false;
      return isCustomerVisibleStatus(row.status);
    })
    .map((row) => ({
      ...mapProduct(row),
      status: row.status ?? 'active',
      is_draft: Boolean(row.is_draft),
      created_at: row.created_at ?? null,
    }));
}

export async function getBoutiqueCollections(id) {
  const { data, error } = await supabase.from('boutique_collections').select('id,name,slug').eq('boutique_id', id).order('name', { ascending: true });
  if (error) throw new Error(`Failed to fetch boutique collections: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}
