import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import { createCodeQualityRules, createLayeredImportRestrictions } from "./eslint.js";
import { createPrettierPreset } from "./prettier.js";
import { createVitestTestConfig } from "./vitest.js";

function lintImports(
  code: string,
  filename: string,
  options: Parameters<typeof createLayeredImportRestrictions>[0] = {},
) {
  const linter = new Linter({ configType: "flat" });
  const configs = [
    {
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    ...createLayeredImportRestrictions(options),
  ];
  return linter.verify(code, configs as Linter.Config[], { filename });
}

function lintQuality(code: string, filename: string, options: Parameters<typeof createCodeQualityRules>[0] = {}) {
  const linter = new Linter({ configType: "flat" });
  const configs = [
    {
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: {
        "@typescript-eslint": tseslint.plugin,
      },
    },
    ...createCodeQualityRules({ jsxMaxDepth: false, ...options }),
  ];
  return linter.verify(code, configs as Linter.Config[], { filename });
}

describe("tooling presets", () => {
  it("createLayeredImportRestrictions（配置 S）强制五层矩阵与双公开入口", () => {
    // 1. 路由层：page.tsx / layout.tsx 允许公共入口与 server.ts，禁止深层、三级相对与非 UI hiweb 包
    expect(
      lintImports(
        `import { OrderList } from "@/features/orders";
         import { getOrders } from "@/features/orders/server";
         import { UserBadge } from "@/entities/user";
         import { cn } from "@/shared/lib/cn";
         import { env } from "@/server/env";
         import { Button } from "@pcfprio/hiweb-suite/button";
         void [OrderList, getOrders, UserBadge, cn, env, Button];`,
        "src/app/(dashboard)/orders/page.tsx",
      ),
    ).toEqual([]);

    const pageViolations = lintImports(
      `import { OrderTable } from "@/features/orders/components/order-table";
       import { query } from "@/features/orders/server/queries";
       import { schema } from "@/entities/user/schema";
       import { x } from "../../../features/orders";
       import { createBrowserApiClient } from "@pcfprio/hiweb-net/browser-client";
       import { bff } from "@pcfprio/hiweb-next/bff";
       void [OrderTable, query, schema, x, createBrowserApiClient, bff];`,
      "src/app/(dashboard)/orders/page.tsx",
    );
    expect(pageViolations.map((m) => m.ruleId)).toEqual([
      "no-restricted-imports",
      "no-restricted-imports",
      "no-restricted-imports",
      "no-restricted-imports",
      "no-restricted-imports",
      "no-restricted-imports",
    ]);

    const layoutViolations = lintImports(
      `import { sanitizeNextPath } from "@pcfprio/hiweb-core/url";
       void sanitizeNextPath;`,
      "src/app/layout.tsx",
    );
    expect(layoutViolations).toHaveLength(1);

    const appHelperViolations = lintImports(
      `import { createLogger } from "@pcfprio/hiweb-base/logger";
       void createLogger;`,
      "src/app/orders/helpers.ts",
    );
    expect(appHelperViolations).toHaveLength(1);

    // 路由 API route.ts 允许使用 @pcfprio/hiweb-next/bff，但仍禁止功能内部深层导入
    expect(
      lintImports(
        `import { parseJsonBody } from "@pcfprio/hiweb-next/bff";
         import { saveOrder } from "@/features/orders/server";
         void [parseJsonBody, saveOrder];`,
        "src/app/api/orders/route.ts",
      ),
    ).toEqual([]);
    expect(
      lintImports(
        `import { saveOrder } from "@/features/orders/server/mutations";
         void saveOrder;`,
        "src/app/api/orders/route.ts",
      ),
    ).toHaveLength(1);

    // 2. 功能服务端入口与 server/ 目录：允许导入 ./server/* 与 @/server/*，禁止深层跨功能、app 与非 UI hiweb
    expect(
      lintImports(
        `import "server-only";
         import { getOrderList } from "./server/queries";
         import { env } from "@/server/env";
         import { getUser } from "@/features/users/server";
         export { getOrderList, env, getUser };`,
        "src/features/orders/server.ts",
      ),
    ).toEqual([]);
    expect(
      lintImports(
        `import { Page } from "@/app/page";
         import { Card } from "@/features/users/components/card";
         import { createUpstreamClient } from "@pcfprio/hiweb-net/upstream-client";
         void [Page, Card, createUpstreamClient];`,
        "src/features/orders/server/queries.ts",
      ),
    ).toHaveLength(3);

    // 3. 功能客户端代码：禁止 ./server/*、@/server/*、@/features/*/server、@pcfprio/hiweb-next/* 与非 UI hiweb
    expect(
      lintImports(
        `import { Table } from "@pcfprio/hiweb-suite/table";
         import { UserBadge } from "@/entities/user";
         import { api } from "@/shared/api/http";
         import { useOrders } from "../hooks/use-orders";
         void [Table, UserBadge, api, useOrders];`,
        "src/features/orders/components/order-table.tsx",
      ),
    ).toEqual([]);

    // actions.ts 允许导入 ./server/* 与 @/server/*
    expect(
      lintImports(
        `"use server";
         import { saveOrder } from "./server/mutations";
         import { env } from "@/server/env";
         void [saveOrder, env];`,
        "src/features/orders/actions.ts",
      ),
    ).toEqual([]);

    for (const clientFile of [
      "src/features/orders/index.ts",
      "src/features/orders/helpers.ts",
      "src/features/orders/components/order-table.tsx",
      "src/features/orders/hooks/use-orders.ts",
      "src/features/orders/model/reducer.ts",
      "src/features/orders/api/queries.ts",
    ]) {
      const violations = lintImports(
        `import { q } from "./server/queries";
         import { q2 } from "../server/queries";
         import { env } from "@/server/env";
         import { s } from "@/features/users/server";
         import { bff } from "@pcfprio/hiweb-next/bff";
         import { createLogger } from "@pcfprio/hiweb-base/logger";
         void [q, q2, env, s, bff, createLogger];`,
        clientFile,
      );
      expect(violations, `${clientFile} 应拦截全部 6 处违规导入`).toHaveLength(6);
    }

    // extraFeaturePatterns 同步继承到功能客户端文件
    expect(
      lintImports(`import { x } from "axios"; void x;`, "src/features/orders/components/order-table.tsx", {
        extraFeaturePatterns: [{ regex: "^axios$", message: "请使用统一 HTTP 适配层" }],
      }),
    ).toHaveLength(1);

    // 4. 实体层：禁止 app / features / server / 实体深层 / 非 UI hiweb
    expect(
      lintImports(
        `import { Badge } from "@pcfprio/hiweb-suite/badge";
         import { formatDate } from "@/shared/lib/format";
         void [Badge, formatDate];`,
        "src/entities/user/index.ts",
      ),
    ).toEqual([]);
    expect(
      lintImports(
        `import { Order } from "@/features/orders";
         import { Item } from "@/entities/order/item";
         import { env } from "@/server/env";
         import { createLogger } from "@pcfprio/hiweb-base/logger";
         void [Order, Item, env, createLogger];`,
        "src/entities/user/index.ts",
      ),
    ).toHaveLength(4);

    // 5. 共享层：shared/api 与 shared/lib 允许适配非 UI hiweb，shared/ui 与 shared/hooks 仅限 hiweb-suite
    expect(
      lintImports(
        `import { createBrowserApiClient } from "@pcfprio/hiweb-net/browser-client";
         import { createLogger } from "@pcfprio/hiweb-base/logger";
         void [createBrowserApiClient, createLogger];`,
        "src/shared/api/http.ts",
      ),
    ).toEqual([]);
    expect(
      lintImports(
        `import { createBrowserApiClient } from "@pcfprio/hiweb-net/browser-client";
         import { Button } from "@pcfprio/hiweb-suite/button";
         void [createBrowserApiClient, Button];`,
        "src/shared/ui/custom-button.tsx",
      ),
    ).toHaveLength(1);
    expect(
      lintImports(
        `import { env } from "@/server/env";
         import { User } from "@/entities/user";
         import { Order } from "@/features/orders";
         void [env, User, Order];`,
        "src/shared/lib/cn.ts",
      ),
    ).toHaveLength(3);

    // 6. 服务端基础层：允许 @/shared 与 @pcfprio/hiweb-*，禁止逆向依赖 app/features/entities
    expect(
      lintImports(
        `import { createDeploymentGuard } from "@pcfprio/hiweb-core/deployment";
         import { formatDate } from "@/shared/lib/format";
         void [createDeploymentGuard, formatDate];`,
        "src/server/deployment.ts",
      ),
    ).toEqual([]);
    expect(
      lintImports(
        `import { Order } from "@/features/orders";
         import { User } from "@/entities/user";
         void [Order, User];`,
        "src/server/env.ts",
      ),
    ).toHaveLength(2);

    // 7. 测试文件默认豁免
    expect(
      lintImports(
        `import { getOrders } from "@/features/orders/server/queries";
         void getOrders;`,
        "src/features/orders/order.test.tsx",
      ),
    ).toEqual([]);
  });

  it("createLayeredImportRestrictions（配置 C / SPA）约束 routes 并全面禁止 server", () => {
    const violations = lintImports(
      `import { s } from "@/features/orders/server";
       import { internal } from "@/features/orders/components/list";
       import { env } from "@/server/env";
       import { api } from "@pcfprio/hiweb-net/browser-client";
       void [s, internal, env, api];`,
      "src/routes/orders.tsx",
      { runtime: "spa" },
    );
    expect(violations).toHaveLength(4);

    const routeViolationInFeature = lintImports(
      `import { Route } from "@/routes/orders";
       void Route;`,
      "src/features/orders/components/list.tsx",
      { runtime: "spa" },
    );
    expect(routeViolationInFeature).toHaveLength(1);
  });

  it("createCodeQualityRules 强制 3.0 规模上限与质量规则并支持豁免", () => {
    const longBody = Array.from({ length: 155 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    const longFile = Array.from({ length: 405 }, (_, i) => `export const c${i} = ${i};`).join("\n");

    const fnViolations = lintQuality(
      `console.log("debug");\nexport function tooLong(x: any) {\n${longBody}\n  return x;\n}\n`,
      "src/features/orders/view.ts",
    );
    const ruleIds = new Set(fnViolations.map((m) => m.ruleId));
    expect(ruleIds.has("no-console")).toBe(true);
    expect(ruleIds.has("max-lines-per-function")).toBe(true);
    expect(ruleIds.has("@typescript-eslint/no-explicit-any")).toBe(true);

    const fileViolations = lintQuality(longFile, "src/features/orders/big.ts");
    expect(fileViolations.some((m) => m.ruleId === "max-lines")).toBe(true);

    // 复杂度与嵌套深度检查
    const complexFn = `export function complex(a: number) {
      if (a > 0) { if (a > 1) { if (a > 2) { if (a > 3) { if (a > 4) { return 1; } } } } }
      return a === 1 ? 1 : a === 2 ? 2 : a === 3 ? 3 : a === 4 ? 4 : a === 5 ? 5 : a === 6 ? 6 : a === 7 ? 7 : a === 8 ? 8 : a === 9 ? 9 : a === 10 ? 10 : a === 11 ? 11 : 0;
    }`;
    const complexViolations = lintQuality(complexFn, "src/features/orders/logic.ts");
    expect(complexViolations.some((m) => m.ruleId === "max-depth")).toBe(true);
    expect(complexViolations.some((m) => m.ruleId === "complexity")).toBe(true);

    // shared/ui 与 logger 豁免
    expect(lintQuality(longFile, "src/shared/ui/data-table.tsx")).toEqual([]);
    expect(lintQuality(`console.log("ok");\n`, "src/server/logger.ts")).toEqual([]);

    // 默认包含 react/jsx-max-depth 且支持关闭或调级
    const defaultRules = createCodeQualityRules();
    expect(defaultRules[0]?.rules?.["react/jsx-max-depth"]).toEqual(["warn", { max: 6 }]);
  });

  it("Prettier 与 Vitest 预设保持正确", () => {
    const prettier = createPrettierPreset({ tailwindStylesheet: "./src/app/globals.css" });
    expect(prettier.printWidth).toBe(120);
    expect(prettier.plugins).toEqual(["prettier-plugin-tailwindcss"]);

    const vitest = createVitestTestConfig({ setupFiles: ["./vitest.setup.ts"] });
    expect(vitest.environment).toBe("jsdom");
    expect(vitest.restoreMocks).toBe(true);
  });
});
