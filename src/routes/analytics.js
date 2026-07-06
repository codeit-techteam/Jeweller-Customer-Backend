import { Router } from "express";
import {
  exportAnalyticsCsv,
  exportAnalyticsPdf,
  fetchActivityDetails,
  fetchAdminCustomerAnalytics,
  fetchBoutiqueAnalytics,
  fetchBoutiqueOverviewStats,
  fetchBoutiqueOptions,
  fetchBoutiquePendingActions,
  fetchCategoryDetailDrilldown,
  fetchCustomerAnalytics,
  fetchPlatformAnalytics,
  fetchProductDrilldown,
  fetchSearchKeywordDrilldown,
  fetchWishlistDetails,
  linkVisitor,
  recordEvent,
} from "../controllers/analyticsController.js";

const router = Router();

router.post("/events", recordEvent);
router.post("/link-visitor", linkVisitor);
router.get("/platform", fetchPlatformAnalytics);
router.get("/boutique", fetchBoutiqueAnalytics);
router.get("/boutique-overview", fetchBoutiqueOverviewStats);
router.get("/boutique-pending-actions", fetchBoutiquePendingActions);
router.get("/product-drilldown", fetchProductDrilldown);
router.get("/customers/analytics", fetchAdminCustomerAnalytics);
// Customer Analytics drill-down endpoints (right-side drawer data, lazy-loaded on click)
router.get("/customers/activity-details", fetchActivityDetails);
router.get("/customers/wishlist-details", fetchWishlistDetails);
router.get("/customers/search-keyword-details", fetchSearchKeywordDrilldown);
router.get("/customers/category-details", fetchCategoryDetailDrilldown);
// Legacy aliases kept for backward compatibility
router.get("/customers/search-drilldown", fetchSearchKeywordDrilldown);
router.get("/customers/category-drilldown", fetchCategoryDetailDrilldown);
router.get("/boutiques", fetchBoutiqueOptions);
router.get("/customer", fetchCustomerAnalytics);
router.get("/export/csv", exportAnalyticsCsv);
router.get("/export/pdf", exportAnalyticsPdf);

export default router;
