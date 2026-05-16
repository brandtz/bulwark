CREATE TABLE IF NOT EXISTS "subcontractor_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subcontractor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homeowner_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'owner' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subcontractor_coi_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subcontractor_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subcontractor_users" ADD CONSTRAINT "subcontractor_users_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subcontractor_users" ADD CONSTRAINT "subcontractor_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homeowner_users" ADD CONSTRAINT "homeowner_users_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homeowner_users" ADD CONSTRAINT "homeowner_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subcontractor_coi_docs" ADD CONSTRAINT "subcontractor_coi_docs_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subcontractor_coi_docs" ADD CONSTRAINT "subcontractor_coi_docs_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subcontractor_users_unique" ON "subcontractor_users" USING btree ("organization_id","subcontractor_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homeowner_users_unique" ON "homeowner_users" USING btree ("organization_id","property_id","user_id");