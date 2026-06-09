import {
  addRecentlyViewed,
  getRecentlyViewed,
  clearRecentlyViewedForUser,
} from '../services/recentlyViewedService.js';

export async function createRecentlyViewed(req, res, next) {
  try {
    console.log('[recentlyViewedController] POST /api/recently-viewed');
    const data = await addRecentlyViewed(req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function fetchRecentlyViewed(req, res, next) {
  try {
    const userId = req.params.userId ?? req.params.user_id;
    console.log('[recentlyViewedController] GET /api/recently-viewed/:userId', { userId });
    const data = await getRecentlyViewed(userId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function clearRecentlyViewed(req, res, next) {
  try {
    const userId = req.params.userId ?? req.params.user_id;
    console.log('[recentlyViewedController] DELETE /api/recently-viewed/:userId', { userId });
    await clearRecentlyViewedForUser(userId);
    return res.status(200).json({ success: true, data: true });
  } catch (error) {
    return next(error);
  }
}
