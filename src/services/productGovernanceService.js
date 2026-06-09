import { supabase } from '../config/supabase.js';
import {
  CORRECTION_FIELD_NAMES,
  FLAG_REASON_CODES,
  GOVERNANCE_STATUSES,
  serializeFieldValue,
} from '../constants/productGovernance.js';

async function getProductRow(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load product: ${error.message}`);
  return data;
}

async function touchAdminAction(productId) {
  await supabase
    .from('products')
    .update({ last_admin_action_at: new Date().toISOString() })
    .eq('id', productId);
}

export async function getActiveFlag(productId) {
  const { data, error } = await supabase
    .from('product_flags')
    .select('*')
    .eq('product_id', productId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load product flag: ${error.message}`);
  return data;
}

export async function getActiveSuspension(productId) {
  const { data, error } = await supabase
    .from('product_suspensions')
    .select('*')
    .eq('product_id', productId)
    .is('reinstated_at', null)
    .order('suspended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load suspension: ${error.message}`);
  return data;
}

export async function getOpenCorrectionRequests(productId) {
  const { data, error } = await supabase
    .from('product_correction_requests')
    .select('*')
    .eq('product_id', productId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load correction requests: ${error.message}`);
  return data ?? [];
}

export async function getProductGovernanceState(productId) {
  const [activeFlag, activeSuspension, openCorrections] = await Promise.all([
    getActiveFlag(productId),
    getActiveSuspension(productId),
    getOpenCorrectionRequests(productId),
  ]);
  return {
    active_flag: activeFlag,
    active_suspension: activeSuspension,
    open_correction_requests: openCorrections,
    has_pending_correction: openCorrections.length > 0,
  };
}

export async function flagProduct({
  productId,
  adminId,
  reasonCode,
  reasonText,
  autoResolve = false,
}) {
  if (!FLAG_REASON_CODES.includes(reasonCode)) {
    throw new Error(`Invalid flag reason. Must be one of: ${FLAG_REASON_CODES.join(', ')}`);
  }

  const product = await getProductRow(productId);
  if (!product) throw new Error('Product not found');

  const { data, error } = await supabase
    .from('product_flags')
    .insert({
      product_id: productId,
      admin_id: adminId,
      reason_code: reasonCode,
      reason_text: reasonText?.trim() || null,
      auto_resolve: Boolean(autoResolve),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to flag product: ${error.message}`);

  await supabase
    .from('products')
    .update({
      status: GOVERNANCE_STATUSES.FLAGGED,
      last_admin_action_at: new Date().toISOString(),
    })
    .eq('id', productId);

  return data;
}

export async function clearProductFlag({ productId, adminId }) {
  const activeFlag = await getActiveFlag(productId);
  if (!activeFlag) throw new Error('No active flag on this product');

  const { error } = await supabase
    .from('product_flags')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
    })
    .eq('id', activeFlag.id);

  if (error) throw new Error(`Failed to clear flag: ${error.message}`);

  const openCorrections = await getOpenCorrectionRequests(productId);
  const activeSuspension = await getActiveSuspension(productId);

  let nextStatus = GOVERNANCE_STATUSES.ACTIVE;
  if (activeSuspension) {
    nextStatus = GOVERNANCE_STATUSES.SUSPENDED;
  } else if (openCorrections.length > 0) {
    nextStatus = GOVERNANCE_STATUSES.PENDING_CORRECTION;
  }

  await supabase.from('products').update({ status: nextStatus }).eq('id', productId);
  await touchAdminAction(productId);
  return { cleared_flag_id: activeFlag.id, status: nextStatus };
}

export async function suspendProduct({ productId, adminId, reasonText }) {
  const product = await getProductRow(productId);
  if (!product) throw new Error('Product not found');
  if (!reasonText?.trim()) throw new Error('Suspension reason is required');

  const existing = await getActiveSuspension(productId);
  if (existing) throw new Error('Product is already suspended');

  const { data, error } = await supabase
    .from('product_suspensions')
    .insert({
      product_id: productId,
      admin_id: adminId,
      reason_text: reasonText.trim(),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to suspend product: ${error.message}`);

  await supabase
    .from('products')
    .update({
      status: GOVERNANCE_STATUSES.SUSPENDED,
      last_admin_action_at: new Date().toISOString(),
    })
    .eq('id', productId);

  return data;
}

export async function reinstateProduct({ productId, adminId }) {
  const activeSuspension = await getActiveSuspension(productId);
  if (!activeSuspension) throw new Error('Product is not currently suspended');

  const { error } = await supabase
    .from('product_suspensions')
    .update({
      reinstated_at: new Date().toISOString(),
      reinstated_by: adminId,
    })
    .eq('id', activeSuspension.id);

  if (error) throw new Error(`Failed to reinstate product: ${error.message}`);

  const activeFlag = await getActiveFlag(productId);
  const openCorrections = await getOpenCorrectionRequests(productId);

  let nextStatus = GOVERNANCE_STATUSES.ACTIVE;
  if (activeFlag) {
    nextStatus = GOVERNANCE_STATUSES.FLAGGED;
  } else if (openCorrections.length > 0) {
    nextStatus = GOVERNANCE_STATUSES.PENDING_CORRECTION;
  }

  await supabase
    .from('products')
    .update({
      status: nextStatus,
      last_admin_action_at: new Date().toISOString(),
    })
    .eq('id', productId);

  return { reinstated_suspension_id: activeSuspension.id, status: nextStatus };
}

export async function createCorrectionRequest({
  productId,
  adminId,
  fieldName,
  message,
  autoResolve = false,
}) {
  if (!CORRECTION_FIELD_NAMES.includes(fieldName)) {
    throw new Error(`Invalid field. Must be one of: ${CORRECTION_FIELD_NAMES.join(', ')}`);
  }
  if (!message?.trim()) throw new Error('Correction message is required');

  const product = await getProductRow(productId);
  if (!product) throw new Error('Product not found');

  const { data, error } = await supabase
    .from('product_correction_requests')
    .insert({
      product_id: productId,
      admin_id: adminId,
      field_name: fieldName,
      message: message.trim(),
      auto_resolve: Boolean(autoResolve),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create correction request: ${error.message}`);

  const activeSuspension = await getActiveSuspension(productId);
  if (!activeSuspension && product.status !== GOVERNANCE_STATUSES.FLAGGED) {
    await supabase
      .from('products')
      .update({
        status: GOVERNANCE_STATUSES.PENDING_CORRECTION,
        last_admin_action_at: new Date().toISOString(),
      })
      .eq('id', productId);
  } else {
    await touchAdminAction(productId);
  }

  return data;
}

export async function resolveCorrectionRequest({ requestId, adminId }) {
  const { data: request, error: loadError } = await supabase
    .from('product_correction_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load correction request: ${loadError.message}`);
  if (!request) throw new Error('Correction request not found');
  if (request.resolved_at) throw new Error('Correction request already resolved');

  const { error } = await supabase
    .from('product_correction_requests')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error(`Failed to resolve correction request: ${error.message}`);

  const openCorrections = await getOpenCorrectionRequests(request.product_id);
  if (openCorrections.length === 0) {
    const activeFlag = await getActiveFlag(request.product_id);
    const activeSuspension = await getActiveSuspension(request.product_id);
    let nextStatus = GOVERNANCE_STATUSES.ACTIVE;
    if (activeSuspension) nextStatus = GOVERNANCE_STATUSES.SUSPENDED;
    else if (activeFlag) nextStatus = GOVERNANCE_STATUSES.FLAGGED;

    await supabase.from('products').update({ status: nextStatus }).eq('id', request.product_id);
  }

  await touchAdminAction(request.product_id);
  return { resolved_request_id: requestId, admin_id: adminId };
}

export async function recordProductEditHistory({
  productId,
  jewellerId,
  previousRow,
  nextPayload,
  trackedFields,
}) {
  const rows = [];
  for (const field of trackedFields) {
    const oldVal = serializeFieldValue(previousRow[field]);
    const newVal = serializeFieldValue(nextPayload[field]);
    if (oldVal === newVal) continue;
    rows.push({
      product_id: productId,
      jeweller_id: jewellerId,
      field_name: field,
      old_value: oldVal,
      new_value: newVal,
    });
  }

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('product_edit_history')
    .insert(rows)
    .select('*');
  if (error) throw new Error(`Failed to record edit history: ${error.message}`);
  return data ?? [];
}

export async function tryAutoResolveAfterJewellerEdit(productId) {
  const activeFlag = await getActiveFlag(productId);
  if (activeFlag?.auto_resolve) {
    await supabase
      .from('product_flags')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: 'auto:jeweller-edit',
      })
      .eq('id', activeFlag.id);
  }

  const openCorrections = await getOpenCorrectionRequests(productId);
  for (const req of openCorrections) {
    if (req.auto_resolve) {
      await supabase
        .from('product_correction_requests')
        .update({
          acknowledged_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
        })
        .eq('id', req.id);
    }
  }

  const remainingFlag = activeFlag?.auto_resolve ? null : await getActiveFlag(productId);
  const remainingCorrections = (await getOpenCorrectionRequests(productId)).filter(
    (r) => !r.auto_resolve,
  );
  const activeSuspension = await getActiveSuspension(productId);

  let nextStatus = GOVERNANCE_STATUSES.ACTIVE;
  if (activeSuspension) nextStatus = GOVERNANCE_STATUSES.SUSPENDED;
  else if (remainingFlag) nextStatus = GOVERNANCE_STATUSES.FLAGGED;
  else if (remainingCorrections.length > 0) nextStatus = GOVERNANCE_STATUSES.PENDING_CORRECTION;

  await supabase.from('products').update({ status: nextStatus }).eq('id', productId);
  return { status: nextStatus };
}

export async function getJewellerGovernanceSummary(jewellerId) {
  const { data: products, error } = await supabase
    .from('products')
    .select('id')
    .eq('owner_jeweller_id', jewellerId);
  if (error) throw new Error(`Failed to load jeweller products: ${error.message}`);

  const productIds = (products ?? []).map((p) => p.id);
  if (!productIds.length) {
    return { unresolved_flags: 0, pending_corrections: 0, suspended_products: 0 };
  }

  const [flags, corrections, suspended] = await Promise.all([
    supabase
      .from('product_flags')
      .select('id', { count: 'exact', head: true })
      .in('product_id', productIds)
      .is('resolved_at', null),
    supabase
      .from('product_correction_requests')
      .select('id', { count: 'exact', head: true })
      .in('product_id', productIds)
      .is('resolved_at', null),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .in('id', productIds)
      .eq('status', GOVERNANCE_STATUSES.SUSPENDED),
  ]);

  return {
    unresolved_flags: flags.count ?? 0,
    pending_corrections: corrections.count ?? 0,
    suspended_products: suspended.count ?? 0,
  };
}

export async function getProductActivityFeed({
  jewellerId = null,
  actionType = null,
  fromDate = null,
  toDate = null,
  limit = 50,
} = {}) {
  const events = [];

  let editQuery = supabase
    .from('product_edit_history')
    .select('*, products(id, name, owner_jeweller_id, boutique_id)')
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (jewellerId) editQuery = editQuery.eq('jeweller_id', jewellerId);
  if (fromDate) editQuery = editQuery.gte('changed_at', fromDate);
  if (toDate) editQuery = editQuery.lte('changed_at', toDate);

  if (!actionType || actionType === 'edit') {
    const { data: edits } = await editQuery;
    for (const row of edits ?? []) {
      events.push({
        id: row.id,
        action_type: 'edit',
        product_id: row.product_id,
        product_name: row.products?.name ?? null,
        jeweller_id: row.jeweller_id,
        field_name: row.field_name,
        old_value: row.old_value,
        new_value: row.new_value,
        created_at: row.changed_at,
      });
    }
  }

  if (!actionType || actionType === 'flag') {
    let flagQuery = supabase
      .from('product_flags')
      .select('*, products(id, name, owner_jeweller_id)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fromDate) flagQuery = flagQuery.gte('created_at', fromDate);
    if (toDate) flagQuery = flagQuery.lte('created_at', toDate);
    const { data: flags } = await flagQuery;
    for (const row of flags ?? []) {
      if (jewellerId && row.products?.owner_jeweller_id !== jewellerId) continue;
      events.push({
        id: row.id,
        action_type: 'flag',
        product_id: row.product_id,
        product_name: row.products?.name ?? null,
        admin_id: row.admin_id,
        reason_code: row.reason_code,
        reason_text: row.reason_text,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
      });
    }
  }

  if (!actionType || actionType === 'suspend') {
    let suspendQuery = supabase
      .from('product_suspensions')
      .select('*, products(id, name, owner_jeweller_id)')
      .order('suspended_at', { ascending: false })
      .limit(limit);
    if (fromDate) suspendQuery = suspendQuery.gte('suspended_at', fromDate);
    if (toDate) suspendQuery = suspendQuery.lte('suspended_at', toDate);
    const { data: suspensions } = await suspendQuery;
    for (const row of suspensions ?? []) {
      if (jewellerId && row.products?.owner_jeweller_id !== jewellerId) continue;
      events.push({
        id: row.id,
        action_type: 'suspend',
        product_id: row.product_id,
        product_name: row.products?.name ?? null,
        admin_id: row.admin_id,
        reason_text: row.reason_text,
        reinstated_at: row.reinstated_at,
        created_at: row.suspended_at,
      });
    }
  }

  if (!actionType || actionType === 'correction') {
    let correctionQuery = supabase
      .from('product_correction_requests')
      .select('*, products(id, name, owner_jeweller_id)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fromDate) correctionQuery = correctionQuery.gte('created_at', fromDate);
    if (toDate) correctionQuery = correctionQuery.lte('created_at', toDate);
    const { data: corrections } = await correctionQuery;
    for (const row of corrections ?? []) {
      if (jewellerId && row.products?.owner_jeweller_id !== jewellerId) continue;
      events.push({
        id: row.id,
        action_type: 'correction',
        product_id: row.product_id,
        product_name: row.products?.name ?? null,
        admin_id: row.admin_id,
        field_name: row.field_name,
        message: row.message,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
      });
    }
  }

  events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return events.slice(0, limit);
}
