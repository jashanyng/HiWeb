export interface SanitizeNextPathOptions {
  readonly fallback?: string;
  readonly forbiddenPrefixes?: readonly string[];
}

function matchesPrefixBoundary(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`);
}

/**
 * 清洗站内回跳路径，防御开放重定向、协议注入、反斜杠绕过及登录页循环跳转。
 */
export function sanitizeNextPath(raw: string | null | undefined, options: SanitizeNextPathOptions = {}): string {
  const fallback = options.fallback ?? "/";
  const forbidden = options.forbiddenPrefixes ?? ["/login"];
  if (!raw) return fallback;

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  // 禁止控制字符，防 CRLF 或不可见字符混入
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://hiweb.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "https://hiweb.local") return fallback;

  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  for (const prefix of forbidden) {
    if (matchesPrefixBoundary(normalized, prefix)) return fallback;
  }
  return normalized;
}

export function isSafeHttpUrl(raw: string | null | undefined, options: { readonly allowHttp?: boolean } = {}): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "https:") return true;
    return options.allowHttp === true && url.protocol === "http:";
  } catch {
    return false;
  }
}

export type QueryParamValue = string | number | boolean | null | undefined;

export function buildUrlWithQuery(path: string, params: Readonly<Record<string, QueryParamValue>>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  if (!qs) return path;
  return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`;
}

export function readStringParam(
  params: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  key: string,
  fallback = "",
): string {
  if (params instanceof URLSearchParams) {
    const v = params.get(key);
    return v !== null ? v.trim() : fallback;
  }
  const raw = params[key];
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return fallback;
}

export function readIntParam(
  params: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  key: string,
  options: { readonly fallback: number; readonly min?: number; readonly max?: number },
): number {
  const raw = readStringParam(params, key, "");
  if (!raw) return options.fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return options.fallback;
  if (options.min !== undefined && parsed < options.min) return options.min;
  if (options.max !== undefined && parsed > options.max) return options.max;
  return parsed;
}
