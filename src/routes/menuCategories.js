import { Router } from 'express';
import {
  createMenuCategoryHandler,
  deleteMenuCategoryHandler,
  fetchMenuCategories,
  fetchMenuCategory,
  reorderMenuCategoriesHandler,
  updateMenuCategoryHandler,
} from '../controllers/menuCategoryController.js';

const router = Router();

router.get('/', fetchMenuCategories);
router.post('/reorder', reorderMenuCategoriesHandler);
router.get('/:id', fetchMenuCategory);
router.post('/', createMenuCategoryHandler);
router.put('/:id', updateMenuCategoryHandler);
router.delete('/:id', deleteMenuCategoryHandler);

export default router;
