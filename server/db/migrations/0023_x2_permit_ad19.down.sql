ALTER TABLE "permits" DROP CONSTRAINT IF EXISTS "permits_status_check";
ALTER TABLE "permits" DROP CONSTRAINT IF EXISTS "permits_pdf_attachment_id_property_attachments_id_fk";
ALTER TABLE "permits" DROP COLUMN IF EXISTS "pdf_attachment_id";
ALTER TABLE "permits" DROP COLUMN IF EXISTS "scope";
ALTER TABLE "permits" ALTER COLUMN "status" SET DEFAULT 'draft';
DROP TABLE IF EXISTS "permit_inspections";
