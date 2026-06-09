import {
  getDashboardStats,
  getRecentlyViewedAnalytics,
  getWishlistAnalytics,
} from "../services/dashboardService.js";

export async function fetchDashboardStats(_req, res, next) {
  try {
    const stats = await getDashboardStats();
    return res.status(200).json({
      success: true,
      data: stats,
      message: "Dashboard stats fetched successfully",
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchWishlistAnalytics(_req, res, next) {
  try {
    const data = await getWishlistAnalytics();
    return res.status(200).json({
      success: true,
      data,
      message: "Wishlist analytics fetched successfully",
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchRecentlyViewedAnalytics(_req, res, next) {
  try {
    const data = await getRecentlyViewedAnalytics();
    return res.status(200).json({
      success: true,
      data,
      message: "Recently viewed analytics fetched successfully",
    });
  } catch (error) {
    return next(error);
  }
}
