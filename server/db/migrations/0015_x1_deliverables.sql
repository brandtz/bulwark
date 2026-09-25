ALTER TYPE "public"."compliance_doc_status" RENAME TO "deliverable_status";--> statement-breakpoint
ALTER TABLE "compliance_docs" RENAME TO "deliverables";--> statement-breakpoint
ALTER TABLE "deliverables" RENAME CONSTRAINT "compliance_docs_property_id_properties_id_fk" TO "deliverables_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "deliverables" RENAME CONSTRAINT "compliance_docs_job_id_jobs_id_fk" TO "deliverables_job_id_jobs_id_fk";--> statement-breakpoint
ALTER TABLE "programs" RENAME COLUMN "compliance_doc_template_id" TO "deliverable_template_id";--> statement-breakpoint
CREATE TYPE "public"."deliverable_kind" AS ENUM('compliance_package', 'completion_report', 'warranty_certificate', 'custom');--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "kind" "public"."deliverable_kind" DEFAULT 'compliance_package' NOT NULL;--> statement-breakpoint
CREATE VIEW "compliance_docs" AS
  SELECT id, organization_id, property_id, work_order_ids, included_slot_ids,
         signature, job_id, status, result_url, error, created_at, updated_at, deleted_at
  FROM "deliverables";