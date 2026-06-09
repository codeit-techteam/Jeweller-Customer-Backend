import { supabase } from '../config/supabase.js';

const NOTIFICATION_TYPES = new Set([
  'offer',
  'appointment',
  'callback',
  'system',
  'gold_rate',
  'collection',
  'promotion',
  'profile',
  'order',
  'lead',
  'document',
  'payment',
  'approval',
]);

const ACTION_TYPES = new Set([
  'none',
  'offer',
  'appointment',
  'collection',
  'boutique',
  'url',
  'order',
  'callback',
]);

const AUDIENCE_TYPES = new Set(['all', 'customers', 'boutique_owners', 'selected']);

function chunkArray(items, size = 400) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildNotificationMetadata(input = {}) {
  const metadata = { ...(input.metadata ?? {}) };
  if (input.route) metadata.route = input.route;
  if (input.routeParams) metadata.routeParams = input.routeParams;
  if (input.sourceEvent) metadata.source_event = input.sourceEvent;
  if (input.eventKey) metadata.event_key = input.eventKey;
  return metadata;
}

export async function resolveAudienceUserIds(audience, selectedUserIds = []) {
  if (audience === 'selected') {
    return [...new Set(selectedUserIds.filter(Boolean))];
  }

  if (audience === 'boutique_owners') {
    const { data, error } = await supabase
      .from('boutiques')
      .select('jeweller_user_id')
      .not('jeweller_user_id', 'is', null);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.jeweller_user_id).filter(Boolean))];
  }

  const { data: profiles, error: profileError } = await supabase
    .from('users_profile')
    .select('id');
  if (profileError) throw profileError;

  const allIds = (profiles ?? []).map((r) => r.id).filter(Boolean);
  if (audience === 'all') return allIds;

  if (audience === 'customers') {
    const { data: owners, error: ownerError } = await supabase
      .from('boutiques')
      .select('jeweller_user_id')
      .not('jeweller_user_id', 'is', null);
    if (ownerError) throw ownerError;
    const ownerSet = new Set((owners ?? []).map((r) => r.jeweller_user_id));
    return allIds.filter((id) => !ownerSet.has(id));
  }

  return allIds;
}

/**
 * Creates one notification row and recipient rows (batched).
 */
export async function sendNotificationCampaign(payload) {
  const {
    title,
    message,
    type = 'system',
    imageUrl = null,
    actionType = 'none',
    actionId = null,
    metadata = {},
    audience = 'all',
    selectedUserIds = [],
    createdBy = null,
  } = payload;

  if (!title?.trim() || !message?.trim()) {
    const err = new Error('title and message are required');
    err.status = 400;
    throw err;
  }
  if (!NOTIFICATION_TYPES.has(type)) {
    const err = new Error('Invalid notification type');
    err.status = 400;
    throw err;
  }
  if (!ACTION_TYPES.has(actionType)) {
    const err = new Error('Invalid action type');
    err.status = 400;
    throw err;
  }
  if (!AUDIENCE_TYPES.has(audience)) {
    const err = new Error('Invalid audience');
    err.status = 400;
    throw err;
  }

  const userIds = await resolveAudienceUserIds(audience, selectedUserIds);
  if (userIds.length === 0) {
    const err = new Error('No recipients matched the selected audience');
    err.status = 400;
    throw err;
  }

  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .insert({
      title: title.trim(),
      message: message.trim(),
      type,
      image: imageUrl,
      action_type: actionType,
      action_id: actionId,
      metadata: { ...buildNotificationMetadata({ metadata }), audience },
      created_by: createdBy,
    })
    .select('id, title, message, type, created_at')
    .single();

  if (notifError) throw notifError;

  let delivered = 0;
  for (const batch of chunkArray(userIds)) {
    const { data: count, error: attachError } = await supabase.rpc(
      'attach_notification_recipients',
      {
        p_notification_id: notification.id,
        p_user_ids: batch,
        p_type: type,
      },
    );
    if (attachError) throw attachError;
    delivered += Number(count ?? 0);
  }

  return {
    notification,
    recipientCount: delivered,
    audience,
  };
}

export async function deliverNotificationToUser(input) {
  const {
    userId,
    title,
    message,
    type = 'system',
    imageUrl = null,
    actionType = 'none',
    actionId = null,
    metadata = {},
  } = input;

  if (!userId) return null;

  const { data, error } = await supabase.rpc('deliver_notification', {
    p_user_id: userId,
    p_title: title,
    p_message: message,
    p_type: type,
    p_image_url: imageUrl,
    p_action_type: actionType,
    p_action_id: actionId ? String(actionId) : null,
    p_metadata: buildNotificationMetadata({ metadata }),
  });

  if (error) throw error;
  return data;
}

export async function getNotificationAnalytics() {
  const [
    { count: totalSent, error: sentError },
    { count: delivered, error: deliveredError },
    { count: readCount, error: readError },
  ] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true }),
    supabase.from('user_notifications').select('id', { count: 'exact', head: true }),
    supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', true),
  ]);

  if (sentError) throw sentError;
  if (deliveredError) throw deliveredError;
  if (readError) throw readError;

  const deliveredCount = delivered ?? 0;
  const read = readCount ?? 0;

  const unread = Math.max(0, deliveredCount - read);
  const readRate = deliveredCount > 0 ? Math.round((read / deliveredCount) * 100) : 0;

  return {
    totalSent: totalSent ?? 0,
    delivered: deliveredCount,
    read,
    unread,
    readRate,
  };
}

export async function notifyAppointmentBooked({
  userId,
  appointmentId,
  boutiqueId,
  boutiqueName,
  date,
  time,
  jewellerUserId,
  customerName,
}) {
  if (userId) {
    await deliverNotificationToUser({
      userId,
      title: '✅ Appointment Booked',
      message: `Your appointment request has been submitted successfully${boutiqueName ? ` with ${boutiqueName}` : ''} for ${date} at ${time}.`,
      type: 'appointment',
      actionType: 'appointment',
      actionId: appointmentId,
      metadata: {
        eventKey: `appointment_booked:${appointmentId}:customer`,
        sourceEvent: 'appointment_booked',
        route: '/(app)/appointments',
        appointmentId,
        boutiqueId,
      },
    });
  }

  if (jewellerUserId) {
    await deliverNotificationToUser({
      userId: jewellerUserId,
      title: 'New appointment request',
      message: `${customerName ?? boutiqueName ?? 'A customer'} booked for ${date} at ${time}.`,
      type: 'appointment',
      actionType: 'appointment',
      actionId: appointmentId,
      metadata: {
        eventKey: `appointment_booked:${appointmentId}:boutique`,
        sourceEvent: 'appointment_received',
        route: '/(app)/appointments',
        appointmentId,
        boutiqueId,
      },
    });
  }
}

export async function notifyAppointmentStatusChange({
  userId,
  appointmentId,
  status,
  boutiqueName,
}) {
  if (!userId) return;

  if (status === 'upcoming' || status === 'confirmed') {
    await deliverNotificationToUser({
      userId,
      title: '🎉 Appointment Confirmed',
      message: `Your appointment${boutiqueName ? ` with ${boutiqueName}` : ''} has been confirmed by the boutique.`,
      type: 'appointment',
      actionType: 'appointment',
      actionId: appointmentId,
      metadata: {
        eventKey: `appointment_confirmed:${appointmentId}`,
        sourceEvent: 'appointment_confirmed',
        route: '/(app)/appointment-details',
        routeParams: { id: appointmentId },
        appointmentId,
      },
    });
    return;
  }

  if (status === 'cancelled') {
    await deliverNotificationToUser({
      userId,
      title: 'Appointment Cancelled',
      message: `Your appointment${boutiqueName ? ` with ${boutiqueName}` : ''} was cancelled.`,
      type: 'appointment',
      actionType: 'appointment',
      actionId: appointmentId,
      metadata: {
        eventKey: `appointment_cancelled:${appointmentId}`,
        sourceEvent: 'appointment_cancelled',
        route: '/(app)/appointments',
        appointmentId,
      },
    });
  }
}

export async function notifyCallbackUpdate(row, previousStatus) {
  if (!row?.customerId) return;

  const status = row.status;
  if (status === 'assigned' && previousStatus !== 'assigned') {
    await deliverNotificationToUser({
      userId: row.customerId,
      title: 'Callback assigned',
      message: 'A support specialist has been assigned to your callback request.',
      type: 'callback',
      actionType: 'callback',
      actionId: row.id,
      metadata: {
        eventKey: `callback_assigned:${row.id}`,
        sourceEvent: 'callback_assigned',
        route: '/(app)/(tabs)/profile',
        referenceId: row.referenceId,
      },
    });
  }

  if (status === 'completed' || status === 'closed') {
    await deliverNotificationToUser({
      userId: row.customerId,
      title: 'Callback completed',
      message: 'Your callback request has been completed. Thank you for reaching out.',
      type: 'callback',
      actionType: 'callback',
      actionId: row.id,
      metadata: {
        eventKey: `callback_completed:${row.id}:${status}`,
        sourceEvent: 'callback_completed',
        route: '/(app)/(tabs)/profile',
        referenceId: row.referenceId,
      },
    });
  }
}

export async function notifyNewOfferPublished(offer) {
  const userIds = await resolveAudienceUserIds('customers');
  const title = '🔥 New Offer Available';
  const message =
    offer?.subtitle?.trim() ||
    'Exclusive festive jewellery offers are now live.';

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      title,
      message,
      type: 'offer',
      image: offer?.image ?? offer?.banner_image ?? null,
      action_type: 'offer',
      action_id: offer?.id ?? null,
      metadata: buildNotificationMetadata({
        sourceEvent: 'offer_published',
        eventKey: `offer_published:${offer?.id}`,
        route: '/(app)/home',
        offerId: offer?.id,
      }),
    })
    .select('id')
    .single();

  if (error) throw error;

  const rows = userIds.map((userId) => ({
    notification_id: notification.id,
    user_id: userId,
  }));

  for (const batch of chunkArray(rows)) {
    await supabase.from('user_notifications').insert(batch);
  }
}
