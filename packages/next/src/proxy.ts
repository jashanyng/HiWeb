import { sanitizeNextPath } from "@jashanyng/hiweb-core/url";
import { type NextRequest, NextResponse } from "next/server";

import { applySecurityHeaders, type SecurityHeadersOptions } from "./headers.js";

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

export interface ProxyCookieOptions {
  readonly httpOnly?: boolean;
  readonly sameSite?: "lax" | "strict" | "none";
  readonly secure?: boolean;
  readonly path?: string;
  readonly maxAge?: number;
}

export interface SessionProxyOptions<TSession> {
  readonly cookieName: string | (() => string);
  readonly publicPages: ReadonlySet<string>;
  readonly loginPath?: string;
  readonly authenticatedRedirectPath?: string;
  readonly apiPrefix?: string;
  readonly pathHeaderName?: string;
  readonly redirectBaseOrigin?: string | ((request: NextRequest) => string);
  readonly forbiddenNextPrefixes?: readonly string[];
  readonly securityHeaders?: SecurityHeadersOptions;
  readonly openSession: (cookieValue: string | undefined) => Promise<TSession | null>;
  readonly shouldRefresh: (session: TSession) => boolean;
  readonly refreshSession: (session: TSession, requestId: string) => Promise<TSession>;
  readonly sealSession: (session: TSession) => Promise<string>;
  readonly cookieOptions: () => ProxyCookieOptions;
  readonly isSessionInvalidError?: (error: unknown) => boolean;
}

export function resolveOrGenerateRequestId(headers: { get(name: string): string | null }): string {
  const incoming = headers.get("x-request-id");
  return incoming && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
}

function resolveOrigin<T extends string | ((req: NextRequest) => string)>(
  value: T | undefined,
  request: NextRequest,
): string {
  if (!value) return request.nextUrl.origin;
  return typeof value === "function" ? value(request) : value;
}

/**
 * 创建 Next.js 16 proxy.ts 会话前置处理器：
 * 统一注入 requestId 与安全响应头、处理令牌临期双端同步续期、执行页面级登录态重定向。
 */
export function createSessionProxyHandler<TSession>(options: SessionProxyOptions<TSession>) {
  const loginPath = options.loginPath ?? "/login";
  const authRedirect = options.authenticatedRedirectPath ?? "/";
  const apiPrefix = options.apiPrefix ?? "/api/";
  const forbiddenPrefixes = options.forbiddenNextPrefixes ?? [...options.publicPages];

  return async function handleProxy(request: NextRequest): Promise<NextResponse> {
    const requestId = resolveOrGenerateRequestId(request.headers);
    const { pathname, search } = request.nextUrl;
    const isApi = pathname.startsWith(apiPrefix);
    const cookieName = typeof options.cookieName === "function" ? options.cookieName() : options.cookieName;
    const baseOrigin = resolveOrigin(options.redirectBaseOrigin, request);

    let session = await options.openSession(request.cookies.get(cookieName)?.value);
    let setCookie: string | null | undefined;

    if (session && options.shouldRefresh(session)) {
      try {
        session = await options.refreshSession(session, requestId);
        setCookie = await options.sealSession(session);
      } catch (error) {
        if (options.isSessionInvalidError?.(error)) {
          session = null;
          setCookie = null;
        }
      }
    }

    if (!isApi && !session && !options.publicPages.has(pathname)) {
      const safeNext = sanitizeNextPath(`${pathname}${search}`, {
        fallback: authRedirect,
        forbiddenPrefixes,
      });
      const loginUrl = new URL(loginPath, baseOrigin);
      if (safeNext !== authRedirect || search) {
        loginUrl.searchParams.set("next", safeNext);
      }
      const response = NextResponse.redirect(loginUrl);
      if (setCookie === null) response.cookies.delete(cookieName);
      return applySecurityHeaders(response, { ...options.securityHeaders, requestId });
    }

    if (!isApi && session && options.publicPages.has(pathname)) {
      return applySecurityHeaders(NextResponse.redirect(new URL(authRedirect, baseOrigin)), {
        ...options.securityHeaders,
        requestId,
      });
    }

    if (setCookie) request.cookies.set(cookieName, setCookie);
    else if (setCookie === null) request.cookies.delete(cookieName);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    if (options.pathHeaderName) {
      requestHeaders.set(options.pathHeaderName, `${pathname}${search}`);
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (setCookie) response.cookies.set(cookieName, setCookie, options.cookieOptions());
    else if (setCookie === null) response.cookies.delete(cookieName);
    return applySecurityHeaders(response, { ...options.securityHeaders, requestId });
  };
}
