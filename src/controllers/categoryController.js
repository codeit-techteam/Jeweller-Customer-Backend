import {
  createCategory,
  deleteCategoryById,
  getCategories,
  getCategoryById,
  getCategoryListingProducts,
  getCategoryListingProductsBySlug,
  reorderCategories,
  updateCategoryById,
} from '../services/categoryService.js';

function parseBool(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export async function fetchCategories(req, res, next) {
  try {
    const includeInactive = parseBool(req.query?.include_inactive);
    const data = await getCategories({ includeInactive });
    return res.status(200).json({
      success: true,
      data,
      message: 'Categories fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchCategory(req, res, next) {
  try {
    const data = await getCategoryById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Category not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Category fetched successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function createCategoryHandler(req, res, next) {
  try {
    const data = await createCategory(req.body ?? {});
    return res.status(201).json({ success: true, data, message: 'Category created successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function updateCategoryHandler(req, res, next) {
  try {
    const data = await updateCategoryById(req.params.id, req.body ?? {});
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Category not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Category updated successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteCategoryHandler(req, res, next) {
  try {
    const data = await deleteCategoryById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Category not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Category deleted successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function fetchCategoryListing(req, res, next) {
  try {
    const slug = req.query?.slug ? String(req.query.slug) : null;
    const data = slug
      ? await getCategoryListingProductsBySlug(slug)
      : await getCategoryListingProducts(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Category not found' });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Category listing fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function reorderCategoriesHandler(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await reorderCategories(items);
    return res.status(200).json({ success: true, data: null, message: 'Categories reordered' });
  } catch (error) {
    return next(error);
  }
}
