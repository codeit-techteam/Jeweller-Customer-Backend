import { Router } from 'express';
import { requireAdmin } from '../middleware/admin.js';
import {
  createNotificationRuleHandler,
  listNotificationRulesHandler,
  previewNotificationRuleHandler,
  sendNotificationHandler,
  updateNotificationRuleHandler,
} from '../controllers/notificationRuleController.js';

const router = Router();

router.use(requireAdmin);

router.get('/notification-rules', listNotificationRulesHandler);
router.post('/notification-rules', createNotificationRuleHandler);
router.put('/notification-rules/:id', updateNotificationRuleHandler);
router.get('/notification-preview', previewNotificationRuleHandler);
router.post('/send-notification', sendNotificationHandler);

export default router;
