import {
  countRows,
  fetchRows,
  fillDateSeries,
  groupByDay,
  groupSumByDay,
  parseDateRange,
  topCounts,
} from "./_helpers.js";

export async function getBoutiqueAnalytics(query = {}) {
  const range = parseDateRange(query);
  const boutiqueId = String(query.boutiqueId || "").trim();
  if (!boutiqueId) {
    const err = new Error("boutiqueId is required");
    err.statusCode = 400;
    throw err;
  }

  const boutiqueFilters = [["boutique_id", "eq", boutiqueId]];
  const dateFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];

  const [
    totalProducts,
    appointmentBookings,
    profileVisits,
    callClicks,
    whatsappClicks,
    wishlistSaves,
    collectionViews,
  ] = await Promise.all([
    countRows("products", [["boutique_id", "eq", boutiqueId]]),
    countRows("appointments", [...boutiqueFilters, ...dateFilters]),
    countRows("boutique_visits", [...boutiqueFilters, ...dateFilters]),
    countRows("boutique_contact_clicks", [
      ...boutiqueFilters,
      ["click_type", "eq", "call"],
      ...dateFilters,
    ]),
    countRows("boutique_contact_clicks", [
      ...boutiqueFilters,
      ["click_type", "eq", "whatsapp"],
      ...dateFilters,
    ]),
    countRows("wishlist_items", [
      ...dateFilters,
    ]),
    countRows("analytics_events", [
      ["boutique_id", "eq", boutiqueId],
      ["event_type", "eq", "collection_view"],
      ...dateFilters,
    ]),
  ]);

  const [productViews, orders, products, appointments] = await Promise.all([
    fetchRows("product_views", "product_id, created_at", [...boutiqueFilters, ...dateFilters], {
      limit: 5000,
    }),
    fetchRows(
      "platform_orders",
      "amount, created_at, product_id",
      [...boutiqueFilters, ["status", "eq", "completed"], ...dateFilters],
      { limit: 5000 },
    ),
    fetchRows(
      "products",
      "id, name, price, created_at, image",
      [["boutique_id", "eq", boutiqueId]],
      { orderBy: "created_at", ascending: false, limit: 100 },
    ),
    fetchRows(
      "appointments",
      "id, created_at, type, status",
      [...boutiqueFilters, ...dateFilters],
      { limit: 2000 },
    ),
  ]);

  const boutiqueProductIds = new Set(products.map((p) => p.id));
  const wishlistRows = await fetchRows("wishlist_items", "product_id, created_at", dateFilters, {
    limit: 5000,
  });
  const boutiqueWishlist = wishlistRows.filter((w) => boutiqueProductIds.has(w.product_id));

  const revenueGenerated = orders.reduce((s, o) => s + Number(o.amount ?? 0), 0);
  const viewsCount = productViews.length || profileVisits;
  const conversionRate =
    viewsCount > 0 ? Math.round((appointmentBookings / viewsCount) * 10000) / 100 : 0;

  const productNameMap = new Map(products.map((p) => [p.id, p]));

  const topPerformingProducts = topCounts(
    productViews,
    (r) => {
      const p = productNameMap.get(r.product_id);
      return p
        ? { id: r.product_id, label: p.name, meta: { price: p.price, image: p.image } }
        : { id: r.product_id, label: "Product", meta: {} };
    },
    10,
  );

  const lowPerformingProducts = products
    .map((p) => ({
      id: p.id,
      label: p.name,
      count: productViews.filter((v) => v.product_id === p.id).length,
      meta: { price: p.price, image: p.image },
    }))
    .sort((a, b) => a.count - b.count)
    .slice(0, 10);

  const recentlyAddedProducts = products.slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image: p.image,
    createdAt: p.created_at,
  }));

  const trafficSources = topCounts(
    await fetchRows("boutique_visits", "source, created_at", [...boutiqueFilters, ...dateFilters], {
      limit: 2000,
    }),
    (r) => ({
      id: (r.source || "direct").toLowerCase(),
      label: r.source || "Direct",
      meta: {},
    }),
    8,
  );

  const mostBookedCollections = topCounts(
    await fetchRows(
      "analytics_events",
      "section_slug, metadata, created_at",
      [
        ["boutique_id", "eq", boutiqueId],
        ["event_type", "eq", "collection_view"],
        ...dateFilters,
      ],
      { limit: 2000 },
    ),
    (r) => ({
      id: r.section_slug || "unknown",
      label: r.metadata?.title || r.section_slug || "Collection",
      meta: {},
    }),
    8,
  );

  return {
    range,
    boutiqueId,
    cards: {
      totalProducts,
      totalCollectionViews: collectionViews,
      totalWishlistSaves: boutiqueWishlist.length,
      appointmentBookings,
      revenueGenerated: Math.round(revenueGenerated * 100) / 100,
      conversionRate,
      profileVisits,
      callClicks,
      whatsappClicks,
    },
    charts: {
      productViewTrends: fillDateSeries(groupByDay(productViews), range.from, range.to),
      appointmentTrends: fillDateSeries(groupByDay(appointments), range.from, range.to),
      revenueAnalytics: fillDateSeries(
        groupSumByDay(orders, "created_at", "amount"),
        range.from,
        range.to,
      ),
      customerEngagement: fillDateSeries(
        groupByDay([...productViews, ...boutiqueWishlist.map((w) => ({ created_at: w.created_at }))]),
        range.from,
        range.to,
      ),
    },
    sections: {
      topPerformingProducts,
      lowPerformingProducts,
      recentlyAddedProducts,
      mostBookedCollections,
      trafficSources,
    },
    aiInsightsReady: true,
  };
}

export async function listBoutiquesForAnalytics() {
  const rows = await fetchRows(
    "boutiques",
    "id, name, location, status, verified",
    [["deleted_at", "is", null]],
    { orderBy: "name", ascending: true, limit: 500 },
  );
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    location: b.location,
    status: b.status,
    verified: b.verified,
  }));
}
