import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveDefaultHiwebDir, syncHiweb, verifyHiweb } from "./hiweb-guard.mjs";

const tempDirs = [];

function makeTempDir(prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sha512(content) {
  return `sha512-${createHash("sha512").update(content).digest("base64")}`;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function initGitRepo(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  git(dir, ["init", "-b", "dev"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
}

function createFakeHiwebFixture(baseDir) {
  const hiwebDir = path.join(baseDir, "HiWeb");
  const guardSourcePath = path.resolve(import.meta.dirname, "hiweb-guard.mjs");
  const guardContent = existsSync(guardSourcePath) ? readFileSync(guardSourcePath, "utf8") : "// placeholder";

  const pkgContents = {
    "jashanyng-hiweb-base-0.1.0.tgz": "fake-tgz-base",
    "jashanyng-hiweb-store-0.1.0.tgz": "fake-tgz-store",
    "jashanyng-hiweb-suite-0.1.0.tgz": "fake-tgz-suite",
    "jashanyng-hiweb-tooling-0.1.0.tgz": "fake-tgz-tooling",
    "jashanyng-hiweb-contract-0.1.0.tgz": "fake-tgz-contract",
  };

  const manifest = {
    guard: {
      file: "scripts/hiweb-guard.mjs",
      sha256: sha256(guardContent),
    },
    packages: {
      "@jashanyng/hiweb-base": {
        version: "0.1.0",
        tarball: "jashanyng-hiweb-base-0.1.0.tgz",
        sha256: sha256(pkgContents["jashanyng-hiweb-base-0.1.0.tgz"]),
      },
      "@jashanyng/hiweb-store": {
        version: "0.1.0",
        tarball: "jashanyng-hiweb-store-0.1.0.tgz",
        sha256: sha256(pkgContents["jashanyng-hiweb-store-0.1.0.tgz"]),
      },
      "@jashanyng/hiweb-suite": {
        version: "0.1.0",
        tarball: "jashanyng-hiweb-suite-0.1.0.tgz",
        sha256: sha256(pkgContents["jashanyng-hiweb-suite-0.1.0.tgz"]),
      },
      "@jashanyng/hiweb-tooling": {
        version: "0.1.0",
        tarball: "jashanyng-hiweb-tooling-0.1.0.tgz",
        sha256: sha256(pkgContents["jashanyng-hiweb-tooling-0.1.0.tgz"]),
      },
      "@jashanyng/hiweb-contract": {
        version: "0.1.0",
        tarball: "jashanyng-hiweb-contract-0.1.0.tgz",
        sha256: sha256(pkgContents["jashanyng-hiweb-contract-0.1.0.tgz"]),
      },
    },
  };

  const files = {
    "scripts/hiweb-guard.mjs": guardContent,
    "artifacts/manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "packages/base/package.json": JSON.stringify({ name: "@jashanyng/hiweb-base", version: "0.1.0" }),
    "packages/store/package.json": JSON.stringify({
      name: "@jashanyng/hiweb-store",
      version: "0.1.0",
      dependencies: { "@jashanyng/hiweb-base": "workspace:*" },
    }),
    "packages/suite/package.json": JSON.stringify({
      name: "@jashanyng/hiweb-suite",
      version: "0.1.0",
      dependencies: { "@jashanyng/hiweb-base": "workspace:*", "@jashanyng/hiweb-store": "workspace:*" },
    }),
    "packages/tooling/package.json": JSON.stringify({ name: "@jashanyng/hiweb-tooling", version: "0.1.0" }),
    "packages/contract/package.json": JSON.stringify({ name: "@jashanyng/hiweb-contract", version: "0.1.0" }),
  };

  for (const [tarball, content] of Object.entries(pkgContents)) {
    files[`artifacts/tgz/${tarball}`] = content;
  }

  initGitRepo(hiwebDir, files);
  const commitSha = git(hiwebDir, ["rev-parse", "HEAD"]);
  return { hiwebDir, commitSha, pkgContents };
}

function writeFakePnpmLock(consumerDir, packages) {
  const overrideLines = Object.entries(packages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, tarball]) => `  '${name}': file:./vendor/hiweb/${tarball}`)
    .join("\n");
  const pkgBlocks = Object.entries(packages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, tarball]) => {
      const tgzContent = readFileSync(path.join(consumerDir, "vendor/hiweb", tarball));
      return [
        `  '${name}@file:vendor/hiweb/${tarball}':`,
        `    resolution: {integrity: ${sha512(tgzContent)}, tarball: file:vendor/hiweb/${tarball}}`,
        `    version: 0.1.0`,
      ].join("\n");
    })
    .join("\n\n");

  const yaml = [
    `---`,
    `lockfileVersion: '9.0'`,
    ``,
    `importers:`,
    `  .:`,
    `    packageManagerDependencies:`,
    `      pnpm:`,
    `        specifier: 12.21.0`,
    `        version: 12.21.0`,
    ``,
    `packages:`,
    `  '@pnpm/exe.linux-x64@12.21.0':`,
    `    resolution: {integrity: sha512-dummy}`,
    `---`,
    `lockfileVersion: '9.0'`,
    ``,
    `overrides:`,
    overrideLines,
    ``,
    `packages:`,
    ``,
    pkgBlocks,
    ``,
  ].join("\n");
  writeFileSync(path.join(consumerDir, "pnpm-lock.yaml"), yaml, "utf8");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("hiweb-guard", () => {
  it("--sync 按实际依赖传递闭包同步、生成统一 schemaVersion=1 锁并保留 pnpm-workspace.yaml 既有配置", () => {
    const baseDir = makeTempDir("hiweb-guard-sync-");
    const { hiwebDir, commitSha } = createFakeHiwebFixture(baseDir);
    const consumerDir = path.join(baseDir, "AppConsumer");
    mkdirSync(consumerDir, { recursive: true });

    writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "app-consumer",
          private: true,
          dependencies: {
            "@jashanyng/hiweb-suite": "file:./vendor/hiweb/old.tgz",
            react: "19.3.1",
          },
          devDependencies: {
            "@jashanyng/hiweb-tooling": "file:./vendor/hiweb/old-tooling.tgz",
          },
          overrides: {
            "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      path.join(consumerDir, "pnpm-workspace.yaml"),
      `saveExact: true\nminimumReleaseAge: 1440\nallowBuilds:\n  "@swc/core": false\noverrides:\n  react: "19.3.1"\n  "@jashanyng/hiweb-contract": "file:./vendor/hiweb/stale.tgz"\n`,
      "utf8",
    );

    mkdirSync(path.join(consumerDir, "vendor/hiweb"), { recursive: true });
    writeFileSync(path.join(consumerDir, "vendor/hiweb/stale.tgz"), "old", "utf8");

    const lock = syncHiweb({ rootDir: consumerDir, hiwebDir });

    expect(lock.schemaVersion).toBe(1);
    expect(lock.commitSha).toBe(commitSha);
    expect("commit" in lock).toBe(false);

    // 传递闭包包含 suite, store, base, tooling，不包含未引用的 contract
    expect(Object.keys(lock.packages).sort()).toEqual([
      "@jashanyng/hiweb-base",
      "@jashanyng/hiweb-store",
      "@jashanyng/hiweb-suite",
      "@jashanyng/hiweb-tooling",
    ]);
    for (const entry of Object.values(lock.packages)) {
      expect("path" in entry).toBe(false);
    }

    // 过期 tgz 已清理
    expect(existsSync(path.join(consumerDir, "vendor/hiweb/stale.tgz"))).toBe(false);
    // 权威脚本已同步
    expect(sha256(readFileSync(path.join(consumerDir, "scripts/hiweb-guard.mjs")))).toBe(
      sha256(readFileSync(path.join(hiwebDir, "scripts/hiweb-guard.mjs"))),
    );

    // package.json 中旧 overrides 已移除，直接依赖已更新
    const updatedPkg = JSON.parse(readFileSync(path.join(consumerDir, "package.json"), "utf8"));
    expect(updatedPkg.overrides).toBeUndefined();
    expect(updatedPkg.dependencies["@jashanyng/hiweb-suite"]).toBe(
      "file:./vendor/hiweb/jashanyng-hiweb-suite-0.1.0.tgz",
    );
    expect(updatedPkg.devDependencies["@jashanyng/hiweb-tooling"]).toBe(
      "file:./vendor/hiweb/jashanyng-hiweb-tooling-0.1.0.tgz",
    );

    // pnpm-workspace.yaml 保留原有配置与非 hiweb overrides
    const workspaceYaml = readFileSync(path.join(consumerDir, "pnpm-workspace.yaml"), "utf8");
    expect(workspaceYaml).toContain("saveExact: true");
    expect(workspaceYaml).toContain("minimumReleaseAge: 1440");
    expect(workspaceYaml).toContain('"@swc/core": false');
    expect(workspaceYaml).toContain('react: "19.3.1"');
    expect(workspaceYaml).not.toContain("@jashanyng/hiweb-contract");

    // 写入合法 pnpm-lock.yaml 后 verify 通过
    writeFakePnpmLock(consumerDir, {
      "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz",
      "@jashanyng/hiweb-store": "jashanyng-hiweb-store-0.1.0.tgz",
      "@jashanyng/hiweb-suite": "jashanyng-hiweb-suite-0.1.0.tgz",
      "@jashanyng/hiweb-tooling": "jashanyng-hiweb-tooling-0.1.0.tgz",
    });

    const verified = verifyHiweb({ rootDir: consumerDir, hiwebDir });
    expect(verified.commitSha).toBe(commitSha);
  });

  it("--verify 阻断 tgz 篡改、guard 副本分叉、残余 package-lock.json 及远端 URL", () => {
    const baseDir = makeTempDir("hiweb-guard-verify-");
    const { hiwebDir } = createFakeHiwebFixture(baseDir);
    const consumerDir = path.join(baseDir, "AppConsumer");
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify({
        name: "app-consumer",
        private: true,
        dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
      }),
      "utf8",
    );
    writeFileSync(path.join(consumerDir, "pnpm-workspace.yaml"), "saveExact: true\n", "utf8");
    syncHiweb({ rootDir: consumerDir, hiwebDir });
    writeFakePnpmLock(consumerDir, { "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz" });

    // 1. guard 副本被篡改 -> 阻断
    const consumerGuard = path.join(consumerDir, "scripts/hiweb-guard.mjs");
    const originalGuard = readFileSync(consumerGuard, "utf8");
    writeFileSync(consumerGuard, `${originalGuard}\n// drifted\n`, "utf8");
    expect(() => verifyHiweb({ rootDir: consumerDir, hiwebDir })).toThrow(/一致|同步/);
    writeFileSync(consumerGuard, originalGuard, "utf8");

    // 2. 残余 package-lock.json -> 阻断
    writeFileSync(path.join(consumerDir, "package-lock.json"), "{}", "utf8");
    expect(() => verifyHiweb({ rootDir: consumerDir, hiwebDir })).toThrow(/package-lock\.json/);
    rmSync(path.join(consumerDir, "package-lock.json"));

    // 3. tgz 篡改 -> 阻断
    const tgzPath = path.join(consumerDir, "vendor/hiweb/jashanyng-hiweb-base-0.1.0.tgz");
    const origTgz = readFileSync(tgzPath);
    writeFileSync(tgzPath, "tampered", "utf8");
    expect(() => verifyHiweb({ rootDir: consumerDir, hiwebDir })).toThrow(/SHA-256/);
    writeFileSync(tgzPath, origTgz);

    // 4. 移除同级 HiWeb 后单仓离线 verify 通过，且 --require-remote 不抛 ReferenceError
    rmSync(hiwebDir, { recursive: true, force: true });
    expect(verifyHiweb({ rootDir: consumerDir, hiwebDir }).commitSha).toBeTruthy();
    expect(() => verifyHiweb({ rootDir: consumerDir, hiwebDir, requireRemote: true })).toThrow(/远端|HiWeb|无法/);
  });

  it("拒绝带 v 前缀或预发布后缀的非法包版本（v0.1.0 / 0.1.0-alpha.1）", () => {
    for (const invalidVersion of ["v0.1.0", "0.1.0-alpha.1"]) {
      const baseDir = makeTempDir("hiweb-guard-semver-");
      const { hiwebDir } = createFakeHiwebFixture(baseDir);
      const consumerDir = path.join(baseDir, "AppConsumer");
      mkdirSync(consumerDir, { recursive: true });
      writeFileSync(
        path.join(consumerDir, "package.json"),
        JSON.stringify({
          name: "app-consumer",
          private: true,
          dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
        }),
        "utf8",
      );
      writeFileSync(path.join(consumerDir, "pnpm-workspace.yaml"), "saveExact: true\n", "utf8");
      syncHiweb({ rootDir: consumerDir, hiwebDir });
      writeFakePnpmLock(consumerDir, { "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz" });

      // 1. hiweb.lock.json 中含非法 version -> verifyHiweb 拒绝
      const lockPath = path.join(consumerDir, "hiweb.lock.json");
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      const origLockText = readFileSync(lockPath, "utf8");
      lock.packages["@jashanyng/hiweb-base"].version = invalidVersion;
      writeFileSync(lockPath, JSON.stringify(lock, null, 2), "utf8");
      expect(() => verifyHiweb({ rootDir: consumerDir, hiwebDir })).toThrow(/裸 x\.y\.z|version/i);
      writeFileSync(lockPath, origLockText, "utf8");

      // 2. manifest.json 中含非法 version -> syncHiweb 拒绝
      const manifestPath = path.join(hiwebDir, "artifacts/manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.packages["@jashanyng/hiweb-base"].version = invalidVersion;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      git(hiwebDir, ["add", "artifacts/manifest.json"]);
      git(hiwebDir, ["commit", "-m", `invalid version ${invalidVersion}`]);
      expect(() => syncHiweb({ rootDir: consumerDir, hiwebDir })).toThrow(/裸 x\.y\.z|version/i);
    }
  });

  it("支持 .git linked worktree 自动回落解析主工作区同级 HiWeb 目录", () => {
    const baseDir = makeTempDir("hiweb-guard-wt-");
    const { hiwebDir, commitSha } = createFakeHiwebFixture(baseDir);

    // 主工作区与一个嵌套在其它目录下的 linked worktree（直接父目录没有 HiWeb）
    const mainConsumer = path.join(baseDir, "MainConsumer");
    initGitRepo(mainConsumer, {
      "package.json": JSON.stringify({
        name: "main-consumer",
        private: true,
        dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
      }),
      "pnpm-workspace.yaml": "saveExact: true\n",
    });

    const nestedParent = path.join(baseDir, "isolated-worktrees");
    mkdirSync(nestedParent, { recursive: true });
    const wtDir = path.join(nestedParent, "wt-feature");
    git(mainConsumer, ["worktree", "add", "-b", "feat/wt", wtDir]);

    // 未显式传 hiwebDir，从嵌套 worktree 应回落解析到 baseDir/HiWeb
    const resolved = resolveDefaultHiwebDir(wtDir);
    expect(realpathSync(resolved)).toBe(realpathSync(hiwebDir));

    const lock = syncHiweb({ rootDir: wtDir });
    expect(lock.commitSha).toBe(commitSha);
    writeFakePnpmLock(wtDir, { "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz" });
    expect(verifyHiweb({ rootDir: wtDir }).commitSha).toBe(commitSha);
  });

  it("支持多端单仓一级及深层子目录通过 Git 仓库根父目录定位同级 HiWeb", () => {
    const baseDir = makeTempDir("hiweb-guard-monorepo-");
    const { hiwebDir, commitSha } = createFakeHiwebFixture(baseDir);

    const monorepoDir = path.join(baseDir, "Monorepo");
    initGitRepo(monorepoDir, {
      "console/package.json": JSON.stringify({
        name: "monorepo-console",
        private: true,
        dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
      }),
      "console/pnpm-workspace.yaml": "saveExact: true\n",
      "apps/web/package.json": JSON.stringify({
        name: "monorepo-apps-web",
        private: true,
        dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
      }),
    });

    const consoleDir = path.join(monorepoDir, "console");
    const deepWebDir = path.join(monorepoDir, "apps", "web");

    expect(realpathSync(resolveDefaultHiwebDir(consoleDir))).toBe(realpathSync(hiwebDir));
    expect(realpathSync(resolveDefaultHiwebDir(deepWebDir))).toBe(realpathSync(hiwebDir));

    const lock = syncHiweb({ rootDir: consoleDir });
    expect(lock.commitSha).toBe(commitSha);
    writeFakePnpmLock(consoleDir, { "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz" });
    expect(verifyHiweb({ rootDir: consoleDir }).commitSha).toBe(commitSha);

    // 验证 HIWEB_DIR 显式覆盖优先级高于 Git 根定位
    const overrideDir = path.join(baseDir, "CustomHiWeb");
    mkdirSync(overrideDir, { recursive: true });
    const prevEnv = process.env.HIWEB_DIR;
    process.env.HIWEB_DIR = "../../CustomHiWeb";
    try {
      expect(realpathSync(resolveDefaultHiwebDir(consoleDir))).toBe(realpathSync(overrideDir));
    } finally {
      if (prevEnv === undefined) delete process.env.HIWEB_DIR;
      else process.env.HIWEB_DIR = prevEnv;
    }
  });

  it("支持多端单仓 linked worktree 下子目录回落定位至主仓父目录的 HiWeb", () => {
    const baseDir = makeTempDir("hiweb-guard-mono-wt-");
    const { hiwebDir, commitSha } = createFakeHiwebFixture(baseDir);

    const mainMonorepo = path.join(baseDir, "MainMonorepo");
    initGitRepo(mainMonorepo, {
      "console/package.json": JSON.stringify({
        name: "monorepo-console",
        private: true,
        dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
      }),
      "console/pnpm-workspace.yaml": "saveExact: true\n",
    });

    const nestedParent = path.join(baseDir, "isolated-worktrees");
    mkdirSync(nestedParent, { recursive: true });
    const wtMonorepo = path.join(nestedParent, "wt-monorepo");
    git(mainMonorepo, ["worktree", "add", "-b", "feat/mono-wt", wtMonorepo]);

    const wtConsoleDir = path.join(wtMonorepo, "console");
    expect(realpathSync(resolveDefaultHiwebDir(wtConsoleDir))).toBe(realpathSync(hiwebDir));

    const lock = syncHiweb({ rootDir: wtConsoleDir });
    expect(lock.commitSha).toBe(commitSha);
    writeFakePnpmLock(wtConsoleDir, { "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz" });
    expect(verifyHiweb({ rootDir: wtConsoleDir }).commitSha).toBe(commitSha);
  });

  it("无同级 HiWeb 时按 Git 根父目录或直接同级路径回退并正常进入离线校验", () => {
    const baseDir = makeTempDir("hiweb-guard-fallback-");
    const { hiwebDir, commitSha } = createFakeHiwebFixture(baseDir);

    const monorepoDir = path.join(baseDir, "Monorepo");
    initGitRepo(monorepoDir, {
      "console/package.json": JSON.stringify({
        name: "monorepo-console",
        private: true,
        dependencies: { "@jashanyng/hiweb-base": "file:./vendor/hiweb/old.tgz" },
      }),
      "console/pnpm-workspace.yaml": "saveExact: true\n",
    });

    const consoleDir = path.join(monorepoDir, "console");
    syncHiweb({ rootDir: consoleDir });
    writeFakePnpmLock(consoleDir, { "@jashanyng/hiweb-base": "jashanyng-hiweb-base-0.1.0.tgz" });

    // 删除同级 HiWeb 模拟云端单仓 CI 环境
    rmSync(hiwebDir, { recursive: true, force: true });

    const resolvedMonoFallback = resolveDefaultHiwebDir(consoleDir);
    expect(resolvedMonoFallback).toBe(path.join(realpathSync(baseDir), "HiWeb"));
    expect(verifyHiweb({ rootDir: consoleDir }).commitSha).toBe(commitSha);

    // 无 .git 测试目录且无同级 HiWeb 时回退到 directSibling（../HiWeb）
    const nonGitDir = path.join(baseDir, "PlainConsumer");
    mkdirSync(nonGitDir, { recursive: true });
    expect(resolveDefaultHiwebDir(nonGitDir)).toBe(path.resolve(nonGitDir, "../HiWeb"));
  });
});
