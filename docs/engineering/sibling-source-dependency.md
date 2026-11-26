# 消费项目的同级源码与版本锁门禁

本规范适用于尚未从公开 npm Registry 安装、而以同级仓库源码打包制品（`.tgz`）接入 HiWeb 效率库的任何消费项目。

## 布局与版本锁身份

1. 将 HiWeb 作为独立 Git 仓库检出在消费仓库（无论独立单仓还是多端单仓）的**工作区根父目录**下（独立单仓为 `../HiWeb`，多端单仓一级端目录如 `<monorepo>/console` 对应相对路径为 `../../HiWeb`，深层子目录按实际相对深度向上定位），**禁止使用 Git Submodule 或 gitlink**。
2. `scripts/hiweb-guard.mjs` 是唯一权威、零第三方依赖的守护脚本，其 SHA-256 哈希写入 `artifacts/manifest.json#guard`。`resolveDefaultHiwebDir(rootDir)` 按以下优先级解析同级 `HiWeb` 目录：
   1. `process.env.HIWEB_DIR`：显式绝对或相对路径覆盖（仅改变检出目录，绝不放宽任何校验）；
   2. `path.resolve(resolvedRoot, "../HiWeb")`：若存在则直接命中，兼容原有独立单仓布局与无 `.git` 测试目录；
   3. Git 仓库根父目录：通过 `git -C <rootDir> rev-parse --show-toplevel` 获取 `repoRoot`，检查 `path.resolve(repoRoot, "../HiWeb")`，支持多端单仓一级及深层子目录；
   4. 主 worktree 仓库根父目录：通过 `git -C <rootDir> rev-parse --path-format=absolute --git-common-dir`（及 `.git` 文件指针兜底）获取 `mainRepoRoot`，检查 `path.resolve(mainRepoRoot, "../HiWeb")`，支持独立单仓与多端单仓 linked worktree；
   5. 离线回退路径：以上目录均不存在时，优先返回 `path.resolve(repoRoot, "../HiWeb")`（非 Git 目录返回 `../HiWeb`），确保云端单仓 CI 无同级目录时正常进入离线校验路径。
3. 消费仓库或对应端目录提交统一结构的版本锁文件 `hiweb.lock.json`，明确记录：
   - `schemaVersion`（固定为 `1`）与 HiWeb 公开仓库地址 `repository`；
   - `commitSha`：**40 位完整 Git commit SHA**（分支名、tag、本地 `HEAD` 或未提交改动不能代替该锁）；
   - `packages`：按消费端实际声明的直接依赖及其内部传递闭包所需的子包清单，每项仅记录 `version`、`tarball`（文件名）与 64 位 `sha256` 摘要。
4. 消费项目通过 `package.json` 声明实际消费的直接 `@jashanyng/hiweb-*` 包，并在 `pnpm-workspace.yaml#overrides` 中将闭包内全部所需子包锁定为 `"file:./vendor/hiweb/<tarball>"`，同时提交 `pnpm-lock.yaml` 与 `vendor/hiweb/*.tgz`，确保单仓离线 `pnpm install --frozen-lockfile`、Docker 构建与单仓 CI 100% 自洽。
5. 消费项目通过 `--sync` 自动复制更新 `scripts/hiweb-guard.mjs`，杜绝多仓副本分叉。
6. 消费项目自身代码只允许从公开包名及 `exports` 声明的子路径导入（例如 `@jashanyng/hiweb-suite/button`），严禁直接引用同级 `HiWeb/packages/*/src` 内部路径。

## 必须接入的硬性门禁

| 阶段入口                           | 必须阻断的异常状态                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地 Verification（`pnpm check`）  | `hiweb.lock.json` 缺失、格式非法或 `commitSha` 非 40 位十六进制 SHA；`vendor/hiweb/*.tgz` 缺失或 SHA-256 不一致；`pnpm-workspace.yaml#overrides` / `pnpm-lock.yaml` 未对齐本地 tarball 与 SHA-512；残留 `package-lock.json`；若同级存在 `HiWeb` 目录，其工作区不干净、`HEAD` 与 `commitSha` 不符或消费仓 `scripts/hiweb-guard.mjs` 哈希与权威脚本不一致 |
| Git Push（`pre-push`）与部署构建前 | 上述全部状态；且锁定 `commitSha` 尚未到达 HiWeb 的 `origin/dev`（必要时先 `git fetch`）                                                                                                                                                                                                                                                                 |
| 独立单仓 CI（无同级 `HiWeb` 目录） | `hiweb.lock.json` 格式非法、`commitSha` 非 40 位、`vendor/hiweb/*.tgz` 缺失/SHA-256 校验失败，或 `pnpm-lock.yaml` 本地 tarball 完整性异常                                                                                                                                                                                                               |

## 标准更新与交付顺序

1. 在 HiWeb 仓库完成修改并通过全量 `pnpm run check`。
2. 在 HiWeb 提交并推送到远端 `origin/dev`，获取并核实新的 **40 位完整 commit SHA**。
3. **消费端首次接入或从旧版守护脚本升级时**（消费端尚未同步包含多端单仓定位的新版 `scripts/hiweb-guard.mjs` 前），在消费端根目录（如独立单仓根或 `<monorepo>/<端>`）先直接调用同级权威守护脚本同步升级：
   ```sh
   # 多端单仓一级端目录（如 <monorepo>/console）；深层子目录按实际相对深度向上定位，独立单仓为 ../HiWeb
   node ../../HiWeb/scripts/hiweb-guard.mjs --sync --root-dir .
   pnpm install
   node scripts/hiweb-guard.mjs --verify --require-remote
   ```
4. 完成首次同步后，消费端已持有最新 `scripts/hiweb-guard.mjs` 副本；后续日常升级直接在消费端根目录运行 `node scripts/hiweb-guard.mjs --sync` 同步权威脚本、`vendor/hiweb/*.tgz`、`hiweb.lock.json` 与 `pnpm-workspace.yaml#overrides`，再执行 `pnpm install` 刷新 `pnpm-lock.yaml`。
5. 在消费端执行 `node scripts/hiweb-guard.mjs --verify --require-remote` 与全量 `pnpm check` 后，再提交并推送消费仓库。绝不允许远端消费提交指向尚未推送到 HiWeb `origin/dev` 的提交。
