import {
  createRelationshipSection,
  deleteRelationshipSectionById,
  getRelationshipSectionById,
  getRelationshipSections,
  getRelationshipSectionListingProducts,
  reorderRelationshipSections,
  updateRelationshipSectionById,
} from '../services/relationshipSectionService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchRelationshipSections(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getRelationshipSections({ includeInactive });
    return res.status(200).json({ success: true, data, message: 'Relationship sections fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchRelationshipSection(req, res, next) {
  try {
    const data = await getRelationshipSectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Relationship section fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchRelationshipSectionListing(req, res, next) {
  try {
    const data = await getRelationshipSectionListingProducts(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Products fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createRelationshipSectionHandler(req, res, next) {
  try {
    const data = await createRelationshipSection(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Created' });
  } catch (error) {
    return next(error);
  }
}

export async function updateRelationshipSectionHandler(req, res, next) {
  try {
    const data = await updateRelationshipSectionById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Updated' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteRelationshipSectionHandler(req, res, next) {
  try {
    const data = await deleteRelationshipSectionById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderRelationshipSectionsHandler(req, res, next) {
  try {
    await reorderRelationshipSections(req.body?.items ?? []);
    return res.status(200).json({ success: true, data: null, message: 'Reordered' });
  } catch (error) {
    return next(error);
  }
}
