import { Router } from 'express';
import {
  createRelationshipSectionHandler,
  deleteRelationshipSectionHandler,
  fetchRelationshipSection,
  fetchRelationshipSectionListing,
  fetchRelationshipSections,
  reorderRelationshipSectionsHandler,
  updateRelationshipSectionHandler,
} from '../controllers/relationshipSectionController.js';

const router = Router();

router.get('/', fetchRelationshipSections);
router.post('/reorder', reorderRelationshipSectionsHandler);
router.get('/:id/listing', fetchRelationshipSectionListing);
router.get('/:id', fetchRelationshipSection);
router.post('/', createRelationshipSectionHandler);
router.put('/:id', updateRelationshipSectionHandler);
router.delete('/:id', deleteRelationshipSectionHandler);

export default router;
