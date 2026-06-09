import { Router } from 'express';
import {
  getCallbackNextStatus,
  listCallbackRequestsAdminHandler,
  patchCallbackRequestAdmin,
  postCallbackRequest,
} from '../controllers/callbackRequestController.js';

const router = Router();

router.get('/admin', listCallbackRequestsAdminHandler);
router.get('/admin/next-status', getCallbackNextStatus);
router.patch('/admin/:id', patchCallbackRequestAdmin);

router.post('/', postCallbackRequest);

export default router;
