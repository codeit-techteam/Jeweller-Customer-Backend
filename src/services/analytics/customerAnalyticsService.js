import {
  countRows,
  enrichSeriesWithInsights,
  fetchRows,
  fillDateSeries,
  getDateRange,
  groupByDay,
  topCounts,
  withPercentages,
} from "./_helpers.js";

export async function getCustomerAnalytics(query = {}) {
  const range = getDateRange(query);
  const dateFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];
  const viewedAtFilters = [
    ["viewed_at", "gte", range.from],
    ["viewed_at", "lte", range.to],
  ];
  const [totalCustomers, newUsers, wishlistRows, searchRows, viewRows, products] =
    await Promise.all([
      countRows("users_profile"),
      countRows("users_profile", dateFilters),
      fetchRows("wishlist_items", "user_id, product_id, created_at", dateFilters, { limit: 5000 }),
      fetchRows("search_history", "keyword, user_id, created_at", dateFilters, { limit: 5000 }),
      fetchRows("recently_viewed", "product_id, user_id, viewed_at", viewedAtFilters, {
        limit: 5000,
      }),
      fetchRows(
        "products",
        "id, name, category_id, categories!category_id(name)",
        [],
        { limit: 800 },
      ),
    ]);

  const productMap = new Map(
    products.map((p) => [
      p.id,
      {
        name: p.name,
        category: p.categories?.name,
      },
    ]),
  );

  const searchKeywordMap = new Map();
  for (const row of searchRows) {
    const label = String(row.keyword ?? "").trim();
    if (!label) continue;
    const id = label.toLowerCase();
    const existing = searchKeywordMap.get(id) ?? {
      id,
      label,
      count: 0,
      meta: { lastSearchDate: null },
    };
    existing.count += 1;
    const createdAt = row.created_at;
    if (
      createdAt &&
      (!existing.meta.lastSearchDate ||
        new Date(createdAt).getTime() > new Date(existing.meta.lastSearchDate).getTime())
    ) {
      existing.meta.lastSearchDate = createdAt;
    }
    searchKeywordMap.set(id, existing);
  }
  const topSearchKeywords = withPercentages(
    [...searchKeywordMap.values()].sort((a, b) => b.count - a.count).slice(0, 15),
  );

  const categoryInterest = withPercentages(
    topCounts(
      viewRows,
      (r) => {
        const p = productMap.get(r.product_id);
        const cat = p?.category || "Uncategorized";
        return { id: cat.toLowerCase(), label: cat, meta: {} };
      },
      10,
    ),
  );

  const userActivityTimeline = enrichSeriesWithInsights(
    fillDateSeries(
      groupByDay(
        [
          ...wishlistRows,
          ...searchRows,
          ...viewRows.map((v) => ({ created_at: v.viewed_at })),
        ],
        "created_at",
      ),
      range.from,
      range.to,
    ),
  );

  return {
    range,
    cards: {
      totalCustomers,
      newUsers,
      wishlistActivity: wishlistRows.length,
      searchTrends: searchRows.length,
      recentlyViewedCount: viewRows.length,
    },
    charts: {
      userActivityTimeline,
      searchAnalytics: enrichSeriesWithInsights(
        fillDateSeries(groupByDay(searchRows), range.from, range.to),
      ),
      wishlistGrowth: enrichSeriesWithInsights(
        fillDateSeries(groupByDay(wishlistRows), range.from, range.to),
      ),
    },
    sections: {
      topSearchKeywords,
      mostViewedCategories: categoryInterest,
    },
  };
}
