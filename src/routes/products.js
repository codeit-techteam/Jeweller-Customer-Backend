import { Router } from 'express';
import {
  createProductHandler,
  deleteProductHandler,
  fetchProductById,
  fetchProducts,
  fetchTrendingProducts,
  updateProductHandler,
} from '../controllers/productController.js';

const router = Router();

router.get('/trending', fetchTrendingProducts);
router.get('/', fetchProducts);
router.get('/:id', fetchProductById);
router.post('/', createProductHandler);
router.put('/:id', updateProductHandler);
router.delete('/:id', deleteProductHandler);

export default router;
