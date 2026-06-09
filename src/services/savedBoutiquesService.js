import { supabase } from '../config/supabase.js';
import { resolveBoutiqueCoverUrl } from '../utils/boutiqueMedia.js';

export async function saveBoutiqueForUser(userId, boutiqueId) {
  console.log('[savedBoutiquesService] saveBoutiqueForUser', { userId, boutiqueId });

  if (!userId) {
    const error = new Error('user_id is required');
    error.statusCode = 400;
    throw error;
  }
  if (!boutiqueId) {
    const error = new Error('boutique_id is required');
    error.statusCode = 400;
    throw error;
  }

  // First check if this boutique is already saved for the user to avoid duplicates.
  const { data: existing, error: existingError } = await supabase
    .from('saved_boutiques')
    .select('*')
    .eq('user_id', userId)
    .eq('boutique_id', boutiqueId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to lookup existing saved boutique: ${existingError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('saved_boutiques')
    .insert({
      user_id: userId,
      boutique_id: boutiqueId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save boutique: ${error.message}`);
  }

  return data;
}

export async function unsaveBoutiqueForUser(userId, boutiqueId) {
  console.log('[savedBoutiquesService] unsaveBoutiqueForUser', { userId, boutiqueId });

  if (!userId) {
    const error = new Error('user_id is required');
    error.statusCode = 400;
    throw error;
  }
  if (!boutiqueId) {
    const error = new Error('boutique_id is required');
    error.statusCode = 400;
    throw error;
  }

  const { error } = await supabase
    .from('saved_boutiques')
    .delete()
    .eq('user_id', userId)
    .eq('boutique_id', boutiqueId);

  if (error) {
    throw new Error(`Failed to unsave boutique: ${error.message}`);
  }

  return true;
}

export async function getSavedBoutiquesForUser(userId) {
  console.log('[savedBoutiquesService] getSavedBoutiquesForUser', { userId });

  if (!userId) {
    const error = new Error('user_id is required');
    error.statusCode = 400;
    throw error;
  }

  console.log('[savedBoutiquesService] FETCHING SAVED BOUTIQUES');
  const { data, error } = await supabase
    .from('saved_boutiques')
    .select(
      `
      id,
      user_id,
      boutique_id,
      created_at,
      boutiques (*)
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  console.log('[savedBoutiquesService] RAW SAVED DATA:', data);
  console.log('[savedBoutiquesService] FETCH ERROR:', error);

  if (error) {
    throw new Error(`Failed to fetch saved boutiques: ${error.message}`);
  }

  const rows = data ?? [];

  const galleryUrls = (b) => {
    const raw = b.gallery_images ?? b.banner_images ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.map(String).map((s) => s.trim()).filter((s) => s.startsWith('http'));
  };

  return rows
    .map((row) => {
      const boutique = row.boutiques;
      if (!boutique) {
        console.log('[savedBoutiquesService] Missing boutique join for row', {
          saved_id: row.id,
          boutique_id: row.boutique_id,
          user_id: row.user_id,
        });
        return null;
      }
      const rating = Number(boutique.rating ?? 0) || 0;
      const reviews = Math.max(0, Number(boutique.reviews_count ?? 0) || 0);
      const previews = [...galleryUrls(boutique)];
      const hero = resolveBoutiqueCoverUrl(boutique);
      if (hero && !previews.includes(hero)) previews.unshift(hero);

      return {
        id: boutique.id,
        name: boutique.name,
        image: hero ?? previews[0] ?? null,
        rating,
        reviews,
        location: boutique.location ?? '',
        full_address: boutique.full_address ?? boutique.address ?? boutique.location ?? '',
        distanceKm: null,
        latitude: boutique.latitude ?? null,
        longitude: boutique.longitude ?? null,
        phone: boutique.phone_number ?? boutique.phone ?? boutique.contact_number ?? null,
        whatsapp: boutique.whatsapp_number ?? boutique.whatsapp ?? null,
        opening_time: boutique.opening_time ?? null,
        closing_time: boutique.closing_time ?? null,
        working_days: boutique.working_days ?? null,
        tags: ['JEWELLERY'],
        verified: Boolean(boutique.is_verified ?? boutique.verified),
        previewImages: previews.slice(0, 6),
        galleryLayout: 'triple',
        splitUsesHeroImage: true,
        moreItemsCount: 0,
        itineraryPieces: 0,
        savedAt: row.created_at,
      };
    })
    .filter(Boolean);
}

