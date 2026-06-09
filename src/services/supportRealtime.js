import { supabase } from '../config/supabase.js';

/**
 * Broadcast to support room — works without Supabase Auth on clients (dev profile login).
 */
export async function broadcastSupportEvent(conversationId, event, payload) {
  if (!conversationId) return;

  const channel = supabase.channel(`support:${conversationId}`, {
    config: { broadcast: { ack: false, self: false } },
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('broadcast subscribe timeout')), 5000);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          const { error } = await channel.send({
            type: 'broadcast',
            event,
            payload,
          });
          if (error) reject(error);
          else resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`broadcast channel ${status}`));
        }
      });
    });
  } catch (error) {
    console.warn('[supportRealtime] broadcast failed', event, error?.message ?? error);
  } finally {
    await supabase.removeChannel(channel);
  }
}
