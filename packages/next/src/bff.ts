import "server-only";

import { AppErrorException } from "@pcfprio/hiweb-base/errors";
import { extractClientIp, isSameOrigin, type SameOriginOptions } from "@pcfprio/hiweb-core/security";
import { sanitizeNextPath } from "@pcfprio/hiweb-core/url";
import { NextResponse } from "next/server";

export class BffInputError extends AppErrorException {
  constructor(message = "Invalid request.") {
    super({ status: 400, code: "BFF_INVALID_INPUT", message });
    this.name = "BffInputError";
  }
}

export class PayloadTooLargeError extends AppErrorException {
  constructor(message = "Request payload is too large.") {
    super({ status: 413, code: "BFF_PAYLOAD_TOO_LARGE", message });
    this.name = "PayloadTooLargeError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createRequestContext(requestHeaders: { get(name: string): string | null }) {
  return {
    requestId: requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
    clientIp: extractClientIp(requestHeaders),
  };
}

export function assertSameOriginMutation(
  request: Request,
  expectedOrigin: string,
  options?: SameOriginOptions,
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  return isSameOrigin(request.headers, expectedOrigin, options);
}

export async function resolveRouteParams(
  paramsPromise?: Promise<Record<string, string | string[]>>,
): Promise<Readonly<Record<string, string>>> {
  const raw = (await paramsPromise) ?? {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value.join("/") : value]),
  );
}

export async function parseJsonBody<T>(
  request: Request,
  validate: (raw: unknown) => T | null,
  options: { readonly maxBytes?: number; readonly invalidMessage?: string } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? 32 * 1024;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new BffInputError(options.invalidMessage);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new BffInputError(options.invalidMessage);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BffInputError(options.invalidMessage);
  }
  const parsed = validate(raw);
  if (parsed === null) {
    throw new BffInputError(options.invalidMessage);
  }
  return parsed;
}

export function parseUuidParam(value: string | undefined, message = "Invalid UUID parameter."): string {
  if (!value || !UUID_RE.test(value)) {
    throw new BffInputError(message);
  }
  return value.toLowerCase();
}

export function parseSlugParam(
  value: string | undefined,
  pattern: RegExp = SLUG_RE,
  message = "Invalid identifier parameter.",
): string {
  if (!value || !pattern.test(value)) {
    throw new BffInputError(message);
  }
  return value;
}

export interface ParseMultipartUploadOptions {
  readonly maxBytes: number;
  readonly fileField?: string;
  readonly allowedFields?: readonly string[];
  readonly maxFieldLength?: number;
  readonly invalidMessage?: string;
  readonly tooLargeMessage?: string;
}

/** 解析 multipart 表单并按字段白名单重建干净 FormData 再转发上游。 */
export async function parseMultipartUpload(request: Request, options: ParseMultipartUploadOptions): Promise<FormData> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    throw new PayloadTooLargeError(options.tooLargeMessage);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BffInputError(options.invalidMessage);
  }
  const fileField = options.fileField ?? "file";
  const file = form.get(fileField);
  if (!(file instanceof File) || file.size === 0) {
    throw new BffInputError(options.invalidMessage);
  }
  if (file.size > options.maxBytes) {
    throw new PayloadTooLargeError(options.tooLargeMessage);
  }
  const out = new FormData();
  out.set(fileField, file, file.name);
  const maxLen = options.maxFieldLength ?? 200;
  for (const field of options.allowedFields ?? []) {
    const value = form.get(field);
    if (typeof value !== "string" || value.length > maxLen) {
      throw new BffInputError(options.invalidMessage);
    }
    out.set(field, value);
  }
  return out;
}

const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

export function jsonNoStore(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders?: Readonly<Record<string, string>>,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      "x-request-id": requestId,
      ...(extraHeaders ?? {}),
    },
  });
}

export interface ExpiredSessionRedirectOptions {
  readonly publicOrigin: string;
  readonly cookieName: string;
  readonly loginPath?: string;
  readonly forbiddenNextPrefixes?: readonly string[];
}

/**
 * 清除失效会话 Cookie 并安全跳转到登录页（强制使用配置的 publicOrigin，不信任 request.url 主机部分）。
 */
export function createExpiredSessionRedirect(request: Request, options: ExpiredSessionRedirectOptions): NextResponse {
  const loginPath = options.loginPath ?? "/login";
  const url = new URL(request.url);
  const next = sanitizeNextPath(url.searchParams.get("next"), {
    fallback: "/",
    forbiddenPrefixes: options.forbiddenNextPrefixes ?? [loginPath],
  });
  const target = new URL(`${loginPath}?next=${encodeURIComponent(next)}`, options.publicOrigin);
  const response = NextResponse.redirect(target);
  response.cookies.delete(options.cookieName);
  response.headers.set("cache-control", "no-store");
  return response;
}
