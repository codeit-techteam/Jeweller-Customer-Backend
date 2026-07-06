import {
  fetchRows,
  resolveDrilldownWindow,
  resolveProductImage,
  topCounts,
  withPercentages,
} from "./_helpers.js";

/**
 * Day-level breakdown behind a single "Wishlist Growth" chart point.
 * GET /api/analytics/customers/wishlist-details
 *
 * Supports:
 *  - date=YYYY-MM-DD            (single day, matches the clicked chart point)
 *  - startDate & endDate        (custom range)
 *  - range=today|7d|30d         (preset range, falls back to 30d)
 */
export async function getWishlistDetails(query = {}) {
  const window = resolveDrilldownWindow(query);
  const dateFilters = [
    ["created_at", "gte", window.from],
    ["created_at", "lte", window.to],
  ];

  const [wishlistRows, products, boutiques] = await Promise.all([
    fetchRows("wishlist_items", "id, user_id, product_id, created_at", dateFilters, { limit: 8000 }),
    fetchRows(
      "products",
      "id, name, price, image, primary_image, thumbnail, featured_image, boutique_id",
      [],
      { limit: 2000 },
    ),
    fetchRows("boutiques", "id, name", [], { limit: 500 }),
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const boutiqueMap = new Map(boutiques.map((b) => [b.id, b.name ?? "Boutique"]));
  const boutiqueIdForProduct = (productId) => productMap.get(productId)?.boutique_id ?? null;

  const productsAddedToWishlist = [...wishlistRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50)
    .map((row) => {
      const product = productMap.get(row.product_id);
      return {
        productId: row.product_id,
        productName: product?.name ?? "Unknown product",
        boutiqueId: product?.boutique_id ?? null,
        boutiqueName: boutiqueMap.get(product?.boutique_id) ?? "Boutique",
        image: resolveProductImage(product),
        price: product?.price ?? null,
        addedAt: row.created_at,
      };
    });

  const topWishlistedProducts = withPercentages(
    topCounts(
      wishlistRows.filter((row) => row.product_id),
      (row) => {
        const product = productMap.get(row.product_id);
        return {
          id: row.product_id,
          label: product?.name ?? "Unknown product",
          meta: {
            boutiqueId: product?.boutique_id,
            boutiqueName: boutiqueMap.get(product?.boutique_id) ?? "Boutique",
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
    count: row.count,
    percentage: row.percentage,
    boutiqueId: row.meta?.boutiqueId,
    boutiqueName: row.meta?.boutiqueName,
    image: row.meta?.image,
    price: row.meta?.price,
  }));

  const topWishlistedBoutiques = withPercentages(
    topCounts(
      wishlistRows.filter((row) => boutiqueIdForProduct(row.product_id)),
      (row) => ({
        id: boutiqueIdForProduct(row.product_id),
        label: boutiqueMap.get(boutiqueIdForProduct(row.product_id)) ?? "Boutique",
        meta: {},
      }),
      5,
    ),
    "count",
  ).map((row) => ({
    boutiqueId: row.id,
    boutiqueName: row.label,
    count: row.count,
    percentage: row.percentage,
  }));

  return {
    date: window.date,
    range: { from: window.from, to: window.to },
    wishlistAdded: wishlistRows.length,
    productsAddedToWishlist,
    topWishlistedProducts,
    topWishlistedBoutique: topWishlistedBoutiques[0] ?? null,
    topWishlistedBoutiques,
  };
}
