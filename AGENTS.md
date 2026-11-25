# AGENTS.md

本文件是 HiWeb（专名“HiWeb 效率库”，规则与文档叙述使用该专名，仓库名、npm 包名与代码标识符保持原样）的智能体协作规则，`CLAUDE.md` 通过 `@AGENTS.md` 导入本文件。

HiWeb 是与任何具体项目或业务无关、面向公开分发标准的 TypeScript / React / Next.js 模块化效率库。

## 文档语言

项目级智能体规则与协作/领域文档（`AGENTS.md`、`docs/agents/*.md`、`GLOSSARY.md`、`GLOSSARY-MAP.md`、`docs/adr/*.md`、Issue / PR / Spec 正文等）一律使用简体中文撰写。命令、路径、代码标识符、仓库名、固定标签名（如 `needs-triage`）以及技能要求固定的标题锚点保持原样。

## 核心立项定位与设计哲学

1. **严格业务与项目无关**：本库绝不引入任何具体项目的域名、Cookie 前缀、环境变量前缀、业务角色枚举、固定后端接口路径或品牌色值。时区、语言、包络格式、密钥前缀与文案全部通过显式配置或工厂参数注入。
2. **单向无环分层与契约隔离**：
   - 首期仅允许 8 个高内聚子包：`@jashanyng/hiweb-base`、`@jashanyng/hiweb-core`、`@jashanyng/hiweb-net`、`@jashanyng/hiweb-store`、`@jashanyng/hiweb-suite`、`@jashanyng/hiweb-next`、`@jashanyng/hiweb-contract`、`@jashanyng/hiweb-tooling`。
   - **不设大杂烩聚合总包**：消费方按自身运行时边界显式安装所需子包。依赖关系必须严格单向无环，具体层级见 [`docs/architecture/packages.md`](docs/architecture/packages.md)。
   - 第三方库类型不穿透自有契约；React、Next.js、Base UI、Lucide、Sonner、Tailwind CSS 等通过 `peerDependencies` 适配，避免多实例冲突与冗余打包。
3. **严守 Web 运行时边界**：
   - 清晰隔离纯同构 TS（`base` / `core` / `net`）、服务端专属（`next` 中以 `import "server-only"` 开头）、浏览器存储（`store` 含 SSR 安全降级）与 React 客户端组件（`suite` 交互组件第一行显式写 `"use client";`）。
   - **严禁模块级可变全局单例**：防止 SSR 多用户并发请求下产生状态串扰或数据泄漏；日志、埋点、错误上报与 API 客户端一律通过工厂显式创建并注入。
   - **禁止破坏 Tree-shaking 的全量桶文件**：`@jashanyng/hiweb-suite` 通过精细子路径 `exports` 按组件导出，不建重 export 全部组件的根目录 barrel。
4. **默认隐私与安全优先**：
   - 结构化日志默认自动脱敏敏感键名与认证头部格式；是否放宽脱敏由宿主在构造实例时显式声明并自负其责，本库不内置业务渠道或环境策略。
   - 埋点（`AnalyticsTracker`）与错误上报（`ErrorReporter`）首期仅在 `base` 沉淀纯 TS 契约与隐私同意门控（`PrivacyConsentStatus`）+ Noop/Console 适配，不预建无真实落地需求的厂商 SDK 包。
   - 浏览器存储（`store`）仅用于非敏感客户端偏好，显式拦截并拒绝疑似密钥/令牌/会话键名的写入，防误存凭据。

## 演进生命周期与版本规则

- **当前阶段与基线**：当前处于**制作期**，未发布基线为裸格式 `0.0.1`（公开分发目标为 npm Registry，MIT License；制作期日常提交不打 Git 标签、不向 npm 发布）。
- **裸 `x.y.z` 版本与升版门禁**：根工程与全部公开子包统一使用无 `v` 前缀、无预发布后缀的裸 `x.y.z`（由 `scripts/check-dep-graph.mjs` 强制校验；根 [`CHANGELOG.md`](CHANGELOG.md) 与 [`docs/compatibility.md`](docs/compatibility.md) 版本同步由 `scripts/governance-docs.mjs` 强制校验）；改版统一经 `pnpm run version:bump` 执行，脚本会调用 `scripts/governance-docs.mjs` 自动将根 [`CHANGELOG.md`](CHANGELOG.md) 中 `## [Unreleased]` 正文归档至目标版本节（为空时填入 `- 版本号对齐（无行为变更）。`）。AI 仅可递增 `z`，切换演进阶段、修改 `x`/`y`（须传 `--allow-xy-bump`）、打标签或发 npm 须获维护者明确同意。
- **治理文档同步维护**：修改公开子包 API、导出边界、行为契约或工具链约束时，必须同步更新根 [`CHANGELOG.md`](CHANGELOG.md) 的 `## [Unreleased]`；变更运行环境/依赖基线、接入方式或跨版本兼容性契约时，必须同步更新 [`docs/compatibility.md`](docs/compatibility.md) 与根 [`README.md`](README.md)。
- **规则触发指针**：调整子包结构或接口兼容性、跨项目沉淀通用能力、评估维护期新增功能、或切换演进阶段/`x.y.z` 版本批次前，读取 [`../tech-specs/common/adoption.md#4-效率库准入规则与两阶段门禁`](../tech-specs/common/adoption.md#4-效率库准入规则与两阶段门禁)（本机无同级目录时回退读取 GitHub `jashanyng/tech-specs` 同路径；与消费端两阶段依赖门禁正交）。

## 依赖、组件与离线消费门禁

- **依赖基线**：采用 Node.js 26 LTS + pnpm Workspace + TypeScript 6 严格模式 + ESM。仓库自身开发依赖通过 `pnpm-workspace.yaml` 启用精确锁版本（`saveExact: true`）与延迟安装（`minimumReleaseAge: 1440`）；公开子包对外声明合理的 `peerDependencies` 版本区间。新增或升级外部依赖前先读取 [`docs/engineering/dependencies.md`](docs/engineering/dependencies.md)。
- **UI 组件规范**：修改 `@jashanyng/hiweb-suite` 的设计令牌、主题切换或基础组件前，读取 [`docs/engineering/ui-components.md`](docs/engineering/ui-components.md)。
- **同级源码与离线消费门禁**：消费项目在本地或未发版期间接入 HiWeb 时，必须遵守 [`docs/engineering/sibling-source-dependency.md`](docs/engineering/sibling-source-dependency.md) 的 40 位完整 Git SHA 版本锁与确定性 `.tgz` 同步门禁。

## 验证门禁

- 修改源码、配置、依赖、公开导出或版本/治理文档后，必须运行全量检查：`pnpm run check`（覆盖 `format:check`、`lint`（含 `scripts/check-dep-graph.mjs` 版本/依赖环/禁用业务词校验与 `scripts/governance-docs.mjs` 的 `CHANGELOG.md`/`docs/compatibility.md` 版本同步检查）、`typecheck`、`test:unit`、`build`、`.tgz` 打包与独立 `pnpm` / `npm` 消费工程实测验证）。
- 文档目录结构与维护规范见 [`docs/README.md`](docs/README.md)。
- 保留工作区无关改动，严禁秘密入库。

## Agent skills

### Issue tracker

本仓库的 issue 与 spec 记录在 GitHub Issues（`jashanyng/HiWeb`），通过 `gh` CLI 操作。详见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用默认的五个 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文（single-context）布局：仓库根目录一个 `GLOSSARY.md`，架构决策记录放在 `docs/adr/`。详见 `docs/agents/domain.md`。
