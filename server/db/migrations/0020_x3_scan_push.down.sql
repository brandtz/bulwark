-- enum values cannot be dropped in place; asset_scan stays in job_kind (unused after rollback).
DROP INDEX IF EXISTS "push_subscriptions_org_user_idx";
DROP INDEX IF EXISTS "push_subscriptions_endpoint_unique";
ALTER TABLE "property_attachments" DROP COLUMN IF EXISTS "scanned_at";
ALTER TABLE "property_attachments" DROP COLUMN IF EXISTS "scan_status";
ALTER TABLE "property_photos" DROP COLUMN IF EXISTS "scanned_at";
ALTER TABLE "property_photos" DROP COLUMN IF EXISTS "scan_status";
DROP TABLE IF EXISTS "push_subscriptions";
