import {
  fetchRows,
  getDateRange,
  resolveProductImage,
  topCounts,
  withPercentages,
} from "./_helpers.js";

function normalizeRangeQuery(query = {}) {
  return {
    range: query.range,
    from: query.startDate ?? query.from,
    to: query.endDate ?? query.to,
  };
}

/**
 * Category detail drill-down for customer analytics.
 * GET /api/analytics/customers/category-details
 * (also served at the legacy /customers/category-drilldown path)
 *
 * Accepts either `categoryId` (products.category_id) or `category` (category name).
 */
export async function getCategoryDetailDrilldown(query = {}) {
  const categoryId = String(query.categoryId || "").trim();
  const category = String(query.category || "").trim();
  if (!categoryId && !category) {
    const err = new Error("category or categoryId is required");
    err.statusCode = 400;
    throw err;
  }

  const range = getDateRange(normalizeRangeQuery(query));
  const categoryLower = category.toLowerCase();
  const viewedAtFilters = [
    ["viewed_at", "gte", range.from],
    ["viewed_at", "lte", range.to],
  ];
  const dateFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];

  const [products, viewRows, wishlistRows, boutiques] = await Promise.all([
    fetchRows(
      "products",
      "id, name, price, image, primary_image, thumbnail, featured_image, boutique_id, category_id, categories!category_id(name)",
      [],
      { limit: 2000 },
    ),
    fetchRows("recently_viewed", "product_id, boutique_id, user_id, viewed_at", viewedAtFilters, {
      limit: 8000,
    }),
    fetchRows("wishlist_items", "product_id, user_id, created_at", dateFilters, { limit: 8000 }),
    fetchRows("boutiques", "id, name", [], { limit: 500 }),
  ]);

  const categoryProducts = products.filter((p) => {
    if (categoryId) return String(p.category_id ?? "") === categoryId;
    return String(p.categories?.name ?? "").trim().toLowerCase() === categoryLower;
  });
  const productIds = new Set(categoryProducts.map((p) => p.id));
  const productMap = new Map(categoryProducts.map((p) => [p.id, p]));
  const boutiqueMap = new Map(boutiques.map((b) => [b.id, b.name ?? "Boutique"]));

  const categoryViews = viewRows.filter((row) => productIds.has(row.product_id));
  const categoryWishlists = wishlistRows.filter((row) => productIds.has(row.product_id));

  const views = categoryViews.length;
  const wishlistCount = categoryWishlists.length;

  const topProducts = withPercentages(
    topCounts(
      categoryViews,
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
      categoryViews.filter((row) => row.boutique_id),
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

  const displayName = categoryProducts[0]?.categories?.name ?? category;
  const resolvedCategoryId = categoryProducts[0]?.category_id ?? (categoryId || null);

  return {
    category: displayName,
    categoryId: resolvedCategoryId,
    views,
    wishlistCount,
    range,
    topProducts,
    topBoutiques,
  };
}
