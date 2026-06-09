import {
  createFeaturedSection,
  deleteFeaturedSectionById,
  getFeaturedSectionById,
  getFeaturedSectionBySlug,
  getFeaturedSections,
  reorderFeaturedSections,
  updateFeaturedSectionById,
} from '../services/featuredSectionService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchFeaturedSections(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getFeaturedSections({ includeInactive });
    return res.status(200).json({ success: true, data, message: 'Featured sections fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchFeaturedSection(req, res, next) {
  try {
    const data = await getFeaturedSectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Section not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Section fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchFeaturedSectionBySlug(req, res, next) {
  try {
    const data = await getFeaturedSectionBySlug(req.params.slug);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Section not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Section fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createFeaturedSectionHandler(req, res, next) {
  try {
    const data = await createFeaturedSection(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Section created' });
  } catch (error) {
    return next(error);
  }
}

export async function updateFeaturedSectionHandler(req, res, next) {
  try {
    const data = await updateFeaturedSectionById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Section not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Section updated' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteFeaturedSectionHandler(req, res, next) {
  try {
    const data = await deleteFeaturedSectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Section not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Section deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderFeaturedSectionsHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderFeaturedSections(items);
    return res.status(200).json({ success: true, data: null, message: 'Featured sections reordered' });
  } catch (error) {
    return next(error);
  }
}
