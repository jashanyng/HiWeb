import { AppErrorException } from "@jashanyng/hiweb-base/errors";

export type OriginMatcher = string | readonly string[] | ((url: URL) => boolean);

export interface DeploymentRule {
  readonly publicOrigin?: OriginMatcher;
  readonly upstreamUrl?: OriginMatcher;
}

export interface DeploymentProbeResult {
  readonly ok: boolean;
  readonly observedEnv?: string;
  readonly reason?: string;
}

export interface DeploymentGuardOptions<TEnv extends string> {
  readonly env: NoInfer<TEnv>;
  readonly rules: Readonly<Record<TEnv, DeploymentRule>>;
  readonly publicOrigin?: string;
  readonly upstreamUrl?: string;
  readonly probe?: () => Promise<DeploymentProbeResult>;
  /** 探测结果成功缓存时间（毫秒），默认 5 分钟；失败永不缓存。 */
  readonly ttlMs?: number;
  readonly now?: () => number;
}

export interface DeploymentGuard<TEnv extends string> {
  readonly env: TEnv;
  assertConfig(): void;
  verify(): Promise<void>;
  resetCache(): void;
}

function matchesOriginRule(rawUrl: string, matcher: OriginMatcher): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (typeof matcher === "function") return matcher(parsed);
  if (typeof matcher === "string") return parsed.origin === matcher;
  return matcher.includes(parsed.origin);
}

/**
 * 创建部署环境守卫：静态核对当前环境与 Origin/上游地址配对，防止错连环境；
 * 可选执行带 TTL 缓存与并发合并的上游身份探测，失败不缓存。
 */
export function createDeploymentGuard<TEnv extends string>(
  options: DeploymentGuardOptions<TEnv>,
): DeploymentGuard<TEnv> {
  const ttlMs = options.ttlMs ?? 300_000;
  const now = options.now ?? (() => Date.now());
  let verifiedAtMs: number | undefined;
  let inflight: Promise<void> | undefined;

  const assertConfig = (): void => {
    const rule = options.rules[options.env];
    if (!rule) {
      throw new AppErrorException({
        code: "INVALID_DEPLOYMENT_ENV",
        message: `Unsupported deployment environment: ${String(options.env)}`,
        status: 500,
      });
    }
    if (rule.publicOrigin && options.publicOrigin && !matchesOriginRule(options.publicOrigin, rule.publicOrigin)) {
      throw new AppErrorException({
        code: "PUBLIC_ORIGIN_MISMATCH",
        message: `Public origin does not belong to deployment environment "${options.env}".`,
        status: 500,
      });
    }
    if (rule.upstreamUrl && options.upstreamUrl && !matchesOriginRule(options.upstreamUrl, rule.upstreamUrl)) {
      throw new AppErrorException({
        code: "UPSTREAM_URL_MISMATCH",
        message: `Upstream URL does not belong to deployment environment "${options.env}".`,
        status: 500,
      });
    }
  };

  const verify = async (): Promise<void> => {
    assertConfig();
    if (!options.probe) return;
    if (verifiedAtMs !== undefined && now() - verifiedAtMs < ttlMs) {
      return;
    }
    inflight ??= (async () => {
      const res = await options.probe!();
      if (!res.ok || (res.observedEnv !== undefined && res.observedEnv !== options.env)) {
        throw new AppErrorException({
          code: "UPSTREAM_ENV_MISMATCH",
          message:
            res.reason ?? `Upstream environment mismatch: expected "${options.env}", got "${String(res.observedEnv)}".`,
          status: 503,
        });
      }
      verifiedAtMs = now();
    })().finally(() => {
      inflight = undefined;
    });
    return inflight;
  };

  return {
    env: options.env,
    assertConfig,
    verify,
    resetCache: () => {
      verifiedAtMs = undefined;
      inflight = undefined;
    },
  };
}
