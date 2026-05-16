CREATE TABLE IF NOT EXISTS "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'house' NOT NULL,
	"year_built" integer,
	"square_feet" integer,
	"stories" integer,
	"construction_type" text,
	"roof_material" text,
	"siding_material" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "building_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"square_feet" integer,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid,
	"client_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"building_id" uuid,
	"section_id" uuid,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"caption" text,
	"taken_at" timestamp with time zone,
	"uploaded_by_user_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip_address" text,
	"success" boolean NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_mfa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mfa_backup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"role" "role" NOT NULL,
	"permission_slug" text NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "lot_size_acres" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "parcel_number" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "year_built" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "access_notes" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "gate_code" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "special_instructions" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "primary_contact_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_attempts_email_idx" ON "auth_attempts" USING btree ("email","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_attempts_ip_idx" ON "auth_attempts" USING btree ("ip_address","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_mfa_user_kind_unique" ON "user_mfa" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_triple_unique" ON "permissions" USING btree ("organization_id","role","permission_slug");