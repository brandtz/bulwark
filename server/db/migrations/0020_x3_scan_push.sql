ALTER TYPE "public"."job_kind" ADD VALUE IF NOT EXISTS 'asset_scan';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "property_photos" ADD COLUMN IF NOT EXISTS "scan_status" text DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_photos" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "property_attachments" ADD COLUMN IF NOT EXISTS "scan_status" text DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_org_user_idx" ON "push_subscriptions" USING btree ("organization_id","user_id");