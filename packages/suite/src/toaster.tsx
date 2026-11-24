"use client";

import type { ComponentProps } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

export type SuiteToasterProps = ComponentProps<typeof SonnerToaster>;

export function SuiteToaster({ position = "top-right", richColors = true, ...props }: SuiteToasterProps) {
  return <SonnerToaster position={position} richColors={richColors} {...props} />;
}

export { toast };
