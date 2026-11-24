"use client";

import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "./button.js";
import { cn } from "./cn.js";

export interface OffsetPaginationLabels {
  readonly total?: (total: number) => string;
  readonly pageInfo?: (page: number, totalPages: number) => string;
  readonly previous?: string;
  readonly next?: string;
}

export interface SuiteOffsetPaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (nextPage: number) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly labels?: OffsetPaginationLabels;
}

export function SuiteOffsetPagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
  className,
  labels,
}: SuiteOffsetPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), totalPages);
  const totalText = labels?.total ? labels.total(total) : `Total ${total}`;
  const pageText = labels?.pageInfo ? labels.pageInfo(current, totalPages) : `${current} / ${totalPages}`;

  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground", className)}
    >
      <span>{totalText}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
          {labels?.previous ?? "Previous"}
        </Button>
        <span className="min-w-14 text-center tabular-nums">{pageText}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          {labels?.next ?? "Next"}
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export interface CursorPaginationLabels {
  readonly previous?: string;
  readonly next?: string;
  readonly loadMore?: string;
  readonly loading?: string;
  readonly reset?: string;
  readonly noMore?: string;
  readonly pageSummary?: (pageNumber: number, itemCount: number) => string;
}

export interface SuiteCursorPaginationProps {
  readonly hasNext: boolean;
  readonly hasPrevious?: boolean;
  readonly onNext: () => void;
  readonly onPrevious?: () => void;
  readonly onReset?: () => void;
  readonly loading?: boolean;
  readonly mode?: "paged" | "load-more";
  readonly pageNumber?: number;
  readonly itemCount?: number;
  readonly className?: string;
  readonly labels?: CursorPaginationLabels;
}

export function SuiteCursorPagination({
  hasNext,
  hasPrevious = false,
  onNext,
  onPrevious,
  onReset,
  loading = false,
  mode = "paged",
  pageNumber,
  itemCount,
  className,
  labels,
}: SuiteCursorPaginationProps) {
  if (mode === "load-more") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground",
          className,
        )}
      >
        <span>
          {pageNumber !== undefined && itemCount !== undefined && labels?.pageSummary
            ? labels.pageSummary(pageNumber, itemCount)
            : itemCount !== undefined
              ? `${itemCount}`
              : ""}
        </span>
        <div className="flex items-center gap-2">
          {hasNext ? (
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onNext}>
              {loading ? (labels?.loading ?? "Loading...") : (labels?.loadMore ?? "Load more")}
            </Button>
          ) : (
            <span>{labels?.noMore ?? "No more items"}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted-foreground", className)}
    >
      <span>
        {pageNumber !== undefined && itemCount !== undefined && labels?.pageSummary
          ? labels.pageSummary(pageNumber, itemCount)
          : pageNumber !== undefined
            ? `#${pageNumber}`
            : ""}
      </span>
      <div className="flex items-center gap-2">
        {onReset && hasPrevious ? (
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onReset}>
            <RotateCcwIcon aria-hidden="true" className="size-3.5" />
            {labels?.reset ?? "First"}
          </Button>
        ) : null}
        {onPrevious ? (
          <Button type="button" variant="outline" size="sm" disabled={loading || !hasPrevious} onClick={onPrevious}>
            <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
            {labels?.previous ?? "Previous"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={loading || !hasNext} onClick={onNext}>
          {loading ? (labels?.loading ?? "Loading...") : (labels?.next ?? "Next")}
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
