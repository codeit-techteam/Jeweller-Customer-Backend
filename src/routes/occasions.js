import { Router } from 'express';
import {
  createOccasionHandler,
  deleteOccasionHandler,
  fetchOccasion,
  fetchOccasions,
  reorderOccasionsHandler,
  updateOccasionHandler,
} from '../controllers/occasionController.js';

const router = Router();

router.get('/', fetchOccasions);
router.post('/reorder', reorderOccasionsHandler);
router.get('/:id', fetchOccasion);
router.post('/', createOccasionHandler);
router.put('/:id', updateOccasionHandler);
router.delete('/:id', deleteOccasionHandler);

export default router;
