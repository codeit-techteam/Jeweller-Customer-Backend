import {
  dispatchCampaign,
  dispatchSystemEvent,
  getNotificationDetailAdmin,
  getUserNotificationSettings,
  listNotificationsAdmin,
  updateUserNotificationSettings,
} from '../services/notificationEngine.js';
import {
  deleteNotificationForUser,
  fetchNotificationRecipientForUser,
  fetchNotificationsPageForUser,
  fetchUnreadCountForUser,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
} from '../services/customerNotificationService.js';
import { getNotificationAnalytics } from '../services/notificationService.js';
import { upsertPushToken } from '../services/pushNotificationService.js';

function resolveUserId(req) {
  const fromQuery = req.query.userId;
  const fromHeader = req.headers['x-user-id'];
  const raw = typeof fromQuery === 'string' && fromQuery.trim()
    ? fromQuery.trim()
    : typeof fromHeader === 'string' && fromHeader.trim()
      ? fromHeader.trim()
      : null;
  return raw;
}

export async function listCustomerNotifications(req, res, next) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const page = Number(req.query.page ?? 0);
    const pageSize = Number(req.query.pageSize ?? 20);
    const data = await fetchNotificationsPageForUser(userId, page, pageSize);
    return res.status(200).json({
      success: true,
      data,
      message: 'Notifications loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getCustomerUnreadCount(req, res, next) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const count = await fetchUnreadCountForUser(userId);
    return res.status(200).json({
      success: true,
      data: { count },
      message: 'Unread count loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getCustomerNotificationRecipient(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { recipientId } = req.params;
    if (!userId || !recipientId) {
      return res.status(400).json({ success: false, message: 'userId and recipientId required' });
    }
    const data = await fetchNotificationRecipientForUser(userId, recipientId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Notification loaded' });
  } catch (error) {
    return next(error);
  }
}

export async function patchCustomerNotificationRead(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { recipientId } = req.params;
    if (!userId || !recipientId) {
      return res.status(400).json({ success: false, message: 'userId and recipientId required' });
    }
    await markNotificationReadForUser(userId, recipientId);
    return res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (error) {
    return next(error);
  }
}

export async function patchCustomerNotificationsReadAll(req, res, next) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await markAllNotificationsReadForUser(userId);
    return res.status(200).json({ success: true, message: 'All marked as read' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteCustomerNotification(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { recipientId } = req.params;
    if (!userId || !recipientId) {
      return res.status(400).json({ success: false, message: 'userId and recipientId required' });
    }
    await deleteNotificationForUser(userId, recipientId);
    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function postSendNotification(req, res, next) {
  try {
    const result = await dispatchCampaign(req.body ?? {});
    return res.status(201).json({
      success: true,
      data: result,
      message: `Notification sent to ${result.recipientCount} users`,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function getNotificationStats(req, res, next) {
  try {
    const data = await getNotificationAnalytics();
    return res.status(200).json({
      success: true,
      data,
      message: 'Notification analytics loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function listNotificationsAdminHandler(req, res, next) {
  try {
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const data = await listNotificationsAdmin({ limit, offset });
    return res.status(200).json({ success: true, data, message: 'Notifications loaded' });
  } catch (error) {
    return next(error);
  }
}

export async function getNotificationDetailHandler(req, res, next) {
  try {
    const data = await getNotificationDetailAdmin(req.params.notificationId);
    return res.status(200).json({ success: true, data, message: 'Notification detail loaded' });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postPushToken(req, res, next) {
  try {
    const { userId, token, platform, provider } = req.body ?? {};
    const data = await upsertPushToken({ userId, token, platform, provider });
    return res.status(200).json({ success: true, data, message: 'Push token saved' });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function getNotificationSettings(req, res, next) {
  try {
    const userId = req.params.userId ?? req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const data = await getUserNotificationSettings(String(userId));
    return res.status(200).json({ success: true, data, message: 'Settings loaded' });
  } catch (error) {
    return next(error);
  }
}

export async function postNotificationEvent(req, res, next) {
  try {
    const { eventKey, context } = req.body ?? {};
    if (!eventKey || typeof eventKey !== 'string') {
      return res.status(400).json({ success: false, message: 'eventKey required' });
    }
    const data = await dispatchSystemEvent(eventKey, context ?? {});
    return res.status(201).json({
      success: true,
      data,
      message: 'Notification event dispatched',
    });
  } catch (error) {
    return next(error);
  }
}

export async function patchNotificationSettings(req, res, next) {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const data = await updateUserNotificationSettings(String(userId), req.body ?? {});
    return res.status(200).json({ success: true, data, message: 'Settings updated' });
  } catch (error) {
    return next(error);
  }
}
