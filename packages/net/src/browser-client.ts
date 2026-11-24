import { buildUrlWithQuery, type QueryParamValue } from "@jashanyng/hiweb-core/url";

import { createStandardEnvelopeDecoder, type EnvelopeDecoder } from "./envelope.js";
import { ClientApiError } from "./errors.js";

export interface BrowserClientFallbackMessages {
  readonly network: string;
  readonly invalidResponse: string;
}

export interface BrowserApiClientOptions {
  readonly baseUrl?: string;
  readonly decoder?: EnvelopeDecoder;
  readonly defaultTimeoutMs?: number;
  readonly credentials?: RequestCredentials;
  readonly getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  readonly getFallbackMessages?: () => BrowserClientFallbackMessages;
  readonly onUnauthorized?: (context: { readonly status: number; readonly path: string }) => void;
  readonly fetchImpl?: typeof fetch;
}

export interface BrowserRequestOptions<T> {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly query?: Readonly<Record<string, QueryParamValue>>;
  readonly json?: unknown;
  readonly form?: FormData;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly parse?: (data: unknown) => T;
  readonly skipUnauthorizedHandler?: boolean;
}

export interface BrowserApiClient {
  request<T = unknown>(path: string, options?: BrowserRequestOptions<T>): Promise<T>;
}

const DEFAULT_MESSAGES: BrowserClientFallbackMessages = {
  network: "Network request failed. Please check your connection and try again.",
  invalidResponse: "Unexpected server response. Please try again later.",
};

export function composeAbortSignal(external?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  const timeoutSignal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
  if (external && timeoutSignal) {
    return AbortSignal.any([external, timeoutSignal]);
  }
  return external ?? timeoutSignal;
}

export function createBrowserApiClient(options: BrowserApiClientOptions = {}): BrowserApiClient {
  const baseUrl = options.baseUrl ?? "";
  const decoder = options.decoder ?? createStandardEnvelopeDecoder();
  const fetchImpl = options.fetchImpl ?? fetch;
  const credentials = options.credentials ?? "same-origin";

  return {
    async request<T = unknown>(path: string, req: BrowserRequestOptions<T> = {}): Promise<T> {
      const messages = options.getFallbackMessages?.() ?? DEFAULT_MESSAGES;
      const targetUrl = buildUrlWithQuery(`${baseUrl}${path}`, req.query ?? {});
      const headers = new Headers(await options.getHeaders?.());
      for (const [k, v] of Object.entries(req.headers ?? {})) {
        headers.set(k, v);
      }

      let body: BodyInit | undefined;
      if (req.form) {
        body = req.form;
      } else if (req.json !== undefined) {
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
        body = JSON.stringify(req.json);
      }

      let response: Response;
      try {
        response = await fetchImpl(targetUrl, {
          method: req.method ?? (body !== undefined ? "POST" : "GET"),
          headers,
          body,
          credentials,
          signal: composeAbortSignal(req.signal, req.timeoutMs ?? options.defaultTimeoutMs),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError" && req.signal?.aborted) {
          throw error;
        }
        throw new ClientApiError(0, "NETWORK_ERROR", messages.network, { cause: error });
      }

      const rawBody: unknown = await response.json().catch(() => null);
      const decoded = decoder.decode(response.status, response.ok, rawBody, messages.invalidResponse);
      if (!decoded.ok) {
        if ((response.status === 401 || decoded.status === 401) && !req.skipUnauthorizedHandler) {
          options.onUnauthorized?.({ status: 401, path });
        }
        throw new ClientApiError(decoded.status, decoded.code, decoded.message, { details: decoded.details });
      }

      if (req.parse) {
        try {
          return req.parse(decoded.data);
        } catch (error) {
          throw new ClientApiError(response.status, "INVALID_RESPONSE_SCHEMA", messages.invalidResponse, {
            cause: error,
          });
        }
      }
      return decoded.data as T;
    },
  };
}
