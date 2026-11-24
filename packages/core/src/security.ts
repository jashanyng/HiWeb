export interface HeaderGetter {
  get(name: string): string | null;
}

export interface SameOriginOptions {
  /** 当浏览器未发送 Origin 时，是否放行 Sec-Fetch-Site: same-origin（默认 true）。 */
  readonly allowSecFetchSite?: boolean;
}

export function isSameOrigin(headers: HeaderGetter, expectedOrigin: string, options: SameOriginOptions = {}): boolean {
  const origin = headers.get("origin");
  if (origin) {
    return origin === expectedOrigin;
  }
  if (options.allowSecFetchSite !== false) {
    return headers.get("sec-fetch-site") === "same-origin";
  }
  return false;
}

const utf8 = new TextEncoder();

/** 恒定时间字符串对比，降低时序旁路风险，纯同构无需 node:crypto。 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bytesA = utf8.encode(a);
  const bytesB = utf8.encode(b);
  let diff = bytesA.length ^ bytesB.length;
  const maxLen = Math.max(bytesA.length, bytesB.length);
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

export interface ExtractClientIpOptions {
  /** 按可信反代优先级排列的请求头顺序，默认 ["x-real-ip", "cf-connecting-ip", "x-forwarded-for"]。 */
  readonly headerOrder?: readonly string[];
  readonly fallback?: string;
}

export function extractClientIp(headers: HeaderGetter, options: ExtractClientIpOptions = {}): string {
  const order = options.headerOrder ?? ["x-real-ip", "cf-connecting-ip", "x-forwarded-for"];
  for (const name of order) {
    const raw = headers.get(name);
    if (!raw) continue;
    const candidate = raw.split(",")[0]?.trim();
    if (candidate) return candidate;
  }
  return options.fallback ?? "unknown";
}

export interface RateLimiterOptions {
  readonly windowMs: number;
  readonly maxAttempts: number;
  readonly maxKeys?: number;
  readonly now?: () => number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
}

export interface SlidingWindowRateLimiter {
  check(key: string): RateLimitResult;
  consume(key: string): RateLimitResult;
  reset(key: string): void;
  clear(): void;
}

/** 内存滑动窗口限流器，适合单实例防暴破与基础保护；带容量上限防内存增长失控。 */
export function createSlidingWindowRateLimiter(options: RateLimiterOptions): SlidingWindowRateLimiter {
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? 10_000;
  const buckets = new Map<string, number[]>();

  const prune = (key: string, currentMs: number): number[] => {
    const cutoff = currentMs - options.windowMs;
    const existing = buckets.get(key) ?? [];
    const active = existing.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, active);
    }
    return active;
  };

  const evictIfNeeded = () => {
    if (buckets.size < maxKeys) return;
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  };

  const evaluate = (key: string, recordFailure: boolean): RateLimitResult => {
    const currentMs = now();
    const active = prune(key, currentMs);
    if (active.length >= options.maxAttempts) {
      const oldest = active[0] ?? currentMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldest + options.windowMs - currentMs),
      };
    }
    if (recordFailure) {
      evictIfNeeded();
      const next = [...active, currentMs];
      buckets.set(key, next);
      return {
        allowed: true,
        remaining: Math.max(0, options.maxAttempts - next.length),
        retryAfterMs: 0,
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, options.maxAttempts - active.length),
      retryAfterMs: 0,
    };
  };

  return {
    check: (key) => evaluate(key, false),
    consume: (key) => evaluate(key, true),
    reset: (key) => {
      buckets.delete(key);
    },
    clear: () => {
      buckets.clear();
    },
  };
}
