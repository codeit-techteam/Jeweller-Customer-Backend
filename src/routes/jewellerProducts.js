import { Router } from 'express';
import {
  createJewellerProductHandler,
  getJewellerGovernanceSummaryHandler,
  getJewellerProductHandler,
  listJewellerProductsHandler,
  updateJewellerProductHandler,
} from '../controllers/jewellerProductController.js';
import {
  requireProductOwner,
  requireVerifiedJeweller,
} from '../middleware/jeweller.js';

const router = Router();

router.use(requireVerifiedJeweller);

router.get('/governance/summary', getJewellerGovernanceSummaryHandler);
router.get('/products', listJewellerProductsHandler);
router.post('/products', createJewellerProductHandler);
router.get('/products/:id', requireProductOwner, getJewellerProductHandler);
router.put('/products/:id', requireProductOwner, updateJewellerProductHandler);

export default router;
