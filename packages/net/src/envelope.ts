export type EnvelopeDecodeResult =
  | { readonly ok: true; readonly data: unknown }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string | number;
      readonly message: string;
      readonly details?: unknown;
    };

export interface EnvelopeDecoder {
  decode(status: number, ok: boolean, body: unknown, fallbackMessage: string): EnvelopeDecodeResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 标准信封解码器：{ code: number, message: string, data?: unknown, details?: unknown }。
 */
export function createStandardEnvelopeDecoder(
  options: { readonly successCode?: number; readonly invalidResponseCode?: string | number } = {},
): EnvelopeDecoder {
  const successCode = options.successCode ?? 200;
  const invalidCode = options.invalidResponseCode ?? "INVALID_ENVELOPE";

  return {
    decode(status, ok, body, fallbackMessage) {
      if (!isRecord(body)) {
        return { ok: false, status: ok ? 502 : status, code: invalidCode, message: fallbackMessage };
      }
      const code = body.code;
      const message = body.message;
      if ((typeof code !== "number" && typeof code !== "string") || typeof message !== "string") {
        return { ok: false, status: ok ? 502 : status, code: invalidCode, message: fallbackMessage };
      }
      if (ok && code === successCode) {
        return { ok: true, data: body.data };
      }
      return {
        ok: false,
        status: ok ? 400 : status,
        code,
        message,
        details: body.details,
      };
    },
  };
}

/**
 * 裸 REST JSON 解码器：HTTP 2xx 直接作为 data，失败态尝试读取 { error } / { message }。
 */
export function createRawJsonDecoder(): EnvelopeDecoder {
  return {
    decode(status, ok, body, fallbackMessage) {
      if (ok) {
        return { ok: true, data: body };
      }
      if (isRecord(body)) {
        const message =
          typeof body.message === "string"
            ? body.message
            : typeof body.error === "string"
              ? body.error
              : fallbackMessage;
        const code = typeof body.code === "string" || typeof body.code === "number" ? body.code : `HTTP_${status}`;
        return { ok: false, status, code, message, details: body.details };
      }
      return { ok: false, status, code: `HTTP_${status}`, message: fallbackMessage };
    },
  };
}
