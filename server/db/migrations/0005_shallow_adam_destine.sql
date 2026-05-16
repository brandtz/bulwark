CREATE TYPE "public"."quote_tier" AS ENUM('good', 'better', 'best', 'custom');--> statement-breakpoint
CREATE TYPE "public"."work_order_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."invoice_terms" AS ENUM('due_on_receipt', 'net_15', 'net_30', 'net_60', 'custom');--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'partial' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'voided';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid,
	"invoice_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"approved_by_name" text,
	"signature_url" text,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "tier" "quote_tier" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "revision_group_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "parent_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "revision_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "rejected_reason" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "rejected_reason_code" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "customer_visible_notes" text;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "estimated_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "actual_hours" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "priority" "work_order_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "dispatch_notes" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deposit_required_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deposit_received_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retainage_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retainage_released_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "terms" "invoice_terms" DEFAULT 'net_30' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
