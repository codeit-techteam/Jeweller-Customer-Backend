import { dayBoundsFromDateKey, fetchRows } from "./_helpers.js";

const SUPPORTED_METRICS = new Set([
  "userGrowth",
  "appointmentTrends",
  "boutiqueApprovalTrends",
  "productUploadTrends",
]);

function formatStatus(status) {
  if (!status || typeof status !== "string") return null;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function buildUserGrowthItems(dateFilters) {
  const [customers, boutiques] = await Promise.all([
    fetchRows("users_profile", "id, full_name, email, created_at", dateFilters, {
      orderBy: "created_at",
      ascending: false,
      limit: 2000,
    }),
    fetchRows("boutiques", "id, name, location, created_at", [...dateFilters, ["deleted_at", "is", null]], {
      orderBy: "created_at",
      ascending: false,
      limit: 2000,
    }),
  ]);

  const items = [
    ...customers.map((row) => ({
      id: row.id,
      title: row.full_name || "New Customer",
      subtitle: row.email || null,
      badge: "Customer",
      createdAt: row.created_at,
    })),
    ...boutiques.map((row) => ({
      id: row.id,
      title: row.name || "New Boutique",
      subtitle: row.location || null,
      badge: "Boutique",
      createdAt: row.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    items,
    breakdown: { customers: customers.length, boutiques: boutiques.length },
  };
}

async function buildAppointmentItems(dateFilters) {
  const appointments = await fetchRows(
    "appointments",
    "id, user_id, boutique_id, date, time, type, status, created_at",
    dateFilters,
    { orderBy: "created_at", ascending: false, limit: 2000 },
  );

  const userIds = [...new Set(appointments.map((a) => a.user_id).filter(Boolean))];
  const boutiqueIds = [...new Set(appointments.map((a) => a.boutique_id).filter(Boolean))];

  const [users, boutiques] = await Promise.all([
    userIds.length
      ? fetchRows("users_profile", "id, full_name", [], { limit: 5000 }).then((rows) =>
          rows.filter((r) => userIds.includes(r.id)),
        )
      : [],
    boutiqueIds.length
      ? fetchRows("boutiques", "id, name", [], { limit: 500 }).then((rows) =>
          rows.filter((r) => boutiqueIds.includes(r.id)),
        )
      : [],
  ]);

  const userNameById = new Map(users.map((u) => [u.id, u.full_name]));
  const boutiqueNameById = new Map(boutiques.map((b) => [b.id, b.name]));

  const items = appointments.map((row) => ({
    id: row.id,
    title: boutiqueNameById.get(row.boutique_id) || "Boutique",
    subtitle: userNameById.get(row.user_id) || "Customer",
    badge: formatStatus(row.status) || row.type || null,
    createdAt: row.created_at,
  }));

  return { items, breakdown: { appointments: appointments.length } };
}

async function buildBoutiqueApprovalItems(dateFilters) {
  const boutiques = await fetchRows(
    "boutiques",
    "id, name, location, store_status, created_at",
    [...dateFilters, ["store_status", "eq", "approved"], ["deleted_at", "is", null]],
    { orderBy: "created_at", ascending: false, limit: 2000 },
  );

  const items = boutiques.map((row) => ({
    id: row.id,
    title: row.name || "Boutique",
    subtitle: row.location || null,
    badge: "Approved",
    createdAt: row.created_at,
  }));

  return { items, breakdown: { approvals: boutiques.length } };
}

async function buildProductUploadItems(dateFilters) {
  const products = await fetchRows(
    "products",
    "id, name, price, boutique_id, created_at",
    dateFilters,
    { orderBy: "created_at", ascending: false, limit: 2000 },
  );

  const boutiqueIds = [...new Set(products.map((p) => p.boutique_id).filter(Boolean))];
  const boutiques = boutiqueIds.length
    ? await fetchRows("boutiques", "id, name", [], { limit: 500 }).then((rows) =>
        rows.filter((r) => boutiqueIds.includes(r.id)),
      )
    : [];
  const boutiqueNameById = new Map(boutiques.map((b) => [b.id, b.name]));

  const items = products.map((row) => ({
    id: row.id,
    title: row.name || "Product",
    subtitle: boutiqueNameById.get(row.boutique_id) || "Boutique",
    badge: row.price != null ? `₹${row.price}` : null,
    createdAt: row.created_at,
  }));

  return { items, breakdown: { products: products.length } };
}

/**
 * Day-level breakdown behind a single Platform Analytics chart point
 * (User Growth, Appointment Trends, Boutique Approval Trends, Product Upload Trends).
 * GET /api/analytics/platform/day-details?date=YYYY-MM-DD&metric=userGrowth
 */
export async function getPlatformDayDetails(query = {}) {
  const dateKey = String(query.date || "").slice(0, 10);
  if (!dateKey || Number.isNaN(new Date(dateKey).getTime())) {
    throw Object.assign(new Error("A valid date (YYYY-MM-DD) is required"), { statusCode: 400 });
  }

  const metric = SUPPORTED_METRICS.has(query.metric) ? query.metric : "userGrowth";
  const bounds = dayBoundsFromDateKey(dateKey);
  const dateFilters = [
    ["created_at", "gte", bounds.from],
    ["created_at", "lte", bounds.to],
  ];

  const builder = {
    userGrowth: buildUserGrowthItems,
    appointmentTrends: buildAppointmentItems,
    boutiqueApprovalTrends: buildBoutiqueApprovalItems,
    productUploadTrends: buildProductUploadItems,
  }[metric];

  const { items, breakdown } = await builder(dateFilters);

  return {
    date: dateKey,
    metric,
    range: { from: bounds.from, to: bounds.to },
    total: items.length,
    breakdown,
    items: items.slice(0, 100),
  };
}
