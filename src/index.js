import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import boutiqueRoutes from "./routes/boutiques.js";
import customerBoutiqueRoutes from "./routes/customerBoutiques.js";
import customerProductRoutes from "./routes/customerProducts.js";
import recentlyViewedRoutes from "./routes/recentlyViewed.js";
import savedBoutiquesRoutes from "./routes/saved-boutiques.js";
import collectionRoutes from "./routes/collections.js";
import occasionRoutes from "./routes/occasions.js";
import menuCategoryRoutes from "./routes/menuCategories.js";
import featuredSectionRoutes from "./routes/featuredSections.js";
import offerRoutes from "./routes/offers.js";
import giftCollectionRoutes from "./routes/giftCollections.js";
import relationshipSectionRoutes from "./routes/relationshipSections.js";
import featuredProductRoutes from "./routes/featuredProducts.js";
import searchHistoryRoutes from "./routes/searchHistory.js";
import wishlistRoutes from "./routes/wishlist.js";
import uploadRoutes from "./routes/uploads.js";
import dashboardRoutes from "./routes/dashboard.js";
import analyticsRoutes from "./routes/analytics.js";
import userRoutes from "./routes/users.js";
import appointmentRoutes from "./routes/appointments.js";
import callbackRequestRoutes from "./routes/callbackRequests.js";
import notificationRoutes from "./routes/notifications.js";
import supportRoutes from "./routes/support.js";
import adminProductGovernanceRoutes from "./routes/adminProductGovernance.js";
import jewellerProductRoutes from "./routes/jewellerProducts.js";
import { notFoundHandler, errorHandler } from "./middleware/error.js";
import { setupSwagger } from "./openapi/setup.js";
import { ensureStorageBuckets } from "./config/storage.js";
import { supabase } from "./config/supabase.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const allowedOrigins = [
  "http://localhost:3001",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://192.168.0.103:3001",
  "http://192.168.0.103:3000",
  "http://192.168.29.30:3001",
  "http://192.168.29.30:3000",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  console.log("[request]", { method: req.method, path: req.originalUrl, origin: req.headers.origin });
  next();
});
app.use((req, res, next) => {
  const isUploadRoute = req.originalUrl.startsWith("/api/uploads/");
  const isHeavyDashboard =
    req.originalUrl.startsWith("/api/dashboard/wishlist-analytics") ||
    req.originalUrl.startsWith("/api/dashboard/recently-viewed-analytics") ||
    req.originalUrl.startsWith("/api/analytics/");
  const timeoutMs = isUploadRoute ? 5 * 60 * 1000 : isHeavyDashboard ? 120 * 1000 : 15000;
  res.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        data: null,
        message: isUploadRoute ? "Upload timed out. Please retry." : "Request timed out",
      });
    }
  });
  next();
});

console.log("[server] Booting backend", { port: PORT });
void ensureStorageBuckets();

app.get("/", (_req, res) => {
  res.status(200).send("API running");
});

app.get("/api/health", async (_req, res) => {
  const startedAt = Date.now();
  const { error } = await supabase.from("categories").select("id").limit(1);
  if (error) {
    return res.status(503).json({
      success: false,
      message: "Backend unhealthy",
      dependencies: { database: "down" },
    });
  }

  return res.status(200).json({
    success: true,
    message: "Backend running",
    dependencies: { database: "up" },
    latency_ms: Date.now() - startedAt,
  });
});

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminProductGovernanceRoutes);
app.use("/api/jeweller", jewellerProductRoutes);
app.use("/api/boutiques", boutiqueRoutes);
app.use("/api/customer/boutiques", customerBoutiqueRoutes);
app.use("/api/customer/products", customerProductRoutes);
app.use("/api/recently-viewed", recentlyViewedRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/callback-requests", callbackRequestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/saved-boutiques", savedBoutiquesRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/occasions", occasionRoutes);
app.use("/api/menu-categories", menuCategoryRoutes);
app.use("/api/featured-sections", featuredSectionRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/gift-collections", giftCollectionRoutes);
app.use("/api/relationship-sections", relationshipSectionRoutes);
app.use("/api/featured-products", featuredProductRoutes);
app.use("/api/search-history", searchHistoryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/uploads", uploadRoutes);

setupSwagger(app);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Update backend/.env PORT.`);
    process.exit(1);
  }

  console.error("Server failed to start:", error);
  process.exit(1);
});
