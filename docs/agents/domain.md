# 领域文档

工程类技能在探索代码库时应如何使用本仓库的领域文档。

本仓库采用**单上下文（single-context）**布局。

## 探索之前，先读这些

- 仓库根目录的 **`GLOSSARY.md`**；或
- 若根目录存在 **`GLOSSARY-MAP.md`**，则读它：它指向每个上下文各自的 `GLOSSARY.md`，逐个阅读与当前主题相关的那些。
- **`docs/adr/`**：阅读与你即将改动的区域相关的 ADR。多上下文仓库还需查看 `src/<context>/docs/adr/` 中的上下文级决策。

上述文件如果不存在，**静默继续**。不要指出它们缺失，也不要提前建议创建。`/domain-modeling` 技能（经由 `/grill-with-docs` 和 `/improve-codebase-architecture` 触发）会在术语或决策真正确定时按需创建它们。

## 文件结构

单上下文仓库（大多数仓库，包括本仓库）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `GLOSSARY-MAP.md`）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

`GLOSSARY.md` 与 ADR 的正文使用简体中文撰写；术语本身若为代码标识符或专有名词，保持原样。

## 使用术语表中的词汇

当你的输出涉及某个领域概念（issue 标题、重构提案、假设、测试名等）时，使用 `GLOSSARY.md` 中定义的术语。不要改用术语表明确避免的同义词。

如果所需概念还不在术语表中，这是一个信号：要么你在发明项目并不使用的说法（请重新考虑），要么确实存在空缺（记下来交给 `/domain-modeling`）。

## 标出与 ADR 的冲突

如果你的输出与现有 ADR 相矛盾，要明确指出，而不是悄悄推翻：

> _与 ADR-0007（事件溯源订单）相矛盾，但值得重新讨论，因为……_
