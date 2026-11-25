import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BARE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const FENCE_OPEN_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/**
 * 等长遮蔽 Markdown 围栏代码块内容，保留原有行结构与 `\n` 位置不变。
 * @param {string} text
 * @returns {string}
 */
export function maskFencedCodeBlocks(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  /** @type {{ char: string; length: number } | null} */
  let activeFence = null;

  const maskedLines = lines.map((line) => {
    if (activeFence === null) {
      const openMatch = line.match(FENCE_OPEN_RE);
      if (!openMatch) return line;
      activeFence = { char: openMatch[1][0], length: openMatch[1].length };
      return " ".repeat(line.length);
    }

    const closeRe = new RegExp(`^[ \\t]{0,3}${activeFence.char}{${activeFence.length},}[ \\t]*$`);
    if (closeRe.test(line)) {
      activeFence = null;
    }
    return " ".repeat(line.length);
  });

  return maskedLines.join("\n");
}

/**
 * 校验根 CHANGELOG.md 与 docs/compatibility.md 的存在性及版本标题同步（忽略围栏代码块内的示例）。
 * @param {string} rootDir
 * @param {string} expectedVersion
 * @returns {{ version: string }}
 */
export function checkGovernanceDocs(rootDir, expectedVersion) {
  if (typeof expectedVersion !== "string" || !BARE_SEMVER_RE.test(expectedVersion)) {
    throw new Error(`expectedVersion 必须为无 v 前缀、无预发布后缀的裸 x.y.z 格式：${String(expectedVersion)}`);
  }

  const resolvedRoot = path.resolve(rootDir);
  const changelogPath = path.join(resolvedRoot, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    throw new Error(`Missing root CHANGELOG.md at ${changelogPath}`);
  }

  const changelog = readFileSync(changelogPath, "utf8");
  const maskedChangelog = maskFencedCodeBlocks(changelog);

  const unreleasedMatches = maskedChangelog.match(/^## \[Unreleased\][ \t]*$/gm) ?? [];
  if (unreleasedMatches.length !== 1) {
    throw new Error('CHANGELOG.md 必须且仅能包含一个精确匹配的 "## [Unreleased]" 标题行');
  }

  const escapedVersion = expectedVersion.replaceAll(".", "\\.");
  const versionHeadingRe = new RegExp(`^## \\[${escapedVersion}\\](?: - \\d{4}-\\d{2}-\\d{2})?[ \\t]*$`, "m");
  if (!versionHeadingRe.test(maskedChangelog)) {
    throw new Error(
      `CHANGELOG.md 缺少当前版本 "## [${expectedVersion}]" 或 "## [${expectedVersion}] - YYYY-MM-DD" 标题行`,
    );
  }

  const compatPath = path.join(resolvedRoot, "docs", "compatibility.md");
  if (!existsSync(compatPath)) {
    throw new Error(`Missing docs/compatibility.md at ${compatPath}`);
  }
  const compatContent = readFileSync(compatPath, "utf8");
  if (compatContent.trim().length === 0) {
    throw new Error(`docs/compatibility.md 不能为空：${compatPath}`);
  }

  return { version: expectedVersion };
}

/**
 * 将根 CHANGELOG.md 中 `## [Unreleased]` 下的正文归档至 `## [<targetVersion>] - YYYY-MM-DD`，完整保留围栏代码块。
 * @param {string} content
 * @param {string} targetVersion
 * @param {string} dateStr
 * @returns {string}
 */
export function archiveChangelog(content, targetVersion, dateStr) {
  const normalized = content.replace(/\r\n/g, "\n");
  const masked = maskFencedCodeBlocks(normalized);

  const unreleasedMatches = [...masked.matchAll(/^## \[Unreleased\][ \t]*$/gm)];
  if (unreleasedMatches.length !== 1 || unreleasedMatches[0].index === undefined) {
    throw new Error('根 CHANGELOG.md 必须且仅能包含一个精确匹配的 "## [Unreleased]" 标题行');
  }
  const unreleasedMatch = unreleasedMatches[0];

  const escapedTarget = targetVersion.replaceAll(".", "\\.");
  const duplicateVersionRe = new RegExp(`^## \\[${escapedTarget}\\](?: - \\d{4}-\\d{2}-\\d{2})?[ \\t]*$`, "m");
  if (duplicateVersionRe.test(masked)) {
    throw new Error(`根 CHANGELOG.md 已存在目标版本节 "## [${targetVersion}]"`);
  }

  const headerStart = unreleasedMatch.index;
  const headerEnd = headerStart + unreleasedMatch[0].length;
  const maskedAfterHeader = masked.slice(headerEnd);
  const afterHeader = normalized.slice(headerEnd);
  const nextSectionMatch = /^## \[/m.exec(maskedAfterHeader);

  const unreleasedRawBody = nextSectionMatch ? afterHeader.slice(0, nextSectionMatch.index) : afterHeader;
  const rest = nextSectionMatch ? afterHeader.slice(nextSectionMatch.index) : "";
  const archivedBody = unreleasedRawBody.trim() || "- 版本号对齐（无行为变更）。";

  const prefix = normalized.slice(0, headerStart);
  const archivedSection = `## [${targetVersion}] - ${dateStr}\n\n${archivedBody}\n`;
  const suffix = rest.trim().length > 0 ? `\n${rest.replace(/^\n+/, "").replace(/\n*$/, "\n")}` : "";

  return `${prefix}## [Unreleased]\n\n${archivedSection}${suffix}`;
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;

if (isEntrypoint) {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const rootPkgPath = path.join(defaultRoot, "package.json");
  if (!existsSync(rootPkgPath)) {
    throw new Error(`Missing root package.json at ${rootPkgPath}`);
  }
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  const result = checkGovernanceDocs(defaultRoot, rootPkg.version);
  console.log(`governance-docs: ok (version ${result.version})`);
}
