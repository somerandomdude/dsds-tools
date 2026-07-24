---
name: davy-log
description: Maintain DAVY-LOG.md as a concise, decision-oriented async handoff for Davy and collaborators. Use when completing a work session, preparing a collaborator update, recording a commit or verification result, or deciding the next scoped task.
---

# Davy Log

Keep `DAVY-LOG.md` useful to someone who has not followed the chat.

1. Read the current log and relevant Git status, commits, and test output.
   Do not infer a push, merge, or verification result.
2. Add a newest-first entry under `## Updates` using:

```md
### YYYY-MM-DD — Short outcome
- **Decision:** …
- **Changed:** …
- **Verified:** …
- **Next:** …
```

3. Record durable facts only: decision, changed files or commit, verification,
   branch/location, and one clear next action or owner.
4. Keep transient terminal output and duplicated chat narration out of the log.
5. Preserve past entries. Update `## Current state` when ownership, branches,
   or blockers change.

For an async collaborator such as PJ, lead with the outcome, name commits when
known, flag local-only or unpushed work, and ask one concrete question only
when a decision is needed.
