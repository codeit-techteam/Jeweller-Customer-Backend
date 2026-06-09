/**
 * Central notification engine — single source of truth for:
 * DB persistence (notifications + user_notifications), realtime, and push delivery.
 */
import { supabase } from '../config/supabase.js';
import {
  buildNotificationMetadata,
  deliverNotificationToUser,
  resolveAudienceUserIds,
  sendNotificationCampaign,
} from './notificationService.js';
import { sendPushToUsers } from './pushNotificationService.js';

const USER_NOTIFICATIONS_TABLE = 'user_notifications';

function chunkArray(items, size = 400) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function pushAfterDelivery(userIds, payload) {
  if (!userIds?.length) return;
  await sendPushToUsers(userIds, {
    title: payload.title,
    message: payload.message,
    notificationId: payload.notificationId,
    actionType: payload.actionType,
    actionId: payload.actionId,
    data: payload.metadata ?? {},
  });
}

/**
 * Deliver to one user: DB row + optional push.
 */
export async function dispatchToUser(input) {
  const {
    userId,
    title,
    message,
    type = 'system',
    image = null,
    actionType = 'none',
    actionId = null,
    metadata = {},
    skipPush = false,
  } = input;

  if (!userId) return null;

  const recipientId = await deliverNotificationToUser({
    userId,
    title,
    message,
    type,
    imageUrl: image,
    actionType,
    actionId,
    metadata,
  });

  if (!recipientId || skipPush) {
    return { recipientId, push: { sent: 0 } };
  }

  const { data: row } = await supabase
    .from(USER_NOTIFICATIONS_TABLE)
    .select('notification_id')
    .eq('id', recipientId)
    .maybeSingle();

  const push = await pushAfterDelivery([userId], {
    title,
    message,
    notificationId: row?.notification_id ?? null,
    userNotificationId: recipientId,
    actionType,
    actionId,
    metadata: buildNotificationMetadata({ metadata }),
  });

  return { recipientId, push };
}

/**
 * Broadcast campaign: admin or system bulk send.
 */
export async function dispatchCampaign(payload) {
  const result = await sendNotificationCampaign(payload);
  const userIds = await resolveAudienceUserIds(
    payload.audience ?? 'all',
    payload.selectedUserIds ?? [],
  );

  const push = await pushAfterDelivery(userIds, {
    title: payload.title,
    message: payload.message,
    notificationId: result.notification?.id,
    actionType: payload.actionType ?? 'none',
    actionId: payload.actionId ?? null,
    metadata: payload.metadata ?? {},
  });

  return { ...result, push };
}

/**
 * System event helper — maps event keys to copy + routing.
 */
export async function dispatchSystemEvent(eventKey, context = {}) {
  const handlers = {
    appointment_booked: () =>
      dispatchToUser({
        userId: context.userId,
        title: '✅ Appointment Booked',
        message: `Your appointment request has been submitted${context.boutiqueName ? ` with ${context.boutiqueName}` : ''}.`,
        type: 'appointment',
        actionType: 'appointment',
        actionId: context.appointmentId,
        metadata: {
          eventKey: `appointment_booked:${context.appointmentId}`,
          sourceEvent: 'appointment_booked',
          route: '/(app)/appointments',
        },
      }),
    appointment_approved: () =>
      dispatchToUser({
        userId: context.userId,
        title: '🎉 Appointment Confirmed',
        message: `Your appointment${context.boutiqueName ? ` with ${context.boutiqueName}` : ''} has been approved.`,
        type: 'appointment',
        actionType: 'appointment',
        actionId: context.appointmentId,
        metadata: {
          eventKey: `appointment_approved:${context.appointmentId}`,
          sourceEvent: 'appointment_approved',
          route: '/(app)/appointment-details',
          routeParams: { id: context.appointmentId },
        },
      }),
    appointment_rejected: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'Appointment Not Approved',
        message: `Your appointment request${context.boutiqueName ? ` with ${context.boutiqueName}` : ''} could not be confirmed.`,
        type: 'appointment',
        actionType: 'appointment',
        actionId: context.appointmentId,
        metadata: {
          eventKey: `appointment_rejected:${context.appointmentId}`,
          sourceEvent: 'appointment_rejected',
          route: '/(app)/appointments',
        },
      }),
    callback_submitted: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'Callback request received',
        message: 'We received your callback request. Our team will reach out shortly.',
        type: 'callback',
        actionType: 'callback',
        actionId: context.callbackId,
        metadata: {
          eventKey: `callback_submitted:${context.callbackId}`,
          sourceEvent: 'callback_submitted',
          route: '/(app)/notification-settings',
        },
      }),
    callback_assigned: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'Callback assigned',
        message: 'A support specialist has been assigned to your request.',
        type: 'callback',
        actionType: 'callback',
        actionId: context.callbackId,
        metadata: {
          eventKey: `callback_assigned:${context.callbackId}`,
          sourceEvent: 'callback_assigned',
        },
      }),
    callback_closed: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'Callback closed',
        message: 'Your support request has been closed. Thank you for reaching out.',
        type: 'callback',
        actionType: 'callback',
        actionId: context.callbackId,
        metadata: {
          eventKey: `callback_closed:${context.callbackId}`,
          sourceEvent: 'callback_closed',
        },
      }),
    support_reply: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'GehnaHub Support',
        message: context.ticketNumber
          ? `Support replied to ticket ${context.ticketNumber}.`
          : 'GehnaHub Support replied to your ticket.',
        type: 'support',
        actionType: 'support',
        actionId: context.conversationId,
        metadata: {
          eventKey: `support_reply:${context.conversationId}:${Date.now()}`,
          sourceEvent: 'support_reply',
          route: '/(app)/chat',
          conversationId: context.conversationId,
          ticketNumber: context.ticketNumber ?? null,
        },
      }),
    offer_published: () =>
      dispatchCampaign({
        title: '🔥 New Offer Available',
        message: context.message ?? 'Exclusive jewellery offers are now live.',
        type: 'offer',
        imageUrl: context.image ?? null,
        actionType: 'offer',
        actionId: context.offerId,
        audience: 'customers',
        metadata: {
          sourceEvent: 'offer_published',
          eventKey: `offer_published:${context.offerId}`,
          route: '/(app)/home',
        },
      }),
    collection_added: () =>
      dispatchCampaign({
        title: '✨ New Collection',
        message: context.message ?? 'Explore our latest jewellery collection.',
        type: 'collection',
        imageUrl: context.image ?? null,
        actionType: 'collection',
        actionId: context.collectionId,
        audience: 'customers',
        metadata: {
          sourceEvent: 'collection_added',
          eventKey: `collection_added:${context.collectionId}`,
          route: '/(app)/collection/[slug]',
          routeParams: context.slug ? { slug: context.slug } : undefined,
        },
      }),
    profile_updated: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'Profile updated',
        message: 'Your profile details were saved successfully.',
        type: 'profile',
        actionType: 'none',
        metadata: {
          eventKey: `profile_updated:${context.userId}:${Date.now()}`,
          sourceEvent: 'profile_updated',
          route: '/(app)/edit-profile',
        },
      }),
    kyc_approved: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'KYC Approved',
        message: 'Your verification is complete. You now have full account access.',
        type: 'approval',
        actionType: 'none',
        metadata: { sourceEvent: 'kyc_approved', eventKey: `kyc_approved:${context.userId}` },
      }),
    kyc_rejected: () =>
      dispatchToUser({
        userId: context.userId,
        title: 'KYC Update Required',
        message: context.message ?? 'Please review and resubmit your verification documents.',
        type: 'approval',
        actionType: 'none',
        metadata: { sourceEvent: 'kyc_rejected', eventKey: `kyc_rejected:${context.userId}` },
      }),
    system_maintenance: () =>
      dispatchCampaign({
        title: context.title ?? 'Scheduled maintenance',
        message: context.message ?? 'The app may be briefly unavailable during maintenance.',
        type: 'system',
        audience: 'all',
        metadata: { sourceEvent: 'system_maintenance' },
      }),
    app_update: () =>
      dispatchCampaign({
        title: context.title ?? 'App update available',
        message: context.message ?? 'Update the app for the latest features and fixes.',
        type: 'system',
        audience: 'all',
        metadata: { sourceEvent: 'app_update' },
      }),
  };

  const handler = handlers[eventKey];
  if (!handler) {
    console.warn('[notificationEngine] Unknown event', eventKey);
    return null;
  }
  return handler();
}

export async function listNotificationsAdmin({ limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, type, image, action_type, action_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data ?? [];
}

export async function getNotificationDetailAdmin(notificationId) {
  const { data: notification, error } = await supabase
    .from('notifications')
    .select('id, title, message, type, image, action_type, action_id, metadata, created_at, created_by')
    .eq('id', notificationId)
    .maybeSingle();

  if (error) throw error;
  if (!notification) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }

  const { count: totalRecipients } = await supabase
    .from(USER_NOTIFICATIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('notification_id', notificationId);

  const { count: readCount } = await supabase
    .from(USER_NOTIFICATIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('notification_id', notificationId)
    .eq('is_read', true);

  const total = totalRecipients ?? 0;
  const read = readCount ?? 0;
  const audience = notification.metadata?.audience ?? 'unknown';

  return {
    ...notification,
    audience,
    totalRecipients: total,
    readCount: read,
    unreadCount: Math.max(0, total - read),
    readRate: total > 0 ? Math.round((read / total) * 100) : 0,
  };
}

export async function getUserNotificationSettings(userId) {
  await supabase.rpc('ensure_notification_settings', { p_user_id: userId });
  const { data, error } = await supabase
    .from('notification_settings')
    .select('user_id, offers_enabled, appointments_enabled, support_enabled, system_enabled, push_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (
    data ?? {
      user_id: userId,
      offers_enabled: true,
      appointments_enabled: true,
      support_enabled: true,
      system_enabled: true,
      push_enabled: true,
    }
  );
}

export async function updateUserNotificationSettings(userId, patch) {
  await supabase.rpc('ensure_notification_settings', { p_user_id: userId });
  const { data, error } = await supabase
    .from('notification_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
