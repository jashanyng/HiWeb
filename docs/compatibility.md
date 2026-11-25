# HiWeb 兼容性矩阵与版本契约

本文档定义 HiWeb 效率库（`@jashanyng/hiweb-*`）的运行环境、依赖基线、三阶段演进与版本兼容契约，以及消费端升级与迁移指引。

## 环境与依赖兼容矩阵

### 工具链与模块基线

| 维度                  | 基线要求                                                         | 说明                                                                                                               |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Node.js               | `>=26`（仓库验证基线 `26.13.1 LTS`）                             | 根 `package.json` 声明 `engines.node: ">=26"`                                                                      |
| 包管理器              | `pnpm 12.21.0`                                                   | 根 `package.json` 声明 `packageManager: "pnpm@12.21.0"`；工作区启用 `saveExact: true` 与 `minimumReleaseAge: 1440` |
| TypeScript & 模块格式 | TypeScript `6.0.3`（严守 `< 6.1`）、纯 ESM（`"type": "module"`） | 构建目标 `ES2023`、`module: "ESNext"`、`moduleResolution: "bundler"`、`strict: true`、`verbatimModuleSyntax: true` |

### 子包依赖与 `peerDependencies` 矩阵

所有 `@jashanyng/hiweb-*` 子包当前统一使用版本号 `0.0.1`、`"type": "module"`、`MIT` License，除 `@jashanyng/hiweb-contract` 运行时依赖 `yaml: "2.9.1"` 外，内部跨包依赖严格单向无环，其余外部框架与工具库均通过 `peerDependencies` 对齐：

| 子包                        | 内部依赖（`workspace:*`）                                                | 外部 `dependencies` | `peerDependencies`（及可选标记）                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@jashanyng/hiweb-base`     | 无                                                                       | 无                  | 无                                                                                                                                                                                                                                        |
| `@jashanyng/hiweb-core`     | `@jashanyng/hiweb-base`                                                  | 无                  | 无                                                                                                                                                                                                                                        |
| `@jashanyng/hiweb-net`      | `@jashanyng/hiweb-base`、`@jashanyng/hiweb-core`                         | 无                  | 无                                                                                                                                                                                                                                        |
| `@jashanyng/hiweb-store`    | `@jashanyng/hiweb-base`                                                  | 无                  | 无                                                                                                                                                                                                                                        |
| `@jashanyng/hiweb-suite`    | `@jashanyng/hiweb-base`、`@jashanyng/hiweb-store`                        | 无                  | `@base-ui/react >=1.3.0`、`class-variance-authority >=0.7.0`、`clsx >=2.1.0`、`lucide-react >=1.0.0`、`react >=19.0.0`、`react-dom >=19.0.0`、`sonner >=2.0.0`、`tailwind-merge >=3.0.0`、`tailwindcss >=4.0.0`、`tw-animate-css >=1.0.0` |
| `@jashanyng/hiweb-next`     | `@jashanyng/hiweb-base`、`@jashanyng/hiweb-core`、`@jashanyng/hiweb-net` | 无                  | `next >=16.0.0`、`react >=19.0.0`、`server-only >=0.0.1`                                                                                                                                                                                  |
| `@jashanyng/hiweb-contract` | 无                                                                       | `yaml: "2.9.1"`     | `zod >=4.0.0`                                                                                                                                                                                                                             |
| `@jashanyng/hiweb-tooling`  | 无                                                                       | 无                  | `eslint >=9.0.0`、`eslint-plugin-react >=7.0.0`、`prettier >=3.0.0`、`typescript-eslint >=8.0.0`、`vitest >=4.0.0`（以上 5 项在 `peerDependenciesMeta` 均标记为 `optional: true`）                                                        |

### SSR / Client / Node 运行时边界

| 运行时域                                      | 适用子包 / 入口       | 边界约束                                                                                                                                            |
| --------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯同构（Node / Edge / Browser）               | `base`、`core`、`net` | 仅依赖 ECMAScript 与 WHATWG Web 标准 API（`fetch`、`crypto.subtle`、`URL`、`Intl`）；严禁引入模块级可变全局单例，实例一律通过工厂显式创建并注入     |
| 浏览器（含 SSR 安全降级）                     | `store`               | 面向非敏感客户端偏好存储；SSR 或隐私模式下自动安全降级，显式拦截疑似密钥/令牌/会话键名写入                                                          |
| React Client / Server 组件                    | `suite`               | 交互组件显式声明 `"use client";`；通过精细子路径 `exports` 按组件按需导入（不建全量 barrel），样式令牌通过 `@jashanyng/hiweb-suite/tokens.css` 接入 |
| Next.js 服务端 / Proxy                        | `next`                | `bff` 与 `rsc` 入口以 `import "server-only"` 隔离服务端边界；仅保留薄适配原语，业务鉴权与路由由消费方自行编排                                       |
| 开发 / 构建 / 测试期专属（`devDependencies`） | `contract`、`tooling` | 严禁打入前端浏览器或服务端生产运行产物                                                                                                              |

## 演进阶段与版本兼容契约

### 裸 `x.y.z` 格式与当前基线

- **统一裸格式**：根 `package.json` 与全部 8 个公开子包始终保持同一版本号，统一采用无 `v` 前缀、无预发布后缀的裸 `x.y.z` 三段非负整数格式（由 `scripts/check-dep-graph.mjs` 强制校验）。
- **当前制作期基线（`0.0.1`）**：HiWeb 当前处于**制作期**，未向公开 npm Registry 发布，日常源码提交不预先打 Git 标签。

### 三阶段演进生命周期契约

| 阶段                        | 结构可变性（8 个子包划分）                               | 公开接口向后兼容性                           | 消费方协同方式                                                                             |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **制作期**（当前：`0.0.1`） | 允许按需调整或重构子包划分与整体组织方式                 | **不保留**向后兼容、废弃别名或迁移垫片       | 消费项目处于开发期，随 HiWeb 改动同批更新调用方                                            |
| **改进完善期**              | 子包与模块顶层组织结构**冻结**（突破须获维护者明确批准） | 在既有边界内扩充完善时仍**无需保留**向后兼容 | 发现通用缺口在既有边界内完善，开发期同步更新消费端                                         |
| **维护期**                  | 模块组织结构**严格冻结**                                 | **必须**严格遵守代码与公开接口向后兼容       | 日常聚焦平台适配、安全升级与缺陷修复；新增功能须先提交可行性与必要性评估报告并获维护者批准 |

### `1.0.0` 首发与后续批次、热修语义

- **首发 `1.0.0`**：首个消费项目进入对外发布、提审或上架期并需锁定 npm 正式制品时，经维护者拍板以 `--allow-xy-bump` 切入 `1.0.0` 并打裸 Git 标签 `1.0.0` 发布至 npm Registry。
- **`1.0.0` 后 `x.y.z` 分工**：
  - `x`：重大架构、子包结构或代际跨越（须维护者明确批准）；
  - `y`：开发期项目周期批次。当同批次中某个消费项目切入发布期锁定 `x.y.z` 正式版后，其余仍在同级源码开发的消费项目立即切入 `x.(y+1).0` 继续演进；
  - `z`：同一 `x.y` 批次内的功能扩充与缺陷修复递增（以及已发布 `x.y.*` 分支的独立紧急热修通道）。
- **自动改版门禁**：统一通过 `pnpm run version:bump`（即 `scripts/bump-version.mjs`）更新版本号并同步归档 `CHANGELOG.md`。日常仅允许递增 `z`；修改 `x` 或 `y` 必须获维护者明确同意并显式传入 `--allow-xy-bump`。

## 升级与迁移指南

### 开发期：确定性 `.tgz` + 40 位 SHA 锁同步升级

尚未从公开 npm Registry 安装时，消费仓库遵循 [`docs/engineering/sibling-source-dependency.md`](engineering/sibling-source-dependency.md) 接入：

1. 在 HiWeb 仓库完成修改、执行 `pnpm run check`（包含重新生成 `artifacts/tgz/*.tgz` 与 `artifacts/manifest.json`），提交并推送至 `origin/dev`，记录新的 **40 位完整 Git commit SHA**。
2. 在消费仓库根目录执行守护脚本同步离线制品、40 位 SHA 版本锁与 `pnpm-workspace.yaml#overrides`：
   ```sh
   node scripts/hiweb-guard.mjs --sync
   pnpm install
   ```
3. 在消费仓库执行守护校验与全量检查，确认本地与远端对齐：
   ```sh
   node scripts/hiweb-guard.mjs --verify --require-remote
   pnpm run check
   ```

### 发布期：切换公开 npm 正式版

当消费项目进入对外发布、提审或上架期（且 HiWeb 已在 npm Registry 发布对应裸 `x.y.z` 正式版本）时：

1. 移除消费仓库中 `vendor/hiweb/*.tgz`、`hiweb.lock.json` 与 `pnpm-workspace.yaml#overrides` 中指向 `file:./vendor/hiweb/...` 的本地 tarball 覆盖条目。
2. 在消费仓库 `package.json` 中将所消费的 `@jashanyng/hiweb-*` 直接依赖（以及开发期依赖 `contract` / `tooling`）锁定为对应的精确固定版本号（如 `"1.0.0"`，严禁动态区间）。
3. 重新执行 `pnpm install` 刷新 `pnpm-lock.yaml`，并确认消费仓库发布构建与 `pre-push` 门禁已切换为正式版校验（不再依赖同级源码）。

### 跨版本破坏性变更记录

| 版本切换            | 影响子包      | 破坏性变更摘要                               | 消费方迁移操作                                               |
| ------------------- | ------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `0.0.1`（当前基线） | 全部 8 个子包 | 初始制作期基线建立，暂无历史跨版本破坏性迁移 | 按需安装所需子包并遵守精细子路径 `exports` 与同级 SHA 锁接入 |
