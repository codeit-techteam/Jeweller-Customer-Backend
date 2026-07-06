import {
  fetchRows,
  getDateRange,
  resolveProductImage,
  topCounts,
  withPercentages,
} from "./_helpers.js";

const RECENT_SEARCHES_LIMIT = 10;

function normalizeRangeQuery(query = {}) {
  return {
    range: query.range,
    from: query.startDate ?? query.from,
    to: query.endDate ?? query.to,
  };
}

/**
 * Search keyword drill-down for customer analytics.
 * GET /api/analytics/customers/search-keyword-details
 * (also served at the legacy /customers/search-drilldown path)
 */
export async function getSearchKeywordDrilldown(query = {}) {
  const keyword = String(query.keyword || "").trim();
  if (!keyword) {
    const err = new Error("keyword is required");
    err.statusCode = 400;
    throw err;
  }

  const range = getDateRange(normalizeRangeQuery(query));
  const dateFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];
  const viewedAtFilters = [
    ["viewed_at", "gte", range.from],
    ["viewed_at", "lte", range.to],
  ];

  const keywordLower = keyword.toLowerCase();

  const [allSearchRows, viewRows, products, boutiques] = await Promise.all([
    fetchRows("search_history", "keyword, user_id, created_at", dateFilters, { limit: 8000 }),
    fetchRows("recently_viewed", "product_id, boutique_id, user_id, viewed_at", viewedAtFilters, {
      limit: 8000,
    }),
    fetchRows(
      "products",
      "id, name, price, image, primary_image, thumbnail, featured_image, boutique_id, categories!category_id(name)",
      [],
      { limit: 2000 },
    ),
    fetchRows("boutiques", "id, name", [], { limit: 500 }),
  ]);

  const searchRows = allSearchRows
    .filter((row) => String(row.keyword ?? "").trim().toLowerCase() === keywordLower)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const searchCount = searchRows.length;
  const searcherIds = new Set(searchRows.map((row) => row.user_id).filter(Boolean));

  const boutiqueMap = new Map(boutiques.map((b) => [b.id, b.name ?? "Boutique"]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const matchingProducts = products.filter((p) =>
    String(p.name ?? "").toLowerCase().includes(keywordLower),
  );

  const relatedProducts = matchingProducts.slice(0, 10).map((p) => ({
    productId: p.id,
    productName: p.name ?? "Unknown product",
    boutiqueId: p.boutique_id,
    boutiqueName: boutiqueMap.get(p.boutique_id) ?? "Boutique",
    image: resolveProductImage(p),
    price: p.price ?? null,
  }));

  const matchingCategories = withPercentages(
    topCounts(
      matchingProducts.filter((p) => p.categories?.name),
      (p) => ({ id: String(p.categories.name).toLowerCase(), label: p.categories.name, meta: {} }),
      10,
    ),
    "count",
  ).map((row) => ({ id: row.id, label: row.label, count: row.count, percentage: row.percentage }));

  const searcherViews = viewRows.filter((row) => searcherIds.has(row.user_id));

  const topViewedProducts = withPercentages(
    topCounts(
      searcherViews.filter((row) => row.product_id),
      (row) => {
        const product = productMap.get(row.product_id);
        return {
          id: row.product_id,
          label: product?.name ?? "Unknown product",
          meta: {
            boutiqueId: row.boutique_id ?? product?.boutique_id,
            boutiqueName: boutiqueMap.get(row.boutique_id ?? product?.boutique_id) ?? "Boutique",
            image: resolveProductImage(product),
            price: product?.price ?? null,
          },
        };
      },
      10,
    ),
    "count",
  ).map((row) => ({
    productId: row.id,
    productName: row.label,
    views: row.count,
    percentage: row.percentage,
    boutiqueId: row.meta?.boutiqueId,
    boutiqueName: row.meta?.boutiqueName,
    image: row.meta?.image,
    price: row.meta?.price,
  }));

  const topBoutiques = withPercentages(
    topCounts(
      searcherViews.filter((row) => row.boutique_id),
      (row) => ({
        id: row.boutique_id,
        label: boutiqueMap.get(row.boutique_id) ?? "Boutique",
        meta: {},
      }),
      10,
    ),
    "count",
  ).map((row) => ({
    boutiqueId: row.id,
    boutiqueName: row.label,
    views: row.count,
    percentage: row.percentage,
  }));

  const recentSearches = searchRows.slice(0, RECENT_SEARCHES_LIMIT).map((row) => ({
    searchedAt: row.created_at,
  }));

  return {
    keyword,
    searchCount,
    range,
    relatedProducts,
    topViewedProducts,
    topBoutiques,
    matchingCategories,
    recentSearches,
  };
}
