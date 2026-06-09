import { Router } from 'express';
import {
  createGiftCollectionHandler,
  deleteGiftCollectionHandler,
  fetchGiftCollection,
  fetchGiftCollections,
  reorderGiftCollectionsHandler,
  updateGiftCollectionHandler,
} from '../controllers/giftCollectionController.js';

const router = Router();

router.get('/', fetchGiftCollections);
router.post('/reorder', reorderGiftCollectionsHandler);
router.get('/:id', fetchGiftCollection);
router.post('/', createGiftCollectionHandler);
router.put('/:id', updateGiftCollectionHandler);
router.delete('/:id', deleteGiftCollectionHandler);

export default router;
