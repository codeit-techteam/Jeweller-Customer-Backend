import {
  createGiftCollection,
  deleteGiftCollectionById,
  getGiftCollectionById,
  getGiftCollections,
  reorderGiftCollections,
  updateGiftCollectionById,
} from '../services/giftCollectionService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchGiftCollections(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getGiftCollections({ includeInactive });
    return res.status(200).json({ success: true, data, message: 'Gift collections fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchGiftCollection(req, res, next) {
  try {
    const data = await getGiftCollectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Gift collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Gift collection fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createGiftCollectionHandler(req, res, next) {
  try {
    const data = await createGiftCollection(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Gift collection created' });
  } catch (error) {
    return next(error);
  }
}

export async function updateGiftCollectionHandler(req, res, next) {
  try {
    const data = await updateGiftCollectionById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Gift collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Gift collection updated' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteGiftCollectionHandler(req, res, next) {
  try {
    const data = await deleteGiftCollectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Gift collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Gift collection deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderGiftCollectionsHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderGiftCollections(items);
    return res.status(200).json({ success: true, data: null, message: 'Gift collections reordered' });
  } catch (error) {
    return next(error);
  }
}
