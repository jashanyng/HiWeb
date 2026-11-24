import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface OpenApiSchemaNode {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly properties?: Record<string, OpenApiSchemaNode>;
  readonly required?: readonly string[];
  readonly items?: OpenApiSchemaNode;
  readonly allOf?: readonly OpenApiSchemaNode[];
  readonly oneOf?: readonly OpenApiSchemaNode[];
  readonly anyOf?: readonly OpenApiSchemaNode[];
}

export interface OpenApiDocument {
  readonly paths?: Record<string, Record<string, unknown>>;
  readonly components?: {
    readonly schemas?: Record<string, OpenApiSchemaNode>;
  };
}

interface ZodDefShape {
  readonly type: string;
  readonly innerType?: z.ZodType;
  readonly element?: z.ZodType;
  readonly options?: readonly z.ZodType[];
  readonly entries?: Record<string, string | number>;
  readonly values?: readonly unknown[];
  readonly value?: unknown;
  readonly shape?: Record<string, z.ZodType> | (() => Record<string, z.ZodType>);
}

export function parseOpenApiDocument(yamlText: string): OpenApiDocument {
  const parsed = parseYaml(yamlText) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid OpenAPI document: root is not an object");
  }
  return parsed as OpenApiDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveJsonPointer(doc: OpenApiDocument, ref: string): OpenApiSchemaNode {
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported OpenAPI $ref: ${ref}`);
  }
  const name = ref.slice(prefix.length);
  const schema = doc.components?.schemas?.[name];
  if (!schema) {
    throw new Error(`Missing OpenAPI component schema: ${ref}`);
  }
  return schema;
}

function omitKey<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

function mergeOpenApiObjects(base: OpenApiSchemaNode, overlay: OpenApiSchemaNode): OpenApiSchemaNode {
  const properties = base.properties || overlay.properties ? { ...base.properties, ...overlay.properties } : undefined;
  const required =
    base.required || overlay.required
      ? [...new Set([...(base.required ?? []), ...(overlay.required ?? [])])]
      : undefined;
  return {
    ...base,
    ...overlay,
    ...(properties ? { properties } : {}),
    ...(required ? { required } : {}),
  };
}

export function dereferenceOpenApiSchema(
  doc: OpenApiDocument,
  node: OpenApiSchemaNode,
  seenRefs: ReadonlySet<string> = new Set(),
): OpenApiSchemaNode {
  let current = node;
  if (current.$ref) {
    if (seenRefs.has(current.$ref)) {
      return {};
    }
    const nextSeen = new Set(seenRefs);
    nextSeen.add(current.$ref);
    const resolved = dereferenceOpenApiSchema(doc, resolveJsonPointer(doc, current.$ref), nextSeen);
    current = mergeOpenApiObjects(resolved, omitKey(current, "$ref"));
  }
  if (current.allOf && current.allOf.length > 0) {
    let merged: OpenApiSchemaNode = {};
    for (const part of current.allOf) {
      merged = mergeOpenApiObjects(merged, dereferenceOpenApiSchema(doc, part, seenRefs));
    }
    current = mergeOpenApiObjects(merged, omitKey(current, "allOf"));
  }
  return current;
}

export function checkOperationExists(doc: OpenApiDocument, endpoint: string, method: HttpMethod): string[] {
  const pathEntry = doc.paths?.[endpoint];
  if (!pathEntry) {
    return [`Missing OpenAPI path: ${method.toUpperCase()} ${endpoint}`];
  }
  const operation = pathEntry[method];
  if (!isRecord(operation)) {
    return [`Missing OpenAPI method: ${method.toUpperCase()} ${endpoint}`];
  }
  return [];
}

export interface ExtractResponseSchemaOptions {
  readonly statusCode?: string;
  readonly contentType?: string;
  /** 若使用统一包络且业务模型位于顶层某字段（如 "data"），指定该字段名；不传则返回完整响应 Schema。 */
  readonly unwrapProperty?: string;
}

export function extractSuccessSchema(
  doc: OpenApiDocument,
  endpoint: string,
  method: HttpMethod,
  options: ExtractResponseSchemaOptions = {},
): OpenApiSchemaNode {
  const statusCode = options.statusCode ?? "200";
  const contentType = options.contentType ?? "application/json";
  const pathEntry = doc.paths?.[endpoint];
  const operation = pathEntry?.[method];
  if (!isRecord(operation) || !isRecord(operation.responses)) {
    throw new Error(`Missing responses for ${method.toUpperCase()} ${endpoint}`);
  }
  const okResponse = operation.responses[statusCode];
  if (!isRecord(okResponse) || !isRecord(okResponse.content)) {
    throw new Error(`Missing ${statusCode} JSON content for ${method.toUpperCase()} ${endpoint}`);
  }
  const jsonContent = okResponse.content[contentType];
  if (!isRecord(jsonContent) || !isRecord(jsonContent.schema)) {
    throw new Error(`Missing ${statusCode} ${contentType} schema for ${method.toUpperCase()} ${endpoint}`);
  }
  const resolved = dereferenceOpenApiSchema(doc, jsonContent.schema as OpenApiSchemaNode);
  if (!options.unwrapProperty) {
    return resolved;
  }
  const unwrapped = resolved.properties?.[options.unwrapProperty];
  if (!unwrapped) {
    throw new Error(
      `Missing ${statusCode} property "${options.unwrapProperty}" for ${method.toUpperCase()} ${endpoint}`,
    );
  }
  return unwrapped;
}

/** 从标准 `{ data }` 信封中提取 200 响应数据 Schema 的便捷入口。 */
export function extractSuccessDataSchema(
  doc: OpenApiDocument,
  endpoint: string,
  method: HttpMethod,
): OpenApiSchemaNode {
  return extractSuccessSchema(doc, endpoint, method, { unwrapProperty: "data" });
}

function readZodDef(schema: z.ZodType): ZodDefShape {
  const candidate = schema as unknown as {
    readonly def?: ZodDefShape;
    readonly _zod?: { readonly def?: ZodDefShape };
  };
  const def = candidate.def ?? candidate._zod?.def;
  if (!def) {
    throw new Error("Unable to inspect Zod schema definition");
  }
  return def;
}

function unwrapZod(schema: z.ZodType): {
  readonly inner: z.ZodType;
  readonly nullable: boolean;
  readonly optional: boolean;
} {
  let current = schema;
  let nullable = false;
  let optional = false;
  for (;;) {
    const def = readZodDef(current);
    if (def.type === "optional" && def.innerType) {
      optional = true;
      current = def.innerType;
      continue;
    }
    if (def.type === "default" && def.innerType) {
      optional = true;
      current = def.innerType;
      continue;
    }
    if (def.type === "nullable" && def.innerType) {
      nullable = true;
      current = def.innerType;
      continue;
    }
    if (def.type === "readonly" && def.innerType) {
      current = def.innerType;
      continue;
    }
    return { inner: current, nullable, optional };
  }
}

function pickNonNullBranch(doc: OpenApiDocument, node: OpenApiSchemaNode, label: string): OpenApiSchemaNode {
  const resolved = dereferenceOpenApiSchema(doc, node);
  const branches = resolved.oneOf ?? resolved.anyOf;
  if (!branches) {
    return resolved;
  }
  const nonNull = branches
    .map((branch) => dereferenceOpenApiSchema(doc, branch))
    .filter((branch) => branch.type !== "null");
  if (nonNull.length === 1 && nonNull[0]) {
    return nonNull[0];
  }
  if (nonNull.length === 0) {
    throw new Error(`${label}: OpenAPI branch contains only null`);
  }
  return resolved;
}

function readObjectShape(schema: z.ZodType): Record<string, z.ZodType> {
  const direct = (schema as unknown as { readonly shape?: Record<string, z.ZodType> }).shape;
  if (direct) return direct;
  const def = readZodDef(schema);
  if (typeof def.shape === "function") return def.shape();
  if (def.shape) return def.shape;
  return {};
}

function diffEnums(zodValues: readonly string[], openApiValues: readonly string[], label: string): string[] {
  const zodSet = new Set(zodValues);
  const openApiSet = new Set(openApiValues);
  const extraInWeb = zodValues.filter((v) => !openApiSet.has(v));
  const missingInWeb = openApiValues.filter((v) => !zodSet.has(v));
  const errors: string[] = [];
  if (extraInWeb.length > 0) {
    errors.push(`${label}: client enum has values missing from OpenAPI: ${extraInWeb.join(", ")}`);
  }
  if (missingInWeb.length > 0) {
    errors.push(`${label}: OpenAPI enum has values unhandled by client: ${missingInWeb.join(", ")}`);
  }
  return errors;
}

function verifyUnionContract(
  doc: OpenApiDocument,
  options: readonly z.ZodType[],
  resolved: OpenApiSchemaNode,
  label: string,
): string[] {
  const candidates = resolved.oneOf ?? resolved.anyOf;
  if (!candidates) {
    const errors: string[] = [];
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      if (!option) continue;
      errors.push(...verifySchemaContract(doc, option, resolved, `${label}.union[${i}]`));
    }
    return errors;
  }
  const errors: string[] = [];
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (!option) continue;
    const matched = candidates.some((candidate) => verifySchemaContract(doc, option, candidate, label).length === 0);
    if (!matched) {
      errors.push(`${label}.union[${i}]: no matching branch in OpenAPI oneOf/anyOf`);
    }
  }
  return errors;
}

function verifyObjectContract(
  doc: OpenApiDocument,
  shape: Record<string, z.ZodType>,
  resolved: OpenApiSchemaNode,
  label: string,
): string[] {
  const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
  if (!types.includes("object") && !resolved.properties) {
    return [`${label}: expected OpenAPI object schema, got ${JSON.stringify(resolved.type)}`];
  }
  if (!resolved.properties) {
    return [];
  }
  const errors: string[] = [];
  const openApiProps = resolved.properties;
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const openApiField = openApiProps[key];
    if (!openApiField) {
      errors.push(`${label}.${key}: field is not declared in OpenAPI properties`);
      continue;
    }
    errors.push(...verifySchemaContract(doc, fieldSchema, openApiField, `${label}.${key}`));
  }
  return errors;
}

export function verifySchemaContract(
  doc: OpenApiDocument,
  zodSchema: z.ZodType,
  openApiNode: OpenApiSchemaNode,
  label: string,
): string[] {
  const unwrapped = unwrapZod(zodSchema);
  const def = readZodDef(unwrapped.inner);
  if (def.type === "unknown" || def.type === "any") {
    return [];
  }

  const resolved = pickNonNullBranch(doc, openApiNode, label);
  if (def.type === "union" && def.options) {
    return verifyUnionContract(doc, def.options, resolved, label);
  }

  if (def.type === "object") {
    return verifyObjectContract(doc, readObjectShape(unwrapped.inner), resolved, label);
  }

  if (def.type === "array" && def.element) {
    const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
    if (!types.includes("array") || !resolved.items) {
      return [`${label}: expected OpenAPI array schema, got ${JSON.stringify(resolved.type)}`];
    }
    return verifySchemaContract(doc, def.element, resolved.items, `${label}[]`);
  }

  if (def.type === "enum") {
    const zodValues = Object.values(def.entries ?? {}).map(String);
    if (!resolved.enum) {
      return [];
    }
    const openApiValues = resolved.enum.filter((v): v is string | number => v !== null).map(String);
    return diffEnums(zodValues, openApiValues, label);
  }

  if (def.type === "literal") {
    const values = (def.values ?? (def.value !== undefined ? [def.value] : [])).map(String);
    if (resolved.const !== undefined) {
      return values.includes(String(resolved.const))
        ? []
        : [`${label}: literal ${values.join("|")} does not match OpenAPI const ${String(resolved.const)}`];
    }
    if (resolved.enum) {
      const openApiValues = resolved.enum.filter((v): v is string | number | boolean => v !== null).map(String);
      const unknown = values.filter((v) => !openApiValues.includes(v));
      if (unknown.length > 0) {
        return [`${label}: literal ${unknown.join(",")} not in OpenAPI enum [${openApiValues.join(",")}]`];
      }
    }
    return [];
  }

  return [];
}

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes(".test.")) {
      files.push(full);
    }
  }
  return files;
}

export interface CollectApiEndpointsOptions {
  readonly scanPaths: readonly string[];
  readonly functionNames?: readonly string[];
  readonly pathPrefix?: string;
}

/** 扫描源码中的指定 API 调用函数，提取并规整对应的 OpenAPI 路径清单。 */
export function collectApiEndpoints(options: CollectApiEndpointsOptions): string[] {
  const fnNames = options.functionNames ?? ["callApi", "fetchApiBinary", "streamApi"];
  const escaped = fnNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const callRe = new RegExp(`(?:${escaped.join("|")})(?:<[^>]+>)?\\(\\s*(["'\`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`, "g");
  const prefix = options.pathPrefix ?? "";
  const endpoints = new Set<string>();

  for (const target of options.scanPaths) {
    const files = existsSync(target) && statSync(target).isFile() ? [target] : listTsFiles(target);
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(callRe)) {
        const rawPath = match[2];
        if (!rawPath) continue;
        const withoutQuery = rawPath.split("?")[0] ?? rawPath;
        const normalizedParams = withoutQuery
          .replace(/\$\{encodeURIComponent\(([^}]+)\)\}/g, "{$1}")
          .replace(/\$\{([^}]+)\}/g, "{$1}")
          .replace(/^\/+/, "");
        endpoints.add(`${prefix}/${normalizedParams}`.replace(/\/+/g, "/"));
      }
    }
  }

  return [...endpoints].sort();
}
