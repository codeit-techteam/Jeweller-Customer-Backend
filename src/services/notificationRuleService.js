/**
 * Smart Engagement Notifications — rule engine service.
 *
 * Stores admin-managed proactive notification templates ("rules") in
 * `notification_rules` and reuses the existing notification delivery
 * pipeline (`dispatchCampaign` in notificationEngine.js — DB insert +
 * Supabase Realtime + Expo push) to actually send them. Does not modify
 * any existing notification table or delivery logic.
 */
import { supabase } from '../config/supabase.js';
import { normalizeNullableText, normalizeRequiredText, normalizeBoolean } from './_cmsHelpers.js';
import { dispatchCampaign } from './notificationEngine.js';
import {
  buildDeepLink,
  fetchTargetBannerImage,
  isValidTargetType,
  resolveTargetRoute,
  targetToLegacyAction,
} from '../utils/notificationTargets.js';

const TABLE = 'notification_rules';

export const RULE_TYPES = [
  'new_product',
  'price_drop',
  'new_collection',
  'nearby_boutique',
  'trending_product',
  'festival_campaign',
  'wishlist_reminder',
  'appointment_reminder',
  'recently_viewed_reminder',
  'boutique_recommendation',
];
const RULE_TYPE_SET = new Set(RULE_TYPES);

export const PRIORITIES = ['low', 'medium', 'high'];
const PRIORITY_SET = new Set(PRIORITIES);

export const AUDIENCE_MODES = [
  'all',
  'selected',
  'city',
  'boutique_followers',
  'wishlist_users',
  'category_interested',
  'keyword_interested',
];
const AUDIENCE_MODE_SET = new Set(AUDIENCE_MODES);

// Maps rule type -> the `notifications.type` / `notifications.action_type`
// enums already enforced by the existing notifications table.
const NOTIFICATION_TYPE_BY_RULE_TYPE = {
  new_product: 'promotion',
  price_drop: 'offer',
  new_collection: 'collection',
  nearby_boutique: 'system',
  trending_product: 'promotion',
  festival_campaign: 'promotion',
  wishlist_reminder: 'system',
  appointment_reminder: 'appointment',
  recently_viewed_reminder: 'system',
  boutique_recommendation: 'system',
};

const ACTION_TYPE_BY_RULE_TYPE = {
  new_product: 'url',
  price_drop: 'offer',
  new_collection: 'collection',
  nearby_boutique: 'boutique',
  trending_product: 'url',
  festival_campaign: 'url',
  wishlist_reminder: 'url',
  appointment_reminder: 'appointment',
  recently_viewed_reminder: 'url',
  boutique_recommendation: 'boutique',
};

// Sample data used to render a preview when the admin hasn't supplied
// live context (e.g. previewing before any real trigger has fired).
const SAMPLE_VARIABLES_BY_RULE_TYPE = {
  new_product: { productName: 'Diamond Ring', boutiqueName: 'Royal Jewellers', productId: 'sample-product-id' },
  price_drop: { productName: 'Diamond Ring', discountPercent: '12', productId: 'sample-product-id' },
  new_collection: { collectionName: 'Wedding Collection', collectionSlug: 'wedding-collection' },
  nearby_boutique: { boutiqueName: 'New Boutique', boutiqueId: 'sample-boutique-id' },
  trending_product: { productName: 'Antique Earrings', productId: 'sample-product-id' },
  festival_campaign: { campaignTitle: 'Diwali Collection is Live', campaignMessage: 'Flat Offers Available.' },
  wishlist_reminder: { productName: 'Diamond Ring' },
  appointment_reminder: { boutiqueName: 'Tanishq', appointmentId: 'sample-appointment-id' },
  recently_viewed_reminder: { productName: 'Diamond Necklace', productId: 'sample-product-id' },
  boutique_recommendation: { boutiqueName: 'Royal Jewellers', categoryName: 'Rings', boutiqueId: 'sample-boutique-id' },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// notifications.created_by is a uuid column; req.adminId can be a non-uuid
// string (e.g. the 'platform-admin' fallback), so only forward it when valid.
function toUuidOrNull(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function normalizeTargetAudience(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const mode = AUDIENCE_MODE_SET.has(raw.mode) ? raw.mode : 'all';
  const audience = { mode };

  if (mode === 'selected') {
    audience.selectedUserIds = Array.isArray(raw.selectedUserIds)
      ? raw.selectedUserIds.filter(Boolean)
      : [];
  } else if (mode === 'city') {
    audience.city = normalizeNullableText(raw.city);
  } else if (mode === 'boutique_followers') {
    audience.boutiqueId = normalizeNullableText(raw.boutiqueId);
  } else if (mode === 'wishlist_users') {
    audience.productId = normalizeNullableText(raw.productId);
    audience.categoryId = normalizeNullableText(raw.categoryId);
  } else if (mode === 'category_interested') {
    audience.categoryId = normalizeNullableText(raw.categoryId);
  } else if (mode === 'keyword_interested') {
    audience.keyword = normalizeNullableText(raw.keyword);
  }

  return audience;
}

function normalizeTemplate(input) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    title: normalizeNullableText(raw.title) ?? '',
    message: normalizeNullableText(raw.message) ?? '',
    image: normalizeNullableText(raw.image),
  };
}

/**
 * Normalizes the admin's "Notification Target" selection (Product /
 * Collection / Boutique / Category / External URL — only one selectable)
 * into `{ targetType, targetId }`. `targetId` holds the raw URL string when
 * `targetType` is `url`.
 */
function normalizeTarget(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const targetType = isValidTargetType(raw.targetType) ? raw.targetType : 'none';
  if (targetType === 'none') return { targetType: 'none', targetId: null };
  const targetId = normalizeNullableText(raw.targetId);
  if (!targetId) return { targetType: 'none', targetId: null };
  return { targetType, targetId };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    trigger: row.trigger_event,
    enabled: row.enabled,
    targetAudience: row.target_audience ?? { mode: 'all' },
    template: row.template ?? { title: '', message: '' },
    ctaText: row.cta_text,
    ctaLink: row.cta_link,
    priority: row.priority,
    targetType: row.target_type ?? 'none',
    targetId: row.target_id ?? null,
    deepLink: row.deep_link ?? null,
    thumbnail: row.thumbnail ?? null,
    notificationStyle: row.notification_style ?? 'default',
    bannerColor: row.banner_color ?? null,
    createdBy: row.created_by,
    lastSentAt: row.last_sent_at,
    totalSentCount: row.total_sent_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listNotificationRules({ limit = 20, offset = 0, type = null, enabled = null } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pageOffset = Math.max(Number(offset) || 0, 0);

  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(pageOffset, pageOffset + pageSize - 1);

  if (type) {
    if (!RULE_TYPE_SET.has(type)) throw badRequest('Invalid rule type filter');
    query = query.eq('type', type);
  }
  if (enabled !== null && enabled !== undefined) {
    query = query.eq('enabled', enabled);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list notification rules: ${error.message}`);

  return { rows: (data ?? []).map(mapRow), total: count ?? 0 };
}

export async function getNotificationRuleById(id) {
  const ruleId = normalizeNullableText(id);
  if (!ruleId) throw badRequest('Rule id is required');

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', ruleId).maybeSingle();
  if (error) throw new Error(`Failed to load notification rule: ${error.message}`);
  if (!data) throw notFound('Notification rule not found');

  return mapRow(data);
}

export async function createNotificationRule(payload, adminId) {
  const title = normalizeRequiredText(payload?.title, 'title');
  const type = payload?.type;
  if (!RULE_TYPE_SET.has(type)) throw badRequest('Invalid notification rule type');

  const priority = PRIORITY_SET.has(payload?.priority) ? payload.priority : 'medium';
  const triggerEvent = normalizeNullableText(payload?.trigger) ?? `${type}.manual`;
  const { targetType, targetId } = normalizeTarget(payload);
  const deepLink = buildDeepLink(targetType, targetId);

  const template = normalizeTemplate(payload?.template);
  if (!template.image && targetType !== 'none' && targetType !== 'url') {
    // "Automatically fetch the selected Product image / Collection banner"
    // when the admin didn't upload a custom banner.
    template.image = (await fetchTargetBannerImage(targetType, targetId)) ?? null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      title,
      description: normalizeNullableText(payload?.description),
      type,
      trigger_event: triggerEvent,
      enabled: normalizeBoolean(payload?.enabled, true),
      target_audience: normalizeTargetAudience(payload?.targetAudience),
      template,
      cta_text: normalizeNullableText(payload?.ctaText),
      cta_link: deepLink ?? normalizeNullableText(payload?.ctaLink),
      priority,
      target_type: targetType,
      target_id: targetId,
      deep_link: deepLink,
      thumbnail: template.image ?? null,
      notification_style: normalizeNullableText(payload?.notificationStyle) ?? 'default',
      banner_color: normalizeNullableText(payload?.bannerColor),
      created_by: normalizeNullableText(adminId),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create notification rule: ${error.message}`);
  return mapRow(data);
}

export async function updateNotificationRule(id, patch) {
  const ruleId = normalizeNullableText(id);
  if (!ruleId) throw badRequest('Rule id is required');

  const updates = {};
  if ('title' in (patch ?? {})) updates.title = normalizeRequiredText(patch.title, 'title');
  if ('description' in (patch ?? {})) updates.description = normalizeNullableText(patch.description);
  if ('trigger' in (patch ?? {})) updates.trigger_event = normalizeNullableText(patch.trigger);
  if ('enabled' in (patch ?? {})) updates.enabled = normalizeBoolean(patch.enabled, true);
  if ('targetAudience' in (patch ?? {})) updates.target_audience = normalizeTargetAudience(patch.targetAudience);
  if ('template' in (patch ?? {})) {
    updates.template = normalizeTemplate(patch.template);
    if (updates.template.image) updates.thumbnail = updates.template.image;
  }
  if ('ctaText' in (patch ?? {})) updates.cta_text = normalizeNullableText(patch.ctaText);
  if ('ctaLink' in (patch ?? {})) updates.cta_link = normalizeNullableText(patch.ctaLink);
  if ('priority' in (patch ?? {})) {
    if (!PRIORITY_SET.has(patch.priority)) throw badRequest('Invalid priority');
    updates.priority = patch.priority;
  }
  if ('notificationStyle' in (patch ?? {})) {
    updates.notification_style = normalizeNullableText(patch.notificationStyle) ?? 'default';
  }
  if ('bannerColor' in (patch ?? {})) {
    updates.banner_color = normalizeNullableText(patch.bannerColor);
  }

  if ('targetType' in (patch ?? {}) || 'targetId' in (patch ?? {})) {
    const { targetType, targetId } = normalizeTarget(patch);
    const deepLink = buildDeepLink(targetType, targetId);
    updates.target_type = targetType;
    updates.target_id = targetId;
    updates.deep_link = deepLink;
    // Deep link is auto-generated — it always takes over ctaLink for a
    // concrete target so the admin never has to type it manually.
    if (deepLink) updates.cta_link = deepLink;

    const templateForImage = updates.template ?? (await getNotificationRuleById(ruleId)).template;
    if (!templateForImage?.image && targetType !== 'none' && targetType !== 'url') {
      const fetchedImage = await fetchTargetBannerImage(targetType, targetId);
      if (fetchedImage) {
        updates.template = { ...templateForImage, image: fetchedImage };
        updates.thumbnail = fetchedImage;
      }
    } else if (templateForImage?.image) {
      updates.thumbnail = templateForImage.image;
    }
  }

  if (Object.keys(updates).length === 0) {
    return getNotificationRuleById(ruleId);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', ruleId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to update notification rule: ${error.message}`);
  if (!data) throw notFound('Notification rule not found');

  return mapRow(data);
}

async function getAllUserIds() {
  const { data, error } = await supabase.from('users_profile').select('id');
  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  return (data ?? []).map((row) => row.id).filter(Boolean);
}

async function resolveCategoryInterestedUserIds(categoryId) {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id')
    .eq('category_id', categoryId);
  if (productsError) throw new Error(`Failed to resolve category products: ${productsError.message}`);

  const productIds = (products ?? []).map((row) => row.id);
  if (!productIds.length) return [];

  const [wishlistResult, viewedResult] = await Promise.all([
    supabase.from('wishlist_items').select('user_id').in('product_id', productIds),
    supabase.from('recently_viewed').select('user_id').in('product_id', productIds),
  ]);

  if (wishlistResult.error) throw new Error(`Failed to resolve wishlist interest: ${wishlistResult.error.message}`);
  if (viewedResult.error) throw new Error(`Failed to resolve view interest: ${viewedResult.error.message}`);

  const ids = new Set();
  for (const row of wishlistResult.data ?? []) if (row.user_id) ids.add(row.user_id);
  for (const row of viewedResult.data ?? []) if (row.user_id) ids.add(row.user_id);
  return [...ids];
}

/**
 * Resolves a target-audience config into a concrete list of user ids.
 * Supports: all, selected, city, boutique_followers, wishlist_users,
 * category_interested, keyword_interested.
 */
export async function resolveRuleAudienceUserIds(targetAudience) {
  const audience = normalizeTargetAudience(targetAudience);

  switch (audience.mode) {
    case 'selected':
      return [...new Set(audience.selectedUserIds ?? [])];

    case 'city': {
      if (!audience.city) return [];
      const { data, error } = await supabase
        .from('users_profile')
        .select('id')
        .ilike('city', audience.city);
      if (error) throw new Error(`Failed to resolve city audience: ${error.message}`);
      return (data ?? []).map((row) => row.id).filter(Boolean);
    }

    case 'boutique_followers': {
      if (!audience.boutiqueId) return [];
      const { data, error } = await supabase
        .from('saved_boutiques')
        .select('user_id')
        .eq('boutique_id', audience.boutiqueId);
      if (error) throw new Error(`Failed to resolve boutique followers: ${error.message}`);
      return [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
    }

    case 'wishlist_users': {
      if (audience.productId) {
        const { data, error } = await supabase
          .from('wishlist_items')
          .select('user_id')
          .eq('product_id', audience.productId);
        if (error) throw new Error(`Failed to resolve wishlist audience: ${error.message}`);
        return [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
      }
      if (audience.categoryId) {
        return resolveCategoryInterestedUserIds(audience.categoryId);
      }
      const { data, error } = await supabase.from('wishlist_items').select('user_id');
      if (error) throw new Error(`Failed to resolve wishlist audience: ${error.message}`);
      return [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
    }

    case 'category_interested':
      if (!audience.categoryId) return [];
      return resolveCategoryInterestedUserIds(audience.categoryId);

    case 'keyword_interested': {
      if (!audience.keyword) return [];
      const { data, error } = await supabase
        .from('search_history')
        .select('user_id')
        .ilike('keyword', `%${audience.keyword}%`);
      if (error) throw new Error(`Failed to resolve keyword audience: ${error.message}`);
      return [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
    }

    case 'all':
    default:
      return getAllUserIds();
  }
}

export function renderTemplate(text, variables = {}) {
  if (!text) return '';
  return String(text).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function buildAudienceSummary(audience) {
  switch (audience.mode) {
    case 'all':
      return 'All Customers';
    case 'selected':
      return `${(audience.selectedUserIds ?? []).length} selected customer(s)`;
    case 'city':
      return audience.city ? `City: ${audience.city}` : 'City: (not set)';
    case 'boutique_followers':
      return 'Boutique Followers';
    case 'wishlist_users':
      return 'Wishlist Users';
    case 'category_interested':
      return 'Category Interested Users';
    case 'keyword_interested':
      return audience.keyword ? `Keyword: "${audience.keyword}"` : 'Keyword Interested Users';
    default:
      return 'All Customers';
  }
}

/**
 * Renders a rule's copy + resolves the estimated recipient count without
 * writing anything. Used by the admin Preview modal.
 */
export async function previewNotificationRule(ruleId, overrides = {}) {
  const rule = await getNotificationRuleById(ruleId);
  const variables = { ...(SAMPLE_VARIABLES_BY_RULE_TYPE[rule.type] ?? {}), ...(overrides.variables ?? {}) };
  const targetAudience = overrides.targetAudience
    ? normalizeTargetAudience(overrides.targetAudience)
    : normalizeTargetAudience(rule.targetAudience);

  const userIds = await resolveRuleAudienceUserIds(targetAudience);

  return {
    ruleId: rule.id,
    type: rule.type,
    title: renderTemplate(rule.template?.title, variables),
    message: renderTemplate(rule.template?.message, variables),
    image: rule.template?.image ?? null,
    thumbnail: rule.thumbnail ?? rule.template?.image ?? null,
    ctaText: rule.ctaText,
    ctaLink: renderTemplate(rule.ctaLink, variables),
    targetType: rule.targetType ?? 'none',
    targetId: rule.targetId ?? null,
    deepLink: rule.deepLink ?? null,
    notificationStyle: rule.notificationStyle ?? 'default',
    bannerColor: rule.bannerColor ?? null,
    priority: rule.priority,
    targetAudience,
    targetAudienceSummary: buildAudienceSummary(targetAudience),
    estimatedRecipients: userIds.length,
  };
}

/**
 * Sends a rule's notification right now to its resolved audience, reusing
 * the existing dispatchCampaign pipeline (DB insert + realtime + push).
 */
export async function sendNotificationRuleNow(ruleId, overrides = {}, adminId) {
  const rule = await getNotificationRuleById(ruleId);
  if (!rule.enabled) throw badRequest('Cannot send a disabled notification rule');

  const variables = { ...(SAMPLE_VARIABLES_BY_RULE_TYPE[rule.type] ?? {}), ...(overrides.variables ?? {}) };
  const targetAudience = overrides.targetAudience
    ? normalizeTargetAudience(overrides.targetAudience)
    : normalizeTargetAudience(rule.targetAudience);

  const userIds = await resolveRuleAudienceUserIds(targetAudience);
  if (!userIds.length) throw badRequest('No recipients matched the target audience');

  const title = renderTemplate(rule.template?.title, variables);
  const message = renderTemplate(rule.template?.message, variables);
  const ctaLink = renderTemplate(rule.ctaLink, variables);

  const targetType = rule.targetType ?? 'none';
  const targetId = targetType !== 'none' ? rule.targetId : null;
  const { actionType, actionId } = targetToLegacyAction(targetType, targetId);
  // A concrete target (e.g. admin picked "Antique Earrings") means the app
  // should open that exact screen — no home screen in between. Rules without
  // a concrete target (event-driven, e.g. "New Product Launch" fired for
  // whichever product triggered it) fall back to the legacy templated
  // `route`/`ctaLink` behaviour.
  const targetRoute = targetType !== 'none' ? await resolveTargetRoute(targetType, targetId) : null;

  const result = await dispatchCampaign({
    title,
    message,
    type: NOTIFICATION_TYPE_BY_RULE_TYPE[rule.type] ?? 'system',
    imageUrl: rule.template?.image ?? null,
    thumbnail: rule.thumbnail ?? rule.template?.image ?? null,
    actionType: targetType !== 'none' ? actionType : (ACTION_TYPE_BY_RULE_TYPE[rule.type] ?? 'none'),
    actionId: targetType !== 'none' ? actionId : null,
    targetType,
    targetId,
    deepLink: targetType !== 'none' ? rule.deepLink : null,
    ctaText: rule.ctaText,
    notificationStyle: rule.notificationStyle,
    bannerColor: rule.bannerColor,
    priority: rule.priority,
    audience: 'selected',
    selectedUserIds: userIds,
    createdBy: toUuidOrNull(adminId),
    metadata: {
      sourceEvent: `rule:${rule.type}`,
      ruleId: rule.id,
      ruleType: rule.type,
      ctaText: rule.ctaText,
      ctaLink,
      ...(targetRoute?.route ? { route: targetRoute.route, routeParams: targetRoute.routeParams } : {}),
      ...(targetRoute?.externalUrl ? { externalUrl: targetRoute.externalUrl } : {}),
    },
  });

  await supabase
    .from(TABLE)
    .update({
      last_sent_at: new Date().toISOString(),
      total_sent_count: (rule.totalSentCount ?? 0) + (result.recipientCount ?? 0),
    })
    .eq('id', rule.id);

  return {
    notification: result.notification,
    recipientCount: result.recipientCount ?? 0,
    targetAudience,
  };
}
