/** @type {import('openapi-types').OpenAPIV3.ComponentsObject} */
export const commonSchemas = {
  ApiSuccessEnvelope: {
    type: "object",
    required: ["success", "message"],
    properties: {
      success: { type: "boolean", example: true },
      data: {
        description: "Response payload (shape varies by endpoint).",
        nullable: true,
      },
      message: { type: "string", example: "Operation completed successfully" },
    },
  },
  ApiErrorEnvelope: {
    type: "object",
    required: ["success", "message"],
    properties: {
      success: { type: "boolean", example: false },
      data: { type: "object", nullable: true, example: null },
      message: { type: "string", example: "Something went wrong" },
    },
  },
  UuidPathParam: {
    type: "string",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440000",
  },
  PaginationQuery: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, example: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, example: 20 },
    },
  },
};
