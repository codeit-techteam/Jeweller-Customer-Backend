import { fetchRows, resolveDrilldownWindow } from "./_helpers.js";

/**
 * Day-level breakdown behind a single "User Activity Timeline" chart point.
 * GET /api/analytics/customers/activity-details
 *
 * Supports:
 *  - date=YYYY-MM-DD            (single day, matches the clicked chart point)
 *  - startDate & endDate        (custom range)
 *  - range=today|7d|30d         (preset range, falls back to 30d)
 */
export async function getActivityDetails(query = {}) {
  const window = resolveDrilldownWindow(query);
  const createdAtFilters = [
    ["created_at", "gte", window.from],
    ["created_at", "lte", window.to],
  ];
  const viewedAtFilters = [
    ["viewed_at", "gte", window.from],
    ["viewed_at", "lte", window.to],
  ];

  const [newUserRows, wishlistRows, searchRows, viewRows, appointmentRows] = await Promise.all([
    fetchRows("users_profile", "id", createdAtFilters, { limit: 5000 }),
    fetchRows("wishlist_items", "id, user_id, product_id, created_at", createdAtFilters, { limit: 5000 }),
    fetchRows("search_history", "id, keyword, user_id, created_at", createdAtFilters, { limit: 5000 }),
    fetchRows("recently_viewed", "id, product_id, user_id, viewed_at", viewedAtFilters, { limit: 5000 }),
    fetchRows("appointments", "id, user_id, created_at, status", createdAtFilters, { limit: 2000 }).catch(
      () => [],
    ),
  ]);

  const newUserRegistrations = newUserRows.length;
  const wishlistActivities = wishlistRows.length;
  const searchActivities = searchRows.length;
  const recentlyViewedActivities = viewRows.length;
  const appointmentActivities = appointmentRows.length;

  // Matches the same calculation used to build the User Activity Timeline chart
  // (wishlist + search + recently-viewed events), so the total lines up with
  // the value shown on the point the admin clicked.
  const totalCustomerActivities = wishlistActivities + searchActivities + recentlyViewedActivities;

  return {
    date: window.date,
    range: { from: window.from, to: window.to },
    totalCustomerActivities,
    newUserRegistrations,
    wishlistActivities,
    searchActivities,
    recentlyViewedActivities,
    appointmentActivities,
  };
}
