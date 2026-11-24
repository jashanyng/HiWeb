import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button.js";
import { Checkbox } from "./checkbox.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { Field } from "./field.js";
import { SuiteCursorPagination, SuiteOffsetPagination } from "./pagination.js";
import { SuiteAppShell, SuitePageHeader, SuitePageTabBar, SuitePanelCard, SuiteStatusBadge } from "./shell.js";
import { EmptyState, InlineError, LoadingState } from "./states.js";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table.js";
import { createThemeInitScript } from "./theme-script.js";
import { SuiteThemeToggle, ThemeProvider } from "./theme.js";

describe("hiweb-suite components", () => {
  it("ThemeProvider 与 SuiteThemeToggle 切换并写入存储与 DOM 属性", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider namespace="suite-test" defaultMode="light">
        <SuiteThemeToggle showLabel binaryOnly labels={{ light: "浅色", dark: "深色", system: "系统" }} />
      </ThemeProvider>,
    );

    const btn = screen.getByRole("button");
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const script = createThemeInitScript({ namespace: "suite-test" });
    expect(script).toContain("suite-test:theme");
  });

  it("ThemeProvider 与 SuiteThemeToggle 在持久化深色模式下执行 SSR 水合不触发不一致告警", async () => {
    window.localStorage.setItem("hydrate-test:theme", JSON.stringify("dark"));
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";

    const ui = (
      <ThemeProvider namespace="hydrate-test" defaultMode="light">
        <SuiteThemeToggle showLabel binaryOnly labels={{ light: "浅色", dark: "深色", system: "系统" }} />
      </ThemeProvider>
    );

    const ssrHtml = renderToString(ui);
    expect(ssrHtml).toContain("浅色");

    const container = document.createElement("div");
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, ui, { onRecoverableError });
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.textContent).toContain("深色");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      container.remove();
      window.localStorage.removeItem("hydrate-test:theme");
      document.documentElement.classList.remove("dark");
      delete document.documentElement.dataset.theme;
    }
  });

  it("偏移分页与游标分页交互正确", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<SuiteOffsetPagination page={2} pageSize={10} total={35} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <SuiteCursorPagination hasNext={true} hasPrevious={true} pageNumber={2} onNext={onNext} onPrevious={onPrev} />,
    );
    const nextButtons = screen.getAllByRole("button", { name: "Next" });
    await user.click(nextButtons[1]!);
    expect(onNext).toHaveBeenCalledTimes(1);
    const prevButtons = screen.getAllByRole("button", { name: "Previous" });
    await user.click(prevButtons[1]!);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("SuiteAppShell 与通用展示组件正常渲染且无业务硬编码", async () => {
    const user = userEvent.setup();
    const onTab = vi.fn();
    render(
      <SuiteAppShell
        currentPath="/items"
        brand={<span>DemoApp</span>}
        navItems={[
          { key: "home", href: "/", label: "Overview" },
          { key: "items", href: "/items", label: "Items" },
        ]}
      >
        <SuitePageHeader title="Items" description="Manage entries" actions={<Button>New</Button>} />
        <SuitePageTabBar
          tabs={[
            { key: "all", label: "All", badge: 3 },
            { key: "hidden", label: "Hidden" },
          ]}
          active="all"
          onChange={onTab}
        />
        <SuitePanelCard title="List">
          <Field id="q" label="Search" error="Required">
            <input id="q" />
          </Field>
          <SuiteStatusBadge tone="success">Active</SuiteStatusBadge>
          <EmptyState title="Empty" />
          <InlineError>Failed</InlineError>
          <LoadingState label="Fetching" />
        </SuitePanelCard>
      </SuiteAppShell>,
    );

    expect(screen.getByText("DemoApp")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Hidden" }));
    expect(onTab).toHaveBeenCalledWith("hidden");
  });

  it("Table 原语渲染完整语义结构与横向滚动容器", () => {
    const { container } = render(
      <Table>
        <TableCaption>Items summary</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>Entry A</TableCell>
            <TableCell>Active</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total 1</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(container.querySelector('[data-slot="table-container"]')).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((el) => el.textContent)).toEqual(["Name", "Status"]);
    expect(screen.getAllByRole("cell").map((el) => el.textContent)).toEqual(["Entry A", "Active", "Total 1"]);
    expect(screen.getByText("Items summary")).toBeInTheDocument();
  });

  it("ConfirmDialog 支持中性默认文案、Props/labels 覆盖及 pending 中途保护", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Discard changes"
        description="Unsaved edits will be lost."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    onOpenChange.mockClear();
    rerender(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="删除条目"
        description="删除后无法恢复"
        tone="destructive"
        pending={true}
        labels={{ cancel: "取消", confirm: "删除", pending: "删除中...", close: "关闭" }}
        onConfirm={onConfirm}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: "取消" });
    const pendingBtn = screen.getByRole("button", { name: "删除中..." });
    expect(cancelBtn).toBeDisabled();
    expect(pendingBtn).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Checkbox 基于 Base UI 支持受控切换、indeterminate 混合态与 disabled 禁用态", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <label className="flex items-center gap-2">
        <Checkbox checked={false} onCheckedChange={onCheckedChange} />
        <span>Enabled option</span>
      </label>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Enabled option" });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);

    rerender(
      <label className="flex items-center gap-2">
        <Checkbox checked={true} onCheckedChange={onCheckedChange} />
        <span>Enabled option</span>
      </label>,
    );
    expect(screen.getByRole("checkbox", { name: "Enabled option" })).toBeChecked();

    rerender(<Checkbox aria-label="Mixed option" checked={false} indeterminate={true} />);
    expect(screen.getByRole("checkbox", { name: "Mixed option" })).toHaveAttribute("aria-checked", "mixed");

    onCheckedChange.mockClear();
    rerender(
      <Checkbox aria-label="Disabled option" checked={false} disabled={true} onCheckedChange={onCheckedChange} />,
    );
    const disabledBox = screen.getByRole("checkbox", { name: "Disabled option" });
    expect(disabledBox).toHaveAttribute("aria-disabled", "true");
    await user.click(disabledBox);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
