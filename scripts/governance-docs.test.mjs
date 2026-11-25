import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { archiveChangelog, checkGovernanceDocs, maskFencedCodeBlocks } from "./governance-docs.mjs";

const tempDirs = [];

function makeGovernanceWorkspace(options = {}) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "hiweb-governance-"));
  tempDirs.push(rootDir);

  if (options.changelog !== null) {
    const changelogContent =
      options.changelog ?? `# 变更日志（Changelog）\n\n## [Unreleased]\n\n## [0.0.1]\n\n- 初始基线。\n`;
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

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("maskFencedCodeBlocks", () => {
  it("等长遮蔽反引号与波浪线围栏代码块并保留换行位置", () => {
    const input = [
      "# 标题",
      "```markdown",
      "## [Unreleased]",
      "## [0.0.2]",
      "```",
      "正文内容",
      "   ~~~md",
      "## [Unreleased]",
      "~~~",
      "结尾",
    ].join("\r\n");

    const normalized = input.replace(/\r\n/g, "\n");
    const masked = maskFencedCodeBlocks(input);

    expect(masked.length).toBe(normalized.length);
    const maskedLines = masked.split("\n");
    const normLines = normalized.split("\n");
    expect(maskedLines.length).toBe(normLines.length);

    expect(maskedLines[0]).toBe("# 标题");
    expect(maskedLines[1]).toBe(" ".repeat(normLines[1].length));
    expect(maskedLines[2]).toBe(" ".repeat(normLines[2].length));
    expect(maskedLines[3]).toBe(" ".repeat(normLines[3].length));
    expect(maskedLines[4]).toBe(" ".repeat(normLines[4].length));
    expect(maskedLines[5]).toBe("正文内容");
    expect(maskedLines[6]).toBe(" ".repeat(normLines[6].length));
    expect(maskedLines[7]).toBe(" ".repeat(normLines[7].length));
    expect(maskedLines[8]).toBe(" ".repeat(normLines[8].length));
    expect(maskedLines[9]).toBe("结尾");
  });

  it("仅用同字符且长度不少于开启长度的围栏闭合，不同字符或更短围栏不闭合", () => {
    const input = ["````md", "```", "~~~", "## [0.0.2]", "````  ", "## [0.0.1]"].join("\n");

    const masked = maskFencedCodeBlocks(input);
    const lines = masked.split("\n");
    expect(lines[0].trim()).toBe("");
    expect(lines[1].trim()).toBe("");
    expect(lines[2].trim()).toBe("");
    expect(lines[3].trim()).toBe("");
    expect(lines[4].trim()).toBe("");
    expect(lines[5]).toBe("## [0.0.1]");
  });

  it("缩进达到 4 个空格时不视为围栏开启", () => {
    const input = ["    ```md", "## [Unreleased]", "    ```"].join("\n");
    expect(maskFencedCodeBlocks(input)).toBe(input);
  });
});

describe("checkGovernanceDocs", () => {
  it("根 CHANGELOG.md 与 docs/compatibility.md 满足要求时通过", () => {
    const rootDir = makeGovernanceWorkspace();
    expect(checkGovernanceDocs(rootDir, "0.0.1")).toEqual({ version: "0.0.1" });
  });

  it("支持根 CHANGELOG.md 当前版本带 YYYY-MM-DD 日期后缀的标题", () => {
    const rootDir = makeGovernanceWorkspace({
      changelog: "# 变更日志（Changelog）\n\n## [Unreleased]\n\n## [0.0.1] - 2026-11-25\n\n- 初始版本。\n",
    });
    expect(checkGovernanceDocs(rootDir, "0.0.1")).toEqual({ version: "0.0.1" });
  });

  it("缺少根 CHANGELOG.md、缺少 [Unreleased] 或当前版本节时抛出明确错误", () => {
    const missingChangelog = makeGovernanceWorkspace({ changelog: null });
    expect(() => checkGovernanceDocs(missingChangelog, "0.0.1")).toThrow(/CHANGELOG\.md/);

    const missingUnreleased = makeGovernanceWorkspace({
      changelog: "# 变更日志（Changelog）\n\n## [0.0.1]\n\n- 基线。\n",
    });
    expect(() => checkGovernanceDocs(missingUnreleased, "0.0.1")).toThrow(/Unreleased/);

    const malformedUnreleased = makeGovernanceWorkspace({
      changelog: "# 变更日志（Changelog）\n\n## [Unreleased] 额外文字\n\n## [0.0.1]\n",
    });
    expect(() => checkGovernanceDocs(malformedUnreleased, "0.0.1")).toThrow(/Unreleased/);

    const missingCurrentVersion = makeGovernanceWorkspace({
      changelog: "# 变更日志（Changelog）\n\n## [Unreleased]\n\n## [0.0.1]\n\n- 旧版本。\n",
    });
    expect(() => checkGovernanceDocs(missingCurrentVersion, "0.0.2")).toThrow(/0\.0\.2/);
  });

  it("缺少或空 docs/compatibility.md 时抛出明确错误", () => {
    const missingCompat = makeGovernanceWorkspace({ compatibility: null });
    expect(() => checkGovernanceDocs(missingCompat, "0.0.1")).toThrow(/docs\/compatibility\.md/);

    const emptyCompat = makeGovernanceWorkspace({ compatibility: "   \n\t\n" });
    expect(() => checkGovernanceDocs(emptyCompat, "0.0.1")).toThrow(/docs\/compatibility\.md/);
  });

  it("围栏代码块内包含 ## [Unreleased] 与 ## [0.0.2] 示例时不误报", () => {
    const rootDir = makeGovernanceWorkspace({
      changelog: [
        "# 变更日志（Changelog）",
        "",
        "```markdown",
        "## [Unreleased]",
        "",
        "## [0.0.2]",
        "```",
        "",
        "## [Unreleased]",
        "",
        "~~~md",
        "## [Unreleased]",
        "## [0.0.2]",
        "~~~",
        "",
        "## [0.0.1]",
        "",
        "- 初始基线。",
        "",
      ].join("\n"),
    });

    expect(checkGovernanceDocs(rootDir, "0.0.1")).toEqual({ version: "0.0.1" });
    expect(() => checkGovernanceDocs(rootDir, "0.0.2")).toThrow(/0\.0\.2/);
  });

  it("支持作为独立 CLI 入口校验当前仓库", () => {
    const scriptPath = path.resolve(import.meta.dirname, "governance-docs.mjs");
    const out = execFileSync("node", [scriptPath], { encoding: "utf8", stdio: "pipe" });
    expect(out).toMatch(/governance-docs: ok/);
  });
});

describe("archiveChangelog", () => {
  it("归档时完整保留围栏代码块且不在代码块内 ## [0.0.2] 处截断或误报重复", () => {
    const input = [
      "# 变更日志（Changelog）",
      "",
      "使用示例：",
      "",
      "```markdown",
      "## [Unreleased]",
      "## [0.0.2]",
      "```",
      "",
      "## [Unreleased]",
      "",
      "### 新增",
      "",
      "- 支持如下变更日志格式：",
      "",
      "~~~markdown",
      "## [Unreleased]",
      "",
      "## [0.0.2]",
      "",
      "- 示例条目。",
      "~~~",
      "",
      "## [0.0.1]",
      "",
      "- 初始基线。",
      "",
    ].join("\n");

    const archived = archiveChangelog(input, "0.0.2", "2026-11-25");

    expect(archived).toBe(
      [
        "# 变更日志（Changelog）",
        "",
        "使用示例：",
        "",
        "```markdown",
        "## [Unreleased]",
        "## [0.0.2]",
        "```",
        "",
        "## [Unreleased]",
        "",
        "## [0.0.2] - 2026-11-25",
        "",
        "### 新增",
        "",
        "- 支持如下变更日志格式：",
        "",
        "~~~markdown",
        "## [Unreleased]",
        "",
        "## [0.0.2]",
        "",
        "- 示例条目。",
        "~~~",
        "",
        "## [0.0.1]",
        "",
        "- 初始基线。",
        "",
      ].join("\n"),
    );
  });

  it("真实正文存在目标版本节时拒绝重复归档", () => {
    const input = "# 变更日志（Changelog）\n\n## [Unreleased]\n\n## [0.0.2] - 2026-11-25\n\n- 已存在。\n";
    expect(() => archiveChangelog(input, "0.0.2", "2026-11-25")).toThrow(/0\.0\.2/);
  });
});
