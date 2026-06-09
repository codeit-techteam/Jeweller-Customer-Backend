import {
  createProduct,
  deleteProductById,
  getProductById,
  getProducts,
  getTrendingProducts,
  updateProductById,
} from '../services/productService.js';
import { isAdminRequest } from '../middleware/admin.js';

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function fetchProducts(req, res, next) {
  try {
    const { category_id: categoryId } = req.query;
    const includeInactive =
      String(req.query.include_inactive ?? req.query.includeInactive ?? '') ===
        'true' || isAdminRequest(req);
    console.log('[productController] GET /api/products', {
      categoryId: categoryId ?? null,
      includeInactive,
    });
    const data = await getProducts(categoryId, { includeInactive });
    return res.status(200).json({
      success: true,
      data,
      message: 'Products fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchProductById(req, res, next) {
  try {
    const { id } = req.params;
    console.log('[productController] GET /api/products/:id', { id });
    if (!UUID_V4_LIKE.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product id. Expected UUID.',
      });
    }

    const includeInactive = isAdminRequest(req);
    const data = await getProductById(id, { includeInactive });
    if (!data) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Product not found',
      });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Product fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function fetchTrendingProducts(_req, res, next) {
  try {
    console.log('[productController] GET /api/products/trending');
    const data = await getTrendingProducts();
    return res.status(200).json({
      success: true,
      data,
      message: 'Trending products fetched successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function createProductHandler(req, res, next) {
  try {
    const isAdmin = isAdminRequest(req);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Use /api/jeweller/products to create jeweller-owned products',
      });
    }
    const data = await createProduct(req.body ?? {});
    return res.status(201).json({
      success: true,
      data,
      message: 'Product created successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateProductHandler(req, res, next) {
  try {
    if (!UUID_V4_LIKE.test(req.params.id)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid product id. Expected UUID.' });
    }
    const isAdmin = isAdminRequest(req);
    const data = await updateProductById(req.params.id, req.body ?? {}, { isAdmin });
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Product not found' });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Product updated successfully',
    });
  } catch (error) {
    if (error.message?.includes('Admin cannot edit') || error.message?.includes('Only the owning verified jeweller')) {
      return res.status(403).json({ success: false, data: null, message: error.message });
    }
    return next(error);
  }
}

export async function deleteProductHandler(req, res, next) {
  try {
    if (!UUID_V4_LIKE.test(req.params.id)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid product id. Expected UUID.' });
    }
    const data = await deleteProductById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Product not found' });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    return next(error);
  }
}
