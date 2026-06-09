import { commonSchemas } from "./common.js";

/**
 * Optional per-route OpenAPI overrides.
 * Keys: "METHOD /full/path" (Express-style :params), e.g. "POST /api/products"
 *
 * Add entries here when you want richer request/response schemas without JSDoc on routes.
 */
export const ROUTE_SCHEMA_OVERRIDES = {
  "POST /api/analytics/events": {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              eventType: { type: "string", example: "product_view" },
              userId: { type: "string", format: "uuid" },
              boutiqueId: { type: "string", format: "uuid" },
              productId: { type: "string", format: "uuid" },
              categoryId: { type: "string", format: "uuid" },
              sectionSlug: { type: "string" },
              sectionType: { type: "string" },
              sectionTitle: { type: "string" },
              categoryName: { type: "string" },
              source: { type: "string" },
              city: { type: "string" },
              metadata: { type: "object", additionalProperties: true },
            },
          },
          example: {
            eventType: "product_view",
            productId: "550e8400-e29b-41d4-a716-446655440000",
            source: "home",
          },
        },
      },
    },
  },
};

/** @returns {import('openapi-types').OpenAPIV3.ComponentsObject} */
export function buildComponents() {
  return {
    schemas: { ...commonSchemas },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Supabase JWT access token. Use the Authorize button, or send `Authorization: Bearer <token>`.",
      },
    },
  };
}

/**
 * @param {string} method
 * @param {string} path
 */
export function getRouteOverride(method, path) {
  const key = `${method.toUpperCase()} ${path}`;
  return ROUTE_SCHEMA_OVERRIDES[key] ?? null;
}
