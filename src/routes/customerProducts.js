import { Router } from "express";
import { searchCustomerProductsHandler } from "../controllers/customerProductController.js";

const router = Router();

router.get("/search", searchCustomerProductsHandler);

export default router;
