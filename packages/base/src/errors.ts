export interface AppError {
  readonly code: string | number;
  readonly message: string;
  readonly debugMessage?: string;
  readonly status?: number;
  readonly details?: unknown;
  readonly cause?: unknown;
}

export class AppErrorException extends Error implements AppError {
  readonly code: string | number;
  readonly debugMessage?: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(options: AppError) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppErrorException";
    this.code = options.code;
    this.debugMessage = options.debugMessage;
    this.status = options.status;
    this.details = options.details;
  }
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (typeof record.code === "string" || typeof record.code === "number") && typeof record.message === "string";
}

/**
 * 将任意未知异常规整为安全的 AppError：面向用户的 message 保持中性或预设文案，原始错误仅留在 debugMessage。
 */
export function toAppError(
  error: unknown,
  fallback: { readonly code?: string | number; readonly message?: string; readonly status?: number } = {},
): AppError {
  if (error instanceof AppErrorException) {
    return {
      code: error.code,
      message: error.message,
      debugMessage: error.debugMessage,
      status: error.status,
      details: error.details,
      cause: error.cause,
    };
  }
  if (isAppError(error)) {
    return error;
  }
  const debugMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return {
    code: fallback.code ?? "INTERNAL_ERROR",
    message: fallback.message ?? "Unexpected error",
    debugMessage,
    status: fallback.status,
    cause: error,
  };
}

export type AppResult<T, E = AppError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): AppResult<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): AppResult<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: AppResult<T, E>): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}

export function isErr<T, E>(result: AppResult<T, E>): result is { readonly ok: false; readonly error: E } {
  return !result.ok;
}
