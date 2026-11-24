import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkgSrc = (name: string) => fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@jashanyng\/hiweb-base\/(.*)$/, replacement: `${pkgSrc("base")}/$1.ts` },
      { find: "@jashanyng/hiweb-base", replacement: `${pkgSrc("base")}/index.ts` },
      { find: /^@jashanyng\/hiweb-core\/(.*)$/, replacement: `${pkgSrc("core")}/$1.ts` },
      { find: "@jashanyng/hiweb-core", replacement: `${pkgSrc("core")}/index.ts` },
      { find: /^@jashanyng\/hiweb-net\/(.*)$/, replacement: `${pkgSrc("net")}/$1.ts` },
      { find: "@jashanyng/hiweb-net", replacement: `${pkgSrc("net")}/index.ts` },
      { find: /^@jashanyng\/hiweb-store\/(.*)$/, replacement: `${pkgSrc("store")}/$1.ts` },
      { find: "@jashanyng/hiweb-store", replacement: `${pkgSrc("store")}/index.ts` },
      { find: /^@jashanyng\/hiweb-suite\/(.*)$/, replacement: `${pkgSrc("suite")}/$1` },
      { find: /^@jashanyng\/hiweb-next\/(.*)$/, replacement: `${pkgSrc("next")}/$1.ts` },
      { find: "@jashanyng/hiweb-contract", replacement: `${pkgSrc("contract")}/index.ts` },
      { find: /^@jashanyng\/hiweb-tooling\/(.*)$/, replacement: `${pkgSrc("tooling")}/$1.ts` },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,mjs}"],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
  },
});
