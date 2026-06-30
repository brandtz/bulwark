# ADR-0009 — Compliance standards are tenant data, not code

- **Status:** Accepted (2026-06-30) · **Epic:** L19

## Context
Launch is Oregon-only, but the sponsor requires a data-driven seam so other states can be
added without code changes. `OREGON_DEFAULT_STANDARDS` risks being a runtime code path.

## Decision
Compliance evaluation reads **tenant `standards` rows** and **per-program inspection
template rules** (templates-as-data already exists). `OREGON_DEFAULT_STANDARDS` is only a
**seed** used to bootstrap a new org's standards table — never referenced in a service
evaluation path. An optional `jurisdiction` tag on standards/programs makes adding a state
**purely additive data** (insert a default set; no code change).

## Consequences
- Editing an org's standards changes evaluation (proves data-driven); a second state is a
  seed insert, not a deploy.

## Alternatives rejected
- Hardcode Oregon (blocks expansion). A rules-engine DSL (over-engineered for launch; the
  existing template rules + standards rows suffice).
