import { AppErrorException } from "@jashanyng/hiweb-base/errors";

export type StorageArea = "local" | "session";

export interface BrowserStoreOptions {
  readonly namespace: string;
  readonly area?: StorageArea;
  /** 可选自定义内存兜底映射（SSR 或隐私模式阻断时使用）。 */
  readonly memoryFallback?: Map<string, string>;
}

export interface BrowserStore {
  get<T>(key: string, validate?: (raw: unknown) => T | null, fallback?: T): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clearNamespace(): void;
}

const SENSITIVE_KEY_PATTERN = /(token|secret|password|passcode|session|cookie|credential|apikey|privatekey)/i;

function assertSafeKey(key: string): void {
  if (!key || !key.trim()) {
    throw new AppErrorException({ code: "INVALID_STORE_KEY", message: "Storage key must be non-empty." });
  }
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    throw new AppErrorException({
      code: "SENSITIVE_STORAGE_FORBIDDEN",
      message: `Refusing to persist potentially sensitive key "${key}" in browser storage.`,
    });
  }
}

function getNativeStorage(area: StorageArea): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = area === "local" ? window.localStorage : window.sessionStorage;
    const probeKey = "__hiweb_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

/**
 * 创建仅限非敏感客户端状态使用的命名空间存储；
 * SSR 与浏览器隐私模式禁用 Storage 时安全降级至进程内独立内存映射。
 */
export function createBrowserStore(options: BrowserStoreOptions): BrowserStore {
  const namespace = options.namespace.trim();
  if (!namespace) {
    throw new AppErrorException({ code: "INVALID_NAMESPACE", message: "Store namespace must be non-empty." });
  }
  const area = options.area ?? "local";
  const prefix = `${namespace}:`;
  const memory = options.memoryFallback ?? new Map<string, string>();

  const fullKey = (key: string): string => {
    assertSafeKey(key);
    return `${prefix}${key}`;
  };

  return {
    get<T>(key: string, validate?: (raw: unknown) => T | null, fallback?: T): T | null {
      const storageKey = fullKey(key);
      let rawText: string | null = null;
      const storage = getNativeStorage(area);
      if (storage) {
        try {
          rawText = storage.getItem(storageKey);
        } catch {
          rawText = memory.get(storageKey) ?? null;
        }
      } else {
        rawText = memory.get(storageKey) ?? null;
      }

      if (rawText === null) return fallback ?? null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return fallback ?? null;
      }
      if (validate) {
        const checked = validate(parsed);
        return checked === null ? (fallback ?? null) : checked;
      }
      return parsed as T;
    },

    set<T>(key: string, value: T): void {
      const storageKey = fullKey(key);
      const serialized = JSON.stringify(value);
      const storage = getNativeStorage(area);
      if (storage) {
        try {
          storage.setItem(storageKey, serialized);
          return;
        } catch {
          // 浏览器存储配额满或隐私模式拦截时降级写入内存
        }
      }
      memory.set(storageKey, serialized);
    },

    remove(key: string): void {
      const storageKey = fullKey(key);
      memory.delete(storageKey);
      const storage = getNativeStorage(area);
      if (storage) {
        try {
          storage.removeItem(storageKey);
        } catch {
          // ignore
        }
      }
    },

    clearNamespace(): void {
      for (const k of [...memory.keys()]) {
        if (k.startsWith(prefix)) memory.delete(k);
      }
      const storage = getNativeStorage(area);
      if (!storage) return;
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const k = storage.key(i);
          if (k && k.startsWith(prefix)) toRemove.push(k);
        }
        for (const k of toRemove) storage.removeItem(k);
      } catch {
        // ignore
      }
    },
  };
}
