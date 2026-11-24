import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createBrowserApiClient } from "./browser-client.js";
import { createRawJsonDecoder, createStandardEnvelopeDecoder } from "./envelope.js";
import { ClientApiError, extractErrorMessage, UpstreamApiError } from "./errors.js";
import { fetchSse, parseSseStream, type SseMessage } from "./sse.js";
import { createUpstreamClient } from "./upstream-client.js";

describe("browser-client & envelopes", () => {
  it("解析标准信封并在 401 时触发 onUnauthorized", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, message: "ok", data: { id: "1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 1001101, message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );

    const client = createBrowserApiClient({
      decoder: createStandardEnvelopeDecoder({ successCode: 200 }),
      onUnauthorized,
      fetchImpl,
    });

    const data = await client.request("/api/me", { parse: (raw) => z.object({ id: z.string() }).parse(raw) });
    expect(data).toEqual({ id: "1" });

    await expect(client.request("/api/secret")).rejects.toBeInstanceOf(ClientApiError);
    expect(onUnauthorized).toHaveBeenCalledWith({ status: 401, path: "/api/secret" });
  });

  it("支持裸 REST JSON 解码器", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [1, 2] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Forbidden action" }), { status: 403 }));

    const client = createBrowserApiClient({
      decoder: createRawJsonDecoder(),
      fetchImpl,
    });

    expect(await client.request("/api/items")).toEqual({ items: [1, 2] });
    try {
      await client.request("/api/admin");
      expect.unreachable();
    } catch (err) {
      expect(extractErrorMessage(err)).toBe("Forbidden action");
    }
  });
});

describe("upstream-client", () => {
  it("执行前置守卫钩子并在契约漂移时调用回调并抛 502", async () => {
    const beforeRequest = vi.fn();
    const onContractDrift = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, message: "ok", data: { count: "not-a-number" } }), {
        status: 200,
      }),
    );

    const upstream = createUpstreamClient({
      baseUrl: "https://api.example.com",
      beforeRequest,
      onContractDrift,
      fetchImpl,
    });

    await expect(
      upstream.requestJson("/items", {
        requestId: "req-1",
        token: "tok-1",
        parse: (raw) => z.object({ count: z.number() }).parse(raw),
      }),
    ).rejects.toBeInstanceOf(UpstreamApiError);

    expect(beforeRequest).toHaveBeenCalledWith("/items");
    expect(onContractDrift).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer tok-1");
    expect(headers.get("x-request-id")).toBe("req-1");
  });
});

describe("sse", () => {
  it("跨 chunk 拆行解析 SSE 帧且 fetchSse 在 401 时触发登出钩子", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: meta\ndata: {"step":1}\n\nevent: del'));
        controller.enqueue(encoder.encode("ta\ndata: hello\ndata: world\n\n"));
        controller.close();
      },
    });
    const messages: SseMessage[] = [];
    await parseSseStream(stream, (m) => messages.push(m));
    expect(messages).toEqual([
      { event: "meta", data: '{"step":1}' },
      { event: "delta", data: "hello\nworld" },
    ]);

    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ code: 1001101, message: "Expired" }), { status: 401 }));

    await expect(
      fetchSse("/api/stream", {
        onUnauthorized,
        onMessage: () => {},
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ClientApiError);
    expect(onUnauthorized).toHaveBeenCalledWith({ status: 401, url: "/api/stream" });
  });
});
