import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createBrowserStore } from "./browser-store.js";

describe("createBrowserStore", () => {
  it("支持命名空间隔离、Schema 校验与损坏兜底", () => {
    const storeA = createBrowserStore({ namespace: "app-a" });
    const storeB = createBrowserStore({ namespace: "app-b" });
    const ThemeSchema = z.enum(["light", "dark", "system"]);

    storeA.set("theme", "dark");
    storeB.set("theme", "light");
    expect(storeA.get("theme", (v) => (ThemeSchema.safeParse(v).success ? ThemeSchema.parse(v) : null))).toBe("dark");
    expect(storeB.get("theme")).toBe("light");

    window.localStorage.setItem("app-a:broken", "{bad json");
    expect(storeA.get("broken", undefined, "fallback")).toBe("fallback");

    storeA.clearNamespace();
    expect(storeA.get("theme")).toBeNull();
    expect(storeB.get("theme")).toBe("light");
  });

  it("明确拦截疑似敏感凭据键名", () => {
    const store = createBrowserStore({ namespace: "sec" });
    expect(() => store.set("accessToken", "abc")).toThrow(/sensitive/i);
    expect(() => store.get("sessionSecret")).toThrow(/sensitive/i);
  });

  it("当底层 Storage 抛异常时自动降级到内存映射", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    const store = createBrowserStore({ namespace: "fallback" });
    store.set("sidebarCollapsed", true);
    expect(store.get("sidebarCollapsed")).toBe(true);
  });
});
