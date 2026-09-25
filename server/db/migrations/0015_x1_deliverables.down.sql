DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "deliverables"
    WHERE "kind" <> 'compliance_package'
  ) THEN
    RAISE EXCEPTION 'Cannot roll back deliverable kinds while non-compliance deliverables exist';
  END IF;
END $$;
--> statement-breakpoint
DROP VIEW "compliance_docs";
--> statement-breakpoint
ALTER TABLE "deliverables" DROP COLUMN "kind";
--> statement-breakpoint
DROP TYPE "public"."deliverable_kind";
--> statement-breakpoint
ALTER TABLE "programs" RENAME COLUMN "deliverable_template_id" TO "compliance_doc_template_id";
--> statement-breakpoint
ALTER TABLE "deliverables" RENAME TO "compliance_docs";
--> statement-breakpoint
ALTER TABLE "compliance_docs" RENAME CONSTRAINT "deliverables_property_id_properties_id_fk" TO "compliance_docs_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "compliance_docs" RENAME CONSTRAINT "deliverables_job_id_jobs_id_fk" TO "compliance_docs_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TYPE "public"."deliverable_status" RENAME TO "compliance_doc_status";