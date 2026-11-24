import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tgzDir = path.join(root, "artifacts/tgz");
const manifestPath = path.join(root, "artifacts/manifest.json");
const guardRelPath = "scripts/hiweb-guard.mjs";
const guardPath = path.join(root, guardRelPath);

rmSync(tgzDir, { recursive: true, force: true });
mkdirSync(tgzDir, { recursive: true });

const guardSha256 = createHash("sha256").update(readFileSync(guardPath)).digest("hex");
const guard = {
  file: guardRelPath,
  sha256: guardSha256,
};

const dirs = readdirSync(path.join(root, "packages")).sort();
const packages = {};

for (const dir of dirs) {
  const pkgDir = path.join(root, "packages", dir);
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  const expectedFile = `${pkg.name.replace(/^@/, "").replace(/\//g, "-")}-${pkg.version}.tgz`;
  execFileSync("pnpm", ["pack", "--pack-destination", tgzDir], { cwd: pkgDir, stdio: "pipe" });
  const tgzPath = path.join(tgzDir, expectedFile);
  const sha256 = createHash("sha256").update(readFileSync(tgzPath)).digest("hex");
  packages[pkg.name] = {
    version: pkg.version,
    tarball: expectedFile,
    sha256,
  };
}

writeFileSync(manifestPath, `${JSON.stringify({ guard, packages }, null, 2)}\n`, "utf8");
console.log(`pack-artifacts: ok (${Object.keys(packages).length} tarballs + guard sha256 generated)`);
