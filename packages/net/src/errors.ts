import { AppErrorException } from "@jashanyng/hiweb-base/errors";

export class HttpError extends AppErrorException {
  declare readonly status: number;

  constructor(
    status: number,
    code: string | number,
    message: string,
    options: { readonly details?: unknown; readonly debugMessage?: string; readonly cause?: unknown } = {},
  ) {
    super({ status, code, message, ...options });
    this.name = "HttpError";
  }
}

export class ClientApiError extends HttpError {
  constructor(
    status: number,
    code: string | number,
    message: string,
    options: { readonly details?: unknown; readonly debugMessage?: string; readonly cause?: unknown } = {},
  ) {
    super(status, code, message, options);
    this.name = "ClientApiError";
  }
}

export class UpstreamApiError extends HttpError {
  constructor(
    status: number,
    code: string | number,
    message: string,
    options: { readonly details?: unknown; readonly debugMessage?: string; readonly cause?: unknown } = {},
  ) {
    super(status, code, message, options);
    this.name = "UpstreamApiError";
  }
}

export function extractErrorMessage(error: unknown, fallback = "Operation failed. Please try again later."): string {
  if (error instanceof HttpError || error instanceof AppErrorException) {
    return error.message;
  }
  return fallback;
}
