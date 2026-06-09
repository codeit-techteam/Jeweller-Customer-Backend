import { searchCustomerProducts } from "../services/customerProductSearchService.js";

export async function searchCustomerProductsHandler(req, res, next) {
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = Number(req.query.limit);

    if (!q) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Query parameter q is required",
      });
    }

    const products = await searchCustomerProducts({
      q,
      limit: Number.isFinite(limit) ? limit : 12,
    });

    return res.status(200).json({
      success: true,
      data: { products, query: q },
      message: "Products searched successfully",
    });
  } catch (error) {
    return next(error);
  }
}
