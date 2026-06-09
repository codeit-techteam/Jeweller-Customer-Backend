import { Router } from 'express';
import {
  createFeaturedSectionHandler,
  deleteFeaturedSectionHandler,
  fetchFeaturedSection,
  fetchFeaturedSectionBySlug,
  fetchFeaturedSections,
  reorderFeaturedSectionsHandler,
  updateFeaturedSectionHandler,
} from '../controllers/featuredSectionController.js';

const router = Router();

router.get('/', fetchFeaturedSections);
router.post('/reorder', reorderFeaturedSectionsHandler);
router.get('/slug/:slug', fetchFeaturedSectionBySlug);
router.get('/:id', fetchFeaturedSection);
router.post('/', createFeaturedSectionHandler);
router.put('/:id', updateFeaturedSectionHandler);
router.delete('/:id', deleteFeaturedSectionHandler);

export default router;
