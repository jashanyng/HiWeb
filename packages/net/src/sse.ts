import { composeAbortSignal } from "./browser-client.js";
import { createStandardEnvelopeDecoder, type EnvelopeDecoder } from "./envelope.js";
import { ClientApiError } from "./errors.js";

export interface SseMessage {
  readonly event: string;
  readonly data: string;
  readonly id?: string;
  readonly retry?: number;
}

function dispatchBlock(block: string, onMessage: (msg: SseMessage) => void): void {
  const lines = block.split(/\r?\n/);
  let event = "message";
  let id: string | undefined;
  let retry: number | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value || "message";
    else if (field === "data") dataLines.push(value);
    else if (field === "id") id = value;
    else if (field === "retry") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) retry = parsed;
    }
  }

  if (dataLines.length === 0 && event === "message" && id === undefined && retry === undefined) {
    return;
  }
  onMessage({
    event,
    data: dataLines.join("\n"),
    ...(id !== undefined ? { id } : {}),
    ...(retry !== undefined ? { retry } : {}),
  });
}

/** 逐帧读取 ReadableStream<Uint8Array> 中的 text/event-stream 数据。 */
export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onMessage: (msg: SseMessage) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sepIndex = buffer.indexOf("\n\n");
      while (sepIndex !== -1) {
        const block = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        dispatchBlock(block, onMessage);
        sepIndex = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode().replace(/\r\n/g, "\n");
    if (buffer.trim()) {
      dispatchBlock(buffer, onMessage);
    }
  } finally {
    reader.releaseLock();
  }
}

export interface FetchSseOptions {
  readonly method?: "GET" | "POST";
  readonly headers?: Record<string, string>;
  readonly json?: unknown;
  readonly credentials?: RequestCredentials;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly decoder?: EnvelopeDecoder;
  readonly fallbackMessages?: { readonly network: string; readonly invalidResponse: string };
  readonly onUnauthorized?: (context: { readonly status: number; readonly url: string }) => void;
  readonly onMessage: (msg: SseMessage) => void;
  readonly fetchImpl?: typeof fetch;
}

/**
 * 经过统一错误解析与 401 鉴权拦截的 SSE 请求器。
 */
export async function fetchSse(url: string, options: FetchSseOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const decoder = options.decoder ?? createStandardEnvelopeDecoder();
  const messages = options.fallbackMessages ?? {
    network: "Network request failed. Please try again.",
    invalidResponse: "Unexpected stream response.",
  };

  const headers = new Headers({ accept: "text/event-stream", ...(options.headers ?? {}) });
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? (body !== undefined ? "POST" : "GET"),
      headers,
      body,
      credentials: options.credentials ?? "same-origin",
      signal: composeAbortSignal(options.signal, options.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && options.signal?.aborted) {
      throw error;
    }
    throw new ClientApiError(0, "NETWORK_ERROR", messages.network, { cause: error });
  }

  if (!response.ok || !response.body) {
    const rawBody: unknown = await response.json().catch(() => null);
    const decoded = decoder.decode(response.status, false, rawBody, messages.invalidResponse);
    const status = decoded.ok ? response.status : decoded.status;
    if (status === 401) {
      options.onUnauthorized?.({ status: 401, url });
    }
    throw new ClientApiError(
      status,
      decoded.ok ? `HTTP_${response.status}` : decoded.code,
      decoded.ok ? messages.invalidResponse : decoded.message,
      { details: decoded.ok ? undefined : decoded.details },
    );
  }

  await parseSseStream(response.body, options.onMessage, options.signal);
}
