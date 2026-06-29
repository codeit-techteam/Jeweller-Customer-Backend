import { Router } from "express";
import {
  exportAnalyticsCsv,
  exportAnalyticsPdf,
  fetchBoutiqueAnalytics,
  fetchBoutiqueOverviewStats,
  fetchBoutiqueOptions,
  fetchCustomerAnalytics,
  fetchPlatformAnalytics,
  linkVisitor,
  recordEvent,
} from "../controllers/analyticsController.js";

const router = Router();

router.post("/events", recordEvent);
router.post("/link-visitor", linkVisitor);
router.get("/platform", fetchPlatformAnalytics);
router.get("/boutique", fetchBoutiqueAnalytics);
router.get("/boutique-overview", fetchBoutiqueOverviewStats);
router.get("/boutiques", fetchBoutiqueOptions);
router.get("/customer", fetchCustomerAnalytics);
router.get("/export/csv", exportAnalyticsCsv);
router.get("/export/pdf", exportAnalyticsPdf);

export default router;
