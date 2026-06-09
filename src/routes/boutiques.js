import { Router } from 'express';
import {
  createBoutiqueHandler,
  editBoutique,
  patchBoutiqueAdmin,
  fetchBoutiqueCollections,
  fetchBoutiqueDetailsById,
  fetchBoutiqueById,
  fetchBoutiqueProducts,
  fetchBoutiques,
  removeBoutique,
} from '../controllers/boutiqueController.js';

const router = Router();

router.get('/', fetchBoutiques);
router.post('/', createBoutiqueHandler);
router.get('/:id/details', fetchBoutiqueDetailsById);
router.get('/:id/products', fetchBoutiqueProducts);
router.get('/:id/collections', fetchBoutiqueCollections);
router.get('/:id', fetchBoutiqueById);
router.patch('/:id', patchBoutiqueAdmin);
router.put('/:id', editBoutique);
router.delete('/:id', removeBoutique);

export default router;
