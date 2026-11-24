import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createDeploymentGuard } from "./deployment.js";
import { createSlidingWindowRateLimiter, extractClientIp, isSameOrigin, timingSafeEqualString } from "./security.js";
import { createSessionCipher } from "./session-crypto.js";
import { buildUrlWithQuery, isSafeHttpUrl, readIntParam, readStringParam, sanitizeNextPath } from "./url.js";

describe("session-crypto", () => {
  const Schema = z.object({ userId: z.string().min(1), expiresAt: z.number().int() });
  const secret = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

  it("AES-256-GCM 密封解封闭环且拦截篡改、换密钥与超长值", async () => {
    const cipher = createSessionCipher({
      secret,
      keyPrefix: "hiweb-test",
      validate: (raw) => {
        const res = Schema.safeParse(raw);
        return res.success ? res.data : null;
      },
    });
    const otherCipher = createSessionCipher({
      secret: `${secret}-other`,
      keyPrefix: "hiweb-test",
      validate: (raw) => {
        const res = Schema.safeParse(raw);
        return res.success ? res.data : null;
      },
    });

    const token = await cipher.seal({ userId: "u-1", expiresAt: 2000 });
    expect(token.startsWith("v1.")).toBe(true);
    expect(await cipher.open(token)).toEqual({ userId: "u-1", expiresAt: 2000 });
    expect(await otherCipher.open(token)).toBeNull();

    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -2)}AA`;
    expect(await cipher.open(tampered)).toBeNull();
    expect(await cipher.open("v2.a.b")).toBeNull();
    expect(await cipher.open("x".repeat(4500))).toBeNull();
    expect(cipher.needsRefresh(1050, 120, 1000)).toBe(true);
    expect(cipher.needsRefresh(1500, 120, 1000)).toBe(false);
  });

  it("拒绝弱密钥", () => {
    expect(() => createSessionCipher({ secret: "too-short", keyPrefix: "p", validate: (r) => r })).toThrow(
      /32 characters/,
    );
  });
});

describe("url & security", () => {
  it("清洗站内跳转路径，阻断开放重定向与循环跳回登录", () => {
    expect(sanitizeNextPath("/dashboard?tab=1#top")).toBe("/dashboard?tab=1#top");
    expect(sanitizeNextPath("https://evil.com")).toBe("/");
    expect(sanitizeNextPath("//evil.com/a")).toBe("/");
    expect(sanitizeNextPath("/\\evil.com")).toBe("/");
    expect(sanitizeNextPath("/login?next=/a")).toBe("/");
    expect(sanitizeNextPath("/login-help")).toBe("/login-help");
    expect(sanitizeNextPath("/register", { forbiddenPrefixes: ["/login", "/register"] })).toBe("/");
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(buildUrlWithQuery("/items", { q: "hi", page: 2, empty: "" })).toBe("/items?q=hi&page=2");
    expect(readStringParam({ q: " abc " }, "q")).toBe("abc");
    expect(readIntParam({ limit: "999" }, "limit", { fallback: 20, min: 1, max: 100 })).toBe(100);
  });

  it("同源检查、恒定时间比对、可信 IP 提取与滑动窗口限流", () => {
    const headers = new Headers({
      origin: "https://app.example.com",
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
    });
    expect(isSameOrigin(headers, "https://app.example.com")).toBe(true);
    expect(isSameOrigin(headers, "https://other.example.com")).toBe(false);
    expect(isSameOrigin(new Headers({ "sec-fetch-site": "same-origin" }), "https://app.example.com")).toBe(true);

    expect(timingSafeEqualString("csrf-token-1", "csrf-token-1")).toBe(true);
    expect(timingSafeEqualString("csrf-token-1", "csrf-token-2")).toBe(false);
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);

    expect(extractClientIp(headers)).toBe("203.0.113.9");

    let clock = 1000;
    const limiter = createSlidingWindowRateLimiter({ windowMs: 10_000, maxAttempts: 2, now: () => clock });
    expect(limiter.consume("ip:user").allowed).toBe(true);
    expect(limiter.consume("ip:user").allowed).toBe(true);
    const blocked = limiter.consume("ip:user");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(10_000);
    clock += 10_001;
    expect(limiter.check("ip:user").allowed).toBe(true);
  });
});

describe("deployment guard", () => {
  it("支持静态配对校验、TTL 缓存、并发合并与失败不缓存", async () => {
    let clock = 1000;
    const probe = vi
      .fn<() => Promise<{ ok: boolean; observedEnv?: string }>>()
      .mockResolvedValueOnce({ ok: false, observedEnv: "production" })
      .mockResolvedValueOnce({ ok: true, observedEnv: "development" });

    const guard = createDeploymentGuard({
      env: "development",
      rules: {
        local: { publicOrigin: "http://127.0.0.1:3000" },
        development: {
          publicOrigin: "https://dev.example.com",
          upstreamUrl: "https://api-dev.example.com",
        },
        production: {
          publicOrigin: "https://prod.example.com",
          upstreamUrl: "https://api.example.com",
        },
      },
      publicOrigin: "https://dev.example.com",
      upstreamUrl: "https://api-dev.example.com",
      probe,
      ttlMs: 60_000,
      now: () => clock,
    });

    await expect(guard.verify()).rejects.toThrow(/mismatch/i);
    // 失败后不缓存，下一次会重新探测并合并并发
    await Promise.all([guard.verify(), guard.verify()]);
    expect(probe).toHaveBeenCalledTimes(2);

    // TTL 有效期内不再重复探测
    clock += 30_000;
    await guard.verify();
    expect(probe).toHaveBeenCalledTimes(2);

    // 静态错配直接阻断
    const badGuard = createDeploymentGuard({
      env: "development",
      rules: {
        development: { upstreamUrl: "https://api-dev.example.com" },
        production: { upstreamUrl: "https://api.example.com" },
      },
      upstreamUrl: "https://api.example.com",
    });
    expect(() => badGuard.assertConfig()).toThrow(/Upstream URL/);
  });
});
