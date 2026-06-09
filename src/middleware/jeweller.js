import { supabase } from '../config/supabase.js';
import { requireAuthUser } from './auth.js';

async function loadJewellerBoutique(userId) {
  const { data, error } = await supabase
    .from('boutiques')
    .select('id, name, is_verified, verified, jeweller_user_id')
    .eq('jeweller_user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load jeweller boutique: ${error.message}`);
  }
  return data;
}

async function attachVerifiedJeweller(req, res, next) {
  try {
    const boutique = await loadJewellerBoutique(req.userId);
    if (!boutique) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Jeweller boutique not found for this account',
      });
    }

    const verified = Boolean(boutique.is_verified ?? boutique.verified);
    if (!verified) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Only verified jewellers can manage products',
      });
    }

    req.jewellerBoutique = boutique;
    req.jewellerId = req.userId;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireVerifiedJeweller(req, res, next) {
  requireAuthUser(req, res, (authErr) => {
    if (authErr) return next(authErr);
    return attachVerifiedJeweller(req, res, next);
  });
}

export async function requireProductOwner(req, res, next) {
  try {
    const productId = req.params.id ?? req.params.productId;
    if (!productId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Product id is required',
      });
    }

    const { data: product, error } = await supabase
      .from('products')
      .select('id, owner_jeweller_id, boutique_id, status')
      .eq('id', productId)
      .maybeSingle();

    if (error) {
      return next(new Error(`Failed to load product: ${error.message}`));
    }
    if (!product) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Product not found',
      });
    }

    if (product.owner_jeweller_id !== req.jewellerId) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'You do not own this product',
      });
    }

    req.governanceProduct = product;
    return next();
  } catch (error) {
    return next(error);
  }
}
