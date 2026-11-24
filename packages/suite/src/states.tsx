import { AlertCircleIcon, InboxIcon, Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn.js";

export function EmptyState({
  title,
  children,
  icon,
  className,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {icon ?? <InboxIcon aria-hidden="true" className="size-8 text-muted-foreground" />}
      <p className="text-base font-medium text-foreground">{title}</p>
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function InlineError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn("flex items-start gap-2 rounded-lg bg-fail px-3 py-2 text-sm text-fail-foreground", className)}
    >
      <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function LoadingState({ label = "Loading...", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground", className)}
    >
      <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
