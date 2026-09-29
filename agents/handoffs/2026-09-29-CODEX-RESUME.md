# Codex resume checkpoint ? 2026-09-29

## Verified this session

- CI typing fix committed and pushed to main: `89f50ee` (only eslint config and security-lint test annotations).
- GitHub run https://github.com/brandtz/bulwark/actions/runs/36604787073 confirms Typecheck, Lint and Unit tests passed. Security, CodeGraph, screen-contract harness and Lighthouse workflows/jobs passed.
- CI remains red: real browser lane has 4 failures, 222 passes, 18 skips and 1 flaky; mock lane has 16 failures, 166 passes and 2 flaky. Do not report overall CI green.
- Real browser failures: session-timeout MFA policy test cannot reset policy after requiring MFA for its unenrolled admin; its idle-timeout test then fails the same policy request. sessions-revoke receives a non-array response. settings-inspection-templates cannot find its page. The latter two may be fallout from retained MFA policy; verify before treating them as independent bugs.
- Local full Vitest run passed 137 files / 813 tests before the final mixed-URL regression was added. Final focused scan run passed all 13 tests. `pnpm typecheck`, `pnpm lint`, and CodeGraph passed; CodeGraph retains its existing SH-01 coverage warning.

## Scan rework in wp/WP-X3-scan-review-fixes

Inherited patch fixed pending/failed asset visibility, primary-photo leakage, uploader attribution, thumbnail scanning, deleted/infected rescan rejection and conditional verdict writes. Completed its missing test imports and job cleanup.

Independent skeptic review found and then re-reviewed fixes for:

1. Pending scans were impossible to recover after enqueue failure or exhausted retries. Explicit rescan now requeues pending assets; duplicate jobs remain safe.
2. Partial quarantine lost the infected verdict. Persist infected before object movement, with scannedAt=null until quarantine and notification finish. Retry resumes cleanup and never exposes a partially quarantined asset.
3. Thumbnail replacement bypassed scanning. Validate ownership/finalization, reset scanning on replacement, enqueue, and condition verdict writes on the immutable keys actually scanned. Refuse replacement on infected rows.
4. External primary URL bypassed uploaded-thumbnail scanning. Filter and scan each stored key independently.

Focused review verdict: SAFE-TO-MERGE; no verified P0/P1 in the scan patch. This is NOT full WP-X3 acceptance. No package marked done. Browser gates have not been run against this scan patch; latest remote browser results are for the CI typing commit above.

## Next work

1. Fix browser-test MFA fixture isolation and reproduce the remaining real failures; retain full failure counts above as baseline.
2. Finish WP-X3 geo token proxy, no-provider UI evidence, scope notes and full acceptance review. Existing geo.test.ts already tests the none driver at service level; the outstanding evidence is UI/acceptance coverage.
3. Continue inherited L02/L03/L06/L07/L08/Q2/Q3 review list below, then A2. Treat checked inherited hotfixes as handoff claims unless separately verified.
4. L03 staging smoke needs actual configured provider access. L08 manual screen-reader pass requires a human. Keep these gates explicitly open.

## Inherited triage (Claude; retained for continuity)

## SECURITY HOTFIX BATCH (P0s, live on prod)
- [x] X3 P0 push SSRF: host allowlist (contract+send), 10-device cap, no live-endpoint takeover, sendTest 30s cooldown. tests/integration/push.real.test.ts
- [x] X2 P0 announcements writable by org super_admin (cross-tenant broadcast). Gate on platform-operator allowlist (env BULWARK_PLATFORM_ADMIN_EMAILS) in service; audit/log; negative test.
- [x] L07 P0-1 auth.getAttempts/getLockoutState readable cross-tenant by any org admin -> 'system'. negative test.
- [x] L07 P0-2 role escalation: user.setRole/invite accept super_admin from org_manager. Role ceiling; only super_admin grants super_admin; org_manager can't change org_admin. tests.
- [x] L07 P0-3 required-MFA + idle only in RPC dispatcher; /api/storage/*, /api/field/*, /api/account/export, homeowner viewed skip. Move to middleware for /api/**. e2e/integration negative.
- [x] L02 P0-1 staged keys can be persisted without finalize (size bypass, overwritable). Separate final-key namespace; assertOwnedAssetKey accepts only final keys.
- [x] L02 P0-2 finalize can delete another user's persisted asset. Accept staging keys only; bind to presigning user (HMAC token); idempotent.

## X2 P1
1 tenant-firewall unit matrix for person/permit/signature/announcement + cross-tenant reads
2 person.attachToProperty: verify property belongs to org
3 permit contract vs AD-19 (status enum, scope, PermitInspection, date validation, transition table) — or ED deferring
4 persona: permit/person writes -> admin (AD-19 manager+, AD-16 field read-only)
5 AppAnnouncements UI + layout edits outside BE scope -> needs test / handoff (ED or move)
P2 notable: #14 documentHash client-supplied; #16 fixtures Date.now nondeterminism; #6 ensurePersonForContact race; #8 permit.create deletedAt; #9 dismiss id validation

## X3 P1
1 geo none-driver e2e / unit test missing (or ED move to B3)
2 scan enqueue on create untested (scan-pipeline test)
3 RealScanService no tests; firewall matrix for geo/scan/push
4 scan state machine fail-open (conditional marks, missing object != skipped, rescan infected)
5 primaryPhotoUrl serves pending/infected; thumbnail never scanned
6 Mapbox token to all roles (proxy static maps)
7 out-of-glob sub/cois.vue etc.

## L06 P1
1 compliance page getMany >500 ids -> batch
2 0019 UNIQUE backfill (prod already applied? confirm -> P2)
3 cursor tests for quote/invoice/wo/audit/notification + exportCsv
4 real UNIQUE-retry test

## L07 P1
4 tests/integration/lockout.test.ts missing (boundaries)
5 verifyMfa no lockout
6 lockout enumeration via org threshold
7 unenrolled admin can relax MFA policy
8 SAST step missing
9 user_mfa.ts comment "plaintext"

## L02 P1
1 property-depth photo assertion weak
2 oversize/MIME negatives only on fs driver
3 missing tests (use-upload unit, endpoint 403, TOCTOU, avatar/logo e2e, finalize idempotency)
4 backfill nulls rejected-but-recoverable bytes

## L03 P1
1 subscriber wiring integration test
2 S4 real-key staging smoke (needs real provider keys — user)
3 comms-health banner conditional
4 SH-01 session hunk in L03 commit (confirm covered)

## L08 P1 (no P0)
1 Sentry scrub: exception message/stack unscrubbed; DrizzleQueryError params -> PII. pattern scrubber + test (also Q3 P2 rpc.unhandled log)
2 metrics e2e: forbidden-role 403 + positive bearer
3 /api/ready drift 503 via handler integration test
4 perf.test.ts not run in CI (needs Postgres job)
5 lighthouse: mobile run, perf floor 0.7 vs 0.9 (ED or raise), seeded regression
6 mobile projects not run in CI (ED or run)
7 L09: invalid-form aria test, skip-link/main, drawer trap; manual SR pass (human)
8 auth.real.ts out of globs
P2: metrics readable by any org_admin (cross-tenant aggregate) -> super_admin+bearer

## Q2 P1
1 design matrix unused; --check skips in CI -> map SPEC actions to RPC + test
2 snapshot tautology -> cross-check vs SPEC; documented mutation run
3 IDOR shape (own org + other org's real record id) not tested; only org_admin
4 positive half not covered; ED for UI deferral

## Q3 P1
1 new skips without ED (auth-recovery runs nowhere)
2 mock lane red, unowned -> new WP/ED
3 out-of-glob edits -> add globs + notes
4 regression tests for useLabel SSR, modal attrs, useRequestFetch
pushed c2c5e86 (P0 batch)
