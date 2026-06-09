import { Router } from 'express';
import {
  deleteCustomerNotification,
  getCustomerNotificationRecipient,
  getCustomerUnreadCount,
  getNotificationDetailHandler,
  getNotificationSettings,
  getNotificationStats,
  listCustomerNotifications,
  listNotificationsAdminHandler,
  patchCustomerNotificationRead,
  patchCustomerNotificationsReadAll,
  patchNotificationSettings,
  postNotificationEvent,
  postPushToken,
  postSendNotification,
} from '../controllers/notificationController.js';

const router = Router();

router.get('/', listCustomerNotifications);
router.get('/unread-count', getCustomerUnreadCount);
router.patch('/read-all', patchCustomerNotificationsReadAll);
router.get('/recipient/:recipientId', getCustomerNotificationRecipient);
router.patch('/:recipientId/read', patchCustomerNotificationRead);
router.delete('/:recipientId', deleteCustomerNotification);

router.get('/stats', getNotificationStats);
router.get('/admin', listNotificationsAdminHandler);
router.get('/admin/:notificationId', getNotificationDetailHandler);
router.post('/send', postSendNotification);
router.post('/events', postNotificationEvent);
router.post('/push-token', postPushToken);
router.get('/settings/:userId', getNotificationSettings);
router.patch('/settings/:userId', patchNotificationSettings);

export default router;
