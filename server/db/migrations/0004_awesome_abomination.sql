CREATE TABLE IF NOT EXISTS "inspection_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_template_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_repeatable" boolean DEFAULT false NOT NULL,
	"repeatable_label" text,
	"conditional_on_field_slug" text,
	"conditional_on_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_template_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" jsonb,
	"validation_json" jsonb,
	"help_text" text,
	"placeholder" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"conditional_on_field_slug" text,
	"conditional_on_value" text,
	"evaluator_rule" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"building_id" uuid,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"program_id" uuid,
	"inspector_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_by_name" text,
	"signature_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"section_instance_key" text NOT NULL,
	"field_slug" text NOT NULL,
	"value_json" jsonb,
	"photos_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"slug" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pending_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"invited_by_user_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_status" integer,
	"response_body" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_hash" text NOT NULL,
	"secret_prefix" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channels" jsonb DEFAULT '{"inApp":true,"email":false,"sms":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspection_template_sections" ADD CONSTRAINT "inspection_template_sections_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspection_template_fields" ADD CONSTRAINT "inspection_template_fields_section_id_inspection_template_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."inspection_template_sections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_invites" ADD CONSTRAINT "pending_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_templates_unique" ON "inspection_templates" USING btree ("organization_id","program_id","slug","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_responses_unique" ON "inspection_responses" USING btree ("inspection_id","section_instance_key","field_slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_org_slug_unique" ON "feature_flags" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),"slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pending_invites_open_unique" ON "pending_invites" USING btree ("organization_id","email") WHERE accepted_at IS NULL AND revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_configs_active_per_kind_unique" ON "provider_configs" USING btree ("organization_id","kind") WHERE is_active = true AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_subscriptions_org_user_event_unique" ON "notification_subscriptions" USING btree ("organization_id","user_id","event_type");