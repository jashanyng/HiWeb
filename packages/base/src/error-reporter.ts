import type { PrivacyConsentStatus } from "./analytics.js";

export type ErrorSeverity = "fatal" | "error" | "warning" | "info";

export interface ErrorReportContext {
  readonly severity?: ErrorSeverity;
  readonly requestId?: string;
  readonly tags?: Readonly<Record<string, string>>;
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly user?: { readonly id?: string };
}

export interface ErrorReporter {
  captureException(error: unknown, context?: ErrorReportContext): void | Promise<void>;
  captureMessage(message: string, context?: ErrorReportContext): void | Promise<void>;
  withScope(context: ErrorReportContext): ErrorReporter;
}

function mergeContext(
  base: ErrorReportContext | undefined,
  extra: ErrorReportContext | undefined,
): ErrorReportContext | undefined {
  if (!base && !extra) return undefined;
  return {
    severity: extra?.severity ?? base?.severity,
    requestId: extra?.requestId ?? base?.requestId,
    user: extra?.user ?? base?.user,
    tags: base?.tags || extra?.tags ? { ...(base?.tags ?? {}), ...(extra?.tags ?? {}) } : undefined,
    extra: base?.extra || extra?.extra ? { ...(base?.extra ?? {}), ...(extra?.extra ?? {}) } : undefined,
  };
}

export function createNoopErrorReporter(): ErrorReporter {
  const noop: ErrorReporter = {
    captureException() {},
    captureMessage() {},
    withScope: () => noop,
  };
  return noop;
}

export function createConsoleErrorReporter(
  writer: (line: string) => void = (line) => {
    // eslint-disable-next-line no-console -- 显式创建的控制台错误上报调试适配器
    console.error(line);
  },
): ErrorReporter {
  const build = (scopeContext?: ErrorReportContext): ErrorReporter => ({
    captureException(error, context) {
      const merged = mergeContext(scopeContext, context);
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      writer(JSON.stringify({ kind: "error-report.exception", message, context: merged }));
    },
    captureMessage(message, context) {
      const merged = mergeContext(scopeContext, context);
      writer(JSON.stringify({ kind: "error-report.message", message, context: merged }));
    },
    withScope: (next) => build(mergeContext(scopeContext, next)),
  });
  return build();
}

export function createConsentGatedErrorReporter(
  inner: ErrorReporter,
  getConsent: () => PrivacyConsentStatus,
): ErrorReporter {
  const build = (scoped: ErrorReporter): ErrorReporter => ({
    captureException(error, context) {
      if (getConsent() !== "granted") return;
      return scoped.captureException(error, context);
    },
    captureMessage(message, context) {
      if (getConsent() !== "granted") return;
      return scoped.captureMessage(message, context);
    },
    withScope: (context) => build(scoped.withScope(context)),
  });
  return build(inner);
}
