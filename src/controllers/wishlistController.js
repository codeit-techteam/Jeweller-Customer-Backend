import {
  addWishlistItem,
  getWishlistCount,
  getWishlistForUser,
  removeWishlistItem,
} from '../services/wishlistService.js';

export async function fetchWishlist(req, res, next) {
  try {
    const userId = req.userId;
    console.log('CURRENT AUTH USER:', req.authUser ?? null);
    console.log('WISHLIST USER:', userId);
    const data = await getWishlistForUser(userId);
    console.log('WISHLIST FETCH SUCCESS:', data.length);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function createWishlistItem(req, res, next) {
  try {
    const userId = req.userId;
    const { productId } = req.params;
    console.log('CURRENT AUTH USER:', req.authUser ?? null);
    console.log('AUTH USER:', userId);
    const data = await addWishlistItem(userId, productId, req.authUser);
    console.log('WISHLIST SAVE SUCCESS:', { userId, productId });
    return res.status(data?.alreadyExists ? 200 : 201).json({ success: true, data });
  } catch (error) {
    console.log('WISHLIST ERROR:', error?.message ?? error);
    return next(error);
  }
}

export async function deleteWishlistItem(req, res, next) {
  try {
    const userId = req.userId;
    const { productId } = req.params;
    await removeWishlistItem(userId, productId);
    return res.status(200).json({ success: true, data: true });
  } catch (error) {
    return next(error);
  }
}

export async function fetchWishlistCount(req, res, next) {
  try {
    const userId = req.userId;
    const count = await getWishlistCount(userId);
    console.log('WISHLIST COUNT:', count);
    return res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    return next(error);
  }
}
