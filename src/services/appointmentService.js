import { supabase } from '../config/supabase.js';
import { resolveBoutiqueCoverUrl } from '../utils/boutiqueMedia.js';
import { dispatchSystemEvent } from './notificationEngine.js';

const ALLOWED_STATUS = new Set(['upcoming', 'completed', 'cancelled']);

/** Columns that exist across deployed DBs — never select removed/nonexistent fields. */
const BOUTIQUE_SELECT = `
  name,
  slug,
  location,
  address,
  full_address,
  image,
  cover_image_url,
  logo_url,
  banner_images,
  gallery_images,
  contact_number,
  phone_number
`.replace(/\s+/g, ' ');

function firstHttpFromJsonb(value) {
  if (value == null) return null;
  let arr = value;
  if (typeof value === 'string') {
    try {
      arr = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (typeof item === 'string') {
      const s = item.trim();
      if (s.startsWith('http')) return s;
    }
    if (item && typeof item === 'object' && typeof item.url === 'string') {
      const s = item.url.trim();
      if (s.startsWith('http')) return s;
    }
  }
  return null;
}

function boutiqueCover(b) {
  if (!b || typeof b !== 'object') return null;
  return resolveBoutiqueCoverUrl(b);
}

function boutiqueAddress(b) {
  if (!b || typeof b !== 'object') return null;
  const chain = [b.full_address, b.address, b.location];
  for (const x of chain) {
    if (typeof x === 'string' && x.trim()) return x.trim();
  }
  return null;
}

function boutiquePhone(b) {
  if (!b || typeof b !== 'object') return null;
  const chain = [b.phone_number, b.phone, b.contact_number, b.whatsapp];
  for (const x of chain) {
    if (typeof x === 'string' && x.replace(/\s/g, '').length >= 8) return x.trim();
  }
  return null;
}

/**
 * @param {string} status
 * @param {string | null} startsAt
 */
export function resolveAppointmentBadge(status, startsAt) {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  if (status === 'upcoming' && startsAt) {
    const t = new Date(startsAt).getTime();
    if (!Number.isNaN(t) && t < Date.now()) return 'past';
  }
  return 'upcoming';
}

/** @param {string} dateIso YYYY-MM-DD */
function formatDisplayDate(dateIso) {
  if (!dateIso) return '';
  const d = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDisplayTimeFromInstant(startsAt, fallbackTime) {
  if (startsAt) {
    const d = new Date(startsAt);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    }
  }
  return typeof fallbackTime === 'string' ? fallbackTime.trim() : '';
}

function mapAppointmentRow(row) {
  const b = row.boutiques;
  const dateIso = row.date ?? null;
  const timeStr = typeof row.time === 'string' ? row.time.trim() : '';
  const status = ALLOWED_STATUS.has(row.status) ? row.status : 'upcoming';
  const startsAt = row.starts_at ?? null;
  const badge = resolveAppointmentBadge(status, startsAt);
  const displayTime = timeStr || formatDisplayTimeFromInstant(startsAt, '');

  return {
    id: row.id,
    boutiqueId: row.boutique_id,
    boutiqueName: b?.name ?? 'Boutique',
    boutiqueSlug: typeof b?.slug === 'string' && b.slug.trim() ? b.slug.trim() : null,
    date: formatDisplayDate(dateIso),
    dateIso,
    time: displayTime,
    status,
    badge,
    address: boutiqueAddress(b) ?? 'Address on file',
    image: boutiqueCover(b) ?? undefined,
    phone: boutiquePhone(b) ?? undefined,
    consultationType: typeof row.type === 'string' && row.type.trim() ? row.type.trim() : undefined,
    startsAt,
  };
}

/**
 * Sort: future upcoming (soonest first) → past-upcoming → completed → cancelled.
 * @param {Array<Record<string, unknown>>} rows
 */
export function sortAppointmentsForDisplay(rows) {
  const now = Date.now();
  const tier = (r) => {
    const st = r.status;
    const t = r.startsAt ? new Date(r.startsAt).getTime() : 0;
    if (st === 'cancelled') return { g: 4, t };
    if (st === 'completed') return { g: 3, t };
    if (st === 'upcoming') {
      if (t >= now) return { g: 0, t };
      return { g: 1, t };
    }
    return { g: 2, t };
  };
  return [...rows].sort((a, b) => {
    const A = tier(a);
    const B = tier(b);
    if (A.g !== B.g) return A.g - B.g;
    if (A.g === 0) return A.t - B.t;
    return B.t - A.t;
  });
}

/**
 * When a user has zero appointments, insert a small demo set once (linked to real boutiques).
 * @param {string} userId
 * @returns {Promise<boolean>} true if rows were inserted
 */
async function ensureSampleAppointmentsForUser(userId) {
  const { count, error: countErr } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (countErr) {
    throw Object.assign(new Error(countErr.message), { statusCode: 500 });
  }
  if ((count ?? 0) > 0) return false;

  const { data: shops, error: shopErr } = await supabase
    .from('boutiques')
    .select('id')
    .is('deleted_at', null)
    .limit(8);

  if (shopErr) {
    throw Object.assign(new Error(shopErr.message), { statusCode: 500 });
  }
  const boutiqueIds = (shops ?? []).map((s) => s.id).filter(Boolean);
  if (!boutiqueIds.length) return false;

  const templates = [
    { daysFromNow: 6, hour: 15, minute: 0, status: 'upcoming', type: 'Bridal Consultation' },
    { daysFromNow: 10, hour: 11, minute: 30, status: 'upcoming', type: 'Diamond Viewing' },
    { daysFromNow: 18, hour: 16, minute: 0, status: 'upcoming', type: 'Private Viewing' },
    { daysFromNow: -5, hour: 14, minute: 0, status: 'completed', type: 'Heritage collection tour' },
    { daysFromNow: -14, hour: 12, minute: 0, status: 'completed', type: 'Gold consultation' },
    { daysFromNow: -3, hour: 10, minute: 30, status: 'cancelled', type: 'Custom fitting' },
  ];

  const rows = templates.map((tpl, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + tpl.daysFromNow);
    d.setHours(tpl.hour, tpl.minute, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    const timeLabel = new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);

    return {
      user_id: userId,
      boutique_id: boutiqueIds[i % boutiqueIds.length],
      date: dateStr,
      time: timeLabel,
      type: tpl.type,
      notes: null,
      status: tpl.status,
      starts_at: d.toISOString(),
    };
  });

  const { error: insErr } = await supabase.from('appointments').insert(rows);
  if (insErr) {
    throw Object.assign(new Error(insErr.message), { statusCode: 500 });
  }
  return true;
}

export async function listAppointmentsForUser(userId) {
  if (!userId || typeof userId !== 'string') {
    throw Object.assign(new Error('userId required'), { statusCode: 400 });
  }

  try {
    await ensureSampleAppointmentsForUser(userId);
  } catch (e) {
    // Demo seed is best-effort; listing should still work if seed fails (e.g. RLS).
    console.warn('[appointments] ensureSampleAppointmentsForUser skipped:', e?.message || e);
  }

  const { data, error } = await supabase
    .from('appointments')
    .select(
      `
      id,
      user_id,
      boutique_id,
      date,
      time,
      type,
      notes,
      status,
      starts_at,
      created_at,
      boutiques ( ${BOUTIQUE_SELECT} )
    `,
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: true, nullsFirst: false });

  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 500 });
  }

  const rows = (data ?? []).map(mapAppointmentRow);
  return sortAppointmentsForDisplay(rows);
}

export async function getAppointmentForUser(appointmentId, userId) {
  if (!appointmentId || !userId) {
    throw Object.assign(new Error('appointmentId and userId required'), { statusCode: 400 });
  }

  const { data, error } = await supabase
    .from('appointments')
    .select(
      `
      id,
      user_id,
      boutique_id,
      date,
      time,
      type,
      notes,
      status,
      starts_at,
      boutiques ( ${BOUTIQUE_SELECT} )
    `,
    )
    .eq('id', appointmentId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 500 });
  }
  if (!data) return null;

  return mapAppointmentRow(data);
}

/**
 * Soft-delete an appointment from the user's history.
 * Only past, completed, or cancelled visits may be removed.
 */
export async function softDeleteAppointmentForUser(appointmentId, userId) {
  if (!appointmentId || !userId) {
    throw Object.assign(new Error('appointmentId and userId required'), { statusCode: 400 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('appointments')
    .select('id, user_id, status, starts_at, deleted_at')
    .eq('id', appointmentId)
    .maybeSingle();

  if (exErr) {
    throw Object.assign(new Error(exErr.message), { statusCode: 500 });
  }
  if (!existing || existing.user_id !== userId) {
    throw Object.assign(new Error('Not found'), { statusCode: 404 });
  }
  if (existing.deleted_at) {
    return { id: appointmentId, deleted: true };
  }

  const status = ALLOWED_STATUS.has(existing.status) ? existing.status : 'upcoming';
  const badge = resolveAppointmentBadge(status, existing.starts_at ?? null);
  const isFutureUpcoming = status === 'upcoming' && badge === 'upcoming';
  if (isFutureUpcoming) {
    throw Object.assign(new Error('Upcoming appointments cannot be deleted'), { statusCode: 403 });
  }

  const { error } = await supabase
    .from('appointments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('user_id', userId);

  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 500 });
  }

  return { id: appointmentId, deleted: true };
}

export async function updateAppointmentStatus(appointmentId, userId, nextStatus) {
  if (!ALLOWED_STATUS.has(nextStatus)) {
    throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('appointments')
    .select('id, user_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (exErr) {
    throw Object.assign(new Error(exErr.message), { statusCode: 500 });
  }
  if (!existing || existing.user_id !== userId) {
    throw Object.assign(new Error('Not found'), { statusCode: 404 });
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: nextStatus })
    .eq('id', appointmentId)
    .eq('user_id', userId);

  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 500 });
  }

  return getAppointmentForUser(appointmentId, userId);
}

const ADMIN_APPOINTMENT_SELECT = `
  id,
  user_id,
  boutique_id,
  date,
  time,
  type,
  notes,
  status,
  starts_at,
  created_at,
  customer_name,
  customer_phone,
  service_requested,
  boutiques ( ${BOUTIQUE_SELECT} ),
  users_profile ( full_name, name, phone )
`.replace(/\s+/g, ' ');

function mapAppointmentAdminRow(row) {
  const mapped = mapAppointmentRow(row);
  const profile = row.users_profile;
  const profileName = profile?.full_name ?? profile?.name ?? null;

  return {
    ...mapped,
    userId: row.user_id ?? null,
    customerName: row.customer_name ?? profileName ?? null,
    customerPhone: row.customer_phone ?? profile?.phone ?? null,
    serviceRequested:
      typeof row.service_requested === 'string' && row.service_requested.trim()
        ? row.service_requested.trim()
        : null,
    notes: typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : null,
    userDisplayName: profileName,
    userPhone: profile?.phone ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * @param {{ status?: string, boutiqueId?: string | null }} filters
 */
export async function listAppointmentsForAdmin(filters = {}) {
  let query = supabase
    .from('appointments')
    .select(ADMIN_APPOINTMENT_SELECT)
    .order('starts_at', { ascending: false, nullsFirst: false })
    .limit(500);

  const status = typeof filters.status === 'string' ? filters.status.trim() : '';
  if (status && status !== 'all' && ALLOWED_STATUS.has(status)) {
    query = query.eq('status', status);
  }

  const boutiqueId =
    typeof filters.boutiqueId === 'string' && filters.boutiqueId.trim()
      ? filters.boutiqueId.trim()
      : null;
  if (boutiqueId) {
    query = query.eq('boutique_id', boutiqueId);
  }

  const { data, error } = await query;
  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 500 });
  }

  return (data ?? []).map(mapAppointmentAdminRow);
}

export async function adminUpdateAppointmentStatus(appointmentId, nextStatus) {
  if (!ALLOWED_STATUS.has(nextStatus)) {
    throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('appointments')
    .select('id, user_id, boutique_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (exErr) {
    throw Object.assign(new Error(exErr.message), { statusCode: 500 });
  }
  if (!existing) {
    throw Object.assign(new Error('Not found'), { statusCode: 404 });
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: nextStatus })
    .eq('id', appointmentId);

  if (error) {
    throw Object.assign(new Error(error.message), { statusCode: 500 });
  }

  const { data, error: fetchErr } = await supabase
    .from('appointments')
    .select(ADMIN_APPOINTMENT_SELECT)
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr) {
    throw Object.assign(new Error(fetchErr.message), { statusCode: 500 });
  }
  if (!data) {
    throw Object.assign(new Error('Not found'), { statusCode: 404 });
  }

  const boutiqueName = data.boutiques?.name ?? data.boutiques?.boutique_name ?? null;
  if (existing.user_id && existing.status !== nextStatus) {
    const eventKey =
      nextStatus === 'cancelled'
        ? 'appointment_rejected'
        : nextStatus === 'upcoming' || nextStatus === 'confirmed'
          ? 'appointment_approved'
          : null;
    if (eventKey) {
      await dispatchSystemEvent(eventKey, {
        userId: existing.user_id,
        appointmentId,
        boutiqueName,
      });
    }
  }

  return mapAppointmentAdminRow(data);
}
