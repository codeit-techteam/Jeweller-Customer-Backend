import {
  countRows,
  fetchRows,
  fillDateSeries,
  groupByDay,
  parseDateRange,
  topCounts,
} from "./_helpers.js";

export async function getCustomerAnalytics(query = {}) {
  const range = parseDateRange(query);
  const dateFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];
  const [totalCustomers, newUsers, wishlistRows, searchRows, viewRows, products] =
    await Promise.all([
      countRows("users_profile"),
      countRows("users_profile", [["created_at", "gte", range.from], ["created_at", "lte", range.to]]),
      fetchRows("wishlist_items", "user_id, product_id, created_at", dateFilters, { limit: 5000 }),
      fetchRows("search_history", "keyword, user_id, created_at", dateFilters, { limit: 5000 }),
      fetchRows("recently_viewed", "product_id, user_id, viewed_at", [], { limit: 5000 }),
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

  const topSearchKeywords = topCounts(
    searchRows,
    (r) => ({ id: r.keyword.toLowerCase(), label: r.keyword, meta: {} }),
    15,
  );

  const categoryInterest = topCounts(
    viewRows,
    (r) => {
      const p = productMap.get(r.product_id);
      const cat = p?.category || "Uncategorized";
      return { id: cat.toLowerCase(), label: cat, meta: {} };
    },
    10,
  );

  const userActivityTimeline = fillDateSeries(
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
      searchAnalytics: fillDateSeries(groupByDay(searchRows), range.from, range.to),
      wishlistGrowth: fillDateSeries(groupByDay(wishlistRows), range.from, range.to),
    },
    sections: {
      topSearchKeywords,
      mostViewedCategories: categoryInterest,
    },
  };
}
