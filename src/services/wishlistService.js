import { supabase } from '../config/supabase.js';
import { resolveBoutiqueCoverUrl, resolveBoutiqueLogoUrl } from '../utils/boutiqueMedia.js';

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

  const { data, error } = await supabase
    .from('wishlist_items')
    .select(
      `
      id,
      user_id,
      product_id,
      created_at,
      products (
        id,
        name,
        price,
        image,
        boutique: boutiques!boutique_id (
          id,
          name,
          rating,
          is_verified,
          verified,
          logo_url,
          image,
          cover_image_url,
          gallery_images,
          banner_images,
          updated_at
        )
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch wishlist: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    product_id: row.product_id,
    created_at: row.created_at,
    product: row.products
      ? {
          id: row.products.id,
          name: row.products.name,
          price: Number(row.products.price),
          image: row.products.image,
          boutique: row.products.boutique
            ? {
                id: row.products.boutique.id,
                name: row.products.boutique.name,
                rating:
                  row.products.boutique.rating != null
                    ? Number(row.products.boutique.rating)
                    : null,
                verified: Boolean(
                  row.products.boutique.is_verified ??
                    row.products.boutique.verified ??
                    false,
                ),
                image: resolveBoutiqueCoverUrl(row.products.boutique),
                logo: resolveBoutiqueLogoUrl(row.products.boutique),
              }
            : null,
        }
      : null,
  }));
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

  const { count, error } = await supabase
    .from('wishlist_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch wishlist count: ${error.message}`);
  }

  return count ?? 0;
}
