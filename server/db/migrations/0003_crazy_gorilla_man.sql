CREATE TABLE IF NOT EXISTS "status_pipeline_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label_key" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"allowed_transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "status_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_number_format" text DEFAULT 'Q-{year}-{seq:04}' NOT NULL,
	"wo_number_format" text DEFAULT 'WO-{year}-{seq:04}' NOT NULL,
	"invoice_number_format" text DEFAULT 'INV-{year}-{seq:04}' NOT NULL,
	"default_markup_bps" integer DEFAULT 1500 NOT NULL,
	"default_tax_bps" integer DEFAULT 0 NOT NULL,
	"default_quote_expiry_days" integer DEFAULT 30 NOT NULL,
	"default_invoice_terms_days" integer DEFAULT 30 NOT NULL,
	"default_sla_days_assessment" integer DEFAULT 7 NOT NULL,
	"default_sla_days_quote" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "status_pipeline_nodes_pipeline_slug_unique" ON "status_pipeline_nodes" USING btree ("pipeline_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "status_pipelines_org_entity_version_unique" ON "status_pipelines" USING btree ("organization_id","entity_type","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trades_org_slug_unique" ON "trades" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_settings_org_unique" ON "org_settings" USING btree ("organization_id");