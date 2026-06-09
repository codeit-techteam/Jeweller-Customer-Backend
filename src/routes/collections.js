import { Router } from 'express';
import {
  createCollectionHandler,
  deleteCollectionHandler,
  fetchCollection,
  fetchCollectionBySlug,
  fetchCollections,
  reorderCollectionsHandler,
  updateCollectionHandler,
} from '../controllers/collectionController.js';

const router = Router();

router.get('/', fetchCollections);
router.post('/reorder', reorderCollectionsHandler);
router.get('/slug/:slug', fetchCollectionBySlug);
router.get('/:id', fetchCollection);
router.post('/', createCollectionHandler);
router.put('/:id', updateCollectionHandler);
router.delete('/:id', deleteCollectionHandler);

export default router;
