import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkDepGraph } from "./check-dep-graph.mjs";

const tempDirs = [];

function makeTempWorkspace(rootVersion, pkgVersions) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "hiweb-dep-graph-"));
  tempDirs.push(rootDir);

  writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "hiweb-monorepo", version: rootVersion, private: true }, null, 2),
    "utf8",
  );

  for (const [dirName, { name, version, dependencies }] of Object.entries(pkgVersions)) {
    const pkgDir = path.join(rootDir, "packages", dirName);
    mkdirSync(path.join(pkgDir, "src"), { recursive: true });
    writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name, version, dependencies }, null, 2), "utf8");
    writeFileSync(path.join(pkgDir, "src", "index.ts"), "export const ok = true;\n", "utf8");
  }

  return rootDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("check-dep-graph", () => {
  it("根与全部子包版本号一致且为裸 x.y.z 时通过", () => {
    const rootDir = makeTempWorkspace("0.0.1", {
      base: { name: "@jashanyng/hiweb-base", version: "0.0.1" },
      core: {
        name: "@jashanyng/hiweb-core",
        version: "0.0.1",
        dependencies: { "@jashanyng/hiweb-base": "workspace:*" },
      },
    });

    const result = checkDepGraph(rootDir);
    expect(result.packageCount).toBe(2);
    expect(result.version).toBe("0.0.1");
  });

  it("拒绝带 v 前缀、预发布后缀或缺失的根/子包版本号", () => {
    for (const badVersion of ["v0.0.1", "0.0.1-alpha.1", "0.1", ""]) {
      const badRoot = makeTempWorkspace(badVersion, {
        base: { name: "@jashanyng/hiweb-base", version: badVersion },
      });
      expect(() => checkDepGraph(badRoot)).toThrow(/裸 x\.y\.z|version/i);

      const badPkg = makeTempWorkspace("0.0.1", {
        base: { name: "@jashanyng/hiweb-base", version: badVersion },
      });
      expect(() => checkDepGraph(badPkg)).toThrow(/裸 x\.y\.z|version/i);
    }
  });

  it("拒绝根 package.json 与子包或子包之间版本号不一致", () => {
    const rootMismatch = makeTempWorkspace("0.0.2", {
      base: { name: "@jashanyng/hiweb-base", version: "0.0.1" },
    });
    expect(() => checkDepGraph(rootMismatch)).toThrow(/一致|version/i);

    const pkgMismatch = makeTempWorkspace("0.0.1", {
      base: { name: "@jashanyng/hiweb-base", version: "0.0.1" },
      core: { name: "@jashanyng/hiweb-core", version: "0.0.2" },
    });
    expect(() => checkDepGraph(pkgMismatch)).toThrow(/一致|version/i);
  });
});
