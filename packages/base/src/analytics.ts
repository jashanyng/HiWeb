export type AnalyticsScalar = string | number | boolean | null;
export type AnalyticsValue = AnalyticsScalar | readonly (string | number | boolean)[];

export type AnalyticsProperties = Readonly<Record<string, AnalyticsValue | undefined>>;

export interface AnalyticsEvent {
  readonly name: string;
  readonly properties?: AnalyticsProperties;
  readonly timestamp?: string;
}

export type PrivacyConsentStatus = "unknown" | "granted" | "denied";

export interface AnalyticsTracker {
  track(event: AnalyticsEvent): void | Promise<void>;
  identify(userId: string, traits?: AnalyticsProperties): void | Promise<void>;
  page(path: string, properties?: AnalyticsProperties): void | Promise<void>;
  reset(): void | Promise<void>;
  flush(): void | Promise<void>;
}

export function createNoopAnalyticsTracker(): AnalyticsTracker {
  return {
    track() {},
    identify() {},
    page() {},
    reset() {},
    flush() {},
  };
}

export function createConsoleAnalyticsTracker(
  writer: (line: string) => void = (line) => {
    // eslint-disable-next-line no-console -- 显式创建的控制台埋点调试适配器
    console.info(line);
  },
): AnalyticsTracker {
  return {
    track(event) {
      writer(JSON.stringify({ kind: "analytics.track", ...event }));
    },
    identify(userId, traits) {
      writer(JSON.stringify({ kind: "analytics.identify", userId, traits }));
    },
    page(path, properties) {
      writer(JSON.stringify({ kind: "analytics.page", path, properties }));
    },
    reset() {
      writer(JSON.stringify({ kind: "analytics.reset" }));
    },
    flush() {},
  };
}

/** 仅当隐私同意状态为 granted 时才透传埋点上报；reset 始终执行以清理本地标识。 */
export function createConsentGatedAnalyticsTracker(
  inner: AnalyticsTracker,
  getConsent: () => PrivacyConsentStatus,
): AnalyticsTracker {
  const isGranted = () => getConsent() === "granted";
  return {
    track(event) {
      if (!isGranted()) return;
      return inner.track(event);
    },
    identify(userId, traits) {
      if (!isGranted()) return;
      return inner.identify(userId, traits);
    },
    page(path, properties) {
      if (!isGranted()) return;
      return inner.page(path, properties);
    },
    reset() {
      return inner.reset();
    },
    flush() {
      if (!isGranted()) return;
      return inner.flush();
    },
  };
}

export function createCompositeAnalyticsTracker(trackers: readonly AnalyticsTracker[]): AnalyticsTracker {
  const fanOut = async (invoke: (tracker: AnalyticsTracker) => void | Promise<void>): Promise<void> => {
    await Promise.allSettled(trackers.map((tracker) => Promise.resolve().then(() => invoke(tracker))));
  };

  return {
    track: (event) => fanOut((tracker) => tracker.track(event)),
    identify: (userId, traits) => fanOut((tracker) => tracker.identify(userId, traits)),
    page: (path, properties) => fanOut((tracker) => tracker.page(path, properties)),
    reset: () => fanOut((tracker) => tracker.reset()),
    flush: () => fanOut((tracker) => tracker.flush()),
  };
}
