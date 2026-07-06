import {
  aggregateProductViewCounts,
  dayBoundsFromDateKey,
  fetchRows,
  withPercentages,
} from "./_helpers.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function resolveProductImage(product) {
  if (!product) return null;
  return (
    product.primary_image ??
    product.thumbnail ??
    product.featured_image ??
    product.image ??
    null
  );
}

/**
 * Product view drill-down for a single calendar day.
 * GET /api/analytics/product-drilldown
 */
export async function getProductViewDrilldown(query = {}) {
  const boutiqueId = String(query.boutiqueId || query.boutique_id || "").trim();
  const dateKey = String(query.date || "").trim().slice(0, 10);

  if (!boutiqueId) {
    const err = new Error("boutiqueId is required");
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const err = new Error("date is required (YYYY-MM-DD)");
    err.statusCode = 400;
    throw err;
  }

  const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(String(query.limit ?? String(DEFAULT_LIMIT)), 10) || DEFAULT_LIMIT),
  );
  const sort = String(query.sort || "viewsDesc").toLowerCase();

  const { from, to } = dayBoundsFromDateKey(dateKey);

  const [viewRows, products, boutiqueRow] = await Promise.all([
    fetchRows(
      "product_views",
      "product_id, boutique_id, created_at",
      [
        ["boutique_id", "eq", boutiqueId],
        ["created_at", "gte", from],
        ["created_at", "lte", to],
      ],
      { limit: 10000 },
    ),
    fetchRows(
      "products",
      "id, name, price, image, primary_image, thumbnail, featured_image, boutique_id",
      [["boutique_id", "eq", boutiqueId]],
      { limit: 500 },
    ),
    fetchRows("boutiques", "id, name", [["id", "eq", boutiqueId]], { limit: 1 }),
  ]);

  const boutiqueName = boutiqueRow[0]?.name ?? "Boutique";
  const productMap = new Map(products.map((p) => [p.id, p]));
  const viewCounts = aggregateProductViewCounts(viewRows);
  const totalViews = viewRows.length;

  let ranked = [...viewCounts.entries()].map(([productId, views]) => {
    const product = productMap.get(productId);
    return {
      productId,
      productName: product?.name ?? "Unknown product",
      views,
      boutiqueId,
      boutiqueName,
      image: resolveProductImage(product),
      price: product?.price ?? null,
    };
  });

  if (sort === "viewsasc") {
    ranked.sort((a, b) => a.views - b.views);
  } else {
    ranked.sort((a, b) => b.views - a.views);
  }

  const withPct = withPercentages(ranked, "views").map((row) => ({
    productId: row.productId,
    productName: row.productName,
    views: row.views,
    percentage: row.percentage,
    boutiqueId: row.boutiqueId,
    boutiqueName: row.boutiqueName,
    image: row.image,
    price: row.price,
  }));

  const total = withPct.length;
  const start = (page - 1) * limit;
  const items = withPct.slice(start, start + limit);

  const topProduct = withPct[0] ?? null;
  const recommendedAction = topProduct
    ? `Promote ${topProduct.productName} — ${topProduct.percentage}% of daily views`
    : null;

  return {
    date: dateKey,
    boutiqueId,
    boutiqueName,
    totalViews,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items,
    topInsight: topProduct
      ? {
          productName: topProduct.productName,
          percentage: topProduct.percentage,
          views: topProduct.views,
          recommendedAction,
        }
      : null,
  };
}
