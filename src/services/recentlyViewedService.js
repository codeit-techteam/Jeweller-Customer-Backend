import { supabase } from '../config/supabase.js';

export async function addRecentlyViewed(payload) {
  console.log('[recentlyViewedService] Creating recently viewed item', {
    user_id: payload?.user_id ?? null,
    product_id: payload?.product_id ?? null,
    boutique_id: payload?.boutique_id ?? null,
  });
  const { user_id: userId, product_id: productId = null, boutique_id: boutiqueId = null } = payload;

  if (!userId) {
    const error = new Error('user_id is required');
    error.statusCode = 400;
    throw error;
  }

  if (!productId && !boutiqueId) {
    const error = new Error('Either product_id or boutique_id is required');
    error.statusCode = 400;
    throw error;
  }

  // Upsert-style behaviour: avoid duplicates for the same user/product/boutique
  const { data: existing, error: existingError } = await supabase
    .from('recently_viewed')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .eq('boutique_id', boutiqueId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to lookup existing recently viewed item: ${existingError.message}`);
  }

  const now = new Date().toISOString();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('recently_viewed')
      .update({
        viewed_at: now,
        // keep latest association in case either side was null earlier
        product_id: productId,
        boutique_id: boutiqueId,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update recently viewed item: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from('recently_viewed')
    .insert({
      user_id: userId,
      product_id: productId,
      boutique_id: boutiqueId,
      viewed_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert recently viewed item: ${error.message}`);
  }

  return data;
}

export async function getRecentlyViewed(userId) {
  console.log('[recentlyViewedService] Fetching recently viewed items', { userId });
  const { data, error } = await supabase
    .from('recently_viewed')
    .select(
      `
      id,
      user_id,
      viewed_at,
      product_id,
      boutique_id,
      products(id, name, price, image, category_id, boutique_id),
      boutiques(
        id,
        name,
        location,
        rating,
        image,
        logo_url,
        full_address,
        latitude,
        longitude,
        opening_time,
        closing_time,
        working_days,
        opening_hours,
        phone_number,
        whatsapp_number,
        contact_number,
        whatsapp,
        reviews_count,
        is_verified,
        verified,
        gallery_images,
        banner_images
      )
    `,
    )
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to fetch recently viewed items: ${error.message}`);
  }

  return data ?? [];
}

export async function clearRecentlyViewedForUser(userId) {
  console.log('[recentlyViewedService] Clearing recently viewed items', { userId });
  if (!userId) {
    const error = new Error('user_id is required');
    error.statusCode = 400;
    throw error;
  }

  const { error } = await supabase
    .from('recently_viewed')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to clear recently viewed items: ${error.message}`);
  }

  return true;
}
