---
name: investigate-issue
description: Investigate a GitHub issue that requires root-cause analysis before implementation. Use when the cause is unknown, the bug can't be reproduced from the description alone, multiple components may be involved, or the user says to investigate, explore, or look into an issue.
---

# Investigation Workflow

When a GitHub issue requires exploration or root-cause analysis before a fix can be planned, follow this workflow.

## 1. Identify Investigation Issues

An issue is an investigation issue when any of these are true:

- The root cause is unknown or ambiguous.
- The bug cannot be reproduced from the description alone.
- Multiple components or systems may be involved.
- The user explicitly frames the task as "investigate", "explore", or "look into".

## 2. Start Investigating Immediately

**Start exploring the codebase right away.** Do NOT create the findings file first — begin by reading relevant source files, tracing the code path, and forming hypotheses.

The findings file is a record of what you discovered, not a planning document. Create it only after you have meaningful findings (see step 3).

## 3. Create the Findings File (After Initial Exploration)

Once you have initial hypotheses, create the findings file:

- **Location:** `.cursor/investigations/<issue-number>-<short-description>.md`

Initialize with this template:

```markdown
# Investigation: #<issue-number> — <title>

**Date started:** <YYYY-MM-DD>
**Branch:** <branch-name>
**Status:** In Progress | Concluded

## Problem Statement
<1-3 sentences restating the issue>

## Hypotheses
- [ ] <hypothesis 1>
- [ ] <hypothesis 2>

## Findings

### <area or component explored>
<what was found, with file paths and line references>

## Root Cause
<filled in when identified — leave blank until then>

## Proposed Fix
<filled in when a fix approach is clear — leave blank until then>
```

## 4. During Investigation

1. **Update the findings file continuously** — after each discovery, append to `## Findings` with file paths, line numbers, and code snippets.
2. **Check off or refine hypotheses** as evidence confirms or rules them out.
3. **Keep findings structured** — use sub-headings under `## Findings` for each area explored.

## 5. Before Ending a Chat Session

If the investigation is not yet complete:

1. Ensure the findings file is fully up to date.
2. Add a `## Next Steps` section listing what remains to explore.
3. Set `**Status:**` to `In Progress`.
4. Commit the findings file: `chore: update investigation for #<issue-number>`.

## 6. Resuming in a New Chat Session

1. Read the findings file from `.cursor/investigations/` for the relevant issue.
2. Use it as starting context — do not re-explore areas already covered.
3. Continue from the `## Next Steps` section.

## 7. Concluding — STOP Before Implementation

When the root cause is identified:

1. Fill in `## Root Cause` and `## Proposed Fix` in the findings file.
2. Set `**Status:**` to `Concluded`.
3. Commit the findings file: `chore: conclude investigation for #<issue-number>`.
4. **STOP and present the conclusion to the user.** Summarize the root cause, proposed fix, and affected files.
5. **Wait for the user's go-ahead before starting implementation.**
