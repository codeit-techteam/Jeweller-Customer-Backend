import { Router } from 'express';
import {
  createOfferHandler,
  deleteOfferHandler,
  fetchOffer,
  fetchOffers,
  reorderOffersHandler,
  updateOfferHandler,
} from '../controllers/offerController.js';

const router = Router();

router.get('/', fetchOffers);
router.post('/reorder', reorderOffersHandler);
router.get('/:id', fetchOffer);
router.post('/', createOfferHandler);
router.put('/:id', updateOfferHandler);
router.delete('/:id', deleteOfferHandler);

export default router;
