CREATE TYPE "public"."program_kind" AS ENUM('inspection_program', 'service_program');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "program_kind" NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"inspection_template_id" uuid,
	"standard_set_id" uuid,
	"compliance_doc_template_id" uuid,
	"default_trade_slots" jsonb,
	"pricing_defaults" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#1E3A8A' NOT NULL,
	"accent_color" text DEFAULT '#FF6B35' NOT NULL,
	"footer_text" text,
	"support_email" text,
	"support_phone" text,
	"license_label" text,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"date_format" text DEFAULT 'MM/dd/yyyy' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_memberships" ADD CONSTRAINT "program_memberships_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "programs_org_slug_unique" ON "programs" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "program_memberships_unique" ON "program_memberships" USING btree ("organization_id","program_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_memberships_entity_idx" ON "program_memberships" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "labels_org_ns_key_locale_uq" ON "labels" USING btree ("organization_id","namespace","key","locale");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labels_org_locale_idx" ON "labels" USING btree ("organization_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_branding_org_uq" ON "org_branding" USING btree ("organization_id");