import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HIWEB_REPOSITORY = "https://github.com/jashanyng/HiWeb.git";
export const HIWEB_LOCK_SCHEMA_VERSION = 1;

const HIWEB_PKG_PREFIX = "@jashanyng/hiweb-";
const SHA1_HEX_RE = /^[0-9a-f]{40}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** @param {string} filePath */
export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** @param {string} filePath */
export function sha512Integrity(filePath) {
  return `sha512-${createHash("sha512").update(readFileSync(filePath)).digest("base64")}`;
}

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const detail = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(`执行 git ${args.join(" ")} 失败（${cwd}）：${detail}`, { cause: error });
  }
}

/**
 * @param {string} filePath
 * @param {string} label
 */
function readJsonFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`缺少 ${label}：${filePath}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${filePath}`, { cause: error });
  }
}

/**
 * @param {unknown} tarball
 * @param {string} pkgName
 */
function assertValidTarballName(tarball, pkgName) {
  if (
    typeof tarball !== "string" ||
    !tarball ||
    !tarball.endsWith(".tgz") ||
    tarball.includes("/") ||
    tarball.includes("\\") ||
    tarball.includes("..")
  ) {
    throw new Error(`${pkgName} 的 tarball 文件名非法：${String(tarball)}`);
  }
}

/**
 * @param {unknown} entry
 * @param {string} pkgName
 * @param {string} sourceLabel
 */
function validateLockedPackageEntry(entry, pkgName, sourceLabel) {
  if (!pkgName.startsWith(HIWEB_PKG_PREFIX) || !entry || typeof entry !== "object") {
    throw new Error(`${sourceLabel} 中包条目非法：${pkgName}`);
  }
  if ("path" in entry) {
    throw new Error(`${sourceLabel} 中 ${pkgName} 包含已废除的 path 字段，请重新执行 --sync`);
  }
  if (typeof entry.version !== "string" || !entry.version) {
    throw new Error(`${sourceLabel} 中 ${pkgName} 缺少有效 version`);
  }
  assertValidTarballName(entry.tarball, pkgName);
  if (typeof entry.sha256 !== "string" || !SHA256_HEX_RE.test(entry.sha256)) {
    throw new Error(`${sourceLabel} 中 ${pkgName} 的 sha256 非法：${String(entry.sha256)}`);
  }
  return /** @type {{ version: string; tarball: string; sha256: string }} */ (entry);
}

/**
 * 解析同级 HiWeb 目录；若当前为 .git linked worktree 且直接同级缺失，则回落至主工作区同级目录。
 * @param {string} rootDir
 */
export function resolveDefaultHiwebDir(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  if (process.env.HIWEB_DIR) {
    return path.resolve(resolvedRoot, process.env.HIWEB_DIR);
  }

  const directSibling = path.resolve(resolvedRoot, "../HiWeb");
  if (existsSync(directSibling)) {
    return directSibling;
  }

  const dotGitPath = path.join(resolvedRoot, ".git");
  try {
    if (existsSync(dotGitPath) && statSync(dotGitPath).isFile()) {
      const pointer = readFileSync(dotGitPath, "utf8").trim();
      if (pointer.startsWith("gitdir:")) {
        const rawGitDir = pointer.slice("gitdir:".length).trim();
        const gitDir = path.isAbsolute(rawGitDir) ? path.resolve(rawGitDir) : path.resolve(resolvedRoot, rawGitDir);

        let commonGitDir = null;
        const commonDirFile = path.join(gitDir, "commondir");
        if (existsSync(commonDirFile)) {
          const rawCommon = readFileSync(commonDirFile, "utf8").trim();
          commonGitDir = path.isAbsolute(rawCommon) ? path.resolve(rawCommon) : path.resolve(gitDir, rawCommon);
        } else if (path.basename(path.dirname(gitDir)) === "worktrees") {
          commonGitDir = path.resolve(gitDir, "../..");
        }

        if (commonGitDir && path.basename(commonGitDir) === ".git") {
          const fallbackSibling = path.resolve(path.dirname(commonGitDir), "../HiWeb");
          if (existsSync(fallbackSibling)) {
            return fallbackSibling;
          }
        }
      }
    }
  } catch {
    // 忽略指针文件读取异常，回退至直接同级路径
  }

  return directSibling;
}

/** @param {string} raw */
function unquoteYamlScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  const commentIdx = trimmed.search(/\s+#/);
  return (commentIdx === -1 ? trimmed : trimmed.slice(0, commentIdx)).trim();
}

/** @param {string} line */
function parseYamlKeyValueLine(line) {
  const match = /^\s*("[^"]+"|'[^']+'|[^:\s][^:]*?)\s*:\s*(.*)$/.exec(line);
  if (!match) return null;
  return {
    key: unquoteYamlScalar(match[1]),
    value: unquoteYamlScalar(match[2]),
  };
}

/** @param {string} content */
function splitYamlDocuments(content) {
  const docs = content
    .split(/^---\s*$/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return docs.length > 0 ? docs : [content];
}

/**
 * @param {string} content
 * @param {string} sectionName
 */
function locateTopLevelSection(content, sectionName) {
  const lines = content.split(/\r?\n/);
  const headerRe = new RegExp(`^${sectionName}:\\s*(.*)$`);
  const startLine = lines.findIndex((line) => headerRe.test(line));
  if (startLine === -1) return null;

  const headerRest = unquoteYamlScalar(lines[startLine].replace(new RegExp(`^${sectionName}:`), ""));
  let endLine = startLine + 1;
  while (endLine < lines.length) {
    const line = lines[endLine];
    if (line.trim() !== "" && !line.trimStart().startsWith("#") && !/^\s/.test(line)) {
      break;
    }
    endLine += 1;
  }

  return { lines, startLine, endLine, inlineEmpty: headerRest === "{}" };
}

/**
 * 解析 pnpm-workspace.yaml 中的 overrides 键值映射。
 * @param {string} yamlContent
 * @returns {Record<string, string>}
 */
export function parsePnpmWorkspaceOverrides(yamlContent) {
  const section = locateTopLevelSection(yamlContent, "overrides");
  if (!section || section.inlineEmpty) return {};

  /** @type {Record<string, string>} */
  const result = {};
  for (let i = section.startLine + 1; i < section.endLine; i += 1) {
    const line = section.lines[i];
    if (!line || line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const parsed = parseYamlKeyValueLine(line);
    if (parsed) {
      result[parsed.key] = parsed.value;
    }
  }
  return result;
}

/** @param {string} key */
function formatYamlKey(key) {
  return key.startsWith("@") || /[^a-zA-Z0-9_.-]/.test(key) ? JSON.stringify(key) : key;
}

/**
 * 就地更新 pnpm-workspace.yaml 中的 overrides 块，保留原有其他设置与非 HiWeb overrides。
 * 若消费仓尚无 pnpm-workspace.yaml，则生成默认安全配置（saveExact 与 minimumReleaseAge）。
 * @param {string} yamlContent
 * @param {Record<string, string>} hiwebOverrides
 */
export function upsertPnpmWorkspaceOverrides(yamlContent, hiwebOverrides) {
  const existingOverrides = parsePnpmWorkspaceOverrides(yamlContent);
  /** @type {Array<[string, string]>} */
  const preservedEntries = Object.entries(existingOverrides).filter(([key]) => !key.startsWith(HIWEB_PKG_PREFIX));
  const hiwebEntries = Object.entries(hiwebOverrides).sort(([a], [b]) => a.localeCompare(b));
  const mergedEntries = [...preservedEntries, ...hiwebEntries];

  const overrideBlockLines =
    mergedEntries.length === 0
      ? ["overrides: {}"]
      : ["overrides:", ...mergedEntries.map(([key, value]) => `  ${formatYamlKey(key)}: ${JSON.stringify(value)}`)];

  if (!yamlContent.trim()) {
    return ["saveExact: true", "minimumReleaseAge: 1440", ...overrideBlockLines, ""].join("\n");
  }

  const section = locateTopLevelSection(yamlContent, "overrides");
  const lines = yamlContent.split(/\r?\n/);

  if (!section) {
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return [...lines, "", ...overrideBlockLines, ""].join("\n");
  }

  const before = lines.slice(0, section.startLine);
  const after = lines.slice(section.endLine);
  while (after.length > 0 && after[after.length - 1] === "") {
    after.pop();
  }
  const trailingSep = after.length > 0 ? [""] : [];
  return [...before, ...overrideBlockLines, ...trailingSep, ...after, ""].join("\n");
}

/**
 * 解析单个或多个 YAML 文档中 packages 段内的所有 @jashanyng/hiweb-* 锁定记录。
 * pnpm 12 在设置 packageManager 时会生成双文档 pnpm-lock.yaml（首文档放 packageManagerDependencies）。
 * @param {string} lockYaml
 */
function parsePnpmLockPackages(lockYaml) {
  const documents = splitYamlDocuments(lockYaml);
  /** @type {Array<{ pkgName: string; spec: string; integrity?: string; tarball?: string }>} */
  const entries = [];
  let foundPackagesSection = false;

  for (const doc of documents) {
    const section = locateTopLevelSection(doc, "packages");
    if (!section) continue;
    foundPackagesSection = true;

    /** @type {{ pkgName: string; spec: string; integrity?: string; tarball?: string } | null} */
    let current = null;

    for (let i = section.startLine + 1; i < section.endLine; i += 1) {
      const line = section.lines[i];
      if (!line || line.trim() === "" || line.trimStart().startsWith("#")) continue;

      if (/^ {2}\S/.test(line) && line.trimEnd().endsWith(":")) {
        if (current) {
          entries.push(current);
          current = null;
        }
        const headerKey = unquoteYamlScalar(line.trim().slice(0, -1));
        if (headerKey.startsWith(HIWEB_PKG_PREFIX)) {
          const atIdx = headerKey.indexOf("@", HIWEB_PKG_PREFIX.length);
          if (atIdx === -1) {
            throw new Error(`pnpm-lock.yaml 包键格式非法：${headerKey}`);
          }
          current = {
            pkgName: headerKey.slice(0, atIdx),
            spec: headerKey.slice(atIdx + 1),
          };
        }
        continue;
      }

      if (!current) continue;

      const inlineResolution = /^\s+resolution:\s*\{(.+)\}\s*$/.exec(line);
      if (inlineResolution) {
        const inner = inlineResolution[1];
        const integrityMatch = /\bintegrity:\s*([^,}\s]+)/.exec(inner);
        const tarballMatch = /\btarball:\s*([^,}\s]+)/.exec(inner);
        if (integrityMatch) current.integrity = unquoteYamlScalar(integrityMatch[1]);
        if (tarballMatch) current.tarball = unquoteYamlScalar(tarballMatch[1]);
        continue;
      }

      const kv = parseYamlKeyValueLine(line);
      if (kv?.key === "integrity") current.integrity = kv.value;
      else if (kv?.key === "tarball") current.tarball = kv.value;
    }

    if (current) entries.push(current);
  }

  if (!foundPackagesSection) {
    throw new Error("pnpm-lock.yaml 缺少 packages 段");
  }

  return entries;
}

/** @param {string} hiwebDir */
function assertCleanHiwebHead(hiwebDir) {
  let inside = "";
  try {
    inside = runGit(hiwebDir, ["rev-parse", "--is-inside-work-tree"]);
  } catch (error) {
    throw new Error(
      `同级 HiWeb 目录不是有效的 Git 仓库（${hiwebDir}）：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (inside !== "true") {
    throw new Error(`同级 HiWeb 目录不在 Git 工作树中：${hiwebDir}`);
  }
  const status = runGit(hiwebDir, ["status", "--porcelain"]);
  if (status.length > 0) {
    throw new Error(`同级 HiWeb 仓库工作区不干净，存在未提交改动：\n${status}`);
  }
  const head = runGit(hiwebDir, ["rev-parse", "HEAD"]);
  if (!SHA1_HEX_RE.test(head)) {
    throw new Error(`同级 HiWeb 仓库 HEAD 不是 40 位十六进制 SHA：${head}`);
  }
  return head;
}

/**
 * 读取 HiWeb 各子包的内部依赖图，并从消费仓声明的直接依赖计算最小传递闭包。
 * @param {Record<string, unknown>} pkgJson
 * @param {string} hiwebDir
 */
function computeRequiredHiwebClosure(pkgJson, hiwebDir) {
  const packagesRoot = path.join(hiwebDir, "packages");
  if (!existsSync(packagesRoot)) {
    throw new Error(`缺少 HiWeb packages 目录：${packagesRoot}`);
  }

  /** @type {Map<string, string[]>} */
  const internalGraph = new Map();
  for (const dir of readdirSync(packagesRoot)) {
    const pkgFile = path.join(packagesRoot, dir, "package.json");
    if (!existsSync(pkgFile)) continue;
    const pkg = readJsonFile(pkgFile, `HiWeb packages/${dir}/package.json`);
    if (pkg && typeof pkg.name === "string") {
      const deps =
        pkg.dependencies && typeof pkg.dependencies === "object"
          ? Object.keys(pkg.dependencies).filter((d) => d.startsWith(HIWEB_PKG_PREFIX))
          : [];
      internalGraph.set(pkg.name, deps);
    }
  }

  /** @type {Set<string>} */
  const seeds = new Set();
  for (const section of ["dependencies", "devDependencies"]) {
    const map = pkgJson[section];
    if (!map || typeof map !== "object") continue;
    for (const name of Object.keys(map)) {
      if (name.startsWith(HIWEB_PKG_PREFIX)) seeds.add(name);
    }
  }

  if (seeds.size === 0) {
    throw new Error("消费仓 package.json 中未声明任何 @jashanyng/hiweb-* 依赖，至少需声明一个实际消费的 HiWeb 子包");
  }

  /** @type {Set<string>} */
  const closure = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || closure.has(current)) continue;
    if (!internalGraph.has(current)) {
      throw new Error(`HiWeb 仓库中未找到子包定义：${current}`);
    }
    closure.add(current);
    for (const dep of internalGraph.get(current) ?? []) {
      if (!closure.has(dep)) queue.push(dep);
    }
  }

  return [...closure].sort();
}

/**
 * @param {string} hiwebDir
 * @param {Record<string, any>} manifest
 */
function assertHiwebGuardIntegrity(hiwebDir, manifest) {
  const guardRel = manifest?.guard?.file ?? "scripts/hiweb-guard.mjs";
  const expectedSha = manifest?.guard?.sha256;
  const hiwebGuardPath = path.join(hiwebDir, guardRel);

  if (!existsSync(hiwebGuardPath)) {
    throw new Error(`HiWeb 缺少权威守护脚本：${hiwebGuardPath}`);
  }
  if (typeof expectedSha !== "string" || !SHA256_HEX_RE.test(expectedSha)) {
    throw new Error("HiWeb manifest.json 缺少有效的 guard.sha256，请先在 HiWeb 运行 pnpm run pack:artifacts");
  }
  const actualSha = sha256File(hiwebGuardPath);
  if (actualSha !== expectedSha) {
    throw new Error(
      `HiWeb 权威 scripts/hiweb-guard.mjs SHA-256 与 manifest.json 不一致（预期 ${expectedSha}，实际 ${actualSha}），请重新打包`,
    );
  }
  return { hiwebGuardPath, guardSha256: actualSha };
}

/**
 * @param {Record<string, unknown>} pkgJson
 * @param {Record<string, { version: string; tarball: string; sha256: string }>} lockedPackages
 */
function verifyConsumerPackageJson(pkgJson, lockedPackages) {
  let declaredHiwebCount = 0;
  for (const section of ["dependencies", "devDependencies"]) {
    const map = pkgJson[section];
    if (!map || typeof map !== "object") continue;
    for (const [name, spec] of Object.entries(map)) {
      if (!name.startsWith(HIWEB_PKG_PREFIX)) continue;
      declaredHiwebCount += 1;
      const locked = lockedPackages[name];
      if (!locked) {
        throw new Error(`package.json.${section} 包含未纳入 hiweb.lock.json 的包：${name}`);
      }
      const expectedSpec = `file:./vendor/hiweb/${locked.tarball}`;
      if (spec !== expectedSpec) {
        throw new Error(`package.json.${section}["${name}"] 必须锁定为 "${expectedSpec}"，当前为 "${String(spec)}"`);
      }
    }
  }
  if (declaredHiwebCount === 0) {
    throw new Error("package.json 中未声明任何 @jashanyng/hiweb-* 依赖");
  }
  if (pkgJson.overrides && typeof pkgJson.overrides === "object") {
    for (const name of Object.keys(pkgJson.overrides)) {
      if (name.startsWith(HIWEB_PKG_PREFIX)) {
        throw new Error(`package.json.overrides 中不得保留 ${name}，请迁至 pnpm-workspace.yaml#overrides`);
      }
    }
  }
}

/**
 * @param {string} rootDir
 * @param {Record<string, { version: string; tarball: string; sha256: string }>} lockedPackages
 */
function verifyWorkspaceOverrides(rootDir, lockedPackages) {
  const workspacePath = path.join(rootDir, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    throw new Error(`缺少 pnpm-workspace.yaml：${workspacePath}`);
  }
  const workspaceOverrides = parsePnpmWorkspaceOverrides(readFileSync(workspacePath, "utf8"));
  for (const [pkgName, locked] of Object.entries(lockedPackages)) {
    const expectedRef = `file:./vendor/hiweb/${locked.tarball}`;
    if (workspaceOverrides[pkgName] !== expectedRef) {
      throw new Error(
        `pnpm-workspace.yaml#overrides 缺少或未对齐 ${pkgName}（预期 "${expectedRef}"，实际 "${String(workspaceOverrides[pkgName])}"）`,
      );
    }
  }
  for (const pkgName of Object.keys(workspaceOverrides)) {
    if (pkgName.startsWith(HIWEB_PKG_PREFIX) && !(pkgName in lockedPackages)) {
      throw new Error(`pnpm-workspace.yaml#overrides 包含未纳入 hiweb.lock.json 的包：${pkgName}`);
    }
  }
}

/**
 * @param {string} rootDir
 * @param {Record<string, { version: string; tarball: string; sha256: string }>} lockedPackages
 */
function verifyPnpmLockIntegrity(rootDir, lockedPackages) {
  const pnpmLockPath = path.join(rootDir, "pnpm-lock.yaml");
  if (!existsSync(pnpmLockPath)) {
    throw new Error("缺少 pnpm-lock.yaml，请运行 pnpm install 生成并提交锁文件");
  }
  const lockEntries = parsePnpmLockPackages(readFileSync(pnpmLockPath, "utf8"));
  const seenPackages = new Set();

  for (const item of lockEntries) {
    const locked = lockedPackages[item.pkgName];
    if (!locked) {
      throw new Error(`pnpm-lock.yaml 包含未纳入 hiweb.lock.json 的包：${item.pkgName}`);
    }
    const normalizedTarball = `file:vendor/hiweb/${locked.tarball}`;
    const altTarball = `file:./vendor/hiweb/${locked.tarball}`;
    if (item.tarball && /^https?:\/\//i.test(item.tarball)) {
      throw new Error(`pnpm-lock.yaml 中 ${item.pkgName} 指向了远端地址 ${item.tarball}，违反离线锁定要求`);
    }
    if (
      (item.spec !== normalizedTarball && item.spec !== altTarball) ||
      (item.tarball !== normalizedTarball && item.tarball !== altTarball)
    ) {
      throw new Error(
        `pnpm-lock.yaml 中 ${item.pkgName} 的本地路径与 hiweb.lock.json 不一致（预期 ${normalizedTarball}，实际 spec=${item.spec} tarball=${String(item.tarball)}）`,
      );
    }
    const expectedIntegrity = sha512Integrity(path.join(rootDir, "vendor", "hiweb", locked.tarball));
    if (item.integrity !== expectedIntegrity) {
      throw new Error(
        `pnpm-lock.yaml 中 ${item.pkgName} 的 integrity 与本地离线包不匹配，请运行 node scripts/hiweb-guard.mjs --sync && pnpm install`,
      );
    }
    seenPackages.add(item.pkgName);
  }

  for (const pkgName of Object.keys(lockedPackages)) {
    if (!seenPackages.has(pkgName)) {
      throw new Error(`pnpm-lock.yaml 缺少 ${pkgName} 锁定条目，请运行 pnpm install`);
    }
  }
}

/**
 * @param {string} rootDir
 * @param {string} hiwebDir
 * @param {{ commitSha: string; packages: Record<string, { version: string; tarball: string; sha256: string }> }} lock
 * @param {boolean} requireRemote
 */
function verifySiblingHiweb(rootDir, hiwebDir, lock, requireRemote) {
  const head = assertCleanHiwebHead(hiwebDir);
  if (head !== lock.commitSha) {
    throw new Error(`版本锁 commitSha（${lock.commitSha}）与同级 HiWeb HEAD（${head}）不一致`);
  }

  const manifest = readJsonFile(path.join(hiwebDir, "artifacts", "manifest.json"), "HiWeb artifacts/manifest.json");
  const { hiwebGuardPath } = assertHiwebGuardIntegrity(hiwebDir, manifest);
  const consumerGuardPath = path.join(rootDir, "scripts", "hiweb-guard.mjs");
  if (!existsSync(consumerGuardPath) || sha256File(consumerGuardPath) !== sha256File(hiwebGuardPath)) {
    throw new Error("消费仓 scripts/hiweb-guard.mjs 与同级 HiWeb 权威版本不一致，请运行 --sync 更新");
  }

  for (const [pkgName, locked] of Object.entries(lock.packages)) {
    const mEntry = manifest.packages?.[pkgName];
    if (!mEntry || mEntry.sha256 !== locked.sha256 || mEntry.tarball !== locked.tarball) {
      throw new Error(`同级 HiWeb artifacts (${pkgName}) 与 hiweb.lock.json 不一致，请运行 --sync 更新`);
    }
  }

  if (requireRemote) {
    try {
      runGit(hiwebDir, ["fetch", "origin", "--quiet"]);
      execFileSync("git", ["merge-base", "--is-ancestor", lock.commitSha, "refs/remotes/origin/dev"], {
        cwd: hiwebDir,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      throw new Error(`版本锁 commitSha ${lock.commitSha} 尚未到达 HiWeb 的 origin/dev（请先在 HiWeb 推送后再执行）`, {
        cause: error,
      });
    }
  }
}

/**
 * @param {string} rootDir
 * @param {{ repository: string; commitSha: string }} lock
 */
function verifyRemoteWithoutSibling(rootDir, lock) {
  let lsOutput = "";
  try {
    lsOutput = runGit(rootDir, ["ls-remote", "--heads", lock.repository, "dev", "main"]);
  } catch (error) {
    throw new Error(
      `未找到同级 HiWeb 且无法连接远端仓库 ${lock.repository}：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const remoteHeads = new Set(
    lsOutput
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter(([sha, ref]) => Boolean(sha && ref))
      .map(([sha]) => sha),
  );
  if (!remoteHeads.has(lock.commitSha)) {
    throw new Error(
      `缺少同级 HiWeb 目录且远端 dev/main 最新头不包含锁定 SHA ${lock.commitSha}（git ls-remote 仅能核对分支头，请检出同级 HiWeb 以验证祖先可达）`,
    );
  }
}

/**
 * 从同级 HiWeb 同步离线 .tgz、权威 hiweb-guard.mjs、统一 hiweb.lock.json 与 pnpm-workspace.yaml#overrides。
 * @param {{ rootDir?: string; hiwebDir?: string }} [options]
 */
export function syncHiweb(options = {}) {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const rootDir = path.resolve(options.rootDir ?? defaultRoot);
  const hiwebDir = path.resolve(options.hiwebDir ?? resolveDefaultHiwebDir(rootDir));

  if (!existsSync(hiwebDir)) {
    throw new Error(`未找到同级 HiWeb 仓库目录：${hiwebDir}`);
  }

  const commitSha = assertCleanHiwebHead(hiwebDir);
  const manifestPath = path.join(hiwebDir, "artifacts", "manifest.json");
  const manifest = readJsonFile(manifestPath, "HiWeb artifacts/manifest.json");
  const manifestPackages = manifest && typeof manifest === "object" ? manifest.packages : null;
  if (!manifestPackages || typeof manifestPackages !== "object") {
    throw new Error(`HiWeb manifest.json 缺少 packages 字段：${manifestPath}`);
  }

  const { hiwebGuardPath } = assertHiwebGuardIntegrity(hiwebDir, manifest);
  const pkgJsonPath = path.join(rootDir, "package.json");
  const pkgJson = readJsonFile(pkgJsonPath, "package.json");
  const requiredPackages = computeRequiredHiwebClosure(pkgJson, hiwebDir);

  const vendorDir = path.join(rootDir, "vendor", "hiweb");
  mkdirSync(vendorDir, { recursive: true });

  /** @type {Record<string, { version: string; tarball: string; sha256: string }>} */
  const lockedPackages = {};
  /** @type {Record<string, string>} */
  const hiwebOverrides = {};
  const expectedTarballs = new Set();

  for (const pkgName of requiredPackages) {
    const entry = validateLockedPackageEntry(manifestPackages[pkgName], pkgName, "HiWeb manifest.json");
    const srcTgz = path.join(hiwebDir, "artifacts", "tgz", entry.tarball);
    if (!existsSync(srcTgz)) {
      throw new Error(`HiWeb 产物包缺失：${srcTgz}`);
    }
    const actualSha = sha256File(srcTgz);
    if (actualSha !== entry.sha256) {
      throw new Error(
        `HiWeb 产物包 ${entry.tarball} SHA-256 与 manifest.json 不一致（预期 ${entry.sha256}，实际 ${actualSha}）`,
      );
    }

    copyFileSync(srcTgz, path.join(vendorDir, entry.tarball));
    expectedTarballs.add(entry.tarball);

    lockedPackages[pkgName] = { version: entry.version, tarball: entry.tarball, sha256: entry.sha256 };
    hiwebOverrides[pkgName] = `file:./vendor/hiweb/${entry.tarball}`;
  }

  for (const existing of readdirSync(vendorDir)) {
    if (!expectedTarballs.has(existing)) {
      rmSync(path.join(vendorDir, existing), { recursive: true, force: true });
    }
  }

  const destGuardDir = path.join(rootDir, "scripts");
  const destGuardPath = path.join(destGuardDir, "hiweb-guard.mjs");
  mkdirSync(destGuardDir, { recursive: true });
  if (!existsSync(destGuardPath) || realpathSync(hiwebGuardPath) !== realpathSync(destGuardPath)) {
    copyFileSync(hiwebGuardPath, destGuardPath);
  }

  let pkgJsonChanged = false;
  for (const section of ["dependencies", "devDependencies"]) {
    const map = pkgJson[section];
    if (!map || typeof map !== "object") continue;
    for (const [name, currentSpec] of Object.entries(map)) {
      if (!name.startsWith(HIWEB_PKG_PREFIX)) continue;
      const expectedSpec = hiwebOverrides[name];
      if (expectedSpec && currentSpec !== expectedSpec) {
        map[name] = expectedSpec;
        pkgJsonChanged = true;
      }
    }
  }
  if (pkgJson.overrides && typeof pkgJson.overrides === "object") {
    for (const key of Object.keys(pkgJson.overrides)) {
      if (key.startsWith(HIWEB_PKG_PREFIX)) {
        delete pkgJson.overrides[key];
        pkgJsonChanged = true;
      }
    }
    if (Object.keys(pkgJson.overrides).length === 0) {
      delete pkgJson.overrides;
      pkgJsonChanged = true;
    }
  }
  if (pkgJsonChanged) {
    writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`, "utf8");
  }

  const workspacePath = path.join(rootDir, "pnpm-workspace.yaml");
  const existingWorkspaceYaml = existsSync(workspacePath) ? readFileSync(workspacePath, "utf8") : "";
  writeFileSync(workspacePath, upsertPnpmWorkspaceOverrides(existingWorkspaceYaml, hiwebOverrides), "utf8");

  const lockData = {
    schemaVersion: HIWEB_LOCK_SCHEMA_VERSION,
    repository: HIWEB_REPOSITORY,
    commitSha,
    packages: lockedPackages,
  };
  writeFileSync(path.join(rootDir, "hiweb.lock.json"), `${JSON.stringify(lockData, null, 2)}\n`, "utf8");

  // 清除旧已安装子包缓存，确保后续 pnpm install 从本地 tarball 重新解包
  const installedScopeDir = path.join(rootDir, "node_modules", "@jashanyng");
  if (existsSync(installedScopeDir)) {
    rmSync(installedScopeDir, { recursive: true, force: true });
  }

  return lockData;
}

/**
 * 校验 hiweb.lock.json、package.json、pnpm-workspace.yaml、pnpm-lock.yaml、vendor/hiweb/*.tgz 与同级 HiWeb 一致性。
 * @param {{ rootDir?: string; hiwebDir?: string; requireRemote?: boolean }} [options]
 */
export function verifyHiweb(options = {}) {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const rootDir = path.resolve(options.rootDir ?? defaultRoot);
  const hiwebDir = path.resolve(options.hiwebDir ?? resolveDefaultHiwebDir(rootDir));
  const requireRemote = options.requireRemote === true;

  const lock = readJsonFile(path.join(rootDir, "hiweb.lock.json"), "hiweb.lock.json");
  if (!lock || typeof lock !== "object") {
    throw new Error("hiweb.lock.json 根节点必须为对象");
  }
  if ("commit" in lock) {
    throw new Error("hiweb.lock.json 存在已废除的 commit 字段，请运行 node scripts/hiweb-guard.mjs --sync 升级锁文件");
  }
  if (lock.schemaVersion !== HIWEB_LOCK_SCHEMA_VERSION) {
    throw new Error(
      `hiweb.lock.json schemaVersion 必须为 ${HIWEB_LOCK_SCHEMA_VERSION}，实际为 ${String(lock.schemaVersion)}`,
    );
  }
  if (lock.repository !== HIWEB_REPOSITORY) {
    throw new Error(`hiweb.lock.json repository 必须为 "${HIWEB_REPOSITORY}"，实际为 "${String(lock.repository)}"`);
  }
  if (typeof lock.commitSha !== "string" || !SHA1_HEX_RE.test(lock.commitSha)) {
    throw new Error(`hiweb.lock.json commitSha 必须为 40 位十六进制 Git SHA，实际为 "${String(lock.commitSha)}"`);
  }
  if (!lock.packages || typeof lock.packages !== "object" || Object.keys(lock.packages).length === 0) {
    throw new Error("hiweb.lock.json 缺少有效的 packages 清单");
  }

  /** @type {Record<string, { version: string; tarball: string; sha256: string }>} */
  const lockedPackages = {};
  for (const [pkgName, rawEntry] of Object.entries(lock.packages)) {
    const entry = validateLockedPackageEntry(rawEntry, pkgName, "hiweb.lock.json");
    const tgzPath = path.join(rootDir, "vendor", "hiweb", entry.tarball);
    if (!existsSync(tgzPath)) {
      throw new Error(`缺少本地离线包：${tgzPath}`);
    }
    const actualSha = sha256File(tgzPath);
    if (actualSha !== entry.sha256) {
      throw new Error(`离线包 ${entry.tarball} SHA-256 校验失败（预期 ${entry.sha256}，实际 ${actualSha}）`);
    }
    lockedPackages[pkgName] = entry;
  }

  if (existsSync(path.join(rootDir, "package-lock.json"))) {
    throw new Error("检测到残留的 package-lock.json，pnpm 工具链下请删除它并提交 pnpm-lock.yaml");
  }

  const pkgJson = readJsonFile(path.join(rootDir, "package.json"), "package.json");
  verifyConsumerPackageJson(pkgJson, lockedPackages);
  verifyWorkspaceOverrides(rootDir, lockedPackages);
  verifyPnpmLockIntegrity(rootDir, lockedPackages);

  if (existsSync(hiwebDir)) {
    verifySiblingHiweb(rootDir, hiwebDir, { commitSha: lock.commitSha, packages: lockedPackages }, requireRemote);
  } else if (requireRemote) {
    verifyRemoteWithoutSibling(rootDir, { repository: lock.repository, commitSha: lock.commitSha });
  }

  return lock;
}

/** @param {string[]} argv */
function parseCliArgs(argv) {
  let sync = false;
  let verify = false;
  let requireRemote = false;
  /** @type {string | undefined} */
  let hiwebDir;
  /** @type {string | undefined} */
  let rootDir;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sync") sync = true;
    else if (arg === "--verify") verify = true;
    else if (arg === "--require-remote") requireRemote = true;
    else if (arg === "--hiweb-dir") {
      hiwebDir = argv[i + 1];
      if (!hiwebDir) throw new Error("--hiweb-dir 缺少路径参数");
      i += 1;
    } else if (arg === "--root-dir") {
      rootDir = argv[i + 1];
      if (!rootDir) throw new Error("--root-dir 缺少路径参数");
      i += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (sync === verify) {
    throw new Error("请二选一指定 --sync 或 --verify [--require-remote]");
  }
  if (sync && requireRemote) {
    throw new Error("--require-remote 仅适用于 --verify");
  }
  return { sync, verify, requireRemote, hiwebDir, rootDir };
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.sync) {
    const lock = syncHiweb({ rootDir: args.rootDir, hiwebDir: args.hiwebDir });
    process.stdout.write(
      `hiweb-guard: 已同步 ${Object.keys(lock.packages).length} 个包，锁定 commitSha ${lock.commitSha}\n`,
    );
    return;
  }
  const lock = verifyHiweb({
    rootDir: args.rootDir,
    hiwebDir: args.hiwebDir,
    requireRemote: args.requireRemote,
  });
  process.stdout.write(
    `hiweb-guard: 校验通过（commitSha ${lock.commitSha}，共 ${Object.keys(lock.packages).length} 个离线包${args.requireRemote ? "，已验证 origin/dev 可达" : ""}）\n`,
  );
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;

if (isEntrypoint) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`hiweb-guard 失败：${message}\n`);
    process.exit(1);
  }
}
