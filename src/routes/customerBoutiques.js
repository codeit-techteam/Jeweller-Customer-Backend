import { Router } from 'express';
import { fetchFeaturedBoutiques } from '../controllers/boutiqueController.js';

const router = Router();

router.get('/featured', fetchFeaturedBoutiques);

export default router;
