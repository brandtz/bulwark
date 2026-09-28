CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"primary_email" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permit_jobs" (
	"organization_id" uuid NOT NULL,
	"permit_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permit_jobs_permit_id_work_order_id_pk" PRIMARY KEY("permit_id","work_order_id")
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"jurisdiction_id" uuid,
	"jurisdiction_other" text,
	"permit_number" text,
	"kind" text DEFAULT 'building' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"applied_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text,
	"signer_user_id" uuid,
	"method" text NOT NULL,
	"image_key" text,
	"consent" boolean NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"document_hash" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_dismissals" (
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_dismissals_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "platform_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'info' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "hidden_tiers" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "ui_history_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "is_billing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "layout_json" jsonb;--> statement-breakpoint
ALTER TABLE "permit_jobs" ADD CONSTRAINT "permit_jobs_permit_id_permits_id_fk" FOREIGN KEY ("permit_id") REFERENCES "public"."permits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_jobs" ADD CONSTRAINT "permit_jobs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcement_id_platform_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."platform_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "people_org_email_unique" ON "people" USING btree ("organization_id","primary_email") WHERE "people"."primary_email" IS NOT NULL AND "people"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "people_org_name_idx" ON "people" USING btree ("organization_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdictions_org_name_unique" ON "jurisdictions" USING btree ("organization_id","name") WHERE "jurisdictions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "permit_jobs_work_order_idx" ON "permit_jobs" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "permits_org_property_idx" ON "permits" USING btree ("organization_id","property_id") WHERE "permits"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "permits_org_expires_idx" ON "permits" USING btree ("organization_id","expires_at") WHERE "permits"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "signatures_org_entity_idx" ON "signatures" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "platform_announcements_active_idx" ON "platform_announcements" USING btree ("starts_at","ends_at") WHERE "platform_announcements"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "people" ("id", "organization_id", "first_name", "last_name", "primary_email", "emails", "phones", "created_at", "updated_at") SELECT gen_random_uuid(), g.organization_id, g.first_name, g.last_name, g.email, jsonb_build_array(g.email), g.phones, g.created_at, now() FROM (SELECT c.organization_id, lower(trim(c.email)) AS email, (array_agg(c.first_name ORDER BY c.created_at))[1] AS first_name, (array_agg(c.last_name ORDER BY c.created_at))[1] AS last_name, COALESCE(jsonb_agg(DISTINCT c.phone) FILTER (WHERE c.phone IS NOT NULL AND c.phone <> ''), '[]'::jsonb) AS phones, min(c.created_at) AS created_at FROM "contacts" c WHERE c.deleted_at IS NULL AND c.email IS NOT NULL AND trim(c.email) <> '' GROUP BY c.organization_id, lower(trim(c.email))) g ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "contacts" c SET "person_id" = p.id FROM "people" p WHERE c.person_id IS NULL AND c.email IS NOT NULL AND p.organization_id = c.organization_id AND p.primary_email = lower(trim(c.email)) AND p.deleted_at IS NULL;--> statement-breakpoint
INSERT INTO "people" ("id", "organization_id", "first_name", "last_name", "primary_email", "emails", "phones", "created_at", "updated_at") SELECT c.id, c.organization_id, c.first_name, c.last_name, NULL, '[]'::jsonb, CASE WHEN c.phone IS NOT NULL AND c.phone <> '' THEN jsonb_build_array(c.phone) ELSE '[]'::jsonb END, c.created_at, now() FROM "contacts" c WHERE c.person_id IS NULL ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "contacts" SET "person_id" = "id" WHERE "person_id" IS NULL;
