ALTER TABLE "properties" ADD COLUMN "assignee_user_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "resume_on" date;--> statement-breakpoint
ALTER TABLE "status_pipeline_nodes" ADD COLUMN "wip_limit" integer;