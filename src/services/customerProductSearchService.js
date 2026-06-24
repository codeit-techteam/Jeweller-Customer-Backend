import { supabase } from "../config/supabase.js";
import { CUSTOMER_VISIBLE_STATUS_DB_VALUES } from "../constants/productGovernance.js";
import { mapProductRow } from "./productService.js";

const BOUTIQUE_EMBED =
  "boutiques!boutique_id(id, name, location, rating, reviews_count, is_verified, verified, image, cover_image_url, logo_url, gallery_images, banner_images, contact_number, whatsapp, phone_number, whatsapp_number, latitude, longitude, full_address, updated_at, store_status, is_active, deleted_at)";

function normalise(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function tokenize(query) {
  return normalise(query)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseIndianPriceAmount(raw, suffix) {
  let amount = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const unit = String(suffix ?? "").toLowerCase();
  if (unit === "k") amount *= 1000;
  else if (["lakh", "lakhs", "lac", "lacs"].includes(unit)) amount *= 100000;
  else if (["cr", "crore", "crores"].includes(unit)) amount *= 10000000;
  return Math.round(amount);
}

export function parseSearchQuery(raw) {
  let textQuery = String(raw ?? "").trim();
  let maxPrice = null;

  const pricePattern =
    /\b(?:under|below|less\s+than|upto|up\s+to)\s*(?:₹|rs\.?\s*|inr\s*)?([\d][\d,]*(?:\.\d+)?)\s*(k|lakh|lakhs|lac|lacs|cr|crore|crores)?\b/gi;

  const matches = [...textQuery.matchAll(pricePattern)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    maxPrice = parseIndianPriceAmount(last[1], last[2]);
    textQuery = textQuery.replace(pricePattern, " ").replace(/\s+/g, " ").trim();
  }

  return { textQuery, maxPrice };
}

function productSearchHaystack(row) {
  const metals = Array.isArray(row.available_metals)
    ? row.available_metals.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const specMetal =
    row.specifications && typeof row.specifications === "object"
      ? String(row.specifications.metal ?? "").trim()
      : "";
  const parts = [
    row.name,
    row.description,
    row.collection_name,
    row.gender,
    row.occasion,
    row.style,
    row.categories?.name,
    row.boutiques?.name,
    metals.join(" "),
    specMetal,
  ];
  return parts
    .map((part) => normalise(part))
    .filter(Boolean)
    .join(" \u0001 ");
}

function isVerifiedActiveBoutique(boutique) {
  if (!boutique) return false;
  if (boutique.deleted_at) return false;
  if (boutique.is_active === false) return false;
  // Require store_status = 'approved' as the minimum bar for search visibility.
  // Products from approved boutiques appear in search regardless of is_verified flag,
  // because approved boutiques are already customer-browsable.
  if (boutique.store_status && boutique.store_status !== "approved") return false;
  // If store_status is approved, treat the boutique as eligible even when is_verified
  // is not yet set (can happen between approval and manual verification step).
  const isApproved = boutique.store_status === "approved";
  const isVerified = Boolean(boutique.is_verified ?? boutique.verified);
  return isApproved || isVerified;
}

function isCustomerVisibleProduct(row) {
  if (!row) return false;
  if (row.is_draft === true) return false;
  const status = String(row.status ?? "").toUpperCase();
  return CUSTOMER_VISIBLE_STATUS_DB_VALUES.some(
    (value) => String(value).toUpperCase() === status,
  );
}

function rankProduct(row, tokens) {
  const haystack = productSearchHaystack(row);
  let score = 0;
  for (const token of tokens) {
    if (row.name && normalise(row.name).startsWith(token)) score += 8;
    else if (row.name && normalise(row.name).includes(token)) score += 5;
    else if (haystack.includes(token)) score += 2;
  }
  return score;
}

export async function searchCustomerProducts({ q, limit = 12 } = {}) {
  const { textQuery, maxPrice } = parseSearchQuery(q);
  const tokens = tokenize(textQuery);
  if (tokens.length === 0 && maxPrice == null) return [];

  const cappedLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);

  let query = supabase
    .from("products")
    .select(
      `*, categories(id, name), ${BOUTIQUE_EMBED}, product_images(id, image_url, is_primary, sort_order)`,
    )
    .in("status", CUSTOMER_VISIBLE_STATUS_DB_VALUES)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (maxPrice != null) {
    query = query.lte("price", maxPrice);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to search products: ${error.message}`);
  }

  const filtered = (data ?? [])
    .filter((row) => isCustomerVisibleProduct(row))
    .filter((row) => isVerifiedActiveBoutique(row.boutiques))
    .filter((row) => {
      if (tokens.length === 0) return true;
      const haystack = productSearchHaystack(row);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => rankProduct(b, tokens) - rankProduct(a, tokens))
    .slice(0, cappedLimit)
    .map(mapProductRow)
    .filter(Boolean);

  return filtered;
}
