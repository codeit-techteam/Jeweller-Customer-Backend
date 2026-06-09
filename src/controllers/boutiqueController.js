import {
  createBoutique,
  getBoutiqueById,
  getBoutiqueCollections,
  getBoutiqueDetailsById,
  getBoutiqueProducts,
  getBoutiques,
  getFeaturedBoutiques,
  patchBoutiqueAdminById,
  softDeleteBoutiqueById,
  updateBoutiqueById,
} from '../services/boutiqueServiceV2.js';

export async function fetchFeaturedBoutiques(req, res, next) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Number(req.query.limit);
    const radiusKm = Number(req.query.radius_km);
    const userCoords =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    console.log('[fetchFeaturedBoutiques]', {
      lat: userCoords?.lat ?? null,
      lng: userCoords?.lng ?? null,
      limit: Number.isFinite(limit) ? limit : 10,
      radius_km: Number.isFinite(radiusKm) ? radiusKm : null,
    });
    const data = await getFeaturedBoutiques({
      userCoords,
      limit: Number.isFinite(limit) ? limit : 10,
      radiusKm: Number.isFinite(radiusKm) ? radiusKm : null,
    });
    console.log('[fetchFeaturedBoutiques] returning', { count: data.length });
    return res.status(200).json({
      success: true,
      data,
      message: 'Featured boutiques fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiques(req, res, next) {
  try {
    const includeAll = req.query.includeAll === 'true';
    const data = await getBoutiques({ includeAll });
    const payload = {
      success: true,
      data,
      message: 'Boutiques fetched successfully',
    };
    console.log('[boutiqueController] API response payload', {
      totalBoutiques: Array.isArray(data) ? data.length : 0,
    });
    return res.status(200).json({
      ...payload,
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiqueProducts(req, res, next) {
  try {
    const data = await getBoutiqueProducts(req.params.id);
    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique products fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiqueCollections(req, res, next) {
  try {
    const data = await getBoutiqueCollections(req.params.id);
    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique collections fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchBoutiqueById(req, res, next) {
  try {
    console.log('[boutiqueController] GET /api/boutiques/:id', { id: req.params.id });
    const data = await getBoutiqueById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Boutique not found' });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique fetched successfully',
    });
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('0 rows')) {
      return res.status(404).json({ success: false, data: null, message: 'Boutique not found' });
    }
    return next(error);
  }
}

export async function fetchBoutiqueDetailsById(req, res, next) {
  try {
    const data = await getBoutiqueDetailsById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Boutique not found' });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique details fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function patchBoutiqueAdmin(req, res, next) {
  try {
    const adminUserId = req.adminUser?.id ?? req.user?.id ?? null;
    const data = await patchBoutiqueAdminById(req.params.id, req.body ?? {}, adminUserId);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Boutique not found' });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique updated successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function editBoutique(req, res, next) {
  try {
    const data = await updateBoutiqueById(req.params.id, req.body);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Boutique not found' });
    }

    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique updated successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function removeBoutique(req, res, next) {
  try {
    const data = await softDeleteBoutiqueById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Boutique not found' });
    }

    return res.status(200).json({
      success: true,
      data,
      message: 'Boutique deleted successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function createBoutiqueHandler(req, res, next) {
  try {
    const data = await createBoutique(req.body ?? {});
    return res.status(201).json({
      success: true,
      data,
      message: 'Boutique created successfully',
    });
  } catch (error) {
    return next(error);
  }
}
