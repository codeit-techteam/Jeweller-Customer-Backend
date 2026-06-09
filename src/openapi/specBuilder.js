import listEndpoints from "express-list-endpoints";
import { TAG_METADATA, resolveTag } from "./tags.js";
import { buildComponents, getRouteOverride } from "./schemas/registry.js";
import { scanSecuredMountPaths } from "./mountParser.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Express :id → OpenAPI {id}
 * @param {string} expressPath
 */
function toOpenApiPath(expressPath) {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * @param {string} openApiPath
 */
function extractPathParams(openApiPath) {
  const params = [];
  for (const match of openApiPath.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    params.push({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  }
  return params;
}

/** @param {string} fullPath e.g. /api/wishlist/:productId */
function isSecuredRoute(fullPath, securedMounts) {
  for (const mount of securedMounts) {
    if (fullPath === mount || fullPath.startsWith(`${mount}/`)) {
      return true;
    }
  }
  return false;
}

function defaultResponses(secured) {
  const responses = {
    200: {
      description: "Successful response",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiSuccessEnvelope" },
        },
      },
    },
    400: {
      description: "Validation or bad request",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorEnvelope" },
        },
      },
    },
    404: {
      description: "Resource not found",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorEnvelope" },
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorEnvelope" },
        },
      },
    },
  };

  if (secured) {
    responses[401] = {
      description: "Missing or invalid JWT",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorEnvelope" },
        },
      },
    };
  }

  return responses;
}

function isUploadRoute(path) {
  return path.startsWith("/api/uploads/");
}

/**
 * @param {import('express').Application} app
 * @returns {import('openapi-types').OpenAPIV3.Document}
 */
export function buildOpenApiSpec(app) {
  const securedMounts = scanSecuredMountPaths();
  const endpoints = listEndpoints(app);
  const paths = /** @type {import('openapi-types').OpenAPIV3.PathsObject} */ ({});
  const tagSet = new Map();

  for (const endpoint of endpoints) {
    const expressPath = endpoint.path;
    const openApiPath = toOpenApiPath(expressPath);
    const pathParams = extractPathParams(openApiPath);
    const tagInfo = resolveTag(expressPath);
    tagSet.set(tagInfo.name, tagInfo);

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    for (const method of endpoint.methods) {
      const upper = method.toUpperCase();
      const secured = isSecuredRoute(expressPath, securedMounts);
      const override = getRouteOverride(upper, expressPath);
      const upload = isUploadRoute(expressPath);

      const operation = {
        tags: [tagInfo.name],
        summary: `${upper} ${expressPath}`,
        description: tagInfo.description,
        parameters: [...pathParams],
        responses: defaultResponses(secured),
      };

      if (secured) {
        operation.security = [{ bearerAuth: [] }];
      }

      if (WRITE_METHODS.has(upper) && !upload && !override?.requestBody) {
        operation.requestBody = {
          required: upper !== "DELETE",
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
                description:
                  "Request body (no centralized validator in this project). Refine via openapi/schemas/registry.js.",
              },
            },
          },
        };
      }

      if (upload && upper === "POST") {
        operation.requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        };
      }

      if (override?.requestBody) {
        operation.requestBody = override.requestBody;
      }
      if (override?.responses) {
        operation.responses = { ...operation.responses, ...override.responses };
      }
      if (override?.parameters) {
        operation.parameters = [...(operation.parameters ?? []), ...override.parameters];
      }
      if (override?.summary) operation.summary = override.summary;
      if (override?.description) operation.description = override.description;

      if (upper === "POST" && operation.responses[200]) {
        operation.responses[201] = {
          ...operation.responses[200],
          description: "Created successfully",
        };
      }

      paths[openApiPath][upper.toLowerCase()] = operation;
    }
  }

  const tags = [...tagSet.values()]
    .map((t) => ({
      name: t.name,
      description: t.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Ensure declared tag metadata appears even if no routes mounted yet
  for (const meta of Object.values(TAG_METADATA)) {
    if (!tags.some((t) => t.name === meta.name)) {
      tags.push({ name: meta.name, description: meta.description });
    }
  }
  tags.sort((a, b) => a.name.localeCompare(b.name));

  const serverUrl =
    process.env.OPENAPI_SERVER_URL || "http://168.144.83.229:5106";

  return {
    openapi: "3.0.3",
    info: {
      title: "GehnaHub API",
      version: process.env.npm_package_version || "1.0.0",
      description: [
        "REST API for the GehnaHub customer app, jeweller app, and admin panel.",
        "",
        "Documentation is generated automatically from mounted Express routes.",
        "Add a route in `src/routes/` and register it in `src/index.js` — it will appear here on refresh.",
      ].join("\n"),
      contact: {
        name: "API Support",
      },
    },
    servers: [{ url: serverUrl, description: "Production API" }],
    tags,
    paths,
    components: buildComponents(),
  };
}
