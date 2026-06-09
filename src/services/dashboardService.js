import { supabase } from "../config/supabase.js";

const RETRYABLE_NETWORK_ERRORS = ["fetch failed", "network", "etimedout", "econnreset", "eai_again"];

function isRetryableError(errorMessage) {
  const normalized = String(errorMessage || "").toLowerCase();
  return RETRYABLE_NETWORK_ERRORS.some((token) => normalized.includes(token));
}

async function countRowsWithRetry(tableName, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { count, error } = await supabase
      .from(tableName)
      .select("id", { count: "exact", head: true });

    if (!error) {
      return count ?? 0;
    }

    const shouldRetry = isRetryableError(error.message) && attempt < retries;
    if (!shouldRetry) {
      console.warn("[dashboardService] count failed", { tableName, error: error.message, attempt: attempt + 1 });
      return 0;
    }

    const backoffMs = 300 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  return 0;
}

async function countRows(tableName) {
  return countRowsWithRetry(tableName);
}

export async function getDashboardStats() {
  const [totalProducts, totalBoutiques, totalCollections] = await Promise.all([
    countRows("products"),
    countRows("boutiques"),
    countRows("collections"),
  ]);

  let totalUsers = 0;
  const possibleUserTables = ["users", "profiles", "users_profile"];
  for (const table of possibleUserTables) {
    const count = await countRows(table);
    if (count > 0) {
      totalUsers = count;
      break;
    }
  }

  return {
    totalUsers,
    totalBoutiques,
    totalProducts,
    totalCollections,
  };
}

const PAGE_SIZE = 1000;

async function fetchAllRows(buildQuery) {
  const rows = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

export async function getWishlistAnalytics() {
  const rows = await fetchAllRows(() =>
    supabase
      .from("wishlist_items")
      .select(
        `
      product_id,
      user_id,
      products (
        id,
        name,
        price,
        image,
        boutique: boutiques!boutique_id (
          id,
          name
        )
      )
    `,
      )
      .order("created_at", { ascending: false }),
  );

  const userIds = new Set();
  const productMap = new Map();

  for (const row of rows) {
    if (row.user_id) userIds.add(row.user_id);
    const pid = row.product_id;
    if (!pid) continue;

    const p = row.products;
    const name = p?.name ?? "Unknown product";
    const price = p?.price != null ? Number(p.price) : null;
    const image = p?.image ?? null;
    const boutiqueName = p?.boutique?.name ?? "—";

    const existing = productMap.get(pid);
    if (existing) {
      existing.wishlistCount += 1;
    } else {
      productMap.set(pid, {
        product_id: pid,
        productName: name,
        boutiqueName,
        price,
        image,
        wishlistCount: 1,
      });
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.wishlistCount - a.wishlistCount)
    .slice(0, 50);

  return {
    summary: {
      totalWishlistRows: rows.length,
      uniqueUsers: userIds.size,
      uniqueProducts: productMap.size,
    },
    topProducts,
  };
}

export async function getRecentlyViewedAnalytics() {
  const rows = await fetchAllRows(() =>
    supabase
      .from("recently_viewed")
      .select(
        `
      product_id,
      boutique_id,
      user_id,
      viewed_at,
      products ( id, name, price, image ),
      boutiques ( id, name )
    `,
      )
      .order("viewed_at", { ascending: false }),
  );

  const userIds = new Set();
  const productMap = new Map();
  const boutiqueMap = new Map();
  let rowsWithProduct = 0;
  let rowsWithBoutiqueOnly = 0;

  for (const row of rows) {
    if (row.user_id) userIds.add(row.user_id);

    if (row.product_id) {
      rowsWithProduct += 1;
      const pid = row.product_id;
      const p = row.products;
      const name = p?.name ?? "Unknown product";
      const price = p?.price != null ? Number(p.price) : null;
      const image = p?.image ?? null;

      const existing = productMap.get(pid);
      if (existing) {
        existing.viewCount += 1;
      } else {
        productMap.set(pid, {
          product_id: pid,
          productName: name,
          price,
          image,
          viewCount: 1,
        });
      }
    }

    if (row.boutique_id) {
      if (!row.product_id) {
        rowsWithBoutiqueOnly += 1;
      }
      const bid = row.boutique_id;
      const b = row.boutiques;
      const name = b?.name ?? "Unknown boutique";

      const existing = boutiqueMap.get(bid);
      if (existing) {
        existing.viewCount += 1;
      } else {
        boutiqueMap.set(bid, {
          boutique_id: bid,
          boutiqueName: name,
          viewCount: 1,
        });
      }
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 50);

  const topBoutiques = [...boutiqueMap.values()]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 50);

  return {
    summary: {
      totalEvents: rows.length,
      uniqueUsers: userIds.size,
      rowsWithProduct,
      rowsWithBoutiqueOnly,
      uniqueProductsTracked: productMap.size,
      uniqueBoutiquesTracked: boutiqueMap.size,
    },
    topProducts,
    topBoutiques,
  };
}
