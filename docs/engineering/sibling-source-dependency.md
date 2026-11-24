# 消费项目的同级源码与版本锁门禁

本规范适用于尚未从公开 npm Registry 安装、而以同级仓库源码打包制品（`.tgz`）接入 HiWeb 效率库的任何消费项目。

## 布局与版本锁身份

1. 将 HiWeb 作为独立 Git 仓库检出在消费仓库同级目录（如 `../HiWeb`），**禁止使用 Git Submodule 或 gitlink**。
2. 消费仓库根目录提交统一结构的版本锁文件 `hiweb.lock.json`，明确记录：
   - `schemaVersion`（固定为 `1`）与 HiWeb 公开仓库地址 `repository`；
   - `commitSha`：**40 位完整 Git commit SHA**（分支名、tag、本地 `HEAD` 或未提交改动不能代替该锁）；
   - `packages`：按消费仓实际声明的直接依赖及其内部传递闭包所需的子包清单，每项仅记录 `version`、`tarball`（文件名）与 64 位 `sha256` 摘要。
3. 消费项目通过 `package.json` 声明实际消费的直接 `@jashanyng/hiweb-*` 包，并在 `pnpm-workspace.yaml#overrides` 中将闭包内全部所需子包锁定为 `"file:./vendor/hiweb/<tarball>"`，同时提交 `pnpm-lock.yaml` 与 `vendor/hiweb/*.tgz`，确保单仓离线 `pnpm install --frozen-lockfile`、Docker 构建与单仓 CI 100% 自洽。
4. `scripts/hiweb-guard.mjs` 是唯一权威、零第三方依赖的守护脚本，其 SHA-256 哈希写入 `artifacts/manifest.json#guard`。消费仓通过 `--sync` 自动复制更新 `scripts/hiweb-guard.mjs`，杜绝多仓副本分叉。
5. 消费项目自身代码只允许从公开包名及 `exports` 声明的子路径导入（例如 `@jashanyng/hiweb-suite/button`），严禁直接引用 `../HiWeb/packages/*/src` 内部路径。

## 必须接入的硬性门禁

| 阶段入口                           | 必须阻断的异常状态                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地 Verification（`pnpm check`）  | `hiweb.lock.json` 缺失、格式非法或 `commitSha` 非 40 位十六进制 SHA；`vendor/hiweb/*.tgz` 缺失或 SHA-256 不一致；`pnpm-workspace.yaml#overrides` / `pnpm-lock.yaml` 未对齐本地 tarball 与 SHA-512；残留 `package-lock.json`；若同级存在 `HiWeb` 目录，其工作区不干净、`HEAD` 与 `commitSha` 不符或消费仓 `scripts/hiweb-guard.mjs` 哈希与权威脚本不一致 |
| Git Push（`pre-push`）与部署构建前 | 上述全部状态；且锁定 `commitSha` 尚未到达 HiWeb 的 `origin/dev`（必要时先 `git fetch`）                                                                                                                                                                                                                                                                 |
| 独立单仓 CI（无同级 `HiWeb` 目录） | `hiweb.lock.json` 格式非法、`commitSha` 非 40 位、`vendor/hiweb/*.tgz` 缺失/SHA-256 校验失败，或 `pnpm-lock.yaml` 本地 tarball 完整性异常                                                                                                                                                                                                               |

## 标准更新与交付顺序

1. 在 HiWeb 仓库完成修改并通过全量 `pnpm run check`。
2. 在 HiWeb 提交并推送到远端 `origin/dev`，获取并核实新的 **40 位完整 commit SHA**。
3. 在消费仓库运行 `node scripts/hiweb-guard.mjs --sync` 同步权威 `scripts/hiweb-guard.mjs`、`vendor/hiweb/*.tgz`、`hiweb.lock.json` 与 `pnpm-workspace.yaml#overrides`，再执行 `pnpm install` 刷新 `pnpm-lock.yaml`。
4. 在消费仓库执行 `node scripts/hiweb-guard.mjs --verify --require-remote` 与全量 `pnpm check` 后，再提交并推送消费仓库。绝不允许远端消费提交指向尚未推送到 HiWeb `origin/dev` 的提交。
