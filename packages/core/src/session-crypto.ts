import { AppErrorException } from "@pcfprio/hiweb-base/errors";

export interface SessionCipherOptions<T> {
  readonly secret: string;
  readonly keyPrefix: string;
  readonly maxCookieLength?: number;
  readonly validate: (raw: unknown) => T | null;
}

export interface SessionCipher<T> {
  seal(payload: T): Promise<string>;
  open(cookieValue: string | undefined): Promise<T | null>;
  needsRefresh(expiresAtEpochSec: number, thresholdSec?: number, nowEpochSec?: number): boolean;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function needsSessionRefresh(
  expiresAtEpochSec: number,
  thresholdSec = 120,
  nowEpochSec = Math.floor(Date.now() / 1000),
): boolean {
  return expiresAtEpochSec - nowEpochSec < thresholdSec;
}

/** 创建基于 Web Crypto AES-256-GCM 的无状态会话密封器。 */
export function createSessionCipher<T>(options: SessionCipherOptions<T>): SessionCipher<T> {
  if (!options.secret || options.secret.length < 32) {
    throw new AppErrorException({
      code: "WEAK_SESSION_SECRET",
      message: "Session secret must be at least 32 characters.",
    });
  }
  if (!options.keyPrefix || !options.keyPrefix.trim()) {
    throw new AppErrorException({
      code: "INVALID_KEY_PREFIX",
      message: "Session cipher keyPrefix must be non-empty.",
    });
  }
  const maxCookieLength = options.maxCookieLength ?? 4000;
  let cachedKey: Promise<CryptoKey> | undefined;

  const getKey = (): Promise<CryptoKey> => {
    cachedKey ??= crypto.subtle
      .digest("SHA-256", textEncoder.encode(`${options.keyPrefix}:${options.secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    return cachedKey;
  };

  return {
    async seal(payload: T): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = textEncoder.encode(JSON.stringify(payload));
      const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), plaintext);
      return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
    },

    async open(cookieValue: string | undefined): Promise<T | null> {
      if (!cookieValue || cookieValue.length > maxCookieLength) return null;
      const parts = cookieValue.split(".");
      if (parts.length !== 3) return null;
      const [version, ivText, cipherText] = parts;
      if (version !== "v1" || !ivText || !cipherText) return null;

      const ivBytes = fromBase64Url(ivText);
      const cipherBytes = fromBase64Url(cipherText);
      if (!ivBytes || !cipherBytes || ivBytes.length !== 12) return null;

      try {
        const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, await getKey(), cipherBytes);
        const parsed = JSON.parse(textDecoder.decode(plainBuffer)) as unknown;
        return options.validate(parsed);
      } catch {
        return null;
      }
    },

    needsRefresh(expiresAtEpochSec: number, thresholdSec = 120, nowEpochSec?: number): boolean {
      return needsSessionRefresh(expiresAtEpochSec, thresholdSec, nowEpochSec);
    },
  };
}
