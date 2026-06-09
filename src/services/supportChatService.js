import { supabase } from '../config/supabase.js';
import { dispatchSystemEvent } from './notificationEngine.js';
import { broadcastSupportEvent } from './supportRealtime.js';

const CONVERSATION_STATUSES = new Set([
  'open',
  'assigned',
  'in_progress',
  'waiting_for_customer',
  'resolved',
  'closed',
]);

const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress', 'waiting_for_customer']);

const QUICK_REPLY_MAP = {
  'track order': 'I would like to track my order.',
  'book appointment': 'I would like to book a boutique appointment.',
  'request callback': 'Please arrange a callback from a support expert.',
  'gold plans': 'Tell me about GehnaHub Gold plans.',
  'find boutique': 'Help me find a boutique near me.',
  'talk to expert': 'I would like to speak with a jewellery expert.',
  'latest offers': 'What are the latest offers available?',
};

function mapAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    status: row.status,
    department: row.department,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderId: row.sender_id ?? null,
    message: row.message ?? '',
    messageType: row.message_type,
    attachmentUrl: row.attachment_url ?? null,
    metadata: row.metadata ?? {},
    deliveryStatus: row.delivery_status,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

function mapConversation(row, agent) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? null,
    ticketNumber: row.ticket_number,
    status: row.status,
    assignedAgentId: row.assigned_agent_id ?? null,
    assignedAgent: agent ?? null,
    lastMessage: row.last_message ?? null,
    lastMessageAt: row.last_message_at ?? null,
    internalNotes: row.internal_notes ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function pickAgentForAssignment() {
  const { data: agents, error } = await supabase
    .from('support_agents')
    .select('id, name, email, status, department')
    .in('status', ['online', 'away'])
    .order('updated_at', { ascending: true })
    .limit(5);

  if (error) throw error;
  if (!agents?.length) {
    const { data: fallback } = await supabase
      .from('support_agents')
      .select('id, name, email, status, department')
      .limit(1)
      .maybeSingle();
    return fallback ? mapAgent(fallback) : null;
  }
  return mapAgent(agents[0]);
}

async function fetchAgent(agentId) {
  if (!agentId) return null;
  const { data, error } = await supabase
    .from('support_agents')
    .select('id, name, email, status, department')
    .eq('id', agentId)
    .maybeSingle();
  if (error) throw error;
  return mapAgent(data);
}

async function insertSystemMessage(conversationId, text, metadata = {}) {
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'system',
      message: text,
      message_type: 'system',
      metadata,
      delivery_status: 'delivered',
      is_read: false,
    })
    .select()
    .single();
  if (error) throw error;
  return mapMessage(data);
}

export async function listSupportAgents() {
  const { data, error } = await supabase
    .from('support_agents')
    .select('id, name, email, status, department, created_at, updated_at')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(mapAgent);
}

export async function getCustomerOpenConversation(customerId) {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('*')
    .eq('customer_id', customerId)
    .in('status', [...ACTIVE_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const agent = await fetchAgent(data.assigned_agent_id);
  return mapConversation(data, agent);
}

export async function listCustomerConversations(customerId, { limit = 30, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('*')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = data ?? [];
  const mapped = [];
  for (const row of rows) {
    const agent = await fetchAgent(row.assigned_agent_id);
    mapped.push(mapConversation(row, agent));
  }
  return mapped;
}

export async function startCustomerConversation({ customerId, customerName }) {
  if (!customerId) {
    const err = new Error('customerId is required');
    err.status = 400;
    throw err;
  }

  const existing = await getCustomerOpenConversation(customerId);
  if (existing) return { conversation: existing, created: false };

  const agent = await pickAgentForAssignment();
  const { data, error } = await supabase
    .from('support_conversations')
    .insert({
      customer_id: customerId,
      customer_name: customerName ?? null,
      status: agent ? 'assigned' : 'open',
      assigned_agent_id: agent?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const welcomeName = customerName?.trim() || 'there';
  await insertSystemMessage(
    data.id,
    `Hello ${welcomeName} 👋 — welcome to GehnaHub Support. How can we help you today?`,
    { kind: 'welcome' },
  );

  const conversation = mapConversation(data, agent);
  return { conversation, created: true };
}

export async function assertCustomerOwnsConversation(customerId, conversationId) {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('id, customer_id, status, assigned_agent_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.customer_id !== customerId) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  return data;
}

export async function fetchConversationMessages(conversationId, { limit = 50, before } = {}) {
  let query = supabase
    .from('support_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapMessage).reverse();
}

export function resolveQuickReply(text) {
  const key = String(text ?? '').trim().toLowerCase();
  return QUICK_REPLY_MAP[key] ?? text;
}

export async function sendCustomerMessage({
  customerId,
  conversationId,
  message,
  messageType = 'text',
  attachmentUrl = null,
  metadata = {},
}) {
  await assertCustomerOwnsConversation(customerId, conversationId);

  const body = String(message ?? '').trim();
  if (messageType === 'text' && !body && !attachmentUrl) {
    const err = new Error('Message cannot be empty');
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'customer',
      sender_id: customerId,
      message: body || null,
      message_type: messageType,
      attachment_url: attachmentUrl,
      metadata,
      delivery_status: 'sent',
      is_read: false,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from('support_conversations')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .in('status', ['open', 'assigned', 'waiting_for_customer']);

  const mapped = mapMessage(data);
  void broadcastSupportEvent(conversationId, 'message:new', mapped);
  return mapped;
}

export async function setTypingState({
  conversationId,
  participantType,
  participantId,
  isTyping,
}) {
  const { error } = await supabase.from('support_typing_presence').upsert(
    {
      conversation_id: conversationId,
      participant_type: participantType,
      participant_id: participantId ?? null,
      is_typing: Boolean(isTyping),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id,participant_type' },
  );
  if (error) throw error;
  void broadcastSupportEvent(conversationId, 'typing', {
    participantType,
    isTyping: Boolean(isTyping),
  });
  return { ok: true };
}

export async function markMessagesRead({
  conversationId,
  readerType,
  messageIds = null,
}) {
  let query = supabase
    .from('support_messages')
    .update({ is_read: true, delivery_status: 'read' })
    .eq('conversation_id', conversationId)
    .neq('sender_type', readerType);

  if (messageIds?.length) {
    query = query.in('id', messageIds);
  }

  const { error } = await query;
  if (error) throw error;

  const { data: deliveredRows } = await supabase
    .from('support_messages')
    .update({ delivery_status: 'delivered' })
    .eq('conversation_id', conversationId)
    .eq('delivery_status', 'sent')
    .neq('sender_type', readerType)
    .select('id, delivery_status, is_read');

  void broadcastSupportEvent(conversationId, 'messages:read', {
    readerType,
    updates: deliveredRows ?? [],
  });
  return { ok: true };
}

export async function submitConversationRating({
  customerId,
  conversationId,
  rating,
  feedback = null,
}) {
  await assertCustomerOwnsConversation(customerId, conversationId);
  const score = Number(rating);
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    const err = new Error('Rating must be between 1 and 5');
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('support_conversation_ratings')
    .upsert(
      {
        conversation_id: conversationId,
        customer_id: customerId,
        rating: score,
        feedback: feedback?.trim() || null,
      },
      { onConflict: 'conversation_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listConversationsAdmin({ status = 'all', limit = 100 } = {}) {
  let query = supabase
    .from('support_conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all' && CONVERSATION_STATUSES.has(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const result = [];
  for (const row of rows) {
    const agent = await fetchAgent(row.assigned_agent_id);
    result.push(mapConversation(row, agent));
  }
  return result;
}

export async function getSupportDashboardStats() {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('id, status, created_at, updated_at, last_message_at');
  if (error) throw error;

  const rows = data ?? [];
  const open = rows.filter((r) =>
    ['open', 'assigned', 'in_progress', 'waiting_for_customer'].includes(r.status),
  ).length;
  const resolved = rows.filter((r) => r.status === 'resolved' || r.status === 'closed').length;
  const pendingReplies = rows.filter((r) =>
    ['open', 'assigned', 'waiting_for_customer'].includes(r.status),
  ).length;

  const responseSamples = rows
    .filter((r) => r.last_message_at && r.created_at)
    .slice(0, 50)
    .map((r) => new Date(r.last_message_at).getTime() - new Date(r.created_at).getTime())
    .filter((ms) => ms > 0);

  const avgResponseMinutes =
    responseSamples.length > 0
      ? Math.round(
          responseSamples.reduce((a, b) => a + b, 0) / responseSamples.length / 60000,
        )
      : 0;

  return {
    openTickets: open,
    pendingReplies,
    resolvedTickets: resolved,
    averageResponseMinutes: avgResponseMinutes,
  };
}

export async function getConversationAdmin(conversationId) {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  const agent = await fetchAgent(data.assigned_agent_id);
  const messages = await fetchConversationMessages(conversationId, { limit: 200 });
  return { conversation: mapConversation(data, agent), messages };
}

export async function sendAgentReply({
  conversationId,
  agentId,
  message,
  messageType = 'text',
  attachmentUrl = null,
  metadata = {},
}) {
  const body = String(message ?? '').trim();
  if (messageType === 'text' && !body && !attachmentUrl) {
    const err = new Error('Message cannot be empty');
    err.status = 400;
    throw err;
  }

  const { data: conv, error: convError } = await supabase
    .from('support_conversations')
    .select('id, customer_id, status, assigned_agent_id, ticket_number')
    .eq('id', conversationId)
    .maybeSingle();
  if (convError) throw convError;
  if (!conv) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }

  let resolvedAgentId = agentId ?? conv.assigned_agent_id;
  if (!resolvedAgentId) {
    const picked = await pickAgentForAssignment();
    resolvedAgentId = picked?.id ?? null;
    if (resolvedAgentId) {
      await supabase
        .from('support_conversations')
        .update({
          assigned_agent_id: resolvedAgentId,
          status: 'assigned',
        })
        .eq('id', conversationId);
    }
  }

  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_id: resolvedAgentId,
      message: body || null,
      message_type: messageType,
      attachment_url: attachmentUrl,
      metadata,
      delivery_status: 'sent',
      is_read: false,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from('support_conversations')
    .update({
      status: 'waiting_for_customer',
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  const mapped = mapMessage(data);
  void broadcastSupportEvent(conversationId, 'message:new', mapped);

  if (conv.customer_id) {
    try {
      await dispatchSystemEvent('support_reply', {
        userId: conv.customer_id,
        conversationId,
        ticketNumber: conv.ticket_number,
      });
    } catch (notifyError) {
      console.warn('[supportChat] support_reply notification failed', notifyError?.message ?? notifyError);
    }
  }

  return mapped;
}

export async function patchConversationAdmin(conversationId, patch) {
  const updates = {};
  if (patch.status && CONVERSATION_STATUSES.has(patch.status)) {
    updates.status = patch.status;
  }
  if (patch.assignedAgentId !== undefined) {
    updates.assigned_agent_id = patch.assignedAgentId;
  }
  if (typeof patch.internalNotes === 'string') {
    updates.internal_notes = patch.internalNotes;
  }

  if (!Object.keys(updates).length) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('support_conversations')
    .update(updates)
    .eq('id', conversationId)
    .select()
    .single();
  if (error) throw error;

  const agent = await fetchAgent(data.assigned_agent_id);
  return mapConversation(data, agent);
}

export async function insertAgentCardMessage({
  conversationId,
  messageType,
  metadata,
  message,
}) {
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      message: message ?? null,
      message_type: messageType,
      metadata,
      delivery_status: 'delivered',
    })
    .select()
    .single();
  if (error) throw error;
  return mapMessage(data);
}
