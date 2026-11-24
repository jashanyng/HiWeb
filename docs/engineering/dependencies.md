# 外部依赖准入与版本锁定规范

## 核心原则

1. **核心层零外部运行时依赖**：`@jashanyng/hiweb-base`、`@jashanyng/hiweb-core`、`@jashanyng/hiweb-store` 仅使用 ECMAScript、WHATWG Web 标准 API（`fetch`、`crypto.subtle`、`URL`、`Intl`），不引入第三方运行时依赖。
2. **宿主栈通过 `peerDependencies` 适配**：`react`、`react-dom`、`next`、`zod`、`@base-ui/react`、`lucide-react`、`sonner`、`tailwindcss`、`server-only` 等声明在对应子包的 `peerDependencies`（必要时辅以 `peerDependenciesMeta` 标记 `optional: true`），避免在消费方构建产物中产生 React 多实例或重复包体积。
3. **本仓开发依赖精确锁定**：根 `package.json` 的 `devDependencies` 与 `pnpm-workspace.yaml` 强制启用 `saveExact: true` 与 `minimumReleaseAge: 1440`，锁文件 `pnpm-lock.yaml` 随源码一同提交，杜绝浮动版本。
4. **禁止预建无真实落地的厂商适配器**：除非某一监控/统计/认证服务已确定明确的技术选型且通过完整打包验证，否则仅在 `@jashanyng/hiweb-base` 保留纯契约与隐私同意门控，不提前引入具体厂商 SDK。

## 当前锁定的工具链与平台基线

| 类别       | 包                                                           | 版本                                     | 归属说明                                         |
| ---------- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------ |
| 运行时     | Node.js / pnpm                                               | 26.13.1 LTS / 12.21.0                    | 全仓 CI 与打包基线                               |
| 语言       | `typescript`                                                 | `6.0.3`                                  | 严守 `< 6.1` 以匹配 `typescript-eslint` 支持范围 |
| UI 基座    | `react` / `react-dom` / `@base-ui/react`                     | `19.3.1` / `1.9.0`                       | `@jashanyng/hiweb-suite` 对等依赖                |
| 样式与图标 | `tailwindcss` / `tw-animate-css` / `lucide-react` / `sonner` | `4.3.5` / `1.4.0` / `1.73.0` / `2.0.8`   | `@jashanyng/hiweb-suite` 对等依赖                |
| 框架适配   | `next` / `server-only`                                       | `16.4.6` / `0.0.1`                       | `@jashanyng/hiweb-next` 对等依赖                 |
| 校验与解析 | `zod` / `yaml`                                               | `4.6.7` / `2.9.1`                        | `contract` 依赖 `yaml`；其余按可选校验注入       |
| 质量与测试 | `eslint` / `typescript-eslint` / `prettier` / `vitest`       | `9.39.5` / `8.73.0` / `3.10.1` / `5.1.1` | 质量检查与测试预设                               |
