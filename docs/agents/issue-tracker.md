# Issue tracker：GitHub

本仓库的 issue 和 spec 以 GitHub issue 的形式存放，所有操作均使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文用 heredoc。
- **读取 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需加 `--label` 和 `--state` 过滤。
- **把 issue 设为父 issue 的子 issue**：`gh issue create --parent <parent> ...`，或事后执行 `gh issue edit <parent> --add-sub-issue <child>`（需 `gh` 2.94+）。旧版 `gh`：`gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（database id，取法见下文 **Blocking**）。无法使用 sub-issue 时，在子 issue 正文顶部写 `Part of #<parent>`。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **添加 / 移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库从 `git remote -v` 推断；在仓库目录内运行时 `gh` 会自动识别。

Issue 标题与正文使用简体中文撰写，命令、路径、代码标识符和标签名保持原样。

## 把 Pull request 作为 triage 入口

**PRs as a request surface: no.** _（如果本仓库把外部 PR 视为功能请求，改为 `yes`；`/triage` 会读取此开关。）_

设为 `yes` 时，PR 与 issue 使用相同的标签和状态，对应命令换成 `gh pr`：

- **读取 PR**：`gh pr view <number> --comments`，diff 用 `gh pr diff <number>`。
- **列出待 triage 的外部 PR**：`gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用同一编号空间，单独的 `#42` 可能是任意一种：先用 `gh pr view 42` 解析，失败再回退到 `gh issue view 42`。

## 当技能要求 “publish to the issue tracker” 时

创建一个 GitHub issue。

## 当技能要求 “fetch the relevant ticket” 时

按上文 **读取 issue** 的方式读取。

## Wayfinding operations

供 `/wayfinder` 使用。**map** 是一个 issue，其下的 **child** issue 即各个 ticket。

- **Map**：一个带 `wayfinder:map` 标签的 issue，正文包含 Notes / Decisions-so-far / Fog 三部分。`gh issue create --label wayfinder:map`。
- **Child ticket**：以 GitHub sub-issue 形式挂到 map 下的 issue（见 **把 issue 设为父 issue 的子 issue**）。未启用 sub-issue 时，把子 issue 加入 map 正文的任务列表，并在子 issue 正文顶部写 `Part of #<map>`。标签：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。被认领后，ticket 指派给推进它的开发者。
- **Blocking**：使用 GitHub **原生 issue 依赖**，这是标准且在 UI 中可见的表示方式。添加依赖边：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞方的数字 **database id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，_不是_ `#number` 也不是 `node_id`）。GitHub 通过 `issue_dependencies_summary.blocked_by` 报告仍处于打开状态的阻塞方（即实时闸门）。无法使用依赖功能时，退回到在子 issue 正文顶部写一行 `Blocked by: #<n>, #<n>`。所有阻塞方都关闭后，ticket 即解除阻塞。
- **Frontier query**：列出 map 下打开的子 issue（`gh issue list --state open`，限定在 map 的 sub-issue / 任务列表范围内），剔除仍有打开阻塞方（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行中有打开的 issue）或已有指派人的项；按 map 中的顺序取第一个。
- **Claim**：`gh issue edit <n> --add-assignee @me`，作为本次会话的第一个写操作。
- **Resolve**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，再在 map 的 Decisions-so-far 中追加一条上下文指针（要点 + 链接）。
