import {
  assertCustomerOwnsConversation,
  fetchConversationMessages,
  getConversationAdmin,
  getCustomerOpenConversation,
  getSupportDashboardStats,
  listConversationsAdmin,
  listCustomerConversations,
  listSupportAgents,
  markMessagesRead,
  patchConversationAdmin,
  resolveQuickReply,
  sendAgentReply,
  sendCustomerMessage,
  setTypingState,
  startCustomerConversation,
  submitConversationRating,
} from '../services/supportChatService.js';

function resolveUserId(req) {
  const fromQuery = req.query.userId;
  const fromHeader = req.headers['x-user-id'];
  const fromBody = req.body?.userId ?? req.body?.customerId;
  const raw =
    typeof fromQuery === 'string' && fromQuery.trim()
      ? fromQuery.trim()
      : typeof fromHeader === 'string' && fromHeader.trim()
        ? fromHeader.trim()
        : typeof fromBody === 'string' && fromBody.trim()
          ? fromBody.trim()
          : null;
  return raw;
}

export async function getCustomerConversationHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const conversation = await getCustomerOpenConversation(userId);
    return res.status(200).json({
      success: true,
      data: { conversation },
      message: 'Conversation loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function startCustomerConversationHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const customerName =
      typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : null;
    const result = await startCustomerConversation({
      customerId: userId,
      customerName,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: result,
      message: result.created ? 'Conversation started' : 'Active conversation loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function listCustomerConversationsHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const limit = Number(req.query.limit ?? 30);
    const offset = Number(req.query.offset ?? 0);
    const rows = await listCustomerConversations(userId, { limit, offset });
    return res.status(200).json({
      success: true,
      data: rows,
      message: 'Ticket history loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function listCustomerMessagesHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { conversationId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await assertCustomerOwnsConversation(userId, conversationId);
    const before =
      typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = Number(req.query.limit ?? 50);
    const messages = await fetchConversationMessages(conversationId, { limit, before });
    return res.status(200).json({
      success: true,
      data: messages,
      message: 'Messages loaded',
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postCustomerMessageHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { conversationId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const rawMessage = req.body?.message ?? req.body?.text ?? '';
    const quickReply = req.body?.quickReply === true;
    const message = quickReply ? resolveQuickReply(rawMessage) : rawMessage;

    const row = await sendCustomerMessage({
      customerId: userId,
      conversationId,
      message,
      messageType: req.body?.messageType ?? 'text',
      attachmentUrl: req.body?.attachmentUrl ?? null,
      metadata: req.body?.metadata ?? {},
    });

    return res.status(201).json({
      success: true,
      data: row,
      message: 'Message sent',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postCustomerTypingHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { conversationId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await assertCustomerOwnsConversation(userId, conversationId);
    const data = await setTypingState({
      conversationId,
      participantType: 'customer',
      participantId: userId,
      isTyping: Boolean(req.body?.isTyping),
    });
    return res.status(200).json({ success: true, data, message: 'Typing updated' });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postCustomerReadHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { conversationId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await assertCustomerOwnsConversation(userId, conversationId);
    const data = await markMessagesRead({
      conversationId,
      readerType: 'customer',
      messageIds: req.body?.messageIds ?? null,
    });
    return res.status(200).json({ success: true, data, message: 'Messages marked read' });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postCustomerRatingHandler(req, res, next) {
  try {
    const userId = resolveUserId(req);
    const { conversationId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    const row = await submitConversationRating({
      customerId: userId,
      conversationId,
      rating: req.body?.rating,
      feedback: req.body?.feedback,
    });
    return res.status(201).json({
      success: true,
      data: row,
      message: 'Thank you for your feedback',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function getSupportDashboardHandler(_req, res, next) {
  try {
    const stats = await getSupportDashboardStats();
    return res.status(200).json({ success: true, data: stats, message: 'Stats loaded' });
  } catch (error) {
    return next(error);
  }
}

export async function listSupportConversationsAdminHandler(req, res, next) {
  try {
    const status =
      typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
    const rows = await listConversationsAdmin({ status });
    return res.status(200).json({
      success: true,
      data: rows,
      message: 'Support tickets loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getSupportConversationAdminHandler(req, res, next) {
  try {
    const data = await getConversationAdmin(req.params.conversationId);
    return res.status(200).json({
      success: true,
      data,
      message: 'Conversation loaded',
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postAgentMessageHandler(req, res, next) {
  try {
    const row = await sendAgentReply({
      conversationId: req.params.conversationId,
      agentId: req.body?.agentId ?? null,
      message: req.body?.message,
      messageType: req.body?.messageType ?? 'text',
      attachmentUrl: req.body?.attachmentUrl ?? null,
      metadata: req.body?.metadata ?? {},
    });
    return res.status(201).json({
      success: true,
      data: row,
      message: 'Reply sent',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function patchSupportConversationAdminHandler(req, res, next) {
  try {
    const row = await patchConversationAdmin(req.params.conversationId, {
      status: req.body?.status,
      assignedAgentId: req.body?.assignedAgentId,
      internalNotes: req.body?.internalNotes,
    });
    return res.status(200).json({
      success: true,
      data: row,
      message: 'Conversation updated',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function postAgentTypingHandler(req, res, next) {
  try {
    const data = await setTypingState({
      conversationId: req.params.conversationId,
      participantType: 'agent',
      participantId: req.body?.agentId ?? null,
      isTyping: Boolean(req.body?.isTyping),
    });
    return res.status(200).json({ success: true, data, message: 'Typing updated' });
  } catch (error) {
    return next(error);
  }
}

export async function postAgentReadHandler(req, res, next) {
  try {
    const data = await markMessagesRead({
      conversationId: req.params.conversationId,
      readerType: 'agent',
      messageIds: req.body?.messageIds ?? null,
    });
    return res.status(200).json({ success: true, data, message: 'Messages marked read' });
  } catch (error) {
    return next(error);
  }
}

export async function listSupportAgentsHandler(_req, res, next) {
  try {
    const rows = await listSupportAgents();
    return res.status(200).json({
      success: true,
      data: rows,
      message: 'Agents loaded',
    });
  } catch (error) {
    return next(error);
  }
}
