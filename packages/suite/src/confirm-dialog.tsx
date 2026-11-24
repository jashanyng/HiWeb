"use client";

import type { ReactNode } from "react";

import { Button } from "./button.js";
import { cn } from "./cn.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog.js";

export interface ConfirmDialogLabels {
  readonly confirm?: string;
  readonly cancel?: string;
  readonly pending?: string;
  readonly close?: string;
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly pendingLabel?: string;
  readonly closeLabel?: string;
  readonly labels?: ConfirmDialogLabels;
  readonly tone?: "default" | "destructive";
  readonly pending?: boolean;
  readonly confirmDisabled?: boolean;
  readonly showCloseButton?: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly className?: string;
}

/**
 * 通用二次确认对话框，支持破坏性操作视觉区分、进行中状态锁与全量中性文案覆盖。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  closeLabel,
  labels,
  tone = "default",
  pending = false,
  confirmDisabled = false,
  showCloseButton = true,
  onConfirm,
  onCancel,
  className,
}: ConfirmDialogProps) {
  const resolvedConfirm = confirmLabel ?? labels?.confirm ?? "Confirm";
  const resolvedCancel = cancelLabel ?? labels?.cancel ?? "Cancel";
  const resolvedPending = pendingLabel ?? labels?.pending ?? "Processing...";
  const resolvedClose = closeLabel ?? labels?.close ?? "Close";

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) {
      return;
    }
    if (!nextOpen) {
      onCancel?.();
    }
    onOpenChange(nextOpen);
  }

  function handleCancel() {
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton && !pending}
        closeLabel={resolvedClose}
        className={cn("sm:max-w-md", className)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== undefined && description !== null ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={handleCancel}>
            {resolvedCancel}
          </Button>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={pending || confirmDisabled}
            onClick={() => void onConfirm()}
          >
            {pending ? resolvedPending : resolvedConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
