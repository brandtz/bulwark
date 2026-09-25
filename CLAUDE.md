# CLAUDE.md

Read `AGENTS.md` in this directory — it is the single entry point for all agents (Claude Code,
Codex, Copilot, humans). Then follow `agents/program/04-AGENT-PLAYBOOK.md` exactly.

Quick start:

```
pnpm codegraph:sync && pnpm codegraph:check
cat agents/codegraph/work-packages.md      # what is startable
pnpm codegraph:query -- wp <WP-ID>         # scope, designs, files, tests, decisions
```

Hard rules are listed in `AGENTS.md` §"Hard rules". Decisions you make that are not already
in `agents/program/ENGINEERING-DECISIONS.md` or `agents/decisions/` must be written there
before code depends on them.
