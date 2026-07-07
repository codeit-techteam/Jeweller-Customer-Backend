import { supabase } from '../config/supabase.js';

const USER_NOTIFICATION_SELECT = `
  id,
  user_id,
  is_read,
  read_at,
  created_at,
  notification:notifications (
    id,
    title,
    message,
    type,
    image,
    thumbnail,
    action_type,
    action_id,
    target_type,
    target_id,
    deep_link,
    cta_text,
    notification_style,
    banner_color,
    priority,
    metadata,
    created_at
  )
`;

function mapRow(row) {
  const n = row?.notification;
  if (!n) return null;
  const metadata = n.metadata ?? {};
  return {
    id: String(row.id),
    notificationId: String(n.id),
    userId: String(row.user_id),
    title: String(n.title ?? ''),
    body: String(n.message ?? ''),
    type: n.type ?? 'system',
    isRead: Boolean(row.is_read),
    createdAt: String(n.created_at ?? row.created_at ?? new Date().toISOString()),
    imageUrl: n.image ?? null,
    thumbnail: n.thumbnail ?? n.image ?? null,
    actionType: n.action_type ?? 'none',
    actionId: n.action_id ?? null,
    // First-class marketplace-notification columns, with graceful fallback
    // to `metadata` for rows created before this feature existed.
    targetType: n.target_type ?? metadata.targetType ?? 'none',
    targetId: n.target_id ?? metadata.targetId ?? null,
    deepLink: n.deep_link ?? metadata.deepLink ?? null,
    ctaText: n.cta_text ?? metadata.ctaText ?? null,
    notificationStyle: n.notification_style ?? 'default',
    bannerColor: n.banner_color ?? null,
    priority: n.priority ?? 'medium',
    data: metadata,
  };
}

export async function fetchNotificationsPageForUser(userId, page = 0, pageSize = 20) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from('user_notifications')
    .select(USER_NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const items = (data ?? []).map(mapRow).filter(Boolean);
  return { items, hasMore: items.length === pageSize };
}

export async function fetchNotificationRecipientForUser(userId, recipientId) {
  const { data, error } = await supabase
    .from('user_notifications')
    .select(USER_NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .eq('id', recipientId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function fetchUnreadCountForUser(userId) {
  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationReadForUser(userId, recipientId) {
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', recipientId);

  if (error) throw error;
}

export async function markAllNotificationsReadForUser(userId) {
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

export async function deleteNotificationForUser(userId, recipientId) {
  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('user_id', userId)
    .eq('id', recipientId);

  if (error) throw error;
}
