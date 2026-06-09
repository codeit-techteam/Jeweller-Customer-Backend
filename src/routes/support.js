import { Router } from 'express';
import {
  getCustomerConversationHandler,
  getSupportConversationAdminHandler,
  getSupportDashboardHandler,
  listCustomerConversationsHandler,
  listCustomerMessagesHandler,
  listSupportAgentsHandler,
  listSupportConversationsAdminHandler,
  patchSupportConversationAdminHandler,
  postAgentMessageHandler,
  postAgentReadHandler,
  postAgentTypingHandler,
  postCustomerMessageHandler,
  postCustomerRatingHandler,
  postCustomerReadHandler,
  postCustomerTypingHandler,
  startCustomerConversationHandler,
} from '../controllers/supportChatController.js';

const router = Router();

router.get('/conversations', getCustomerConversationHandler);
router.post('/conversations', startCustomerConversationHandler);
router.get('/conversations/history', listCustomerConversationsHandler);
router.get('/conversations/:conversationId/messages', listCustomerMessagesHandler);
router.post('/conversations/:conversationId/messages', postCustomerMessageHandler);
router.post('/conversations/:conversationId/typing', postCustomerTypingHandler);
router.post('/conversations/:conversationId/read', postCustomerReadHandler);
router.post('/conversations/:conversationId/rating', postCustomerRatingHandler);

router.get('/admin/stats', getSupportDashboardHandler);
router.get('/admin/agents', listSupportAgentsHandler);
router.get('/admin/conversations', listSupportConversationsAdminHandler);
router.get('/admin/conversations/:conversationId', getSupportConversationAdminHandler);
router.patch('/admin/conversations/:conversationId', patchSupportConversationAdminHandler);
router.post('/admin/conversations/:conversationId/messages', postAgentMessageHandler);
router.post('/admin/conversations/:conversationId/typing', postAgentTypingHandler);
router.post('/admin/conversations/:conversationId/read', postAgentReadHandler);

export default router;
