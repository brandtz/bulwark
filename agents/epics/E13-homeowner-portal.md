# Epic E13 — Homeowner Portal

> **Phase**: 2 | **Build order**: 14th | **Depends on**: E11

## Objective

Public landing → lead capture → magic-link auth → homeowner dashboard with
read-only progress, document downloads, and online invoice payment (Stripe).

## Stories

| ID | Title |
|---|---|
| E13-S1 | Public marketing landing (HO-01) |
| E13-S2 | Public lead intake form → creates Lead (HO-02) |
| E13-S3 | Magic-link login (HO-03) |
| E13-S4 | Homeowner dashboard (HO-04) |
| E13-S5 | Job progress timeline (HO-05) |
| E13-S6 | Document library (HO-06) |
| E13-S7 | Invoice + Stripe payment (HO-07) |
| E13-S8 | Profile / notifications (HO-08) |

## Approval Status

⏸️ **Deferred — gated on E11.** Magic-link auth (E13-S3) requires real auth (E11-S3); the Stripe pay-link (E13-S7) requires the real Invoice service (E11-S11). Marketing landing + lead intake (E13-S1, E13-S2) could ship in parallel with E11 if the sponsor wants an early public surface — flag separately if so.
