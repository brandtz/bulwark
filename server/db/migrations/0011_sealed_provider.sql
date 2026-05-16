-- W5-2 / ADR-0036 — sealed provider_configs.
--
-- Adds an at-rest-encrypted column for the per-provider credential blob
-- previously stored plaintext in `config` (JSONB). The new column holds
-- a base64 AES-GCM envelope produced by `server/utils/crypto.ts`
-- (iv|tag|ciphertext of the JSON-stringified config).
--
-- Migration strategy:
--   1. This SQL adds the nullable `config_encrypted` text column.
--   2. The application reads `config_encrypted` first and falls back to
--      the legacy `config` JSONB for rows that pre-date this migration.
--   3. Every `upsert()` / `activate()` rewrites the row's
--      `config_encrypted` and zeroes the legacy `config` blob, so the
--      plaintext column drains naturally over time. An optional one-shot
--      `scripts/seal-provider-configs.mjs` can be wired by ops to
--      backfill in bulk.
--   4. A follow-up migration (Phase 2) will DROP the legacy `config`
--      column once ops confirms all rows are sealed.
ALTER TABLE "provider_configs"
  ADD COLUMN IF NOT EXISTS "config_encrypted" text;
