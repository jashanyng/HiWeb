export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeScriptOptions {
  readonly namespace: string;
  readonly storageKey?: string;
  readonly defaultMode?: ThemeMode;
}

/**
 * 生成放在 <head> 内的内联防闪烁脚本，在水合前同步应用 dark 类名与 data-theme 属性。
 */
export function createThemeInitScript(options: ThemeScriptOptions): string {
  const fullKey = JSON.stringify(`${options.namespace}:${options.storageKey ?? "theme"}`);
  const fallbackMode = JSON.stringify(options.defaultMode ?? "system");
  return `(function(){try{var raw=window.localStorage.getItem(${fullKey});var mode=raw?JSON.parse(raw):${fallbackMode};if(mode!=="light"&&mode!=="dark"&&mode!=="system"){mode=${fallbackMode};}var dark=mode==="dark"||(mode==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;root.classList.toggle("dark",dark);root.dataset.theme=dark?"dark":"light";}catch(_e){}})();`;
}
