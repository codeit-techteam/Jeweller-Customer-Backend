import {
  clearProductFlag,
  createCorrectionRequest,
  flagProduct,
  getProductActivityFeed,
  getProductGovernanceState,
  reinstateProduct,
  resolveCorrectionRequest,
  suspendProduct,
} from '../services/productGovernanceService.js';
import {
  getProductWithGovernance,
  updateProductById,
} from '../services/productService.js';

export async function getProductGovernanceHandler(req, res, next) {
  try {
    const { id } = req.params;
    const product = await getProductWithGovernance(id, { includeInactive: true });
    if (!product) {
      return res.status(404).json({ success: false, data: null, message: 'Product not found' });
    }
    return res.status(200).json({ success: true, data: product, message: 'Product governance loaded' });
  } catch (error) {
    return next(error);
  }
}

export async function flagProductHandler(req, res, next) {
  try {
    const { reason_code, reason_text, auto_resolve } = req.body ?? {};
    const data = await flagProduct({
      productId: req.params.id,
      adminId: req.adminId,
      reasonCode: reason_code,
      reasonText: reason_text,
      autoResolve: auto_resolve,
    });
    return res.status(201).json({ success: true, data, message: 'Product flagged' });
  } catch (error) {
    return next(error);
  }
}

export async function clearFlagHandler(req, res, next) {
  try {
    const data = await clearProductFlag({
      productId: req.params.id,
      adminId: req.adminId,
    });
    return res.status(200).json({ success: true, data, message: 'Flag cleared' });
  } catch (error) {
    return next(error);
  }
}

export async function suspendProductHandler(req, res, next) {
  try {
    const { reason_text } = req.body ?? {};
    const data = await suspendProduct({
      productId: req.params.id,
      adminId: req.adminId,
      reasonText: reason_text,
    });
    return res.status(201).json({ success: true, data, message: 'Product suspended' });
  } catch (error) {
    return next(error);
  }
}

export async function reinstateProductHandler(req, res, next) {
  try {
    const data = await reinstateProduct({
      productId: req.params.id,
      adminId: req.adminId,
    });
    return res.status(200).json({ success: true, data, message: 'Product reinstated' });
  } catch (error) {
    return next(error);
  }
}

export async function createCorrectionRequestHandler(req, res, next) {
  try {
    const { field_name, message, auto_resolve } = req.body ?? {};
    const data = await createCorrectionRequest({
      productId: req.params.id,
      adminId: req.adminId,
      fieldName: field_name,
      message,
      autoResolve: auto_resolve,
    });
    return res.status(201).json({ success: true, data, message: 'Correction request sent' });
  } catch (error) {
    return next(error);
  }
}

export async function resolveCorrectionRequestHandler(req, res, next) {
  try {
    const data = await resolveCorrectionRequest({
      requestId: req.params.requestId,
      adminId: req.adminId,
    });
    return res.status(200).json({ success: true, data, message: 'Correction request resolved' });
  } catch (error) {
    return next(error);
  }
}

export async function getProductActivityFeedHandler(req, res, next) {
  try {
    const {
      jeweller_id: jewellerId,
      action_type: actionType,
      from_date: fromDate,
      to_date: toDate,
      limit,
    } = req.query;
    const data = await getProductActivityFeed({
      jewellerId: jewellerId ?? null,
      actionType: actionType ?? null,
      fromDate: fromDate ?? null,
      toDate: toDate ?? null,
      limit: limit ? Number(limit) : 50,
    });
    return res.status(200).json({ success: true, data, message: 'Activity feed loaded' });
  } catch (error) {
    return next(error);
  }
}

export async function updateProductCurationHandler(req, res, next) {
  try {
    const data = await updateProductById(req.params.id, req.body ?? {}, { isAdmin: true });
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Product not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Product curation updated' });
  } catch (error) {
    return next(error);
  }
}

export async function getGovernanceStateHandler(req, res, next) {
  try {
    const data = await getProductGovernanceState(req.params.id);
    return res.status(200).json({ success: true, data, message: 'Governance state loaded' });
  } catch (error) {
    return next(error);
  }
}
