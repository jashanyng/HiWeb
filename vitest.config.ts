import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkgSrc = (name: string) => fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@pcfprio\/hiweb-base\/(.*)$/, replacement: `${pkgSrc("base")}/$1.ts` },
      { find: "@pcfprio/hiweb-base", replacement: `${pkgSrc("base")}/index.ts` },
      { find: /^@pcfprio\/hiweb-core\/(.*)$/, replacement: `${pkgSrc("core")}/$1.ts` },
      { find: "@pcfprio/hiweb-core", replacement: `${pkgSrc("core")}/index.ts` },
      { find: /^@pcfprio\/hiweb-net\/(.*)$/, replacement: `${pkgSrc("net")}/$1.ts` },
      { find: "@pcfprio/hiweb-net", replacement: `${pkgSrc("net")}/index.ts` },
      { find: /^@pcfprio\/hiweb-store\/(.*)$/, replacement: `${pkgSrc("store")}/$1.ts` },
      { find: "@pcfprio/hiweb-store", replacement: `${pkgSrc("store")}/index.ts` },
      { find: /^@pcfprio\/hiweb-suite\/(.*)$/, replacement: `${pkgSrc("suite")}/$1` },
      { find: /^@pcfprio\/hiweb-next\/(.*)$/, replacement: `${pkgSrc("next")}/$1.ts` },
      { find: "@pcfprio/hiweb-contract", replacement: `${pkgSrc("contract")}/index.ts` },
      { find: /^@pcfprio\/hiweb-tooling\/(.*)$/, replacement: `${pkgSrc("tooling")}/$1.ts` },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,mjs}"],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
  },
});
