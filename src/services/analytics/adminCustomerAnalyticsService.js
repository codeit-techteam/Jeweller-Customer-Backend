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

const POWER_USER_THRESHOLD = 10;

function parseLocationParts(location) {
  if (!location) return { city: null, state: null };
  const parts = String(location)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0], state: parts[parts.length - 1] };
  }
  return { city: parts[0] ?? null, state: null };
}

/**
 * Enhanced customer analytics dashboard.
 * GET /api/analytics/customers/analytics
 */
export async function getAdminCustomerAnalytics(query = {}) {
  const range = getDateRange(query);
  const dateFilters = [
    ["created_at", "gte", range.from],
    ["created_at", "lte", range.to],
  ];
  const viewedAtFilters = [
    ["viewed_at", "gte", range.from],
    ["viewed_at", "lte", range.to],
  ];

  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [
    totalCustomers,
    newUsers,
    wishlistRows,
    searchRows,
    viewRows,
    appointments,
    sessions,
    allUsers,
    products,
  ] = await Promise.all([
    countRows("users_profile"),
    countRows("users_profile", dateFilters),
    fetchRows("wishlist_items", "user_id, product_id, created_at", dateFilters, { limit: 8000 }),
    fetchRows("search_history", "keyword, user_id, created_at", dateFilters, { limit: 8000 }),
    fetchRows("recently_viewed", "product_id, user_id, viewed_at", viewedAtFilters, {
      limit: 8000,
    }),
    fetchRows("appointments", "user_id, created_at, status", dateFilters, { limit: 5000 }),
    fetchRows("analytics_sessions", "user_id, city, started_at, last_seen_at, duration_seconds", [], {
      limit: 8000,
    }),
    fetchRows("users_profile", "id, full_name, created_at", [], { limit: 5000 }),
    fetchRows("products", "id, gender, category_id, categories!category_id(name)", [], { limit: 1000 }),
  ]);

  const rangeStart = new Date(range.from).getTime();
  const returningUsers = new Set();
  const newInRange = new Set();

  for (const user of allUsers) {
    const created = new Date(user.created_at).getTime();
    if (created >= rangeStart) {
      newInRange.add(user.id);
    } else {
      returningUsers.add(user.id);
    }
  }

  const activeUserIds = new Set();
  const activityByUser = new Map();

  function bumpActivity(userId, weight = 1) {
    if (!userId) return;
    activeUserIds.add(userId);
    activityByUser.set(userId, (activityByUser.get(userId) ?? 0) + weight);
  }

  for (const row of wishlistRows) bumpActivity(row.user_id, 2);
  for (const row of searchRows) bumpActivity(row.user_id, 1);
  for (const row of viewRows) bumpActivity(row.user_id, 1);
  for (const row of appointments) bumpActivity(row.user_id, 3);

  const dailyActiveUsers = sessions.filter(
    (s) => new Date(s.last_seen_at).getTime() >= dayAgo.getTime(),
  ).length;
  const monthlyActiveUsers = sessions.filter(
    (s) => new Date(s.last_seen_at).getTime() >= monthAgo.getTime(),
  ).length;

  const powerUsers = [...activityByUser.entries()]
    .filter(([, score]) => score >= POWER_USER_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, score]) => {
      const profile = allUsers.find((u) => u.id === userId);
      return {
        id: userId,
        name: profile?.full_name ?? "Customer",
        activityScore: score,
      };
    });

  const cityCounts = topCounts(
    sessions.filter((s) => s.city),
    (r) => ({ id: r.city.toLowerCase(), label: r.city, meta: {} }),
    10,
  );

  const stateMap = new Map();
  for (const row of sessions) {
    if (row.city) {
      const { state } = parseLocationParts(row.city);
      if (state) {
        const key = state.toLowerCase();
        stateMap.set(key, (stateMap.get(key) ?? 0) + 1);
      }
    }
  }
  const topStates = [...stateMap.entries()]
    .map(([id, count]) => ({ id, label: id.replace(/\b\w/g, (c) => c.toUpperCase()), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const genderSegments = { female: 0, male: 0, unisex: 0, kids: 0, unknown: 0 };
  const productGenderMap = new Map(products.map((p) => [p.id, p.gender]));
  const productCategoryMap = new Map(
    products.map((p) => [p.id, p.categories?.name ?? "Uncategorized"]),
  );
  for (const row of viewRows) {
    const raw = productGenderMap.get(row.product_id);
    let tags = [];
    try {
      tags = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    } catch {
      tags = raw ? [raw] : [];
    }
    const tag = String(tags[0] ?? "unknown").toLowerCase();
    if (tag.includes("female") || tag.includes("her")) genderSegments.female += 1;
    else if (tag.includes("male") || tag.includes("him")) genderSegments.male += 1;
    else if (tag.includes("kid")) genderSegments.kids += 1;
    else if (tag.includes("unisex")) genderSegments.unisex += 1;
    else genderSegments.unknown += 1;
  }

  const genderChart = Object.entries(genderSegments)
    .filter(([, count]) => count > 0)
    .map(([segment, count]) => ({ segment, count }));

  const ageGroups = [
    { segment: "New (0–30 days)", count: newInRange.size },
    { segment: "Established (30+ days)", count: returningUsers.size },
  ];

  const avgSessionSeconds =
    sessions.length > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + Number(s.duration_seconds ?? 0), 0) / sessions.length,
        )
      : 0;

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
    [...searchKeywordMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
  );

  const mostViewedCategories = withPercentages(
    topCounts(
      viewRows,
      (r) => {
        const category = productCategoryMap.get(r.product_id) ?? "Uncategorized";
        return { id: category.toLowerCase(), label: category, meta: {} };
      },
      10,
    ),
  );

  return {
    range,
    cards: {
      totalCustomers,
      dailyActiveUsers,
      monthlyActiveUsers,
      powerUsers: powerUsers.length,
      returningUsers: returningUsers.size,
      newUsers,
      wishlistActivity: wishlistRows.length,
      searchTrends: searchRows.length,
      recentlyViewedCount: viewRows.length,
      appointments: appointments.length,
      averageSessionSeconds: avgSessionSeconds,
      averageSessionMinutes: Math.round((avgSessionSeconds / 60) * 10) / 10,
    },
    charts: {
      userActivityTimeline,
      searchAnalytics: enrichSeriesWithInsights(
        fillDateSeries(groupByDay(searchRows), range.from, range.to),
      ),
      wishlistGrowth: enrichSeriesWithInsights(
        fillDateSeries(groupByDay(wishlistRows), range.from, range.to),
      ),
      gender: genderChart,
      ageGroups,
      topCities: withPercentages(cityCounts),
      topStates: withPercentages(topStates),
    },
    sections: {
      topSearchKeywords,
      mostViewedCategories,
      powerUsers,
      mostActiveCustomers: powerUsers,
      customerSegments: [
        { segment: "Power Users", count: powerUsers.length },
        { segment: "Returning Users", count: returningUsers.size },
        { segment: "New Users", count: newInRange.size },
      ],
    },
  };
}
