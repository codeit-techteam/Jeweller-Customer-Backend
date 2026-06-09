import { Router } from 'express';
import {
  createCategoryHandler,
  deleteCategoryHandler,
  fetchCategories,
  fetchCategory,
  fetchCategoryListing,
  reorderCategoriesHandler,
  updateCategoryHandler,
} from '../controllers/categoryController.js';

const router = Router();

router.get('/', fetchCategories);
router.get('/listing/by-slug', fetchCategoryListing);
router.post('/reorder', reorderCategoriesHandler);
router.get('/:id/listing', fetchCategoryListing);
router.get('/:id', fetchCategory);
router.post('/', createCategoryHandler);
router.put('/:id', updateCategoryHandler);
router.delete('/:id', deleteCategoryHandler);

export default router;
