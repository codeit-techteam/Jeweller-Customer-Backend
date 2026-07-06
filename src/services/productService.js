import { supabase } from "../config/supabase.js";
import { withRetry } from "../utils/retry.js";
import {
  resolveBoutiqueCoverUrl,
  resolveBoutiqueLogoUrl,
} from "../utils/boutiqueMedia.js";
import {
  CUSTOMER_VISIBLE_STATUSES,
  CUSTOMER_VISIBLE_STATUS_DB_VALUES,
  GOVERNANCE_STATUSES,
  JEWELLER_OWNED_FIELDS,
  normalizeGovernanceStatus,
} from "../constants/productGovernance.js";
import {
  getProductGovernanceState,
  recordProductEditHistory,
  tryAutoResolveAfterJewellerEdit,
} from "./productGovernanceService.js";

function toCoordinates(location) {
  if (!location) return null;
  const normalized = String(location).toLowerCase();
  if (normalized.includes("delhi")) return { lat: 28.6139, lng: 77.209 };
  if (normalized.includes("mumbai")) return { lat: 19.076, lng: 72.8777 };
  return null;
}

function withVersion(url, updatedAt) {
  if (!url) return null;
  const version = updatedAt ? encodeURIComponent(String(updatedAt)) : null;
  if (!version) return url;
  return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

function parseJsonStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

function normalizePriceBreakup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const readNum = (key) => {
    const v = raw[key];
    if (v == null || v === "") return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };
  const gold = readNum("gold") ?? 0;
  const gemstone = readNum("gemstone") ?? 0;
  const making = readNum("makingCharge") ?? readNum("making") ?? 0;
  const gst = readNum("gst") ?? 0;
  const total = readNum("total");
  const hasAny =
    gold > 0 ||
    gemstone > 0 ||
    making > 0 ||
    gst > 0 ||
    (total != null && total > 0);
  if (!hasAny) return null;
  return {
    gold,
    gemstone,
    makingCharge: making,
    gst,
    total: total != null ? total : null,
  };
}

function normalizeSpecificationsPayload(value) {
  if (!value || typeof value !== "object") return {};
  const keys = ["metal", "approxWeight", "diamondCarat", "dimensions"];
  const out = {};
  for (const k of keys) {
    const raw = value[k];
    if (raw == null) continue;
    const s = String(raw).trim();
    if (s) out[k] = s;
  }
  return out;
}

function normalizeWritableStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return parseJsonStringArray(value);
  }
  return [];
}

function normalizeOptionalRating(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(0, n));
}

function normalizeReviewsCountWrite(value) {
  if (value == null || value === "") return 0;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeDiscountPctWrite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, n);
}

function normalizePriceBreakupWrite(raw) {
  const normalized = normalizePriceBreakup(raw);
  if (!normalized) return {};
  const out = {
    gold: normalized.gold,
    gemstone: normalized.gemstone,
    makingCharge: normalized.makingCharge,
    gst: normalized.gst,
  };
  if (normalized.total != null) out.total = normalized.total;
  return out;
}

function normalizeProductImageRelations(input = {}, fallbackUrls = []) {
  const explicit = Array.isArray(input.product_images)
    ? input.product_images.filter((item) => item?.image_url)
    : [];
  if (explicit.length) {
    const sorted = [...explicit]
      .map((item, index) => ({
        image_url: String(item.image_url).trim(),
        is_primary: Boolean(item.is_primary),
        sort_order: Number.isFinite(Number(item.sort_order))
          ? Number(item.sort_order)
          : index,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
    const primaryIdx = sorted.findIndex((row) => row.is_primary);
    return sorted.map((row, idx) => ({
      ...row,
      is_primary: primaryIdx >= 0 ? idx === primaryIdx : idx === 0,
    }));
  }
  const urls = [...normalizeJsonArray(input.images), ...fallbackUrls].filter(
    Boolean,
  );
  const unique = [...new Set(urls.map(String))];
  return unique.map((url, index) => ({
    image_url: url,
    is_primary: index === 0,
    sort_order: index,
  }));
}

export function mapProductRow(row) {
  if (!row) return null;
  if (!row.categories) {
    console.warn("[productService] Missing category relation for product", {
      productId: row.id,
    });
  }
  if (!row.boutiques) {
    console.warn("[productService] Missing boutique relation for product", {
      productId: row.id,
    });
  }

  const boutique = row.boutiques
    ? {
        id: row.boutiques.id,
        name: row.boutiques.name,
        address: row.boutiques.full_address ?? row.boutiques.location ?? null,
        location: row.boutiques.location ?? null,
        rating: row.boutiques.rating ?? null,
        reviews_count: row.boutiques.reviews_count ?? null,
        verified: Boolean(
          row.boutiques.is_verified ?? row.boutiques.verified ?? false,
        ),
        is_verified: Boolean(
          row.boutiques.is_verified ?? row.boutiques.verified ?? false,
        ),
        distance: null,
        image: resolveBoutiqueCoverUrl(row.boutiques),
        cover_image: resolveBoutiqueCoverUrl(row.boutiques),
        logo: resolveBoutiqueLogoUrl(row.boutiques),
        latitude:
          row.boutiques.latitude != null ? Number(row.boutiques.latitude) : null,
        longitude:
          row.boutiques.longitude != null ? Number(row.boutiques.longitude) : null,
        coordinates:
          row.boutiques.latitude != null && row.boutiques.longitude != null
            ? {
                lat: Number(row.boutiques.latitude),
                lng: Number(row.boutiques.longitude),
              }
            : toCoordinates(row.boutiques.location),
        contact_details: {
          phone:
            row.boutiques.phone_number ?? row.boutiques.contact_number ?? null,
          whatsapp:
            row.boutiques.whatsapp_number ?? row.boutiques.whatsapp ?? null,
          email: row.boutiques.email ?? null,
        },
        phone:
          row.boutiques.phone_number ?? row.boutiques.contact_number ?? null,
        whatsapp:
          row.boutiques.whatsapp_number ?? row.boutiques.whatsapp ?? null,
      }
    : row.boutique_id
      ? {
          id: row.boutique_id,
          name: "Partner Boutique",
          location: null,
          rating: null,
          reviews_count: null,
          verified: false,
          is_verified: false,
          image: null,
          contact_details: {
            phone: null,
            whatsapp: null,
            email: null,
          },
        }
      : null;

  const orderedProductImages = [...(row.product_images ?? [])].sort(
    (a, b) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0),
  );
  const relationImageUrls = orderedProductImages
    .map((item) => item?.image_url)
    .filter(Boolean);
  const columnImages = Array.isArray(row.images)
    ? row.images.filter(Boolean)
    : [];
  const columnVideos = Array.isArray(row.videos)
    ? row.videos.filter(Boolean)
    : [];
  const featuredImage =
    row.primary_image ??
    row.thumbnail ??
    row.featured_image ??
    row.image ??
    relationImageUrls[0] ??
    null;
  const images = relationImageUrls.length
    ? relationImageUrls
    : columnImages.length
      ? columnImages
      : featuredImage
        ? [featuredImage]
        : [];
  const videos = columnVideos.length
    ? columnVideos
    : row.video_url
      ? [row.video_url]
      : [];
  const columnMedia =
    Array.isArray(row.media) && row.media.length
      ? row.media.filter((item) => item && item.url && item.type)
      : [];
  const media = columnMedia.length
    ? columnMedia
    : [
        ...images.map((url) => ({ type: "image", url })),
        ...videos.map((url) => ({ type: "video", url })),
      ];
  const updatedAt = row.updated_at ?? row.created_at ?? null;
  const thumbnail = row.thumbnail ?? images[0] ?? featuredImage;
  const versionedThumbnail = withVersion(thumbnail, updatedAt);
  const versionedImages = images
    .map((url) => withVersion(url, updatedAt))
    .filter(Boolean);
  const versionedVideoUrl = withVersion(
    row.video_url ?? videos[0] ?? null,
    updatedAt,
  );
  const versionedVideoThumbnail = withVersion(
    row.video_thumbnail ?? null,
    updatedAt,
  );

  const available_sizes = parseJsonStringArray(row.available_sizes);
  const available_metals = parseJsonStringArray(row.available_metals);
  const discount_percentage =
    row.discount_percentage == null || row.discount_percentage === ""
      ? null
      : Number(row.discount_percentage);
  const reviews_count =
    row.reviews_count == null ? 0 : Math.max(0, Math.floor(Number(row.reviews_count)));
  const rawSpecifications =
    row.specifications && typeof row.specifications === "object"
      ? row.specifications
      : {};
  // Backfill approxWeight from the products.weight column when the jeweller
  // stored weight in the DB column rather than specifications.approxWeight.
  const specifications = { ...rawSpecifications };
  if (
    !specifications.approxWeight &&
    !specifications.weight &&
    row.weight != null
  ) {
    const w = Number(row.weight);
    if (Number.isFinite(w) && w > 0) {
      specifications.approxWeight = `${w} g`;
    }
  }
  const price_breakup = normalizePriceBreakup(row.price_breakup);

  // Resolve the canonical display price: prefer price_breakup.total (or the
  // sum of its components) over the raw products.price column which can be
  // stale (e.g. set to a making-charge-only value before the full breakup was
  // entered).
  function resolvePrice(rawPrice, pb) {
    const base = Number(rawPrice ?? 0) || 0;
    if (!pb || typeof pb !== 'object') return base;
    const total = pb.total != null ? Number(pb.total) : NaN;
    if (Number.isFinite(total) && total > 0) return total;
    const sum =
      (Number(pb.gold ?? 0) || 0) +
      (Number(pb.gemstone ?? 0) || 0) +
      (Number(pb.makingCharge ?? pb.making ?? 0) || 0) +
      (Number(pb.gst ?? 0) || 0);
    return sum > 0 ? sum : base;
  }
  const resolvedPrice = resolvePrice(row.price, row.price_breakup);

  return {
    id: row.id,
    name: row.name,
    price: resolvedPrice,
    weight: row.weight != null ? Number(row.weight) : null,
    image: versionedThumbnail,
    thumbnail_image: versionedThumbnail,
    primary_image: versionedThumbnail,
    video_url: versionedVideoUrl,
    video_thumbnail: versionedVideoThumbnail,
    description: row.description,
    rating: row.rating == null ? null : Number(row.rating),
    reviews_count,
    discount_percentage:
      discount_percentage != null && Number.isFinite(discount_percentage)
        ? discount_percentage
        : null,
    available_sizes,
    available_metals,
    specifications,
    price_breakup,
    primary_boutique_id: row.primary_boutique_id ?? null,
    gender: row.gender ?? null,
    occasion: row.occasion ?? null,
    style: row.style ?? null,
    collection_name: row.collection_name ?? null,
    created_at: row.created_at,
    category_id: row.category_id,
    boutique_id: row.boutique_id,
    is_trending: row.is_trending ?? row.trending ?? false,
    trending: row.trending ?? row.is_trending ?? false,
    status: normalizeGovernanceStatus(row.status),
    owner_jeweller_id: row.owner_jeweller_id ?? null,
    last_admin_action_at: row.last_admin_action_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
    collection: row.collection ?? null,
    product_images: orderedProductImages.map((item, index) => ({
      ...item,
      image_url: withVersion(item.image_url, updatedAt),
      sort_order: Number(item.sort_order ?? index),
    })),
    images: versionedImages,
    videos,
    media,
    thumbnail: versionedThumbnail,
    featured_image: versionedThumbnail,
    gallery_images: versionedImages,
    category: row.categories
      ? { id: row.categories.id, name: row.categories.name }
      : null,
    boutique,
  };
}

function mapProductImageRows(rows) {
  return (rows ?? [])
    .filter((row) => row && row.image_url)
    .map((row) => ({
      id: row.id,
      image_url: row.image_url,
      is_primary: Boolean(row.is_primary),
      sort_order: Number(row.sort_order ?? 0),
    }));
}

async function runProductQuery(
  withImages,
  categoryId,
  singleId,
  trendingOnly,
  { includeInactive = false, sort } = {},
) {
  const boutiqueEmbed =
    "boutiques!boutique_id(id, name, location, rating, reviews_count, is_verified, verified, image, cover_image_url, logo_url, gallery_images, banner_images, contact_number, whatsapp, phone_number, whatsapp_number, latitude, longitude, full_address, updated_at)";
  const selectClause = withImages
    ? `*, categories(id, name), ${boutiqueEmbed}, product_images(id, image_url, is_primary, sort_order)`
    : `*, categories(id, name), ${boutiqueEmbed}`;

  let query = supabase.from("products").select(selectClause);

  if (singleId) {
    query = query.eq("id", singleId).maybeSingle();
  } else {
    const sortKey = String(sort || "").toLowerCase();
    if (sortKey === "priceasc" || sortKey === "price_asc") {
      query = query.order("price", { ascending: true, nullsFirst: false });
    } else if (sortKey === "pricedesc" || sortKey === "price_desc") {
      query = query.order("price", { ascending: false, nullsFirst: false });
    } else if (sortKey === "oldest" || sortKey === "created_asc") {
      query = query.order("created_at", { ascending: true });
    } else if (sortKey === "newest" || sortKey === "recent" || sortKey === "created_desc") {
      query = query.order("created_at", { ascending: false });
    } else {
      query = query.order("name", { ascending: true });
    }
  }

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (trendingOnly) {
    query = query.eq("is_trending", true);
  }

  if (!singleId && !includeInactive) {
    query = query.in("status", CUSTOMER_VISIBLE_STATUS_DB_VALUES);
  }

  return query;
}

async function safeProductSelect({
  categoryId = null,
  singleId = null,
  trendingOnly = false,
  includeInactive = false,
  sort = null,
} = {}) {
  const { data, error } = await runProductQuery(
    true,
    categoryId,
    singleId,
    trendingOnly,
    { includeInactive, sort },
  );

  if (!error) {
    return data;
  }

  const message = String(error.message || "").toLowerCase();
  const relationMissing =
    message.includes("relationship") && message.includes("product_images");

  if (!relationMissing) {
    console.error("[productService] Supabase query failed", {
      error: error.message,
      categoryId,
      singleId,
      trendingOnly,
    });
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  console.warn(
    "[productService] product_images relation missing, using fallback query",
  );
  const fallback = await runProductQuery(
    false,
    categoryId,
    singleId,
    trendingOnly,
    { includeInactive, sort },
  );

  if (fallback.error) {
    console.error("[productService] Supabase fallback query failed", {
      error: fallback.error.message,
    });
    throw new Error(`Failed to fetch products: ${fallback.error.message}`);
  }

  if (singleId) {
    return fallback.data
      ? {
          ...fallback.data,
          product_images: [],
        }
      : null;
  }

  return (fallback.data ?? []).map((row) => ({
    ...row,
    product_images: [],
  }));
}

export async function getProducts(categoryId, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const sort = options.sort ?? null;
  console.log("[productService] Fetching products", {
    categoryId: categoryId ?? null,
    includeInactive,
    sort,
  });
  const data = await safeProductSelect({ categoryId, includeInactive, sort });
  return (data ?? []).map(mapProductRow);
}

export async function getProductsByIds(ids = [], options = {}) {
  const uniqueIds = [...new Set((ids ?? []).map(String).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const includeInactive = Boolean(options.includeInactive);
  const boutiqueEmbed =
    "boutiques!boutique_id(id, name, location, rating, reviews_count, is_verified, verified, image, cover_image_url, logo_url, gallery_images, banner_images, contact_number, whatsapp, phone_number, whatsapp_number, latitude, longitude, full_address, updated_at)";
  const selectClause = `*, categories(id, name), ${boutiqueEmbed}, product_images(id, image_url, is_primary, sort_order)`;

  let query = supabase.from("products").select(selectClause).in("id", uniqueIds);
  if (!includeInactive) {
    query = query.in("status", CUSTOMER_VISIBLE_STATUS_DB_VALUES);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch products by ids: ${error.message}`);
  }

  return (data ?? []).map(mapProductRow);
}

export async function getProductById(id, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  console.log("[productService] Fetching product by id", { id, includeInactive });
  const data = await safeProductSelect({ singleId: id, includeInactive });
  if (!data) {
    return null;
  }
  const mapped = mapProductRow(data);
  if (!includeInactive && !CUSTOMER_VISIBLE_STATUSES.includes(mapped.status)) {
    return null;
  }
  return mapped;
}

export async function getTrendingProducts({ limit = 6 } = {}) {
  console.log("[productService] Fetching scored trending products");
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [candidateRows, wishlistResult, viewsResult] = await Promise.all([
    fetchTrendingCandidateRows({ since, limit: 50 }),
    supabase.from("wishlist_items").select("product_id"),
    supabase.from("product_views").select("product_id"),
  ]);

  let rows = candidateRows;
  if (!rows.length) {
    rows = await fetchTrendingCandidateRows({ since: null, limit: 50 });
  }

  if (wishlistResult.error) {
    console.warn(
      "[productService] wishlist_items unavailable for trending score",
      wishlistResult.error.message,
    );
  }

  const wishlistCounts = buildProductCountMap(wishlistResult.data);
  const viewCounts = viewsResult.error
    ? new Map()
    : buildProductCountMap(viewsResult.data);

  if (viewsResult.error) {
    console.warn(
      "[productService] product_views unavailable, using wishlist-only trending",
      viewsResult.error.message,
    );
  }

  const products = rows.map(mapProductRow);
  const scored = products.map((product) => {
    const wishlists = wishlistCounts.get(product.id) ?? 0;
    const views = viewCounts.get(product.id) ?? 0;
    return {
      product,
      score: views * 1 + wishlists * 3,
    };
  });

  const allScoresZero =
    scored.length === 0 || scored.every((entry) => entry.score === 0);

  const ordered = allScoresZero
    ? products
    : scored
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const aTime = new Date(a.product.created_at ?? 0).getTime();
          const bTime = new Date(b.product.created_at ?? 0).getTime();
          return bTime - aTime;
        })
        .map((entry) => entry.product);

  return ordered.slice(0, limit);
}

const TRENDING_BOUTIQUE_EMBED =
  "boutiques!boutique_id(id, name, location, rating, reviews_count, is_verified, verified, image, cover_image_url, logo_url, gallery_images, banner_images, contact_number, whatsapp, phone_number, whatsapp_number, latitude, longitude, full_address, updated_at)";

function buildProductCountMap(rows, idField = "product_id") {
  const map = new Map();
  for (const row of rows ?? []) {
    const id = row?.[idField];
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

async function fetchTrendingCandidateRows({ since = null, limit = 50 } = {}) {
  const selectWithImages = `*, categories(id, name), ${TRENDING_BOUTIQUE_EMBED}, product_images(id, image_url, is_primary, sort_order)`;
  const selectBare = `*, categories(id, name), ${TRENDING_BOUTIQUE_EMBED}`;

  const run = async (selectClause) => {
    let query = supabase
      .from("products")
      .select(selectClause)
      .in("status", CUSTOMER_VISIBLE_STATUS_DB_VALUES)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (since) {
      query = query.gte("created_at", since);
    }
    return query;
  };

  let { data, error } = await run(selectWithImages);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    const relationMissing =
      message.includes("relationship") &&
      (message.includes("product_images") || message.includes("embed"));
    if (relationMissing) {
      console.warn(
        "[productService] trending candidates without product_images fallback",
      );
      const fallback = await run(selectBare);
      data = (fallback.data ?? []).map((row) => ({ ...row, product_images: [] }));
      error = fallback.error;
    }
  }

  if (error) {
    throw new Error(`Failed to fetch trending candidates: ${error.message}`);
  }

  return data ?? [];
}

function normalizeNullableText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Product price must be a positive number");
  }
  return numeric;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return Boolean(value);
}

function normalizeJsonArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean);
}

function normalizeStatus(value) {
  return normalizeGovernanceStatus(value);
}

const JEWELLER_EDIT_TRACKED_FIELDS = [
  "name",
  "price",
  "description",
  "image",
  "featured_image",
  "thumbnail",
  "primary_image",
  "images",
  "videos",
  "media",
  "video_url",
  "video_thumbnail",
  "available_sizes",
  "available_metals",
  "discount_percentage",
  "specifications",
  "price_breakup",
  "gender",
  "occasion",
  "style",
  "collection_name",
  "status",
];

function stripJewellerOwnedFields(payload) {
  const next = { ...payload };
  for (const field of JEWELLER_OWNED_FIELDS) {
    delete next[field];
  }
  return next;
}

function assertAdminCanUpdateProduct(existingRow, input, { isAdmin = false } = {}) {
  if (!existingRow?.owner_jeweller_id) return;

  if (!isAdmin) {
    throw new Error(
      "Only the owning verified jeweller can edit this product's data.",
    );
  }

  for (const field of JEWELLER_OWNED_FIELDS) {
    if (input[field] !== undefined) {
      throw new Error(
        `Admin cannot edit jeweller-owned field "${field}". Use Flag, Suspend, or Request Correction instead.`,
      );
    }
  }
}

export function buildAdminCurationPayload(input = {}) {
  const payload = {};
  if (input.is_trending !== undefined || input.trending !== undefined) {
    const trending = normalizeBoolean(input.is_trending ?? input.trending, false);
    payload.is_trending = trending;
    payload.trending = trending;
  }
  if (input.category_id !== undefined) {
    payload.category_id = normalizeNullableText(input.category_id);
  }
  if (input.rating !== undefined) {
    payload.rating = normalizeOptionalRating(input.rating) ?? 0;
  }
  if (input.reviews_count !== undefined) {
    payload.reviews_count = normalizeReviewsCountWrite(input.reviews_count);
  }
  payload.updated_at = new Date().toISOString();
  return payload;
}

function toProductWritePayload(input = {}) {
  const trending = normalizeBoolean(input.is_trending ?? input.trending, false);
  const imagePlan = normalizeProductImageRelations(input, []);
  const orderedImages = imagePlan.map((row) => row.image_url);
  const fallbackPrimary =
    normalizeNullableText(input.image) ??
    normalizeNullableText(input.thumbnail);
  const primaryFromPayload =
    normalizeNullableText(input.primary_image) ??
    normalizeNullableText(
      imagePlan.find((item) => item.is_primary)?.image_url ??
        imagePlan[0]?.image_url,
    ) ??
    normalizeNullableText(orderedImages[0]) ??
    fallbackPrimary ??
    normalizeNullableText(input.featured_image);
  const name = normalizeNullableText(input.name);
  if (!name) {
    throw new Error("Product name is required");
  }

  const primaryBoutique =
    normalizeNullableText(input.primary_boutique_id) ??
    normalizeNullableText(input.boutique_id);

  const ratingNormalized = normalizeOptionalRating(input.rating);

  const specsPayload = normalizeSpecificationsPayload(input.specifications);
  const breakupPayload = normalizePriceBreakupWrite(input.price_breakup);

  return {
    name,
    price: normalizePrice(input.price),
    image: primaryFromPayload,
    description: normalizeNullableText(input.description),
    rating: ratingNormalized ?? 0,
    category_id: normalizeNullableText(input.category_id),
    boutique_id: primaryBoutique,
    primary_boutique_id: primaryBoutique,
    available_sizes: normalizeWritableStringArray(input.available_sizes ?? []),
    available_metals: normalizeWritableStringArray(input.available_metals ?? []),
    discount_percentage: normalizeDiscountPctWrite(input.discount_percentage),
    reviews_count: normalizeReviewsCountWrite(input.reviews_count),
    specifications: specsPayload,
    price_breakup: breakupPayload,
    gender: normalizeNullableText(input.gender),
    occasion: normalizeNullableText(input.occasion),
    style: normalizeNullableText(input.style),
    collection_name: normalizeNullableText(input.collection_name),
    is_trending: trending,
    trending,
    status: normalizeStatus(input.status),
    primary_image: primaryFromPayload,
    video_url: normalizeNullableText(input.video_url),
    video_thumbnail: normalizeNullableText(input.video_thumbnail),
    images: orderedImages,
    videos: normalizeJsonArray(input.videos),
    media: normalizeJsonArray(input.media),
    featured_image: normalizeNullableText(input.featured_image),
    thumbnail: primaryFromPayload,
    updated_at: new Date().toISOString(),
  };
}

function toLegacySafePayload(payload, errorMessage = "") {
  const normalized = String(errorMessage).toLowerCase();
  const next = { ...payload };
  if (normalized.includes("column") && normalized.includes("status")) {
    delete next.status;
  }
  if (normalized.includes("column") && normalized.includes("trending")) {
    delete next.trending;
  }
  if (normalized.includes("column") && normalized.includes("updated_at")) {
    delete next.updated_at;
  }
  if (
    normalized.includes("column") &&
    normalized.includes("video_thumbnail")
  ) {
    delete next.video_thumbnail;
  }
  return next;
}

async function syncProductImages(productId, relationRows = []) {
  const rows = [...(relationRows ?? [])].filter((row) => row?.image_url);

  const { error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", productId);
  if (deleteError) {
    throw new Error(`Failed to sync product images: ${deleteError.message}`);
  }

  if (!rows.length) {
    return [];
  }

  const sorted = [...rows].sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );
  const primaryIdx = sorted.findIndex((item) => item.is_primary);
  const effectivePrimary = primaryIdx >= 0 ? primaryIdx : 0;
  const insertPayload = sorted.map((row, index) => ({
    product_id: productId,
    image_url: row.image_url,
    is_primary: index === effectivePrimary,
    sort_order: index,
  }));

  const { data, error } = await supabase
    .from("product_images")
    .insert(insertPayload)
    .select("id, image_url, is_primary, sort_order");

  if (error) {
    throw new Error(`Failed to sync product images: ${error.message}`);
  }

  return mapProductImageRows(data);
}

async function syncProductThumbnail(productId, fallbackThumbnail = null) {
  const { data: rows, error } = await supabase
    .from("product_images")
    .select("image_url, is_primary, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(`Failed to resolve product thumbnail: ${error.message}`);
  }
  const sorted = [...(rows ?? [])].sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );
  const thumbnail =
    sorted.find((item) => item.is_primary)?.image_url ??
    sorted[0]?.image_url ??
    fallbackThumbnail ??
    null;
  const { error: updateError } = await supabase
    .from("products")
    .update({
      thumbnail,
      image: thumbnail,
      primary_image: thumbnail,
      featured_image: thumbnail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);
  if (updateError) {
    throw new Error(`Failed to sync product thumbnail: ${updateError.message}`);
  }
  return thumbnail;
}

export async function updateProductById(id, input = {}, options = {}) {
  const { isAdmin = false, jewellerId = null } = options;

  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load product: ${existingError.message}`);
  }
  if (!existing) return null;

  if (isAdmin && existing.owner_jeweller_id) {
    assertAdminCanUpdateProduct(existing, input, { isAdmin: true });
    const curationPayload = buildAdminCurationPayload(input);
    if (Object.keys(curationPayload).length <= 1) {
      throw new Error(
        "Admin cannot edit jeweller-owned product data. Use Flag, Suspend, or Request Correction.",
      );
    }
    const { data, error } = await supabase
      .from("products")
      .update(curationPayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to update product: ${error.message}`);
    return getProductById(id, { includeInactive: true });
  }

  if (jewellerId) {
    if (existing.owner_jeweller_id && existing.owner_jeweller_id !== jewellerId) {
      throw new Error("You do not own this product");
    }
    return updateProductByJeweller(id, input, { jewellerId, existingRow: existing });
  }

  const payload = toProductWritePayload(input);
  assertAdminCanUpdateProduct(existing, input, { isAdmin });
  let updateResult = await withRetry(() =>
    supabase
      .from("products")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle(),
  );
  if (updateResult.error) {
    const fallbackPayload = toLegacySafePayload(
      payload,
      updateResult.error.message,
    );
    const changed =
      Object.keys(fallbackPayload).length !== Object.keys(payload).length;
    if (changed) {
      updateResult = await withRetry(() =>
        supabase
          .from("products")
          .update(fallbackPayload)
          .eq("id", id)
          .select("*")
          .maybeSingle(),
      );
    }
  }

  const { data, error } = updateResult;
  if (error) {
    throw new Error(`Failed to update product: ${error.message}`);
  }
  if (!data) return null;
  const fallbackPrimary =
    payload.primary_image ??
    payload.image ??
    payload.featured_image ??
    null;
  const relationPlan = normalizeProductImageRelations(
    input,
    fallbackPrimary ? [fallbackPrimary] : [],
  );
  await syncProductImages(data.id, relationPlan);
  await syncProductThumbnail(
    data.id,
    relationPlan.find((row) => row.is_primary)?.image_url ??
      relationPlan[0]?.image_url ??
      null,
  );
  return getProductById(id, { includeInactive: true });
}

export async function updateProductByJeweller(id, input = {}, options = {}) {
  const jewellerId = options.jewellerId;
  const existingRow = options.existingRow;
  if (!jewellerId) throw new Error("Jeweller id is required");

  const existing =
    existingRow ??
    (await supabase.from("products").select("*").eq("id", id).maybeSingle()).data;
  if (!existing) return null;
  if (existing.owner_jeweller_id && existing.owner_jeweller_id !== jewellerId) {
    throw new Error("You do not own this product");
  }

  const payload = toProductWritePayload(input);
  if (existing.status === GOVERNANCE_STATUSES.SUSPENDED) {
    throw new Error("Suspended products cannot be edited. Contact admin for reinstatement.");
  }

  let updateResult = await withRetry(() =>
    supabase
      .from("products")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle(),
  );
  if (updateResult.error) {
    const fallbackPayload = toLegacySafePayload(
      payload,
      updateResult.error.message,
    );
    const changed =
      Object.keys(fallbackPayload).length !== Object.keys(payload).length;
    if (changed) {
      updateResult = await withRetry(() =>
        supabase
          .from("products")
          .update(fallbackPayload)
          .eq("id", id)
          .select("*")
          .maybeSingle(),
      );
    }
  }

  const { data, error } = updateResult;
  if (error) throw new Error(`Failed to update product: ${error.message}`);
  if (!data) return null;

  await recordProductEditHistory({
    productId: id,
    jewellerId,
    previousRow: existing,
    nextPayload: payload,
    trackedFields: JEWELLER_EDIT_TRACKED_FIELDS,
  });

  const fallbackPrimary =
    payload.primary_image ?? payload.image ?? payload.featured_image ?? null;
  const relationPlan = normalizeProductImageRelations(
    input,
    fallbackPrimary ? [fallbackPrimary] : [],
  );
  await syncProductImages(data.id, relationPlan);
  await syncProductThumbnail(
    data.id,
    relationPlan.find((row) => row.is_primary)?.image_url ??
      relationPlan[0]?.image_url ??
      null,
  );

  await tryAutoResolveAfterJewellerEdit(id);
  return getProductById(id, { includeInactive: true });
}

export async function createProduct(input = {}, options = {}) {
  const { jewellerId = null, boutiqueId = null } = options;
  const payload = toProductWritePayload(input);

  if (jewellerId) {
    payload.owner_jeweller_id = jewellerId;
    if (boutiqueId) {
      payload.boutique_id = boutiqueId;
      payload.primary_boutique_id = boutiqueId;
    }
    payload.status = GOVERNANCE_STATUSES.ACTIVE;
  }
  let createResult = await withRetry(() =>
    supabase.from("products").insert(payload).select("*").single(),
  );
  if (createResult.error) {
    const fallbackPayload = toLegacySafePayload(
      payload,
      createResult.error.message,
    );
    const changed =
      Object.keys(fallbackPayload).length !== Object.keys(payload).length;
    if (changed) {
      createResult = await withRetry(() =>
        supabase.from("products").insert(fallbackPayload).select("*").single(),
      );
    }
  }

  const { data, error } = createResult;
  if (error || !data) {
    throw new Error(
      `Failed to create product: ${error?.message ?? "Unknown error"}`,
    );
  }
  const fallbackPrimary =
    payload.primary_image ??
    payload.image ??
    payload.featured_image ??
    null;
  const relationPlan = normalizeProductImageRelations(
    input,
    fallbackPrimary ? [fallbackPrimary] : [],
  );
  await syncProductImages(data.id, relationPlan);
  await syncProductThumbnail(
    data.id,
    relationPlan.find((row) => row.is_primary)?.image_url ??
      relationPlan[0]?.image_url ??
      null,
  );
  return getProductById(data.id, { includeInactive: true });
}

export async function getProductsForJeweller(jewellerId) {
  const { data, error } = await supabase
    .from("products")
    .select(
      "*, categories(id, name), boutiques!boutique_id(id, name), product_images(id, image_url, is_primary, sort_order)",
    )
    .eq("owner_jeweller_id", jewellerId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to fetch jeweller products: ${error.message}`);
  return (data ?? []).map(mapProductRow);
}

export async function getProductWithGovernance(id, { includeInactive = true } = {}) {
  const product = await getProductById(id, { includeInactive });
  if (!product) return null;
  const governance = await getProductGovernanceState(id);
  return { ...product, governance };
}

export async function deleteProductById(id) {
  const { error: relationError } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", id);
  if (relationError) {
    throw new Error(
      `Failed to delete product images: ${relationError.message}`,
    );
  }

  const { data, error } = await withRetry(() =>
    supabase.from("products").delete().eq("id", id).select("id").maybeSingle(),
  );
  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }
  return data;
}
