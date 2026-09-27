CREATE TABLE IF NOT EXISTS "message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"event_type" text,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"attempt" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_deliveries_org_created_idx" ON "message_deliveries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_deliveries_status_created_idx" ON "message_deliveries" USING btree ("status","created_at");