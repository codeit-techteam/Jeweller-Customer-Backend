import {
  createOffer,
  deleteOfferById,
  getOfferById,
  getOffers,
  reorderOffers,
  updateOfferById,
} from '../services/offerService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchOffers(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const includeExpired = parseBool(req.query?.include_expired) || includeInactive;
    const data = await getOffers({ includeInactive, includeExpired });
    return res.status(200).json({ success: true, data, message: 'Offers fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchOffer(req, res, next) {
  try {
    const data = await getOfferById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Offer not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Offer fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createOfferHandler(req, res, next) {
  try {
    const data = await createOffer(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Offer created' });
  } catch (error) {
    return next(error);
  }
}

export async function updateOfferHandler(req, res, next) {
  try {
    const data = await updateOfferById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Offer not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Offer updated' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteOfferHandler(req, res, next) {
  try {
    const data = await deleteOfferById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Offer not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Offer deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderOffersHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderOffers(items);
    return res.status(200).json({ success: true, data: null, message: 'Offers reordered' });
  } catch (error) {
    return next(error);
  }
}
