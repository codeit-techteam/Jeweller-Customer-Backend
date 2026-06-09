import { Router } from 'express';
import {
  fetchSavedBoutiques,
  saveBoutique,
  unsaveBoutique,
} from '../controllers/savedBoutiquesController.js';

const router = Router();

router.get('/:userId', fetchSavedBoutiques);
router.get('/', fetchSavedBoutiques);
router.post('/', saveBoutique);
router.delete('/', unsaveBoutique);

export default router;

