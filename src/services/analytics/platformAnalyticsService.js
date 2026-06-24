import {
  countRows,
  fetchRows,
  fillDateSeries,
  getDateRange,
  groupByDay,
} from "./_helpers.js";

export async function getPlatformAnalytics(query = {}) {
  const range = getDateRange(query);
  const rangeFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];

  const [
    totalUsers,
    newCustomers,
    newBoutiques,
    totalBoutiques,
    approvedBoutiques,
    rejectedBoutiques,
    totalProducts,
    totalCollections,
    totalAppointments,
    totalOrders,
  ] = await Promise.all([
    countRows("users_profile"),
    countRows("users_profile", rangeFilters),
    countRows("boutiques", [...rangeFilters, ["deleted_at", "is", null]]),
    countRows("boutiques", [["deleted_at", "is", null]]),
    countRows("boutiques", [
      ["store_status", "eq", "approved"],
      ["deleted_at", "is", null],
    ]),
    countRows("boutiques", [
      ["store_status", "eq", "rejected"],
      ["deleted_at", "is", null],
    ]),
    countRows("products"),
    countRows("collections"),
    countRows("appointments", rangeFilters),
    countRows("platform_orders", [...rangeFilters, ["status", "eq", "completed"]]),
  ]);

  const newUsers = newCustomers + newBoutiques;

  const [
    users,
    newBoutiqueRows,
    approvedBoutiquesRows,
    products,
    appointments,
    activityLogs,
    latestBoutiques,
  ] = await Promise.all([
    fetchRows("users_profile", "created_at", rangeFilters),
    fetchRows("boutiques", "created_at", [
      ...rangeFilters,
      ["deleted_at", "is", null],
    ]),
    fetchRows("boutiques", "created_at", [
      ["store_status", "eq", "approved"],
      ...rangeFilters,
      ["deleted_at", "is", null],
    ]),
    fetchRows("products", "created_at", rangeFilters),
    fetchRows("appointments", "created_at", rangeFilters),
    fetchRows("admin_activity_logs", "id, action, boutique_id, metadata, created_at", rangeFilters, {
      orderBy: "created_at",
      ascending: false,
      limit: 20,
    }),
    fetchRows(
      "boutiques",
      "id, name, location, created_at, store_status",
      [...rangeFilters, ["deleted_at", "is", null]],
      { orderBy: "created_at", ascending: false, limit: 8 },
    ),
  ]);

  const signupRows = [
    ...users.map((row) => ({ created_at: row.created_at })),
    ...newBoutiqueRows.map((row) => ({ created_at: row.created_at })),
  ];

  const userGrowth = fillDateSeries(groupByDay(signupRows), range.from, range.to);
  const boutiqueApprovalTrends = fillDateSeries(
    groupByDay(approvedBoutiquesRows),
    range.from,
    range.to,
  );
  const productUploadTrends = fillDateSeries(groupByDay(products), range.from, range.to);
  const appointmentTrends = fillDateSeries(
    groupByDay(appointments, "created_at"),
    range.from,
    range.to,
  );

  const boutiquePerformance = await getTopBoutiques(range);
  const pendingBoutiques = Math.max(totalBoutiques - approvedBoutiques - rejectedBoutiques, 0);

  return {
    range,
    cards: {
      totalUsers,
      newUsers,
      totalBoutiques,
      approvedBoutiques,
      pendingBoutiques,
      totalProducts,
      totalCollections,
      totalAppointments,
      totalOrders,
    },
    charts: {
      userGrowth,
      boutiqueApprovalTrends,
      productUploadTrends,
      appointmentTrends,
    },
    sections: {
      topPerformingBoutiques: boutiquePerformance,
      recentActivities: activityLogs.map((log) => ({
        id: log.id,
        action: log.action,
        boutiqueId: log.boutique_id,
        metadata: log.metadata,
        createdAt: log.created_at,
      })),
      latestRegisteredBoutiques: latestBoutiques,
    },
  };
}

async function getTopBoutiques(range) {
  const [appts, orders, boutiques] = await Promise.all([
    fetchRows(
      "appointments",
      "boutique_id",
      [
        ["created_at", "gte", range.from],
        ["created_at", "lte", range.to],
      ],
      { limit: 3000 },
    ),
    fetchRows(
      "platform_orders",
      "boutique_id, amount",
      [
        ["created_at", "gte", range.from],
        ["created_at", "lte", range.to],
        ["status", "eq", "completed"],
      ],
      { limit: 3000 },
    ),
    fetchRows("boutiques", "id, name", [["deleted_at", "is", null]], { limit: 500 }),
  ]);

  const boutiqueNameById = new Map(boutiques.map((b) => [b.id, b.name]));

  const map = new Map();
  for (const row of appts) {
    if (!row.boutique_id) continue;
    const e = map.get(row.boutique_id) ?? {
      id: row.boutique_id,
      name: boutiqueNameById.get(row.boutique_id) ?? "Boutique",
      appointments: 0,
      revenue: 0,
      score: 0,
    };
    e.appointments += 1;
    e.score += 2;
    map.set(row.boutique_id, e);
  }
  for (const row of orders) {
    if (!row.boutique_id) continue;
    const e = map.get(row.boutique_id) ?? {
      id: row.boutique_id,
      name: boutiqueNameById.get(row.boutique_id) ?? "Boutique",
      appointments: 0,
      revenue: 0,
      score: 0,
    };
    e.revenue += Number(row.amount ?? 0);
    e.score += Number(row.amount ?? 0) / 1000;
    map.set(row.boutique_id, e);
  }

  return [...map.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((b) => ({
      id: b.id,
      name: b.name,
      appointments: b.appointments,
      revenue: Math.round(b.revenue * 100) / 100,
    }));
}
