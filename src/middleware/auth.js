import { supabase } from '../config/supabase.js';
import { extractBearerToken } from './authHelpers.js';

async function ensureUserProfileExists(userId, tokenUser) {
  const { data: existing, error: lookupError } = await supabase
    .from('users_profile')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to validate user profile: ${lookupError.message}`);
  }
  if (existing?.id) return;

  const fallbackName =
    tokenUser?.user_metadata?.full_name ??
    tokenUser?.user_metadata?.name ??
    'Guest';
  const fallbackEmail = tokenUser?.email ?? null;
  const fallbackPhone =
    typeof tokenUser?.phone === 'string' && tokenUser.phone.trim()
      ? tokenUser.phone.replace(/\D/g, '').slice(-10)
      : null;

  const { error: insertError } = await supabase.from('users_profile').insert({
    id: userId,
    full_name: fallbackName,
    email: fallbackEmail,
    phone: fallbackPhone,
    profile_image: null,
  });

  if (insertError) {
    throw new Error(`Failed to create user profile: ${insertError.message}`);
  }
}

export async function requireAuthUser(req, _res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const fallbackUserId = req.headers['x-user-id'];

    let tokenUserId = null;
    let tokenUser = null;
    let userId = null;

    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user?.id) {
        tokenUserId = data.user.id;
        tokenUser = data.user;
      }
    }

    const headerUserId =
      typeof fallbackUserId === 'string' && fallbackUserId.trim()
        ? fallbackUserId.trim()
        : null;

    // Prefer JWT user id when available so profile.id maps to auth user id.
    if (tokenUserId) {
      userId = tokenUserId;
    } else if (headerUserId) {
      userId = headerUserId;
    }

    if (!userId) {
      const error = new Error('Unauthorized user session');
      error.statusCode = 401;
      throw error;
    }

    await ensureUserProfileExists(userId, tokenUser);
    console.log('USER SESSION:', {
      hasToken: Boolean(token),
      tokenUserId,
      headerUserId,
      resolvedUserId: userId,
    });

    req.authUser = tokenUser
      ? {
          id: tokenUser.id,
          email: tokenUser.email ?? null,
          phone: tokenUser.phone ?? null,
          user_metadata: tokenUser.user_metadata ?? null,
        }
      : null;

    req.userId = userId;
    return next();
  } catch (error) {
    return next(error);
  }
}
