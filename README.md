# HiWeb

**HiWeb**（HiWeb 效率库）是一套与具体项目和业务无关的 TypeScript / React / Next.js 模块化基础设施效率库，按“分层清晰、契约隔离、默认安全、按需引入”原则设计。

## 子包一览

| 子包                      | 定位                                                                             | 运行环境                      |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| `@pcfprio/hiweb-base`     | 零依赖纯 TS 基础模型、结构化脱敏日志、统计/错误上报契约、可配时区格式化          | 同构（Node / Edge / Browser） |
| `@pcfprio/hiweb-core`     | Web Crypto AES-256-GCM 会话密封、安全 URL/重定向校验、同源/CSRF 与限流、部署守卫 | 同构（标准 Web API）          |
| `@pcfprio/hiweb-net`      | HttpError、可插拔包络解包、浏览器/上游 `fetch` 客户端工厂、SSE 流式读取          | 同构（Browser / Server）      |
| `@pcfprio/hiweb-store`    | SSR 安全、带命名空间与 Schema 校验的非敏感浏览器存储（禁存凭据）                 | 浏览器（SSR 降级）            |
| `@pcfprio/hiweb-suite`    | React 19 + Tailwind CSS 4 + Base UI 通用基础组件、主题切换原语、通用侧栏外壳     | React Client / Server         |
| `@pcfprio/hiweb-next`     | Next.js 16 薄适配层：安全响应头、`proxy` 会话续期、BFF 请求原语、RSC 辅助        | Next.js 服务端 / Proxy        |
| `@pcfprio/hiweb-contract` | OpenAPI YAML ↔ Zod Schema 离线契约漂移核对引擎                                   | Node（`devDependency`）       |
| `@pcfprio/hiweb-tooling`  | ESLint 分层限制规则、Prettier、Vitest 通用配置预设                               | Node（`devDependency`）       |

## 本地开发与全量验证

```sh
pnpm install --frozen-lockfile
pnpm run check
```

更多工程文档见 [`docs/README.md`](docs/README.md)。
