import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runBumpVersion } from "./bump-version.mjs";
import { checkDepGraph } from "./check-dep-graph.mjs";
import { checkGovernanceDocs } from "./governance-docs.mjs";

const tempDirs = [];

function createTempMonorepo(version = "0.0.1", overrides = {}, options = {}) {
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

  if (options.changelog !== null) {
    const changelogContent =
      options.changelog ?? `# 变更日志（Changelog）\n\n## [Unreleased]\n\n## [${version}]\n\n- 初始基线。\n`;
    writeFileSync(path.join(rootDir, "CHANGELOG.md"), changelogContent, "utf8");
  }

  if (options.compatibility !== null) {
    mkdirSync(path.join(rootDir, "docs"), { recursive: true });
    const compatContent =
      options.compatibility ?? "# 兼容性矩阵与版本契约\n\n## 环境与依赖兼容矩阵\n\n- Node.js >=26\n";
    writeFileSync(path.join(rootDir, "docs", "compatibility.md"), compatContent, "utf8");
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
    expect(checkGovernanceDocs(rootDir, "0.0.2").version).toBe("0.0.2");
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

  it("升版时将 CHANGELOG.md 中 [Unreleased] 非空正文归档到目标版本并保留顶部 [Unreleased]", () => {
    const rootDir = createTempMonorepo(
      "0.0.1",
      {},
      {
        changelog: [
          "# 变更日志（Changelog）",
          "",
          "## [Unreleased]",
          "",
          "### 新增",
          "",
          "- 新增会话续期配置项。",
          "",
          "## [0.0.1]",
          "",
          "- 初始基线。",
          "",
        ].join("\n"),
      },
    );

    const code = runBumpVersion(["--root", rootDir, "0.0.2"], { stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);

    const updated = readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf8");
    expect(updated).toMatch(
      /^## \[Unreleased\]\n\n## \[0\.0\.2\] - \d{4}-\d{2}-\d{2}\n\n### 新增\n\n- 新增会话续期配置项。\n\n## \[0\.0\.1\]/m,
    );
    expect(checkDepGraph(rootDir).version).toBe("0.0.2");
    expect(checkGovernanceDocs(rootDir, "0.0.2").version).toBe("0.0.2");
  });

  it("升版时若 [Unreleased] 为空则填入默认占位说明且归档后通过 checkDepGraph 与 checkGovernanceDocs", () => {
    const rootDir = createTempMonorepo(
      "0.0.1",
      {},
      {
        changelog: "# 变更日志（Changelog）\n\n## [Unreleased]\n\n\n## [0.0.1]\n\n- 初始基线。\n",
      },
    );

    const code = runBumpVersion(["--root", rootDir, "0.0.2"], { stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);

    const updated = readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf8");
    expect(updated).toMatch(
      /^## \[Unreleased\]\n\n## \[0\.0\.2\] - \d{4}-\d{2}-\d{2}\n\n- 版本号对齐（无行为变更）。\n\n## \[0\.0\.1\]/m,
    );
    expect(checkDepGraph(rootDir).version).toBe("0.0.2");
    expect(checkGovernanceDocs(rootDir, "0.0.2").version).toBe("0.0.2");
  });

  it("升版归档时完整保护围栏代码块内含 ## [Unreleased] 与 ## [0.0.2] 的示例文本", () => {
    const rootDir = createTempMonorepo(
      "0.0.1",
      {},
      {
        changelog: [
          "# 变更日志（Changelog）",
          "",
          "## [Unreleased]",
          "",
          "- 文档示例：",
          "",
          "```markdown",
          "## [Unreleased]",
          "",
          "## [0.0.2]",
          "```",
          "",
          "## [0.0.1]",
          "",
          "- 初始基线。",
          "",
        ].join("\n"),
      },
    );

    const code = runBumpVersion(["--root", rootDir, "0.0.2"], { stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);

    const updated = readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf8");
    expect(updated).toContain("```markdown\n## [Unreleased]\n\n## [0.0.2]\n```");
    expect(updated).toMatch(
      /^## \[Unreleased\]\n\n## \[0\.0\.2\] - \d{4}-\d{2}-\d{2}\n\n- 文档示例：\n\n```markdown\n## \[Unreleased\]\n\n## \[0\.0\.2\]\n```\n\n## \[0\.0\.1\]/m,
    );
    expect(checkDepGraph(rootDir).version).toBe("0.0.2");
    expect(checkGovernanceDocs(rootDir, "0.0.2").version).toBe("0.0.2");
  });

  it("缺少根 CHANGELOG.md 或缺少 [Unreleased] 时拒绝升版且不改动 package.json", () => {
    const missingChangelog = createTempMonorepo("0.0.1", {}, { changelog: null });
    const errors1 = [];
    const code1 = runBumpVersion(["--root", missingChangelog, "0.0.2"], {
      stdout: () => {},
      stderr: (msg) => errors1.push(msg),
    });
    expect(code1).not.toBe(0);
    expect(errors1.join("\n")).toMatch(/CHANGELOG\.md/);
    expect(readVersion(path.join(missingChangelog, "package.json"))).toBe("0.0.1");

    const missingUnreleased = createTempMonorepo("0.0.1", {}, { changelog: "# 变更日志（Changelog）\n\n## [0.0.1]\n" });
    const errors2 = [];
    const code2 = runBumpVersion(["--root", missingUnreleased, "0.0.2"], {
      stdout: () => {},
      stderr: (msg) => errors2.push(msg),
    });
    expect(code2).not.toBe(0);
    expect(errors2.join("\n")).toMatch(/Unreleased/);
    expect(readVersion(path.join(missingUnreleased, "package.json"))).toBe("0.0.1");
  });
});
