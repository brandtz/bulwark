# ADR-0006 — Every tenant-tunable value has an Admin config screen

## Status
Accepted — 2026-05-03

## Context
Sponsor explicit requirement: "anything that can be configured has a screen
within Admin tool to manage it." Without this rule, config drifts into code
constants that admins can't touch without an engineer.

## Decision
The full inventory lives in [BUILD_PLAN §6](../../BUILD_PLAN.md). At minimum:
- Compliance standards
- Pipeline statuses
- Trade list
- Material catalog
- Labor rates
- PDF templates
- Roles + memberships
- Org profile
- API keys
- Notification preferences
- Feature flags

Each gets a sub-route under `/settings/`, built in [Epic E9](../epics/E09-admin-config-hub.md).

Anything outside this list that an admin would reasonably want to tune is a
**plan defect** — a new ADR must be filed adding it.

## Consequences
- E9 is a large epic (9 stories).
- Backend services must read these tables, not hardcoded constants.
- Default values seed via fixture (E0) so MVP is usable without manual setup.

## Alternatives considered
- **Config-as-code** — rejected for tenant-facing tunables; retained only for
  system-wide constants (rate limits, page sizes, JWT expiries).
- **JSON config file editable via Admin** — rejected: no validation, no audit
  trail, no per-tenant scope.
