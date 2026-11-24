import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertSameOriginMutation,
  createExpiredSessionRedirect,
  parseJsonBody,
  parseSlugParam,
  parseUuidParam,
} from "./bff.js";
import { applySecurityHeaders, buildSecurityHeaders } from "./headers.js";
import { createSessionProxyHandler } from "./proxy.js";

describe("next helpers", () => {
  it("安全响应头与 proxy 会话重定向、临期双端刷新行为正确", async () => {
    const refreshSession = vi.fn(async (s: { uid: string; exp: number }) => ({ uid: s.uid, exp: 9999 }));
    const handler = createSessionProxyHandler({
      cookieName: "hiweb_session",
      publicPages: new Set(["/login"]),
      redirectBaseOrigin: "https://app.example.com",
      cookieOptions: () => ({ httpOnly: true, sameSite: "lax", path: "/" }),
      openSession: async (val) => (val === "valid" ? { uid: "u1", exp: 1050 } : null),
      shouldRefresh: (s) => s.exp < 2000,
      refreshSession,
      sealSession: async () => "sealed-new",
    });

    // 未登录访问受保护页 -> 使用 redirectBaseOrigin 跳转登录
    const unauthedReq = new NextRequest("http://127.0.0.1:3000/dashboard?tab=a");
    const unauthedRes = await handler(unauthedReq);
    expect(unauthedRes.status).toBe(307);
    expect(unauthedRes.headers.get("location")).toBe("https://app.example.com/login?next=%2Fdashboard%3Ftab%3Da");
    expect(unauthedRes.headers.get("x-frame-options")).toBe("DENY");

    // 已登录且临期 -> 续期并下发 Cookie
    const authedReq = new NextRequest("http://127.0.0.1:3000/dashboard", {
      headers: { cookie: "hiweb_session=valid", "x-request-id": "req-12345678" },
    });
    const authedRes = await handler(authedReq);
    expect(refreshSession).toHaveBeenCalledWith({ uid: "u1", exp: 1050 }, "req-12345678");
    expect(authedRes.headers.get("set-cookie")).toContain("hiweb_session=sealed-new");
    expect(authedRes.headers.get("x-request-id")).toBe("req-12345678");
  });

  it("createExpiredSessionRedirect 强制使用 publicOrigin 与 no-store 并清 Cookie", () => {
    const req = new Request("http://0.0.0.0:3000/api/auth/expired?next=%2Fsettings");
    const res = createExpiredSessionRedirect(req, {
      publicOrigin: "https://app.example.com",
      cookieName: "hiweb_session",
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/login?next=%2Fsettings");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toContain("hiweb_session=");
  });

  it("BFF 解析与同源检查正常工作", async () => {
    const req = new Request("https://app.example.com/api/items", {
      method: "POST",
      headers: { origin: "https://evil.com", "content-type": "application/json" },
      body: JSON.stringify({ name: "hi" }),
    });
    expect(assertSameOriginMutation(req, "https://app.example.com")).toBe(false);
    expect(await parseJsonBody(req, (raw) => (raw as { name: string }) ?? null)).toEqual({ name: "hi" });
    expect(parseUuidParam("123e4567-e89b-12d3-a456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(parseSlugParam("bank_slug-1")).toBe("bank_slug-1");
    expect(() => parseUuidParam("bad-uuid")).toThrow();

    const r = applySecurityHeaders(new Response("ok"), { permissionsPolicy: "microphone=(self)" });
    expect(r.headers.get("permissions-policy")).toBe("microphone=(self)");
  });

  it("buildSecurityHeaders 默认包含 frame-ancestors 'none' 且支持覆盖", () => {
    const defaults = buildSecurityHeaders();
    expect(defaults["content-security-policy"]).toBe("frame-ancestors 'none'");

    const defaultResponse = applySecurityHeaders(new Response("ok"));
    expect(defaultResponse.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");

    const byOption = buildSecurityHeaders({
      contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'",
    });
    expect(byOption["content-security-policy"]).toBe("default-src 'self'; frame-ancestors 'none'");

    const byExtraHeader = buildSecurityHeaders({
      extraHeaders: {
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'self'",
      },
    });
    expect(byExtraHeader["Content-Security-Policy"]).toBe("default-src 'self'; frame-ancestors 'self'");
    expect("content-security-policy" in byExtraHeader).toBe(false);
  });
});
