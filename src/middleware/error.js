export function notFoundHandler(req, _res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

/** Hide raw Postgres / Supabase column errors from API clients. */
function clientSafeMessage(statusCode, message) {
  const raw = String(message || 'Internal server error');
  if (statusCode < 500) return raw;
  const low = raw.toLowerCase();
  const looksTechnical =
    low.includes('column ') ||
    low.includes(' does not exist') ||
    low.includes('relation ') ||
    low.includes('syntax error') ||
    low.includes('postgres') ||
    low.includes('42703') ||
    low.includes('42p01') ||
    low.includes('supabase');
  return looksTechnical ? 'Something went wrong. Please try again in a moment.' : raw;
}

export function errorHandler(error, _req, res, _next) {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    const isVideoUpload = String(_req.originalUrl || '').includes('/product-video');
    return res.status(413).json({
      success: false,
      data: null,
      message: isVideoUpload ? 'Maximum video size is 50MB' : 'Maximum image size is 10MB',
    });
  }

  const originalMessage = error.message || 'Internal server error';
  const normalized = String(originalMessage).toLowerCase();
  const isSupabaseNetworkIssue =
    normalized.includes('failed to fetch') && normalized.includes('typeerror: fetch failed');

  const statusCode = isSupabaseNetworkIssue ? 503 : error.statusCode || 500;
  const message = isSupabaseNetworkIssue
    ? 'Database service is temporarily unavailable. Please try again.'
    : clientSafeMessage(statusCode, originalMessage);

  console.error('[errorHandler]', { statusCode, message: originalMessage });

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
  });
}
