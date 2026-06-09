import {
  createMenuCategory,
  deleteMenuCategoryById,
  getMenuCategories,
  getMenuCategoryById,
  reorderMenuCategories,
  updateMenuCategoryById,
} from '../services/menuCategoryService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchMenuCategories(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getMenuCategories({ includeInactive });
    return res.status(200).json({ success: true, data, message: 'Menu categories fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchMenuCategory(req, res, next) {
  try {
    const data = await getMenuCategoryById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Menu category not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Menu category fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createMenuCategoryHandler(req, res, next) {
  try {
    const data = await createMenuCategory(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Menu category created' });
  } catch (error) {
    return next(error);
  }
}

export async function updateMenuCategoryHandler(req, res, next) {
  try {
    const data = await updateMenuCategoryById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Menu category not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Menu category updated' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteMenuCategoryHandler(req, res, next) {
  try {
    const data = await deleteMenuCategoryById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Menu category not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Menu category deleted' });
  } catch (error) {
    return next(error);
  }
}

export async function reorderMenuCategoriesHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderMenuCategories(items);
    return res.status(200).json({ success: true, data: null, message: 'Menu categories reordered' });
  } catch (error) {
    return next(error);
  }
}
