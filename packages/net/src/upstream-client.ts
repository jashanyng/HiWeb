import { buildUrlWithQuery, type QueryParamValue } from "@pcfprio/hiweb-core/url";

import { composeAbortSignal } from "./browser-client.js";
import { createStandardEnvelopeDecoder, type EnvelopeDecoder } from "./envelope.js";
import { UpstreamApiError } from "./errors.js";

export interface UpstreamFallbackMessages {
  readonly timeout: string;
  readonly unavailable: string;
  readonly invalidResponse: string;
}

export interface UpstreamClientOptions {
  readonly baseUrl: string;
  readonly decoder?: EnvelopeDecoder;
  readonly defaultTimeoutMs?: number;
  readonly beforeRequest?: (path: string) => Promise<void> | void;
  readonly getDefaultHeaders?: () => Record<string, string>;
  readonly getFallbackMessages?: (lang?: string) => UpstreamFallbackMessages;
  readonly onContractDrift?: (info: {
    readonly path: string;
    readonly requestId?: string;
    readonly error: unknown;
  }) => void;
  readonly fetchImpl?: typeof fetch;
}

export interface UpstreamRequestOptions<T> {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly query?: Readonly<Record<string, QueryParamValue>>;
  readonly json?: unknown;
  readonly form?: FormData;
  readonly body?: BodyInit;
  readonly headers?: Record<string, string>;
  readonly token?: string;
  readonly requestId?: string;
  readonly clientIp?: string;
  readonly lang?: string;
  readonly accept?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly parse?: (data: unknown) => T;
}

export interface UpstreamClient {
  requestJson<T = unknown>(path: string, options?: UpstreamRequestOptions<T>): Promise<T>;
  requestRaw(path: string, options?: Omit<UpstreamRequestOptions<unknown>, "parse">): Promise<Response>;
}

const DEFAULT_FALLBACK: UpstreamFallbackMessages = {
  timeout: "Upstream service timed out.",
  unavailable: "Upstream service temporarily unavailable.",
  invalidResponse: "Unexpected response from upstream service.",
};

function joinBaseAndPath(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export function createUpstreamClient(options: UpstreamClientOptions): UpstreamClient {
  const decoder = options.decoder ?? createStandardEnvelopeDecoder();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 20_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const send = async (path: string, req: Omit<UpstreamRequestOptions<unknown>, "parse"> = {}): Promise<Response> => {
    await options.beforeRequest?.(path);
    const messages = options.getFallbackMessages?.(req.lang) ?? DEFAULT_FALLBACK;
    const url = buildUrlWithQuery(joinBaseAndPath(options.baseUrl, path), req.query ?? {});
    const headers = new Headers(options.getDefaultHeaders?.());
    if (req.lang) headers.set("accept-language", req.lang);
    if (req.accept) headers.set("accept", req.accept);
    if (req.requestId) headers.set("x-request-id", req.requestId);
    if (req.token) headers.set("authorization", `Bearer ${req.token}`);
    if (req.clientIp) headers.set("x-forwarded-for", req.clientIp);
    for (const [k, v] of Object.entries(req.headers ?? {})) {
      headers.set(k, v);
    }

    let body: BodyInit | undefined = req.body;
    if (req.form) {
      body = req.form;
    } else if (req.json !== undefined) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      body = JSON.stringify(req.json);
    }

    try {
      return await fetchImpl(url, {
        method: req.method ?? (body !== undefined ? "POST" : "GET"),
        headers,
        body,
        cache: "no-store",
        signal: composeAbortSignal(req.signal, req.timeoutMs ?? defaultTimeoutMs),
      });
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      throw new UpstreamApiError(
        isTimeout ? 504 : 503,
        isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
        isTimeout ? messages.timeout : messages.unavailable,
        { cause: error },
      );
    }
  };

  return {
    async requestJson<T = unknown>(path: string, req: UpstreamRequestOptions<T> = {}): Promise<T> {
      const messages = options.getFallbackMessages?.(req.lang) ?? DEFAULT_FALLBACK;
      const response = await send(path, req);
      const rawBody: unknown = await response.json().catch(() => null);
      const decoded = decoder.decode(response.status, response.ok, rawBody, messages.invalidResponse);
      if (!decoded.ok) {
        throw new UpstreamApiError(decoded.status, decoded.code, decoded.message, { details: decoded.details });
      }
      if (req.parse) {
        try {
          return req.parse(decoded.data);
        } catch (error) {
          options.onContractDrift?.({ path, requestId: req.requestId, error });
          throw new UpstreamApiError(502, "UPSTREAM_SCHEMA_MISMATCH", messages.invalidResponse, { cause: error });
        }
      }
      return decoded.data as T;
    },

    async requestRaw(path: string, req: Omit<UpstreamRequestOptions<unknown>, "parse"> = {}): Promise<Response> {
      const messages = options.getFallbackMessages?.(req.lang) ?? DEFAULT_FALLBACK;
      const response = await send(path, req);
      if (!response.ok) {
        const rawBody: unknown = await response.json().catch(() => null);
        const decoded = decoder.decode(response.status, false, rawBody, messages.invalidResponse);
        throw new UpstreamApiError(
          decoded.ok ? response.status : decoded.status,
          decoded.ok ? `HTTP_${response.status}` : decoded.code,
          decoded.ok ? messages.invalidResponse : decoded.message,
          { details: decoded.ok ? undefined : decoded.details },
        );
      }
      return response;
    },
  };
}
