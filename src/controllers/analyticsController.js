import {
  buildAnalyticsCsv,
  buildAnalyticsPdfBuffer,
  getBoutiqueAnalytics,
  getBoutiqueOverviewStats,
  getCustomerAnalytics,
  getPlatformAnalytics,
  listBoutiquesForAnalytics,
} from "../services/analytics/index.js";
import {
  linkVisitorToUser,
  recordAnalyticsEvent,
} from "../services/analytics/trackingService.js";

export async function recordEvent(req, res, next) {
  try {
    const data = await recordAnalyticsEvent({
      eventType: req.body?.eventType ?? req.body?.event_type,
      userId: req.body?.userId ?? req.body?.user_id,
      visitorId: req.body?.visitorId ?? req.body?.visitor_id,
      boutiqueId: req.body?.boutiqueId ?? req.body?.boutique_id,
      productId: req.body?.productId ?? req.body?.product_id,
      categoryId: req.body?.categoryId ?? req.body?.category_id,
      sectionSlug: req.body?.sectionSlug ?? req.body?.section_slug,
      sectionType: req.body?.sectionType ?? req.body?.section_type,
      sectionTitle: req.body?.sectionTitle ?? req.body?.section_title,
      categoryName: req.body?.categoryName ?? req.body?.category_name,
      source: req.body?.source,
      city: req.body?.city,
      metadata: req.body?.metadata ?? {},
    });
    return res.status(201).json({ success: true, data, message: "Event recorded" });
  } catch (error) {
    return next(error);
  }
}

export async function linkVisitor(req, res, next) {
  try {
    const data = await linkVisitorToUser({
      visitorId: req.body?.visitorId ?? req.body?.visitor_id,
      userId: req.body?.userId ?? req.body?.user_id,
    });
    return res.status(200).json({ success: true, data, message: "Visitor linked" });
  } catch (error) {
    return next(error);
  }
}

export async function fetchPlatformAnalytics(req, res, next) {
  try {
    const data = await getPlatformAnalytics(req.query);
    return res.status(200).json({ success: true, data, message: "Platform analytics fetched" });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiqueAnalytics(req, res, next) {
  try {
    const data = await getBoutiqueAnalytics(req.query);
    return res.status(200).json({ success: true, data, message: "Boutique analytics fetched" });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiqueOverviewStats(req, res, next) {
  try {
    const data = await getBoutiqueOverviewStats(req.query);
    return res.status(200).json({ success: true, data, message: "Boutique overview stats fetched" });
  } catch (error) {
    return next(error);
  }
}

export async function fetchCustomerAnalytics(req, res, next) {
  try {
    const data = await getCustomerAnalytics(req.query);
    return res.status(200).json({ success: true, data, message: "Customer analytics fetched" });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiqueOptions(_req, res, next) {
  try {
    const data = await listBoutiquesForAnalytics();
    return res.status(200).json({ success: true, data, message: "Boutiques listed" });
  } catch (error) {
    return next(error);
  }
}

export async function exportAnalyticsCsv(req, res, next) {
  try {
    const type = String(req.query.type || "platform");
    const data = await resolveDashboardData(type, req.query);
    const csv = buildAnalyticsCsv(type, data);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-analytics.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return next(error);
  }
}

export async function exportAnalyticsPdf(req, res, next) {
  try {
    const type = String(req.query.type || "platform");
    const data = await resolveDashboardData(type, req.query);
    const pdf = buildAnalyticsPdfBuffer(type, data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-analytics.pdf"`);
    return res.status(200).send(pdf);
  } catch (error) {
    return next(error);
  }
}

async function resolveDashboardData(type, query) {
  if (type === "boutique") return getBoutiqueAnalytics(query);
  if (type === "customer") return getCustomerAnalytics(query);
  return getPlatformAnalytics(query);
}
