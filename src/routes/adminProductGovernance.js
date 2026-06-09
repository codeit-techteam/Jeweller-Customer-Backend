import { Router } from 'express';
import { requireAdmin } from '../middleware/admin.js';
import {
  clearFlagHandler,
  createCorrectionRequestHandler,
  flagProductHandler,
  getGovernanceStateHandler,
  getProductActivityFeedHandler,
  getProductGovernanceHandler,
  reinstateProductHandler,
  resolveCorrectionRequestHandler,
  suspendProductHandler,
  updateProductCurationHandler,
} from '../controllers/productGovernanceController.js';

const router = Router();

router.use(requireAdmin);

router.get('/product-activity', getProductActivityFeedHandler);

router.get('/products/:id/governance', getProductGovernanceHandler);
router.get('/products/:id/governance-state', getGovernanceStateHandler);

router.post('/products/:id/flag', flagProductHandler);
router.post('/products/:id/clear-flag', clearFlagHandler);
router.post('/products/:id/suspend', suspendProductHandler);
router.post('/products/:id/reinstate', reinstateProductHandler);
router.post('/products/:id/correction-request', createCorrectionRequestHandler);
router.post('/products/:id/correction-requests/:requestId/resolve', resolveCorrectionRequestHandler);

router.patch('/products/:id/curation', updateProductCurationHandler);

export default router;
