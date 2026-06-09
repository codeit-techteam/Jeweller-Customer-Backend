import {
  createOccasion,
  deleteOccasionById,
  getOccasionById,
  getOccasions,
  reorderOccasions,
  updateOccasionById,
} from '../services/occasionService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchOccasions(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getOccasions({ includeInactive });
    return res.status(200).json({
      success: true,
      data,
      message: 'Occasions fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchOccasion(req, res, next) {
  try {
    const data = await getOccasionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Occasion not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Occasion fetched successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function createOccasionHandler(req, res, next) {
  try {
    const data = await createOccasion(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Occasion created successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function updateOccasionHandler(req, res, next) {
  try {
    const data = await updateOccasionById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Occasion not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Occasion updated successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteOccasionHandler(req, res, next) {
  try {
    const data = await deleteOccasionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Occasion not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Occasion deleted successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderOccasionsHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderOccasions(items);
    return res.status(200).json({ success: true, data: null, message: 'Occasions reordered' });
  } catch (error) {
    return next(error);
  }
}
