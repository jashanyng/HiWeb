import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkOperationExists, extractSuccessDataSchema, parseOpenApiDocument, verifySchemaContract } from "./index.js";

const SAMPLE_SPEC = `
openapi: 3.1.0
paths:
  /v1/items:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                  data:
                    $ref: "#/components/schemas/ItemList"
components:
  schemas:
    ItemList:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/Item"
    Item:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
          enum: [active, archived]
`;

describe("openapi-contract", () => {
  const doc = parseOpenApiDocument(SAMPLE_SPEC);

  it("通过一致的 Zod 与 OpenAPI 契约并检出字段与枚举漂移", () => {
    expect(checkOperationExists(doc, "/v1/items", "get")).toEqual([]);
    expect(checkOperationExists(doc, "/v1/missing", "post")).toHaveLength(1);

    const dataSchema = extractSuccessDataSchema(doc, "/v1/items", "get");
    const ValidSchema = z.object({
      items: z.array(z.object({ id: z.string(), status: z.enum(["active", "archived"]) })),
    });
    expect(verifySchemaContract(doc, ValidSchema, dataSchema, "ItemList")).toEqual([]);

    const DriftedSchema = z.object({
      items: z.array(z.object({ id: z.string(), status: z.enum(["active"]), extraField: z.string() })),
    });
    const errors = verifySchemaContract(doc, DriftedSchema, dataSchema, "ItemList");
    expect(errors.some((e) => e.includes("archived"))).toBe(true);
    expect(errors.some((e) => e.includes("extraField"))).toBe(true);
  });
});
