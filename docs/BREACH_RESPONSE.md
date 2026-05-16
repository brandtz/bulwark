# Breach Response Runbook

**Doc owner:** Security on-call  
**Last updated:** 2026-05-16  
**Related:** ADR-0038, [Privacy Policy](../app/pages/privacy.vue),
[DPA](../app/pages/dpa.vue)

This is the internal runbook for responding to a suspected or
confirmed personal-data breach. It satisfies the Bulwark commitment
to notify controllers within **72 hours** under GDPR Art. 33 and the
parallel obligations under CCPA / state breach-notification laws.

> No automated breach-detection tooling is wired in Phase 1. The
> sources below are the *signals* that should trigger this runbook.

## 0. Roles

- **Incident commander (IC):** the security on-call.
- **Comms lead:** product / customer success on-call.
- **Engineering lead:** platform on-call (for containment + forensics).
- **Legal:** outside counsel, looped in on confirmation.

If the IC is unreachable, the next on-call escalates and assumes IC.

## 1. Detection — possible signals

- **Operational alerts:** logger errors spiking on auth.*, unusual
  audit-log volume from a single actor, request-rate alerts, structured
  log anomaly.
- **Customer reports:** a controller (org admin) reports unauthorized
  access; a homeowner reports their portal showed someone else's data;
  a subcontractor reports password reset email they didn't request.
- **External:** responsible-disclosure email to
  `security@bulwark.example`; vendor advisory; CVE in a dependency.
- **Internal:** code review catches a row-level access bug already
  shipped.

## 2. Triage (target: ≤1 hour from signal)

1. **Acknowledge** the signal in the incident channel within 15 minutes.
2. **Open** an incident record with: timestamp received, source, raw
   signal text, IC + comms + engineering lead names.
3. **Classify severity:**
   - **SEV-1**: confirmed unauthorized access to PII / financial data
     of multiple customers.
   - **SEV-2**: suspected access; or confirmed access affecting a
     single customer.
   - **SEV-3**: vulnerability with potential for breach but no
     evidence of exploitation.
4. **Decide** whether containment is required immediately. SEV-1 →
   yes; SEV-2 → yes if exploit is ongoing; SEV-3 → patch on normal
   cadence.

## 3. Containment

- Revoke compromised credentials (API keys, MFA backup codes, session
  tokens). The `RealApiKeyService.revoke()` + the auth service's
  invite/role surfaces are the canonical actions.
- Disable affected user accounts via the admin user surface.
- Block offending IPs at the edge (platform-specific).
- Isolate hosts: pull the affected pod / instance from the load
  balancer; do not terminate (preserve forensic evidence).
- Rotate any secrets that the attacker may have observed
  (`BULWARK_*` env vars, signing keys, webhook secrets).

## 4. Assessment (target: ≤24 hours from confirmation)

Document the following before notification:

- **Scope.** Which tables, which org ids, which user ids.
- **Time window.** First and last evidence of unauthorized access.
- **Data categories.** Map to the Privacy Policy §1 buckets
  (Account / Contact / Property / Financial / Usage / Device).
- **Number of data subjects affected** (per controller).
- **Likely consequences** for the subjects (identity theft,
  financial loss, reputation, etc.).
- **Root cause.** Best-known at notification time; final root cause
  may follow in the post-mortem.

The `audit_log` table is the primary forensic source — every domain
write produces a row; `actor_user_id` ties activity to actor.

## 5. Notification

### To controllers (B2B customers)

- **Deadline:** within **72 hours** of becoming aware of a breach
  affecting their data. This satisfies the DPA §8 commitment.
- **Channel:** email to the org's primary admin contact + an in-app
  notice on the status page (placeholder URL: TBD per environment).
- **Contents:** nature of breach, categories + approximate record
  count, likely consequences, measures taken / proposed, contact
  for follow-up. Use the standard breach-notice template (TBD
  document — sales / legal to draft).

### To regulators

- **GDPR Art. 33:** notify the lead supervisory authority of the
  affected EU controllers within 72 hours unless the breach is
  unlikely to risk rights and freedoms.
- **UK GDPR:** notify the ICO within 72 hours where applicable.
- **CCPA / state laws:** follow the breach-notification statute of
  each affected state (most are 30–60 days from discovery). California
  Civil Code §1798.82 specifies content + form.

Legal selects the regulatory channel and drafts; engineering provides
facts and timelines.

### To data subjects (individual users)

- Required when a breach is likely to result in a high risk to rights
  and freedoms (GDPR Art. 34) or when state law requires direct
  notice (most U.S. states do for SSN / financial / health data).
- Delivered via email and in-app notice on next sign-in.

## 6. Post-mortem (target: ≤30 days from closure)

- Conducted by the IC with engineering + legal.
- Identifies root cause, contributing factors, what worked, what
  didn't, and **at least one** preventive action with an owner and
  due date.
- Stored in `agents/decisions/` if it produces an architectural
  decision; otherwise in the security wiki (TBD).

## 7. Records

- All incidents are logged in the incident register regardless of
  outcome (SEV-3 included).
- Notification artefacts (controller emails, regulatory submissions,
  data-subject notices) are retained for **7 years** in line with the
  audit-log retention period.

## 8. Tabletop cadence

- Tabletop exercise every 6 months. Each tabletop must include at
  least one new scenario (e.g., compromised admin credential,
  subprocessor breach, malicious insider). Results feed back into
  this runbook.
