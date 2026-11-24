export interface VitestPresetOptions {
  readonly environment?: "jsdom" | "node";
  readonly include?: readonly string[];
  readonly setupFiles?: readonly string[];
}

export function createVitestTestConfig(options: VitestPresetOptions = {}) {
  return {
    environment: options.environment ?? ("jsdom" as const),
    include: [...(options.include ?? ["src/**/*.test.{ts,tsx}"])],
    ...(options.setupFiles ? { setupFiles: [...options.setupFiles] } : {}),
    restoreMocks: true,
  };
}
