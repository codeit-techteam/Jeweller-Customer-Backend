import { supabase } from "../../config/supabase.js";
import { getCalendarDayBounds, isValidVisitorId } from "./visitor.utils.js";

const EVENT_TABLE_MAP = {
  product_view: "product_views",
  boutique_visit: "boutique_visits",
  category_click: "category_clicks",
  section_engagement: "section_engagements",
  call_click: "boutique_contact_clicks",
  whatsapp_click: "boutique_contact_clicks",
};

async function recordBoutiqueVisit({ boutiqueId, userId, visitorId, source }) {
  if (source === "partner_preview") {
    return { recorded: false, reason: "preview_excluded" };
  }

  if (!userId && !isValidVisitorId(visitorId)) {
    const err = new Error("visitorId (UUID) is required when userId is not provided");
    err.statusCode = 400;
    throw err;
  }

  const { start, end } = getCalendarDayBounds();
  let dupQuery = supabase
    .from("boutique_visits")
    .select("id")
    .eq("boutique_id", boutiqueId)
    .gte("created_at", start)
    .lt("created_at", end)
    .limit(1);

  if (userId) {
    dupQuery = dupQuery.eq("user_id", userId);
  } else {
    dupQuery = dupQuery.eq("visitor_id", visitorId.trim());
  }

  const { data: existing } = await dupQuery.maybeSingle();
  if (existing) {
    return { recorded: false, reason: "already_counted_today" };
  }

  const { error } = await supabase.from("boutique_visits").insert({
    boutique_id: boutiqueId,
    user_id: userId ?? null,
    visitor_id: userId ? null : visitorId.trim(),
    source: source ?? "marketplace",
  });

  if (error) {
    const err = new Error("Failed to record boutique visit");
    err.statusCode = 500;
    throw err;
  }

  return { recorded: true };
}

/** Fire-and-forget profile view when customer opens boutique detail API. */
export function recordBoutiqueProfileViewFireAndForget({ boutiqueId, userId = null }) {
  if (!boutiqueId) return;

  void supabase
    .from("boutique_visits")
    .insert({
      boutique_id: boutiqueId,
      user_id: userId,
      source: "profile_view",
      created_at: new Date().toISOString(),
    })
    .then(() => {})
    .catch(() => {});
}

export async function linkVisitorToUser({ visitorId, userId }) {
  if (!isValidVisitorId(visitorId)) {
    const err = new Error("Invalid visitorId");
    err.statusCode = 400;
    throw err;
  }
  if (!userId) {
    const err = new Error("userId is required");
    err.statusCode = 400;
    throw err;
  }

  const { data: user } = await supabase
    .from("users_profile")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  if (user.role !== "customer") {
    const err = new Error("Only customer accounts can be linked");
    err.statusCode = 400;
    throw err;
  }

  const { error } = await supabase.from("visitor_identity_links").upsert(
    {
      visitor_id: visitorId.trim(),
      user_id: userId,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "visitor_id" },
  );

  if (error) {
    const err = new Error("Failed to link visitor");
    err.statusCode = 500;
    throw err;
  }

  await supabase
    .from("boutique_visits")
    .update({ user_id: userId, visitor_id: null })
    .eq("visitor_id", visitorId.trim())
    .is("user_id", null);

  await supabase
    .from("product_views")
    .update({ user_id: userId, visitor_id: null })
    .eq("visitor_id", visitorId.trim())
    .is("user_id", null);

  return { linked: true };
}

export async function recordAnalyticsEvent(payload) {
  const {
    eventType,
    userId,
    visitorId,
    boutiqueId,
    productId,
    categoryId,
    sectionSlug,
    sectionType,
    sectionTitle,
    categoryName,
    source,
    metadata = {},
    city,
  } = payload;

  if (!eventType) {
    const err = new Error("eventType is required");
    err.statusCode = 400;
    throw err;
  }

  const uid = userId ?? null;
  const vid = uid ? null : visitorId?.trim() || null;

  const baseEvent = {
    event_type: eventType,
    user_id: uid,
    boutique_id: boutiqueId ?? null,
    product_id: productId ?? null,
    category_id: categoryId ?? null,
    section_slug: sectionSlug ?? null,
    metadata,
  };

  await supabase.from("analytics_events").insert(baseEvent);

  let visitResult = null;

  if (eventType === "product_view" && productId) {
    await supabase.from("product_views").insert({
      product_id: productId,
      boutique_id: boutiqueId ?? null,
      user_id: uid,
      visitor_id: vid,
    });
  }

  if (eventType === "boutique_visit" && boutiqueId) {
    visitResult = await recordBoutiqueVisit({
      boutiqueId,
      userId: uid,
      visitorId: vid,
      source: source ?? "marketplace",
    });
  }

  if (eventType === "category_click") {
    await supabase.from("category_clicks").insert({
      category_id: categoryId ?? null,
      category_name: categoryName ?? null,
      user_id: uid,
    });
  }

  if (eventType === "section_engagement") {
    await supabase.from("section_engagements").insert({
      section_type: sectionType ?? "general",
      section_slug: sectionSlug ?? "unknown",
      section_title: sectionTitle ?? null,
      user_id: uid,
    });
  }

  if ((eventType === "call_click" || eventType === "whatsapp_click") && boutiqueId) {
    await supabase.from("boutique_contact_clicks").insert({
      boutique_id: boutiqueId,
      user_id: uid,
      click_type: eventType === "call_click" ? "call" : "whatsapp",
      source: source ?? null,
    });
  }

  if (userId) {
    const now = new Date().toISOString();
    const { data: session } = await supabase
      .from("analytics_sessions")
      .select("id, started_at")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session?.id) {
      const started = new Date(session.started_at ?? now).getTime();
      const durationSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      await supabase
        .from("analytics_sessions")
        .update({ last_seen_at: now, city: city ?? null, duration_seconds: durationSeconds })
        .eq("id", session.id);
    } else {
      await supabase.from("analytics_sessions").insert({
        user_id: userId,
        city: city ?? null,
        started_at: now,
        last_seen_at: now,
      });
    }
  }

  return {
    recorded: true,
    eventType,
    table: EVENT_TABLE_MAP[eventType] ?? "analytics_events",
    visit: visitResult,
  };
}
