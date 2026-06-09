import { supabase } from '../config/supabase.js';
import { dispatchSystemEvent } from './notificationEngine.js';

const SLOT_VALUES = new Set(['morning', 'afternoon', 'evening']);
const STATUS_VALUES = new Set([
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'closed',
]);

const NEXT_STATUS = {
  pending: 'assigned',
  assigned: 'in_progress',
  in_progress: 'completed',
  completed: 'closed',
};

function normalizeMobile(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function mapRow(row) {
  return {
    id: row.id,
    referenceId: row.reference_id,
    customerId: row.customer_id ?? null,
    customerName: row.customer_name ?? null,
    mobileNumber: row.mobile_number,
    preferredTimeSlot: row.preferred_time_slot,
    requirement: row.requirement,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateCreatePayload(body) {
  const mobile = normalizeMobile(body?.mobileNumber ?? body?.mobile_number);
  const slot = String(body?.preferredTimeSlot ?? body?.preferred_time_slot ?? '')
    .trim()
    .toLowerCase();
  const requirement = String(body?.requirement ?? '').trim();

  const errors = {};
  if (!mobile || mobile.length !== 10) {
    errors.mobileNumber = 'Enter a valid 10-digit mobile number';
  }
  if (!SLOT_VALUES.has(slot)) {
    errors.preferredTimeSlot = 'Select a preferred time slot';
  }
  if (requirement.length < 5) {
    errors.requirement = 'Please describe your requirement (at least 5 characters)';
  } else if (requirement.length > 300) {
    errors.requirement = 'Requirement must be 300 characters or less';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    payload: {
      customerId: body?.customerId ?? body?.customer_id ?? null,
      customerName:
        typeof body?.customerName === 'string' && body.customerName.trim()
          ? body.customerName.trim()
          : typeof body?.customer_name === 'string' && body.customer_name.trim()
            ? body.customer_name.trim()
            : null,
      mobileNumber: mobile,
      preferredTimeSlot: slot,
      requirement,
    },
  };
}

export async function createCallbackRequest(body) {
  const { valid, errors, payload } = validateCreatePayload(body);
  if (!valid) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.validation = errors;
    throw err;
  }

  const { data, error } = await supabase
    .from('callback_requests')
    .insert({
      customer_id: payload.customerId,
      customer_name: payload.customerName,
      mobile_number: payload.mobileNumber,
      preferred_time_slot: payload.preferredTimeSlot,
      requirement: payload.requirement,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  const row = mapRow(data);

  if (row.customerId) {
    await dispatchSystemEvent('callback_submitted', {
      userId: row.customerId,
      callbackId: row.id,
    });
  }

  return row;
}

export async function listCallbackRequestsAdmin({ status } = {}) {
  let query = supabase
    .from('callback_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all' && STATUS_VALUES.has(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export function getNextStatus(current) {
  return NEXT_STATUS[current] ?? null;
}

export function canTransition(from, to) {
  if (!STATUS_VALUES.has(from) || !STATUS_VALUES.has(to)) return false;
  return getNextStatus(from) === to;
}

export async function updateCallbackRequestStatus(id, nextStatus) {
  const { data: existing, error: fetchError } = await supabase
    .from('callback_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    const err = new Error('Callback request not found');
    err.status = 404;
    throw err;
  }

  if (!canTransition(existing.status, nextStatus)) {
    const err = new Error(
      `Cannot change status from ${existing.status} to ${nextStatus}`,
    );
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('callback_requests')
    .update({ status: nextStatus })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  const row = mapRow(data);
  if (row.customerId) {
    if (row.status === 'assigned' && existing.status !== 'assigned') {
      await dispatchSystemEvent('callback_assigned', {
        userId: row.customerId,
        callbackId: row.id,
      });
    }
    if (row.status === 'completed' || row.status === 'closed') {
      await dispatchSystemEvent('callback_closed', {
        userId: row.customerId,
        callbackId: row.id,
      });
    }
  }
  return row;
}

export async function assignCallbackRequest(id) {
  return updateCallbackRequestStatus(id, 'assigned');
}
