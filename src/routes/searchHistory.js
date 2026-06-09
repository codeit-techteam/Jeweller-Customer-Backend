import { Router } from 'express';
import {
  clearSearchHistoryHandler,
  createSearchHistoryHandler,
  deleteSearchHistoryItemHandler,
  fetchSearchHistory,
} from '../controllers/searchHistoryController.js';
import { requireAuthUser } from '../middleware/auth.js';

const router = Router();

router.use(requireAuthUser);

router.get('/', fetchSearchHistory);
router.post('/', createSearchHistoryHandler);
router.delete('/clear', clearSearchHistoryHandler);
router.delete('/:id', deleteSearchHistoryItemHandler);

export default router;
