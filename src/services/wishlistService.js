import { supabase } from '../config/supabase.js';
import { resolveBoutiqueCoverUrl, resolveBoutiqueLogoUrl } from '../utils/boutiqueMedia.js';

function resolveWishlistPrice(rawPrice, priceBreakup) {
  const base = Number(rawPrice ?? 0) || 0;
  const pb = priceBreakup;
  if (!pb || typeof pb !== 'object') return base;
  const total = Number(pb.total);
  if (Number.isFinite(total) && total > 0) return total;
  const sum =
    (Number(pb.gold) || 0) +
    (Number(pb.gemstone) || 0) +
    (Number(pb.makingCharge ?? pb.making) || 0) +
    (Number(pb.gst) || 0);
  return sum > 0 ? sum : base;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function ensureProfileRow(userId) {
  const { data: existing, error: lookupError } = await supabase
    .from('users_profile')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to validate user profile: ${lookupError.message}`);
  }

  if (existing?.id) return;

  const { error: insertError } = await supabase.from('users_profile').insert({
    id: userId,
    full_name: 'Guest',
    email: null,
    phone: null,
    profile_image: null,
  });

  if (insertError) {
    throw new Error(`Failed to create user profile: ${insertError.message}`);
  }
}

async function ensureProfileRowFromSession(userId, authUser) {
  const { data: existing, error: lookupError } = await supabase
    .from('users_profile')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to validate user profile: ${lookupError.message}`);
  }

  if (existing?.id) {
    console.log('PROFILE FOUND:', userId);
    return;
  }

  const fullName =
    authUser?.user_metadata?.full_name ??
    authUser?.user_metadata?.name ??
    'Guest';
  const phone =
    typeof authUser?.phone === 'string' && authUser.phone.trim()
      ? authUser.phone.replace(/\D/g, '').slice(-10)
      : null;

  const { error: insertError } = await supabase.from('users_profile').insert({
    id: userId,
    full_name: fullName,
    email: authUser?.email ?? null,
    phone,
    profile_image: null,
  });

  if (insertError) {
    throw new Error(`Failed to create user profile: ${insertError.message}`);
  }
  console.log('PROFILE CREATED:', userId);
}

export async function getWishlistForUser(userId) {
  if (!userId) throw badRequest('user_id is required');

  // Step 1: Fetch wishlist rows for the user (plain table, no joins that can fail)
  const { data: wishlistRows, error: wishlistError } = await supabase
    .from('wishlist_items')
    .select('id, user_id, product_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (wishlistError) {
    throw new Error(`Failed to fetch wishlist: ${wishlistError.message}`);
  }

  if (!wishlistRows?.length) {
    console.log('[wishlistService] No wishlist items found for user', userId);
    return [];
  }

  console.log('[wishlistService] Wishlist rows found:', wishlistRows.length);

  // Step 2: Fetch products separately to avoid nested PostgREST join ambiguity.
  // products table has two FKs to boutiques (boutique_id, primary_boutique_id).
  // Using boutiques!boutique_id to explicitly pick the correct FK.
  const productIds = wishlistRows.map((w) => w.product_id);
  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select(
      `id, name, price, price_breakup, image,
       boutique_data:boutiques!boutique_id (
         id, name, rating, is_verified, verified,
         logo_url, image, cover_image_url,
         gallery_images, banner_images, updated_at
       )`,
    )
    .in('id', productIds);

  if (productsError) {
    console.error('[wishlistService] products fetch error:', productsError.message);
    throw new Error(`Failed to fetch wishlist products: ${productsError.message}`);
  }

  console.log('[wishlistService] Products fetched:', productRows?.length ?? 0, 'for', productIds.length, 'wishlist items');

  // Step 3: Merge wishlist rows with product data
  const productsMap = new Map((productRows ?? []).map((p) => [p.id, p]));

  return wishlistRows.map((row) => {
    const product = productsMap.get(row.product_id);
    if (!product) {
      console.warn('[wishlistService] product not found for wishlist item', {
        wishlistItemId: row.id,
        productId: row.product_id,
      });
      return { id: row.id, user_id: row.user_id, product_id: row.product_id, created_at: row.created_at, product: null };
    }
    const boutiqueRaw = product.boutique_data ?? null;
    return {
      id: row.id,
      user_id: row.user_id,
      product_id: row.product_id,
      created_at: row.created_at,
      product: {
        id: product.id,
        name: product.name,
        price: resolveWishlistPrice(product.price, product.price_breakup),
        image: product.image,
        boutique: boutiqueRaw
          ? {
              id: boutiqueRaw.id,
              name: boutiqueRaw.name,
              rating: boutiqueRaw.rating != null ? Number(boutiqueRaw.rating) : null,
              verified: Boolean(boutiqueRaw.is_verified ?? boutiqueRaw.verified ?? false),
              image: resolveBoutiqueCoverUrl(boutiqueRaw),
              logo: resolveBoutiqueLogoUrl(boutiqueRaw),
            }
          : null,
      },
    };
  });
}

export async function addWishlistItem(userId, productId, authUser = null) {
  if (!userId) throw badRequest('user_id is required');
  if (!productId) throw badRequest('product_id is required');

  await ensureProfileRowFromSession(userId, authUser);

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .maybeSingle();

  if (productError) {
    throw new Error(`Failed to validate product: ${productError.message}`);
  }
  if (!product?.id) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  const { data: existing, error: existingError } = await supabase
    .from('wishlist_items')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to lookup wishlist item: ${existingError.message}`);
  }
  if (existing?.id) {
    return { ...existing, alreadyExists: true };
  }

  const insertWishlist = () =>
    supabase
      .from('wishlist_items')
      .insert({ user_id: userId, product_id: productId })
      .select('*')
      .single();

  let { data, error } = await insertWishlist();

  if (error) {
    if (error.code === '23505') {
      const duplicateError = new Error('Product already saved in wishlist');
      duplicateError.statusCode = 409;
      throw duplicateError;
    }
    if (error.code === '23503') {
      await ensureProfileRow(userId);
      const retry = await insertWishlist();
      data = retry.data;
      error = retry.error;
      if (!error && data) {
        return data;
      }
      const fkError = new Error(`Wishlist FK validation failed: ${error?.message ?? 'unknown'}`);
      fkError.statusCode = 400;
      throw fkError;
    }
    throw new Error(`Failed to save wishlist item: ${error.message}`);
  }

  return data;
}

export async function removeWishlistItem(userId, productId) {
  if (!userId) throw badRequest('user_id is required');
  if (!productId) throw badRequest('product_id is required');

  const { error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);

  if (error) {
    throw new Error(`Failed to remove wishlist item: ${error.message}`);
  }

  return true;
}

export async function getWishlistCount(userId) {
  if (!userId) throw badRequest('user_id is required');

  // Fetch wishlist item IDs first, then count only those whose product still exists.
  // This keeps the badge count in sync with what the listing endpoint can display.
  const { data: wishlistRows, error: wishlistError } = await supabase
    .from('wishlist_items')
    .select('product_id')
    .eq('user_id', userId);

  if (wishlistError) {
    throw new Error(`Failed to fetch wishlist count: ${wishlistError.message}`);
  }

  if (!wishlistRows?.length) return 0;

  const productIds = wishlistRows.map((r) => r.product_id);

  // Count how many of those products actually exist in the products table
  const { count, error: productsError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .in('id', productIds);

  if (productsError) {
    // Fall back to the raw wishlist row count to avoid surfacing an error to the user
    console.warn('[wishlistService] product count validation failed, using raw count:', productsError.message);
    return wishlistRows.length;
  }

  return count ?? 0;
}
