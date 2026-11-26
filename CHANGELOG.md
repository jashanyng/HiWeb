# 变更日志（Changelog）

本文件是 HiWeb 效率库所有公开可见版本变更的**唯一事实源**（兼作每次版本更新说明 / Release Notes 的基准）。版本号遵循无 `v` 前缀、无预发布后缀的裸 `x.y.z` 格式；日常未发版改动应随提交记入 `## [Unreleased]`，执行 `pnpm run version:bump` 升版时由脚本自动将 `## [Unreleased]` 正文归档至目标版本节并保留顶部 `## [Unreleased]`。

## [Unreleased]

### 变更

- **`scripts/hiweb-guard.mjs`**：升级 `resolveDefaultHiwebDir(rootDir)` 目录解析优先级，新增基于 `git rev-parse --show-toplevel` 的 Git 仓库根父目录定位与 `--git-common-dir`（含 `.git` 文件指针兜底）主 worktree 回落机制，兼顾独立单仓、多端单仓（Monorepo）各级端目录、linked worktree 及无同级目录的离线单仓 CI 回退。

## [0.0.1]

### 新增

- **`@jashanyng/hiweb-base`**：零外部运行时依赖的纯 TypeScript 基础层，提供 `AppError` / `AppResult` 基础契约、默认脱敏且无全局单例的 `createLogger`、`AnalyticsTracker` / `ErrorReporter` 纯契约与隐私同意门控，以及显式注入 `locale` 与 `timeZone` 的日期/数字格式化器。
- **`@jashanyng/hiweb-core`**：同构 Web 安全原语层，提供基于 Web Crypto AES-256-GCM 的会话密封器、安全 URL 与重定向校验、同源/CSRF 校验与恒定时间字符串比对、可信客户端 IP 提取与滑动窗口限流，以及带 TTL 缓存的部署守卫。
- **`@jashanyng/hiweb-net`**：同构 `fetch` 网络层，提供 `HttpError` / `ClientApiError` / `UpstreamApiError` 分层异常、可插拔响应包络解码器、浏览器端与上游客户端工厂及 SSE 流式读取解析器。
- **`@jashanyng/hiweb-store`**：SSR 安全、带命名空间与可选校验器的非敏感浏览器存储封装，在浏览器存储不可用或 SSR 阶段安全降级，并显式拦截疑似密钥/令牌/会话键名写入。
- **`@jashanyng/hiweb-suite`**：基于 React 19、Tailwind CSS 4 与 Base UI 的品牌中立组件套组，提供 oklch 设计令牌（`tokens.css`）、三态无闪烁主题切换原语、常用交互/表格/对话框/分页组件与通用侧栏外壳原语，并采用精细子路径导出（不设全量 barrel）。
- **`@jashanyng/hiweb-next`**：面向 Next.js 16 的薄适配层，提供安全响应头、`proxy` 会话续期辅助、`server-only` BFF 请求解析/错误映射原语与 RSC 页面查询异常映射。
- **`@jashanyng/hiweb-contract`**：面向开发期的 OpenAPI YAML 与 Zod v4 Schema 离线契约漂移核对引擎（基于 `yaml` 与 `zod` peer 依赖）。
- **`@jashanyng/hiweb-tooling`**：面向开发期的 ESLint 五层双入口分层边界规则、Prettier 与 Vitest 通用配置预设。
- **工程与分发基线**：确立 pnpm Workspace 精确锁版本基线、`check-dep-graph.mjs` 版本/依赖环/业务词与治理文档校验、`bump-version.mjs` 统一改版与自动归档、`pack-artifacts.mjs` 确定性 `.tgz` 打包、`hiweb-guard.mjs` 40 位 SHA 版本锁守护以及 `verify-pack.mjs` 独立消费冒烟验证。
