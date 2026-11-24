export interface PrettierPresetOptions {
  readonly tailwindStylesheet?: string;
  readonly tailwindFunctions?: readonly string[];
}

export function createPrettierPreset(options: PrettierPresetOptions = {}) {
  return {
    printWidth: 120,
    semi: true,
    singleQuote: false,
    trailingComma: "all" as const,
    ...(options.tailwindStylesheet
      ? {
          plugins: ["prettier-plugin-tailwindcss"],
          tailwindStylesheet: options.tailwindStylesheet,
          tailwindFunctions: [...(options.tailwindFunctions ?? ["cn", "cva"])],
        }
      : {}),
  };
}
