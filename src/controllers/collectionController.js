import {
  createCollection,
  deleteCollectionById,
  getCollectionById,
  getCollectionBySlug,
  getCollections,
  reorderCollections,
  updateCollectionById,
} from '../services/collectionService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchCollections(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const trendingOnly = parseBool(req.query?.trending);
    const featuredOnly = parseBool(req.query?.featured);
    const data = await getCollections({ includeInactive, trendingOnly, featuredOnly });
    return res.status(200).json({
      success: true,
      data,
      message: 'Collections fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchCollection(req, res, next) {
  try {
    const data = await getCollectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Collection fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchCollectionBySlug(req, res, next) {
  try {
    const data = await getCollectionBySlug(req.params.slug);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Collection fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createCollectionHandler(req, res, next) {
  try {
    const data = await createCollection(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Collection created successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function updateCollectionHandler(req, res, next) {
  try {
    const data = await updateCollectionById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Collection updated successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteCollectionHandler(req, res, next) {
  try {
    const data = await deleteCollectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Collection not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Collection deleted successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderCollectionsHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderCollections(items);
    return res.status(200).json({ success: true, data: null, message: 'Collections reordered' });
  } catch (error) {
    return next(error);
  }
}
