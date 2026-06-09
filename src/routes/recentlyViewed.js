import { Router } from 'express';
import {
  createRecentlyViewed,
  fetchRecentlyViewed,
  clearRecentlyViewed,
} from '../controllers/recentlyViewedController.js';

const router = Router();

router.post('/', createRecentlyViewed);
router.get('/:userId', fetchRecentlyViewed);
router.delete('/:userId', clearRecentlyViewed);

export default router;
