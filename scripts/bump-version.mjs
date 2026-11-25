import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { archiveChangelog } from "./governance-docs.mjs";

const BARE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const USAGE = "Usage: node scripts/bump-version.mjs [--root <dir>] [--allow-xy-bump] <version>";

/**
 * 解析裸 `x.y.z` 版本字符串为数值三元组；不合法时返回 null。
 * @param {unknown} raw
 * @returns {{ raw: string; major: number; minor: number; patch: number } | null}
 */
function parseBareVersion(raw) {
  if (typeof raw !== "string" || !BARE_SEMVER_RE.test(raw)) {
    return null;
  }
  const [major, minor, patch] = raw.split(".").map((part) => Number(part));
  return { raw, major, minor, patch };
}

/**
 * @param {{ major: number; minor: number; patch: number }} a
 * @param {{ major: number; minor: number; patch: number }} b
 */
function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * @param {string[]} argv
 */
function parseCliArgs(argv) {
  let allowXyBump = false;
  let help = false;
  /** @type {string | undefined} */
  let rootDir;
  /** @type {string[]} */
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow-xy-bump") {
      allowXyBump = true;
    } else if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "--root") {
      const next = argv[i + 1];
      if (!next) {
        return { error: "--root 缺少目录参数" };
      }
      rootDir = next;
      i += 1;
    } else if (arg.startsWith("-")) {
      return { error: `未知参数：${arg}` };
    } else {
      positional.push(arg);
    }
  }

  return { allowXyBump, help, rootDir, positional };
}

/**
 * 格式化本地日期为 YYYY-MM-DD。
 * @param {Date} [now]
 * @returns {string}
 */
function formatLocalDate(now = new Date()) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 统一升级 HiWeb 根工程与全部公开子包版本号，返回退出码（0 表示成功）。
 * @param {string[]} argv
 * @param {{ defaultRoot?: string; stdout?: (msg: string) => void; stderr?: (msg: string) => void }} [io]
 * @returns {number}
 */
export function runBumpVersion(argv, io = {}) {
  const stdout = io.stdout ?? ((msg) => process.stdout.write(`${msg}\n`));
  const stderr = io.stderr ?? ((msg) => process.stderr.write(`${msg}\n`));
  const defaultRoot = io.defaultRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  const parsed = parseCliArgs(argv);
  if ("error" in parsed) {
    stderr(`${parsed.error}\n${USAGE}`);
    return 64;
  }
  if (parsed.help) {
    stdout(USAGE);
    return 0;
  }
  if (parsed.positional.length !== 1) {
    stderr(`必须传入恰好一个裸 x.y.z 目标版本号。\n${USAGE}`);
    return 64;
  }

  const targetRaw = parsed.positional[0];
  const targetVersion = parseBareVersion(targetRaw);
  if (!targetVersion) {
    stderr(`目标版本号必须为无 v 前缀、无预发布后缀的裸 x.y.z 格式：${targetRaw}`);
    return 64;
  }

  const rootDir = path.resolve(parsed.rootDir ?? defaultRoot);
  const rootPkgPath = path.join(rootDir, "package.json");
  if (!existsSync(rootPkgPath)) {
    stderr(`缺少根 package.json：${rootPkgPath}`);
    return 1;
  }

  const packagesDir = path.join(rootDir, "packages");
  if (!existsSync(packagesDir)) {
    stderr(`缺少 packages 目录：${packagesDir}`);
    return 1;
  }

  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  const rootVersion = parseBareVersion(rootPkg.version);
  if (!rootVersion) {
    stderr(`根 package.json 版本号不是合法裸 x.y.z 格式：${String(rootPkg.version)}`);
    return 1;
  }

  /** @type {Array<{ filePath: string; pkg: Record<string, unknown> }>} */
  const targetsToUpdate = [{ filePath: rootPkgPath, pkg: rootPkg }];

  for (const dir of readdirSync(packagesDir).sort()) {
    const pkgPath = path.join(packagesDir, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.private === true) continue;
    const pkgVersion = parseBareVersion(pkg.version);
    if (!pkgVersion) {
      stderr(`packages/${dir}/package.json (${String(pkg.name)}) 版本号不是合法裸 x.y.z 格式：${String(pkg.version)}`);
      return 1;
    }
    if (pkgVersion.raw !== rootVersion.raw) {
      stderr(
        `版本不一致：packages/${dir}/package.json (${String(pkg.name)}) 为 ${pkgVersion.raw}，根 package.json 为 ${rootVersion.raw}`,
      );
      return 1;
    }
    targetsToUpdate.push({ filePath: pkgPath, pkg });
  }

  if (targetsToUpdate.length === 1) {
    stderr(`未在 ${packagesDir} 下找到任何公开子包`);
    return 1;
  }

  if (compareVersions(targetVersion, rootVersion) <= 0) {
    stderr(`目标版本号 ${targetVersion.raw} 必须严格大于当前版本 ${rootVersion.raw}`);
    return 1;
  }

  const xyChanged = targetVersion.major !== rootVersion.major || targetVersion.minor !== rootVersion.minor;
  if (xyChanged && !parsed.allowXyBump) {
    stderr(
      `修改 x 或 y 版本号（${rootVersion.raw} -> ${targetVersion.raw}）须获维护者明确同意并显式传入 --allow-xy-bump`,
    );
    return 1;
  }

  const changelogPath = path.join(rootDir, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    stderr(`缺少根 CHANGELOG.md：${changelogPath}`);
    return 1;
  }

  let nextChangelog;
  try {
    nextChangelog = archiveChangelog(readFileSync(changelogPath, "utf8"), targetVersion.raw, formatLocalDate());
  } catch (err) {
    stderr(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const originals = [];
  try {
    for (const item of targetsToUpdate) {
      originals.push({ filePath: item.filePath, raw: readFileSync(item.filePath, "utf8") });
      item.pkg.version = targetVersion.raw;
      writeFileSync(item.filePath, `${JSON.stringify(item.pkg, null, 2)}\n`, "utf8");
    }
    originals.push({ filePath: changelogPath, raw: readFileSync(changelogPath, "utf8") });
    writeFileSync(changelogPath, nextChangelog, "utf8");
  } catch (err) {
    for (const entry of originals) {
      writeFileSync(entry.filePath, entry.raw, "utf8");
    }
    throw err;
  }

  stdout(
    `bump-version: 已将根与 ${targetsToUpdate.length - 1} 个公开子包由 ${rootVersion.raw} 更新至 ${targetVersion.raw}，并归档 CHANGELOG.md`,
  );
  return 0;
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;

if (isEntrypoint) {
  process.exitCode = runBumpVersion(process.argv.slice(2));
}
