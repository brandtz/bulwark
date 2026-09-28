-- WP-X2 / ED-00D: signatures are append-only at the database level. UPDATE is
-- always rejected; DELETE only inside a transaction that sets
-- bulwark.signature_purge = 'on' (tenant offboarding tooling, test cleanup).
CREATE OR REPLACE FUNCTION "signatures_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('bulwark.signature_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'signatures are append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "signatures_append_only" ON "signatures";--> statement-breakpoint
CREATE TRIGGER "signatures_append_only" BEFORE UPDATE OR DELETE ON "signatures" FOR EACH ROW EXECUTE FUNCTION "signatures_append_only"();
