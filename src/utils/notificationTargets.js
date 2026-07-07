/**
 * Marketplace notification targets — shared helpers for turning an admin's
 * "Notification Target" selection (Product / Collection / Boutique /
 * Category / External URL) into:
 *
 *  1. A human-readable `deepLink` path stored on the notification row and
 *     shown in the Admin Panel (e.g. `/products/:productId`).
 *  2. The concrete Expo Router `route` + `routeParams` used by the Customer
 *     App to navigate directly to the right screen (`resolveNotificationRoute`
 *     on the client mirrors this).
 *  3. A banner image automatically pulled from the target entity when the
 *     admin hasn't uploaded a custom one.
 *
 * Kept framework-agnostic (plain functions + supabase lookups) so both the
 * Smart Engagement rule service and the manual-send service can share it.
 */
import { supabase } from '../config/supabase.js';

export const TARGET_TYPES = ['none', 'product', 'collection', 'boutique', 'category', 'url'];
const TARGET_TYPE_SET = new Set(TARGET_TYPES);

export function isValidTargetType(value) {
  return TARGET_TYPE_SET.has(value);
}

/**
 * Human-readable deep link path stored on the notification for display /
 * analytics / universal-link handling. Admin never types this manually.
 */
export function buildDeepLink(targetType, targetId) {
  if (!targetId) return null;
  switch (targetType) {
    case 'product':
      return `/products/${targetId}`;
    case 'collection':
      return `/collections/${targetId}`;
    case 'boutique':
      return `/boutiques/${targetId}`;
    case 'category':
      return `/category/${targetId}`;
    case 'url':
      return targetId;
    default:
      return null;
  }
}

function normalizeCategoryToken(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Resolves the concrete Expo Router destination for a target. Returns
 * `{ route, routeParams }` for in-app screens, or `{ externalUrl }` for
 * `url` targets (opened via an in-app browser on the client).
 */
export async function resolveTargetRoute(targetType, targetId) {
  if (!targetType || targetType === 'none' || !targetId) return null;

  switch (targetType) {
    case 'product':
      return { route: '/(app)/product-details', routeParams: { id: String(targetId) } };

    case 'boutique':
      return { route: '/(app)/boutique-profile', routeParams: { id: String(targetId) } };

    case 'collection': {
      const { data } = await supabase
        .from('collections')
        .select('slug')
        .eq('id', targetId)
        .maybeSingle();
      const slug = data?.slug ?? String(targetId);
      return { route: '/(app)/collection/[slug]', routeParams: { slug } };
    }

    case 'category': {
      const { data } = await supabase
        .from('categories')
        .select('name')
        .eq('id', targetId)
        .maybeSingle();
      const category = normalizeCategoryToken(data?.name ?? targetId);
      return { route: '/(app)/category-products', routeParams: { category } };
    }

    case 'url':
      return { route: null, externalUrl: String(targetId) };

    default:
      return null;
  }
}

/**
 * Automatically fetches a banner image for the selected target so the admin
 * doesn't have to manually re-upload the product photo / collection banner.
 * Returns null when there is nothing to fetch (boutique/category/url or
 * missing target), letting the caller fall back to a manually uploaded image.
 */
export async function fetchTargetBannerImage(targetType, targetId) {
  if (!targetId) return null;

  switch (targetType) {
    case 'product': {
      const { data } = await supabase
        .from('products')
        .select('image, featured_image, primary_image, thumbnail')
        .eq('id', targetId)
        .maybeSingle();
      return data?.image ?? data?.featured_image ?? data?.primary_image ?? data?.thumbnail ?? null;
    }

    case 'collection': {
      const { data } = await supabase
        .from('collections')
        .select('banner_image, image')
        .eq('id', targetId)
        .maybeSingle();
      return data?.banner_image ?? data?.image ?? null;
    }

    case 'boutique': {
      const { data } = await supabase
        .from('boutiques')
        .select('cover_image_url, primary_image, image')
        .eq('id', targetId)
        .maybeSingle();
      return data?.cover_image_url ?? data?.primary_image ?? data?.image ?? null;
    }

    case 'category': {
      const { data } = await supabase
        .from('categories')
        .select('image, category_image_url')
        .eq('id', targetId)
        .maybeSingle();
      return data?.image ?? data?.category_image_url ?? null;
    }

    default:
      return null;
  }
}

/**
 * Maps a target type to the legacy `notifications.action_type` /
 * `action_id` enum so old app builds (that only understand `action_type`)
 * keep navigating correctly.
 */
export function targetToLegacyAction(targetType, targetId) {
  switch (targetType) {
    case 'product':
      return { actionType: 'url', actionId: targetId ? String(targetId) : null };
    case 'collection':
      return { actionType: 'collection', actionId: targetId ? String(targetId) : null };
    case 'boutique':
      return { actionType: 'boutique', actionId: targetId ? String(targetId) : null };
    case 'category':
      return { actionType: 'url', actionId: targetId ? String(targetId) : null };
    case 'url':
      return { actionType: 'url', actionId: null };
    default:
      return { actionType: 'none', actionId: null };
  }
}
