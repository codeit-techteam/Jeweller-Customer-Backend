import {
  createNotificationRule,
  listNotificationRules,
  previewNotificationRule,
  sendNotificationRuleNow,
  updateNotificationRule,
} from '../services/notificationRuleService.js';

function statusFor(error) {
  return error?.statusCode ?? 500;
}

export async function listNotificationRulesHandler(req, res, next) {
  try {
    const { limit, offset, type, enabled } = req.query ?? {};
    const data = await listNotificationRules({
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
      type: type || null,
      enabled: enabled === undefined ? null : enabled === 'true',
    });
    return res.status(200).json({ success: true, data, message: 'Notification rules loaded' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(statusFor(error)).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}

export async function createNotificationRuleHandler(req, res, next) {
  try {
    const data = await createNotificationRule(req.body ?? {}, req.adminId);
    return res.status(201).json({ success: true, data, message: 'Notification rule created' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(statusFor(error)).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}

export async function updateNotificationRuleHandler(req, res, next) {
  try {
    const data = await updateNotificationRule(req.params.id, req.body ?? {});
    return res.status(200).json({ success: true, data, message: 'Notification rule updated' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(statusFor(error)).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}

export async function previewNotificationRuleHandler(req, res, next) {
  try {
    const { ruleId, variables, targetAudience } = req.query ?? {};
    if (!ruleId) {
      return res.status(400).json({ success: false, data: null, message: 'ruleId is required' });
    }
    const overrides = {};
    if (variables) {
      try {
        overrides.variables = JSON.parse(variables);
      } catch {
        return res.status(400).json({ success: false, data: null, message: 'variables must be valid JSON' });
      }
    }
    if (targetAudience) {
      try {
        overrides.targetAudience = JSON.parse(targetAudience);
      } catch {
        return res.status(400).json({ success: false, data: null, message: 'targetAudience must be valid JSON' });
      }
    }
    const data = await previewNotificationRule(ruleId, overrides);
    return res.status(200).json({ success: true, data, message: 'Preview generated' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(statusFor(error)).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}

export async function sendNotificationHandler(req, res, next) {
  try {
    const { ruleId, variables, targetAudience } = req.body ?? {};
    if (!ruleId) {
      return res.status(400).json({ success: false, data: null, message: 'ruleId is required' });
    }
    const data = await sendNotificationRuleNow(ruleId, { variables, targetAudience }, req.adminId);
    return res.status(200).json({ success: true, data, message: 'Notification sent' });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(statusFor(error)).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}
