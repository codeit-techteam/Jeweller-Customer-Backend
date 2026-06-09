import { supabase } from '../config/supabase.js';
import { normalizeNullableText, normalizeRequiredText } from './_cmsHelpers.js';

const TABLE = 'search_history';
const MAX_ROWS = 8;

export async function listSearchHistory(userId, { limit = MAX_ROWS } = {}) {
  const uid = normalizeNullableText(userId);
  if (!uid) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, keyword, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(`Failed to read search history: ${error.message}`);

  const seen = new Set();
  const out = [];
  for (const row of data ?? []) {
    const key = String(row.keyword ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.id,
      keyword: String(row.keyword).trim(),
      created_at: row.created_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function recordSearchKeyword(userId, rawKeyword) {
  const uid = normalizeNullableText(userId);
  const keyword = normalizeRequiredText(rawKeyword, 'keyword');
  if (!uid) {
    const err = new Error('User id is required');
    err.statusCode = 400;
    throw err;
  }

  const normalized = keyword.trim();
  const lower = normalized.toLowerCase();

  const { data: existing, error: findErr } = await supabase
    .from(TABLE)
    .select('id, keyword')
    .eq('user_id', uid);
  if (findErr) throw new Error(`Failed to read search history: ${findErr.message}`);
  const dupIds = (existing ?? [])
    .filter((row) => String(row.keyword ?? '').trim().toLowerCase() === lower)
    .map((row) => row.id);
  if (dupIds.length) {
    const { error: dupDel } = await supabase.from(TABLE).delete().in('id', dupIds);
    if (dupDel) throw new Error(`Failed to dedupe search history: ${dupDel.message}`);
  }

  const { error: insertError } = await supabase.from(TABLE).insert({
    user_id: uid,
    keyword: normalized,
  });
  if (insertError) throw new Error(`Failed to save search: ${insertError.message}`);

  const { data: overflow, error: listError } = await supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .range(40, 9999);

  if (!listError && overflow?.length) {
    const ids = overflow.map((r) => r.id);
    await supabase.from(TABLE).delete().in('id', ids);
  }

  return listSearchHistory(uid);
}

export async function deleteSearchHistoryEntry(userId, entryId) {
  const uid = normalizeNullableText(userId);
  const id = normalizeNullableText(entryId);
  if (!uid || !id) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', uid)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete search history: ${error.message}`);
  return data;
}

export async function clearSearchHistory(userId) {
  const uid = normalizeNullableText(userId);
  if (!uid) return;
  const { error } = await supabase.from(TABLE).delete().eq('user_id', uid);
  if (error) throw new Error(`Failed to clear search history: ${error.message}`);
}
