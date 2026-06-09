import {
  createProduct,
  getProductById,
  getProductWithGovernance,
  getProductsForJeweller,
  updateProductByJeweller,
} from '../services/productService.js';
import { getJewellerGovernanceSummary } from '../services/productGovernanceService.js';

export async function listJewellerProductsHandler(req, res, next) {
  try {
    const data = await getProductsForJeweller(req.jewellerId);
    const enriched = await Promise.all(
      data.map(async (product) => {
        const full = await getProductWithGovernance(product.id, { includeInactive: true });
        return full ?? product;
      }),
    );
    return res.status(200).json({
      success: true,
      data: enriched,
      message: 'Jeweller products fetched',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getJewellerProductHandler(req, res, next) {
  try {
    const data = await getProductWithGovernance(req.params.id, { includeInactive: true });
    if (!data || data.owner_jeweller_id !== req.jewellerId) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Product not found',
      });
    }
    return res.status(200).json({
      success: true,
      data,
      message: 'Product fetched',
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateJewellerProductHandler(req, res, next) {
  try {
    const data = await updateProductByJeweller(req.params.id, req.body ?? {}, {
      jewellerId: req.jewellerId,
    });
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
      message: 'Product updated',
    });
  } catch (error) {
    return next(error);
  }
}

export async function createJewellerProductHandler(req, res, next) {
  try {
    const data = await createProduct(req.body ?? {}, {
      jewellerId: req.jewellerId,
      boutiqueId: req.jewellerBoutique.id,
    });
    return res.status(201).json({
      success: true,
      data,
      message: 'Product created',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getJewellerGovernanceSummaryHandler(req, res, next) {
  try {
    const data = await getJewellerGovernanceSummary(req.jewellerId);
    return res.status(200).json({
      success: true,
      data,
      message: 'Governance summary loaded',
    });
  } catch (error) {
    return next(error);
  }
}
