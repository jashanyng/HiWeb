"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import type * as React from "react";

import { Button } from "./button.js";
import { cn } from "./cn.js";

function Drawer({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerContent({
  className,
  title,
  description,
  children,
  footer,
  backLabel = "Back",
  closeLabel = "Close drawer",
}: {
  className?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  backLabel?: string;
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[1px] transition-opacity duration-150",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        )}
      />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card text-card-foreground shadow-2xl outline-none",
          "duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <DialogPrimitive.Close
              render={<Button type="button" variant="ghost" size="sm" className="gap-1 px-2 text-muted-foreground" />}
            >
              <ArrowLeftIcon aria-hidden="true" className="size-4" />
              {backLabel}
            </DialogPrimitive.Close>
            <div className="h-4 w-px bg-border" aria-hidden="true" />
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
          </div>
          <DialogPrimitive.Close
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={closeLabel} />}
          >
            <XIcon aria-hidden="true" className="size-4" />
          </DialogPrimitive.Close>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2.5 border-t border-border bg-muted/50 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export { Drawer, DrawerClose, DrawerContent };
