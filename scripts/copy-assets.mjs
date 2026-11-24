import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcCss = path.join(root, "packages/suite/src/tokens.css");
const distDir = path.join(root, "packages/suite/dist");
const destCss = path.join(distDir, "tokens.css");

if (!existsSync(srcCss)) {
  throw new Error(`Missing source asset: ${srcCss}`);
}
mkdirSync(distDir, { recursive: true });
copyFileSync(srcCss, destCss);
console.log("copy-assets: ok (packages/suite/dist/tokens.css)");
