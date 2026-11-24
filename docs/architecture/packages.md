# 子包拓扑与依赖边界

HiWeb 效率库采用 pnpm Workspace 多包结构，严格遵循**单向无环依赖**与**按需显式引入**，不提供强行捆绑全部运行时和三方依赖的总包。

## 依赖拓扑

```text
@jashanyng/hiweb-base          (纯 TS，零外部依赖)
  ▲        ▲        ▲
  │        │        └──────────────┐
  │        │                       ▼
  │   @jashanyng/hiweb-core     @jashanyng/hiweb-store
  │        ▲                       ▲
  ├────────┼───────────┐           │
  │        │           │           │
  ▼        │           ▼           │
@jashanyng/hiweb-net   @jashanyng/hiweb-suite
  ▲        ▲
  │        │
  └────────┴── @jashanyng/hiweb-next

独立开发工具包（仅 devDependencies）：
- @jashanyng/hiweb-contract    (OpenAPI YAML ↔ Zod 核对引擎)
- @jashanyng/hiweb-tooling     (ESLint / Prettier / Vitest 预设)
```

## 子包边界说明

1. **`@jashanyng/hiweb-base`**（同构零依赖）
   - 承载 `AppError` / `AppResult`、`createLogger`（默认脱敏、无全局单例）、`AnalyticsTracker` / `ErrorReporter` 纯契约与隐私同意门控、`createDateFormatter` / `createNumberFormatter`（显式注入 `locale` 与 `timeZone`）。
2. **`@jashanyng/hiweb-core`**（同构 Web 标准 API）
   - 承载 Web Crypto AES-256-GCM 会话密封器（`createSessionCipher`）、`sanitizeNextPath` / `isSafeHttpUrl` / Query 编解码、同源校验与恒定时间字符串比对、可信客户端 IP 提取与滑动窗口限流、带 TTL 缓存的 `createDeploymentGuard`。
3. **`@jashanyng/hiweb-net`**（同构 `fetch`）
   - 承载 `HttpError` / `ClientApiError` / `UpstreamApiError`、可插拔响应包络解码器（标准 `{ code, message, data }` 与裸 REST JSON）、浏览器 API 客户端工厂（支持 401 统一回调）、上游客户端工厂、SSE 流式读取与解析器（支持统一 401 拦截）。
4. **`@jashanyng/hiweb-store`**（浏览器非敏感存储）
   - 承载带命名空间、可选校验器、SSR/隐私模式自动降级的客户端存储；显式阻断敏感键名写入。
5. **`@jashanyng/hiweb-suite`**（React 19 + Tailwind CSS 4 + Base UI）
   - 提供品牌中立的 oklch 设计令牌（`tokens.css`）、三态无闪烁主题切换原语、通用基础组件（含 `table`、`confirm-dialog`、基于 `@base-ui/react` 的 `checkbox` 等）、偏移分页与游标分页控件、Toaster 封装及无业务语义的侧栏应用外壳原语（`SuiteAppShell`、`SuitePanelCard`、`SuitePageHeader`、`SuitePageTabBar`）。
   - 采用精细子路径导出（如 `@jashanyng/hiweb-suite/button`），不建全量组件 barrel。
6. **`@jashanyng/hiweb-next`**（Next.js 16 薄适配层）
   - 仅封装安全响应头（默认含 `content-security-policy: frame-ancestors 'none'` 并支持覆盖）、`proxy` 会话续期辅助、`server-only` BFF 解析/错误映射/过期跳转原语与 RSC 页面查询异常映射；业务角色鉴权与路由规则由消费方按薄包装自行编排。
7. **`@jashanyng/hiweb-contract`** & **`@jashanyng/hiweb-tooling`**
   - 仅面向开发/构建/测试期使用，严禁进入前端或服务端生产打包产物；`@jashanyng/hiweb-tooling/eslint` 提供五层双入口（`index.ts` / `server.ts`）分层导入限制与代码质量规模预设。
