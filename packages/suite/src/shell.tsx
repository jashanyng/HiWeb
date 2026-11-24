"use client";

import { ChevronLeftIcon, ChevronRightIcon, MenuIcon } from "lucide-react";
import { type AnchorHTMLAttributes, Fragment, type ReactNode, useState } from "react";

import { Button } from "./button.js";
import { cn } from "./cn.js";

export type SuiteStatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASS: Readonly<Record<SuiteStatusTone, string>> = {
  success: "border-transparent bg-status-success-bg text-status-success-fg",
  warning: "border-transparent bg-status-warning-bg text-status-warning-fg",
  danger: "border-transparent bg-status-danger-bg text-status-danger-fg",
  info: "border-transparent bg-status-info-bg text-status-info-fg",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function SuiteStatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  readonly tone?: SuiteStatusTone;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      data-slot="suite-status-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SuitePanelCard({
  title,
  extra,
  children,
  className,
}: {
  readonly title?: string;
  readonly extra?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs", className)}>
      {title || extra ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? (
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
              <span aria-hidden="true" className="h-3.5 w-[3px] rounded-full bg-primary" />
              {title}
            </h2>
          ) : (
            <span />
          )}
          {extra ? <div className="flex items-center gap-2">{extra}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SuitePageHeader({
  title,
  description,
  actions,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SuitePageTabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  readonly tabs: ReadonlyArray<{ readonly key: T; readonly label: string; readonly badge?: number }>;
  readonly active: T;
  readonly onChange: (key: T) => void;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-2xs",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary bg-accent text-accent-foreground shadow-2xs"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface SuiteNavItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly matchPrefix?: boolean;
}

export type SuiteLinkRenderer = (item: SuiteNavItem, anchorProps: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactNode;

export interface SuiteAppShellProps {
  readonly navItems: readonly SuiteNavItem[];
  readonly currentPath: string;
  readonly brand: ReactNode;
  readonly brandHref?: string;
  readonly sidebarFooter?: ReactNode;
  readonly headerLeft?: ReactNode;
  readonly headerRight?: ReactNode;
  readonly renderLink?: SuiteLinkRenderer;
  readonly labels?: {
    readonly navAriaLabel?: string;
    readonly expandSidebar?: string;
    readonly collapseSidebar?: string;
    readonly openMenu?: string;
  };
  readonly children: ReactNode;
}

function isNavItemActive(item: SuiteNavItem, currentPath: string): boolean {
  if (item.matchPrefix === false || item.href === "/") {
    return currentPath === item.href;
  }
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

export function SuiteAppShell({
  navItems,
  currentPath,
  brand,
  brandHref = "/",
  sidebarFooter,
  headerLeft,
  headerRight,
  renderLink,
  labels,
  children,
}: SuiteAppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeItem = navItems.find((item) => isNavItemActive(item, currentPath)) ?? navItems[0];

  const defaultRenderLink: SuiteLinkRenderer = (item, anchorProps) => <a href={item.href} {...anchorProps} />;
  const linkRenderer = renderLink ?? defaultRenderLink;

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-foreground/25 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 md:static",
          collapsed ? "w-[68px]" : "w-[228px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3.5">
          {linkRenderer(
            { key: "__brand__", href: brandHref, label: "Home" },
            {
              className: "flex min-w-0 items-center gap-2.5 overflow-hidden",
              onClick: () => setMobileOpen(false),
              children: brand,
            },
          )}
          <button
            type="button"
            aria-label={
              collapsed ? (labels?.expandSidebar ?? "Expand sidebar") : (labels?.collapseSidebar ?? "Collapse sidebar")
            }
            onClick={() => setCollapsed((v) => !v)}
            className="hidden size-6 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-2xs hover:text-primary md:flex"
          >
            {collapsed ? <ChevronRightIcon className="size-3.5" /> : <ChevronLeftIcon className="size-3.5" />}
          </button>
        </div>

        <nav aria-label={labels?.navAriaLabel ?? "Main navigation"} className="flex flex-1 flex-col gap-1.5 p-2.5">
          {navItems.map((item) => {
            const active = isNavItemActive(item, currentPath);
            const anchorClass = cn(
              "relative flex h-10 items-center gap-2.5 rounded-lg border px-3 text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "border-sidebar-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-2xs"
                : "border-transparent text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
            );
            return (
              <Fragment key={item.key}>
                {linkRenderer(item, {
                  onClick: () => setMobileOpen(false),
                  title: collapsed ? item.label : undefined,
                  className: anchorClass,
                  children: (
                    <>
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-2 bottom-2 left-0.5 w-[3px] rounded-full bg-sidebar-primary"
                        />
                      ) : null}
                      {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </>
                  ),
                })}
              </Fragment>
            );
          })}
        </nav>

        {sidebarFooter ? <div className="border-t border-sidebar-border p-2.5">{sidebarFooter}</div> : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-xs sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="md:hidden"
              aria-label={labels?.openMenu ?? "Open navigation menu"}
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon className="size-4" />
            </Button>
            {headerLeft ?? (
              <span className="truncate text-sm font-medium text-foreground">{activeItem?.label ?? ""}</span>
            )}
          </div>
          {headerRight ? <div className="flex items-center gap-2">{headerRight}</div> : null}
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
