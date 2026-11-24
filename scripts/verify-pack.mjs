import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "artifacts/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const DEV_ONLY_PACKAGES = new Set(["@jashanyng/hiweb-contract", "@jashanyng/hiweb-tooling"]);

function run(cmd, args, cwd, stdio = "inherit") {
  return execFileSync(cmd, args, { cwd, stdio, encoding: "utf8" });
}

function buildSharedConsumerFiles(consumerDir, pkgSpecs, extraOverrides = {}) {
  const dependencies = {};
  const devDependencies = {};
  for (const [name, ref] of Object.entries(pkgSpecs)) {
    if (DEV_ONLY_PACKAGES.has(name)) devDependencies[name] = ref;
    else dependencies[name] = ref;
  }

  const consumerPkg = {
    name: "hiweb-consumer-smoke",
    version: "0.0.0",
    private: true,
    type: "module",
    packageManager: rootPkg.packageManager,
    dependencies: {
      ...dependencies,
      "@base-ui/react": rootPkg.devDependencies["@base-ui/react"],
      "class-variance-authority": rootPkg.devDependencies["class-variance-authority"],
      clsx: rootPkg.devDependencies.clsx,
      "lucide-react": rootPkg.devDependencies["lucide-react"],
      next: rootPkg.devDependencies.next,
      react: rootPkg.devDependencies.react,
      "react-dom": rootPkg.devDependencies["react-dom"],
      "server-only": rootPkg.devDependencies["server-only"],
      sonner: rootPkg.devDependencies.sonner,
      "tailwind-merge": rootPkg.devDependencies["tailwind-merge"],
      tailwindcss: rootPkg.devDependencies.tailwindcss,
      "tw-animate-css": rootPkg.devDependencies["tw-animate-css"],
      zod: rootPkg.devDependencies.zod,
    },
    devDependencies: {
      ...devDependencies,
      "@tailwindcss/postcss": rootPkg.devDependencies["@tailwindcss/postcss"],
      "@types/node": rootPkg.devDependencies["@types/node"],
      "@types/react": rootPkg.devDependencies["@types/react"],
      "@types/react-dom": rootPkg.devDependencies["@types/react-dom"],
      "@vitejs/plugin-react": rootPkg.devDependencies["@vitejs/plugin-react"],
      typescript: rootPkg.devDependencies.typescript,
      vite: rootPkg.devDependencies.vite,
    },
    ...extraOverrides,
  };

  writeFileSync(path.join(consumerDir, "package.json"), `${JSON.stringify(consumerPkg, null, 2)}\n`);
  writeFileSync(
    path.join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      },
      null,
      2,
    ),
  );

  mkdirSync(path.join(consumerDir, "src"), { recursive: true });
  writeFileSync(path.join(consumerDir, "src/vite-env.d.ts"), `/// <reference types="vite/client" />\n`);
  writeFileSync(
    path.join(consumerDir, "src/styles.css"),
    `@import "tailwindcss";\n@import "tw-animate-css";\n@import "@jashanyng/hiweb-suite/tokens.css";\n`,
  );
  writeFileSync(
    path.join(consumerDir, "src/index.html"),
    `<!doctype html><html><head><script type="module" src="/src/app.tsx"></script></head><body><div id="root"></div></body></html>\n`,
  );
  writeFileSync(
    path.join(consumerDir, "src/app.tsx"),
    `import "./styles.css";
import { createLogger } from "@jashanyng/hiweb-base/logger";
import { sanitizeNextPath } from "@jashanyng/hiweb-core/url";
import { createBrowserApiClient } from "@jashanyng/hiweb-net/browser-client";
import { createBrowserStore } from "@jashanyng/hiweb-store/browser-store";
import { Button } from "@jashanyng/hiweb-suite/button";
import { Checkbox } from "@jashanyng/hiweb-suite/checkbox";
import { ConfirmDialog } from "@jashanyng/hiweb-suite/confirm-dialog";
import { SuiteAppShell } from "@jashanyng/hiweb-suite/shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@jashanyng/hiweb-suite/table";
import { SuiteThemeToggle, ThemeProvider } from "@jashanyng/hiweb-suite/theme";

const logger = createLogger({ service: "smoke" });
logger.info("boot", { next: sanitizeNextPath("/ok") });
void createBrowserApiClient();
void createBrowserStore({ namespace: "smoke" });

export function Demo() {
  return (
    <ThemeProvider namespace="smoke">
      <SuiteAppShell currentPath="/" brand={<span>Brand</span>} navItems={[{ key: "h", href: "/", label: "Home" }]} headerRight={<SuiteThemeToggle />}>
        <Button>HiWeb</Button>
        <Checkbox checked={false} onCheckedChange={() => {}} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Row</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <ConfirmDialog open={false} onOpenChange={() => {}} title="Confirm" onConfirm={() => {}} />
      </SuiteAppShell>
    </ThemeProvider>
  );
}
`,
  );
  writeFileSync(
    path.join(consumerDir, "src/server-check.ts"),
    `import { createExpiredSessionRedirect } from "@jashanyng/hiweb-next/bff";
import { applySecurityHeaders, buildSecurityHeaders } from "@jashanyng/hiweb-next/headers";
import { createSessionProxyHandler } from "@jashanyng/hiweb-next/proxy";
import { runServerPageQuery } from "@jashanyng/hiweb-next/rsc";
import { parseOpenApiDocument } from "@jashanyng/hiweb-contract";
import { createCodeQualityRules, createLayeredImportRestrictions } from "@jashanyng/hiweb-tooling/eslint";

void [
  createExpiredSessionRedirect,
  applySecurityHeaders,
  buildSecurityHeaders,
  createSessionProxyHandler,
  runServerPageQuery,
  parseOpenApiDocument,
  createLayeredImportRestrictions,
  createCodeQualityRules,
];
`,
  );
  writeFileSync(
    path.join(consumerDir, "vite.config.mjs"),
    `import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
export default {
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: "dist", rollupOptions: { input: "src/app.tsx" } },
};
`,
  );
  writeFileSync(
    path.join(consumerDir, "runtime-smoke.mjs"),
    `import assert from "node:assert/strict";
import { createLogger } from "@jashanyng/hiweb-base/logger";
import { createSessionCipher } from "@jashanyng/hiweb-core/session-crypto";
import { sanitizeNextPath } from "@jashanyng/hiweb-core/url";
import { createStandardEnvelopeDecoder } from "@jashanyng/hiweb-net/envelope";
import { buildSecurityHeaders } from "@jashanyng/hiweb-next/headers";
import { createBrowserStore } from "@jashanyng/hiweb-store/browser-store";
import { createThemeInitScript } from "@jashanyng/hiweb-suite/theme-script";
import { parseOpenApiDocument } from "@jashanyng/hiweb-contract";
import { createCodeQualityRules, createLayeredImportRestrictions } from "@jashanyng/hiweb-tooling/eslint";
import { createPrettierPreset } from "@jashanyng/hiweb-tooling/prettier";

const lines = [];
createLogger({ service: "smoke", sink: (_e, s) => lines.push(s) }).info("ok", { token: "abc" });
assert.equal(JSON.parse(lines[0]).token, "[REDACTED]");

const cipher = createSessionCipher({ secret: "0123456789abcdef0123456789abcdef", keyPrefix: "s", validate: (r) => r });
const sealed = await cipher.seal({ user: "u1" });
assert.deepEqual(await cipher.open(sealed), { user: "u1" });
assert.equal(sanitizeNextPath("https://evil.com"), "/");
assert.equal(createStandardEnvelopeDecoder().decode(200, true, { code: 200, message: "ok", data: 1 }, "err").ok, true);
assert.equal(buildSecurityHeaders()["content-security-policy"], "frame-ancestors 'none'");
const store = createBrowserStore({ namespace: "smoke" });
store.set("k", 123);
assert.equal(store.get("k"), 123);
assert.ok(createThemeInitScript({ namespace: "smoke" }).includes("smoke:theme"));
assert.ok(parseOpenApiDocument("openapi: 3.1.0\\npaths: {}").paths);
assert.ok(createLayeredImportRestrictions().length >= 8);
assert.equal(createCodeQualityRules()[0].rules["max-lines"][1].max, 400);
assert.equal(createPrettierPreset().printWidth, 120);
console.log("runtime-smoke: ok");
`,
  );
}

function assertBuiltArtifactsInConsumer(consumerDir) {
  for (const clientFile of ["dialog.js", "confirm-dialog.js", "checkbox.js"]) {
    const dist = readFileSync(path.join(consumerDir, "node_modules/@jashanyng/hiweb-suite/dist", clientFile), "utf8");
    if (!dist.startsWith('"use client";') && !dist.startsWith("'use client';")) {
      throw new Error(`${clientFile} lost leading 'use client' directive`);
    }
  }
  const bffDist = readFileSync(path.join(consumerDir, "node_modules/@jashanyng/hiweb-next/dist/bff.js"), "utf8");
  if (!bffDist.startsWith('import "server-only";')) {
    throw new Error("bff.js lost leading import 'server-only'");
  }
  const tokensDist = readFileSync(
    path.join(consumerDir, "node_modules/@jashanyng/hiweb-suite/dist/tokens.css"),
    "utf8",
  );
  if (!tokensDist.includes('@source "./";')) {
    throw new Error("tokens.css missing @source directive");
  }

  run("./node_modules/.bin/tsc", ["--noEmit"], consumerDir);
  run("node", ["runtime-smoke.mjs"], consumerDir);
  run("./node_modules/.bin/vite", ["build", "--config", "vite.config.mjs"], consumerDir);

  const distAssets = path.join(consumerDir, "dist/assets");
  const cssFile = readdirSync(distAssets).find((f) => f.endsWith(".css"));
  if (!cssFile) throw new Error("Vite build produced no CSS bundle");
  const cssOut = readFileSync(path.join(distAssets, cssFile), "utf8");
  if (!cssOut.includes("--primary") || !cssOut.includes(".bg-primary") || !cssOut.includes(".rounded-xl")) {
    throw new Error("Tailwind v4 did not compile tokens or suite utility classes");
  }
}

function verifyPnpmConsumerWithGuard() {
  const sandboxDir = mkdtempSync(path.join(os.tmpdir(), "hiweb-pnpm-smoke-"));
  try {
    const fakeHiwebDir = path.join(sandboxDir, "HiWeb");
    mkdirSync(path.join(fakeHiwebDir, "scripts"), { recursive: true });
    cpSync(path.join(root, "artifacts"), path.join(fakeHiwebDir, "artifacts"), { recursive: true });
    cpSync(path.join(root, "scripts/hiweb-guard.mjs"), path.join(fakeHiwebDir, "scripts/hiweb-guard.mjs"));
    for (const pkgDirName of readdirSync(path.join(root, "packages"))) {
      const srcPkgJson = path.join(root, "packages", pkgDirName, "package.json");
      if (!existsSync(srcPkgJson)) continue;
      mkdirSync(path.join(fakeHiwebDir, "packages", pkgDirName), { recursive: true });
      cpSync(srcPkgJson, path.join(fakeHiwebDir, "packages", pkgDirName, "package.json"));
    }
    run("git", ["init", "-b", "dev"], fakeHiwebDir, "pipe");
    run("git", ["config", "user.name", "Smoke"], fakeHiwebDir, "pipe");
    run("git", ["config", "user.email", "smoke@example.com"], fakeHiwebDir, "pipe");
    run("git", ["add", "."], fakeHiwebDir, "pipe");
    run("git", ["commit", "-m", "init"], fakeHiwebDir, "pipe");

    const consumerDir = path.join(sandboxDir, "pnpm-consumer");
    mkdirSync(path.join(consumerDir, "scripts"), { recursive: true });
    cpSync(path.join(root, "scripts/hiweb-guard.mjs"), path.join(consumerDir, "scripts/hiweb-guard.mjs"));
    writeFileSync(path.join(consumerDir, ".gitignore"), "node_modules/\ndist/\n", "utf8");

    const pkgSpecs = {};
    for (const name of Object.keys(manifest.packages)) {
      pkgSpecs[name] = "file:./vendor/hiweb/placeholder.tgz";
    }
    buildSharedConsumerFiles(consumerDir, pkgSpecs);
    writeFileSync(
      path.join(consumerDir, "pnpm-workspace.yaml"),
      `saveExact: true\nminimumReleaseAge: 1440\noverrides:\n  react: "${rootPkg.devDependencies.react}"\n`,
      "utf8",
    );

    run("git", ["init", "-b", "dev"], consumerDir, "pipe");
    run("git", ["config", "user.name", "Smoke"], consumerDir, "pipe");
    run("git", ["config", "user.email", "smoke@example.com"], consumerDir, "pipe");
    run("git", ["add", "."], consumerDir, "pipe");
    run("git", ["commit", "-m", "init consumer"], consumerDir, "pipe");

    // 1. hiweb-guard --sync 同步权威脚本、.tgz、hiweb.lock.json 与 pnpm-workspace.yaml#overrides
    run("node", ["scripts/hiweb-guard.mjs", "--sync"], consumerDir);
    // 2. pnpm install 生成 pnpm-lock.yaml 并校验本地离线安装
    run("pnpm", ["install", "--prefer-offline", "--ignore-scripts"], consumerDir);
    // 3. 有同级 HiWeb 时校验通过
    run("node", ["scripts/hiweb-guard.mjs", "--verify"], consumerDir);

    run("git", ["add", "."], consumerDir, "pipe");
    run("git", ["commit", "-m", "synced hiweb"], consumerDir, "pipe");

    // 4. 嵌套 linked worktree 环境下自动回落解析主工作区同级 HiWeb 校验通过
    const nestedDir = path.join(sandboxDir, "nested");
    mkdirSync(nestedDir, { recursive: true });
    const wtDir = path.join(nestedDir, "wt-consumer");
    run("git", ["worktree", "add", "-b", "feat/smoke", wtDir], consumerDir, "pipe");
    run("node", ["scripts/hiweb-guard.mjs", "--verify"], wtDir);

    // 5. 移除同级 HiWeb 后执行单仓离线校验与 frozen-lockfile 安装
    rmSync(fakeHiwebDir, { recursive: true, force: true });
    run("node", ["scripts/hiweb-guard.mjs", "--verify"], consumerDir);
    run("pnpm", ["install", "--frozen-lockfile", "--offline", "--ignore-scripts"], consumerDir);

    assertBuiltArtifactsInConsumer(consumerDir);
  } finally {
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

function verifyNpmConsumer() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "hiweb-npm-smoke-"));
  try {
    const pkgSpecs = {};
    const overrides = {};
    for (const [name, info] of Object.entries(manifest.packages)) {
      const absTgz = path.join(root, "artifacts/tgz", info.tarball);
      if (!existsSync(absTgz)) throw new Error(`Missing tarball: ${absTgz}`);
      const fileRef = `file:${absTgz}`;
      pkgSpecs[name] = fileRef;
      overrides[name] = fileRef;
    }

    buildSharedConsumerFiles(tempDir, pkgSpecs, { overrides });
    run("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"], tempDir, "pipe");
    assertBuiltArtifactsInConsumer(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

verifyPnpmConsumerWithGuard();
verifyNpmConsumer();
console.log("verify-pack: ok (pnpm + hiweb-guard + npm consumers, tsc, directives, and Vite + Tailwind v4 verified)");
