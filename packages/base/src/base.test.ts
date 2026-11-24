import { describe, expect, it, vi } from "vitest";

import {
  createCompositeAnalyticsTracker,
  createConsentGatedAnalyticsTracker,
  createConsoleAnalyticsTracker,
  createNoopAnalyticsTracker,
  type PrivacyConsentStatus,
} from "./analytics.js";
import {
  createConsentGatedErrorReporter,
  createConsoleErrorReporter,
  createNoopErrorReporter,
} from "./error-reporter.js";
import { AppErrorException, err, isAppError, isErr, isOk, ok, toAppError } from "./errors.js";
import { createDateFormatter, createNumberFormatter, shortId } from "./format.js";
import { createLogger, type LogEntry } from "./logger.js";

describe("errors", () => {
  it("区分面向用户消息与诊断消息", () => {
    const raw = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    const appErr = toAppError(raw, { code: "DB_DOWN", message: "Service unavailable", status: 503 });
    expect(appErr.code).toBe("DB_DOWN");
    expect(appErr.message).toBe("Service unavailable");
    expect(appErr.debugMessage).toContain("ECONNREFUSED");
    expect(isAppError(appErr)).toBe(true);
  });

  it("支持 AppResult ok/err 判别", () => {
    const success = ok(42);
    const failure = err(new AppErrorException({ code: "INVALID", message: "Bad input", status: 400 }));
    expect(isOk(success)).toBe(true);
    expect(isErr(failure)).toBe(true);
    if (!failure.ok) {
      expect(failure.error.status).toBe(400);
    }
  });
});

describe("logger", () => {
  it("默认对敏感字段、Bearer 头、JWT 与查询参数脱敏且无全局串扰", () => {
    const records: { entry: LogEntry; raw: string }[] = [];
    const logger = createLogger({
      service: "hiweb-test",
      level: "debug",
      now: () => new Date("2026-11-19T12:00:00.000Z"),
      sink: (entry, serialized) => records.push({ entry, raw: serialized }),
    });

    const child = logger.child({ requestId: "req-123" });
    child.info("auth.login", {
      email: "user@example.com",
      accessToken: "secret-abc",
      nested: { password: "p1", customSecretField: "s2" },
      header: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.signature123456",
      callback: "https://example.com/cb?token=xyz999&page=2",
    });

    expect(records).toHaveLength(1);
    const parsed = JSON.parse(records[0]!.raw) as Record<string, unknown>;
    expect(parsed.ts).toBe("2026-11-19T12:00:00.000Z");
    expect(parsed.requestId).toBe("req-123");
    expect(parsed.email).toBe("user@example.com");
    expect(parsed.accessToken).toBe("[REDACTED]");
    expect(parsed.nested).toEqual({ password: "[REDACTED]", customSecretField: "[REDACTED]" });
    expect(parsed.header).not.toContain("eyJhbGci");
    expect(parsed.header).toContain("[REDACTED]");
    expect(parsed.callback).toBe("https://example.com/cb?token=[REDACTED]&page=2");
  });

  it("安全处理循环引用并在级别过滤时跳过输出", () => {
    const sink = vi.fn();
    const logger = createLogger({ service: "svc", level: "warn", sink });
    logger.info("ignored.event");
    expect(sink).not.toHaveBeenCalled();

    const circular: Record<string, unknown> = { ok: 1 };
    circular.self = circular;
    logger.error("circular.error", { circular });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![1]).toContain("[CIRCULAR]");
  });
});

describe("analytics & error-reporter", () => {
  it("隐私同意门控仅在 granted 时发送事件，并在 denied/unknown 时仍允许 reset", async () => {
    let consent: PrivacyConsentStatus = "unknown";
    const lines: string[] = [];
    const gated = createConsentGatedAnalyticsTracker(
      createCompositeAnalyticsTracker([
        createNoopAnalyticsTracker(),
        createConsoleAnalyticsTracker((l) => lines.push(l)),
      ]),
      () => consent,
    );

    await gated.track({ name: "page_viewed" });
    expect(lines).toHaveLength(0);

    await gated.reset();
    expect(lines).toHaveLength(1);

    consent = "granted";
    await gated.identify("u-1", { plan: "pro" });
    await gated.page("/home");
    expect(lines).toHaveLength(3);
  });

  it("错误上报门控与作用域合并正确", () => {
    let consent: PrivacyConsentStatus = "denied";
    const lines: string[] = [];
    const noop = createNoopErrorReporter();
    noop.withScope({ requestId: "r0" }).captureMessage("ignored");

    const reporter = createConsentGatedErrorReporter(
      createConsoleErrorReporter((l) => lines.push(l)),
      () => consent,
    ).withScope({ tags: { env: "test" }, requestId: "req-9" });

    reporter.captureMessage("blocked");
    expect(lines).toHaveLength(0);

    consent = "granted";
    reporter.captureException(new Error("boom"), { severity: "fatal", user: { id: "u-9" } });
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]!) as { context: { requestId: string; tags: Record<string, string> } };
    expect(payload.context.requestId).toBe("req-9");
    expect(payload.context.tags.env).toBe("test");
  });
});

describe("format", () => {
  it("按指定时区与语言格式化并安全处理空值", () => {
    const df = createDateFormatter({ locale: "zh-CN", timeZone: "Asia/Shanghai" });
    const nf = createNumberFormatter({ locale: "en-US" });
    expect(df.formatDate(null)).toBe("—");
    expect(df.formatDateTime("invalid-date")).toBe("—");
    // 2026-11-19T00:30:00Z -> Asia/Shanghai 2026/11/19 08:30
    expect(df.formatDateTime("2026-11-19T00:30:00.000Z")).toContain("08:30");
    expect(df.isSameDay("2026-11-19T16:30:00.000Z", "2026-11-20T01:00:00.000Z")).toBe(true);
    expect(nf.formatLatency(420)).toBe("420 ms");
    expect(nf.formatLatency(1500)).toBe("1.50 s");
    expect(nf.formatPercent(0.875, 1)).toBe("87.5%");
    expect(shortId("abcdef123456", 6)).toBe("abcdef");
  });
});
