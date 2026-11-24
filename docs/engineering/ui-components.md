# UI 组件、设计令牌与主题契约

本规范约束 `@pcfprio/hiweb-suite` 的设计令牌、主题管理与通用组件实现。

## 1. 设计令牌（`tokens.css`）

- `@pcfprio/hiweb-suite/tokens.css` 内置 `@source "./";` 声明，使使用 Tailwind CSS v4 的消费项目在 `@import "@pcfprio/hiweb-suite/tokens.css";` 时自动扫描组件产物中的工具类，无需手工配置 `node_modules` 扫描路径。
- 令牌全部采用语义命名（`--background`、`--foreground`、`--card`、`--primary`、`--secondary`、`--muted`、`--accent`、`--destructive`、`--border`、`--input`、`--ring`、`--sidebar-*` 及状态令牌 `--status-success-*` / `--status-warning-*` / `--status-danger-*`）。
- 消费项目可在自身的 `globals.css` 中覆写任意语义变量以呈现独特品牌视觉，组件内部禁止写死具体色号（如 `#005eeb`、`bg-slate-900`）。

## 2. 主题切换与首屏防闪烁

- 支持 `"light" | "dark" | "system"` 三态主题模式，状态通过 `@pcfprio/hiweb-store` 持久化，同步维护 `document.documentElement` 的 `class="dark"` 与 `data-theme`。
- 提供 `createThemeInitScript(options)` 生成内联首屏初始化脚本（严格转义且可配置命名空间），防止服务端渲染与客户端水合之间出现主题闪烁。

## 3. 组件与文案规范

- **精细子路径导出**：每个组件或逻辑组作为独立入口（例如 `@pcfprio/hiweb-suite/button`、`@pcfprio/hiweb-suite/checkbox`、`@pcfprio/hiweb-suite/confirm-dialog`、`@pcfprio/hiweb-suite/table`、`@pcfprio/hiweb-suite/dialog`、`@pcfprio/hiweb-suite/drawer`、`@pcfprio/hiweb-suite/pagination`、`@pcfprio/hiweb-suite/shell`），严禁导出全量组件大 barrel。
- **动画与样式对等依赖**：`packages/suite/package.json` 在 `peerDependencies` 中显式声明 `tw-animate-css` 与 `tailwindcss` 等宿主对等依赖，避免传递依赖缺失。
- **精细客户端指令**：需要状态、事件、Portal 或 Base UI 交互原语的组件文件，第一行必须写 `"use client";`；纯 HTML 语义原语（如 `Table` 系列）保持服务端组件兼容。
- **文案与无障碍**：库内组件默认内置英文中性文案（如 `"Close"`、`"Back"`、`"Previous"`、`"Next"`、`"Confirm"`、`"Cancel"`、`"Processing..."`），所有可见或 `aria-label` 文案均通过明确 Props 或 `labels` 对象允许消费方全量覆盖（例如传中文或 `next-intl` 翻译结果）。
- **无业务耦合**：`SuiteAppShell`、`SuitePanelCard`、`SuitePageHeader`、`SuitePageTabBar`、`SuiteCursorPagination`、`SuiteOffsetPagination` 仅接收纯 UI 导航项和回调，绝不内嵌任何角色名（如 `admin`/`operator`）、环境路由或登录逻辑。
