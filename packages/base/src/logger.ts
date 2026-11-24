export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

const DEFAULT_REDACT_KEY_TOKENS = new Set([
  "password",
  "passcode",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authorization",
  "cookie",
  "setcookie",
  "apikey",
  "servicerole",
  "servicerolekey",
  "anonkey",
  "session",
  "sessionid",
  "sessionsecret",
  "csrf",
  "csrftoken",
  "privatekey",
  "credential",
  "credentials",
]);

const DEFAULT_REDACT_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /([?&](?:token|access_token|refresh_token|secret|password|apikey|api_key|code)=)[^&\s]+/gi,
];

const REDACTED = "[REDACTED]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string, customNormalizedKeys: ReadonlySet<string>): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  if (DEFAULT_REDACT_KEY_TOKENS.has(normalized) || customNormalizedKeys.has(normalized)) {
    return true;
  }
  return (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("cookie") ||
    normalized.includes("apikey") ||
    normalized.includes("privatekey") ||
    normalized.includes("authorization")
  );
}

function redactString(input: string, patterns: readonly RegExp[]): string {
  let out = input;
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    out = out.replace(re, (_match, group1?: string) => (group1 ? `${group1}${REDACTED}` : REDACTED));
  }
  return out;
}

function sanitizeValue(
  value: unknown,
  customNormalizedKeys: ReadonlySet<string>,
  patterns: readonly RegExp[],
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value, patterns);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message, patterns) };
  }
  if (depth > 10) return "[MAX_DEPTH]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, customNormalizedKeys, patterns, seen, depth + 1));
  }

  const record: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    record[key] = isSensitiveKey(key, customNormalizedKeys)
      ? REDACTED
      : sanitizeValue(item, customNormalizedKeys, patterns, seen, depth + 1);
  }
  return record;
}

export interface LogEntry {
  readonly ts: string;
  readonly level: Exclude<LogLevel, "silent">;
  readonly service: string;
  readonly event: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export type LogSink = (entry: LogEntry, serialized: string) => void;

export interface CreateLoggerOptions {
  readonly service: string;
  readonly level?: LogLevel;
  readonly getLevel?: () => LogLevel;
  readonly redactKeys?: readonly string[];
  readonly redactPatterns?: readonly RegExp[];
  /** 默认 false；仅当宿主明确确认且自负其责时可设为 true 以允许输出未经脱敏的数据。 */
  readonly allowSensitive?: boolean;
  readonly baseContext?: Readonly<Record<string, unknown>>;
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

export interface Logger {
  log(level: Exclude<LogLevel, "silent">, event: string, context?: Readonly<Record<string, unknown>>): void;
  debug(event: string, context?: Readonly<Record<string, unknown>>): void;
  info(event: string, context?: Readonly<Record<string, unknown>>): void;
  warn(event: string, context?: Readonly<Record<string, unknown>>): void;
  error(event: string, context?: Readonly<Record<string, unknown>>): void;
  child(context: Readonly<Record<string, unknown>>): Logger;
}

function defaultSink(entry: LogEntry, serialized: string): void {
  if (entry.level === "error") {
    // eslint-disable-next-line no-console -- 默认标准输出日志汇聚入口
    console.error(serialized);
    return;
  }
  if (entry.level === "warn") {
    // eslint-disable-next-line no-console -- 默认标准输出日志汇聚入口
    console.warn(serialized);
    return;
  }
  // eslint-disable-next-line no-console -- 默认标准输出日志汇聚入口
  console.info(serialized);
}

/** 创建独立无全局单例的结构化日志器。 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const customKeys = new Set((options.redactKeys ?? []).map(normalizeKey));
  const patterns = options.redactPatterns ?? DEFAULT_REDACT_PATTERNS;
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());
  const allowSensitive = options.allowSensitive === true;

  const resolveLevel = (): LogLevel => {
    if (options.getLevel) return options.getLevel();
    return options.level ?? "info";
  };

  const buildScoped = (baseContext?: Readonly<Record<string, unknown>>): Logger => {
    const emit = (
      level: Exclude<LogLevel, "silent">,
      event: string,
      context?: Readonly<Record<string, unknown>>,
    ): void => {
      if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[resolveLevel()]) return;
      const merged = baseContext || context ? { ...(baseContext ?? {}), ...(context ?? {}) } : undefined;
      const sanitizedContext =
        merged && Object.keys(merged).length > 0
          ? allowSensitive
            ? merged
            : (sanitizeValue(merged, customKeys, patterns, new WeakSet(), 0) as Record<string, unknown>)
          : undefined;

      const entry: LogEntry = {
        ts: now().toISOString(),
        level,
        service: options.service,
        event: allowSensitive ? event : redactString(event, patterns),
        ...(sanitizedContext && Object.keys(sanitizedContext).length > 0 ? { context: sanitizedContext } : {}),
      };
      const serialized = JSON.stringify({
        ts: entry.ts,
        level: entry.level,
        service: entry.service,
        event: entry.event,
        ...(entry.context ?? {}),
      });
      sink(entry, serialized);
    };

    return {
      log: emit,
      debug: (event, context) => emit("debug", event, context),
      info: (event, context) => emit("info", event, context),
      warn: (event, context) => emit("warn", event, context),
      error: (event, context) => emit("error", event, context),
      child: (extra) => buildScoped({ ...(baseContext ?? {}), ...extra }),
    };
  };

  return buildScoped(options.baseContext);
}
