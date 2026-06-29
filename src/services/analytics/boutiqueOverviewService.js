import { buildDateFilters, fetchRows, getDateRange } from "./_helpers.js";

function aggregateByBoutiqueId(rows, idField = "boutique_id") {
  const counts = new Map();
  for (const row of rows) {
    const id = row[idField];
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function pickTopBoutique(counts, boutiqueNameById) {
  let topId = null;
  let topCount = 0;

  for (const [id, count] of counts) {
    if (count > topCount) {
      topId = id;
      topCount = count;
    }
  }

  if (!topId || topCount === 0) {
    return null;
  }

  return {
    boutiqueId: topId,
    name: boutiqueNameById.get(topId) ?? "Unknown boutique",
    count: topCount,
  };
}

function isShowcaseProduct(row) {
  if (row.is_draft === true) return false;
  const status = String(row.status ?? "active").toLowerCase();
  return !["deleted", "draft", "archived", "inactive"].includes(status);
}

function resolveProductBoutiqueId(row) {
  return row.boutique_id ?? row.primary_boutique_id ?? null;
}

export async function getBoutiqueOverviewStats(query = {}) {
  const range = getDateRange(query);
  const dateFilters = buildDateFilters(range);

  const [appointments, products, visits, boutiques] = await Promise.all([
    fetchRows(
      "appointments",
      "boutique_id, created_at",
      [
        ["deleted_at", "is", null],
        ...dateFilters,
      ],
      { limit: 50000 },
    ),
    fetchRows(
      "products",
      "boutique_id, primary_boutique_id, status, is_draft",
      [],
      { limit: 50000 },
    ),
    fetchRows("boutique_visits", "boutique_id, created_at", dateFilters, { limit: 50000 }),
    fetchRows("boutiques", "id, name", [["deleted_at", "is", null]], { limit: 500 }),
  ]);

  const boutiqueNameById = new Map(boutiques.map((b) => [b.id, b.name]));

  const mostAppointments = pickTopBoutique(
    aggregateByBoutiqueId(appointments),
    boutiqueNameById,
  );

  const productCounts = new Map();
  for (const row of products) {
    if (!isShowcaseProduct(row)) continue;
    const boutiqueId = resolveProductBoutiqueId(row);
    if (!boutiqueId) continue;
    productCounts.set(boutiqueId, (productCounts.get(boutiqueId) ?? 0) + 1);
  }
  const maxProducts = pickTopBoutique(productCounts, boutiqueNameById);

  let mostViewed = pickTopBoutique(aggregateByBoutiqueId(visits), boutiqueNameById);

  // TODO: implement boutique_views tracking table if boutique_visits stays sparse
  if (!mostViewed && mostAppointments) {
    mostViewed = mostAppointments;
  }

  return {
    range,
    cards: {
      mostViewed,
      mostAppointments,
      maxProducts,
    },
  };
}
