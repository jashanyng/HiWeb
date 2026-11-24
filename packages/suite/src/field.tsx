import type { ReactNode } from "react";

import { cn } from "./cn.js";
import { Label } from "./label.js";

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const inputClass = "h-11 rounded-[10px] px-3 text-[15px] md:text-[15px]";

export function describedBy(id: string, error?: string, hint?: unknown): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}
