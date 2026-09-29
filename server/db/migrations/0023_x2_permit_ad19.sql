CREATE TABLE "permit_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"permit_id" uuid NOT NULL,
	"inspection_type" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"inspector" text,
	"result" text,
	"result_note" text,
	"recorded_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "permit_inspections_result_check" CHECK ("permit_inspections"."result" IS NULL OR "permit_inspections"."result" IN ('passed', 'corrections_required', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "permits" ALTER COLUMN "status" SET DEFAULT 'applied';--> statement-breakpoint
ALTER TABLE "permits" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "permits" ADD COLUMN "pdf_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "permit_inspections" ADD CONSTRAINT "permit_inspections_permit_id_permits_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."permits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_inspections" ADD CONSTRAINT "permit_inspections_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permit_inspections_permit_idx" ON "permit_inspections" USING btree ("organization_id","permit_id") WHERE "permit_inspections"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_pdf_attachment_id_property_attachments_id_fk" FOREIGN KEY ("pdf_attachment_id") REFERENCES "public"."property_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ED-061: AD-19 statuses. draft has no AD-19 equivalent (applied) and closed means final approved.
UPDATE "permits" SET "status" = 'applied' WHERE "status" = 'draft';--> statement-breakpoint
UPDATE "permits" SET "status" = 'final_approved' WHERE "status" = 'closed';--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_status_check" CHECK ("permits"."status" IN ('applied', 'issued', 'inspections_in_progress', 'final_approved', 'expired', 'withdrawn'));