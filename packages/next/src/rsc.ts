import "server-only";

import { notFound, redirect } from "next/navigation";

export interface RunServerPageQueryOptions {
  readonly isUnauthorized: (error: unknown) => boolean;
  readonly isNotFound?: (error: unknown) => boolean;
  readonly expiredRedirectUrl: string;
}

/**
 * 包装 Server Component 数据读取：401 统一跳转清理 Cookie 端点，404 进入 notFound()，其余交由 error.tsx。
 */
export async function runServerPageQuery<T>(load: () => Promise<T>, options: RunServerPageQueryOptions): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (options.isUnauthorized(error)) {
      redirect(options.expiredRedirectUrl);
    }
    if (options.isNotFound?.(error)) {
      notFound();
    }
    throw error;
  }
}
