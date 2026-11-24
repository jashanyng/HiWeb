export type RuleSeverity = "error" | "warn";

export type RuntimeMode = "server" | "spa";

export interface RestrictedImportPattern {
  readonly regex: string;
  readonly message: string;
}

export interface LayeredImportRuleOptions {
  readonly runtime?: RuntimeMode;
  readonly severity?: RuleSeverity;
  readonly ignores?: readonly string[];
  readonly appFiles?: readonly string[];
  readonly appPageFiles?: readonly string[];
  readonly appPageIgnores?: readonly string[];
  readonly featureFiles?: readonly string[];
  readonly featureClientFiles?: readonly string[];
  readonly featureClientIgnores?: readonly string[];
  readonly entityFiles?: readonly string[];
  readonly sharedFiles?: readonly string[];
  readonly sharedUiAndHooksFiles?: readonly string[];
  readonly sharedIgnores?: readonly string[];
  readonly serverFiles?: readonly string[];
  readonly testFiles?: readonly string[];
  readonly exemptTestFiles?: boolean;
  readonly extraAppPatterns?: readonly RestrictedImportPattern[];
  readonly extraFeaturePatterns?: readonly RestrictedImportPattern[];
  readonly extraFeatureClientPatterns?: readonly RestrictedImportPattern[];
}

export interface CodeQualityRuleOptions {
  readonly files?: readonly string[];
  readonly ignores?: readonly string[];
  readonly noConsole?: RuleSeverity | false;
  readonly maxLines?: number | false;
  readonly maxLinesSeverity?: RuleSeverity;
  readonly maxLinesPerFunction?: number | false;
  readonly maxLinesPerFunctionSeverity?: RuleSeverity;
  readonly complexity?: number | false;
  readonly complexitySeverity?: RuleSeverity;
  readonly maxDepth?: number | false;
  readonly maxDepthSeverity?: RuleSeverity;
  readonly jsxMaxDepth?: number | false;
  readonly jsxMaxDepthSeverity?: RuleSeverity;
  readonly noExplicitAny?: RuleSeverity | false;
  readonly consistentTypeImports?: RuleSeverity | false;
  readonly sharedUiFiles?: readonly string[];
  readonly testFiles?: readonly string[];
  readonly loggerFiles?: readonly string[];
  readonly scriptFiles?: readonly string[];
}

const ban = (regex: string, message: string): RestrictedImportPattern => ({ regex, message });

const LAYER_PATTERNS = {
  app: ban("^@/app(/|$)", "下层不得依赖路由层 app/。"),
  routes: ban("^@/routes(/|$)", "下层不得依赖路由层 routes/。"),
  features: ban("^@/features(/|$)", "该层不得依赖功能层 features/。"),
  entities: ban("^@/entities(/|$)", "该层不得依赖实体层 entities/。"),
  server: ban("^@/server(/|$)", "客户端或非服务端层不得依赖服务端基础层 server/。"),
  featureDeep: ban("^@/features/[^/]+/(?!server$).+", "跨功能只能从 @/features/<名> 或 @/features/<名>/server 导入。"),
  entityDeep: ban("^@/entities/[^/]+/.+", "实体只能从 @/entities/<名> 公开入口导入。"),
  featureServer: ban("^@/features/[^/]+/server$", "客户端可执行代码不得导入功能的服务端入口。"),
  relServer: ban("^(\\.{1,2}/)+(.*/)?server(\\.[cm]?[jt]sx?|/|$)", "客户端可执行代码不得导入 server 目录或模块。"),
  relDeep: ban("^(\\.\\./){3,}", "跨顶层或深层目录引用请使用 @/ 别名。"),
  hiwebNonUi: ban(
    "^@jashanyng/hiweb-(?!suite(/|$)|next(/|$)).+",
    "页面、功能与实体层不得直接导入非 UI @jashanyng/hiweb-* 子包，请经 src/shared/ 或 src/server/ 适配层封装。",
  ),
  hiwebNext: ban("^@jashanyng/hiweb-next(/|$)", "页面、功能、实体与共享层不得直接导入 @jashanyng/hiweb-next。"),
} as const;

const CODE_EXT = "{ts,tsx,js,jsx,mjs,cjs}";
const DEFAULT_TEST_FILES = [`**/*.test.${CODE_EXT}`, `**/*.spec.${CODE_EXT}`, `tests/**/*.${CODE_EXT}`] as const;

export type LayeredImportRuleEntry =
  "off" | readonly [RuleSeverity, { readonly patterns: readonly RestrictedImportPattern[] }];

export interface LayeredImportConfigBlock {
  readonly files: string[];
  readonly ignores?: string[];
  readonly rules: {
    readonly "no-restricted-imports": LayeredImportRuleEntry;
  };
}

function buildRestrictionBlock(
  files: readonly string[],
  patterns: readonly RestrictedImportPattern[],
  severity: RuleSeverity,
  ignores: readonly string[] = [],
): LayeredImportConfigBlock {
  return {
    files: [...files],
    ...(ignores.length > 0 ? { ignores: [...ignores] } : {}),
    rules: {
      "no-restricted-imports": [severity, { patterns: patterns.map((p) => ({ ...p })) }],
    },
  };
}

/**
 * 生成对齐五层架构（app/routes、features、entities、shared、server）与双公开入口（index.ts / server.ts）的 ESLint flat config 分层限制规则。
 */
export function createLayeredImportRestrictions(options: LayeredImportRuleOptions = {}) {
  const runtime = options.runtime ?? "server";
  const severity = options.severity ?? "error";
  const globalIgnores = options.ignores ?? [];
  const sharedIgnores = [...(options.sharedIgnores ?? []), ...globalIgnores];
  const extraApp = options.extraAppPatterns ?? [];
  const extraFeature = options.extraFeaturePatterns ?? [];
  const extraFeatureClient = options.extraFeatureClientPatterns ?? [];

  const featureFiles = options.featureFiles ?? [`src/features/**/*.${CODE_EXT}`];
  const entityFiles = options.entityFiles ?? [`src/entities/**/*.${CODE_EXT}`];
  const sharedFiles = options.sharedFiles ?? [`src/shared/**/*.${CODE_EXT}`];
  const sharedUiAndHooksFiles = options.sharedUiAndHooksFiles ?? [
    `src/shared/ui/**/*.${CODE_EXT}`,
    `src/shared/hooks/**/*.${CODE_EXT}`,
  ];
  const testFiles = options.testFiles ?? DEFAULT_TEST_FILES;
  const routeBans = runtime === "spa" ? [LAYER_PATTERNS.app, LAYER_PATTERNS.routes] : [LAYER_PATTERNS.app];

  const commonTailBlocks: LayeredImportConfigBlock[] = [
    buildRestrictionBlock(
      entityFiles,
      [
        ...routeBans,
        LAYER_PATTERNS.features,
        LAYER_PATTERNS.server,
        LAYER_PATTERNS.entityDeep,
        LAYER_PATTERNS.relServer,
        LAYER_PATTERNS.relDeep,
        LAYER_PATTERNS.hiwebNonUi,
        LAYER_PATTERNS.hiwebNext,
      ],
      severity,
      globalIgnores,
    ),
    buildRestrictionBlock(
      sharedFiles,
      [
        ...routeBans,
        LAYER_PATTERNS.features,
        LAYER_PATTERNS.entities,
        LAYER_PATTERNS.server,
        LAYER_PATTERNS.relServer,
        LAYER_PATTERNS.relDeep,
        LAYER_PATTERNS.hiwebNext,
      ],
      severity,
      sharedIgnores,
    ),
    buildRestrictionBlock(
      sharedUiAndHooksFiles,
      [
        ...routeBans,
        LAYER_PATTERNS.features,
        LAYER_PATTERNS.entities,
        LAYER_PATTERNS.server,
        LAYER_PATTERNS.relServer,
        LAYER_PATTERNS.relDeep,
        LAYER_PATTERNS.hiwebNonUi,
        LAYER_PATTERNS.hiwebNext,
      ],
      severity,
      sharedIgnores,
    ),
  ];

  const blocks: LayeredImportConfigBlock[] =
    runtime === "spa"
      ? [
          buildRestrictionBlock(
            options.appFiles ?? [`src/app/**/*.${CODE_EXT}`, `src/routes/**/*.${CODE_EXT}`],
            [
              LAYER_PATTERNS.server,
              LAYER_PATTERNS.featureDeep,
              LAYER_PATTERNS.featureServer,
              LAYER_PATTERNS.entityDeep,
              LAYER_PATTERNS.relServer,
              LAYER_PATTERNS.relDeep,
              LAYER_PATTERNS.hiwebNonUi,
              LAYER_PATTERNS.hiwebNext,
              ...extraApp,
            ],
            severity,
            globalIgnores,
          ),
          buildRestrictionBlock(
            featureFiles,
            [
              ...routeBans,
              LAYER_PATTERNS.server,
              LAYER_PATTERNS.featureDeep,
              LAYER_PATTERNS.featureServer,
              LAYER_PATTERNS.entityDeep,
              LAYER_PATTERNS.relServer,
              LAYER_PATTERNS.relDeep,
              LAYER_PATTERNS.hiwebNonUi,
              LAYER_PATTERNS.hiwebNext,
              ...extraFeature,
              ...extraFeatureClient,
            ],
            severity,
            globalIgnores,
          ),
          ...commonTailBlocks,
        ]
      : [
          buildRestrictionBlock(
            options.appFiles ?? [`src/app/**/*.${CODE_EXT}`],
            [LAYER_PATTERNS.featureDeep, LAYER_PATTERNS.entityDeep, LAYER_PATTERNS.relDeep, ...extraApp],
            severity,
            globalIgnores,
          ),
          buildRestrictionBlock(
            options.appPageFiles ?? [`src/app/**/*.${CODE_EXT}`],
            [
              LAYER_PATTERNS.featureDeep,
              LAYER_PATTERNS.entityDeep,
              LAYER_PATTERNS.relDeep,
              LAYER_PATTERNS.hiwebNonUi,
              LAYER_PATTERNS.hiwebNext,
              ...extraApp,
            ],
            severity,
            [...(options.appPageIgnores ?? [`src/app/**/route.${CODE_EXT}`]), ...globalIgnores],
          ),
          buildRestrictionBlock(
            featureFiles,
            [
              LAYER_PATTERNS.app,
              LAYER_PATTERNS.featureDeep,
              LAYER_PATTERNS.entityDeep,
              LAYER_PATTERNS.relDeep,
              LAYER_PATTERNS.hiwebNonUi,
              LAYER_PATTERNS.hiwebNext,
              ...extraFeature,
            ],
            severity,
            globalIgnores,
          ),
          buildRestrictionBlock(
            options.featureClientFiles ?? [`src/features/**/*.${CODE_EXT}`],
            [
              LAYER_PATTERNS.app,
              LAYER_PATTERNS.server,
              LAYER_PATTERNS.featureDeep,
              LAYER_PATTERNS.featureServer,
              LAYER_PATTERNS.entityDeep,
              LAYER_PATTERNS.relServer,
              LAYER_PATTERNS.relDeep,
              LAYER_PATTERNS.hiwebNonUi,
              LAYER_PATTERNS.hiwebNext,
              ...extraFeature,
              ...extraFeatureClient,
            ],
            severity,
            [
              ...(options.featureClientIgnores ?? [
                "src/features/*/server/**",
                "src/features/**/server/**",
                `src/features/*/server.${CODE_EXT}`,
                `src/features/*/actions.${CODE_EXT}`,
              ]),
              ...globalIgnores,
            ],
          ),
          ...commonTailBlocks,
          buildRestrictionBlock(
            options.serverFiles ?? [`src/server/**/*.${CODE_EXT}`],
            [LAYER_PATTERNS.app, LAYER_PATTERNS.features, LAYER_PATTERNS.entities, LAYER_PATTERNS.relDeep],
            severity,
            globalIgnores,
          ),
        ];

  if (options.exemptTestFiles !== false && testFiles.length > 0) {
    blocks.push({
      files: [...testFiles],
      rules: {
        "no-restricted-imports": "off",
      },
    });
  }

  return blocks;
}

/**
 * 生成文件与函数行数、圈复杂度、嵌套深度及类型风格 ESLint flat config 质量规则，含路径豁免。
 */
export function createCodeQualityRules(options: CodeQualityRuleOptions = {}) {
  const files = options.files ?? ["src/**/*.{ts,tsx}"];
  const rules: Record<string, unknown> = {};

  if (options.noConsole !== false) {
    rules["no-console"] = options.noConsole ?? "error";
  }
  if (options.maxLines !== false) {
    rules["max-lines"] = [
      options.maxLinesSeverity ?? "error",
      { max: options.maxLines ?? 400, skipBlankLines: true, skipComments: true },
    ];
  }
  if (options.maxLinesPerFunction !== false) {
    rules["max-lines-per-function"] = [
      options.maxLinesPerFunctionSeverity ?? "error",
      { max: options.maxLinesPerFunction ?? 150, skipBlankLines: true, skipComments: true },
    ];
  }
  if (options.complexity !== false) {
    rules.complexity = [options.complexitySeverity ?? "warn", options.complexity ?? 15];
  }
  if (options.maxDepth !== false) {
    rules["max-depth"] = [options.maxDepthSeverity ?? "warn", options.maxDepth ?? 4];
  }
  if (options.jsxMaxDepth !== false) {
    rules["react/jsx-max-depth"] = [options.jsxMaxDepthSeverity ?? "warn", { max: options.jsxMaxDepth ?? 6 }];
  }
  if (options.noExplicitAny !== false) {
    rules["@typescript-eslint/no-explicit-any"] = options.noExplicitAny ?? "error";
  }
  if (options.consistentTypeImports !== false) {
    rules["@typescript-eslint/consistent-type-imports"] = [
      options.consistentTypeImports ?? "error",
      { prefer: "type-imports" },
    ];
  }

  const sharedUiFiles = options.sharedUiFiles ?? [`src/shared/ui/**/*.${CODE_EXT}`];
  const testFiles = options.testFiles ?? DEFAULT_TEST_FILES;
  const loggerFiles = options.loggerFiles ?? [`src/**/logger.${CODE_EXT}`];
  const scriptFiles = options.scriptFiles ?? ["scripts/**/*.mjs", "scripts/**/*.ts"];

  const blocks: Array<{ files: string[]; ignores?: string[]; rules: Record<string, unknown> }> = [
    {
      files: [...files],
      ...(options.ignores && options.ignores.length > 0 ? { ignores: [...options.ignores] } : {}),
      rules,
    },
  ];

  for (const exemptFiles of [sharedUiFiles, testFiles]) {
    if (exemptFiles.length > 0) {
      blocks.push({
        files: [...exemptFiles],
        rules: { "max-lines": "off", "max-lines-per-function": "off" },
      });
    }
  }
  for (const consoleExemptFiles of [loggerFiles, scriptFiles]) {
    if (consoleExemptFiles.length > 0) {
      blocks.push({
        files: [...consoleExemptFiles],
        rules: { "no-console": "off" },
      });
    }
  }

  return blocks;
}
