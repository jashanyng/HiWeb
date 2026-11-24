import type { NextResponse } from "next/server";

export interface SecurityHeadersOptions {
  readonly permissionsPolicy?: string;
  readonly frameOptions?: string;
  readonly referrerPolicy?: string;
  readonly contentSecurityPolicy?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

export function buildSecurityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": options.referrerPolicy ?? "strict-origin-when-cross-origin",
    "x-frame-options": options.frameOptions ?? "DENY",
    "permissions-policy": options.permissionsPolicy ?? "camera=(), geolocation=(), payment=(), usb=(), microphone=()",
    "content-security-policy": options.contentSecurityPolicy ?? "frame-ancestors 'none'",
  };

  if (options.extraHeaders) {
    for (const [key, value] of Object.entries(options.extraHeaders)) {
      const lowerKey = key.toLowerCase();
      for (const existingKey of Object.keys(headers)) {
        if (existingKey !== key && existingKey.toLowerCase() === lowerKey) {
          delete headers[existingKey];
        }
      }
      headers[key] = value;
    }
  }

  return headers;
}

export function applySecurityHeaders<T extends Response | NextResponse>(
  response: T,
  options: SecurityHeadersOptions & { readonly requestId?: string } = {},
): T {
  const headers = buildSecurityHeaders(options);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  if (options.requestId) {
    response.headers.set("x-request-id", options.requestId);
  }
  return response;
}
