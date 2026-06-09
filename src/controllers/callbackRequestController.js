import {
  assignCallbackRequest,
  createCallbackRequest,
  getNextStatus,
  listCallbackRequestsAdmin,
  updateCallbackRequestStatus,
} from '../services/callbackRequestService.js';

export async function postCallbackRequest(req, res, next) {
  try {
    const row = await createCallbackRequest(req.body ?? {});
    return res.status(201).json({
      success: true,
      data: row,
      message: 'Callback request submitted successfully',
    });
  } catch (error) {
    if (error.status === 400 && error.validation) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.validation,
      });
    }
    return next(error);
  }
}

export async function listCallbackRequestsAdminHandler(req, res, next) {
  try {
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim().toLowerCase()
        : 'all';

    const rows = await listCallbackRequestsAdmin({ status });
    return res.status(200).json({
      success: true,
      data: rows,
      message: 'Callback requests loaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function patchCallbackRequestAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { status, action } = req.body ?? {};

    let row;
    if (action === 'assign') {
      row = await assignCallbackRequest(id);
    } else if (typeof status === 'string' && status.trim()) {
      row = await updateCallbackRequestStatus(id, status.trim().toLowerCase());
    } else {
      return res.status(400).json({
        success: false,
        message: 'status or action=assign is required',
      });
    }

    return res.status(200).json({
      success: true,
      data: row,
      message: 'Callback request updated',
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function getCallbackNextStatus(req, res) {
  const { current } = req.query;
  const next = typeof current === 'string' ? getNextStatus(current) : null;
  return res.status(200).json({
    success: true,
    data: { next },
  });
}
