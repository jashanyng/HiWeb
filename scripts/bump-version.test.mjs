import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runBumpVersion } from "./bump-version.mjs";
import { checkDepGraph } from "./check-dep-graph.mjs";

const tempDirs = [];

function createTempMonorepo(version = "0.0.1", overrides = {}) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "hiweb-bump-"));
  tempDirs.push(rootDir);

  writeFileSync(
    path.join(rootDir, "package.json"),
    `${JSON.stringify({ name: "hiweb-monorepo", version, private: true }, null, 2)}\n`,
    "utf8",
  );

  const pkgs = {
    base: { name: "@jashanyng/hiweb-base", version },
    core: {
      name: "@jashanyng/hiweb-core",
      version,
      dependencies: { "@jashanyng/hiweb-base": "workspace:*" },
    },
    ...overrides,
  };

  for (const [dirName, pkgJson] of Object.entries(pkgs)) {
    const pkgDir = path.join(rootDir, "packages", dirName);
    mkdirSync(path.join(pkgDir, "src"), { recursive: true });
    writeFileSync(path.join(pkgDir, "package.json"), `${JSON.stringify(pkgJson, null, 2)}\n`, "utf8");
    writeFileSync(path.join(pkgDir, "src", "index.ts"), "export const ok = true;\n", "utf8");
  }

  return rootDir;
}

function readVersion(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8")).version;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("bump-version", () => {
  it("默认允许仅递增 z 并同步更新根与全部子包 package.json", () => {
    const rootDir = createTempMonorepo("0.0.1");
    const logs = [];
    const errors = [];

    const code = runBumpVersion(["--root", rootDir, "0.0.2"], {
      stdout: (msg) => logs.push(msg),
      stderr: (msg) => errors.push(msg),
    });

    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(readVersion(path.join(rootDir, "package.json"))).toBe("0.0.2");
    expect(readVersion(path.join(rootDir, "packages/base/package.json"))).toBe("0.0.2");
    expect(readVersion(path.join(rootDir, "packages/core/package.json"))).toBe("0.0.2");
    expect(checkDepGraph(rootDir).version).toBe("0.0.2");
  });

  it("拒绝非法版本格式及未严格递增的版本，且不改动文件", () => {
    for (const badTarget of ["v0.0.2", "0.0.2-alpha.1", "0.2", "0.0.1", "0.0.0"]) {
      const rootDir = createTempMonorepo("0.0.1");
      const errors = [];
      const code = runBumpVersion(["--root", rootDir, badTarget], {
        stdout: () => {},
        stderr: (msg) => errors.push(msg),
      });

      expect(code).not.toBe(0);
      expect(errors.join("\n")).not.toBe("");
      expect(readVersion(path.join(rootDir, "package.json"))).toBe("0.0.1");
      expect(readVersion(path.join(rootDir, "packages/base/package.json"))).toBe("0.0.1");
    }
  });

  it("未显式传入 --allow-xy-bump 时拒绝修改 x 或 y，传入后允许升版", () => {
    for (const xyTarget of ["0.1.0", "1.0.0"]) {
      const rootDir = createTempMonorepo("0.0.1");
      const errors = [];
      const blockedCode = runBumpVersion(["--root", rootDir, xyTarget], {
        stdout: () => {},
        stderr: (msg) => errors.push(msg),
      });

      expect(blockedCode).not.toBe(0);
      expect(errors.join("\n")).toMatch(/--allow-xy-bump/);
      expect(readVersion(path.join(rootDir, "package.json"))).toBe("0.0.1");
      expect(readVersion(path.join(rootDir, "packages/base/package.json"))).toBe("0.0.1");

      const allowedCode = runBumpVersion(["--root", rootDir, "--allow-xy-bump", xyTarget], {
        stdout: () => {},
        stderr: () => {},
      });
      expect(allowedCode).toBe(0);
      expect(readVersion(path.join(rootDir, "package.json"))).toBe(xyTarget);
      expect(readVersion(path.join(rootDir, "packages/base/package.json"))).toBe(xyTarget);
      expect(readVersion(path.join(rootDir, "packages/core/package.json"))).toBe(xyTarget);
    }
  });

  it("当现有仓库版本不一致时拒绝执行改版", () => {
    const rootDir = createTempMonorepo("0.0.1", {
      core: { name: "@jashanyng/hiweb-core", version: "0.0.2" },
    });
    const code = runBumpVersion(["--root", rootDir, "0.0.3"], {
      stdout: () => {},
      stderr: () => {},
    });

    expect(code).not.toBe(0);
    expect(readVersion(path.join(rootDir, "package.json"))).toBe("0.0.1");
  });

  it("支持通过 CLI 进程运行并按规则返回退出码", () => {
    const rootDir = createTempMonorepo("0.0.1");
    const scriptPath = path.resolve(import.meta.dirname, "bump-version.mjs");

    expect(() =>
      execFileSync("node", [scriptPath, "--root", rootDir, "0.1.0"], { encoding: "utf8", stdio: "pipe" }),
    ).toThrow();
    expect(readVersion(path.join(rootDir, "package.json"))).toBe("0.0.1");

    const out = execFileSync("node", [scriptPath, "--root", rootDir, "0.0.2"], { encoding: "utf8", stdio: "pipe" });
    expect(out).toContain("0.0.2");
    expect(readVersion(path.join(rootDir, "package.json"))).toBe("0.0.2");
  });
});
