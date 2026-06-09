import {
  deleteFeaturedProductRow,
  getDiscoverFeaturedProducts,
  reorderDiscoverFeaturedProducts,
  replaceDiscoverFeaturedProducts,
  updateFeaturedProductRow,
} from '../services/featuredProductService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchFeaturedProducts(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getDiscoverFeaturedProducts({ includeInactive });
    return res.status(200).json({ success: true, data, message: 'Featured products fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function replaceFeaturedProductsHandler(req, res, next) {
  try {
    const ids = req.body?.product_ids ?? req.body?.productIds ?? [];
    const data = await replaceDiscoverFeaturedProducts(ids);
    return res.status(200).json({ success: true, data, message: 'Saved' });
  } catch (error) {
    return next(error);
  }
}

export async function updateFeaturedProductHandler(req, res, next) {
  try {
    const data = await updateFeaturedProductRow(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Updated' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteFeaturedProductHandler(req, res, next) {
  try {
    const data = await deleteFeaturedProductRow(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderFeaturedProductsHandler(req, res, next) {
  try {
    await reorderDiscoverFeaturedProducts(req.body?.items ?? []);
    return res.status(200).json({ success: true, data: null, message: 'Reordered' });
  } catch (error) {
    return next(error);
  }
}
