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

- **当前演进阶段**：HiWeb 效率库当前处于**制作期**，未发布基线版本统一为 `0.0.1`（制作期日常提交暂不创建 Git 标签，也不向 npm Registry 执行公开发布；公开分发目标为 npm Registry，MIT License）。
- **三阶段演进生命周期**：
  1. **制作期（当前阶段）**：重塑组织结构的产品化定型期。允许为产品化定型直接调整顶层子包划分、职责边界、目录组织与公开 API，不保留向后兼容垫片、废弃别名或兼容分支；消费项目在制作期接入本库开发时，应主动将剥离业务语义后可供多数同平台项目复用的通用基础设施与组件沉淀回 HiWeb 效率库，并同步更新验证消费项目。
  2. **改进完善期**：既定的顶层子包划分、职责边界与组织方式保持冻结不变，仅在既有职责边界内扩充、改进和完善能力与公开接口品质；此阶段仍无需保留代码向后兼容（不留废弃别名或兼容垫片）。
  3. **维护期**：严格冻结模块与子包结构并严格遵守代码向后兼容，日常仅聚焦平台与生态新特性适配及缺陷修复；当确有新增功能诉求时，必须先输出可行性与必要性验证评估报告，并获维护者明确同意后才可实施。
- **阶段切换权限**：演进阶段的切换权完全由维护者按实际成熟度独立决定并显式授权更新；严禁智能体在任务现场自行推定或切换阶段（智能体仅可在观察到成熟信号时给出提醒建议）。
- **与消费项目依赖门禁正交**：本库自身的“三阶段演进生命周期（制作期 / 改进完善期 / 维护期）”管辖库结构可变性、公开接口兼容性与能力沉淀准入；消费项目的“两阶段依赖门禁（开发期 40 位完整 Git SHA 同级源码/离线 `.tgz` 依赖，对外发布、提审或上架期已发布固定版本依赖）”管辖消费端接入形态，二者正交并存、互不替代。
- **裸 `x.y.z` 版本与标签规则**：
  1. **无 `v` 前缀格式**：根工程、全部八个公开子包的版本号定义以及 Git 标签，一律采用不带 `v` 前缀的裸 `x.y.z` 三段数字格式（例如 `0.0.1`、`1.0.0`，禁止使用 `v` 前缀），根工程与全部公开子包版本号保持统一；已正式发布到 npm Registry 的版本号与已发布 Git 标签不可覆盖。
  2. **制作期起步与 `1.0.0` 首发**：制作期统一从 `0.0.1` 起步且日常仅递增 `z`；待首次正式对外发布（向 npm Registry 正式发布，或首个消费项目对外发布/提审上架需锁定已发布正式制品）时定为 `1.0.0`。
  3. **`1.0.0` 后批次演进（`x` / `y` / `z`）**：进入 `1.0.0` 后，按“`x` 代表重大架构/组织/品牌代际、`y` 代表开发期项目周期批次、`z` 代表同批次功能与修复”演进——当同批次中某个消费项目对外发布或提审上架时，将当前 `x.y.z` 正式发布供该项目以已发布固定版本依赖锁定；其余仍在源码开发的消费项目立即切入 `x.(y+1).0` 继续演进，原 `x.y.*` 仅留作已发布项目的独立紧急热修通道。
  4. **智能体升版权限**：智能体在任何版本更新操作中仅被允许递增 `z`；任何对 `x` 或 `y` 的修改、创建 Git 标签或向 npm Registry 发布，必须经维护者明确同意。

## 依赖、组件与离线消费门禁

- **依赖基线**：采用 Node.js 26 LTS + pnpm Workspace + TypeScript 6 严格模式 + ESM。仓库自身开发依赖通过 `pnpm-workspace.yaml` 启用精确锁版本（`saveExact: true`）与延迟安装（`minimumReleaseAge: 1440`）；公开子包对外声明合理的 `peerDependencies` 版本区间。新增或升级外部依赖前先读取 [`docs/engineering/dependencies.md`](docs/engineering/dependencies.md)。
- **UI 组件规范**：修改 `@jashanyng/hiweb-suite` 的设计令牌、主题切换或基础组件前，读取 [`docs/engineering/ui-components.md`](docs/engineering/ui-components.md)。
- **同级源码与离线消费门禁**：消费项目在本地或未发版期间接入 HiWeb 时，必须遵守 [`docs/engineering/sibling-source-dependency.md`](docs/engineering/sibling-source-dependency.md) 的 40 位完整 Git SHA 版本锁与确定性 `.tgz` 同步门禁。

## 验证门禁

- 修改源码、配置、依赖或公开导出后，必须运行全量检查：`pnpm run check`（覆盖 `format:check`、`lint`、依赖环与敏感词检查、`typecheck`、`test:unit`、`build`、`.tgz` 打包与独立 `pnpm` / `npm` 消费工程实测验证）。
- 文档目录结构与维护规范见 [`docs/README.md`](docs/README.md)。
- 保留工作区无关改动，严禁秘密入库。

## Agent skills

### Issue tracker

本仓库的 issue 与 spec 记录在 GitHub Issues（`jashanyng/HiWeb`），通过 `gh` CLI 操作。详见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用默认的五个 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文（single-context）布局：仓库根目录一个 `GLOSSARY.md`，架构决策记录放在 `docs/adr/`。详见 `docs/agents/domain.md`。
