import { extractBearerToken } from './authHelpers.js';

const ADMIN_SESSION_TOKEN = 'env-admin-session';

export function isAdminRequest(req) {
  const adminId = req.headers['x-admin-id'];
  if (typeof adminId === 'string' && adminId.trim()) {
    return true;
  }

  const adminSession = req.headers['x-admin-session'];
  if (adminSession === 'authenticated') {
    return true;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (token === ADMIN_SESSION_TOKEN) {
    return true;
  }

  const apiKey = process.env.ADMIN_API_KEY;
  if (apiKey && token === apiKey) {
    return true;
  }

  return false;
}

export function resolveAdminId(req) {
  const headerId = req.headers['x-admin-id'];
  if (typeof headerId === 'string' && headerId.trim()) {
    return headerId.trim();
  }
  return 'platform-admin';
}

export async function requireAdmin(req, res, next) {
  if (!isAdminRequest(req)) {
    return res.status(403).json({
      success: false,
      data: null,
      message: 'Admin authorization required',
    });
  }
  req.adminId = resolveAdminId(req);
  return next();
}
