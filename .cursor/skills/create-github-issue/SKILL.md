---
name: create-github-issue
description: Create well-structured GitHub issues with correct labels, full descriptions, and acceptance criteria. Use when the user asks to create a GitHub issue, report a bug, request a feature, file a task, or add any work item to the backlog.
---

# Creating GitHub Issues

When the user asks to create a GitHub issue (feature request, bug report, task, etc.), follow this workflow to produce a complete, well-labeled issue every time.

## 1. Determine Issue Type and Labels

Before writing the issue body, classify it and select **all applicable labels**.

### Primary type label (exactly one required)

| Label | When to use |
|-------|-------------|
| `enhancement` | New feature or improvement to existing functionality |
| `bug` | Something is broken or behaving incorrectly |
| `documentation` | Docs-only changes (README, wiki, inline docs) |
| `tech-debt` | Refactoring, code quality, maintainability improvements |
| `tooling` | Build tools, linters, formatters, CI/CD changes |

### Secondary labels (add when applicable)

| Label | When to use |
|-------|-------------|
| `good first issue` | Small, well-scoped task suitable for newcomers |
| `help wanted` | Extra attention or external contributions welcome |

### Labels to avoid on new issues

- `duplicate`, `invalid`, `wontfix`, `question` — these are triage labels applied later.
- `autorelease: pending`, `autorelease: tagged` — managed by release automation.

## 2. Write the Issue Body

Use the template matching the issue type.

### Feature / Enhancement

```markdown
## Description
<1-3 sentences: what the feature is and why it's needed>

## Background / Use Case
<Real-world scenario explaining the problem this solves.
Include code snippets, config examples, or screenshots if relevant.>

## Requested Behavior
<Numbered list of specific, testable requirements:>
1. ...
2. ...
3. ...

## Expected Behavior
<Step-by-step walkthrough of how a user would interact with the feature once built>

## Scope
<Which areas of the codebase are affected. Reference the architecture from project-context.mdc:>
- **Discovery** — ...
- **Execution** — ...
- **UI** — ...
- (only include relevant areas)

## Acceptance Criteria
- [ ] <Criterion 1: specific, verifiable condition>
- [ ] <Criterion 2>
- [ ] <Criterion 3>
```

### Bug Report

```markdown
## Description
<1-3 sentences: what is broken>

## Steps to Reproduce
1. ...
2. ...
3. ...

## Expected Behavior
<What should happen>

## Actual Behavior
<What actually happens. Include error messages, stack traces, or screenshots.>

## Environment
- Extension version: ...
- VS Code version: ...
- OS: ...
- .NET SDK version: ...

## Possible Cause
<If known or suspected, note the area of the codebase. Otherwise omit this section.>

## Acceptance Criteria
- [ ] <The bug no longer reproduces when...>
- [ ] <Regression test added>
```

### Tech Debt / Refactoring

```markdown
## Description
<What needs to be improved and why>

## Current State
<How it works today and what's wrong with it>

## Proposed Change
<What the improved version looks like>

## Acceptance Criteria
- [ ] <Criterion 1>
- [ ] <Criterion 2>
```

## 3. Create the Issue

Use `gh issue create` with:
- `--title` — concise, descriptive title (imperative mood: "Add ...", "Fix ...", "Refactor ...")
- `--label` — comma-separated list of labels (at minimum the primary type label)
- `--body` — full body from the template above

```powershell
gh issue create --title "Add feature X" --label "enhancement" --body "..."
```

For multiple labels:

```powershell
gh issue create --title "Fix crash on startup" --label "bug,good first issue" --body "..."
```

## 4. Post-Creation

After the issue is created:
1. Report the issue number and URL to the user.
2. Confirm the labels that were applied.

## Rules

- **Never skip labels.** Every issue must have at least one primary type label.
- **Never skip Acceptance Criteria.** Every issue must have a checklist of verifiable conditions.
- **Be specific over generic.** "Tests fail with default Debug configuration" is better than "Tests don't work."
- **Reference architecture.** When describing scope, use file/module names from the project to make the issue actionable.
- **Ask if unsure.** If the user's request is ambiguous, ask clarifying questions before creating the issue.
