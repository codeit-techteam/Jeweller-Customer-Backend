import { Router } from 'express';
import {
  createWishlistItem,
  deleteWishlistItem,
  fetchWishlist,
  fetchWishlistCount,
} from '../controllers/wishlistController.js';
import { requireAuthUser } from '../middleware/auth.js';

const router = Router();

router.use(requireAuthUser);
router.get('/', fetchWishlist);
router.get('/count', fetchWishlistCount);
router.post('/:productId', createWishlistItem);
router.delete('/:productId', deleteWishlistItem);

export default router;
