import swaggerUi from "swagger-ui-express";
import { buildOpenApiSpec } from "./specBuilder.js";

const SWAGGER_UI_OPTIONS = {
  explorer: true,
  persistAuthorization: true,
  displayRequestDuration: true,
  docExpansion: "list",
  filter: true,
  showExtensions: true,
  tryItOutEnabled: true,
  syntaxHighlight: {
    activate: true,
    theme: "agate",
  },
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { font-size: 1.75rem; }
    .swagger-ui .info { margin: 24px 0; }
  `,
};

/**
 * Mount Swagger UI and live OpenAPI spec on the Express app.
 * Call after all API routes are registered, before notFoundHandler.
 *
 * @param {import('express').Application} app
 */
export function setupSwagger(app) {
  const serveMiddleware = swaggerUi.serve;

  app.get("/api-docs/openapi.json", (_req, res) => {
    const spec = buildOpenApiSpec(app);
    res.setHeader("Cache-Control", "no-store");
    res.json(spec);
  });

  app.use(
    "/api-docs",
    serveMiddleware,
    swaggerUi.setup(null, {
      ...SWAGGER_UI_OPTIONS,
      swaggerOptions: {
        url: "/api-docs/openapi.json",
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
        docExpansion: "list",
      },
    }),
  );

  console.log("[openapi] Swagger UI available at /api-docs");
}
