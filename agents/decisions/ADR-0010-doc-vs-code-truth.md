# ADR-0010 — Doc-vs-code truth; skeptical verification

- **Status:** Accepted (2026-06-30) · **Epic:** L07, L12, L13, L18, L20 (and all)

## Context
The 2026-06-30 audit raised three "HIGH/BLOCKER" findings that **direct source reads
disproved** (MFA secrets are AES-GCM encrypted, not plaintext; admin reports are real, not
stubs; mock backend is already prod-blocked). The cause was **stale header comments and
stale status prose** drifting from code. Acting on them would have wasted effort and masked
real work.

## Decision
- Treat **header comments + status/docs as claims to verify against code**, not facts. A
  stale claim is a bug.
- Every wave includes a **doc-vs-code truth sweep**; every plan/claim is **independently
  verified** (read the code) before it becomes work.
- Use **skeptical review** (sub-agents instructed to challenge, not rubber-stamp) on plans
  and non-trivial claims; require evidence (file + line), not assertion.

## Consequences
- The gap register separates **verified** issues from **false positives** (§1) so effort
  goes to real work.
- "Done" requires the code to match its documentation.

## Alternatives rejected
- Trust the audits/status at face value (already shown to misdirect). Skip verification to
  move faster (the verification is what made the plan correct).
