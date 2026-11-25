import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BARE_SEMVER_RE = /^\d+\.\d+\.\d+$/;

const ALLOWED_INTERNAL_DEPS = {
  "@jashanyng/hiweb-base": new Set([]),
  "@jashanyng/hiweb-core": new Set(["@jashanyng/hiweb-base"]),
  "@jashanyng/hiweb-net": new Set(["@jashanyng/hiweb-base", "@jashanyng/hiweb-core"]),
  "@jashanyng/hiweb-store": new Set(["@jashanyng/hiweb-base"]),
  "@jashanyng/hiweb-suite": new Set(["@jashanyng/hiweb-base", "@jashanyng/hiweb-store"]),
  "@jashanyng/hiweb-next": new Set(["@jashanyng/hiweb-base", "@jashanyng/hiweb-core", "@jashanyng/hiweb-net"]),
  "@jashanyng/hiweb-contract": new Set([]),
  "@jashanyng/hiweb-tooling": new Set([]),
};

const FORBIDDEN_BUSINESS_TERMS = [
  /atlashub/i,
  /quizmind/i,
  /willscurated/i,
  /willaspired/i,
  /hot_feed/i,
  /asia\/shanghai/i,
];

/**
 * @param {string} version
 * @param {string} label
 */
function assertBareSemver(version, label) {
  if (typeof version !== "string" || !BARE_SEMVER_RE.test(version)) {
    throw new Error(`${label} 的 version 必须为无 v 前缀、无预发布后缀的裸 x.y.z 格式：${String(version)}`);
  }
}

/** @param {string} dir */
function walkSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkSourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * 校验工作区根与子包版本号一致性及裸格式、内部依赖拓扑无环及无业务特定术语泄漏。
 * @param {string} rootDir
 */
export function checkDepGraph(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const rootPkgPath = path.join(resolvedRoot, "package.json");
  if (!existsSync(rootPkgPath)) {
    throw new Error(`Missing root package.json at ${rootPkgPath}`);
  }
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  assertBareSemver(rootPkg.version, "package.json");
  const expectedVersion = rootPkg.version;

  const packagesDir = path.join(resolvedRoot, "packages");
  if (!existsSync(packagesDir)) {
    throw new Error(`Missing packages directory at ${packagesDir}`);
  }

  /** @type {Map<string, string[]>} */
  const graph = new Map();

  for (const dir of readdirSync(packagesDir).sort()) {
    const pkgPath = path.join(packagesDir, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    assertBareSemver(pkg.version, `packages/${dir}/package.json (${pkg.name})`);
    if (pkg.version !== expectedVersion) {
      throw new Error(
        `Version mismatch: packages/${dir}/package.json (${pkg.name}) is "${pkg.version}", expected "${expectedVersion}" matching root package.json`,
      );
    }
    const allowed = ALLOWED_INTERNAL_DEPS[pkg.name];
    if (!allowed) {
      throw new Error(`Unexpected package "${pkg.name}" in packages/${dir}`);
    }
    const internalDeps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith("@jashanyng/hiweb-"));
    for (const dep of internalDeps) {
      if (!allowed.has(dep)) {
        throw new Error(`Forbidden internal dependency: ${pkg.name} -> ${dep}`);
      }
    }
    graph.set(pkg.name, internalDeps);
  }

  if (graph.size === 0) {
    throw new Error(`No workspace packages found under ${packagesDir}`);
  }

  // 深度优先环检测
  const state = new Map();
  /** @param {string} node */
  function visit(node) {
    const s = state.get(node);
    if (s === 1) throw new Error(`Dependency cycle detected at ${node}`);
    if (s === 2) return;
    state.set(node, 1);
    for (const dep of graph.get(node) ?? []) visit(dep);
    state.set(node, 2);
  }
  for (const name of graph.keys()) visit(name);

  for (const dir of readdirSync(packagesDir)) {
    const srcDir = path.join(packagesDir, dir, "src");
    for (const file of walkSourceFiles(srcDir)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_BUSINESS_TERMS) {
        if (pattern.test(content)) {
          throw new Error(`Business-specific term (${pattern}) leaked into ${path.relative(resolvedRoot, file)}`);
        }
      }
    }
  }

  return { packageCount: graph.size, version: expectedVersion };
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;

if (isEntrypoint) {
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkDepGraph(defaultRoot);
  console.log(
    `check-dep-graph: ok (${result.packageCount} packages, version ${result.version}, acyclic & business-agnostic)`,
  );
}
