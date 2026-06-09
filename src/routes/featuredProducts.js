import { Router } from 'express';
import {
  deleteFeaturedProductHandler,
  fetchFeaturedProducts,
  reorderFeaturedProductsHandler,
  replaceFeaturedProductsHandler,
  updateFeaturedProductHandler,
} from '../controllers/featuredProductController.js';

const router = Router();

router.get('/', fetchFeaturedProducts);
router.put('/sync', replaceFeaturedProductsHandler);
router.post('/reorder', reorderFeaturedProductsHandler);
router.put('/:id', updateFeaturedProductHandler);
router.delete('/:id', deleteFeaturedProductHandler);

export default router;
