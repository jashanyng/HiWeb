import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(root, "packages");

const ALLOWED_INTERNAL_DEPS = {
  "@pcfprio/hiweb-base": new Set([]),
  "@pcfprio/hiweb-core": new Set(["@pcfprio/hiweb-base"]),
  "@pcfprio/hiweb-net": new Set(["@pcfprio/hiweb-base", "@pcfprio/hiweb-core"]),
  "@pcfprio/hiweb-store": new Set(["@pcfprio/hiweb-base"]),
  "@pcfprio/hiweb-suite": new Set(["@pcfprio/hiweb-base", "@pcfprio/hiweb-store"]),
  "@pcfprio/hiweb-next": new Set(["@pcfprio/hiweb-base", "@pcfprio/hiweb-core", "@pcfprio/hiweb-net"]),
  "@pcfprio/hiweb-contract": new Set([]),
  "@pcfprio/hiweb-tooling": new Set([]),
};

const FORBIDDEN_BUSINESS_TERMS = [
  /atlashub/i,
  /quizmind/i,
  /willscurated/i,
  /willaspired/i,
  /hot_feed/i,
  /asia\/shanghai/i,
];

const graph = new Map();

for (const dir of readdirSync(packagesDir)) {
  const pkgPath = path.join(packagesDir, dir, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const allowed = ALLOWED_INTERNAL_DEPS[pkg.name];
  if (!allowed) {
    throw new Error(`Unexpected package "${pkg.name}" in packages/${dir}`);
  }
  const internalDeps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith("@pcfprio/hiweb-"));
  for (const dep of internalDeps) {
    if (!allowed.has(dep)) {
      throw new Error(`Forbidden internal dependency: ${pkg.name} -> ${dep}`);
    }
  }
  graph.set(pkg.name, internalDeps);
}

// 深度优先环检测
const state = new Map();
function visit(node) {
  const s = state.get(node);
  if (s === 1) throw new Error(`Dependency cycle detected at ${node}`);
  if (s === 2) return;
  state.set(node, 1);
  for (const dep of graph.get(node) ?? []) visit(dep);
  state.set(node, 2);
}
for (const name of graph.keys()) visit(name);

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

for (const dir of readdirSync(packagesDir)) {
  const srcDir = path.join(packagesDir, dir, "src");
  for (const file of walkSourceFiles(srcDir)) {
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_BUSINESS_TERMS) {
      if (pattern.test(content)) {
        throw new Error(`Business-specific term (${pattern}) leaked into ${path.relative(root, file)}`);
      }
    }
  }
}

console.log(`check-dep-graph: ok (${graph.size} packages, acyclic & business-agnostic)`);
