import { Router } from "express";
import {
  fetchDashboardStats,
  fetchRecentlyViewedAnalytics,
  fetchWishlistAnalytics,
} from "../controllers/dashboardController.js";

const router = Router();

router.get("/stats", fetchDashboardStats);
router.get("/wishlist-analytics", fetchWishlistAnalytics);
router.get("/recently-viewed-analytics", fetchRecentlyViewedAnalytics);

export default router;
