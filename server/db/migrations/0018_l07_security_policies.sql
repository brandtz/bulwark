CREATE TABLE IF NOT EXISTS "security_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mfa_mode" text DEFAULT 'optional' NOT NULL,
	"idle_minutes" integer,
	"lockout_attempts" integer DEFAULT 5 NOT NULL,
	"lockout_minutes" integer DEFAULT 30 NOT NULL,
	"trusted_days" integer DEFAULT 30 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "security_policies_org_unique" ON "security_policies" USING btree ("organization_id");