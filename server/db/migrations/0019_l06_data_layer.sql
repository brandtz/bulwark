CREATE TABLE IF NOT EXISTS "org_number_counters" (
	"organization_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"period" integer NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_number_counters_organization_id_entity_period_pk" PRIMARY KEY("organization_id","entity","period")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_org_property_idx" ON "deliverables" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_org_status_updated_idx" ON "deliverables" USING btree ("organization_id","status","updated_at") WHERE "deliverables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_org_created_idx" ON "clients" USING btree ("organization_id","created_at" DESC NULLS LAST) WHERE "clients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_org_status_created_idx" ON "properties" USING btree ("organization_id","status","created_at" DESC NULLS LAST) WHERE "properties"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_org_created_idx" ON "properties" USING btree ("organization_id","created_at" DESC NULLS LAST) WHERE "properties"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_org_property_idx" ON "assessments" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subcontractors_org_created_idx" ON "subcontractors" USING btree ("organization_id","created_at" DESC NULLS LAST) WHERE "subcontractors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_org_number_unique" ON "quotes" USING btree ("organization_id","quote_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_org_status_created_idx" ON "quotes" USING btree ("organization_id","status","created_at" DESC NULLS LAST) WHERE "quotes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_org_created_idx" ON "quotes" USING btree ("organization_id","created_at" DESC NULLS LAST) WHERE "quotes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_org_property_idx" ON "quotes" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_org_number_unique" ON "work_orders" USING btree ("organization_id","work_order_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_org_status_created_idx" ON "work_orders" USING btree ("organization_id","status","created_at" DESC NULLS LAST) WHERE "work_orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_org_created_idx" ON "work_orders" USING btree ("organization_id","created_at" DESC NULLS LAST) WHERE "work_orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_org_property_idx" ON "work_orders" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_kind_created_idx" ON "jobs" USING btree ("kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_number_unique" ON "invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_status_created_idx" ON "invoices" USING btree ("organization_id","status","created_at" DESC NULLS LAST) WHERE "invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_created_idx" ON "invoices" USING btree ("organization_id","created_at" DESC NULLS LAST) WHERE "invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_property_idx" ON "invoices" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_org_entity_idx" ON "audit_log" USING btree ("organization_id","entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspections_org_property_created_idx" ON "inspections" USING btree ("organization_id","property_id","created_at" DESC NULLS LAST) WHERE "inspections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_org_work_order_idx" ON "change_orders" USING btree ("organization_id","work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_payments_org_invoice_idx" ON "invoice_payments" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buildings_org_property_idx" ON "buildings" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "building_sections_org_building_idx" ON "building_sections" USING btree ("organization_id","building_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_org_property_idx" ON "contacts" USING btree ("organization_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_photos_org_property_idx" ON "property_photos" USING btree ("organization_id","property_id","sort_order") WHERE "property_photos"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_attachments_org_property_idx" ON "property_attachments" USING btree ("organization_id","property_id") WHERE "property_attachments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_org_user_created_idx" ON "notifications" USING btree ("organization_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subcontractor_coi_docs_org_sub_idx" ON "subcontractor_coi_docs" USING btree ("organization_id","subcontractor_id");