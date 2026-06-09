import { supabase } from '../config/supabase.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function chunk(items, size = 100) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function isPushEnabledForUser(userId) {
  const { data } = await supabase
    .from('notification_settings')
    .select('push_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.push_enabled !== false;
}

export async function upsertPushToken({ userId, token, platform, provider = 'expo' }) {
  if (!userId || !token?.trim()) {
    const err = new Error('userId and token are required');
    err.status = 400;
    throw err;
  }

  const { error } = await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      token: token.trim(),
      platform: platform ?? null,
      provider: provider ?? 'expo',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  );

  if (error) throw error;
  return { success: true };
}

export async function fetchTokensForUsers(userIds) {
  if (!userIds?.length) return [];

  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('user_id, token, provider')
    .in('user_id', userIds);

  if (error) throw error;
  return data ?? [];
}

/**
 * Sends push via Expo Push API (FCM/APNs under the hood for EAS builds).
 * Skips users with push_enabled = false.
 */
export async function sendPushToUsers(userIds, payload) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { sent: 0, skipped: 0 };

  const enabledIds = [];
  for (const userId of uniqueIds) {
    if (await isPushEnabledForUser(userId)) enabledIds.push(userId);
  }

  if (enabledIds.length === 0) return { sent: 0, skipped: uniqueIds.length };

  const tokens = await fetchTokensForUsers(enabledIds);
  if (tokens.length === 0) return { sent: 0, skipped: uniqueIds.length };

  const messages = tokens.map((row) => ({
    to: row.token,
    sound: 'default',
    title: payload.title,
    body: payload.message,
    data: {
      ...(payload.data ?? {}),
      notificationId: payload.notificationId ?? null,
      userNotificationId: payload.userNotificationId ?? null,
      actionType: payload.actionType ?? 'none',
      actionId: payload.actionId ?? null,
    },
    priority: 'high',
    channelId: 'default',
  }));

  let sent = 0;
  for (const batch of chunk(messages)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else console.warn('[push] Expo push batch failed', await res.text());
    } catch (error) {
      console.warn('[push] Expo push error', error?.message ?? error);
    }
  }

  return { sent, skipped: uniqueIds.length - enabledIds.length };
}
